#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

HOME_DIR = Path(os.environ.get('HOME', '~')).expanduser()
WORKSPACE = HOME_DIR / '.openclaw' / 'workspace'
RUNTIME_DIR = WORKSPACE / 'runtime'
STATE_DIR = RUNTIME_DIR / 'state'
LOG_DIR = RUNTIME_DIR / 'logs'
LEARNINGS_DIR = WORKSPACE / '.learnings'
LEARNINGS_PATH = LEARNINGS_DIR / 'LEARNINGS.md'
STATE_PATH = STATE_DIR / 'learnings-state.json'
LOOP_LOG_PATH = LOG_DIR / 'autonomy-loop.jsonl'

MAX_ENTRIES = max(50, min(5000, int(os.getenv('KYO_LEARNINGS_MAX_ENTRIES', '661'))))
MAX_SIGNATURES = max(20, min(500, int(os.getenv('KYO_LEARNINGS_RECENT_SIGNATURES', '200'))))


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_dirs() -> None:
    for path in (WORKSPACE, RUNTIME_DIR, STATE_DIR, LOG_DIR, LEARNINGS_DIR):
        path.mkdir(parents=True, exist_ok=True)
        path.chmod(0o700)


def write_text(path: Path, value: str) -> None:
    path.write_text(value, encoding='utf-8')
    path.chmod(0o600)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + '\n', encoding='utf-8')
    path.chmod(0o600)


def read_json(path: Path, fallback: dict[str, Any]) -> dict[str, Any]:
    if not path.exists():
        return fallback
    try:
        payload = json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return fallback
    if not isinstance(payload, dict):
        return fallback
    return payload


def read_last_tick_event() -> dict[str, Any]:
    if not LOOP_LOG_PATH.exists():
        return {}
    lines = LOOP_LOG_PATH.read_text(encoding='utf-8').splitlines()
    for line in reversed(lines):
        row = line.strip()
        if not row:
            continue
        try:
            payload = json.loads(row)
        except Exception:
            continue
        if isinstance(payload, dict) and payload.get('event') == 'autonomy_tick':
            return payload
    return {}


def ensure_learnings_file() -> None:
    if LEARNINGS_PATH.exists():
        LEARNINGS_PATH.chmod(0o600)
        return
    seed = """# LEARNINGS

This file is the runtime flywheel. Every repeated mistake must become an explicit rule.

Format:
## <timestamp> | cycle <n> | <status>
- Mistake: <what failed>
- Correction: <what changed immediately>
- Rule: <durable rule to prevent recurrence>
- Evidence: <error signature or artifact path>
"""
    write_text(LEARNINGS_PATH, seed)


def normalize_error(value: str) -> str:
    lowered = value.lower().strip()
    lowered = re.sub(r'\s+', ' ', lowered)
    lowered = re.sub(r'\d+', '#', lowered)
    return lowered[:600]


def make_signature(status: str, error: str) -> str:
    material = f"{status}|{normalize_error(error)}"
    digest = hashlib.sha256(material.encode('utf-8')).hexdigest()
    return digest[:24]


def infer_rule(error: str) -> tuple[str, str, str]:
    normalized = normalize_error(error)
    if not normalized:
        return (
            'Cycle degraded without explicit error metadata.',
            'Add explicit failure metadata to the loop state and artifact logs before tick close.',
            'Every degraded tick must emit one machine-readable primary failure cause.',
        )

    mapping: list[tuple[list[str], str, str]] = [
        (
            ['insufficient credits', 'provider request failed', 'authentication error', 'llm request rejected'],
            'LLM/provider dependency failed during unattended execution.',
            'Gate execution on provider credit/auth preflight and pause discretionary tasks when unhealthy.',
            'No autonomous execution if model credits/auth status is not green.',
        ),
        (
            ['gateway', 'openclaw_dispatch_failed', 'openclaw_tools_invoke_failed'],
            'OpenClaw gateway availability or invocation path failed.',
            'Run gateway health check before task dispatch and fail fast with recovery command.',
            'Never dispatch tasks when gateway health is red.',
        ),
        (
            ['tool_health_failed', 'missing_tool_health', 'tool check'],
            'Required toolchain was unavailable or failing.',
            'Repair/replace critical tool adapters and update tool registry checks.',
            'Critical tools must pass health checks before assignment execution.',
        ),
        (
            ['context_incomplete', 'missing_context_guard'],
            'Mission context files were incomplete or missing.',
            'Restore required context files and enforce non-placeholder content.',
            'Every tick must run with complete mission context.',
        ),
        (
            ['planner_failed', 'marketplace_failed', 'feed_sync_failed'],
            'Feed intake/planning pipeline failed, reducing earning throughput.',
            'Validate feed endpoints, auth, and schema before planner execution.',
            'No earning claims without fresh opportunities + planner output.',
        ),
        (
            ['mission_control_failed'],
            'Mission control board/backlog generation failed.',
            'Rebuild mission-control artifacts and ensure backlog write path is healthy.',
            'Backlog must be updated before loop close.',
        ),
        (
            ['proactive_failed'],
            'Scheduled proactive execution failed.',
            'Reduce proactive scope to one safe action and retry with bounded timeout.',
            'Nightly proactive task must be safe, bounded, and evidence-backed.',
        ),
    ]

    for patterns, mistake, correction, rule in mapping:
        if any(pattern in normalized for pattern in patterns):
            return mistake, correction, rule

    return (
        f'Unhandled degradation signature: {normalized[:180]}',
        'Capture exact failure source and convert it into a deterministic preflight or guard check.',
        'Every new failure class must produce a new explicit prevention rule.',
    )


