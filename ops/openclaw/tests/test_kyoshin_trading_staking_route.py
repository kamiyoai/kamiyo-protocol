import importlib.util
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch


SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'kyoshin-trading-staking-route.py'


def load_module():
    spec = importlib.util.spec_from_file_location('kyoshin_trading_staking_route', SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError('failed to load kyoshin-trading-staking-route.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class KyoshinTradingStakingRouteTests(unittest.TestCase):
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

        self.mod.STATE_PATH = self.state_dir / 'trading-route-state.json'
        self.mod.OUTPUT_PATH = self.state_dir / 'trading-route.json'
        self.mod.LOG_PATH = self.log_dir / 'trading-route.jsonl'
        self.mod.RECEIPTS_PATH = self.receipts_dir / 'trading-staking-route.jsonl'
        self.mod.LEDGER_PATH = self.receipts_dir / 'revenue-ledger.jsonl'

        self.mod.ENABLE_TRADING_AGENT = True
        self.mod.ROUTE_BPS = 5000
        self.mod.ROUTE_MIN_SOL = 0.000001
        self.mod.SOL_PRICE_USD = 100.0
        self.mod.STAKING_POOL_URL = 'https://example.com/staking/pool123'
        self.mod.ROUTE_CMD = ''
        self.mod.DRY_RUN = True
        self.mod.KEYPAIR_PATH = ''
        self.mod.RPC_URL = ''

    def tearDown(self):
        self.tmp.cleanup()

    def _run(self) -> tuple[int, dict]:
        stdout = io.StringIO()
        with patch('sys.stdout', stdout):
            code = self.mod.run()
        return code, json.loads(stdout.getvalue().strip())

    def _append_ledger_rows(self, rows: list[dict]) -> None:
        self.mod.LEDGER_PATH.parent.mkdir(parents=True, exist_ok=True)
        with self.mod.LEDGER_PATH.open('a', encoding='utf-8') as handle:
            for row in rows:
                handle.write(json.dumps(row, ensure_ascii=True) + '\n')

    def test_disabled_status_when_trading_agent_disabled(self):
        self.mod.ENABLE_TRADING_AGENT = False
        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), True)
        self.assertEqual(summary.get('status'), 'disabled')

    def test_up_to_date_when_no_new_profit(self):
        self.mod.STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.STATE_PATH.write_text(json.dumps({'processedProfitUsd': 50}), encoding='utf-8')
        self._append_ledger_rows(
            [
                {
                    'id': 'close-1',
                    'source': 'trading',
                    'venue': 'dflow',
                    'kind': 'trade_close',
                    'status': 'success',
                    'realized': True,
                    'netUsd': 50,
                    'at': '2026-02-01T00:00:00Z',
                }
            ]
        )
        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), True)
        self.assertEqual(summary.get('status'), 'up_to_date')

    def test_routes_delta_profit_and_appends_receipts(self):
        self._append_ledger_rows(
            [
                {
                    'id': 'close-1',
                    'source': 'trading',
                    'venue': 'dflow',
                    'kind': 'trade_close',
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

        receipt_rows = [
            json.loads(line)
            for line in self.mod.RECEIPTS_PATH.read_text(encoding='utf-8').splitlines()
            if line.strip()
        ]
        self.assertEqual(len(receipt_rows), 1)
        self.assertEqual(receipt_rows[0].get('source'), 'trading')
        self.assertEqual(receipt_rows[0].get('venue'), 'dflow')

        ledger_rows = [
            json.loads(line)
            for line in self.mod.LEDGER_PATH.read_text(encoding='utf-8').splitlines()
            if line.strip()
        ]
        route_rows = [row for row in ledger_rows if row.get('kind') == 'route' and row.get('source') == 'trading']
        self.assertEqual(len(route_rows), 1)


if __name__ == '__main__':
    unittest.main()
