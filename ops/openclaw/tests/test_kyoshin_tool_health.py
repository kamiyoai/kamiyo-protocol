import importlib.util
import os
from pathlib import Path
import unittest
from unittest.mock import patch


SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'kyoshin-tool-health.py'


def load_module():
    spec = importlib.util.spec_from_file_location('kyoshin_tool_health', SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError('failed to load kyoshin-tool-health.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class KyoshinToolHealthTests(unittest.TestCase):
    def setUp(self):
        self.mod = load_module()

    def test_run_command_rejects_invalid_shell_syntax(self):
        ok, detail = self.mod.run_command('"unterminated')
        self.assertFalse(ok)
        self.assertTrue(detail.startswith('invalid_command:'))

    def test_run_command_reports_missing_binary(self):
        ok, detail = self.mod.run_command('this-command-should-never-exist-kyoshin')
        self.assertFalse(ok)
        self.assertEqual(detail, 'command_not_found')

    def test_run_command_executes_args_without_shell(self):
        ok, detail = self.mod.run_command('python3 -c "print(123)"')
        self.assertTrue(ok)
        self.assertIn('123', detail)

    def test_run_http_rejects_unsupported_scheme(self):
        ok, detail = self.mod.run_http('file:///tmp/health.json', {})
        self.assertFalse(ok)
        self.assertEqual(detail, 'unsupported_scheme')

    def test_run_http_blocks_remote_insecure_http_by_default(self):
        self.mod.ALLOW_INSECURE_HTTP = False
        ok, detail = self.mod.run_http('http://example.com/health', {})
        self.assertFalse(ok)
        self.assertEqual(detail, 'http_blocked')

    def test_read_registry_adds_do_agent_probe_when_url_is_set(self):
        with patch.dict(os.environ, {'KYO_DO_AGENT_URL': 'https://example.agents.do-ai.run'}, clear=False):
            tools = self.mod.read_registry()
        probe = next((entry for entry in tools if entry.get('id') == 'digitalocean_agent_completion'), None)
        self.assertIsNotNone(probe)
        self.assertEqual(probe.get('kind'), 'do_agent')

    def test_run_do_agent_requires_api_key(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop('KYO_DO_AGENT_API_KEY', None)
            ok, detail = self.mod.run_do_agent('https://example.agents.do-ai.run')
        self.assertFalse(ok)
        self.assertEqual(detail, 'missing_api_key')

    def test_run_do_agent_accepts_valid_completion_shape(self):
        class FakeResponse:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def read(self):
                return b'{"choices":[{"index":0,"message":{"role":"assistant","content":"ok"}}]}'

        with patch.dict(
            os.environ,
            {
                'KYO_DO_AGENT_API_KEY': 'test-key',
                'KYO_DO_AGENT_CHECK_PROMPT': 'ping',
            },
            clear=False,
        ):
            with patch.object(self.mod.urllib.request, 'urlopen', return_value=FakeResponse()):
                ok, detail = self.mod.run_do_agent('https://example.agents.do-ai.run')
        self.assertTrue(ok)
        self.assertEqual(detail, 'http_200')


if __name__ == '__main__':
    unittest.main()
