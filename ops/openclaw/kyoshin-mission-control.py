#!/usr/bin/env python3
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

HOME_DIR = Path(os.environ.get('HOME', '~')).expanduser()
WORKSPACE = HOME_DIR / '.openclaw' / 'workspace'
RUNTIME_DIR = WORKSPACE / 'runtime'
STATE_DIR = RUNTIME_DIR / 'state'
INCIDENTS_DIR = RUNTIME_DIR / 'incidents'
QUEUE_PATH = RUNTIME_DIR / 'queue' / 'assignments.json'
TOOL_HEALTH_PATH = RUNTIME_DIR / 'tools' / 'tool-health.json'
GOVERNOR_PATH = STATE_DIR / 'swarm-governor.json'
KYOSHIN_RUNTIME_PATH = STATE_DIR / 'kyoshin-runtime.json'
SENTRY_TRIAGE_PATH = INCIDENTS_DIR / 'sentry-triage.json'
MISSION_PATH = WORKSPACE / 'MISSION_STATEMENT.md'
GOALS_PATH = WORKSPACE / 'GOALS.md'
OUTPUT_DIR = RUNTIME_DIR / 'mission-control'
BOARD_PATH = OUTPUT_DIR / 'board.json'
BACKLOG_PATH = OUTPUT_DIR / 'backlog.json'

MAX_BACKLOG_ITEMS = max(5, min(100, int(os.getenv('KYO_MISSION_CONTROL_MAX_BACKLOG', '40'))))
MAX_SENTRY_BACKLOG_ITEMS = max(0, min(40, int(os.getenv('KYO_MISSION_CONTROL_MAX_SENTRY_BACKLOG', '12'))))


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_dirs() -> None:
    for path in (WORKSPACE, RUNTIME_DIR, STATE_DIR, OUTPUT_DIR):
        path.mkdir(parents=True, exist_ok=True)
        path.chmod(0o700)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + '\n', encoding='utf-8')
    path.chmod(0o600)


def read_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return fallback


def read_mission() -> str:
    if not MISSION_PATH.exists():
        return ''
    for line in MISSION_PATH.read_text(encoding='utf-8').splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith('#'):
            return stripped
    return ''


def read_goal_lines() -> list[str]:
    if not GOALS_PATH.exists():
        return []
    lines: list[str] = []
    for line in GOALS_PATH.read_text(encoding='utf-8').splitlines():
        stripped = line.strip()
        if stripped.startswith('- '):
            goal = stripped[2:].strip()
            if goal:
                lines.append(goal)
        if len(lines) >= 6:
            break
    return lines


