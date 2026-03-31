import importlib.util
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch


SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'kamiyo-agent-distribution-engine.py'


def load_module():
    spec = importlib.util.spec_from_file_location('kamiyo_agent_distribution_engine', SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError('failed to load kamiyo-agent-distribution-engine.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class KamiyoAgentDistributionEngineTests(unittest.TestCase):
    def setUp(self):
        self.mod = load_module()
        self.tmp = TemporaryDirectory()
        self.workspace = Path(self.tmp.name) / 'workspace'
        self.runtime = self.workspace / 'runtime'
        self.state_dir = self.runtime / 'state'
        self.mission_control_dir = self.runtime / 'mission-control'
        self.receipts_dir = self.runtime / 'receipts'
        self.log_dir = self.runtime / 'logs'

        self.mod.WORKSPACE = self.workspace
        self.mod.RUNTIME_DIR = self.runtime
        self.mod.STATE_DIR = self.state_dir
        self.mod.MISSION_CONTROL_DIR = self.mission_control_dir
        self.mod.RECEIPTS_DIR = self.receipts_dir
        self.mod.LOG_DIR = self.log_dir

        self.mod.BACKLOG_PATH = self.mission_control_dir / 'backlog.json'
        self.mod.STATE_PATH = self.state_dir / 'distribution-engine-state.json'
        self.mod.OUTPUT_PATH = self.state_dir / 'distribution-engine.json'
        self.mod.LOG_PATH = self.log_dir / 'distribution-engine.jsonl'
        self.mod.DISPATCH_RECEIPTS_PATH = self.receipts_dir / 'distribution-dispatch.jsonl'

        self.mod.ENABLE_DISTRIBUTION_ENGINE = True
        self.mod.MAX_DISPATCH_PER_CHANNEL_DAY = 5
        self.mod.FAILURE_THRESHOLD = 2
        self.mod.CHANNEL_COOLDOWN_MINUTES = 60
        self.mod.CONTENT_COOLDOWN_MINUTES = 60
        self.mod.FALLBACK_ORDER = ['telegram', 'discord', 'slack']
        self.mod.REQUIRE_SAFE_COPY = True

    def tearDown(self):
        self.tmp.cleanup()

    def _write_backlog(self, items: list[dict]) -> None:
        self.mod.BACKLOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.mod.BACKLOG_PATH.write_text(
            json.dumps({'ok': True, 'at': '2026-02-28T00:00:00Z', 'items': items}),
            encoding='utf-8',
        )

    def _run(self, env: dict[str, str] | None = None) -> tuple[int, dict]:
        stdout = io.StringIO()
        with patch.dict(self.mod.os.environ, env or {}, clear=False):
            with patch('sys.stdout', stdout):
                code = self.mod.run()
        return code, json.loads(stdout.getvalue().strip())

    def test_skips_when_no_channel_credentials_exist(self):
        self._write_backlog(
            [
                {
                    'id': 'promo-1',
                    'type': 'clawmart_promo_blast',
                    'posts': [{'id': 'post-1', 'channel': 'x', 'text': 'Kamiyo Agent offer is live'}],
                }
            ]
        )

        code, summary = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(summary.get('candidateMessages'), 1)
        self.assertEqual(summary.get('attempted'), 0)
        self.assertEqual(summary.get('successful'), 0)
        self.assertEqual(summary.get('skipped'), 1)
        self.assertEqual(summary.get('receiptsAdded'), 1)

    def test_uses_fallback_channel_and_records_success(self):
        self._write_backlog(
            [
                {
                    'id': 'promo-2',
                    'type': 'clawmart_promo_blast',
                    'posts': [{'id': 'post-2', 'channel': 'x', 'text': 'Autonomous revenue loop, auditable receipts.'}],
                }
            ]
        )

        def fake_dispatch(channel: str, message: str, channels: dict):
            if channel == 'telegram':
                return True, ''
            return False, 'unavailable'

        with patch.object(self.mod, 'dispatch', side_effect=fake_dispatch):
            code, summary = self._run({'TELEGRAM_BOT_TOKEN': 'token', 'KYO_TELEGRAM_CHAT_ID': '123'})

        self.assertEqual(code, 0)
        self.assertEqual(summary.get('attempted'), 1)
        self.assertEqual(summary.get('successful'), 1)
        self.assertEqual(summary.get('failed'), 0)
        self.assertAlmostEqual(float(summary.get('dispatchSuccessRate')), 1.0, places=6)

        rows = [line.strip() for line in self.mod.DISPATCH_RECEIPTS_PATH.read_text(encoding='utf-8').splitlines() if line.strip()]
        self.assertEqual(len(rows), 1)
        receipt = json.loads(rows[0])
        self.assertEqual(receipt.get('channel'), 'telegram')
        self.assertEqual(receipt.get('status'), 'success')

    def test_failure_streak_triggers_channel_cooldown(self):
        self._write_backlog(
            [
                {
                    'id': 'outreach-1',
                    'type': 'clawmart_outreach_sprint',
                    'targets': [{'id': 't-1', 'dm': 'Hello, operator package is ready.'}],
                }
            ]
        )

        with patch.object(self.mod, 'dispatch', return_value=(False, 'http_500')):
            code1, _ = self._run({'TELEGRAM_BOT_TOKEN': 'token', 'KYO_TELEGRAM_CHAT_ID': '123'})
            self.assertEqual(code1, 0)
            code2, _ = self._run({'TELEGRAM_BOT_TOKEN': 'token', 'KYO_TELEGRAM_CHAT_ID': '123'})
            self.assertEqual(code2, 0)

        state = json.loads(self.mod.STATE_PATH.read_text(encoding='utf-8'))
        cooldowns = state.get('channelCooldownUntil') or {}
        self.assertIn('telegram', cooldowns)


if __name__ == '__main__':
    unittest.main()
