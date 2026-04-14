import importlib.util
import io
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch


SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'kamiyo-agent-trading-feed.py'


def load_module():
    spec = importlib.util.spec_from_file_location('kamiyo_agent_trading_feed', SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError('failed to load kamiyo-agent-trading-feed.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class KamiyoAgentTradingFeedTests(unittest.TestCase):
    def setUp(self):
        self.mod = load_module()
        self.tmp = TemporaryDirectory()
        self.workspace = Path(self.tmp.name) / 'workspace'
        self.runtime = self.workspace / 'runtime'
        self.state_dir = self.runtime / 'state'
        self.feeds_dir = self.runtime / 'feeds'
        self.receipts_dir = self.runtime / 'receipts'
        self.seed_dir = self.runtime / 'seed'
        self.log_dir = self.runtime / 'logs'

        self.mod.WORKSPACE = self.workspace
        self.mod.RUNTIME_DIR = self.runtime
        self.mod.STATE_DIR = self.state_dir
        self.mod.FEEDS_DIR = self.feeds_dir
        self.mod.RECEIPTS_DIR = self.receipts_dir
        self.mod.SEED_DIR = self.seed_dir
        self.mod.LOG_DIR = self.log_dir
        self.mod.FEED_PATH = self.feeds_dir / 'trading-opportunities.json'
        self.mod.STATE_PATH = self.state_dir / 'trading-feed-state.json'
        self.mod.OUTPUT_PATH = self.state_dir / 'trading-feed.json'
        self.mod.LOG_PATH = self.log_dir / 'trading-feed.jsonl'
        self.mod.LEADER_STATE_PATH = self.state_dir / 'leader-follow-state.json'
        self.mod.LEADER_OUTPUT_PATH = self.state_dir / 'leader-follow.json'
        self.mod.LEADER_LOG_PATH = self.log_dir / 'leader-follow.jsonl'
        self.mod.REVENUE_GUARD_PATH = self.state_dir / 'revenue-guard.json'
        self.mod.REVENUE_LEDGER_PATH = self.receipts_dir / 'revenue-ledger.jsonl'
        self.mod.LEADER_SEED_PATH_ENV = 'runtime/seed/leader-follow-wallets.json'
        self.mod.POLYMARKET_LEADERBOARD_URLS = []
        self.mod.POLYMARKET_USER_TRADES_URL_TEMPLATE = ''

        self.mod.ENABLE_TRADING_AGENT = True
        self.mod.VENUES = ['polymarket', 'limitless', 'kalshi']
        self.mod.MAX_OPPORTUNITIES = 20
        self.mod.MIN_EXPECTED_NET_USD = 0.01
        self.mod.LEADER_FOLLOW_ENABLED = False

    def tearDown(self):
        self.tmp.cleanup()

    def _run(self) -> tuple[int, dict]:
        stdout = io.StringIO()
        with patch('sys.stdout', stdout):
            code = self.mod.run()
        return code, json.loads(stdout.getvalue().strip())

    def test_disabled_returns_disabled(self):
        self.mod.ENABLE_TRADING_AGENT = False
        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'disabled')
        self.assertEqual(summary.get('ok'), True)

    def test_collects_and_normalizes_candidates(self):
        polymarket_payload = {
            'markets': [
                {
                    'id': 'poly-1',
                    'question': 'Will SOL close above $220 this week?',
                    'prices': [0.62, 0.38],
                    'volume': 400000,
                    'spread': 0.02,
                    'feesEstimate': 0.01,
                    'edgeEstimate': 0.09,
                    'outcomes': ['Yes', 'No'],
                    'clobTokenIds': ['111', '222'],
                    'orderPriceMinTickSize': 0.001,
                }
            ]
        }
        limitless_payload = {
            'data': [
                {
                    'id': 'lm-1',
                    'title': 'Limitless market 1',
                    'slug': 'limitless-market-1',
                    'prices': [0.6, 0.4],
                    'volume': 250000,
                    'spread': 0.02,
                    'feesEstimate': 0.01,
                    'edgeEstimate': 0.08,
                    'tokens': {'yes': 'token-yes-1', 'no': 'token-no-1'},
                }
            ]
        }
        kalshi_payload = {
            'markets': [
                {
                    'ticker': 'KX-1',
                    'question': 'Kalshi signal',
                    'probability': 0.6,
                    'spread': 0.01,
                    'liquidityUsd': 90000,
                }
            ]
        }

        def fake_load(venue: str):
            if venue == 'polymarket':
                return polymarket_payload
            if venue == 'limitless':
                return limitless_payload
            if venue == 'kalshi':
                return kalshi_payload
            raise RuntimeError('unexpected_venue')

        with patch.object(self.mod, 'load_venue_payload', side_effect=fake_load):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), True)
        self.assertEqual(summary.get('accepted'), 3)
        self.assertEqual(summary.get('polymarketCandidates'), 1)
        self.assertEqual(summary.get('limitlessCandidates'), 1)
        self.assertEqual(summary.get('kalshiSignals'), 1)
        self.assertEqual(summary.get('dflowCandidates'), 0)
        self.assertEqual(summary.get('sapienceCandidates'), 0)

        feed = json.loads(self.mod.FEED_PATH.read_text(encoding='utf-8'))
        self.assertEqual(feed.get('accepted'), 3)
        opportunities = feed.get('opportunities') or []
        self.assertEqual(len(opportunities), 3)
        self.assertEqual(opportunities[0].get('source'), 'trading')
        polymarket = [row for row in opportunities if row.get('venue') == 'polymarket'][0]
        limitless = [row for row in opportunities if row.get('venue') == 'limitless'][0]
        metadata = polymarket.get('metadata') or {}
        self.assertEqual(metadata.get('polymarketTokenId'), '111')
        self.assertEqual((metadata.get('polymarketTokenIds') or {}).get('no'), '222')
        limitless_metadata = limitless.get('metadata') or {}
        self.assertEqual(limitless.get('marketId'), 'limitless-market-1')
        self.assertEqual(limitless_metadata.get('limitlessMarketSlug'), 'limitless-market-1')
        self.assertIn(limitless_metadata.get('limitlessTokenId'), {'token-yes-1', 'token-no-1'})

    def test_marks_degraded_when_venue_fetch_fails(self):
        with patch.object(self.mod, 'load_venue_payload', side_effect=RuntimeError('boom')):
            code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), False)
        self.assertEqual(summary.get('status'), 'degraded')
        self.assertGreaterEqual(len(summary.get('errors') or []), 1)

    def test_emits_starvation_warning_after_consecutive_zero_candidate_ticks(self):
        self.mod.VENUES = ['polymarket']
        self.mod.VENUE_CANDIDATE_STARVATION_TICKS = 2
        with patch.object(self.mod, 'load_venue_payload', return_value={'markets': []}):
            code1, summary1 = self._run()
            code2, summary2 = self._run()

        self.assertEqual(code1, 0)
        self.assertEqual(code2, 0)
        self.assertEqual(summary1.get('status'), 'ok')
        self.assertEqual(summary1.get('warnings'), [])
        self.assertEqual(summary1.get('venueCandidateStreaks', {}).get('polymarket'), 1)
        self.assertEqual(summary2.get('status'), 'degraded')
        self.assertIn('venue_candidate_starvation_polymarket', summary2.get('warnings', []))
        self.assertEqual(summary2.get('venueCandidateStreaks', {}).get('polymarket'), 2)

    def test_limitless_position_ids_are_used_when_tokens_missing(self):
        self.mod.VENUES = ['limitless']
        limitless_payload = {
            'data': [
                {
                    'id': 'lm-pos-1',
                    'title': 'Limitless market with percentage prices',
                    'slug': 'limitless-market-pos-1',
                    'prices': [88.7, 11.3],
                    'positionIds': ['11111111111111111111', '22222222222222222222'],
                    'volume': 220000,
                    'spread': 0.02,
                    'feesEstimate': 0.01,
                    'edgeEstimate': 0.18,
                }
            ]
        }

        with patch.object(self.mod, 'load_venue_payload', return_value=limitless_payload):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), True)
        self.assertEqual(summary.get('limitlessCandidates'), 1)
        feed = json.loads(self.mod.FEED_PATH.read_text(encoding='utf-8'))
        opportunities = feed.get('opportunities') or []
        self.assertEqual(len(opportunities), 1)
        metadata = opportunities[0].get('metadata') or {}
        self.assertEqual(metadata.get('limitlessTokenId'), '11111111111111111111')
        self.assertEqual((metadata.get('limitlessTokenIds') or {}).get('no'), '22222222222222222222')
        self.assertAlmostEqual(float(metadata.get('midpoint')), 0.887, places=3)

    def test_limitless_filters_non_clob_markets(self):
        self.mod.VENUES = ['limitless']
        limitless_payload = {
            'data': [
                {
                    'id': 'lm-amm',
                    'title': 'AMM market should be skipped',
                    'slug': 'amm-market',
                    'tradeType': 'amm',
                    'prices': [0.6, 0.4],
                    'positionIds': ['11111111111111111111', '22222222222222222222'],
                    'volume': 200000,
                    'spread': 0.02,
                    'edgeEstimate': 0.09,
                },
                {
                    'id': 'lm-clob',
                    'title': 'CLOB market should pass',
                    'slug': 'clob-market',
                    'tradeType': 'clob',
                    'prices': [0.6, 0.4],
                    'positionIds': ['33333333333333333333', '44444444444444444444'],
                    'volume': 210000,
                    'spread': 0.02,
                    'edgeEstimate': 0.1,
                },
            ]
        }

        with patch.object(self.mod, 'load_venue_payload', return_value=limitless_payload):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), True)
        self.assertEqual(summary.get('limitlessCandidates'), 1)
        feed = json.loads(self.mod.FEED_PATH.read_text(encoding='utf-8'))
        opportunities = feed.get('opportunities') or []
        self.assertEqual(len(opportunities), 1)
        self.assertEqual(opportunities[0].get('marketId'), 'clob-market')

    def test_limitless_requires_slug_and_token_for_execution(self):
        self.mod.VENUES = ['limitless']
        limitless_payload = {
            'data': [
                {
                    'id': 'lm-missing-slug',
                    'title': 'Missing slug',
                    'tradeType': 'clob',
                    'prices': [0.6, 0.4],
                    'positionIds': ['11111111111111111111', '22222222222222222222'],
                    'volume': 220000,
                    'spread': 0.02,
                    'edgeEstimate': 0.1,
                },
                {
                    'id': 'lm-missing-token',
                    'title': 'Missing token',
                    'slug': 'missing-token',
                    'tradeType': 'clob',
                    'prices': [0.6, 0.4],
                    'volume': 220000,
                    'spread': 0.02,
                    'edgeEstimate': 0.1,
                },
            ]
        }

        with patch.object(self.mod, 'load_venue_payload', return_value=limitless_payload):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), True)
        self.assertEqual(summary.get('limitlessCandidates'), 0)
        feed = json.loads(self.mod.FEED_PATH.read_text(encoding='utf-8'))
        opportunities = feed.get('opportunities') or []
        self.assertEqual(len(opportunities), 0)

    def test_does_not_starve_secondary_venues_when_polymarket_fills_cap(self):
        self.mod.MAX_OPPORTUNITIES = 6

        polymarket_markets = []
        for index in range(20):
            polymarket_markets.append(
                {
                    'id': f'poly-{index}',
                    'question': f'Polymarket market {index}',
                    'prices': [0.61, 0.39],
                    'volume': 300000,
                    'spread': 0.02,
                    'feesEstimate': 0.01,
                    'edgeEstimate': 0.08,
                    'outcomes': ['Yes', 'No'],
                    'clobTokenIds': [f'{index}1', f'{index}2'],
                }
            )
        polymarket_payload = {'markets': polymarket_markets}
        limitless_payload = {
            'data': [
                {
                    'id': 'lm-1',
                    'title': 'Limitless market',
                    'slug': 'limitless-starve-market',
                    'tradeType': 'clob',
                    'prices': [0.59, 0.41],
                    'positionIds': ['33333333333333333333', '44444444444444444444'],
                    'volume': 260000,
                    'spread': 0.02,
                    'feesEstimate': 0.01,
                    'edgeEstimate': 0.07,
                }
            ]
        }
        kalshi_payload = {
            'markets': [
                {
                    'ticker': 'KX-STARVE',
                    'question': 'Kalshi signal market',
                    'probability': 0.58,
                    'liquidityUsd': 150000,
                    'spread': 0.01,
                }
            ]
        }

        def fake_load(venue: str):
            if venue == 'polymarket':
                return polymarket_payload
            if venue == 'limitless':
                return limitless_payload
            if venue == 'kalshi':
                return kalshi_payload
            raise RuntimeError('unexpected_venue')

        with patch.object(self.mod, 'load_venue_payload', side_effect=fake_load):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('accepted'), 6)
        self.assertGreaterEqual(summary.get('limitlessCandidates') or 0, 1)
        self.assertGreaterEqual(summary.get('kalshiSignals') or 0, 1)
        stats = {row.get('venue'): row for row in (summary.get('sourceStats') or [])}
        self.assertEqual((stats.get('polymarket') or {}).get('accepted'), 20)
        self.assertEqual((stats.get('limitless') or {}).get('accepted'), 1)
        self.assertEqual((stats.get('kalshi') or {}).get('accepted'), 1)

    def test_filters_candidates_by_max_expiry_with_numeric_timestamps(self):
        self.mod.VENUES = ['polymarket']
        self.mod.MIN_FILL_PROB = 0.0
        self.mod.MIN_MARKET_LIQUIDITY_USD = 0.0
        self.mod.MIN_TIME_TO_EXPIRY_MIN = 0.0
        self.mod.MAX_TIME_TO_EXPIRY_MIN = 60.0

        now = datetime.now(timezone.utc)
        near_expiry = int((now + timedelta(minutes=30)).timestamp())
        far_expiry = int((now + timedelta(minutes=180)).timestamp())
        polymarket_payload = {
            'markets': [
                {
                    'id': 'poly-near',
                    'question': 'Near expiry market',
                    'prices': [0.55, 0.45],
                    'volume': 100000,
                    'spread': 0.01,
                    'feesEstimate': 0.01,
                    'edgeEstimate': 0.05,
                    'endTimestamp': near_expiry,
                },
                {
                    'id': 'poly-far',
                    'question': 'Far expiry market',
                    'prices': [0.55, 0.45],
                    'volume': 100000,
                    'spread': 0.01,
                    'feesEstimate': 0.01,
                    'edgeEstimate': 0.05,
                    'endTimestamp': far_expiry,
                },
            ]
        }

        with patch.object(self.mod, 'load_venue_payload', return_value=polymarket_payload):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), True)
        self.assertEqual(summary.get('accepted'), 1)
        self.assertEqual(summary.get('polymarketCandidates'), 1)
        feed = json.loads(self.mod.FEED_PATH.read_text(encoding='utf-8'))
        opportunities = feed.get('opportunities') or []
        self.assertEqual(len(opportunities), 1)
        self.assertEqual(opportunities[0].get('marketId'), 'poly-near')

    def test_leader_follow_shadow_mode_keeps_confidence(self):
        self.mod.VENUES = ['polymarket']
        self.mod.LEADER_FOLLOW_ENABLED = True
        self.mod.LEADER_FOLLOW_MODE = 'shadow'
        self.mod.LEADER_MAX_ACCOUNTS_PER_VENUE = 10

        polymarket_payload = {
            'markets': [
                {
                    'id': 'poly-shadow-1',
                    'question': 'Will SOL close above 200?',
                    'prices': [0.6, 0.4],
                    'volume': 300000,
                    'spread': 0.02,
                    'feesEstimate': 0.01,
                    'edgeEstimate': 0.2,
                }
            ]
        }
        leader_rows = [
            {
                'leaderId': '0xabc',
                'venue': 'polymarket',
                'marketId': 'poly-shadow-1',
                'title': 'Will SOL close above 200?',
                'direction': 'yes',
                'tradeUsd': 300.0,
                'pnlUsd': 2.0,
                'hit': 1.0,
                'ts': datetime.now(timezone.utc).isoformat(),
                'source': 'test',
            }
        ]

        with patch.object(self.mod, 'load_venue_payload', return_value=polymarket_payload), patch.object(
            self.mod, 'collect_leader_activity', return_value=leader_rows
        ), patch.object(self.mod, 'read_recent_ledger_feedback', return_value=[]):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('leaderFollowMode'), 'shadow')
        self.assertEqual(summary.get('leaderCandidatesInfluenced'), 1)
        feed = json.loads(self.mod.FEED_PATH.read_text(encoding='utf-8'))
        row = (feed.get('opportunities') or [])[0]
        leader_meta = ((row.get('metadata') or {}).get('leaderFollow') or {})
        self.assertEqual(leader_meta.get('mode'), 'shadow')
        self.assertGreaterEqual(float(leader_meta.get('leaderBias') or 0.0), 0.0)
        self.assertEqual(leader_meta.get('confidenceBefore'), leader_meta.get('confidenceAfter'))
        self.assertAlmostEqual(float(row.get('confidence')), float(leader_meta.get('confidenceBefore')), places=6)

    def test_leader_follow_live_mode_adjusts_confidence(self):
        self.mod.VENUES = ['polymarket']
        self.mod.LEADER_FOLLOW_ENABLED = True
        self.mod.LEADER_FOLLOW_MODE = 'live'
        self.mod.LEADER_MAX_ACCOUNTS_PER_VENUE = 10

        polymarket_payload = {
            'markets': [
                {
                    'id': 'poly-live-1',
                    'question': 'Will ETH close above 4k?',
                    'prices': [0.6, 0.4],
                    'volume': 300000,
                    'spread': 0.02,
                    'feesEstimate': 0.01,
                    'edgeEstimate': 0.2,
                }
            ]
        }
        leader_rows = [
            {
                'leaderId': '0xdef',
                'venue': 'polymarket',
                'marketId': 'poly-live-1',
                'title': 'Will ETH close above 4k?',
                'direction': 'yes',
                'tradeUsd': 500.0,
                'pnlUsd': 4.0,
                'hit': 1.0,
                'ts': datetime.now(timezone.utc).isoformat(),
                'source': 'test',
            }
        ]

        with patch.object(self.mod, 'load_venue_payload', return_value=polymarket_payload), patch.object(
            self.mod, 'collect_leader_activity', return_value=leader_rows
        ), patch.object(self.mod, 'read_recent_ledger_feedback', return_value=[]):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('leaderFollowMode'), 'live')
        feed = json.loads(self.mod.FEED_PATH.read_text(encoding='utf-8'))
        row = (feed.get('opportunities') or [])[0]
        leader_meta = ((row.get('metadata') or {}).get('leaderFollow') or {})
        self.assertGreater(float(leader_meta.get('confidenceAfter') or 0.0), float(leader_meta.get('confidenceBefore') or 0.0))
        self.assertAlmostEqual(float(row.get('confidence')), float(leader_meta.get('confidenceAfter')), places=6)

    def test_leader_follow_weights_update_across_ticks(self):
        self.mod.VENUES = ['polymarket']
        self.mod.LEADER_FOLLOW_ENABLED = True
        self.mod.LEADER_FOLLOW_MODE = 'shadow'
        self.mod.LEADER_MAX_ACCOUNTS_PER_VENUE = 10

        polymarket_payload = {
            'markets': [
                {
                    'id': 'poly-w-1',
                    'question': 'Will BTC close above 150k?',
                    'prices': [0.6, 0.4],
                    'volume': 300000,
                    'spread': 0.02,
                    'feesEstimate': 0.01,
                    'edgeEstimate': 0.2,
                }
            ]
        }
        positive_rows = [
            {
                'leaderId': '0xaaa',
                'venue': 'polymarket',
                'marketId': 'poly-w-1',
                'title': 'Will BTC close above 150k?',
                'direction': 'yes',
                'tradeUsd': 400.0,
                'pnlUsd': 3.0,
                'hit': 1.0,
                'ts': datetime.now(timezone.utc).isoformat(),
                'source': 'test',
            }
        ]
        negative_rows = [
            {
                'leaderId': '0xaaa',
                'venue': 'polymarket',
                'marketId': 'poly-w-1',
                'title': 'Will BTC close above 150k?',
                'direction': 'yes',
                'tradeUsd': 400.0,
                'pnlUsd': -2.0,
                'hit': 0.0,
                'ts': datetime.now(timezone.utc).isoformat(),
                'source': 'test',
            }
        ]

        with patch.object(self.mod, 'load_venue_payload', return_value=polymarket_payload), patch.object(
            self.mod, 'read_recent_ledger_feedback', return_value=[]
        ), patch.object(self.mod, 'collect_leader_activity', side_effect=[positive_rows, negative_rows]):
            code1, _ = self._run()
            self.assertEqual(code1, 0)
            state1 = json.loads(self.mod.LEADER_STATE_PATH.read_text(encoding='utf-8'))
            weight1 = float(next(iter((state1.get('leaders') or {}).values())).get('weight'))

            code2, _ = self._run()
            self.assertEqual(code2, 0)
            state2 = json.loads(self.mod.LEADER_STATE_PATH.read_text(encoding='utf-8'))
            weight2 = float(next(iter((state2.get('leaders') or {}).values())).get('weight'))

        self.assertNotEqual(weight1, weight2)
        self.assertGreater(float(state2.get('learningSamples') or 0), 0)

    def test_leader_follow_seed_strings_expand_to_venue_universe(self):
        self.mod.VENUES = ['polymarket', 'limitless']
        self.mod.LEADER_FOLLOW_ENABLED = True
        self.mod.LEADER_FOLLOW_MODE = 'shadow'
        self.mod.LEADER_MAX_ACCOUNTS_PER_VENUE = 10

        self.seed_dir.mkdir(parents=True, exist_ok=True)
        seed_path = self.seed_dir / 'leader-follow-wallets.json'
        seed_path.write_text(json.dumps(['0x1111111111111111111111111111111111111111']), encoding='utf-8')

        polymarket_payload = {
            'markets': [
                {
                    'id': 'poly-seed-1',
                    'question': 'Will BTC close above 180k?',
                    'prices': [0.61, 0.39],
                    'volume': 280000,
                    'spread': 0.02,
                    'feesEstimate': 0.01,
                    'edgeEstimate': 0.09,
                }
            ]
        }
        limitless_payload = {
            'data': [
                {
                    'id': 'lm-seed-1',
                    'title': 'Limitless seed market',
                    'slug': 'lm-seed-1',
                    'prices': [0.59, 0.41],
                    'volume': 260000,
                    'spread': 0.02,
                    'feesEstimate': 0.01,
                    'edgeEstimate': 0.08,
                }
            ]
        }

        def fake_load(venue: str):
            if venue == 'polymarket':
                return polymarket_payload
            if venue == 'limitless':
                return limitless_payload
            raise RuntimeError('unexpected_venue')

        with patch.object(self.mod, 'load_venue_payload', side_effect=fake_load), patch.object(
            self.mod, 'load_polymarket_leader_activity', return_value=[]
        ), patch.object(self.mod, 'load_limitless_leader_activity', return_value=[]), patch.object(
            self.mod, 'read_recent_ledger_feedback', return_value=[]
        ):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('leaderFollowMode'), 'shadow')
        self.assertGreaterEqual(int(summary.get('leaderUniverseSize') or 0), 2)


if __name__ == '__main__':
    unittest.main()
