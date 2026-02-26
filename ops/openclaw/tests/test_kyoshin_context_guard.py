from contextlib import redirect_stdout
import io
import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest


SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'kyoshin-context-guard.py'


def load_module():
    spec = importlib.util.spec_from_file_location('kyoshin_context_guard', SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError('failed to load kyoshin-context-guard.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class KyoshinContextGuardTests(unittest.TestCase):
    def setUp(self):
        self.mod = load_module()
        self.tmp = TemporaryDirectory()
        self.home = Path(self.tmp.name) / 'home'
        self.workspace = self.home / '.openclaw' / 'workspace'
        self.runtime = self.workspace / 'runtime'
        self.state = self.runtime / 'state'
        self.output = self.state / 'context-guard.json'

        self.mod.HOME_DIR = self.home
        self.mod.WORKSPACE = self.workspace
        self.mod.RUNTIME_DIR = self.runtime
        self.mod.STATE_DIR = self.state
        self.mod.OUTPUT_PATH = self.output

    def tearDown(self):
        self.tmp.cleanup()

    def _read_output(self) -> dict:
        return json.loads(self.output.read_text(encoding='utf-8'))

    def _run_guard(self) -> int:
        with redirect_stdout(io.StringIO()):
            return self.mod.run()

    def test_creates_quickstart_context_and_passes_required_checks(self):
        exit_code = self._run_guard()
        self.assertEqual(exit_code, 0)

        payload = self._read_output()
        self.assertEqual(payload.get('requiredMissing'), [])

        expected_files = (
            'SOUL.md',
            'IDENTITY.md',
            'MEMORY.md',
            'AGENTS.md',
            'soul.md',
            'identity.md',
            'WORKING-MEMORY.md',
            '.learnings/LEARNINGS.md',
        )
        for rel in expected_files:
            self.assertTrue((self.workspace / rel).exists(), msg=rel)

    def test_marks_placeholder_memory_and_agents_as_incomplete(self):
        self._run_guard()

        (self.workspace / 'MEMORY.md').write_text('# MEMORY.md\n- \n', encoding='utf-8')
        (self.workspace / 'AGENTS.md').write_text('# AGENTS.md\ntodo\n', encoding='utf-8')

        exit_code = self._run_guard()
        self.assertEqual(exit_code, 0)

        payload = self._read_output()
        missing = set(payload.get('requiredMissing', []))
        self.assertIn('memory', missing)
        self.assertIn('agents', missing)

        checks_by_name = {item.get('name'): item for item in payload.get('checks', []) if isinstance(item, dict)}
        self.assertEqual(checks_by_name.get('memory', {}).get('complete'), False)
        self.assertEqual(checks_by_name.get('agents', {}).get('complete'), False)


if __name__ == '__main__':
    unittest.main()
