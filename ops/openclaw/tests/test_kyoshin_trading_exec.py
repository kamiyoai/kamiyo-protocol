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
        self.state_dir = self.runtime / 'state'
        self.feeds_dir = self.runtime / 'feeds'
        self.receipts_dir = self.runtime / 'receipts'
        self.log_dir = self.runtime / 'logs'

        self.mod.WORKSPACE = self.workspace
        self.mod.RUNTIME_DIR = self.runtime
        self.mod.STATE_DIR = self.state_dir
        self.mod.FEEDS_DIR = self.feeds_dir
        self.mod.RECEIPTS_DIR = self.receipts_dir
        self.mod.LOG_DIR = self.log_dir
        self.mod.STATE_PATH = self.state_dir / 'trading-exec-state.json'
        self.mod.OUTPUT_PATH = self.state_dir / 'trading-exec.json'
        self.mod.LOG_PATH = self.log_dir / 'trading-exec.jsonl'
        self.mod.POSITIONS_PATH = self.state_dir / 'trading-positions.json'
        self.mod.FEED_PATH = self.feeds_dir / 'trading-opportunities.json'
        self.mod.REVENUE_GUARD_PATH = self.state_dir / 'revenue-guard.json'
        self.mod.POLYMARKET_GEO_PATH = self.state_dir / 'polymarket-geo.json'
        self.mod.CAPABILITIES_PATH = self.state_dir / 'trading-capabilities.json'
        self.mod.LEDGER_PATH = self.receipts_dir / 'revenue-ledger.jsonl'
        self.mod.POLYMARKET_BRIDGE_PATH = self.runtime / 'missing-polymarket-bridge.mjs'
        self.mod.LIMITLESS_BRIDGE_PATH = self.runtime / 'missing-limitless-bridge.mjs'

        self.mod.ENABLE_TRADING_AGENT = True
        self.mod.EXECUTION_MODE = 'paper'
        self.mod.VENUES = ['limitless', 'kalshi']
        self.mod.KALSHI_SIGNAL_ONLY = True
        self.mod.STARTING_EQUITY_USD = 200.0
        self.mod.MAX_NOTIONAL_USD_PER_DAY = 400.0
        self.mod.MAX_OPEN_POSITIONS = 2
        self.mod.MAX_MARKET_EXPOSURE_PCT = 25.0
        self.mod.MIN_EDGE_USD = 0.01
        self.mod.BASE_NOTIONAL_PER_TRADE_USD = 25.0
        self.mod.POLYMARKET_EXEC_CMD = ''
        self.mod.LIMITLESS_EXEC_CMD = ''
        self.mod.POLYMARKET_REQUIRE_GEO_ALLOWED = True

    def tearDown(self):
        self.tmp.cleanup()

    def _write_feed(self):
        self.mod.FEED_PATH.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            'ok': True,
            'opportunities': [
                {
                    'id': 'cand-1',
                    'source': 'trading',
                    'venue': 'limitless',
                    'kind': 'trade_candidate',
                    'marketId': 'mkt-1',
                    'confidence': 0.8,
                    'expectedNetUsd': 0.2,
                    'feesEstimate': 0.03,
                    'expectedSlippage': 0.01,
                },
                {
                    'id': 'sig-1',
                    'source': 'trading',
                    'venue': 'kalshi',
                    'kind': 'signal',
                    'marketId': 'kal-1',
                    'confidence': 0.7,
                    'expectedNetUsd': 0.0,
                },
            ],
        }
        self.mod.FEED_PATH.write_text(json.dumps(payload), encoding='utf-8')

    def _run(self) -> tuple[int, dict]:
        stdout = io.StringIO()
        with patch('sys.stdout', stdout):
            code = self.mod.run()
        return code, json.loads(stdout.getvalue().strip())

    def _ledger_rows(self) -> list[dict]:
        if not self.mod.LEDGER_PATH.exists():
            return []
        return [json.loads(line) for line in self.mod.LEDGER_PATH.read_text(encoding='utf-8').splitlines() if line.strip()]

    def test_executes_paper_trade_and_records_signal(self):
        self._write_feed()
        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'ok')
        self.assertEqual(summary.get('executedTrades'), 1)
        self.assertEqual(summary.get('closedTradesTick'), 1)
        self.assertEqual(summary.get('signalsRecorded'), 1)

        rows = self._ledger_rows()
        kinds = [row.get('kind') for row in rows]
        self.assertIn('trade_open', kinds)
        self.assertIn('trade_close', kinds)
        self.assertIn('signal', kinds)

    def test_blocks_when_revenue_guard_blocks_paid_execution(self):
        self._write_feed()
        self.mod.REVENUE_GUARD_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.REVENUE_GUARD_PATH.write_text(
            json.dumps({'ok': False, 'blockPaidExecution': True}),
            encoding='utf-8',
        )

        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'blocked')
        self.assertIn('revenue_guard_block_paid_execution', summary.get('reasons', []))
        self.assertEqual(summary.get('executedTrades'), 0)

    def test_live_mode_requires_limitless_transport(self):
        self._write_feed()
        self.mod.EXECUTION_MODE = 'live'
        self.mod.LIMITLESS_EXEC_CMD = ''

        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'blocked')
        self.assertIn('missing_limitless_execution_transport', summary.get('reasons', []))

    def test_live_mode_blocks_polymarket_when_geo_blocked(self):
        self._write_feed()
        self.mod.EXECUTION_MODE = 'live'
        self.mod.VENUES = ['polymarket', 'kalshi']
        self.mod.POLYMARKET_EXEC_CMD = 'printf \"{\\\"orderId\\\":\\\"o1\\\",\\\"positionId\\\":\\\"p1\\\",\\\"grossUsd\\\":0,\\\"costUsd\\\":0,\\\"netUsd\\\":0,\\\"realized\\\":false,\\\"paymentRef\\\":\\\"x\\\",\\\"raw\\\":{}}\"'
        with patch.object(self.mod, 'fetch_polymarket_geo', return_value={'ok': True, 'blocked': True, 'checkedAt': '2026-03-02T00:00:00+00:00'}):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'blocked')
        self.assertIn('polymarket_geo_blocked', summary.get('reasons', []))


if __name__ == '__main__':
    unittest.main()
