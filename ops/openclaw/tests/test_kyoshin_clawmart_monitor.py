import importlib.util
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch


SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'kyoshin-clawmart-monitor.py'


def load_module():
    spec = importlib.util.spec_from_file_location('kyoshin_clawmart_monitor', SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError('failed to load kyoshin-clawmart-monitor.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class KyoshinClawMartMonitorTests(unittest.TestCase):
    def setUp(self):
        self.mod = load_module()
        self.tmp = TemporaryDirectory()
        self.workspace = Path(self.tmp.name) / 'workspace'
        self.runtime = self.workspace / 'runtime'
        self.state_dir = self.runtime / 'state'
        self.mission_control_dir = self.runtime / 'mission-control'

        self.mod.WORKSPACE = self.workspace
        self.mod.RUNTIME_DIR = self.runtime
        self.mod.STATE_DIR = self.state_dir
        self.mod.MISSION_CONTROL_DIR = self.mission_control_dir
        self.mod.BACKLOG_PATH = self.mission_control_dir / 'backlog.json'
        self.mod.BOARD_PATH = self.mission_control_dir / 'board.json'
        self.mod.STATE_PATH = self.state_dir / 'clawmart-monitor-state.json'
        self.mod.OUTPUT_PATH = self.state_dir / 'clawmart-monitor.json'
        self.mod.API_KEY = ''
        self.mod.DASHBOARD_URL = 'https://example.com/dashboard'
        self.mod.MAX_TASKS = 8

    def tearDown(self):
        self.tmp.cleanup()

    def _write_json(self, path: Path, payload: dict) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload), encoding='utf-8')

    def _run(self) -> tuple[int, dict]:
        stdout = io.StringIO()
        with patch('sys.stdout', stdout):
            code = self.mod.run()
        return code, json.loads(stdout.getvalue().strip())

    def test_skips_when_api_key_missing(self):
        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), False)
        self.assertEqual(summary.get('status'), 'skipped')
        self.assertEqual(summary.get('reason'), 'missing_api_key')
        self.assertFalse(self.mod.BACKLOG_PATH.exists())
        self.assertFalse(self.mod.BOARD_PATH.exists())
        self.assertFalse(self.mod.STATE_PATH.exists())

    def test_adds_sales_and_new_listing_tasks(self):
        self.mod.API_KEY = 'test-key'
        self._write_json(self.mod.STATE_PATH, {'totalSales': 2, 'listings': {}})

        def fake_fetch(path: str) -> dict:
            if path == '/me':
                return {'data': {'totalSales': 5, 'profile': {'id': 'profile-1'}}}
            if path == '/listings':
                return {
                    'data': {
                        'listings': [
                            {
                                'id': 'listing-1',
                                'name': 'Kyoshin Operator Persona',
                                'status': 'active',
                                'slug': 'kyoshin-operator',
                                'publicUrl': 'https://www.shopclawmart.com/listings/listing-1',
                                'price': 99,
                                'versions': 1,
                                'updatedAt': '2026-02-27T00:00:00Z',
                            }
                        ]
                    }
                }
            raise AssertionError(f'unexpected path: {path}')

        with patch.object(self.mod, 'fetch_json', side_effect=fake_fetch):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), True)
        self.assertEqual(summary.get('tasksAdded'), 2)
        self.assertEqual(summary.get('salesDelta'), 3)
        self.assertEqual(summary.get('totalSales'), 5)

        backlog = json.loads(self.mod.BACKLOG_PATH.read_text(encoding='utf-8'))
        task_types = {item.get('type') for item in backlog.get('items', [])}
        self.assertIn('clawmart_fulfillment', task_types)
        self.assertIn('clawmart_listing_launch', task_types)

        board = json.loads(self.mod.BOARD_PATH.read_text(encoding='utf-8'))
        self.assertEqual(board.get('clawMartProfileId'), 'profile-1')
        self.assertEqual(board.get('clawMartTotalSales'), 5)
        self.assertEqual(board.get('clawMartSalesDelta'), 3)
        self.assertEqual(board.get('clawMartListingsActive'), 1)
        self.assertEqual(board.get('clawMartListingsTotal'), 1)

    def test_dedupes_existing_task_ids_and_respects_max_tasks(self):
        self.mod.API_KEY = 'test-key'
        self.mod.MAX_TASKS = 1
        self._write_json(
            self.mod.STATE_PATH,
            {
                'totalSales': 5,
                'listings': {
                    'listing-1': {
                        'name': 'Kyoshin Operator Persona',
                        'status': 'draft',
                        'slug': 'kyoshin-operator',
                        'price': 99,
                        'versions': 1,
                        'updatedAt': '2026-02-27T00:00:00Z',
                    }
                },
            },
        )
        self._write_json(
            self.mod.BACKLOG_PATH,
            {
                'ok': True,
                'at': '2026-02-27T00:00:00Z',
                'items': [
                    {
                        'id': 'clawmart-status-listing1-active',
                        'type': 'clawmart_listing_state_change',
                    }
                ],
            },
        )

        def fake_fetch(path: str) -> dict:
            if path == '/me':
                return {'data': {'totalSales': 5, 'profile': {'id': 'profile-1'}}}
            if path == '/listings':
                return {
                    'data': {
                        'listings': [
                            {
                                'id': 'listing-1',
                                'name': 'Kyoshin Operator Persona',
                                'status': 'active',
                                'slug': 'kyoshin-operator',
                                'publicUrl': 'https://www.shopclawmart.com/listings/listing-1',
                                'price': 99,
                                'versions': 2,
                                'updatedAt': '2026-02-27T01:00:00Z',
                            }
                        ]
                    }
                }
            raise AssertionError(f'unexpected path: {path}')

        with patch.object(self.mod, 'fetch_json', side_effect=fake_fetch):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('tasksAdded'), 1)

        backlog = json.loads(self.mod.BACKLOG_PATH.read_text(encoding='utf-8'))
        ids = [item.get('id') for item in backlog.get('items', [])]
        self.assertIn('clawmart-status-listing1-active', ids)
        self.assertIn('clawmart-version-listing1-2', ids)
        self.assertEqual(ids.count('clawmart-status-listing1-active'), 1)

    def test_api_error_soft_fails_with_summary(self):
        self.mod.API_KEY = 'test-key'
        with patch.object(self.mod, 'fetch_json', side_effect=ValueError('bad_payload')):
            code, summary = self._run()

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), False)
        self.assertEqual(summary.get('status'), 'failed')
        self.assertEqual(summary.get('reason'), 'api_error')
        self.assertEqual(summary.get('tasksAdded'), 0)
        self.assertEqual(summary.get('salesDelta'), 0)

    def test_adds_daily_growth_task_when_no_sales(self):
        self.mod.API_KEY = 'test-key'

        def fake_fetch(path: str) -> dict:
            if path == '/me':
                return {'data': {'totalSales': 0, 'profile': {'id': 'profile-1'}}}
            if path == '/listings':
                return {
                    'data': {
                        'listings': [
                            {
                                'id': 'listing-1',
                                'name': 'Kyoshin Operator Persona',
                                'status': 'active',
                                'slug': 'kyoshin-operator',
                                'publicUrl': 'https://www.shopclawmart.com/listings/listing-1',
                                'price': 99,
                                'versions': 1,
                                'updatedAt': '2026-02-27T00:00:00Z',
                            }
                        ]
                    }
                }
            raise AssertionError(f'unexpected path: {path}')

        with patch.object(self.mod, 'fetch_json', side_effect=fake_fetch):
            code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('ok'), True)
        self.assertGreaterEqual(summary.get('tasksAdded'), 1)

        backlog = json.loads(self.mod.BACKLOG_PATH.read_text(encoding='utf-8'))
        task_ids = [item.get('id') for item in backlog.get('items', [])]
        growth_ids = [task_id for task_id in task_ids if isinstance(task_id, str) and task_id.startswith('clawmart-growth-')]
        promo_ids = [task_id for task_id in task_ids if isinstance(task_id, str) and task_id.startswith('clawmart-promo-')]
        outreach_ids = [task_id for task_id in task_ids if isinstance(task_id, str) and task_id.startswith('clawmart-outreach-')]
        channel_setup_ids = [task_id for task_id in task_ids if isinstance(task_id, str) and task_id.startswith('clawmart-channel-setup-')]
        self.assertEqual(len(growth_ids), 1)
        self.assertEqual(len(promo_ids), 1)
        self.assertEqual(len(outreach_ids), 1)
        self.assertEqual(len(channel_setup_ids), 1)

        first_state = json.loads(self.mod.STATE_PATH.read_text(encoding='utf-8'))
        self.assertEqual(first_state.get('lastGrowthTaskDate'), growth_ids[0].replace('clawmart-growth-', ''))
        self.assertIn('firstTrackedAt', first_state)
        self.assertIn('noSalesDays', first_state)
        self.assertEqual(first_state.get('distributionChannelsReady'), False)

        with patch.object(self.mod, 'fetch_json', side_effect=fake_fetch):
            code2, summary2 = self._run()
        self.assertEqual(code2, 0)
        self.assertEqual(summary2.get('ok'), True)

        backlog2 = json.loads(self.mod.BACKLOG_PATH.read_text(encoding='utf-8'))
        task_ids2 = [item.get('id') for item in backlog2.get('items', [])]
        growth_ids2 = [task_id for task_id in task_ids2 if isinstance(task_id, str) and task_id.startswith('clawmart-growth-')]
        promo_ids2 = [task_id for task_id in task_ids2 if isinstance(task_id, str) and task_id.startswith('clawmart-promo-')]
        outreach_ids2 = [task_id for task_id in task_ids2 if isinstance(task_id, str) and task_id.startswith('clawmart-outreach-')]
        channel_setup_ids2 = [task_id for task_id in task_ids2 if isinstance(task_id, str) and task_id.startswith('clawmart-channel-setup-')]
        self.assertEqual(len(growth_ids2), 1)
        self.assertEqual(len(promo_ids2), 1)
        self.assertEqual(len(outreach_ids2), 1)
        self.assertEqual(len(channel_setup_ids2), 1)


if __name__ == '__main__':
    unittest.main()
