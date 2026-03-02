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
        self.mod.ROUTE_RECEIPTS_PATH = self.receipts_dir / 'trading-staking-route.jsonl'
        self.mod.LEDGER_PATH = self.receipts_dir / 'revenue-ledger.jsonl'

        self.mod.ENABLE_TRADING_AGENT = True
        self.mod.ROUTE_BPS = 5000
        self.mod.ROUTE_MIN_SOL = 0.000001
        self.mod.SOL_PRICE_USD = 100.0
        self.mod.ROUTE_TOLERANCE_USD = 0.1
        self.mod.DRY_RUN = True
        self.mod.ROUTE_CMD = ''

    def tearDown(self):
        self.tmp.cleanup()

    def _append_ledger(self, rows: list[dict]) -> None:
        self.mod.LEDGER_PATH.parent.mkdir(parents=True, exist_ok=True)
        with self.mod.LEDGER_PATH.open('a', encoding='utf-8') as handle:
            for row in rows:
                handle.write(json.dumps(row, ensure_ascii=True) + '\n')

    def _run(self) -> tuple[int, dict]:
        stdout = io.StringIO()
        with patch('sys.stdout', stdout):
            code = self.mod.run()
        return code, json.loads(stdout.getvalue().strip())

    def test_routes_50_percent_of_unrouted_positive_realized_net(self):
        self._append_ledger(
            [
                {
                    'id': 'close-1',
                    'at': '2026-03-01T10:00:00+00:00',
                    'source': 'trading',
                    'kind': 'trade_close',
                    'status': 'success',
                    'realized': True,
                    'netUsd': 20.0,
                },
                {
                    'id': 'close-2',
                    'at': '2026-03-01T11:00:00+00:00',
                    'source': 'trading',
                    'kind': 'trade_close',
                    'status': 'success',
                    'realized': True,
                    'netUsd': -2.0,
                },
            ]
        )

        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), True)
        self.assertEqual(summary.get('status'), 'routed')
        self.assertAlmostEqual(float(summary.get('realizedNetUsdTotal')), 20.0, places=6)
        self.assertAlmostEqual(float(summary.get('routeUsd')), 10.0, places=6)
        self.assertAlmostEqual(float(summary.get('routeSol')), 0.1, places=6)

        receipt_rows = [json.loads(line) for line in self.mod.ROUTE_RECEIPTS_PATH.read_text(encoding='utf-8').splitlines() if line.strip()]
        self.assertEqual(len(receipt_rows), 1)
        self.assertEqual(receipt_rows[0].get('source'), 'trading')

    def test_no_route_when_no_positive_realized_net(self):
        self._append_ledger(
            [
                {
                    'id': 'close-3',
                    'at': '2026-03-01T12:00:00+00:00',
                    'source': 'trading',
                    'kind': 'trade_close',
                    'status': 'success',
                    'realized': True,
                    'netUsd': -5.0,
                }
            ]
        )
        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'up_to_date')
        self.assertEqual(float(summary.get('realizedNetUsdTotal')), 0.0)


if __name__ == '__main__':
    unittest.main()
