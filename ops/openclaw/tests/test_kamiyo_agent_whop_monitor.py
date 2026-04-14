import importlib.util
import io
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch


SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'kamiyo-agent-whop-monitor.py'


def load_module():
    spec = importlib.util.spec_from_file_location('kamiyo_agent_whop_monitor', SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError('failed to load kamiyo-agent-whop-monitor.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class KamiyoAgentWhopMonitorTests(unittest.TestCase):
    def setUp(self):
        self.mod = load_module()
        self.tmp = TemporaryDirectory()
        self.workspace = Path(self.tmp.name) / 'workspace'
        self.runtime = self.workspace / 'runtime'
        self.state_dir = self.runtime / 'state'
        self.receipts_dir = self.runtime / 'receipts'
        self.log_dir = self.runtime / 'logs'

        self.mod.WORKSPACE = self.workspace
        self.mod.RUNTIME_DIR = self.runtime
        self.mod.STATE_DIR = self.state_dir
        self.mod.RECEIPTS_DIR = self.receipts_dir
        self.mod.LOG_DIR = self.log_dir
        self.mod.STATE_PATH = self.state_dir / 'whop-monitor-state.json'
        self.mod.OUTPUT_PATH = self.state_dir / 'whop-monitor.json'
        self.mod.LOG_PATH = self.log_dir / 'whop-monitor.jsonl'
        self.mod.LEDGER_PATH = self.receipts_dir / 'revenue-ledger.jsonl'

        self.mod.ENABLE_WHOP_MONITOR = True
        self.mod.API_KEY = 'whop-key'
        self.mod.COMPANY_ID = 'company-1'
        self.mod.SETTLEMENT_LAG_HOURS = 24

    def tearDown(self):
        self.tmp.cleanup()

    def _run(self) -> tuple[int, dict]:
        stdout = io.StringIO()
        with patch('sys.stdout', stdout):
            code = self.mod.run()
        return code, json.loads(stdout.getvalue().strip())

    def _ledger_rows(self) -> list[dict]:
        if not self.mod.LEDGER_PATH.exists():
            return []
        return [
            json.loads(line)
            for line in self.mod.LEDGER_PATH.read_text(encoding='utf-8').splitlines()
            if line.strip()
        ]

    def test_blocks_when_credentials_missing(self):
        self.mod.API_KEY = ''
        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'blocked')
        self.assertEqual(summary.get('reason'), 'missing_whop_api_key')

    def test_appends_paid_order_once_with_idempotency(self):
        paid_at = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
        payment = {
            'id': 'pay_1',
            'status': 'paid',
            'amount': 120,
            'amount_after_fees': 100,
            'refunded_amount': 0,
            'paid_at': paid_at,
            'product_id': 'prod_1',
            'plan_id': 'plan_1',
        }
        with patch.object(self.mod, 'fetch_payments', return_value=[payment]):
            code1, summary1 = self._run()
        self.assertEqual(code1, 0)
        self.assertEqual(summary1.get('ok'), True)
        self.assertEqual(summary1.get('ledgerRowsAppended'), 1)
        rows1 = self._ledger_rows()
        self.assertEqual(len(rows1), 1)
        self.assertEqual(rows1[0].get('source'), 'whop')
        self.assertEqual(rows1[0].get('kind'), 'paid_order')
        self.assertEqual(rows1[0].get('realized'), True)

        with patch.object(self.mod, 'fetch_payments', return_value=[payment]):
            code2, summary2 = self._run()
        self.assertEqual(code2, 0)
        self.assertEqual(summary2.get('ledgerRowsAppended'), 0)
        rows2 = self._ledger_rows()
        self.assertEqual(len(rows2), 1)

    def test_appends_refund_adjustment_delta(self):
        paid_at = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
        first = {
            'id': 'pay_2',
            'status': 'paid',
            'amount': 100,
            'amount_after_fees': 90,
            'refunded_amount': 0,
            'paid_at': paid_at,
        }
        second = {
            'id': 'pay_2',
            'status': 'partially_refunded',
            'amount': 100,
            'amount_after_fees': 90,
            'refunded_amount': 25,
            'paid_at': paid_at,
        }
        with patch.object(self.mod, 'fetch_payments', return_value=[first]):
            code1, _ = self._run()
        self.assertEqual(code1, 0)

        with patch.object(self.mod, 'fetch_payments', return_value=[second]):
            code2, summary2 = self._run()
        self.assertEqual(code2, 0)
        self.assertEqual(summary2.get('ledgerRowsAppended'), 1)
        rows = self._ledger_rows()
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[-1].get('kind'), 'refund_adjustment')
        self.assertAlmostEqual(float(rows[-1].get('netUsd')), -25.0, places=6)


if __name__ == '__main__':
    unittest.main()
