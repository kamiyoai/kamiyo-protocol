import importlib.util
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch


SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'kamiyo-agent-whop-catalog.py'


def load_module():
    spec = importlib.util.spec_from_file_location('kamiyo_agent_whop_catalog', SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError('failed to load kamiyo-agent-whop-catalog.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class KamiyoAgentWhopCatalogTests(unittest.TestCase):
    def setUp(self):
        self.mod = load_module()
        self.tmp = TemporaryDirectory()
        self.workspace = Path(self.tmp.name) / 'workspace'
        self.runtime = self.workspace / 'runtime'
        self.state_dir = self.runtime / 'state'
        self.receipts_dir = self.runtime / 'receipts'
        self.seed_dir = self.runtime / 'seed'
        self.log_dir = self.runtime / 'logs'

        self.mod.WORKSPACE = self.workspace
        self.mod.RUNTIME_DIR = self.runtime
        self.mod.STATE_DIR = self.state_dir
        self.mod.RECEIPTS_DIR = self.receipts_dir
        self.mod.SEED_DIR = self.seed_dir
        self.mod.LOG_DIR = self.log_dir

        self.mod.STATE_PATH = self.state_dir / 'whop-catalog-state.json'
        self.mod.OUTPUT_PATH = self.state_dir / 'whop-catalog.json'
        self.mod.ACTION_LOG_PATH = self.receipts_dir / 'whop-catalog-actions.jsonl'
        self.mod.LOG_PATH = self.log_dir / 'whop-catalog.jsonl'
        self.mod.CATALOG_PATH = self.seed_dir / 'whop-catalog.json'

        self.mod.ENABLE_WHOP_MONITOR = True
        self.mod.ENABLE_WHOP_CATALOG = True
        self.mod.API_KEY = 'whop-key'
        self.mod.COMPANY_ID = 'company-123'
        self.mod.MAX_OFFERS = 10

    def tearDown(self):
        self.tmp.cleanup()

    def _run(self) -> tuple[int, dict]:
        stdout = io.StringIO()
        with patch('sys.stdout', stdout):
            code = self.mod.run()
        return code, json.loads(stdout.getvalue().strip())

    def _write_catalog(self, offers: list[dict]) -> None:
        self.mod.CATALOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.CATALOG_PATH.write_text(json.dumps({'offers': offers}), encoding='utf-8')

    def test_disabled_when_whop_monitor_disabled(self):
        self.mod.ENABLE_WHOP_MONITOR = False
        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'disabled')

    def test_blocks_when_credentials_missing(self):
        self.mod.API_KEY = ''
        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('status'), 'blocked')
        self.assertEqual(summary.get('reason'), 'missing_whop_api_key')

    def test_upserts_catalog_and_writes_mapping(self):
        self._write_catalog(
            [
                {
                    'slug': 'kamiyo-agent-audit',
                    'name': 'Kamiyo Agent 24h Revenue Audit',
                    'description': 'Audit and receipts',
                    'priceUsd': 49,
                    'currency': 'USD',
                }
            ]
        )

        with patch.object(self.mod, 'list_products', return_value=[]), patch.object(
            self.mod,
            'create_or_update_product',
            return_value=({'id': 'prod_1', 'slug': 'kamiyo-agent-audit', 'name': 'Kamiyo Agent 24h Revenue Audit'}, 'created'),
        ), patch.object(self.mod, 'list_plans', return_value=[]), patch.object(
            self.mod,
            'create_or_update_plan',
            return_value=({'id': 'plan_1', 'slug': 'kamiyo-agent-audit-one-time'}, 'created'),
        ):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), True)
        self.assertEqual(summary.get('mappedOffers'), 1)
        self.assertEqual(summary.get('createdProducts'), 1)
        self.assertEqual(summary.get('createdPlans'), 1)
        offers = summary.get('offers') or []
        self.assertEqual(len(offers), 1)
        self.assertEqual(offers[0].get('productId'), 'prod_1')
        self.assertEqual(offers[0].get('planId'), 'plan_1')


if __name__ == '__main__':
    unittest.main()
