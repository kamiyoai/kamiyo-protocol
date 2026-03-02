from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
from typing import Optional
import unittest


SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'kyoshin-autonomy-loop.sh'

EXPECTED_STAGE_ORDER = [
    'x402_feed',
    'dx_terminal_feed',
    'feed_sync',
    'context_guard',
    'sentry_pipeline',
    'tool_health',
    'marketplace_intake',
    'receipt_sync',
    'swarm_governor',
    'swarm_planner',
    'runtime_bridge',
    'revenue_guard',
    'trading_feed',
    'trading_exec',
    'trading_route',
    'x402_agentcash',
    'clawmart_staking_route',
    'clawmart_monitor',
    'distribution_engine',
    'mission_control',
    'artifact_contracts',
    'learnings',
    'operator_log',
]
EXPECTED_STAGE_ORDER_WITH_MEMORY_EXTRACT = EXPECTED_STAGE_ORDER[:-1] + ['memory_extract', 'operator_log']
EXPECTED_STAGE_ORDER_WITHOUT_SENTRY_PIPELINE = [stage for stage in EXPECTED_STAGE_ORDER if stage != 'sentry_pipeline']
EXPECTED_STAGE_ORDER_WITHOUT_CLAWMART_MONITOR = [stage for stage in EXPECTED_STAGE_ORDER if stage != 'clawmart_monitor']
EXPECTED_STAGE_ORDER_WITHOUT_CLAWMART_STAKING_ROUTE = [stage for stage in EXPECTED_STAGE_ORDER if stage != 'clawmart_staking_route']
EXPECTED_STAGE_ORDER_WITHOUT_X402_AGENTCASH = [stage for stage in EXPECTED_STAGE_ORDER if stage != 'x402_agentcash']
EXPECTED_STAGE_ORDER_WITHOUT_TRADING = [
    stage
    for stage in EXPECTED_STAGE_ORDER
    if stage not in {'trading_feed', 'trading_exec', 'trading_route'}
]


