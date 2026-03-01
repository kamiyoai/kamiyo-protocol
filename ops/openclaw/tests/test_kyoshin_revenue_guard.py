import importlib.util
import io
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch


SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'kyoshin-revenue-guard.py'


def load_module():
    spec = importlib.util.spec_from_file_location('kyoshin_revenue_guard', SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError('failed to load kyoshin-revenue-guard.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class KyoshinRevenueGuardTests(unittest.TestCase):
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

        self.mod.STATE_PATH = self.state_dir / 'revenue-guard-state.json'
        self.mod.OUTPUT_PATH = self.state_dir / 'revenue-guard.json'
        self.mod.LOG_PATH = self.log_dir / 'revenue-guard.jsonl'
        self.mod.CLAWMART_MONITOR_PATH = self.state_dir / 'clawmart-monitor.json'
        self.mod.LEDGER_PATH = self.receipts_dir / 'revenue-ledger.jsonl'
        self.mod.TRADING_EXEC_PATH = self.state_dir / 'trading-exec.json'
        self.mod.TRADING_ROUTE_PATH = self.state_dir / 'trading-route.json'

        self.mod.ENABLE_REVENUE_GUARD = True
        self.mod.ENABLE_CLAWMART_MONITOR = True
        self.mod.ENABLE_X402_AGENTCASH = True
        self.mod.ENABLE_TRADING_AGENT = False
        self.mod.REQUIRE_TRADING_AGENT = False
        self.mod.REQUIRE_CLAWMART_STAKING_ROUTE = True
        self.mod.WEEKLY_SPEND_CAP_USD = 150.0
        self.mod.X402_ACTIVITY_LOOKBACK_HOURS = 72
        self.mod.X402_ACTIVITY_GRACE_HOURS = 72
        self.mod.TRADING_ROUTE_LAG_TOLERANCE_USD = 1.0

    def tearDown(self):
        self.tmp.cleanup()

    def _run(self, env: dict[str, str] | None = None) -> tuple[int, dict]:
        stdout = io.StringIO()
        patch_env = env or {}
        with patch.dict(self.mod.os.environ, patch_env, clear=False):
            with patch('sys.stdout', stdout):
                code = self.mod.run()
        return code, json.loads(stdout.getvalue().strip())

    def _append_ledger(self, rows: list[dict]) -> None:
        self.mod.LEDGER_PATH.parent.mkdir(parents=True, exist_ok=True)
        with self.mod.LEDGER_PATH.open('a', encoding='utf-8') as handle:
            for row in rows:
                handle.write(json.dumps(row, ensure_ascii=True) + '\n')

    def _iso(self, days_ago: int = 0, hours_ago: int = 0) -> str:
        ts = datetime.now(timezone.utc) - timedelta(days=days_ago, hours=hours_ago)
        return ts.isoformat()

    def test_disabled_returns_disabled(self):
        self.mod.ENABLE_REVENUE_GUARD = False
        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), True)
        self.assertEqual(summary.get('status'), 'disabled')

    def test_blocks_when_weekly_spend_cap_exceeded(self):
        self.mod.ENABLE_CLAWMART_MONITOR = False
        self.mod.ENABLE_X402_AGENTCASH = False
        self._append_ledger(
            [
                {'at': self._iso(hours_ago=2), 'costUsd': 120, 'source': 'x402', 'kind': 'paid_call', 'status': 'success'},
                {'at': self._iso(hours_ago=1), 'costUsd': 40, 'source': 'x402', 'kind': 'paid_call', 'status': 'success'},
            ]
        )
        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), False)
        self.assertIn('weekly_spend_cap_exceeded', summary.get('reasons', []))
        self.assertEqual(summary.get('blockPaidExecution'), True)
        self.assertAlmostEqual(float(summary.get('weeklySpendUsd7d')), 160.0, places=6)

    def test_blocks_when_clawmart_api_key_missing(self):
        self.mod.ENABLE_X402_AGENTCASH = False
        self._append_ledger([])
        code, summary = self._run({'CLAWMART_API_KEY': ''})
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), False)
        self.assertIn('missing_clawmart_api_key', summary.get('reasons', []))
        self.assertEqual(summary.get('blockPaidExecution'), False)

    def test_blocks_when_unrouted_sales_present(self):
        self.mod.ENABLE_X402_AGENTCASH = False
        self.mod.CLAWMART_MONITOR_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.CLAWMART_MONITOR_PATH.write_text(
            json.dumps({'ok': False, 'unroutedSalesCount': 2}),
            encoding='utf-8',
        )
        code, summary = self._run({'CLAWMART_API_KEY': 'test-key'})
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), False)
        self.assertIn('unrouted_clawmart_sales', summary.get('reasons', []))

    def test_blocks_when_x402_has_zero_paid_calls_after_grace(self):
        self.mod.ENABLE_CLAWMART_MONITOR = False
        self.mod.X402_ACTIVITY_GRACE_HOURS = 1
        old_seen = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        self.mod.STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.STATE_PATH.write_text(json.dumps({'x402FirstSeenAt': old_seen}), encoding='utf-8')
        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), False)
        self.assertIn('x402_zero_paid_calls_lookback', summary.get('reasons', []))

    def test_passes_when_conditions_are_healthy(self):
        self.mod.CLAWMART_MONITOR_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.CLAWMART_MONITOR_PATH.write_text(
            json.dumps({'ok': True, 'unroutedSalesCount': 0}),
            encoding='utf-8',
        )
        self._append_ledger(
            [
                {'at': self._iso(hours_ago=12), 'costUsd': 20, 'source': 'x402', 'kind': 'paid_call', 'status': 'success'},
            ]
        )
        code, summary = self._run({'CLAWMART_API_KEY': 'test-key'})
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), True)
        self.assertEqual(summary.get('status'), 'ok')
        self.assertEqual(summary.get('reasons'), [])

    def test_blocks_when_trading_live_key_missing(self):
        self.mod.ENABLE_CLAWMART_MONITOR = False
        self.mod.ENABLE_X402_AGENTCASH = False
        self.mod.ENABLE_TRADING_AGENT = True
        self.mod.REQUIRE_TRADING_AGENT = True
        self.mod.TRADING_EXEC_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.TRADING_EXEC_PATH.write_text(
            json.dumps({'ok': True, 'status': 'ok', 'drawdownBreakerExceeded': False, 'weeklyLossCapExceeded': False}),
            encoding='utf-8',
        )
        self.mod.TRADING_ROUTE_PATH.write_text(
            json.dumps({'ok': True, 'status': 'up_to_date', 'unroutedProfitUsd': 0}),
            encoding='utf-8',
        )
        code, summary = self._run(
            {
                'KYO_TRADING_EXECUTION_MODE': 'live',
                'KYO_TRADING_DFLOW_API_KEY': '',
                'KYO_TRADING_DFLOW_EXEC_CMD': '',
            }
        )
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), False)
        self.assertIn('missing_dflow_api_key', summary.get('reasons', []))
        self.assertEqual(summary.get('blockPaidExecution'), True)

    def test_blocks_when_trading_route_checkpoint_lags(self):
        self.mod.ENABLE_CLAWMART_MONITOR = False
        self.mod.ENABLE_X402_AGENTCASH = False
        self.mod.ENABLE_TRADING_AGENT = True
        self.mod.REQUIRE_TRADING_AGENT = True
        self.mod.TRADING_ROUTE_LAG_TOLERANCE_USD = 1.0
        self.mod.TRADING_EXEC_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.TRADING_EXEC_PATH.write_text(
            json.dumps({'ok': True, 'status': 'ok', 'drawdownBreakerExceeded': False, 'weeklyLossCapExceeded': False}),
            encoding='utf-8',
        )
        self.mod.TRADING_ROUTE_PATH.write_text(
            json.dumps({'ok': True, 'status': 'blocked', 'unroutedProfitUsd': 25}),
            encoding='utf-8',
        )
        code, summary = self._run({'KYO_TRADING_EXECUTION_MODE': 'paper'})
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), False)
        self.assertIn('trading_route_checkpoint_lag', summary.get('reasons', []))


if __name__ == '__main__':
    unittest.main()
