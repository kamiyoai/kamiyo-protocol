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
        self.feeds_dir = self.runtime / 'feeds'
        self.state_dir = self.runtime / 'state'
        self.log_dir = self.runtime / 'logs'

        self.mod.WORKSPACE = self.workspace
        self.mod.RUNTIME_DIR = self.runtime
        self.mod.FEEDS_DIR = self.feeds_dir
        self.mod.STATE_DIR = self.state_dir
        self.mod.LOG_DIR = self.log_dir

        self.mod.OUTPUT_PATH = self.feeds_dir / 'trading-opportunities.json'
        self.mod.STATE_PATH = self.state_dir / 'trading-feed.json'
        self.mod.LOG_PATH = self.log_dir / 'trading-feed.jsonl'

        self.mod.ENABLE_TRADING_AGENT = True
        self.mod.VENUES = ['dflow', 'kalshi']
        self.mod.KALSHI_SIGNAL_ONLY = True
        self.mod.MAX_DFLOW_OPPORTUNITIES = 5
        self.mod.MAX_KALSHI_OPPORTUNITIES = 5
        self.mod.MAX_TOTAL_OPPORTUNITIES = 10

    def tearDown(self):
        self.tmp.cleanup()

    def _run(self) -> tuple[int, dict]:
        stdout = io.StringIO()
        with patch('sys.stdout', stdout):
            code = self.mod.run()
        return code, json.loads(stdout.getvalue().strip())

    def test_disabled_status_when_trading_agent_disabled(self):
        self.mod.ENABLE_TRADING_AGENT = False
        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), True)
        self.assertEqual(summary.get('status'), 'disabled')

    def test_builds_opportunities_from_dflow_and_kalshi(self):
        def fake_fetch(base_url: str, path: str, headers: dict, query=None):
            if 'dflow' in base_url:
                return {
                    'data': [
                        {
                            'id': 'd1',
                            'question': 'Will SOL close above $150?',
                            'probability': 0.42,
                            'volumeUsd': 120000,
                            'liquidityUsd': 80000,
                        }
                    ]
                }
            return {
                'markets': [
                    {
                        'ticker': 'KALSHI-1',
                        'title': 'Will CPI print above 3%?',
                        'yes_ask': 63,
                        'volume': 55000,
                    }
                ]
            }

        with patch.object(self.mod, 'fetch_json', side_effect=fake_fetch):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), True)
        self.assertEqual(summary.get('accepted'), 2)
        opportunities = summary.get('opportunities') or []
        self.assertEqual(len(opportunities), 2)
        sources = {row.get('source') for row in opportunities}
        self.assertEqual(sources, {'trading'})
        venues = {
            (row.get('metadata') or {}).get('venue')
            for row in opportunities
            if isinstance(row, dict)
        }
        self.assertEqual(venues, {'dflow', 'kalshi'})

    def test_fails_when_all_enabled_venues_fail(self):
        def fake_fetch(_base_url: str, _path: str, _headers: dict, query=None):
            raise RuntimeError('upstream_down')

        with patch.object(self.mod, 'fetch_json', side_effect=fake_fetch):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), False)
        self.assertEqual(summary.get('status'), 'failed')


if __name__ == '__main__':
    unittest.main()