class KyoshinAutonomyLoopContractTests(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.home = Path(self.tmp.name) / 'home'
        self.bin_dir = self.home / 'bin'
        self.bin_dir.mkdir(parents=True, exist_ok=True)
        self.order_file = self.home / 'order.log'

    def tearDown(self):
        self.tmp.cleanup()

    def _write_exec(self, path: Path, body: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body, encoding='utf-8')
        path.chmod(0o700)

    def _write_default_scripts(self) -> None:
        self._write_exec(
            self.bin_dir / 'kyoshin-x402-feed.py',
            f"""#!/usr/bin/env bash
set -euo pipefail
echo "x402_feed" >> "{self.order_file}"
echo '{{"ok":true,"accepted":0}}'
""",
        )
        self._write_exec(
            self.bin_dir / 'kyoshin-dx-terminal-feed.py',
            f"""#!/usr/bin/env bash
set -euo pipefail
echo "dx_terminal_feed" >> "{self.order_file}"
echo '{{"ok":true,"accepted":0}}'
""",
        )
        self._write_exec(
            self.bin_dir / 'kyoshin-sync-feed-config.py',
            f"""#!/usr/bin/env bash
set -euo pipefail
echo "feed_sync" >> "{self.order_file}"
echo '{{"ok":true}}'
""",
        )
        self._write_exec(
            self.bin_dir / 'kyoshin-context-guard.py',
            f"""#!/usr/bin/env bash
set -euo pipefail
echo "context_guard" >> "{self.order_file}"
echo '{{"ok":true,"requiredMissing":[]}}'
""",
        )
        self._write_exec(
            self.bin_dir / 'kyoshin-sentry-pipeline.py',
            f"""#!/usr/bin/env bash
set -euo pipefail
echo "sentry_pipeline" >> "{self.order_file}"
echo '{{"ok":true,"status":"ok","totalIncidents":0}}'
""",
        )
        self._write_exec(
            self.bin_dir / 'kyoshin-tool-health.py',
            f"""#!/usr/bin/env bash
set -euo pipefail
echo "tool_health" >> "{self.order_file}"
echo '{{"ok":true,"criticalFailures":[]}}'
""",
        )
        self._write_exec(
            self.bin_dir / 'kyoshin-marketplace-intake.py',
            f"""#!/usr/bin/env bash
set -euo pipefail
echo "marketplace_intake" >> "{self.order_file}"
echo '{{"ok":true,"accepted":0}}'
""",
        )
        self._write_exec(
            self.bin_dir / 'kyoshin-receipt-sync.py',
            f"""#!/usr/bin/env bash
set -euo pipefail
echo "receipt_sync" >> "{self.order_file}"
echo '{{"ok":true,"status":"ok","appendedReceipts":0}}'
""",
        )
        self._write_exec(
            self.bin_dir / 'kyoshin-swarm-governor.py',
            f"""#!/usr/bin/env bash
set -euo pipefail
echo "swarm_governor" >> "{self.order_file}"
echo '{{"ok":true}}'
""",
        )
        self._write_exec(
            self.bin_dir / 'kyoshin-swarm-planner.py',
            f"""#!/usr/bin/env bash
set -euo pipefail
echo "swarm_planner" >> "{self.order_file}"
echo '{{"ok":true}}'
""",
        )
        self._write_exec(
            self.bin_dir / 'kyoshin-runtime-bridge.py',
            f"""#!/usr/bin/env bash
set -euo pipefail
echo "runtime_bridge" >> "{self.order_file}"
echo '{{"ok":true}}'
""",
        )
        self._write_exec(
            self.bin_dir / 'kyoshin-mission-control.py',
            f"""#!/usr/bin/env bash
set -euo pipefail
echo "mission_control" >> "{self.order_file}"
echo '{{"ok":true}}'
""",
        )
        self._write_exec(
            self.bin_dir / 'kyoshin-revenue-guard.py',
            f"""#!/usr/bin/env bash
set -euo pipefail
echo "revenue_guard" >> "{self.order_file}"
echo '{{"ok":true,"status":"ok","blockPaidExecution":false}}'
""",
        )
        self._write_exec(
            self.bin_dir / 'kyoshin-trading-feed.py',
            f"""#!/usr/bin/env bash
set -euo pipefail
echo "trading_feed" >> "{self.order_file}"
echo '{{"ok":true,"status":"ok","accepted":1}}'
""",
        )
        self._write_exec(
            self.bin_dir / 'kyoshin-trading-exec.py',
            f"""#!/usr/bin/env bash
set -euo pipefail
echo "trading_exec" >> "{self.order_file}"
echo '{{"ok":true,"status":"ok","executedTrades":1}}'
""",
        )
        self._write_exec(
            self.bin_dir / 'kyoshin-trading-staking-route.py',
            f"""#!/usr/bin/env bash
set -euo pipefail
echo "trading_route" >> "{self.order_file}"
echo '{{"ok":true,"status":"up_to_date"}}'
""",
        )
        self._write_exec(
            self.bin_dir / 'kyoshin-x402-agentcash.py',
            f"""#!/usr/bin/env bash
set -euo pipefail
echo "x402_agentcash" >> "{self.order_file}"
echo '{{"ok":true,"status":"ok","executed":1}}'
""",
        )
        self._write_exec(
            self.bin_dir / 'kyoshin-clawmart-staking-route.py',
            f"""#!/usr/bin/env bash
set -euo pipefail
echo "clawmart_staking_route" >> "{self.order_file}"
echo '{{"ok":true,"status":"up_to_date"}}'
""",
        )
        self._write_exec(
            self.bin_dir / 'kyoshin-clawmart-monitor.py',
            f"""#!/usr/bin/env bash
set -euo pipefail
echo "clawmart_monitor" >> "{self.order_file}"
echo '{{"ok":true,"tasksAdded":0}}'
""",
        )
        self._write_exec(
            self.bin_dir / 'kyoshin-distribution-engine.py',
            f"""#!/usr/bin/env bash
set -euo pipefail
echo "distribution_engine" >> "{self.order_file}"
echo '{{"ok":true,"dispatchSuccessRate":1}}'
""",
        )
        self._write_exec(
            self.bin_dir / 'kyoshin-artifact-contracts.py',
            f"""#!/usr/bin/env bash
set -euo pipefail
echo "artifact_contracts" >> "{self.order_file}"
echo '{{"ok":true,"errors":[]}}'
""",
        )
        self._write_exec(
            self.bin_dir / 'kyoshin-learnings.py',
            f"""#!/usr/bin/env bash
set -euo pipefail
echo "learnings" >> "{self.order_file}"
echo '{{"ok":true}}'
""",
        )
        self._write_exec(
            self.bin_dir / 'kyoshin-memory-extract.py',
            f"""#!/usr/bin/env bash
set -euo pipefail
echo "memory_extract" >> "{self.order_file}"
echo '{{"ok":true,"appendedCount":0}}'
""",
        )
        self._write_exec(
            self.bin_dir / 'kyoshin-operator-log.py',
            f"""#!/usr/bin/env bash
set -euo pipefail
echo "operator_log" >> "{self.order_file}"
echo '{{"ok":true,"published":true}}'
""",
        )

    def _write_runtime_bridge_failing(self) -> None:
        self._write_exec(
            self.bin_dir / 'kyoshin-runtime-bridge.py',
            f"""#!/usr/bin/env bash
set -euo pipefail
echo "runtime_bridge" >> "{self.order_file}"
echo "runtime bridge unavailable" >&2
exit 1
""",
        )

    def _write_context_guard_incomplete(self) -> None:
        self._write_exec(
            self.bin_dir / 'kyoshin-context-guard.py',
            f"""#!/usr/bin/env bash
set -euo pipefail
echo "context_guard" >> "{self.order_file}"
echo '{{"ok":true,"requiredMissing":["WORKING-MEMORY.md"]}}'
""",
        )

    def _run_loop(self, extra_env: Optional[dict[str, str]] = None) -> subprocess.CompletedProcess:
        env = os.environ.copy()
        env.update(
            {
                'HOME': str(self.home),
                'PATH': env.get('PATH', ''),
                'KYO_ENABLE_AGENT_HEARTBEAT': 'false',
                'KYO_ENABLE_PROACTIVE_NIGHTLY': 'false',
                'KYO_REQUIRE_RUNTIME_GUARDS': 'true',
                'KYO_REQUIRE_LEARNINGS': 'true',
                'KYO_ENABLE_MEMORY_EXTRACTION': 'false',
                'KYO_ENABLE_SENTRY_PIPELINE': 'true',
                'KYO_ENABLE_CLAWMART_STAKING_ROUTE': 'true',
                'KYO_ENABLE_CLAWMART_MONITOR': 'true',
                'KYO_ENABLE_REVENUE_GUARD': 'true',
                'KYO_REQUIRE_REVENUE_GUARD': 'true',
                'KYO_ENABLE_TRADING_AGENT': 'true',
                'KYO_REQUIRE_TRADING_AGENT': 'false',
                'KYO_ENABLE_X402_AGENTCASH': 'true',
                'KYO_ENABLE_DISTRIBUTION_ENGINE': 'true',
                'KYO_ENABLE_OPERATOR_LOG': 'true',
                'KYO_REQUIRE_KYOSHIN_RUNTIME': 'true',
                'KYO_REQUIRE_RUNTIME_ARTIFACT_CONTRACTS': 'true',
            }
        )
        if extra_env:
            env.update(extra_env)
        return subprocess.run(
            ['bash', str(SCRIPT_PATH)],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
        )

    def _read_state(self) -> dict:
        path = self.home / '.openclaw' / 'workspace' / 'runtime' / 'state' / 'autonomy-loop-state.json'
        return json.loads(path.read_text(encoding='utf-8'))

    def _read_last_log_event(self) -> dict:
        path = self.home / '.openclaw' / 'workspace' / 'runtime' / 'logs' / 'autonomy-loop.jsonl'
        lines = [line.strip() for line in path.read_text(encoding='utf-8').splitlines() if line.strip()]
        return json.loads(lines[-1])

    def _read_stage_order(self) -> list[str]:
        if not self.order_file.exists():
            return []
        return [line.strip() for line in self.order_file.read_text(encoding='utf-8').splitlines() if line.strip()]

    def test_stage_order_contract_on_successful_tick(self):
        self._write_default_scripts()

        result = self._run_loop()
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertEqual(self._read_stage_order(), EXPECTED_STAGE_ORDER)

        event = self._read_last_log_event()
        self.assertEqual(event.get('status'), 'ok')
        self.assertEqual(event.get('cycle'), 1)

        state = self._read_state()
        self.assertEqual(state.get('cycles'), 1)
        self.assertIsNone(state.get('lastError'))

    def test_runtime_bridge_is_hard_gate_by_default(self):
        self._write_default_scripts()
        self._write_runtime_bridge_failing()

        result = self._run_loop()
        self.assertEqual(result.returncode, 1)

        state = self._read_state()
        self.assertIn('runtime_bridge_failed', state.get('lastError', ''))

    def test_runtime_bridge_soft_gate_when_disabled(self):
        self._write_default_scripts()
        self._write_runtime_bridge_failing()

        result = self._run_loop({'KYO_REQUIRE_KYOSHIN_RUNTIME': 'false'})
        self.assertEqual(result.returncode, 0, msg=result.stderr)

        event = self._read_last_log_event()
        self.assertEqual(event.get('status'), 'ok')

        state = self._read_state()
        self.assertIsNone(state.get('lastError'))

    def test_context_guard_missing_required_files_degrades_tick(self):
        self._write_default_scripts()
        self._write_context_guard_incomplete()

        result = self._run_loop()
        self.assertEqual(result.returncode, 1)

        state = self._read_state()
        self.assertIn('context_incomplete', state.get('lastError', ''))

    def test_missing_artifact_contracts_script_degrades_when_required(self):
        self._write_default_scripts()
        (self.bin_dir / 'kyoshin-artifact-contracts.py').unlink()

        result = self._run_loop({'KYO_REQUIRE_RUNTIME_ARTIFACT_CONTRACTS': 'true'})
        self.assertEqual(result.returncode, 1)

        state = self._read_state()
        self.assertIn('artifact_contracts_failed', state.get('lastError', ''))

    def test_missing_receipt_sync_script_degrades_when_required(self):
        self._write_default_scripts()
        (self.bin_dir / 'kyoshin-receipt-sync.py').unlink()

        result = self._run_loop({'KYO_REQUIRE_RECEIPT_SYNC': 'true'})
        self.assertEqual(result.returncode, 1)

        state = self._read_state()
        self.assertIn('receipt_sync_failed', state.get('lastError', ''))

    def test_x402_feed_requires_non_zero_output_when_hard_required(self):
        self._write_default_scripts()
        self._write_exec(
            self.bin_dir / 'kyoshin-x402-feed.py',
            f"""#!/usr/bin/env bash
set -euo pipefail
echo "x402_feed" >> "{self.order_file}"
echo '{{"ok":true,"accepted":0}}'
""",
        )

        result = self._run_loop({'KYO_REQUIRE_X402_FEED': 'true'})
        self.assertEqual(result.returncode, 1)

        state = self._read_state()
        self.assertIn('x402_feed_failed', state.get('lastError', ''))

    def test_dx_terminal_feed_requires_non_zero_output_when_hard_required(self):
        self._write_default_scripts()
        self._write_exec(
            self.bin_dir / 'kyoshin-dx-terminal-feed.py',
            f"""#!/usr/bin/env bash
set -euo pipefail
echo "dx_terminal_feed" >> "{self.order_file}"
echo '{{"ok":false,"accepted":0}}'
""",
        )

        result = self._run_loop({'KYO_REQUIRE_DX_TERMINAL_FEED': 'true'})
        self.assertEqual(result.returncode, 1)

        state = self._read_state()
        self.assertIn('dx_terminal_feed_failed', state.get('lastError', ''))

    def test_sentry_pipeline_can_be_disabled(self):
        self._write_default_scripts()

        result = self._run_loop({'KYO_ENABLE_SENTRY_PIPELINE': 'false'})
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertEqual(self._read_stage_order(), EXPECTED_STAGE_ORDER_WITHOUT_SENTRY_PIPELINE)

    def test_sentry_pipeline_is_hard_gate_when_required(self):
        self._write_default_scripts()
        (self.bin_dir / 'kyoshin-sentry-pipeline.py').unlink()

        result = self._run_loop(
            {
                'KYO_ENABLE_SENTRY_PIPELINE': 'true',
                'KYO_REQUIRE_SENTRY_PIPELINE': 'true',
            }
        )
        self.assertEqual(result.returncode, 1)

        state = self._read_state()
        self.assertIn('sentry_pipeline_failed', state.get('lastError', ''))

    def test_revenue_guard_is_hard_gate_when_required(self):
        self._write_default_scripts()
        (self.bin_dir / 'kyoshin-revenue-guard.py').unlink()

        result = self._run_loop(
            {
                'KYO_ENABLE_REVENUE_GUARD': 'true',
                'KYO_REQUIRE_REVENUE_GUARD': 'true',
            }
        )
        self.assertEqual(result.returncode, 1)

        state = self._read_state()
        self.assertIn('revenue_guard_failed', state.get('lastError', ''))

    def test_x402_agentcash_can_be_disabled(self):
        self._write_default_scripts()
        result = self._run_loop({'KYO_ENABLE_X402_AGENTCASH': 'false'})
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertEqual(self._read_stage_order(), EXPECTED_STAGE_ORDER_WITHOUT_X402_AGENTCASH)

    def test_trading_lane_can_be_disabled(self):
        self._write_default_scripts()
        result = self._run_loop({'KYO_ENABLE_TRADING_AGENT': 'false'})
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertEqual(self._read_stage_order(), EXPECTED_STAGE_ORDER_WITHOUT_TRADING)

    def test_clawmart_monitor_can_be_disabled(self):
        self._write_default_scripts()

        result = self._run_loop({'KYO_ENABLE_CLAWMART_MONITOR': 'false'})
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertEqual(self._read_stage_order(), EXPECTED_STAGE_ORDER_WITHOUT_CLAWMART_MONITOR)

    def test_clawmart_staking_route_can_be_disabled(self):
        self._write_default_scripts()

        result = self._run_loop({'KYO_ENABLE_CLAWMART_STAKING_ROUTE': 'false'})
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertEqual(self._read_stage_order(), EXPECTED_STAGE_ORDER_WITHOUT_CLAWMART_STAKING_ROUTE)

    def test_clawmart_staking_route_is_hard_gate_when_required(self):
        self._write_default_scripts()
        (self.bin_dir / 'kyoshin-clawmart-staking-route.py').unlink()

        result = self._run_loop(
            {
                'KYO_ENABLE_CLAWMART_STAKING_ROUTE': 'true',
                'KYO_REQUIRE_CLAWMART_STAKING_ROUTE': 'true',
            }
        )
        self.assertEqual(result.returncode, 1)

        state = self._read_state()
        self.assertIn('clawmart_staking_route_failed', state.get('lastError', ''))

    def test_clawmart_monitor_is_hard_gate_when_required(self):
        self._write_default_scripts()
        (self.bin_dir / 'kyoshin-clawmart-monitor.py').unlink()

        result = self._run_loop(
            {
                'KYO_ENABLE_CLAWMART_MONITOR': 'true',
                'KYO_REQUIRE_CLAWMART_MONITOR': 'true',
            }
        )
        self.assertEqual(result.returncode, 1)

        state = self._read_state()
        self.assertIn('clawmart_monitor_failed', state.get('lastError', ''))

    def test_memory_extract_runs_when_due_and_enabled(self):
        self._write_default_scripts()
        current_hour = datetime.now(timezone.utc).strftime('%H')

        result = self._run_loop(
            {
                'KYO_ENABLE_MEMORY_EXTRACTION': 'true',
                'KYO_MEMORY_EXTRACTION_HOUR_UTC': current_hour,
            }
        )
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertEqual(self._read_stage_order(), EXPECTED_STAGE_ORDER_WITH_MEMORY_EXTRACT)

    def test_memory_extract_is_hard_gate_when_required(self):
        self._write_default_scripts()
        (self.bin_dir / 'kyoshin-memory-extract.py').unlink()
        current_hour = datetime.now(timezone.utc).strftime('%H')

        result = self._run_loop(
            {
                'KYO_ENABLE_MEMORY_EXTRACTION': 'true',
                'KYO_REQUIRE_MEMORY_EXTRACTION': 'true',
                'KYO_MEMORY_EXTRACTION_HOUR_UTC': current_hour,
            }
        )
        self.assertEqual(result.returncode, 1)

        state = self._read_state()
        self.assertIn('memory_extract_failed', state.get('lastError', ''))


if __name__ == '__main__':
    unittest.main()
