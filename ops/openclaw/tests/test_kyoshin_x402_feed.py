import importlib.util
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
import unittest


SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'kyoshin-x402-feed.py'


def load_module():
    spec = importlib.util.spec_from_file_location('kyoshin_x402_feed', SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError('failed to load kyoshin-x402-feed.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class KyoshinX402FeedTests(unittest.TestCase):
    def setUp(self):
        self.mod = load_module()
        self.tmp = TemporaryDirectory()
        workspace = Path(self.tmp.name) / 'workspace'
        runtime = workspace / 'runtime'

        self.mod.WORKSPACE = workspace
        self.mod.RUNTIME_DIR = runtime
        self.mod.FEEDS_DIR = runtime / 'feeds'
        self.mod.STATE_DIR = runtime / 'state'
        self.mod.LOGS_DIR = runtime / 'logs'
        self.mod.OUTPUT_PATH = self.mod.FEEDS_DIR / 'x402-opportunities.json'
        self.mod.SUMMARY_PATH = self.mod.STATE_DIR / 'x402-feed-state.json'
        self.mod.LOG_PATH = self.mod.LOGS_DIR / 'x402-feed.jsonl'
        self.mod.MAX_OPPORTUNITIES = 50

    def tearDown(self):
        self.tmp.cleanup()

    def test_manual_specs_generate_opportunities(self):
        endpoints = [
            {
                'url': 'https://example.com/api/paid/market',
                'method': 'GET',
                'title': 'Paid market pull',
                'summary': 'Collect paid market payload.',
                'priceUsd': 0.005,
                'payoutUsd': 0.06,
                'roleHints': ['executor'],
                'tags': ['market', 'x402'],
            }
        ]
        with patch.dict(
            os.environ,
            {
                'KYO_X402_ENDPOINTS_JSON': json.dumps(endpoints),
                'KYO_X402_PRICING_URLS': '',
            },
            clear=False,
        ):
            code = self.mod.run()

        self.assertEqual(code, 0)
        payload = json.loads(self.mod.OUTPUT_PATH.read_text(encoding='utf-8'))
        self.assertEqual(payload.get('accepted'), 1)
        opp = payload['opportunities'][0]
        self.assertEqual(opp.get('source'), 'x402')
        self.assertEqual(opp.get('url'), 'https://example.com/api/paid/market')
        self.assertEqual(opp.get('metadata', {}).get('request', {}).get('method'), 'GET')
        self.assertAlmostEqual(float(opp.get('payoutUsd')), 0.06, places=8)

    def test_dedupe_prefers_higher_value_entry(self):
        endpoints = [
            {
                'url': 'https://example.com/api/paid/market',
                'method': 'GET',
                'title': 'Low',
                'priceUsd': 0.005,
                'payoutUsd': 0.02,
            },
            {
                'url': 'https://example.com/api/paid/market',
                'method': 'GET',
                'title': 'High',
                'priceUsd': 0.005,
                'payoutUsd': 0.08,
            },
        ]
        with patch.dict(
            os.environ,
            {
                'KYO_X402_ENDPOINTS_JSON': json.dumps(endpoints),
                'KYO_X402_PRICING_URLS': '',
            },
            clear=False,
        ):
            code = self.mod.run()

        self.assertEqual(code, 0)
        payload = json.loads(self.mod.OUTPUT_PATH.read_text(encoding='utf-8'))
        self.assertEqual(payload.get('accepted'), 1)
        opp = payload['opportunities'][0]
        self.assertEqual(opp.get('title'), 'High')
        self.assertAlmostEqual(float(opp.get('payoutUsd')), 0.08, places=8)


if __name__ == '__main__':
    unittest.main()
