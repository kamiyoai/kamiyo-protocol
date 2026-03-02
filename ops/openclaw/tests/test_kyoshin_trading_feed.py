import importlib.util
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch


SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'kyoshin-trading-feed.py'


def load_module():
    spec = importlib.util.spec_from_file_location('kyoshin_trading_feed', SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError('failed to load kyoshin-trading-feed.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class KyoshinTradingFeedTests(unittest.TestCase):
    def setUp(self):
        self.mod = load_module()
        self.tmp = TemporaryDirectory()
        self.workspace = Path(self.tmp.name) / 'workspace'
        self.runtime = self.workspace / 'runtime'
        self.state_dir = self.runtime / 'state'
        self.feeds_dir = self.runtime / 'feeds'
        self.log_dir = self.runtime / 'logs'

        self.mod.WORKSPACE = self.workspace
        self.mod.RUNTIME_DIR = self.runtime
        self.mod.STATE_DIR = self.state_dir
        self.mod.FEEDS_DIR = self.feeds_dir
        self.mod.LOG_DIR = self.log_dir
        self.mod.FEED_PATH = self.feeds_dir / 'trading-opportunities.json'
        self.mod.STATE_PATH = self.state_dir / 'trading-feed-state.json'
        self.mod.OUTPUT_PATH = self.state_dir / 'trading-feed.json'
        self.mod.LOG_PATH = self.log_dir / 'trading-feed.jsonl'

        self.mod.ENABLE_TRADING_AGENT = True
        self.mod.VENUES = ['polymarket', 'limitless', 'kalshi']
        self.mod.MAX_OPPORTUNITIES = 20
        self.mod.MIN_EXPECTED_NET_USD = 0.01

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
                }
            ]
        }
        limitless_payload = {
            'data': [
                {
                    'id': 'lm-1',
                    'title': 'Limitless market 1',
                    'prices': [0.6, 0.4],
                    'volume': 250000,
                    'spread': 0.02,
                    'feesEstimate': 0.01,
                    'edgeEstimate': 0.08,
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

    def test_marks_degraded_when_venue_fetch_fails(self):
        with patch.object(self.mod, 'load_venue_payload', side_effect=RuntimeError('boom')):
            code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), False)
        self.assertEqual(summary.get('status'), 'degraded')
        self.assertGreaterEqual(len(summary.get('errors') or []), 1)


if __name__ == '__main__':
    unittest.main()
