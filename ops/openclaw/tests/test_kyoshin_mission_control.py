import importlib.util
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch


SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'kyoshin-mission-control.py'


def load_module():
    spec = importlib.util.spec_from_file_location('kyoshin_mission_control', SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError('failed to load kyoshin-mission-control.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class KyoshinMissionControlTests(unittest.TestCase):
    def setUp(self):
        self.mod = load_module()
        self.tmp = TemporaryDirectory()
        self.workspace = Path(self.tmp.name) / 'workspace'
        self.runtime = self.workspace / 'runtime'
        self.state_dir = self.runtime / 'state'
        self.queue_dir = self.runtime / 'queue'
        self.tools_dir = self.runtime / 'tools'
        self.incidents_dir = self.runtime / 'incidents'
        self.output_dir = self.runtime / 'mission-control'

        self.mod.WORKSPACE = self.workspace
        self.mod.RUNTIME_DIR = self.runtime
        self.mod.STATE_DIR = self.state_dir
        self.mod.INCIDENTS_DIR = self.incidents_dir
        self.mod.QUEUE_PATH = self.queue_dir / 'assignments.json'
        self.mod.TOOL_HEALTH_PATH = self.tools_dir / 'tool-health.json'
        self.mod.GOVERNOR_PATH = self.state_dir / 'swarm-governor.json'
        self.mod.KYOSHIN_RUNTIME_PATH = self.state_dir / 'kyoshin-runtime.json'
        self.mod.SENTRY_TRIAGE_PATH = self.incidents_dir / 'sentry-triage.json'
        self.mod.MISSION_PATH = self.workspace / 'MISSION_STATEMENT.md'
        self.mod.GOALS_PATH = self.workspace / 'GOALS.md'
        self.mod.OUTPUT_DIR = self.output_dir
        self.mod.BOARD_PATH = self.output_dir / 'board.json'
        self.mod.BACKLOG_PATH = self.output_dir / 'backlog.json'
        self.mod.MAX_BACKLOG_ITEMS = 20
        self.mod.MAX_SENTRY_BACKLOG_ITEMS = 5

    def tearDown(self):
        self.tmp.cleanup()

    def _write_json(self, path: Path, payload: dict) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload), encoding='utf-8')

    def _run(self) -> tuple[int, dict]:
        stdout = io.StringIO()
        with patch('sys.stdout', stdout):
            code = self.mod.run()
        return code, json.loads(stdout.getvalue().strip())

    def test_includes_sentry_items_in_backlog(self):
        self._write_json(self.mod.QUEUE_PATH, {'assignments': []})
        self._write_json(self.mod.TOOL_HEALTH_PATH, {'checks': []})
        self._write_json(self.mod.GOVERNOR_PATH, {'decisions': []})
        self._write_json(self.mod.KYOSHIN_RUNTIME_PATH, {'ok': True, 'summary': {'lastTickStatus': 'ok', 'mode': 'execute'}})
        self._write_json(
            self.mod.SENTRY_TRIAGE_PATH,
            {
                'incidents': [
                    {
                        'issueId': '11',
                        'shortId': 'KYO-11',
                        'title': 'TypeError undefined variable',
                        'level': 'error',
                        'environmentClass': 'staging',
                        'permalink': 'https://example.com/11',
                        'triage': {'route': 'auto_fix'},
                        'policy': {'targetBranch': 'staging'},
                        'nextAction': 'write failing test then fix',
                    },
                    {
                        'issueId': '22',
                        'shortId': 'KYO-22',
                        'title': 'Auth token validation failed',
                        'level': 'fatal',
                        'environmentClass': 'production',
                        'permalink': 'https://example.com/22',
                        'triage': {'route': 'escalate'},
                        'policy': {'targetBranch': 'main'},
                        'nextAction': 'escalate to human review',
                    },
                ],
                'totals': {'autoFixCandidates': 1, 'escalations': 1},
            },
        )

        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), True)
        self.assertEqual(summary.get('sentryIncidents'), 2)
        self.assertEqual(summary.get('sentryBacklogItems'), 2)

        board = json.loads(self.mod.BOARD_PATH.read_text(encoding='utf-8'))
        backlog = json.loads(self.mod.BACKLOG_PATH.read_text(encoding='utf-8'))
        self.assertEqual(board.get('sentryIncidents'), 2)
        self.assertEqual(board.get('sentryAutoFixCandidates'), 1)
        self.assertEqual(board.get('sentryEscalations'), 1)
        ids = {item.get('id') for item in backlog.get('items', [])}
        self.assertIn('sentry-11', ids)
        self.assertIn('sentry-22', ids)


if __name__ == '__main__':
    unittest.main()
