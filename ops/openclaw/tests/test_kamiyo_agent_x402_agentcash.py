import importlib.util
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch


SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'kamiyo-agent-x402-agentcash.py'


def load_module():
    spec = importlib.util.spec_from_file_location('kamiyo_agent_x402_agentcash', SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError('failed to load kamiyo-agent-x402-agentcash.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class _Proc:
    def __init__(self, returncode: int, stdout: str, stderr: str = ''):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


class KamiyoAgentX402AgentCashTests(unittest.TestCase):
    def setUp(self):
        self.mod = load_module()
        self.tmp = TemporaryDirectory()
        self.workspace = Path(self.tmp.name) / 'workspace'
        self.runtime = self.workspace / 'runtime'
        self.state_dir = self.runtime / 'state'
        self.feeds_dir = self.runtime / 'feeds'
        self.receipts_dir = self.runtime / 'receipts'
        self.log_dir = self.runtime / 'logs'

        self.mod.WORKSPACE = self.workspace
        self.mod.RUNTIME_DIR = self.runtime
        self.mod.STATE_DIR = self.state_dir
        self.mod.FEEDS_DIR = self.feeds_dir
        self.mod.RECEIPTS_DIR = self.receipts_dir
        self.mod.LOG_DIR = self.log_dir

        self.mod.STATE_PATH = self.state_dir / 'x402-agentcash-state.json'
        self.mod.OUTPUT_PATH = self.state_dir / 'x402-agentcash.json'
        self.mod.LOG_PATH = self.log_dir / 'x402-agentcash.jsonl'
        self.mod.LEDGER_PATH = self.receipts_dir / 'revenue-ledger.jsonl'
        self.mod.ALLOWLIST_PATH = self.feeds_dir / 'x402-allowlist.json'

        self.mod.ENABLE_AGENTCASH = True
        self.mod.CHECK_ONLY = False
        self.mod.MAX_CALLS_PER_TICK = 2
        self.mod.MIN_JOB_MARGIN_USD = 0.0
        self.mod.MIN_JOB_SUCCESS_PROB = 0.5
        self.mod.MAX_JOB_COST_USD = 50.0
        self.mod.WEEKLY_SPEND_CAP_USD = 150.0

    def tearDown(self):
        self.tmp.cleanup()

    def _run(self) -> tuple[int, dict]:
        stdout = io.StringIO()
        with patch('sys.stdout', stdout):
            code = self.mod.run()
        return code, json.loads(stdout.getvalue().strip())

    def test_blocks_when_allowlist_missing(self):
        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), False)
        self.assertEqual(summary.get('status'), 'blocked')
        self.assertEqual(summary.get('reason'), 'allowlist_missing')

    def test_check_only_mode_evaluates_endpoints_without_execution(self):
        self.mod.CHECK_ONLY = True
        self.mod.ALLOWLIST_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.ALLOWLIST_PATH.write_text(
            json.dumps(
                [
                    {
                        'id': 'e-1',
                        'url': 'https://example.com/paid',
                        'method': 'GET',
                        'expectedPayoutUsd': 0.05,
                        'successProbability': 0.9,
                    }
                ]
            ),
            encoding='utf-8',
        )

        def fake_run(_args, capture_output, text, timeout, check):
            self.assertTrue(capture_output)
            self.assertTrue(text)
            self.assertFalse(check)
            payload = {
                'success': True,
                'data': {
                    'results': [
                        {
                            'method': 'GET',
                            'requiresPayment': True,
                            'paymentOptions': [{'price': 0.01}],
                        }
                    ]
                },
            }
            return _Proc(0, json.dumps(payload))

        with patch.object(self.mod.subprocess, 'run', side_effect=fake_run):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), True)
        self.assertEqual(summary.get('status'), 'ok')
        self.assertEqual(summary.get('checkOnly'), True)
        self.assertEqual(summary.get('eligible'), 1)
        self.assertEqual(summary.get('executed'), 0)
        self.assertEqual(summary.get('recordsAppended'), 0)

    def test_executes_fetch_and_appends_revenue_ledger(self):
        self.mod.ALLOWLIST_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.ALLOWLIST_PATH.write_text(
            json.dumps(
                [
                    {
                        'id': 'e-2',
                        'url': 'https://example.com/paid',
                        'method': 'POST',
                        'expectedPayoutUsd': 0.08,
                        'successProbability': 0.95,
                        'requestBody': {'q': 'value'},
                    }
                ]
            ),
            encoding='utf-8',
        )

        def fake_run(args, capture_output, text, timeout, check):
            self.assertTrue(capture_output)
            self.assertTrue(text)
            self.assertFalse(check)
            if 'check' in args:
                return _Proc(
                    0,
                    json.dumps(
                        {
                            'success': True,
                            'data': {
                                'results': [
                                    {
                                        'method': 'POST',
                                        'requiresPayment': True,
                                        'paymentOptions': [{'price': 0.02}],
                                    }
                                ]
                            },
                        }
                    ),
                )
            return _Proc(
                0,
                json.dumps(
                    {
                        'success': True,
                        'data': {
                            'paymentRef': 'sig-123',
                            'revenueUsd': 0.08,
                        },
                    }
                ),
            )

        with patch.object(self.mod.subprocess, 'run', side_effect=fake_run):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), True)
        self.assertEqual(summary.get('executed'), 1)
        self.assertEqual(summary.get('successfulPaidCalls'), 1)
        self.assertEqual(summary.get('recordsAppended'), 1)

        lines = [line.strip() for line in self.mod.LEDGER_PATH.read_text(encoding='utf-8').splitlines() if line.strip()]
        self.assertEqual(len(lines), 1)
        row = json.loads(lines[0])
        self.assertEqual(row.get('source'), 'x402')
        self.assertEqual(row.get('kind'), 'paid_call')
        self.assertEqual(row.get('status'), 'success')
        self.assertAlmostEqual(float(row.get('grossUsd')), 0.08, places=6)
        self.assertAlmostEqual(float(row.get('costUsd')), 0.02, places=6)
        self.assertAlmostEqual(float(row.get('netUsd')), 0.06, places=6)
        self.assertEqual(row.get('paymentRef'), 'sig-123')


if __name__ == '__main__':
    unittest.main()
