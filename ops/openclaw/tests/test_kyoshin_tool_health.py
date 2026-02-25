import importlib.util
from pathlib import Path
import unittest


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


if __name__ == '__main__':
    unittest.main()
