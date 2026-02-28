import importlib.util
import io
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch


SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'kyoshin-operator-log.py'


def load_module():
    spec = importlib.util.spec_from_file_location('kyoshin_operator_log', SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError('failed to load kyoshin-operator-log.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class KyoshinOperatorLogTests(unittest.TestCase):
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
        self.mod.STATE_PATH = self.state_dir / 'operator-log-state.json'
        self.mod.OUTPUT_PATH = self.state_dir / 'operator-log.json'
        self.mod.LOG_PATH = self.log_dir / 'operator-log.jsonl'
        self.mod.LEDGER_PATH = self.receipts_dir / 'revenue-ledger.jsonl'
        self.mod.STAKING_RECEIPTS_PATH = self.receipts_dir / 'clawmart-staking-route.jsonl'
        self.mod.REVENUE_GUARD_PATH = self.state_dir / 'revenue-guard.json'
        self.mod.CLAWMART_MONITOR_PATH = self.state_dir / 'clawmart-monitor.json'
        self.mod.X402_AGENTCASH_PATH = self.state_dir / 'x402-agentcash.json'
        self.mod.DISPATCH_SUMMARY_PATH = self.state_dir / 'distribution-engine.json'

    def tearDown(self):
        self.tmp.cleanup()

    def _write_json(self, path: Path, payload: dict) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload), encoding='utf-8')

    def _append_jsonl(self, path: Path, rows: list[dict]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open('a', encoding='utf-8') as handle:
            for row in rows:
                handle.write(json.dumps(row, ensure_ascii=True) + '\n')

    def _iso(self, hours_ago: int = 0, days_ago: int = 0) -> str:
        return (datetime.now(timezone.utc) - timedelta(hours=hours_ago, days=days_ago)).isoformat()

    def _run(self, argv: list[str] | None = None) -> tuple[int, dict]:
        args = argv or ['kyoshin-operator-log.py']
        stdout = io.StringIO()
        with patch.object(sys, 'argv', args):
            with patch('sys.stdout', stdout):
                code = self.mod.run()
        return code, json.loads(stdout.getvalue().strip())

    def test_writes_daily_summary_and_metrics(self):
        self._append_jsonl(
            self.mod.LEDGER_PATH,
            [
                {
                    'at': self._iso(hours_ago=2),
                    'source': 'clawmart',
                    'kind': 'paid_order',
                    'status': 'success',
                    'grossUsd': 120,
                    'costUsd': 10,
                    'netUsd': 110,
                },
                {
                    'at': self._iso(hours_ago=1),
                    'source': 'x402',
                    'kind': 'paid_call',
                    'status': 'success',
                    'grossUsd': 30,
                    'costUsd': 6,
                    'netUsd': 24,
                },
            ],
        )
        self._append_jsonl(
            self.mod.STAKING_RECEIPTS_PATH,
            [
                {
                    'at': self._iso(hours_ago=1),
                    'source': 'clawmart',
                    'clawMartTotalSalesRouted': 3,
                    'routedSol': 0.3,
                }
            ],
        )
        self._write_json(self.mod.REVENUE_GUARD_PATH, {'ok': True, 'reasons': []})
        self._write_json(self.mod.CLAWMART_MONITOR_PATH, {'ok': True, 'unroutedSalesCount': 0})
        self._write_json(self.mod.DISPATCH_SUMMARY_PATH, {'dispatchSuccessRate': 0.8})

        code, summary = self._run(['kyoshin-operator-log.py', '--status', 'ok', '--cycle', '42'])
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('published'), True)
        self.assertAlmostEqual(float(summary.get('revenueGrossUsd7d')), 150.0, places=6)
        self.assertAlmostEqual(float(summary.get('revenueCostUsd7d')), 16.0, places=6)
        self.assertAlmostEqual(float(summary.get('revenueNetUsd7d')), 134.0, places=6)
        self.assertEqual(summary.get('paidOrders7d'), 1)
        self.assertEqual(summary.get('x402PaidCalls7d'), 1)
        self.assertEqual(summary.get('stakingRoutedSalesCheckpoint'), 3)
        self.assertAlmostEqual(float(summary.get('distributionDispatchSuccessRate')), 0.8, places=6)

        lines = [line.strip() for line in self.mod.LOG_PATH.read_text(encoding='utf-8').splitlines() if line.strip()]
        self.assertEqual(len(lines), 1)

    def test_does_not_publish_twice_same_day_unless_forced(self):
        self._write_json(self.mod.REVENUE_GUARD_PATH, {'ok': True, 'reasons': []})
        self._write_json(self.mod.CLAWMART_MONITOR_PATH, {'ok': True, 'unroutedSalesCount': 0})

        code1, summary1 = self._run(['kyoshin-operator-log.py', '--status', 'ok', '--cycle', '1'])
        self.assertEqual(code1, 0)
        self.assertEqual(summary1.get('published'), True)

        code2, summary2 = self._run(['kyoshin-operator-log.py', '--status', 'ok', '--cycle', '2'])
        self.assertEqual(code2, 0)
        self.assertEqual(summary2.get('published'), False)

        code3, summary3 = self._run(['kyoshin-operator-log.py', '--status', 'ok', '--cycle', '3', '--force'])
        self.assertEqual(code3, 0)
        self.assertEqual(summary3.get('published'), True)

        lines = [line.strip() for line in self.mod.LOG_PATH.read_text(encoding='utf-8').splitlines() if line.strip()]
        self.assertEqual(len(lines), 2)

    def test_carries_blockers_from_guard_and_monitor(self):
        self._write_json(self.mod.REVENUE_GUARD_PATH, {'ok': False, 'reasons': ['weekly_spend_cap_exceeded']})
        self._write_json(self.mod.CLAWMART_MONITOR_PATH, {'ok': False, 'stakingRouteCompliant': False, 'unroutedSalesCount': 2})
        self._write_json(self.mod.X402_AGENTCASH_PATH, {'status': 'blocked', 'reason': 'no_executed_calls'})

        code, summary = self._run(['kyoshin-operator-log.py', '--status', 'degraded', '--cycle', '8'])
        self.assertEqual(code, 0)
        blockers = summary.get('blockers') or []
        self.assertIn('weekly_spend_cap_exceeded', blockers)
        self.assertIn('staking_route_non_compliant', blockers)
        self.assertIn('no_executed_calls', blockers)


if __name__ == '__main__':
    unittest.main()
