import importlib.util
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest


SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'kyoshin-marketplace-intake.py'


def load_module():
    spec = importlib.util.spec_from_file_location('kyoshin_marketplace_intake', SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError('failed to load kyoshin-marketplace-intake.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class KyoshinMarketplaceIntakeTests(unittest.TestCase):
    def setUp(self):
        self.mod = load_module()
        self.tmp = TemporaryDirectory()
        self.runtime_dir = Path(self.tmp.name) / 'runtime'
        self.runtime_dir.mkdir(parents=True, exist_ok=True)
        self.mod.RUNTIME_DIR = self.runtime_dir
        self.mod.ALLOW_INSECURE_HTTP = False
        self.mod.ALLOW_FILE_FEEDS_ANYWHERE = False

    def tearDown(self):
        self.tmp.cleanup()

    def test_is_allowed_file_feed_allows_runtime_descendant(self):
        feed_path = self.runtime_dir / 'feeds' / 'agent_ai.json'
        feed_path.parent.mkdir(parents=True, exist_ok=True)
        feed_path.write_text('{}', encoding='utf-8')
        self.assertTrue(self.mod.is_allowed_file_feed(feed_path.as_uri()))

    def test_is_allowed_file_feed_rejects_path_outside_runtime(self):
        outside_path = Path(self.tmp.name) / 'outside.json'
        outside_path.write_text('{}', encoding='utf-8')
        self.assertFalse(self.mod.is_allowed_file_feed(outside_path.as_uri()))

    def test_is_allowed_file_feed_anywhere_override(self):
        outside_path = Path(self.tmp.name) / 'outside-override.json'
        outside_path.write_text('{}', encoding='utf-8')
        self.mod.ALLOW_FILE_FEEDS_ANYWHERE = True
        self.assertTrue(self.mod.is_allowed_file_feed(outside_path.as_uri()))

    def test_is_supported_feed_url_respects_http_toggle(self):
        self.mod.ALLOW_INSECURE_HTTP = False
        self.assertFalse(self.mod.is_supported_feed_url('http://example.com/feed.json'))

        self.mod.ALLOW_INSECURE_HTTP = True
        self.assertTrue(self.mod.is_supported_feed_url('http://example.com/feed.json'))
        self.assertTrue(self.mod.is_supported_feed_url('https://example.com/feed.json'))

    def test_dedupe_prefers_highest_ranked_and_caps_output(self):
        self.mod.MAX_OPPORTUNITIES = 2
        opportunities = [
            {'source': 'agent_ai', 'id': 'same', 'confidence': 0.2, 'payoutUsd': 2, 'payoutSol': 0},
            {'source': 'agent_ai', 'id': 'same', 'confidence': 0.9, 'payoutUsd': 9, 'payoutSol': 0},
            {'source': 'relevance', 'id': 'b', 'confidence': 0.8, 'payoutUsd': 1, 'payoutSol': 0},
            {'source': 'kore', 'id': 'c', 'confidence': 0.7, 'payoutUsd': 5, 'payoutSol': 0},
        ]

        out = self.mod.dedupe(opportunities)
        self.assertEqual(len(out), 2)
        self.assertEqual(out[0]['source'], 'agent_ai')
        self.assertEqual(out[0]['id'], 'same')
        self.assertEqual(out[1]['source'], 'relevance')
        self.assertEqual(out[1]['id'], 'b')


if __name__ == '__main__':
    unittest.main()
