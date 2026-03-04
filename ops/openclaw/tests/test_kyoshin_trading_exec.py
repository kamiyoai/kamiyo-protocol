import importlib.util
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from datetime import datetime, timedelta, timezone


SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'kyoshin-trading-exec.py'


def load_module():
    spec = importlib.util.spec_from_file_location('kyoshin_trading_exec', SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError('failed to load kyoshin-trading-exec.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class KyoshinTradingExecTests(unittest.TestCase):
    def setUp(self):
        self.mod = load_module()
        self.tmp = TemporaryDirectory()
        self.workspace = Path(self.tmp.name) / 'workspace'
        self.runtime = self.workspace / 'runtime'
        self.state_dir = self.runtime / 'state'
        self.feeds_dir = self.runtime / 'feeds'
        self.receipts_dir = self.runtime / 'receipts'
        self.log_dir = self.runtime / 'logs'

        self.mod.WORKSPACE = self.workspace
        self.mod.RUNTIME_DIR = self.runtime
        self.mod.STATE_DIR = self.state_dir
        self.mod.FEEDS_DIR = self.feeds_dir
        self.mod.RECEIPTS_DIR = self.receipts_dir
        self.mod.LOG_DIR = self.log_dir
        self.mod.STATE_PATH = self.state_dir / 'trading-exec-state.json'
        self.mod.OUTPUT_PATH = self.state_dir / 'trading-exec.json'
        self.mod.LOG_PATH = self.log_dir / 'trading-exec.jsonl'
        self.mod.POSITIONS_PATH = self.state_dir / 'trading-positions.json'
        self.mod.FEED_PATH = self.feeds_dir / 'trading-opportunities.json'
        self.mod.REVENUE_GUARD_PATH = self.state_dir / 'revenue-guard.json'
        self.mod.POLYMARKET_GEO_PATH = self.state_dir / 'polymarket-geo.json'
        self.mod.CAPABILITIES_PATH = self.state_dir / 'trading-capabilities.json'
        self.mod.LEDGER_PATH = self.receipts_dir / 'revenue-ledger.jsonl'
        self.mod.POLYMARKET_BRIDGE_PATH = self.runtime / 'missing-polymarket-bridge.mjs'
        self.mod.LIMITLESS_BRIDGE_PATH = self.runtime / 'missing-limitless-bridge.mjs'

        self.mod.ENABLE_TRADING_AGENT = True
        self.mod.EXECUTION_MODE = 'paper'
        self.mod.VENUES = ['limitless', 'kalshi']
        self.mod.KALSHI_SIGNAL_ONLY = True
        self.mod.STARTING_EQUITY_USD = 200.0
        self.mod.MAX_NOTIONAL_USD_PER_DAY = 400.0
        self.mod.MAX_OPEN_POSITIONS = 2
        self.mod.MAX_POSITIONS_PER_MARKET = 1
        self.mod.MAX_MARKET_EXPOSURE_PCT = 25.0
        self.mod.MIN_EDGE_USD = 0.01
        self.mod.ENTRY_PRICE_MIN = 0.05
        self.mod.ENTRY_PRICE_MAX = 0.95
        self.mod.CLOSE_ORPHAN_POSITIONS = True
        self.mod.ORPHAN_POSITION_HOLD_HOURS = 2.0
        self.mod.BASE_NOTIONAL_PER_TRADE_USD = 25.0
        self.mod.COMPOUNDING_ENABLED = False
        self.mod.NOTIONAL_PCT_OF_EQUITY = 12.5
        self.mod.NOTIONAL_MIN_USD = 10.0
        self.mod.NOTIONAL_MAX_USD = 250.0
        self.mod.REAL_CLOSE_ENABLED = False
        self.mod.MARKET_FAILURE_COOLDOWN_ENABLED = True
        self.mod.MARKET_FAILURE_THRESHOLD = 2
        self.mod.MARKET_FAILURE_WINDOW_MIN = 60
        self.mod.MARKET_FAILURE_COOLDOWN_MIN = 120
        self.mod.MARKET_FAILURE_WINDOW_SEC = 60 * 60
        self.mod.MARKET_FAILURE_COOLDOWN_SEC = 120 * 60
        self.mod.POLYMARKET_EXEC_CMD = ''
        self.mod.LIMITLESS_EXEC_CMD = ''
        self.mod.LIMITLESS_REQUIRE_SIGNED_PAYLOAD = True
        self.mod.POLYMARKET_REQUIRE_GEO_ALLOWED = True

    def tearDown(self):
        self.tmp.cleanup()

    def _write_feed(self):
        self.mod.FEED_PATH.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            'ok': True,
            'opportunities': [
                {
                    'id': 'cand-1',
                    'source': 'trading',
                    'venue': 'limitless',
                    'kind': 'trade_candidate',
                    'marketId': 'mkt-1',
                    'confidence': 0.8,
                    'expectedNetUsd': 0.2,
                    'feesEstimate': 0.03,
                    'expectedSlippage': 0.01,
                    'metadata': {
                        'direction': 'yes',
                        'midpoint': 0.6,
                        'leaderFollow': {
                            'mode': 'shadow',
                            'leaderBias': 0.05,
                            'confidenceBefore': 0.8,
                            'confidenceAfter': 0.8,
                            'topLeaderIds': ['limitless:0xaaa'],
                            'matchedLeaders': [
                                {
                                    'leaderId': '0xaaa',
                                    'venue': 'limitless',
                                    'direction': 'yes',
                                    'alignment': 'aligned',
                                    'weight': 1.1,
                                    'contribution': 0.2,
                                    'hit': 1.0,
                                }
                            ],
                        },
                    },
                },
                {
                    'id': 'sig-1',
                    'source': 'trading',
                    'venue': 'kalshi',
                    'kind': 'signal',
                    'marketId': 'kal-1',
                    'confidence': 0.7,
                    'expectedNetUsd': 0.0,
                },
            ],
        }
        self.mod.FEED_PATH.write_text(json.dumps(payload), encoding='utf-8')

    def _run(self) -> tuple[int, dict]:
        stdout = io.StringIO()
        with patch('sys.stdout', stdout):
            code = self.mod.run()
        return code, json.loads(stdout.getvalue().strip())

    def _ledger_rows(self) -> list[dict]:
        if not self.mod.LEDGER_PATH.exists():
            return []
        return [json.loads(line) for line in self.mod.LEDGER_PATH.read_text(encoding='utf-8').splitlines() if line.strip()]

    def test_executes_paper_trade_and_records_signal(self):
        self._write_feed()
        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'ok')
        self.assertEqual(summary.get('executedTrades'), 1)
        self.assertEqual(summary.get('closedTradesTick'), 1)
        self.assertEqual(summary.get('signalsRecorded'), 1)

        rows = self._ledger_rows()
        kinds = [row.get('kind') for row in rows]
        self.assertIn('trade_open', kinds)
        self.assertIn('mark_to_market', kinds)
        self.assertIn('signal', kinds)
        open_row = next(row for row in rows if row.get('kind') == 'trade_open')
        open_metadata = open_row.get('metadata') or {}
        self.assertEqual(open_metadata.get('candidateId'), 'cand-1')
        snapshot = open_metadata.get('leaderFollowSnapshot') or {}
        self.assertEqual(snapshot.get('mode'), 'shadow')
        self.assertGreaterEqual(len(snapshot.get('matchedLeaders') or []), 1)

        close_row = next(row for row in rows if row.get('kind') == 'mark_to_market')
        close_metadata = close_row.get('metadata') or {}
        self.assertEqual(close_metadata.get('candidateId'), 'cand-1')
        close_snapshot = close_metadata.get('leaderFollowSnapshot') or {}
        self.assertEqual(close_snapshot.get('mode'), 'shadow')

    def test_compounding_sizes_notional_from_realized_equity(self):
        self._write_feed()
        self.mod.COMPOUNDING_ENABLED = True
        self.mod.NOTIONAL_PCT_OF_EQUITY = 10.0
        self.mod.NOTIONAL_MIN_USD = 5.0
        self.mod.NOTIONAL_MAX_USD = 500.0
        self.mod.LEDGER_PATH.parent.mkdir(parents=True, exist_ok=True)
        realized_seed_row = {
            'id': 'seed-close-1',
            'at': datetime.now(timezone.utc).isoformat(),
            'source': 'trading',
            'venue': 'limitless',
            'kind': 'trade_close',
            'status': 'success',
            'realized': True,
            'marketId': 'seed-market',
            'positionId': 'seed-pos',
            'orderId': 'seed-order',
            'grossUsd': 300.0,
            'costUsd': 0.0,
            'netUsd': 300.0,
            'paymentRef': '0x' + ('a' * 64),
            'txSignature': '',
        }
        self.mod.LEDGER_PATH.write_text(json.dumps(realized_seed_row) + '\n', encoding='utf-8')

        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('baseNotionalUsd'), 50.0)
        self.assertEqual(summary.get('notionalSizingEquityUsd'), 500.0)

        rows = self._ledger_rows()
        open_row = next(row for row in rows if row.get('kind') == 'trade_open' and row.get('status') == 'success')
        open_metadata = open_row.get('metadata') or {}
        self.assertEqual(open_metadata.get('notionalUsd'), 50.0)

    def test_compounding_notional_respects_min_max_clamps(self):
        self.mod.COMPOUNDING_ENABLED = True
        self.mod.NOTIONAL_PCT_OF_EQUITY = 10.0
        self.mod.NOTIONAL_MIN_USD = 12.0
        self.mod.NOTIONAL_MAX_USD = 80.0

        self.assertEqual(self.mod.compute_base_notional_usd(50.0), 12.0)
        self.assertEqual(self.mod.compute_base_notional_usd(300.0), 30.0)
        self.assertEqual(self.mod.compute_base_notional_usd(2_000.0), 80.0)

    def test_blocks_when_revenue_guard_blocks_paid_execution(self):
        self._write_feed()
        self.mod.REVENUE_GUARD_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.REVENUE_GUARD_PATH.write_text(
            json.dumps({'ok': False, 'blockPaidExecution': True}),
            encoding='utf-8',
        )

        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'blocked')
        self.assertIn('revenue_guard_block_paid_execution', summary.get('reasons', []))
        self.assertEqual(summary.get('executedTrades'), 0)

    def test_limits_positions_per_market_in_single_tick(self):
        self.mod.FEED_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.FEED_PATH.write_text(
            json.dumps(
                {
                    'ok': True,
                    'opportunities': [
                        {
                            'id': 'cand-a',
                            'source': 'trading',
                            'venue': 'limitless',
                            'kind': 'trade_candidate',
                            'marketId': 'same-market',
                            'confidence': 0.9,
                            'expectedNetUsd': 0.2,
                            'feesEstimate': 0.0,
                            'expectedSlippage': 0.0,
                            'metadata': {'direction': 'yes', 'midpoint': 0.55},
                        },
                        {
                            'id': 'cand-b',
                            'source': 'trading',
                            'venue': 'limitless',
                            'kind': 'trade_candidate',
                            'marketId': 'same-market',
                            'confidence': 0.85,
                            'expectedNetUsd': 0.19,
                            'feesEstimate': 0.0,
                            'expectedSlippage': 0.0,
                            'metadata': {'direction': 'yes', 'midpoint': 0.56},
                        },
                    ],
                }
            ),
            encoding='utf-8',
        )
        self.mod.MAX_OPEN_POSITIONS = 4
        self.mod.MAX_POSITIONS_PER_MARKET = 1

        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('executedTrades'), 1)
        self.assertGreaterEqual(summary.get('blockedCandidates', 0), 1)

    def test_reconciles_stale_peak_equity_after_ledger_reclassification(self):
        self._write_feed()
        self.mod.STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.STATE_PATH.write_text(
            json.dumps(
                {
                    'day': datetime.now(timezone.utc).date().isoformat(),
                    'peakEquityUsd': 300.0,
                    'dailyNotionalUsdUsed': 0.0,
                }
            ),
            encoding='utf-8',
        )

        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertNotIn('drawdown_limit_exceeded', summary.get('reasons', []))
        self.assertEqual(summary.get('peakEquityReconciled'), True)
        self.assertGreaterEqual(summary.get('executedTrades', 0), 1)

    def test_live_mode_requires_limitless_transport(self):
        self._write_feed()
        self.mod.EXECUTION_MODE = 'live'
        self.mod.LIMITLESS_EXEC_CMD = ''

        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'blocked')
        self.assertIn('no_live_trading_venue_available', summary.get('reasons', []))
        self.assertIn('missing_limitless_execution_transport', summary.get('warnings', []))

    def test_live_mode_executes_limitless_via_bridge_without_signed_payload(self):
        self._write_feed()
        self.mod.EXECUTION_MODE = 'live'
        self.mod.LIMITLESS_EXEC_CMD = ''
        self.mod.LIMITLESS_REQUIRE_SIGNED_PAYLOAD = False
        self.mod.LIMITLESS_BRIDGE_PATH.write_text('#!/usr/bin/env node\n', encoding='utf-8')
        self.mod.LIMITLESS_BRIDGE_PATH.chmod(0o700)
        bridge_result = {
            'orderId': 'limitless-order-1',
            'positionId': 'limitless-position-1',
            'grossUsd': 0.0,
            'costUsd': 0.0,
            'netUsd': 0.0,
            'realized': False,
            'paymentRef': 'limitless-payment-ref',
            'raw': {'bridge': 'ok'},
        }
        with patch.object(self.mod, 'node_bin', return_value='/usr/bin/node'), patch.object(
            self.mod, 'run_bridge_worker', return_value=bridge_result
        ):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'ok')
        self.assertEqual(summary.get('executedTrades'), 1)
        self.assertEqual(summary.get('successfulTrades'), 1)
        self.assertEqual(summary.get('failedTrades'), 0)

    def test_live_mode_unmatched_order_does_not_disable_venue(self):
        self._write_feed()
        self.mod.EXECUTION_MODE = 'live'
        self.mod.VENUES = ['limitless']
        self.mod.LIMITLESS_REQUIRE_SIGNED_PAYLOAD = False
        self.mod.LIMITLESS_EXEC_CMD = ''
        self.mod.LIMITLESS_BRIDGE_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.LIMITLESS_BRIDGE_PATH.write_text('#!/usr/bin/env node\n', encoding='utf-8')
        self.mod.LIMITLESS_BRIDGE_PATH.chmod(0o700)

        with patch.object(self.mod, 'node_bin', return_value='/usr/bin/node'), patch.object(
            self.mod, 'run_bridge_worker', side_effect=RuntimeError('limitless_order_unmatched: order was placed but did not match immediately')
        ):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'degraded')
        self.assertNotIn('no_live_trading_venue_available', summary.get('reasons', []))
        self.assertNotIn('limitless', summary.get('venueBlockers', {}))
        self.assertIn('limitless_order_unmatched', summary.get('warnings', []))

    def test_market_failure_cooldown_blocks_repeated_simulation_failures(self):
        self._write_feed()
        self.mod.EXECUTION_MODE = 'live'
        self.mod.VENUES = ['limitless']
        self.mod.LIMITLESS_REQUIRE_SIGNED_PAYLOAD = False
        self.mod.LIMITLESS_EXEC_CMD = ''
        self.mod.MARKET_FAILURE_COOLDOWN_ENABLED = True
        self.mod.MARKET_FAILURE_THRESHOLD = 1
        self.mod.MARKET_FAILURE_WINDOW_MIN = 60
        self.mod.MARKET_FAILURE_COOLDOWN_MIN = 120
        self.mod.MARKET_FAILURE_WINDOW_SEC = 60 * 60
        self.mod.MARKET_FAILURE_COOLDOWN_SEC = 120 * 60
        self.mod.LIMITLESS_BRIDGE_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.LIMITLESS_BRIDGE_PATH.write_text('#!/usr/bin/env node\n', encoding='utf-8')
        self.mod.LIMITLESS_BRIDGE_PATH.chmod(0o700)

        with patch.object(self.mod, 'node_bin', return_value='/usr/bin/node'), patch.object(
            self.mod, 'run_bridge_worker', side_effect=RuntimeError('Simulation failed')
        ):
            code1, summary1 = self._run()
        self.assertEqual(code1, 0)
        self.assertEqual(summary1.get('failedTrades'), 1)
        self.assertIn('market_failure_cooldown_activated', summary1.get('warnings', []))
        self.assertEqual(summary1.get('activeMarketCooldowns'), 1)

        with patch.object(self.mod, 'node_bin', return_value='/usr/bin/node'), patch.object(
            self.mod, 'run_bridge_worker', side_effect=AssertionError('bridge should not execute during cooldown')
        ):
            code2, summary2 = self._run()
        self.assertEqual(code2, 0)
        self.assertEqual(summary2.get('executedTrades'), 0)
        self.assertGreaterEqual(summary2.get('blockedByMarketCooldown', 0), 1)
        self.assertIn('market_failure_cooldown_active', summary2.get('warnings', []))

    def test_live_mode_ignores_unexpected_realized_flag_without_close_intent(self):
        self._write_feed()
        self.mod.EXECUTION_MODE = 'live'
        self.mod.LIMITLESS_EXEC_CMD = ''
        self.mod.LIMITLESS_REQUIRE_SIGNED_PAYLOAD = False
        self.mod.LIMITLESS_BRIDGE_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.LIMITLESS_BRIDGE_PATH.write_text('#!/usr/bin/env node\n', encoding='utf-8')
        self.mod.LIMITLESS_BRIDGE_PATH.chmod(0o700)
        bridge_result = {
            'orderId': 'limitless-order-2',
            'positionId': 'limitless-position-2',
            'grossUsd': 5.0,
            'costUsd': 0.0,
            'netUsd': 5.0,
            'realized': True,
            'paymentRef': 'limitless-order-2',
            'raw': {'bridge': 'ok'},
        }
        with patch.object(self.mod, 'node_bin', return_value='/usr/bin/node'), patch.object(
            self.mod, 'run_bridge_worker', return_value=bridge_result
        ):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertIn('synthetic_realized_close_detected', summary.get('warnings', []))
        self.assertEqual(summary.get('closedTradesTick'), 0)

        rows = self._ledger_rows()
        kinds = [row.get('kind') for row in rows]
        self.assertIn('trade_open', kinds)
        self.assertIn('mark_to_market', kinds)
        self.assertNotIn('trade_close', kinds)

        positions_payload = json.loads(self.mod.POSITIONS_PATH.read_text(encoding='utf-8'))
        positions = positions_payload.get('positions', [])
        self.assertEqual(len(positions), 1)
        self.assertEqual(positions[0].get('status'), 'open')

    def test_live_mode_blocks_polymarket_when_geo_blocked(self):
        self._write_feed()
        self.mod.EXECUTION_MODE = 'live'
        self.mod.VENUES = ['polymarket', 'kalshi']
        self.mod.POLYMARKET_EXEC_CMD = 'printf \"{\\\"orderId\\\":\\\"o1\\\",\\\"positionId\\\":\\\"p1\\\",\\\"grossUsd\\\":0,\\\"costUsd\\\":0,\\\"netUsd\\\":0,\\\"realized\\\":false,\\\"paymentRef\\\":\\\"x\\\",\\\"raw\\\":{}}\"'
        with patch.object(self.mod, 'fetch_polymarket_geo', return_value={'ok': True, 'blocked': True, 'checkedAt': '2026-03-02T00:00:00+00:00'}):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'blocked')
        self.assertIn('no_live_trading_venue_available', summary.get('reasons', []))
        self.assertIn('polymarket_geo_blocked', summary.get('warnings', []))

    def test_live_mode_falls_back_to_polymarket_when_limitless_auth_fails(self):
        self.mod.FEED_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.FEED_PATH.write_text(
            json.dumps(
                {
                    'ok': True,
                    'opportunities': [
                        {
                            'id': 'cand-limitless',
                            'source': 'trading',
                            'venue': 'limitless',
                            'kind': 'trade_candidate',
                            'marketId': 'mkt-limitless',
                            'confidence': 0.99,
                            'fillProbability': 0.99,
                            'expectedNetUsd': 0.9,
                            'feesEstimate': 0.0,
                            'expectedSlippage': 0.0,
                            'metadata': {'direction': 'yes', 'midpoint': 0.52},
                        },
                        {
                            'id': 'cand-poly',
                            'source': 'trading',
                            'venue': 'polymarket',
                            'kind': 'trade_candidate',
                            'marketId': 'mkt-poly',
                            'confidence': 0.8,
                            'fillProbability': 0.8,
                            'expectedNetUsd': 0.4,
                            'feesEstimate': 0.0,
                            'expectedSlippage': 0.0,
                            'metadata': {
                                'direction': 'yes',
                                'midpoint': 0.55,
                                'polymarketTokenId': 'token-poly',
                                'polymarketTokenIds': {'yes': 'token-poly', 'no': 'token-no'},
                            },
                        },
                    ],
                }
            ),
            encoding='utf-8',
        )
        self.mod.EXECUTION_MODE = 'live'
        self.mod.VENUES = ['limitless', 'polymarket']
        self.mod.LIMITLESS_REQUIRE_SIGNED_PAYLOAD = False
        self.mod.LIMITLESS_EXEC_CMD = ''
        self.mod.POLYMARKET_EXEC_CMD = ''

        self.mod.LIMITLESS_BRIDGE_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.POLYMARKET_BRIDGE_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.LIMITLESS_BRIDGE_PATH.write_text('#!/usr/bin/env node\n', encoding='utf-8')
        self.mod.POLYMARKET_BRIDGE_PATH.write_text('#!/usr/bin/env node\n', encoding='utf-8')
        self.mod.LIMITLESS_BRIDGE_PATH.chmod(0o700)
        self.mod.POLYMARKET_BRIDGE_PATH.chmod(0o700)

        def fake_run_bridge_worker(worker_path: Path, env_vars: dict[str, str]) -> dict:
            if 'limitless' in str(worker_path):
                raise RuntimeError('limitless_signer_alignment_mismatch: signing key does not match required signer')
            return {
                'orderId': 'poly-order-1',
                'positionId': 'poly-position-1',
                'grossUsd': 0.0,
                'costUsd': 0.0,
                'netUsd': 0.0,
                'realized': False,
                'paymentRef': 'poly-payment',
                'raw': {'bridge': 'ok'},
            }

        with patch.object(
            self.mod,
            'fetch_polymarket_geo',
            return_value={'ok': True, 'blocked': False, 'checkedAt': '2026-03-02T00:00:00+00:00'},
        ), patch.object(self.mod, 'node_bin', return_value='/usr/bin/node'), patch.object(
            self.mod, 'run_bridge_worker', side_effect=fake_run_bridge_worker
        ), patch.object(self.mod, 'fetch_polymarket_mark_price', return_value=0.55):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'degraded')
        self.assertGreaterEqual(summary.get('executedTrades', 0), 2)
        self.assertEqual(summary.get('polymarketTradesTick'), 1)
        self.assertEqual(summary.get('limitlessTradesTick'), 0)
        self.assertIn('limitless_auth_failed', summary.get('warnings', []))
        self.assertNotIn('limitless', summary.get('activeLiveVenues', []))
        self.assertEqual(summary.get('venueBlockers', {}).get('limitless'), 'limitless_auth_failed')

    def test_marks_open_polymarket_position_with_live_midpoint(self):
        self.mod.FEED_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.FEED_PATH.write_text(json.dumps({'ok': True, 'opportunities': []}), encoding='utf-8')
        self.mod.EXECUTION_MODE = 'live'
        self.mod.VENUES = ['polymarket']
        self.mod.POLYMARKET_EXEC_CMD = (
            'printf "{\\"orderId\\":\\"o1\\",\\"positionId\\":\\"p1\\",'
            '\\"grossUsd\\":0,\\"costUsd\\":0,\\"netUsd\\":0,\\"realized\\":false,\\"paymentRef\\":\\"x\\",\\"raw\\":{}}"'
        )

        opened_at = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        self.mod.POSITIONS_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.POSITIONS_PATH.write_text(
            json.dumps(
                {
                    'positions': [
                        {
                            'id': 'p-open-1',
                            'positionId': 'p-open-1',
                            'orderId': 'o-open-1',
                            'marketId': 'mkt-1',
                            'venue': 'polymarket',
                            'status': 'open',
                            'openedAt': opened_at,
                            'notionalUsd': 10.0,
                            'tokenId': 'token-1',
                            'side': 'buy',
                            'entryPrice': 0.5,
                            'unrealizedPct': 0.0,
                        }
                    ]
                }
            ),
            encoding='utf-8',
        )

        with patch.object(
            self.mod,
            'fetch_polymarket_geo',
            return_value={'ok': True, 'blocked': False, 'checkedAt': '2026-03-02T00:00:00+00:00'},
        ), patch.object(self.mod, 'fetch_polymarket_mark_price', return_value=0.53):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'ok')
        positions_payload = json.loads(self.mod.POSITIONS_PATH.read_text(encoding='utf-8'))
        position = positions_payload.get('positions', [])[0]
        self.assertEqual(position.get('markPrice'), 0.53)
        self.assertAlmostEqual(position.get('unrealizedPct'), 6.0, places=4)

    def test_closes_open_position_with_mark_to_market_pnl(self):
        self.mod.FEED_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.FEED_PATH.write_text(json.dumps({'ok': True, 'opportunities': []}), encoding='utf-8')
        self.mod.EXECUTION_MODE = 'live'
        self.mod.VENUES = ['polymarket']
        self.mod.POLYMARKET_EXEC_CMD = (
            'printf "{\\"orderId\\":\\"o1\\",\\"positionId\\":\\"p1\\",'
            '\\"grossUsd\\":0,\\"costUsd\\":0,\\"netUsd\\":0,\\"realized\\":false,\\"paymentRef\\":\\"x\\",\\"raw\\":{}}"'
        )

        opened_at = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        self.mod.POSITIONS_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.POSITIONS_PATH.write_text(
            json.dumps(
                {
                    'positions': [
                        {
                            'id': 'p-open-2',
                            'positionId': 'p-open-2',
                            'orderId': 'o-open-2',
                            'marketId': 'mkt-2',
                            'venue': 'polymarket',
                            'status': 'open',
                            'openedAt': opened_at,
                            'notionalUsd': 10.0,
                            'tokenId': 'token-2',
                            'side': 'buy',
                            'entryPrice': 0.5,
                            'unrealizedPct': 0.0,
                        }
                    ]
                }
            ),
            encoding='utf-8',
        )

        with patch.object(
            self.mod,
            'fetch_polymarket_geo',
            return_value={'ok': True, 'blocked': False, 'checkedAt': '2026-03-02T00:00:00+00:00'},
        ), patch.object(self.mod, 'fetch_polymarket_mark_price', return_value=0.6):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'ok')
        self.assertEqual(summary.get('closedTradesTick'), 1)

        rows = self._ledger_rows()
        close_rows = [row for row in rows if row.get('kind') == 'mark_to_market']
        self.assertEqual(len(close_rows), 1)
        close = close_rows[0]
        self.assertEqual(close.get('grossUsd'), 2.0)
        self.assertEqual(close.get('costUsd'), 0.0)
        self.assertEqual(close.get('netUsd'), 2.0)
        metadata = close.get('metadata') or {}
        self.assertEqual(metadata.get('closeReason'), 'take_profit')
        self.assertEqual(metadata.get('entryPrice'), 0.5)
        self.assertEqual(metadata.get('markPrice'), 0.6)
        self.assertAlmostEqual(metadata.get('unrealizedPct'), 20.0, places=4)

    def test_real_close_records_trade_close_when_enabled(self):
        self.mod.FEED_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.FEED_PATH.write_text(json.dumps({'ok': True, 'opportunities': []}), encoding='utf-8')
        self.mod.EXECUTION_MODE = 'live'
        self.mod.VENUES = ['polymarket']
        self.mod.REAL_CLOSE_ENABLED = True
        self.mod.POLYMARKET_EXEC_CMD = (
            'printf "{\\"orderId\\":\\"close-order-1\\",\\"positionId\\":\\"close-pos-1\\",'
            '\\"grossUsd\\":1.25,\\"costUsd\\":0.05,\\"netUsd\\":1.2,\\"realized\\":true,\\"paymentRef\\":\\"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\\",'
            '\\"txSignature\\":\\"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\\",\\"raw\\":{'
            '\\\"transactionHash\\\":\\\"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\\\"}}"'
        )

        opened_at = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        self.mod.POSITIONS_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.POSITIONS_PATH.write_text(
            json.dumps(
                {
                    'positions': [
                        {
                            'id': 'p-open-close',
                            'positionId': 'p-open-close',
                            'orderId': 'o-open-close',
                            'marketId': 'mkt-close',
                            'venue': 'polymarket',
                            'status': 'open',
                            'openedAt': opened_at,
                            'notionalUsd': 10.0,
                            'tokenId': 'token-close',
                            'side': 'buy',
                            'direction': 'yes',
                            'entryPrice': 0.5,
                            'markPrice': 0.5,
                            'confidence': 0.7,
                            'expectedNetUsd': 0.2,
                            'unrealizedPct': 0.0,
                        }
                    ]
                }
            ),
            encoding='utf-8',
        )

        with patch.object(
            self.mod,
            'fetch_polymarket_geo',
            return_value={'ok': True, 'blocked': False, 'checkedAt': '2026-03-02T00:00:00+00:00'},
        ), patch.object(self.mod, 'fetch_polymarket_mark_price', return_value=0.6):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'ok')
        self.assertEqual(summary.get('closedTradesTick'), 1)
        self.assertEqual(summary.get('liveCloseAttemptsTick'), 1)
        self.assertEqual(summary.get('liveCloseRealizedTick'), 1)
        self.assertEqual(summary.get('markToMarketRowsTick'), 0)

        rows = self._ledger_rows()
        close_rows = [row for row in rows if row.get('kind') == 'trade_close']
        self.assertEqual(len(close_rows), 1)
        close = close_rows[0]
        self.assertEqual(close.get('status'), 'success')
        self.assertEqual(close.get('realized'), True)
        self.assertEqual(close.get('netUsd'), 1.2)
        metadata = close.get('metadata') or {}
        self.assertEqual(metadata.get('executionIntent'), 'close')
        self.assertEqual(metadata.get('closeReason'), 'take_profit')

    def test_real_close_failure_keeps_position_open_when_strict_tracking_enabled(self):
        self.mod.FEED_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.FEED_PATH.write_text(json.dumps({'ok': True, 'opportunities': []}), encoding='utf-8')
        self.mod.EXECUTION_MODE = 'live'
        self.mod.VENUES = ['polymarket']
        self.mod.REAL_CLOSE_ENABLED = True
        self.mod.CLOSE_STRICT_TRACKING = True
        self.mod.POLYMARKET_EXEC_CMD = 'printf "{\\"error\\":\\"not enough balance / allowance\\"}"'

        opened_at = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        self.mod.POSITIONS_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.POSITIONS_PATH.write_text(
            json.dumps(
                {
                    'positions': [
                        {
                            'id': 'p-open-fail',
                            'positionId': 'p-open-fail',
                            'orderId': 'o-open-fail',
                            'marketId': 'mkt-fail',
                            'venue': 'polymarket',
                            'status': 'open',
                            'openedAt': opened_at,
                            'notionalUsd': 10.0,
                            'tokenId': 'token-fail',
                            'side': 'buy',
                            'direction': 'yes',
                            'entryPrice': 0.5,
                            'markPrice': 0.5,
                            'confidence': 0.7,
                            'expectedNetUsd': 0.2,
                            'unrealizedPct': 0.0,
                        }
                    ]
                }
            ),
            encoding='utf-8',
        )

        with patch.object(
            self.mod,
            'fetch_polymarket_geo',
            return_value={'ok': True, 'blocked': False, 'checkedAt': '2026-03-02T00:00:00+00:00'},
        ), patch.object(self.mod, 'fetch_polymarket_mark_price', return_value=0.6):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'degraded')
        self.assertEqual(summary.get('liveCloseAttemptsTick'), 1)
        self.assertEqual(summary.get('liveCloseDeferredTick'), 1)
        self.assertEqual(summary.get('closedTradesTick'), 0)
        self.assertEqual(summary.get('markToMarketRowsTick'), 0)

        positions_payload = json.loads(self.mod.POSITIONS_PATH.read_text(encoding='utf-8'))
        positions = positions_payload.get('positions') or []
        self.assertEqual(len(positions), 1)
        self.assertEqual(positions[0].get('positionId'), 'p-open-fail')
        self.assertIn('polymarket_close_execution_failed', summary.get('warnings', []))

    def test_backfills_legacy_polymarket_position_from_feed_metadata(self):
        self.mod.FEED_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.FEED_PATH.write_text(
            json.dumps(
                {
                    'ok': True,
                    'opportunities': [
                        {
                            'id': 'cand-poly-1',
                            'source': 'trading',
                            'venue': 'polymarket',
                            'kind': 'trade_candidate',
                            'marketId': 'mkt-legacy',
                            'confidence': 0.8,
                            'fillProbability': 0.7,
                            'expectedNetUsd': 0.2,
                            'metadata': {
                                'direction': 'yes',
                                'midpoint': 0.5,
                                'polymarketTokenId': 'token-legacy',
                                'polymarketTokenIds': {'yes': 'token-legacy', 'no': 'token-no'},
                            },
                        }
                    ],
                }
            ),
            encoding='utf-8',
        )
        self.mod.EXECUTION_MODE = 'live'
        self.mod.VENUES = ['polymarket']
        self.mod.POLYMARKET_EXEC_CMD = (
            'printf "{\\"orderId\\":\\"o1\\",\\"positionId\\":\\"p1\\",'
            '\\"grossUsd\\":0,\\"costUsd\\":0,\\"netUsd\\":0,\\"realized\\":false,\\"paymentRef\\":\\"x\\",\\"raw\\":{}}"'
        )

        opened_at = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        self.mod.POSITIONS_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.POSITIONS_PATH.write_text(
            json.dumps(
                {
                    'positions': [
                        {
                            'id': 'legacy-pos',
                            'positionId': 'legacy-pos',
                            'orderId': 'legacy-order',
                            'marketId': 'mkt-legacy',
                            'venue': 'polymarket',
                            'status': 'open',
                            'openedAt': opened_at,
                            'notionalUsd': 10.0,
                            'unrealizedPct': 0.0,
                        }
                    ]
                }
            ),
            encoding='utf-8',
        )

        with patch.object(
            self.mod,
            'fetch_polymarket_geo',
            return_value={'ok': True, 'blocked': False, 'checkedAt': '2026-03-02T00:00:00+00:00'},
        ), patch.object(self.mod, 'fetch_polymarket_mark_price', return_value=0.54):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'ok')
        positions_payload = json.loads(self.mod.POSITIONS_PATH.read_text(encoding='utf-8'))
        position = positions_payload.get('positions', [])[0]
        self.assertEqual(position.get('tokenId'), 'token-legacy')
        self.assertEqual(position.get('direction'), 'yes')
        self.assertEqual(position.get('entryPrice'), 0.5)
        self.assertEqual(position.get('markPrice'), 0.54)
        self.assertAlmostEqual(position.get('unrealizedPct'), 8.0, places=4)

    def test_closes_orphan_position_after_hold_threshold(self):
        self.mod.FEED_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.FEED_PATH.write_text(
            json.dumps(
                {
                    'ok': True,
                    'opportunities': [
                        {
                            'id': 'cand-poly-2',
                            'source': 'trading',
                            'venue': 'polymarket',
                            'kind': 'trade_candidate',
                            'marketId': 'mkt-other',
                            'confidence': 0.7,
                            'fillProbability': 0.7,
                            'expectedNetUsd': 0.1,
                            'metadata': {
                                'direction': 'yes',
                                'midpoint': 0.5,
                                'polymarketTokenId': 'token-other',
                                'polymarketTokenIds': {'yes': 'token-other', 'no': 'token-no'},
                            },
                        }
                    ],
                }
            ),
            encoding='utf-8',
        )
        self.mod.EXECUTION_MODE = 'live'
        self.mod.VENUES = ['polymarket']
        self.mod.POLYMARKET_EXEC_CMD = (
            'printf "{\\"orderId\\":\\"o1\\",\\"positionId\\":\\"p1\\",'
            '\\"grossUsd\\":0,\\"costUsd\\":0,\\"netUsd\\":0,\\"realized\\":false,\\"paymentRef\\":\\"x\\",\\"raw\\":{}}"'
        )

        opened_at = (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat()
        self.mod.POSITIONS_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.POSITIONS_PATH.write_text(
            json.dumps(
                {
                    'positions': [
                        {
                            'id': 'p-orphan',
                            'positionId': 'p-orphan',
                            'orderId': 'o-orphan',
                            'marketId': 'mkt-orphan',
                            'venue': 'polymarket',
                            'status': 'open',
                            'openedAt': opened_at,
                            'notionalUsd': 10.0,
                            'tokenId': 'token-orphan',
                            'side': 'buy',
                            'entryPrice': 0.5,
                            'markPrice': 0.5,
                            'unrealizedPct': 0.0,
                        }
                    ]
                }
            ),
            encoding='utf-8',
        )

        with patch.object(
            self.mod,
            'fetch_polymarket_geo',
            return_value={'ok': True, 'blocked': False, 'checkedAt': '2026-03-02T00:00:00+00:00'},
        ), patch.object(self.mod, 'fetch_polymarket_mark_price', return_value=0.5):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('closedTradesTick'), 1)
        positions_payload = json.loads(self.mod.POSITIONS_PATH.read_text(encoding='utf-8'))
        self.assertEqual(len(positions_payload.get('positions', [])), 1)
        close_rows = [row for row in self._ledger_rows() if row.get('kind') == 'mark_to_market']
        self.assertGreaterEqual(len(close_rows), 1)
        close_reason = (close_rows[0].get('metadata') or {}).get('closeReason')
        self.assertEqual(close_reason, 'orphan_market')

    def test_closes_market_concentration_overflow(self):
        self.mod.FEED_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.FEED_PATH.write_text(json.dumps({'ok': True, 'opportunities': []}), encoding='utf-8')
        self.mod.EXECUTION_MODE = 'live'
        self.mod.VENUES = ['polymarket']
        self.mod.POLYMARKET_EXEC_CMD = (
            'printf "{\\"orderId\\":\\"o1\\",\\"positionId\\":\\"p1\\",'
            '\\"grossUsd\\":0,\\"costUsd\\":0,\\"netUsd\\":0,\\"realized\\":false,\\"paymentRef\\":\\"x\\",\\"raw\\":{}}"'
        )
        self.mod.MAX_POSITIONS_PER_MARKET = 1
        self.mod.CLOSE_ORPHAN_POSITIONS = False

        now = datetime.now(timezone.utc)
        older = (now - timedelta(minutes=45)).isoformat()
        newer = (now - timedelta(minutes=30)).isoformat()
        self.mod.POSITIONS_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.POSITIONS_PATH.write_text(
            json.dumps(
                {
                    'positions': [
                        {
                            'id': 'p-older',
                            'positionId': 'p-older',
                            'orderId': 'o-older',
                            'marketId': 'mkt-same',
                            'venue': 'polymarket',
                            'status': 'open',
                            'openedAt': older,
                            'notionalUsd': 10.0,
                            'tokenId': 'token-same',
                            'side': 'buy',
                            'entryPrice': 0.5,
                            'markPrice': 0.5,
                            'unrealizedPct': 0.0,
                        },
                        {
                            'id': 'p-newer',
                            'positionId': 'p-newer',
                            'orderId': 'o-newer',
                            'marketId': 'mkt-same',
                            'venue': 'polymarket',
                            'status': 'open',
                            'openedAt': newer,
                            'notionalUsd': 10.0,
                            'tokenId': 'token-same',
                            'side': 'buy',
                            'entryPrice': 0.5,
                            'markPrice': 0.5,
                            'unrealizedPct': 0.0,
                        },
                    ]
                }
            ),
            encoding='utf-8',
        )

        with patch.object(
            self.mod,
            'fetch_polymarket_geo',
            return_value={'ok': True, 'blocked': False, 'checkedAt': '2026-03-02T00:00:00+00:00'},
        ), patch.object(self.mod, 'fetch_polymarket_mark_price', return_value=0.5):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('closedTradesTick'), 1)
        close_rows = [row for row in self._ledger_rows() if row.get('kind') == 'mark_to_market']
        self.assertGreaterEqual(len(close_rows), 1)
        close_reason = (close_rows[0].get('metadata') or {}).get('closeReason')
        self.assertEqual(close_reason, 'market_concentration')

    def test_slot_recovery_rotates_weak_position_when_capacity_locked(self):
        self.mod.FEED_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.FEED_PATH.write_text(
            json.dumps(
                {
                    'ok': True,
                    'opportunities': [
                        {
                            'id': 'cand-recovery',
                            'source': 'trading',
                            'venue': 'polymarket',
                            'kind': 'trade_candidate',
                            'marketId': 'mkt-new',
                            'confidence': 0.95,
                            'fillProbability': 0.95,
                            'expectedNetUsd': 0.5,
                            'feesEstimate': 0.0,
                            'expectedSlippage': 0.0,
                            'metadata': {
                                'direction': 'yes',
                                'midpoint': 0.55,
                                'polymarketTokenId': 'token-new',
                                'polymarketTokenIds': {'yes': 'token-new', 'no': 'token-new-no'},
                            },
                        }
                    ],
                }
            ),
            encoding='utf-8',
        )
        self.mod.EXECUTION_MODE = 'live'
        self.mod.VENUES = ['polymarket']
        self.mod.POLYMARKET_EXEC_CMD = (
            'printf "{\\"orderId\\":\\"o-recovery\\",\\"positionId\\":\\"p-recovery\\",'
            '\\"grossUsd\\":0,\\"costUsd\\":0,\\"netUsd\\":0,\\"realized\\":false,\\"paymentRef\\":\\"x\\",\\"raw\\":{}}"'
        )
        self.mod.CLOSE_ORPHAN_POSITIONS = False
        self.mod.MAX_OPEN_POSITIONS = 2
        self.mod.MAX_POSITIONS_PER_MARKET = 1
        self.mod.SLOT_RECOVERY_ENABLED = True
        self.mod.SLOT_RECOVERY_MIN_HOLD_HOURS = 1.0
        self.mod.SLOT_RECOVERY_MIN_SCORE_DELTA = 0.01
        self.mod.SLOT_RECOVERY_MAX_CLOSES_PER_TICK = 1

        opened_at = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        self.mod.POSITIONS_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.POSITIONS_PATH.write_text(
            json.dumps(
                {
                    'positions': [
                        {
                            'id': 'p-old-1',
                            'positionId': 'p-old-1',
                            'orderId': 'o-old-1',
                            'marketId': 'mkt-old-1',
                            'venue': 'polymarket',
                            'status': 'open',
                            'openedAt': opened_at,
                            'notionalUsd': 10.0,
                            'tokenId': 'token-old-1',
                            'side': 'buy',
                            'entryPrice': 0.5,
                            'markPrice': 0.5,
                            'confidence': 0.5,
                            'expectedNetUsd': 0.05,
                            'unrealizedPct': 0.0,
                        },
                        {
                            'id': 'p-old-2',
                            'positionId': 'p-old-2',
                            'orderId': 'o-old-2',
                            'marketId': 'mkt-old-2',
                            'venue': 'polymarket',
                            'status': 'open',
                            'openedAt': opened_at,
                            'notionalUsd': 10.0,
                            'tokenId': 'token-old-2',
                            'side': 'buy',
                            'entryPrice': 0.5,
                            'markPrice': 0.5,
                            'confidence': 0.5,
                            'expectedNetUsd': 0.05,
                            'unrealizedPct': 0.0,
                        },
                    ]
                }
            ),
            encoding='utf-8',
        )

        with patch.object(
            self.mod,
            'fetch_polymarket_geo',
            return_value={'ok': True, 'blocked': False, 'checkedAt': '2026-03-02T00:00:00+00:00'},
        ), patch.object(self.mod, 'fetch_polymarket_mark_price', return_value=0.5):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'ok')
        self.assertEqual(summary.get('slotRecoveryClosedTick'), 1)
        self.assertEqual(summary.get('closedTradesTick'), 1)
        self.assertEqual(summary.get('executedTrades'), 1)
        self.assertGreater(summary.get('slotRecoveryReferenceScore', 0.0), 0.0)

        close_rows = [row for row in self._ledger_rows() if row.get('kind') == 'mark_to_market']
        self.assertGreaterEqual(len(close_rows), 1)
        self.assertEqual((close_rows[0].get('metadata') or {}).get('closeReason'), 'slot_recovery')

    def test_blocks_extreme_entry_price_candidates(self):
        self.mod.FEED_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.FEED_PATH.write_text(
            json.dumps(
                {
                    'ok': True,
                    'opportunities': [
                        {
                            'id': 'cand-extreme',
                            'source': 'trading',
                            'venue': 'limitless',
                            'kind': 'trade_candidate',
                            'marketId': 'mkt-extreme',
                            'confidence': 0.8,
                            'expectedNetUsd': 0.2,
                            'feesEstimate': 0.0,
                            'expectedSlippage': 0.0,
                            'metadata': {'direction': 'no', 'midpoint': 0.9995},
                        },
                        {
                            'id': 'cand-valid',
                            'source': 'trading',
                            'venue': 'limitless',
                            'kind': 'trade_candidate',
                            'marketId': 'mkt-valid',
                            'confidence': 0.8,
                            'expectedNetUsd': 0.2,
                            'feesEstimate': 0.0,
                            'expectedSlippage': 0.0,
                            'metadata': {'direction': 'yes', 'midpoint': 0.55},
                        },
                    ],
                }
            ),
            encoding='utf-8',
        )

        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('executedTrades'), 1)
        self.assertEqual(summary.get('blockedByPriceBand'), 1)
        self.assertGreaterEqual(summary.get('blockedCandidates', 0), 1)

    def test_limitless_sync_skips_resolved_markets(self):
        self.mod.LIMITLESS_SYNC_POSITIONS = True
        self.mod.LIMITLESS_API_BASE_URL = 'https://api.limitless.exchange'
        self.mod.LIMITLESS_API_KEY = 'test-key'

        payload = {
            'clob': [
                {
                    'market': {
                        'slug': 'funded-market',
                        'status': 'FUNDED',
                        'yesPositionId': '111',
                        'noPositionId': '222',
                    },
                    'latestTrade': {'latestYesPrice': 0.6, 'latestNoPrice': 0.4},
                    'positions': {
                        'yes': {'cost': '250000'},
                        'no': {'cost': '0'},
                    },
                    'tokensBalance': {'yes': '250000', 'no': '0'},
                },
                {
                    'market': {
                        'slug': 'resolved-market',
                        'status': 'RESOLVED',
                        'yesPositionId': '333',
                        'noPositionId': '444',
                    },
                    'latestTrade': {'latestYesPrice': 0.99, 'latestNoPrice': 0.01},
                    'positions': {
                        'yes': {'cost': '1000000'},
                        'no': {'cost': '0'},
                    },
                    'tokensBalance': {'yes': '1000000', 'no': '0'},
                },
            ]
        }

        with patch.object(self.mod, 'request_json', return_value=payload):
            rows = self.mod.fetch_limitless_live_positions([])

        self.assertIsInstance(rows, list)
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row.get('marketId'), 'funded-market')
        self.assertEqual(row.get('limitlessMarketStatus'), 'FUNDED')
        self.assertAlmostEqual(float(row.get('limitlessPositionSize')), 0.25, places=8)

    def test_limitless_real_close_uses_synced_position_size(self):
        self.mod.FEED_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.FEED_PATH.write_text(json.dumps({'ok': True, 'opportunities': []}), encoding='utf-8')
        self.mod.EXECUTION_MODE = 'live'
        self.mod.VENUES = ['limitless']
        self.mod.REAL_CLOSE_ENABLED = True
        self.mod.CLOSE_STRICT_TRACKING = True
        self.mod.LIMITLESS_REQUIRE_SIGNED_PAYLOAD = False
        self.mod.LIMITLESS_EXEC_CMD = ''

        opened_at = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        self.mod.POSITIONS_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.POSITIONS_PATH.write_text(
            json.dumps(
                {
                    'positions': [
                        {
                            'id': 'limitless-open-1',
                            'positionId': 'limitless-open-1',
                            'orderId': 'limitless-order-1',
                            'marketId': 'limitless-mkt-1',
                            'venue': 'limitless',
                            'status': 'open',
                            'openedAt': opened_at,
                            'notionalUsd': 25.0,
                            'limitlessPositionSize': 0.42,
                            'limitlessMarketSlug': 'limitless-mkt-1',
                            'limitlessTokenId': '12345',
                            'direction': 'yes',
                            'entryPrice': 0.5,
                            'markPrice': 0.62,
                            'unrealizedPct': 24.0,
                        }
                    ]
                }
            ),
            encoding='utf-8',
        )

        close_calls: list[float] = []

        def fake_live_execute_limitless(candidate: dict, notional: float) -> dict:
            close_calls.append(notional)
            return {
                'orderId': 'close-order-limitless',
                'positionId': 'limitless-open-1',
                'grossUsd': 0.26,
                'costUsd': 0.01,
                'netUsd': 0.25,
                'realized': True,
                'paymentRef': '0x' + ('a' * 64),
                'txSignature': '0x' + ('a' * 64),
                'raw': {'execution': {'txHash': '0x' + ('a' * 64)}},
            }

        with patch.object(self.mod, 'live_execute_limitless', side_effect=fake_live_execute_limitless):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('liveCloseAttemptsTick'), 1)
        self.assertEqual(summary.get('liveCloseRealizedTick'), 1)
        self.assertEqual(len(close_calls), 1)
        self.assertAlmostEqual(close_calls[0], 0.399, places=8)


if __name__ == '__main__':
    unittest.main()
