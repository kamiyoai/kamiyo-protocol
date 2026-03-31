import importlib.util
import json
import os
from pathlib import Path
import sqlite3
from tempfile import TemporaryDirectory
from unittest.mock import patch
import unittest


SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'kamiyo-agent-receipt-sync.py'


def load_module():
    spec = importlib.util.spec_from_file_location('kamiyo_agent_receipt_sync', SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError('failed to load kamiyo-agent-receipt-sync.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def init_db(path: Path) -> None:
    conn = sqlite3.connect(str(path))
    conn.execute(
        """
        CREATE TABLE swarm_jobs (
          id TEXT PRIMARY KEY,
          agent_id TEXT,
          source TEXT,
          status TEXT,
          paid INTEGER,
          payment_network TEXT,
          payment_amount_usd REAL,
          revenue_sol REAL,
          revenue_usd REAL,
          error TEXT,
          executed_at TEXT
        )
        """
    )
    conn.commit()
    conn.close()


class KamiyoAgentReceiptSyncTests(unittest.TestCase):
    def setUp(self):
        self.mod = load_module()
        self.tmp = TemporaryDirectory()
        workspace = Path(self.tmp.name) / 'workspace'
        runtime = workspace / 'runtime'

        self.mod.WORKSPACE = workspace
        self.mod.RUNTIME_DIR = runtime
        self.mod.STATE_DIR = runtime / 'state'
        self.mod.RECEIPTS_DIR = runtime / 'receipts'
        self.mod.LOG_DIR = runtime / 'logs'
        self.mod.OUTPUT_PATH = self.mod.RECEIPTS_DIR / 'execution-receipts.jsonl'
        self.mod.STATE_PATH = self.mod.STATE_DIR / 'kamiyo-agent-receipt-sync-state.json'
        self.mod.LOG_PATH = self.mod.LOG_DIR / 'kamiyo-agent-receipt-sync.jsonl'
        self.mod.SOL_PRICE_USD = 150.0
        self.mod.ESTIMATED_FEE_SOL = 0.001
        self.mod.MAX_BATCH = 1000

        self.db_path = Path(self.tmp.name) / 'state.db'
        init_db(self.db_path)

    def tearDown(self):
        self.tmp.cleanup()

    def _insert_job(
        self,
        *,
        job_id: str,
        agent_id: str,
        status: str,
        paid: int,
        payment_amount_usd: float,
        revenue_sol: float,
        revenue_usd: float = 0.0,
        source: str = 'x402',
    ) -> None:
        conn = sqlite3.connect(str(self.db_path))
        conn.execute(
            """
            INSERT INTO swarm_jobs (
              id, agent_id, source, status, paid, payment_network, payment_amount_usd,
              revenue_sol, revenue_usd, error, executed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                job_id,
                agent_id,
                source,
                status,
                paid,
                'solana:mainnet',
                payment_amount_usd,
                revenue_sol,
                revenue_usd,
                '' if status == 'executed' else 'failed',
                '2026-02-25T10:00:00Z',
            ),
        )
        conn.commit()
        conn.close()

    def _read_receipts(self) -> list[dict]:
        if not self.mod.OUTPUT_PATH.exists():
            return []
        lines = [line.strip() for line in self.mod.OUTPUT_PATH.read_text(encoding='utf-8').splitlines() if line.strip()]
        return [json.loads(line) for line in lines]

    def test_sync_exports_success_and_failed_rows(self):
        self._insert_job(job_id='job-1', agent_id='alpha', status='executed', paid=1, payment_amount_usd=3.0, revenue_sol=0.2)
        self._insert_job(job_id='job-2', agent_id='alpha', status='failed', paid=0, payment_amount_usd=0.0, revenue_sol=0.0)
        self._insert_job(job_id='job-3', agent_id='alpha', status='skipped', paid=0, payment_amount_usd=0.0, revenue_sol=0.0)

        with patch.dict(
            os.environ,
            {
                'KYO_KAMIYO_AGENT_DB_PATH': str(self.db_path),
                'KYO_RECEIPT_SOL_PRICE_USD': '150',
                'KYO_RECEIPT_ESTIMATED_FEE_SOL': '0.001',
            },
            clear=False,
        ):
            code = self.mod.run()

        self.assertEqual(code, 0)
        receipts = self._read_receipts()
        self.assertEqual(len(receipts), 2)

        first = receipts[0]
        second = receipts[1]
        self.assertEqual(first.get('status'), 'success')
        self.assertEqual(second.get('status'), 'failed')
        self.assertAlmostEqual(float(first.get('profitSol')), 0.179, places=6)
        self.assertAlmostEqual(float(second.get('profitSol')), -0.001, places=6)

    def test_cursor_prevents_duplicate_rows(self):
        self._insert_job(job_id='job-1', agent_id='alpha', status='executed', paid=0, payment_amount_usd=0.0, revenue_sol=0.05)

        with patch.dict(os.environ, {'KYO_KAMIYO_AGENT_DB_PATH': str(self.db_path)}, clear=False):
            first = self.mod.run()
            second = self.mod.run()

        self.assertEqual(first, 0)
        self.assertEqual(second, 0)
        receipts = self._read_receipts()
        self.assertEqual(len(receipts), 1)

        self._insert_job(job_id='job-2', agent_id='beta', status='failed', paid=0, payment_amount_usd=0.0, revenue_sol=0.0)
        with patch.dict(os.environ, {'KYO_KAMIYO_AGENT_DB_PATH': str(self.db_path)}, clear=False):
            third = self.mod.run()
        self.assertEqual(third, 0)
        receipts_after = self._read_receipts()
        self.assertEqual(len(receipts_after), 2)

    def test_parse_db_path_rejects_non_sqlite_configured_path(self):
        invalid_path = Path(self.tmp.name) / 'state.json'
        invalid_path.write_text('{"ok":true}\n', encoding='utf-8')

        with patch.dict(os.environ, {'KYO_KAMIYO_AGENT_DB_PATH': str(invalid_path)}, clear=False):
            parsed = self.mod.parse_db_path()

        self.assertIsNone(parsed)

    def test_parse_db_path_prefers_valid_sqlite_over_json_fallback(self):
        project_root = Path(self.tmp.name) / 'project'
        json_candidate = project_root / 'services' / 'kamiyo-agent' / 'output' / 'kamiyo-agent' / 'state.db'
        sqlite_candidate = project_root / 'output' / 'kamiyo-operator' / 'state.db'
        json_candidate.parent.mkdir(parents=True, exist_ok=True)
        sqlite_candidate.parent.mkdir(parents=True, exist_ok=True)
        json_candidate.write_text('{"version":2}\n', encoding='utf-8')
        init_db(sqlite_candidate)

        prior_cwd = Path.cwd()
        try:
            os.chdir(project_root)
            with patch.dict(os.environ, {'KYO_KAMIYO_AGENT_DB_PATH': ''}, clear=False):
                parsed = self.mod.parse_db_path()
        finally:
            os.chdir(prior_cwd)

        self.assertIsNotNone(parsed)
        self.assertTrue(parsed.exists())
        self.assertTrue(sqlite_candidate.exists())
        self.assertTrue(parsed.samefile(sqlite_candidate))


if __name__ == '__main__':
    unittest.main()
