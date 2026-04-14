import importlib.util
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch


SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'kamiyo-agent-clawmart-staking-route.py'


def load_module():
    spec = importlib.util.spec_from_file_location('kamiyo_agent_clawmart_staking_route', SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError('failed to load kamiyo-agent-clawmart-staking-route.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class KamiyoAgentClawMartStakingRouteTests(unittest.TestCase):
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

        self.mod.STATE_PATH = self.state_dir / 'clawmart-staking-route-state.json'
        self.mod.OUTPUT_PATH = self.state_dir / 'clawmart-staking-route.json'
        self.mod.LOG_PATH = self.log_dir / 'clawmart-staking-route.jsonl'
        self.mod.RECEIPTS_PATH = self.receipts_dir / 'clawmart-staking-route.jsonl'

        self.mod.API_KEY = 'test-key'
        self.mod.API_BASE_URL = 'https://example.com/api/v1'
        self.mod.KAMIYO_STAKING_POOL_URL = 'https://example.com/staking/pool123'
        self.mod.ENABLE_STAKING_ROUTE = True
        self.mod.DRY_RUN = True
        self.mod.ROUTE_CMD = ''
        self.mod.SOL_PER_SALE = 0.1
        self.mod.MIN_TRANSFER_SOL = 0.000001
        self.mod.SOLANA_KEYPAIR_PATH = ''
        self.mod.SOLANA_RPC_URL = ''

    def tearDown(self):
        self.tmp.cleanup()

    def _run(self) -> tuple[int, dict]:
        stdout = io.StringIO()
        with patch('sys.stdout', stdout):
            code = self.mod.run()
        return code, json.loads(stdout.getvalue().strip())

    def test_up_to_date_when_checkpoint_matches_total_sales(self):
        self.mod.RECEIPTS_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.RECEIPTS_PATH.write_text(
            '{"source":"clawmart","stakingPoolUrl":"https://example.com/staking/pool123","clawMartTotalSalesRouted":4,"txSignature":"sig-1","at":"2026-02-27T00:00:00Z"}\n',
            encoding='utf-8',
        )

        def fake_fetch(path: str) -> dict:
            self.assertEqual(path, '/me')
            return {'data': {'totalSales': 4}}

        with patch.object(self.mod, 'fetch_json', side_effect=fake_fetch):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), True)
        self.assertEqual(summary.get('status'), 'up_to_date')
        self.assertEqual(summary.get('deltaSales'), 0)
        self.assertEqual(summary.get('routeExecuted'), False)

    def test_blocks_when_delta_exists_and_sol_rate_missing(self):
        self.mod.SOL_PER_SALE = 0.0

        def fake_fetch(path: str) -> dict:
            self.assertEqual(path, '/me')
            return {'data': {'totalSales': 2}}

        with patch.object(self.mod, 'fetch_json', side_effect=fake_fetch):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), False)
        self.assertEqual(summary.get('status'), 'blocked')
        self.assertEqual(summary.get('reason'), 'missing_sol_per_sale')
        self.assertEqual(summary.get('deltaSales'), 2)

    def test_routes_delta_with_dry_run_and_appends_receipt(self):
        def fake_fetch(path: str) -> dict:
            self.assertEqual(path, '/me')
            return {'data': {'totalSales': 3}}

        with patch.object(self.mod, 'fetch_json', side_effect=fake_fetch):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), True)
        self.assertEqual(summary.get('status'), 'routed')
        self.assertEqual(summary.get('deltaSales'), 3)
        self.assertAlmostEqual(float(summary.get('routedSol')), 0.3, places=6)
        self.assertTrue(str(summary.get('txSignature') or '').startswith('dry-run-'))

        lines = [line.strip() for line in self.mod.RECEIPTS_PATH.read_text(encoding='utf-8').splitlines() if line.strip()]
        self.assertEqual(len(lines), 1)
        receipt = json.loads(lines[0])
        self.assertEqual(receipt.get('clawMartTotalSalesRouted'), 3)
        self.assertEqual(receipt.get('stakingPoolUrl'), 'https://example.com/staking/pool123')
        self.assertAlmostEqual(float(receipt.get('routedSol')), 0.3, places=6)


if __name__ == '__main__':
    unittest.main()