def run() -> int:
    ensure_dirs()

    mission = read_mission()
    goals = read_goal_lines()
    kyoshin_runtime = read_json(KYOSHIN_RUNTIME_PATH, {'ok': False})
    if not isinstance(kyoshin_runtime, dict):
        kyoshin_runtime = {'ok': False}
    runtime_summary = kyoshin_runtime.get('summary') if isinstance(kyoshin_runtime.get('summary'), dict) else {}
    assignments_payload = read_json(QUEUE_PATH, {'assignments': []})
    assignments = assignments_payload.get('assignments') if isinstance(assignments_payload, dict) else []
    if not isinstance(assignments, list):
        assignments = []
    queued = [row for row in assignments if isinstance(row, dict) and str(row.get('status', 'queued')).lower() == 'queued']

    tool_health = read_json(TOOL_HEALTH_PATH, {'checks': []})
    checks = tool_health.get('checks') if isinstance(tool_health, dict) else []
    if not isinstance(checks, list):
        checks = []
    critical_failures = [row for row in checks if isinstance(row, dict) and row.get('critical') and not row.get('ok')]

    sentry_triage = read_json(SENTRY_TRIAGE_PATH, {'incidents': [], 'totals': {}})
    sentry_incidents = sentry_triage.get('incidents') if isinstance(sentry_triage, dict) else []
    sentry_totals = sentry_triage.get('totals') if isinstance(sentry_triage, dict) else {}
    if not isinstance(sentry_incidents, list):
        sentry_incidents = []
    if not isinstance(sentry_totals, dict):
        sentry_totals = {}

    governor = read_json(GOVERNOR_PATH, {'decisions': []})
    decisions = governor.get('decisions') if isinstance(governor, dict) else []
    if not isinstance(decisions, list):
        decisions = []
    paused_agents = [row for row in decisions if isinstance(row, dict) and str(row.get('status', '')).lower() == 'paused']

    backlog: list[dict[str, Any]] = []
    runtime_ok = bool(kyoshin_runtime.get('ok'))
    runtime_last_tick_status = runtime_summary.get('lastTickStatus')
    runtime_mode = runtime_summary.get('mode')
    runtime_last_error = str(runtime_summary.get('lastError') or '').strip()
    treasury_near_cap = bool(runtime_summary.get('treasuryNearCap'))

    if not runtime_ok:
        backlog.append(
            {
                'id': 'runtime-stabilize',
                'type': 'stabilize_runtime',
                'priority': 'high',
                'title': 'Recover Kyoshin runtime health',
                'objective': 'Restore runtime status/health endpoint and clear last tick errors before high-risk execution.',
                'status': 'todo',
            }
        )

    for row in critical_failures:
        if len(backlog) >= MAX_BACKLOG_ITEMS:
            break
        backlog.append(
            {
                'id': f"tool-{row.get('id', 'unknown')}",
                'type': 'build_tool_adapter',
                'priority': 'high',
                'title': f"Restore tool: {row.get('id', 'unknown')}",
                'objective': f"Repair or replace failing tool check: {row.get('target', '')}",
                'status': 'todo',
            }
        )

    sentry_backlog_items = 0
    for row in sentry_incidents:
        if len(backlog) >= MAX_BACKLOG_ITEMS or sentry_backlog_items >= MAX_SENTRY_BACKLOG_ITEMS:
            break
        if not isinstance(row, dict):
            continue
        issue_id = str(row.get('issueId', '')).strip()
        if not issue_id:
            continue
        short_id = str(row.get('shortId', '')).strip() or issue_id
        triage = row.get('triage') if isinstance(row.get('triage'), dict) else {}
        policy = row.get('policy') if isinstance(row.get('policy'), dict) else {}
        route = str(triage.get('route', 'escalate')).strip().lower()
        environment_class = str(row.get('environmentClass', 'unknown')).strip().lower()
        level = str(row.get('level', 'error')).strip().lower()
        priority = 'high' if environment_class == 'production' or level in {'fatal', 'error'} else 'medium'
        backlog.append(
            {
                'id': f'sentry-{issue_id}',
                'type': 'sentry_auto_fix' if route == 'auto_fix' else 'sentry_escalation',
                'priority': priority,
                'title': f"[Sentry] {short_id} {str(row.get('title', 'incident')).strip()[:140]}",
                'objective': str(row.get('nextAction', '')).strip()[:280],
                'status': 'todo',
                'environment': environment_class,
                'route': route,
                'targetBranch': str(policy.get('targetBranch', '')).strip(),
                'issueUrl': str(row.get('permalink', '')).strip(),
            }
        )
        sentry_backlog_items += 1

    for row in queued:
        if len(backlog) >= MAX_BACKLOG_ITEMS:
            break
        mission_id = str(row.get('missionId', '')).strip() or str(row.get('opportunityId', '')).strip() or 'unknown'
        backlog.append(
            {
                'id': mission_id,
                'type': 'execute_assignment',
                'priority': 'high',
                'title': str(row.get('opportunityTitle', 'Queued opportunity')),
                'objective': str(row.get('objective', '')).strip()[:240],
                'status': 'todo',
                'agentId': row.get('agentId'),
            }
        )

    if treasury_near_cap and len(backlog) < MAX_BACKLOG_ITEMS:
        backlog.append(
            {
                'id': 'treasury-near-cap',
                'type': 'treasury_safety',
                'priority': 'high',
                'title': 'Treasury near policy cap',
                'objective': 'Reduce spend pressure and focus only on highest-margin opportunities until utilization falls below 90%.',
                'status': 'todo',
            }
        )

    board = {
        'ok': True,
        'at': now_iso(),
        'missionStatement': mission,
        'goals': goals,
        'runtimeOk': runtime_ok,
        'runtimeMode': runtime_mode,
        'runtimeLastTickStatus': runtime_last_tick_status,
        'runtimeLastError': runtime_last_error,
        'treasuryCapUsedRatio': runtime_summary.get('treasuryCapUsedRatio'),
        'treasuryTxUsedRatio': runtime_summary.get('treasuryTxUsedRatio'),
        'treasuryNearCap': treasury_near_cap,
        'assignmentQueue': len(queued),
        'criticalToolFailures': len(critical_failures),
        'sentryIncidents': len(sentry_incidents),
        'sentryAutoFixCandidates': int(sentry_totals.get('autoFixCandidates') or 0),
        'sentryEscalations': int(sentry_totals.get('escalations') or 0),
        'pausedAgents': len(paused_agents),
        'backlogCount': len(backlog),
        'focus': [
            'Protect mission continuity.',
            'Prioritize paid opportunities with verifiable receipts.',
            'Build missing tools when blocked.',
        ],
    }
    write_json(BOARD_PATH, board)
    write_json(BACKLOG_PATH, {'ok': True, 'at': board['at'], 'items': backlog})
    print(
        json.dumps(
            {
                'ok': True,
                'boardPath': str(BOARD_PATH),
                'backlogPath': str(BACKLOG_PATH),
                'backlogCount': len(backlog),
                'criticalToolFailures': len(critical_failures),
                'sentryIncidents': len(sentry_incidents),
                'sentryBacklogItems': sentry_backlog_items,
                'pausedAgents': len(paused_agents),
                'runtimeOk': runtime_ok,
                'treasuryNearCap': treasury_near_cap,
            },
            ensure_ascii=True,
        )
    )
    return 0


if __name__ == '__main__':
    raise SystemExit(run())
