import importlib.util
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch


SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'kamiyo-agent-creator-fee-inflow-route.py'


def load_module():
    spec = importlib.util.spec_from_file_location('kamiyo_agent_creator_fee_inflow_route', SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError('failed to load kamiyo-agent-creator-fee-inflow-route.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class KamiyoAgentCreatorFeeInflowRouteTests(unittest.TestCase):
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
        self.mod.STATE_PATH = self.state_dir / 'creator-fee-inflow-route-state.json'
        self.mod.OUTPUT_PATH = self.state_dir / 'creator-fee-inflow-route.json'
        self.mod.LOG_PATH = self.log_dir / 'creator-fee-inflow-route.jsonl'
        self.mod.RECEIPTS_PATH = self.receipts_dir / 'creator-fee-inflow-route.jsonl'

        self.mod.ENABLE_ROUTE = True
        self.mod.WATCH_WALLET = 'Gxa8pZeSMGrNGTGLLyrPsqHgr6cUhBQrs7TEBhBSocYx'
        self.mod.STAKING_POOL_URL = 'https://example.com/staking/pool123'
        self.mod.ROUTE_BPS = 5000
        self.mod.MIN_TRANSFER_SOL = 0.000001
        self.mod.DRY_RUN = True
        self.mod.ROUTE_CMD = ''
        self.mod.KEYPAIR_PATH = ''
        self.mod.RPC_URL = 'https://rpc.example.com'

    def tearDown(self):
        self.tmp.cleanup()

    def _run(self) -> tuple[int, dict]:
        stdout = io.StringIO()
        with patch('sys.stdout', stdout):
            code = self.mod.run()
        return code, json.loads(stdout.getvalue().strip())

    def test_initializes_baseline_from_first_observation(self):
        with patch.object(self.mod, 'read_balance_sol', return_value=1.25):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'initialized')
        self.assertAlmostEqual(float(summary.get('baselineBalanceSol')), 1.25, places=9)
        self.assertAlmostEqual(float(summary.get('positiveDeltaSol')), 0.0, places=9)

        state = json.loads(self.mod.STATE_PATH.read_text(encoding='utf-8'))
        self.assertAlmostEqual(float(state.get('baselineBalanceSol')), 1.25, places=9)
        self.assertAlmostEqual(float(state.get('pendingPositiveDeltaSol')), 0.0, places=9)

    def test_routes_half_of_positive_inflow(self):
        self.mod.STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.STATE_PATH.write_text(json.dumps({'baselineBalanceSol': 1.0}), encoding='utf-8')

        with (
            patch.object(self.mod, 'read_balance_sol', side_effect=[1.4, 1.199995]),
            patch.object(self.mod, 'latest_pool_route_snapshot', return_value={}),
        ):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'routed')
        self.assertAlmostEqual(float(summary.get('positiveDeltaSol')), 0.4, places=9)
        self.assertAlmostEqual(float(summary.get('routeSol')), 0.2, places=9)
        self.assertEqual(summary.get('routeMethod'), 'staking_period_deposit_dry_run')

        state = json.loads(self.mod.STATE_PATH.read_text(encoding='utf-8'))
        self.assertAlmostEqual(float(state.get('baselineBalanceSol')), 1.199995, places=9)

        rows = [json.loads(line) for line in self.mod.RECEIPTS_PATH.read_text(encoding='utf-8').splitlines() if line.strip()]
        self.assertEqual(len(rows), 1)
        self.assertAlmostEqual(float(rows[0].get('routedSol')), 0.2, places=9)
        self.assertEqual(rows[0].get('sourceWallet'), self.mod.WATCH_WALLET)

    def test_partial_route_keeps_unrouted_remainder_pending(self):
        self.mod.ROUTE_CMD = 'custom-route'
        self.mod.STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.STATE_PATH.write_text(json.dumps({'baselineBalanceSol': 1.0}), encoding='utf-8')

        with (
            patch.object(self.mod, 'read_balance_sol', side_effect=[1.4, 1.3]),
            patch.object(
                self.mod,
                'run_custom_route_command',
                return_value={'txSignature': 'sig-partial', 'routedSol': 0.1, 'method': 'custom_cmd'},
            ),
            patch.object(self.mod, 'latest_pool_route_snapshot', return_value={}),
        ):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'routed')
        self.assertAlmostEqual(float(summary.get('routeSol')), 0.1, places=9)

        state = json.loads(self.mod.STATE_PATH.read_text(encoding='utf-8'))
        self.assertAlmostEqual(float(state.get('baselineBalanceSol')), 1.1, places=9)
        self.assertAlmostEqual(float(state.get('lastObservedBalanceSol')), 1.3, places=9)
        self.assertAlmostEqual(float(state.get('pendingPositiveDeltaSol')), 0.2, places=9)

    def test_blocked_route_keeps_pending_delta(self):
        self.mod.DRY_RUN = False
        self.mod.KEYPAIR_PATH = ''
        self.mod.STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.STATE_PATH.write_text(json.dumps({'baselineBalanceSol': 2.0}), encoding='utf-8')

        with (
            patch.object(self.mod, 'read_balance_sol', return_value=2.3),
            patch.object(self.mod, 'latest_pool_route_snapshot', return_value={}),
        ):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'blocked')
        self.assertEqual(summary.get('reason'), 'missing_keypair_path')
        self.assertAlmostEqual(float(summary.get('positiveDeltaSol')), 0.3, places=9)

        state = json.loads(self.mod.STATE_PATH.read_text(encoding='utf-8'))
        self.assertAlmostEqual(float(state.get('baselineBalanceSol')), 2.0, places=9)
        self.assertAlmostEqual(float(state.get('pendingPositiveDeltaSol')), 0.3, places=9)

    def test_small_delta_stays_pending_until_min_transfer(self):
        self.mod.MIN_TRANSFER_SOL = 0.05
        self.mod.STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.STATE_PATH.write_text(json.dumps({'baselineBalanceSol': 1.0}), encoding='utf-8')

        with (
            patch.object(self.mod, 'read_balance_sol', return_value=1.08),
            patch.object(self.mod, 'latest_pool_route_snapshot', return_value={}),
        ):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'pending')
        self.assertEqual(summary.get('reason'), 'below_min_transfer')
        self.assertAlmostEqual(float(summary.get('positiveDeltaSol')), 0.08, places=9)
        self.assertAlmostEqual(float(summary.get('routeSol')), 0.04, places=9)

        state = json.loads(self.mod.STATE_PATH.read_text(encoding='utf-8'))
        self.assertAlmostEqual(float(state.get('baselineBalanceSol')), 1.0, places=9)
        self.assertAlmostEqual(float(state.get('pendingPositiveDeltaSol')), 0.08, places=9)

    def test_balance_drop_rebases_baseline_down(self):
        self.mod.STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.STATE_PATH.write_text(json.dumps({'baselineBalanceSol': 1.5}), encoding='utf-8')

        with (
            patch.object(self.mod, 'read_balance_sol', return_value=1.1),
            patch.object(self.mod, 'latest_pool_route_snapshot', return_value={}),
        ):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'rebased_down')
        self.assertEqual(summary.get('reason'), 'balance_below_baseline')
        self.assertAlmostEqual(float(summary.get('baselineBalanceSol')), 1.1, places=9)

        state = json.loads(self.mod.STATE_PATH.read_text(encoding='utf-8'))
        self.assertAlmostEqual(float(state.get('baselineBalanceSol')), 1.1, places=9)
        self.assertAlmostEqual(float(state.get('pendingPositiveDeltaSol')), 0.0, places=9)

    def test_reconciles_stale_baseline_from_latest_onchain_pool_route(self):
        self.mod.DRY_RUN = False
        self.mod.KEYPAIR_PATH = '/tmp/treasury.json'
        self.mod.ADMIN_KEYPAIR_PATH = '/tmp/treasury.json'
        self.mod.STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.STATE_PATH.write_text(
            json.dumps(
                {
                    'baselineBalanceSol': 0.031070965,
                    'lastRoutedAt': '2026-04-20T13:09:41+00:00',
                    'lastTxSignature': 'old-route-signature',
                }
            ),
            encoding='utf-8',
        )

        with (
            patch.object(self.mod, 'read_balance_sol', side_effect=[2.745706662, 2.264278413]),
            patch.object(
                self.mod,
                'latest_pool_route_snapshot',
                return_value={
                    'txSignature': 'manual-catchup',
                    'routedAt': '2026-04-21T14:50:11+00:00',
                    'postRouteBalanceSol': 1.782850164,
                },
            ),
            patch.object(
                self.mod,
                'run_staking_period_deposit',
                return_value={
                    'txSignature': 'sig-next',
                    'routedSol': 0.481428249,
                    'method': 'staking_period_deposit',
                },
            ),
            patch.object(
                self.mod,
                'route_authority_status',
                return_value={
                    'ready': True,
                    'mode': 'keypair',
                    'reason': '',
                    'signerPubkey': self.mod.WATCH_WALLET,
                },
            ),
        ):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'routed')
        self.assertTrue(summary.get('baselineReconciledFromChain'))
        self.assertEqual(summary.get('reconciledTxSignature'), 'manual-catchup')
        self.assertAlmostEqual(float(summary.get('positiveDeltaSol')), 0.962856498, places=9)
        self.assertAlmostEqual(float(summary.get('routeSol')), 0.481428249, places=9)

        state = json.loads(self.mod.STATE_PATH.read_text(encoding='utf-8'))
        self.assertAlmostEqual(float(state.get('baselineBalanceSol')), 2.264278413, places=9)
        self.assertEqual(state.get('lastTxSignature'), 'sig-next')
        self.assertEqual(state.get('lastRoutedAt'), summary.get('at'))


if __name__ == '__main__':
    unittest.main()
