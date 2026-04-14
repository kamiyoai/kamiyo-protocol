from contextlib import redirect_stdout
import io
import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch


SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'kamiyo-agent-memory-extract.py'


def load_module():
    spec = importlib.util.spec_from_file_location('kamiyo_agent_memory_extract', SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError('failed to load kamiyo-agent-memory-extract.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class KamiyoAgentMemoryExtractTests(unittest.TestCase):
    def setUp(self):
        self.mod = load_module()
        self.tmp = TemporaryDirectory()
        self.workspace = Path(self.tmp.name) / 'workspace'
        self.runtime = self.workspace / 'runtime'
        self.memory_dir = self.workspace / 'memory'
        self.memory_path = self.workspace / 'MEMORY.md'
        self.state_path = self.runtime / 'state' / 'memory-extract-state.json'

        self.mod.WORKSPACE = self.workspace
        self.mod.RUNTIME_DIR = self.runtime
        self.mod.STATE_DIR = self.runtime / 'state'
        self.mod.MEMORY_DIR = self.memory_dir
        self.mod.MEMORY_PATH = self.memory_path
        self.mod.STATE_PATH = self.state_path
        self.mod.MAX_FACTS = 200

    def tearDown(self):
        self.tmp.cleanup()

    def _run(self, date_value: str) -> dict:
        stdout = io.StringIO()
        with patch('sys.argv', ['kamiyo-agent-memory-extract.py', '--date', date_value]):
            with redirect_stdout(stdout):
                code = self.mod.run()
        self.assertEqual(code, 0)
        return json.loads(stdout.getvalue().strip())

    def test_extracts_marked_facts_to_managed_block(self):
        date_value = '2026-02-26'
        source = self.memory_dir / f'{date_value}.md'
        source.parent.mkdir(parents=True, exist_ok=True)
        source.write_text(
            '\n'.join(
                [
                    '# notes',
                    '- memory: prioritize opportunities with >3x return',
                    'policy: transfers require explicit approval',
                    'trust: show receipts with every status update',
                    'ignore this line',
                ]
            )
            + '\n',
            encoding='utf-8',
        )

        output = self._run(date_value)
        self.assertEqual(output.get('appendedCount'), 3)

        memory_text = self.memory_path.read_text(encoding='utf-8')
        self.assertIn(self.mod.MANAGED_START, memory_text)
        self.assertIn(self.mod.MANAGED_END, memory_text)
        self.assertIn('prioritize opportunities with >3x return', memory_text)
        self.assertIn('transfers require explicit approval', memory_text)
        self.assertIn('show receipts with every status update', memory_text)

    def test_second_run_dedupes_existing_facts(self):
        date_value = '2026-02-26'
        source = self.memory_dir / f'{date_value}.md'
        source.parent.mkdir(parents=True, exist_ok=True)
        source.write_text('- memory: keep updates direct and factual\n', encoding='utf-8')

        first = self._run(date_value)
        second = self._run(date_value)

        self.assertEqual(first.get('appendedCount'), 1)
        self.assertEqual(second.get('appendedCount'), 0)
        self.assertEqual(first.get('totalFacts'), 1)
        self.assertEqual(second.get('totalFacts'), 1)


if __name__ == '__main__':
    unittest.main()
