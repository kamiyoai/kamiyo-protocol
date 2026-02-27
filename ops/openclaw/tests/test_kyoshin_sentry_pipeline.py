import importlib.util
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch


SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'kyoshin-sentry-pipeline.py'


def load_module():
    spec = importlib.util.spec_from_file_location('kyoshin_sentry_pipeline', SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError('failed to load kyoshin-sentry-pipeline.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class KyoshinSentryPipelineTests(unittest.TestCase):
    def setUp(self):
        self.mod = load_module()
        self.tmp = TemporaryDirectory()
        self.workspace = Path(self.tmp.name) / 'workspace'
        self.runtime = self.workspace / 'runtime'
        self.state_dir = self.runtime / 'state'
        self.hooks_dir = self.runtime / 'hooks'
        self.incidents_dir = self.runtime / 'incidents'
        self.logs_dir = self.runtime / 'logs'

        self.mod.WORKSPACE = self.workspace
        self.mod.RUNTIME_DIR = self.runtime
        self.mod.STATE_DIR = self.state_dir
        self.mod.HOOKS_DIR = self.hooks_dir
        self.mod.INCIDENTS_DIR = self.incidents_dir
        self.mod.LOG_DIR = self.logs_dir
        self.mod.INBOX_PATH = self.hooks_dir / 'sentry-alerts.jsonl'
        self.mod.OUTPUT_PATH = self.incidents_dir / 'sentry-triage.json'
        self.mod.STATE_PATH = self.state_dir / 'sentry-pipeline-state.json'
        self.mod.LOG_PATH = self.logs_dir / 'kyoshin-sentry-pipeline.jsonl'
        self.mod.MAX_INCIDENTS = 50

    def tearDown(self):
        self.tmp.cleanup()

    def _run(self, argv: list[str]) -> tuple[int, dict]:
        stdout = io.StringIO()
        with patch('sys.argv', ['kyoshin-sentry-pipeline.py'] + argv):
            with patch('sys.stdout', stdout):
                code = self.mod.run()
        payload = json.loads(stdout.getvalue().strip())
        return code, payload

    def test_ingest_and_triage_autofix_for_staging_issue(self):
        payload = {
            'data': {
                'issue': {
                    'id': '1234',
                    'shortId': 'KYO-12',
                    'title': 'TypeError: undefined variable user_profile',
                    'level': 'error',
                    'status': 'unresolved',
                    'tags': [{'key': 'environment', 'value': 'staging'}],
                    'metadata': {'type': 'TypeError', 'value': 'undefined variable user_profile'},
                }
            }
        }
        payload_path = Path(self.tmp.name) / 'payload.json'
        payload_path.write_text(json.dumps(payload), encoding='utf-8')

        code, ingest_summary = self._run(['--ingest', '--payload-file', str(payload_path)])
        self.assertEqual(code, 0)
        self.assertEqual(ingest_summary.get('status'), 'ingested')
        self.assertEqual(ingest_summary.get('route'), 'auto_fix')

        triage_code, triage_summary = self._run([])
        self.assertEqual(triage_code, 0)
        self.assertEqual(triage_summary.get('autoFixCandidates'), 1)
        self.assertEqual(triage_summary.get('escalations'), 0)

        triage_output = json.loads(self.mod.OUTPUT_PATH.read_text(encoding='utf-8'))
        incidents = triage_output.get('incidents', [])
        self.assertEqual(len(incidents), 1)
        incident = incidents[0]
        self.assertEqual(incident.get('triage', {}).get('route'), 'auto_fix')
        self.assertEqual(incident.get('policy', {}).get('targetBranch'), 'staging')
        self.assertEqual(incident.get('policy', {}).get('requireHumanReview'), False)

    def test_triage_escalates_security_incident_on_production(self):
        payload = {
            'data': {
                'issue': {
                    'id': '777',
                    'shortId': 'KYO-77',
                    'title': 'Authentication token validation failure',
                    'level': 'fatal',
                    'status': 'unresolved',
                    'tags': [{'key': 'environment', 'value': 'production'}],
                    'metadata': {'type': 'SecurityError', 'value': 'invalid signature on auth token'},
                }
            }
        }
        self.mod.ensure_dirs()
        self.mod.append_json_line(self.mod.INBOX_PATH, payload)

        code, summary = self._run([])
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('escalations'), 1)
        self.assertEqual(summary.get('productionIncidents'), 1)

        triage_output = json.loads(self.mod.OUTPUT_PATH.read_text(encoding='utf-8'))
        incident = triage_output.get('incidents', [])[0]
        self.assertEqual(incident.get('triage', {}).get('route'), 'escalate')
        self.assertEqual(incident.get('policy', {}).get('targetBranch'), 'main')
        self.assertEqual(incident.get('policy', {}).get('checkStagingFirst'), True)
        self.assertEqual(incident.get('policy', {}).get('requireHumanReview'), True)

    def test_ingest_rejects_payload_without_issue_id(self):
        payload_path = Path(self.tmp.name) / 'invalid.json'
        payload_path.write_text(json.dumps({'data': {'issue': {'title': 'missing id'}}}), encoding='utf-8')

        code, summary = self._run(['--ingest', '--payload-file', str(payload_path)])
        self.assertEqual(code, 1)
        self.assertEqual(summary.get('ok'), False)
        self.assertEqual(summary.get('error'), 'missing_issue_id')


if __name__ == '__main__':
    unittest.main()
