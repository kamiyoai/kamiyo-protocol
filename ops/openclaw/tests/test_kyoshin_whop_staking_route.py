import importlib.util
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch


SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'kyoshin-whop-staking-route.py'


def load_module():
    spec = importlib.util.spec_from_file_location('kyoshin_whop_staking_route', SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError('failed to load kyoshin-whop-staking-route.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class KyoshinWhopStakingRouteTests(unittest.TestCase):
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

        self.mod.STATE_PATH = self.state_dir / 'whop-staking-route-state.json'
        self.mod.OUTPUT_PATH = self.state_dir / 'whop-staking-route.json'
        self.mod.LOG_PATH = self.log_dir / 'whop-staking-route.jsonl'
        self.mod.RECEIPTS_PATH = self.receipts_dir / 'whop-staking-route.jsonl'
        self.mod.LEDGER_PATH = self.receipts_dir / 'revenue-ledger.jsonl'

        self.mod.ENABLE_WHOP_MONITOR = True
        self.mod.STAKING_POOL_URL = 'https://example.com/staking/pool123'
        self.mod.ROUTE_BPS = 5000
        self.mod.ROUTE_MIN_SOL = 0.000001
        self.mod.SOL_PRICE_USD = 100.0
        self.mod.ROUTE_CMD = ''
        self.mod.DRY_RUN = True
        self.mod.KEYPAIR_PATH = ''
        self.mod.RPC_URL = ''
        self.mod.ROUTE_TOLERANCE_USD = 0.0

    def tearDown(self):
        self.tmp.cleanup()

    def _run(self) -> tuple[int, dict]:
        stdout = io.StringIO()
        with patch('sys.stdout', stdout):
            code = self.mod.run()
        return code, json.loads(stdout.getvalue().strip())

    def _append_ledger(self, rows: list[dict]) -> None:
        self.mod.LEDGER_PATH.parent.mkdir(parents=True, exist_ok=True)
        with self.mod.LEDGER_PATH.open('a', encoding='utf-8') as handle:
            for row in rows:
                handle.write(json.dumps(row, ensure_ascii=True) + '\n')

    def test_disabled_when_whop_monitor_disabled(self):
        self.mod.ENABLE_WHOP_MONITOR = False
        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'disabled')

    def test_up_to_date_when_no_new_realized_net(self):
        self.mod.STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.STATE_PATH.write_text(json.dumps({'processedRealizedNetUsd': 75}), encoding='utf-8')
        self._append_ledger(
            [
                {
                    'id': 'whop-1',
                    'source': 'whop',
                    'kind': 'paid_order',
                    'status': 'success',
                    'realized': True,
                    'netUsd': 75,
                    'at': '2026-02-01T00:00:00Z',
                }
            ]
        )
        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'up_to_date')
        self.assertEqual(summary.get('unroutedNetUsd'), 0.0)

    def test_routes_fifty_percent_of_unrouted_realized_net(self):
        self._append_ledger(
            [
                {
                    'id': 'whop-2',
                    'source': 'whop',
                    'kind': 'paid_order',
                    'status': 'success',
                    'realized': True,
                    'netUsd': 100,
                    'at': '2026-02-01T00:00:00Z',
                }
            ]
        )

        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), True)
        self.assertEqual(summary.get('status'), 'routed')
        self.assertAlmostEqual(float(summary.get('routeUsd')), 50.0, places=6)
        self.assertAlmostEqual(float(summary.get('routeSol')), 0.5, places=6)

        receipts = [
            json.loads(line)
            for line in self.mod.RECEIPTS_PATH.read_text(encoding='utf-8').splitlines()
            if line.strip()
        ]
        self.assertEqual(len(receipts), 1)
        self.assertEqual(receipts[0].get('source'), 'whop')
        self.assertEqual(receipts[0].get('kind'), 'route')

        ledger_rows = [
            json.loads(line)
            for line in self.mod.LEDGER_PATH.read_text(encoding='utf-8').splitlines()
            if line.strip()
        ]
        route_rows = [row for row in ledger_rows if row.get('source') == 'whop' and row.get('kind') == 'route']
        self.assertEqual(len(route_rows), 1)

    def test_up_to_date_when_delta_is_within_tolerance(self):
        self.mod.ROUTE_TOLERANCE_USD = 2.0
        self.mod.STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.STATE_PATH.write_text(json.dumps({'processedRealizedNetUsd': 99}), encoding='utf-8')
        self._append_ledger(
            [
                {
                    'id': 'whop-3',
                    'source': 'whop',
                    'kind': 'paid_order',
                    'status': 'success',
                    'realized': True,
                    'netUsd': 100,
                    'at': '2026-02-01T00:00:00Z',
                }
            ]
        )

        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'up_to_date')
        self.assertEqual(summary.get('reason'), 'within_tolerance')
        self.assertAlmostEqual(float(summary.get('unroutedNetUsd')), 1.0, places=6)
        self.assertFalse(self.mod.RECEIPTS_PATH.exists())


if __name__ == '__main__':
    unittest.main()
