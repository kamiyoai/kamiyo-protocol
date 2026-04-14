import importlib.util
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import urllib.parse
from unittest.mock import patch
import unittest


SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'kamiyo-agent-sync-feed-config.py'


def load_module():
    spec = importlib.util.spec_from_file_location('kamiyo_agent_sync_feed_config', SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError('failed to load kamiyo-agent-sync-feed-config.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class KamiyoAgentSyncFeedConfigTests(unittest.TestCase):
    def setUp(self):
        self.mod = load_module()
        self.tmp = TemporaryDirectory()
        self.runtime_dir = Path(self.tmp.name) / 'runtime'
        self.runtime_dir.mkdir(parents=True, exist_ok=True)
        self.mod.RUNTIME_DIR = self.runtime_dir

    def tearDown(self):
        self.tmp.cleanup()

    def test_is_allowed_file_url_allows_runtime_descendant(self):
        feed_path = self.runtime_dir / 'seed' / 'agent_ai.json'
        feed_path.parent.mkdir(parents=True, exist_ok=True)
        feed_path.write_text('{}', encoding='utf-8')

        parsed = urllib.parse.urlparse(feed_path.as_uri())
        self.assertTrue(self.mod.is_allowed_file_url(parsed, False))

    def test_is_allowed_file_url_rejects_outside_runtime(self):
        outside_path = Path(self.tmp.name) / 'outside.json'
        outside_path.write_text('{}', encoding='utf-8')

        parsed = urllib.parse.urlparse(outside_path.as_uri())
        self.assertFalse(self.mod.is_allowed_file_url(parsed, False))

    def test_is_allowed_file_url_rejects_remote_host(self):
        parsed = urllib.parse.urlparse('file://remote-host/tmp/feed.json')
        self.assertFalse(self.mod.is_allowed_file_url(parsed, False))

    def test_is_allowed_file_url_anywhere_override(self):
        outside_path = Path(self.tmp.name) / 'outside-override.json'
        outside_path.write_text('{}', encoding='utf-8')

        parsed = urllib.parse.urlparse(outside_path.as_uri())
        self.assertTrue(self.mod.is_allowed_file_url(parsed, True))

    def test_normalize_live_url_enforces_protocol_policy(self):
        https_url = 'https://example.com/feed.json'
        self.assertEqual(
            self.mod.normalize_live_url(https_url, allow_insecure_http=False, allow_file_feeds_anywhere=False),
            (https_url, True),
        )
        self.assertEqual(
            self.mod.normalize_live_url('http://example.com/feed.json', allow_insecure_http=False, allow_file_feeds_anywhere=False),
            ('', False),
        )
        self.assertEqual(
            self.mod.normalize_live_url('http://example.com/feed.json', allow_insecure_http=True, allow_file_feeds_anywhere=False),
            ('http://example.com/feed.json', True),
        )

    def test_build_config_prefers_generated_x402_feed_when_live_missing(self):
        feeds_dir = self.runtime_dir / 'feeds'
        feeds_dir.mkdir(parents=True, exist_ok=True)
        generated = feeds_dir / 'x402-opportunities.json'
        generated.write_text('{"opportunities":[]}', encoding='utf-8')

        with patch.dict(os.environ, {'KYO_BOOTSTRAP_FEED_FALLBACK': 'true'}, clear=False):
            config, summary = self.mod.build_config()

        feeds = config.get('feeds', [])
        x402 = next((item for item in feeds if item.get('source') == 'x402'), None)
        self.assertIsNotNone(x402)
        self.assertTrue(bool(x402.get('enabled')))
        self.assertEqual(x402.get('id'), 'x402_generated')
        self.assertTrue(str(x402.get('url', '')).startswith('file://'))

        source_summary = next((item for item in summary.get('sources', []) if item.get('source') == 'x402'), None)
        self.assertIsNotNone(source_summary)
        self.assertEqual(source_summary.get('mode'), 'generated')
        self.assertTrue(bool(source_summary.get('hasGenerated')))

    def test_build_config_prefers_generated_dx_terminal_feed_when_live_missing(self):
        feeds_dir = self.runtime_dir / 'feeds'
        feeds_dir.mkdir(parents=True, exist_ok=True)
        generated = feeds_dir / 'dx-terminal-opportunities.json'
        generated.write_text('{"opportunities":[]}', encoding='utf-8')

        with patch.dict(os.environ, {'KYO_BOOTSTRAP_FEED_FALLBACK': 'true'}, clear=False):
            config, summary = self.mod.build_config()

        feeds = config.get('feeds', [])
        dx_terminal = next((item for item in feeds if item.get('source') == 'dx_terminal'), None)
        self.assertIsNotNone(dx_terminal)
        self.assertTrue(bool(dx_terminal.get('enabled')))
        self.assertEqual(dx_terminal.get('id'), 'dx_terminal_generated')
        self.assertTrue(str(dx_terminal.get('url', '')).startswith('file://'))

        source_summary = next((item for item in summary.get('sources', []) if item.get('source') == 'dx_terminal'), None)
        self.assertIsNotNone(source_summary)
        self.assertEqual(source_summary.get('mode'), 'generated')
        self.assertTrue(bool(source_summary.get('hasGenerated')))


if __name__ == '__main__':
    unittest.main()
