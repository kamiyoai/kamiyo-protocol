#!/usr/bin/env python3
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

HOME_DIR = Path(os.environ.get('HOME', '~')).expanduser()
WORKSPACE = HOME_DIR / '.openclaw' / 'workspace'
RUNTIME_DIR = WORKSPACE / 'runtime'
QUEUE_PATH = RUNTIME_DIR / 'queue' / 'assignments.json'
TOOL_HEALTH_PATH = RUNTIME_DIR / 'tools' / 'tool-health.json'
GOVERNOR_PATH = RUNTIME_DIR / 'state' / 'swarm-governor.json'
MISSION_PATH = WORKSPACE / 'MISSION_STATEMENT.md'
GOALS_PATH = WORKSPACE / 'GOALS.md'
OUTPUT_DIR = RUNTIME_DIR / 'mission-control'
BOARD_PATH = OUTPUT_DIR / 'board.json'
BACKLOG_PATH = OUTPUT_DIR / 'backlog.json'

MAX_BACKLOG_ITEMS = max(5, min(100, int(os.getenv('KYO_MISSION_CONTROL_MAX_BACKLOG', '40'))))


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_dirs() -> None:
    for path in (WORKSPACE, RUNTIME_DIR, OUTPUT_DIR):
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

    governor = read_json(GOVERNOR_PATH, {'decisions': []})
    decisions = governor.get('decisions') if isinstance(governor, dict) else []
    if not isinstance(decisions, list):
        decisions = []
    paused_agents = [row for row in decisions if isinstance(row, dict) and str(row.get('status', '')).lower() == 'paused']

    backlog: list[dict[str, Any]] = []
    for row in critical_failures:
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

    board = {
        'ok': True,
        'at': now_iso(),
        'missionStatement': mission,
        'goals': goals,
        'assignmentQueue': len(queued),
        'criticalToolFailures': len(critical_failures),
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
                'pausedAgents': len(paused_agents),
            },
            ensure_ascii=True,
        )
    )
    return 0


if __name__ == '__main__':
    raise SystemExit(run())
