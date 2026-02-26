import importlib.util
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest


SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'kyoshin-dx-terminal-feed.py'


def load_module():
    spec = importlib.util.spec_from_file_location('kyoshin_dx_terminal_feed', SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError('failed to load kyoshin-dx-terminal-feed.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class KyoshinDxTerminalFeedTests(unittest.TestCase):
    def setUp(self):
        self.mod = load_module()
        self.tmp = TemporaryDirectory()
        runtime_dir = Path(self.tmp.name) / 'runtime'
        runtime_dir.mkdir(parents=True, exist_ok=True)
        self.mod.RUNTIME_DIR = runtime_dir
        self.mod.FEEDS_DIR = runtime_dir / 'feeds'
        self.mod.STATE_DIR = runtime_dir / 'state'
        self.mod.LOGS_DIR = runtime_dir / 'logs'
        self.mod.OUTPUT_PATH = self.mod.FEEDS_DIR / 'dx-terminal-opportunities.json'
        self.mod.SUMMARY_PATH = self.mod.STATE_DIR / 'dx-terminal-feed-state.json'
        self.mod.LOG_PATH = self.mod.LOGS_DIR / 'dx-terminal-feed.jsonl'

    def tearDown(self):
        self.tmp.cleanup()

    def test_build_leaderboard_opportunities(self):
        rows = [
            {
                'rank': 1,
                'nftName': 'SignalFox',
                'vaultAddress': '0xabc',
                'ownerAddress': '0x123',
                'totalPnlUsd': 12345.67,
                'totalPnlEth': '5000000000000000000',
            }
        ]
        out = self.mod.build_leaderboard_opportunities(rows)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]['source'], 'dx_terminal')
        self.assertIn('SignalFox', out[0]['title'])
        self.assertIn('leaderboard', out[0]['tags'])

    def test_build_token_opportunities_respects_thresholds(self):
        self.mod.MIN_TOKEN_VOLUME_USD = 1000.0
        self.mod.MIN_TOKEN_HOLDERS = 10
        rows = [
            {
                'tokenAddress': '0xdeadbeef',
                'name': 'Token A',
                'symbol': 'TKA',
                'marketData': {
                    'priceUsd': '0.1',
                    'holderCount': 120,
                    '15m': {
                        'volumeUsd': '4500',
                        'priceChangePercent': 22.5,
                        'buyCount': 15,
                        'sellCount': 8,
                    },
                },
            },
            {
                'tokenAddress': '0xbeefdead',
                'name': 'Token B',
                'symbol': 'TKB',
                'marketData': {
                    'priceUsd': '0.1',
                    'holderCount': 3,
                    '15m': {
                        'volumeUsd': '9000',
                        'priceChangePercent': 8,
                        'buyCount': 5,
                        'sellCount': 3,
                    },
                },
            },
        ]
        out = self.mod.build_token_opportunities(rows)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]['metadata']['tokenAddress'], '0xdeadbeef')

    def test_dedupe_ranked_prefers_high_confidence(self):
        rows = [
            {'id': 'a', 'confidence': 0.4},
            {'id': 'a', 'confidence': 0.8},
            {'id': 'b', 'confidence': 0.3},
        ]
        out = self.mod.dedupe_ranked(rows)
        self.assertEqual(len(out), 2)
        self.assertEqual(out[0]['id'], 'a')
        self.assertEqual(out[0]['confidence'], 0.8)


if __name__ == '__main__':
    unittest.main()
