import importlib.util
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch


SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'kyoshin-trading-exec.py'


def load_module():
    spec = importlib.util.spec_from_file_location('kyoshin_trading_exec', SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError('failed to load kyoshin-trading-exec.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class KyoshinTradingExecTests(unittest.TestCase):
    def setUp(self):
        self.mod = load_module()
        self.tmp = TemporaryDirectory()
        self.workspace = Path(self.tmp.name) / 'workspace'
        self.runtime = self.workspace / 'runtime'
        self.feeds_dir = self.runtime / 'feeds'
        self.state_dir = self.runtime / 'state'
        self.receipts_dir = self.runtime / 'receipts'
        self.log_dir = self.runtime / 'logs'

        self.mod.WORKSPACE = self.workspace
        self.mod.RUNTIME_DIR = self.runtime
        self.mod.FEEDS_DIR = self.feeds_dir
        self.mod.STATE_DIR = self.state_dir
        self.mod.RECEIPTS_DIR = self.receipts_dir
        self.mod.LOG_DIR = self.log_dir

        self.mod.FEED_PATH = self.feeds_dir / 'trading-opportunities.json'
        self.mod.POSITIONS_PATH = self.state_dir / 'trading-positions.json'
        self.mod.STATE_PATH = self.state_dir / 'trading-exec-state.json'
        self.mod.OUTPUT_PATH = self.state_dir / 'trading-exec.json'
        self.mod.LEDGER_PATH = self.receipts_dir / 'revenue-ledger.jsonl'
        self.mod.LOG_PATH = self.log_dir / 'trading-exec.jsonl'

        self.mod.ENABLE_TRADING_AGENT = True
        self.mod.EXECUTION_MODE = 'paper'
        self.mod.EXECUTION_BACKEND = 'dflow'
        self.mod.VENUES = ['dflow', 'kalshi']
        self.mod.KALSHI_SIGNAL_ONLY = True
        self.mod.MAX_NOTIONAL_USD_PER_DAY = 750.0
        self.mod.MAX_OPEN_POSITIONS = 6
        self.mod.MAX_MARKET_EXPOSURE_USD = 150.0
        self.mod.MAX_DRAWDOWN_PCT = 8.0
        self.mod.WEEKLY_LOSS_CAP_USD = 300.0
        self.mod.TAKE_PROFIT_PCT = 12.0
        self.mod.STOP_LOSS_PCT = 8.0
        self.mod.MAX_HOLD_HOURS = 72.0
        self.mod.MAX_OPEN_PER_TICK = 2
        self.mod.DEFAULT_POSITION_USD = 100.0
        self.mod.MIN_POSITION_USD = 10.0
        self.mod.FEE_BPS = 10.0
        self.mod.STARTING_EQUITY_USD = 1000.0
        self.mod.KALSHI_SIGNAL_RECORD_LIMIT = 2
        self.mod.SOLANA_KEYPAIR_PATH = str(Path(self.tmp.name) / 'missing-id.json')

    def tearDown(self):
        self.tmp.cleanup()

    def _run(self) -> tuple[int, dict]:
        stdout = io.StringIO()
        with patch('sys.stdout', stdout):
            code = self.mod.run()
        return code, json.loads(stdout.getvalue().strip())

    def _write_feed(self, payload: dict) -> None:
        self.mod.FEED_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.FEED_PATH.write_text(json.dumps(payload), encoding='utf-8')

    def test_disabled_status_when_trading_agent_disabled(self):
        self.mod.ENABLE_TRADING_AGENT = False
        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), True)
        self.assertEqual(summary.get('status'), 'disabled')

    def test_paper_mode_opens_trade_and_records_signal(self):
        self._write_feed(
            {
                'opportunities': [
                    {
                        'id': 'trading-dflow-a',
                        'source': 'trading',
                        'confidence': 0.8,
                        'metadata': {
                            'venue': 'dflow',
                            'marketId': 'mkt-a',
                            'price': 0.41,
                            'edgeScore': 0.18,
                            'suggestedSide': 'yes',
                            'signalOnly': False,
                        },
                    },
                    {
                        'id': 'trading-kalshi-a',
                        'source': 'trading',
                        'confidence': 0.7,
                        'metadata': {
                            'venue': 'kalshi',
                            'marketId': 'kal-a',
                            'price': 0.62,
                            'signalOnly': True,
                        },
                    },
                ]
            }
        )

        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), True)
        self.assertEqual(summary.get('openedTrades'), 1)
        self.assertEqual(summary.get('signalRowsAppended'), 1)
        self.assertEqual(summary.get('openPositions'), 1)

        rows = [
            json.loads(line)
            for line in self.mod.LEDGER_PATH.read_text(encoding='utf-8').splitlines()
            if line.strip()
        ]
        kinds = {row.get('kind') for row in rows}
        self.assertIn('trade_open', kinds)
        self.assertIn('signal', kinds)

    def test_closes_position_when_take_profit_hits(self):
        self._write_feed(
            {
                'opportunities': [
                    {
                        'id': 'trading-dflow-a',
                        'source': 'trading',
                        'confidence': 0.9,
                        'metadata': {
                            'venue': 'dflow',
                            'marketId': 'mkt-a',
                            'price': 0.55,
                            'edgeScore': 0.1,
                            'suggestedSide': 'yes',
                            'signalOnly': False,
                        },
                    }
                ]
            }
        )
        self.mod.POSITIONS_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.POSITIONS_PATH.write_text(
            json.dumps(
                {
                    'startingEquityUsd': 1000,
                    'peakEquityUsd': 1000,
                    'realizedNetUsd': 0,
                    'openPositions': [
                        {
                            'positionId': 'pos-a',
                            'marketId': 'mkt-a',
                            'venue': 'dflow',
                            'side': 'yes',
                            'entryPrice': 0.4,
                            'notionalUsd': 100,
                            'openedAt': '2026-01-01T00:00:00Z',
                        }
                    ],
                }
            ),
            encoding='utf-8',
        )
        self.mod.TAKE_PROFIT_PCT = 5.0

        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('closedTrades'), 1)

        rows = [
            json.loads(line)
            for line in self.mod.LEDGER_PATH.read_text(encoding='utf-8').splitlines()
            if line.strip()
        ]
        close_rows = [row for row in rows if row.get('kind') == 'trade_close' and row.get('status') == 'success']
        self.assertEqual(len(close_rows), 1)

    def test_singularity_backend_posts_signed_idempotent_order_payload(self):
        self.mod.EXECUTION_MODE = 'live'
        self.mod.EXECUTION_BACKEND = 'singularity'
        self.mod.DFLOW_EXEC_CMD = ''
        self.mod.SINGULARITY_ORDER_TYPE = 'market'
        self.mod.SINGULARITY_INCLUDE_PRICE = False
        self.mod.SINGULARITY_REQUIRE_TX_SIGNATURE = True
        self.mod.DFLOW_API_BASE_URL = 'http://127.0.0.1:3001'
        self.mod.DFLOW_ORDER_PATH = '/api/orders'

        with patch.object(
            self.mod,
            'sign_keiro_auth',
            return_value={'ok': True, 'payload': 'Solana pub:sig:1'},
        ), patch.object(
            self.mod,
            'next_auth_timestamp_ms',
            return_value=1700000000000,
        ), patch.object(
            self.mod,
            'post_json',
            return_value=(201, {'orderId': 'ord-1', 'status': 'open'}),
        ) as post_json:
            result = self.mod.execute_order(
                action='open',
                market_id='mkt-a',
                side='yes',
                notional_usd=100.0,
                reference_id='ref-abc',
                price=0.4,
            )

        self.assertTrue(result.get('ok'))
        self.assertEqual(result.get('orderId'), 'ord-1')
        self.assertTrue(str(result.get('idempotencyKey', '')).startswith('kyoshin-open-mkt-a-'))
        self.assertTrue(str(result.get('txSignature', '')).startswith(f'{self.mod.SINGULARITY_TX_SIGNATURE_PREFIX}_'))

        call_args = post_json.call_args
        self.assertIsNotNone(call_args)
        args = call_args[0]
        self.assertEqual(args[0], 'http://127.0.0.1:3001/api/orders')
        headers = args[1]
        payload = args[2]

        self.assertEqual(headers.get('authorization'), 'Solana pub:sig:1')
        self.assertTrue(headers.get('x-idempotency-key', '').startswith('kyoshin-open-mkt-a-'))
        self.assertEqual(payload.get('marketId'), 'mkt-a')
        self.assertEqual(payload.get('side'), 'buy')
        self.assertEqual(payload.get('outcome'), 'yes')
        self.assertEqual(payload.get('orderType'), 'market')
        self.assertAlmostEqual(float(payload.get('quantity')), 250.0, places=6)
        self.assertIn('txSignature', payload)

    def test_live_singularity_mode_blocks_without_keypair(self):
        self.mod.EXECUTION_MODE = 'live'
        self.mod.EXECUTION_BACKEND = 'singularity'
        self.mod.DFLOW_EXEC_CMD = ''
        self.mod.SOLANA_KEYPAIR_PATH = str(Path(self.tmp.name) / 'does-not-exist.json')
        self._write_feed({'opportunities': []})

        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertFalse(summary.get('ok'))
        self.assertEqual(summary.get('status'), 'blocked')
        self.assertEqual(summary.get('reason'), 'missing_solana_keypair')
        self.assertEqual(summary.get('executionBackend'), 'singularity')


if __name__ == '__main__':
    unittest.main()
