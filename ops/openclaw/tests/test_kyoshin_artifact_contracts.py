import importlib.util
import io
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from contextlib import redirect_stdout
import unittest


SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'kyoshin-artifact-contracts.py'


def load_module():
    spec = importlib.util.spec_from_file_location('kyoshin_artifact_contracts', SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError('failed to load kyoshin-artifact-contracts.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class KyoshinArtifactContractsTests(unittest.TestCase):
    def setUp(self):
        self.mod = load_module()
        self.tmp = TemporaryDirectory()
        self.home = Path(self.tmp.name) / 'home'
        self.workspace = self.home / '.openclaw' / 'workspace'
        self.runtime = self.workspace / 'runtime'
        self._configure_paths()
        self.prev_require_runtime = os.environ.get('KYO_REQUIRE_KYOSHIN_RUNTIME')

    def tearDown(self):
        if self.prev_require_runtime is None:
            os.environ.pop('KYO_REQUIRE_KYOSHIN_RUNTIME', None)
        else:
            os.environ['KYO_REQUIRE_KYOSHIN_RUNTIME'] = self.prev_require_runtime
        self.tmp.cleanup()

    def _configure_paths(self):
        self.mod.HOME_DIR = self.home
        self.mod.WORKSPACE = self.workspace
        self.mod.RUNTIME_DIR = self.runtime
        self.mod.FEEDS_DIR = self.runtime / 'feeds'
        self.mod.QUEUE_DIR = self.runtime / 'queue'
        self.mod.TOOLS_DIR = self.runtime / 'tools'
        self.mod.MISSION_CONTROL_DIR = self.runtime / 'mission-control'
        self.mod.STATE_DIR = self.runtime / 'state'
        self.mod.LOG_DIR = self.runtime / 'logs'
        self.mod.OUTPUT_PATH = self.mod.STATE_DIR / 'runtime-artifact-contracts.json'
        self.mod.LOG_PATH = self.mod.LOG_DIR / 'runtime-artifact-contracts.jsonl'

    def _write_json(self, path: Path, payload: dict):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload), encoding='utf-8')

    def _write_valid_artifacts(self, include_runtime: bool = True):
        self._write_json(
            self.mod.FEEDS_DIR / 'opportunities.json',
            {
                'accepted': 1,
                'opportunities': [
                    {
                        'id': 'opp-1',
                        'source': 'direct_api',
                        'title': 'Opportunity',
                        'summary': 'Valid summary',
                        'confidence': 0.7,
                        'tags': ['execution'],
                        'roleHints': ['executor'],
                    }
                ],
            },
        )
        self._write_json(
            self.mod.QUEUE_DIR / 'assignments.json',
            {
                'assignments': [
                    {
                        'missionId': 'mission-1',
                        'agentId': 'deal-executor',
                        'opportunityId': 'opp-1',
                        'objective': 'Execute safely',
                        'status': 'queued',
                        'score': 1.2,
                    }
                ]
            },
        )
        self._write_json(
            self.mod.TOOLS_DIR / 'tool-health.json',
            {'ok': True, 'checks': [{'id': 'python3_cli', 'kind': 'command', 'ok': True}]},
        )
        self._write_json(
            self.mod.MISSION_CONTROL_DIR / 'board.json',
            {'ok': True, 'backlogCount': 1, 'focus': ['Protect mission continuity']},
        )
        self._write_json(
            self.mod.MISSION_CONTROL_DIR / 'backlog.json',
            {
                'items': [
                    {
                        'id': 'item-1',
                        'type': 'execute_assignment',
                        'priority': 'high',
                        'title': 'Do work',
                        'objective': 'Complete objective',
                        'status': 'todo',
                    }
                ]
            },
        )
        if include_runtime:
            self._write_json(
                self.mod.STATE_DIR / 'kyoshin-runtime.json',
                {'ok': True, 'summary': {'mode': 'execute'}},
            )

    def _read_output(self) -> dict:
        return json.loads(self.mod.OUTPUT_PATH.read_text(encoding='utf-8'))

    def _run_silent(self) -> int:
        with redirect_stdout(io.StringIO()):
            return self.mod.run()

    def test_run_passes_with_valid_artifacts(self):
        os.environ['KYO_REQUIRE_KYOSHIN_RUNTIME'] = 'true'
        self._write_valid_artifacts(include_runtime=True)
        rc = self._run_silent()
        self.assertEqual(rc, 0)
        out = self._read_output()
        self.assertTrue(out.get('ok'))
        self.assertEqual(len(out.get('errors', [])), 0)

    def test_run_fails_on_invalid_opportunity_contract(self):
        os.environ['KYO_REQUIRE_KYOSHIN_RUNTIME'] = 'true'
        self._write_valid_artifacts(include_runtime=True)
        self._write_json(
            self.mod.FEEDS_DIR / 'opportunities.json',
            {
                'accepted': 1,
                'opportunities': [{'id': 'opp-1', 'source': 'direct_api', 'summary': 'missing title', 'confidence': 1.5}],
            },
        )
        rc = self._run_silent()
        self.assertEqual(rc, 1)
        out = self._read_output()
        self.assertFalse(out.get('ok'))
        self.assertTrue(any(err.get('artifact') == 'opportunities' for err in out.get('errors', [])))

    def test_run_fails_when_required_artifact_is_missing(self):
        os.environ['KYO_REQUIRE_KYOSHIN_RUNTIME'] = 'true'
        self._write_valid_artifacts(include_runtime=True)
        (self.mod.QUEUE_DIR / 'assignments.json').unlink()
        rc = self._run_silent()
        self.assertEqual(rc, 1)
        out = self._read_output()
        self.assertTrue(any(err.get('code') == 'missing_file' and err.get('artifact') == 'assignments' for err in out.get('errors', [])))

    def test_runtime_state_is_optional_when_runtime_requirement_disabled(self):
        os.environ['KYO_REQUIRE_KYOSHIN_RUNTIME'] = 'false'
        self._write_valid_artifacts(include_runtime=False)
        rc = self._run_silent()
        self.assertEqual(rc, 0)
        out = self._read_output()
        self.assertTrue(out.get('ok'))


if __name__ == '__main__':
    unittest.main()
