import importlib.util
import io
import json
import subprocess
from datetime import datetime, timedelta, timezone
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
        self.mod.ROUTE_EARNINGS_SWEEP_ENABLED = False
        self.mod.ROUTE_EARNINGS_SWEEP_CMD = ''
        self.mod.ROUTE_EARNINGS_SWEEP_MIN_USD = 0.0

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

    def _iso(self, *, minutes_ago: int = 0) -> str:
        return (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).isoformat()

    def test_routes_50_percent_of_unrouted_positive_realized_net(self):
        self._append_ledger(
            [
                {
                    'id': 'close-1',
                    'at': self._iso(minutes_ago=2),
                    'source': 'trading',
                    'kind': 'trade_close',
                    'status': 'success',
                    'realized': True,
                    'netUsd': 20.0,
                    'txSignature': '0x' + 'a' * 64,
                    'metadata': {
                        'openCostBasisUsd': 100.0,
                        'closeProceedsUsd': 120.0,
                        'realizedProfitUsd': 20.0,
                        'closeOrderId': 'close-order-1',
                        'closePaymentRef': '0x' + 'a' * 64,
                    },
                },
                {
                    'id': 'close-2',
                    'at': self._iso(minutes_ago=1),
                    'source': 'trading',
                    'kind': 'trade_close',
                    'status': 'success',
                    'realized': True,
                    'netUsd': -2.0,
                    'txSignature': '0x' + 'b' * 64,
                    'metadata': {
                        'openCostBasisUsd': 120.0,
                        'closeProceedsUsd': 118.0,
                        'realizedProfitUsd': -2.0,
                        'closeOrderId': 'close-order-2',
                        'closePaymentRef': '0x' + 'b' * 64,
                    },
                },
            ]
        )

        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), True)
        self.assertEqual(summary.get('status'), 'routed')
        self.assertAlmostEqual(float(summary.get('realizedNetUsdTotal')), 18.0, places=6)
        self.assertAlmostEqual(float(summary.get('routeUsd')), 9.0, places=6)
        self.assertAlmostEqual(float(summary.get('routeSol')), 0.09, places=6)

        receipt_rows = [json.loads(line) for line in self.mod.ROUTE_RECEIPTS_PATH.read_text(encoding='utf-8').splitlines() if line.strip()]
        self.assertEqual(len(receipt_rows), 1)
        self.assertEqual(receipt_rows[0].get('source'), 'trading')

    def test_no_route_when_no_positive_realized_net(self):
        self._append_ledger(
            [
                {
                    'id': 'close-3',
                    'at': self._iso(minutes_ago=1),
                    'source': 'trading',
                    'kind': 'trade_close',
                    'status': 'success',
                    'realized': True,
                    'netUsd': -5.0,
                    'metadata': {'realizedProfitUsd': -5.0},
                }
            ]
        )
        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'up_to_date')
        self.assertEqual(float(summary.get('realizedNetUsdTotal')), 0.0)

    def test_skips_realized_rows_missing_required_profit_fields(self):
        self._append_ledger(
            [
                {
                    'id': 'close-missing-fields',
                    'at': self._iso(minutes_ago=1),
                    'source': 'trading',
                    'kind': 'trade_close',
                    'status': 'success',
                    'realized': True,
                    'paymentRef': '0x' + 'd' * 64,
                    'metadata': {
                        'realizedProfitUsd': 8.0,
                        'closeOrderId': 'close-order-missing-fields',
                        'closePaymentRef': '0x' + 'd' * 64,
                    },
                }
            ]
        )
        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'up_to_date')
        self.assertEqual(float(summary.get('realizedNetUsdTotal')), 0.0)
        self.assertEqual(int(summary.get('missingRealizedFieldRows')), 1)

    def test_rebases_processed_overshoot_when_enabled(self):
        self._append_ledger(
            [
                {
                    'id': 'close-4',
                    'at': self._iso(minutes_ago=1),
                    'source': 'trading',
                    'kind': 'trade_close',
                    'status': 'success',
                    'realized': True,
                    'netUsd': 10.0,
                    'txSignature': '0x' + 'c' * 64,
                    'metadata': {
                        'openCostBasisUsd': 100.0,
                        'closeProceedsUsd': 110.0,
                        'realizedProfitUsd': 10.0,
                        'closeOrderId': 'close-order-4',
                        'closePaymentRef': '0x' + 'c' * 64,
                    },
                }
            ]
        )
        self.mod.STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.STATE_PATH.write_text(
            json.dumps(
                {
                    'processedRealizedNetUsd': 35.0,
                    'lastRoutedLedgerCursor': 'trade-close-old',
                    'lastRoutedNetUsd': 12.5,
                }
            ),
            encoding='utf-8',
        )

        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'up_to_date')
        self.assertEqual(summary.get('rebasedProcessedOvershoot'), True)
        self.assertAlmostEqual(float(summary.get('processedRealizedNetUsd')), 10.0, places=6)
        self.assertAlmostEqual(float(summary.get('deltaUnroutedUsd')), 0.0, places=6)

        state_after = json.loads(self.mod.STATE_PATH.read_text(encoding='utf-8'))
        self.assertAlmostEqual(float(state_after.get('processedRealizedNetUsd', 0.0)), 10.0, places=6)

    def test_parse_solana_balance(self):
        self.assertAlmostEqual(self.mod.parse_solana_balance('0.123456789 SOL'), 0.123456789, places=9)
        self.assertAlmostEqual(self.mod.parse_solana_balance('0.5'), 0.5, places=9)
        self.assertAlmostEqual(self.mod.parse_solana_balance(''), 0.0, places=9)

    def test_compute_topup_amount_respects_cap(self):
        self.mod.ROUTE_MIN_WALLET_SOL = 0.12
        self.mod.ROUTE_TOPUP_TARGET_SOL = 0.15
        self.mod.ROUTE_TOPUP_MAX_SOL_PER_RUN = 0.05
        amount = self.mod.compute_topup_amount(current_balance_sol=0.01, required_balance_sol=0.12)
        self.assertAlmostEqual(amount, 0.05, places=9)

    def test_maybe_topup_route_wallet_reports_disabled_when_below_min(self):
        self.mod.ROUTE_TOPUP_ENABLED = False
        with patch.object(
            self.mod,
            'route_wallet_snapshot',
            return_value={'pubkey': 'route-pubkey', 'balanceSol': 0.01, 'keypairFound': True, 'solanaCliFound': True},
        ):
            result = self.mod.maybe_topup_route_wallet(solana_bin='solana', required_balance_sol=0.12)
        self.assertEqual(result.get('attempted'), False)
        self.assertEqual(result.get('ok'), False)
        self.assertEqual(result.get('reason'), 'route_wallet_below_minimum_no_topup')

    def test_maybe_sweep_route_wallet_reports_missing_cmd(self):
        self.mod.ROUTE_EARNINGS_SWEEP_ENABLED = True
        self.mod.ROUTE_EARNINGS_SWEEP_CMD = ''
        with patch.object(
            self.mod,
            'route_wallet_snapshot',
            return_value={'pubkey': 'route-pubkey', 'balanceSol': 0.01, 'keypairFound': True, 'solanaCliFound': True},
        ):
            result = self.mod.maybe_sweep_route_wallet_earnings(
                solana_bin='solana',
                required_balance_sol=0.2,
                route_usd=10.0,
                delta_usd=20.0,
                checkpoint_id='cp-1',
            )
        self.assertEqual(result.get('attempted'), False)
        self.assertEqual(result.get('ok'), False)
        self.assertEqual(result.get('reason'), 'missing_earnings_sweep_cmd')

    def test_maybe_sweep_route_wallet_updates_balance_after_success(self):
        self.mod.ROUTE_EARNINGS_SWEEP_ENABLED = True
        self.mod.ROUTE_EARNINGS_SWEEP_CMD = 'echo ok'
        with patch.object(
            self.mod,
            'route_wallet_snapshot',
            return_value={'pubkey': 'route-pubkey', 'balanceSol': 0.01, 'keypairFound': True, 'solanaCliFound': True},
        ), patch.object(
            self.mod,
            'run_earnings_sweep_cmd',
            return_value={'txSignature': 'sig-1', 'sweptSol': 0.25},
        ), patch.object(
            self.mod,
            'read_solana_balance_pubkey',
            return_value=0.26,
        ):
            result = self.mod.maybe_sweep_route_wallet_earnings(
                solana_bin='solana',
                required_balance_sol=0.2,
                route_usd=10.0,
                delta_usd=20.0,
                checkpoint_id='cp-2',
            )
        self.assertEqual(result.get('attempted'), True)
        self.assertEqual(result.get('ok'), True)
        self.assertEqual(result.get('reason'), 'earnings_sweep_applied')
        self.assertEqual(result.get('txSignature'), 'sig-1')
        self.assertAlmostEqual(float(result.get('sweptSol')), 0.25, places=9)

    def test_run_earnings_sweep_cmd_sets_target_sol_env(self):
        self.mod.ROUTE_EARNINGS_SWEEP_CMD = 'echo ok'
        self.mod.SOL_PRICE_USD = 175.5
        completed = subprocess.CompletedProcess(
            args=['bash', '-lc', 'echo ok'],
            returncode=0,
            stdout='{"txSignature":"0x' + 'a' * 64 + '","sweptSol":0.123}\n',
            stderr='',
        )
        with patch.object(self.mod.subprocess, 'run', return_value=completed) as mocked_run:
            result = self.mod.run_earnings_sweep_cmd(
                to_pubkey='route-pubkey',
                route_usd=42.0,
                delta_usd=52.0,
                checkpoint_id='checkpoint-1',
                required_balance_sol=0.55,
                current_balance_sol=0.2,
            )
        self.assertEqual(result.get('txSignature'), '0x' + 'a' * 64)
        self.assertAlmostEqual(float(result.get('sweptSol')), 0.123, places=9)
        env = mocked_run.call_args.kwargs.get('env') or {}
        self.assertEqual(env.get('KYO_ROUTE_SWEEP_TARGET_SOL'), '0.35')
        self.assertEqual(env.get('KYO_ROUTE_SWEEP_SOL_PRICE_USD'), '175.50000000')


if __name__ == '__main__':
    unittest.main()