def format_entry(timestamp: str, cycle: int, status: str, mistake: str, correction: str, rule: str, evidence: str) -> str:
    return (
        f"## {timestamp} | cycle {cycle} | {status}\n"
        f"- Mistake: {mistake}\n"
        f"- Correction: {correction}\n"
        f"- Rule: {rule}\n"
        f"- Evidence: {evidence}\n"
    )


def trim_entries(raw: str, max_entries: int) -> str:
    lines = raw.splitlines()
    starts = [idx for idx, line in enumerate(lines) if line.startswith('## ')]
    if len(starts) <= max_entries:
        return raw if raw.endswith('\n') else raw + '\n'
    keep_starts = starts[-max_entries:]
    header_end = starts[0]
    out_lines = lines[:header_end]
    for idx, start in enumerate(keep_starts):
        end = keep_starts[idx + 1] if idx + 1 < len(keep_starts) else len(lines)
        out_lines.extend(lines[start:end])
    return '\n'.join(out_lines).strip() + '\n'


def count_entries(raw: str) -> int:
    return sum(1 for line in raw.splitlines() if line.startswith('## '))


def run() -> int:
    parser = argparse.ArgumentParser(description='Record autonomous runtime learnings.')
    parser.add_argument('--status', default='', help='tick status (ok/degraded)')
    parser.add_argument('--cycle', type=int, default=-1, help='loop cycle number')
    parser.add_argument('--error', default='', help='error summary string')
    parser.add_argument('--at', default='', help='timestamp in ISO format')
    parser.add_argument('--force', action='store_true', help='append even if status is ok')
    args = parser.parse_args()

    ensure_dirs()
    ensure_learnings_file()

    tick = read_last_tick_event()
    status = (args.status or str(tick.get('status', '')).strip() or 'unknown').strip()
    cycle = args.cycle if args.cycle >= 0 else int(tick.get('cycle', 0) or 0)
    error = (args.error or str(tick.get('agentReply', '')).strip()).strip()
    if not error:
        error = str(tick.get('lastError', '')).strip()
    timestamp = (args.at or str(tick.get('at', '')).strip() or now_iso()).strip()

    should_append = args.force or (status != 'ok')
    if not should_append:
        current = LEARNINGS_PATH.read_text(encoding='utf-8')
        output = {
            'ok': True,
            'appended': False,
            'reason': 'status_ok',
            'status': status,
            'cycle': cycle,
            'entries': count_entries(current),
            'path': str(LEARNINGS_PATH),
        }
        print(json.dumps(output, ensure_ascii=True))
        return 0

    signature = make_signature(status, error)
    state = read_json(
        STATE_PATH,
        {'entries': 0, 'lastAppendedAt': None, 'recentSignatures': []},
    )
    recent = state.get('recentSignatures')
    if not isinstance(recent, list):
        recent = []
    recent = [str(item) for item in recent if isinstance(item, str)]

    if signature in recent and not args.force:
        current = LEARNINGS_PATH.read_text(encoding='utf-8')
        output = {
            'ok': True,
            'appended': False,
            'reason': 'duplicate_signature',
            'signature': signature,
            'status': status,
            'cycle': cycle,
            'entries': count_entries(current),
            'path': str(LEARNINGS_PATH),
        }
        print(json.dumps(output, ensure_ascii=True))
        return 0

    mistake, correction, rule = infer_rule(error)
    evidence = normalize_error(error) or f"status={status}"
    entry = format_entry(timestamp, cycle, status, mistake, correction, rule, evidence)

    current = LEARNINGS_PATH.read_text(encoding='utf-8')
    updated = current.rstrip() + '\n\n' + entry
    updated = trim_entries(updated, MAX_ENTRIES)
    write_text(LEARNINGS_PATH, updated)
    entry_count = count_entries(updated)

    next_recent = (recent + [signature])[-MAX_SIGNATURES:]
    next_state = {
        'entries': entry_count,
        'lastAppendedAt': timestamp,
        'lastCycle': cycle,
        'lastStatus': status,
        'lastSignature': signature,
        'recentSignatures': next_recent,
    }
    write_json(STATE_PATH, next_state)

    output = {
        'ok': True,
        'appended': True,
        'status': status,
        'cycle': cycle,
        'signature': signature,
        'entries': entry_count,
        'path': str(LEARNINGS_PATH),
        'statePath': str(STATE_PATH),
    }
    print(json.dumps(output, ensure_ascii=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(run())
