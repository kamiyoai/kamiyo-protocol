#!/usr/bin/env python3
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Optional, Tuple

HOME_DIR = Path(os.environ.get('HOME', '~')).expanduser()
WORKSPACE = HOME_DIR / '.openclaw' / 'workspace'
RUNTIME_DIR = WORKSPACE / 'runtime'
FEEDS_DIR = RUNTIME_DIR / 'feeds'
QUEUE_DIR = RUNTIME_DIR / 'queue'
TOOLS_DIR = RUNTIME_DIR / 'tools'
MISSION_CONTROL_DIR = RUNTIME_DIR / 'mission-control'
STATE_DIR = RUNTIME_DIR / 'state'
LOG_DIR = RUNTIME_DIR / 'logs'

OUTPUT_PATH = STATE_DIR / 'runtime-artifact-contracts.json'
LOG_PATH = LOG_DIR / 'runtime-artifact-contracts.jsonl'

SAMPLE_LIMIT = max(1, min(500, int(os.getenv('KYO_ARTIFACT_CONTRACT_SAMPLE_LIMIT', '200'))))


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_bool(value: Optional[str], fallback: bool) -> bool:
    if value is None:
        return fallback
    normalized = value.strip().lower()
    if normalized in {'1', 'true', 'yes', 'on'}:
        return True
    if normalized in {'0', 'false', 'no', 'off'}:
        return False
    return fallback


def ensure_dirs() -> None:
    for path in (WORKSPACE, RUNTIME_DIR, FEEDS_DIR, QUEUE_DIR, TOOLS_DIR, MISSION_CONTROL_DIR, STATE_DIR, LOG_DIR):
        path.mkdir(parents=True, exist_ok=True)
        path.chmod(0o700)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + '\n', encoding='utf-8')
    path.chmod(0o600)


def append_log(payload: dict[str, Any]) -> None:
    with LOG_PATH.open('a', encoding='utf-8') as handle:
        handle.write(json.dumps(payload, ensure_ascii=True) + '\n')
    LOG_PATH.chmod(0o600)


def load_json(path: Path) -> Tuple[Any, Optional[str]]:
    try:
        return json.loads(path.read_text(encoding='utf-8')), None
    except Exception as exc:
        return None, str(exc)


def non_empty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def list_of_strings(value: Any) -> bool:
    return isinstance(value, list) and all(isinstance(item, str) for item in value)


def number(value: Any) -> bool:
    return isinstance(value, (int, float))


def add_error(errors: list[dict[str, Any]], artifact: str, code: str, message: str) -> None:
    errors.append({'artifact': artifact, 'code': code, 'message': message})


def validate_opportunities(payload: Any, errors: list[dict[str, Any]]) -> None:
    artifact = 'opportunities'
    if not isinstance(payload, dict):
        add_error(errors, artifact, 'invalid_root', 'must be a JSON object')
        return

    opportunities = payload.get('opportunities')
    if not isinstance(opportunities, list):
        add_error(errors, artifact, 'missing_opportunities', 'opportunities must be an array')
        return

    accepted = payload.get('accepted')
    if accepted is not None and (not isinstance(accepted, int) or accepted < 0):
        add_error(errors, artifact, 'invalid_accepted', 'accepted must be a non-negative integer')

    for index, item in enumerate(opportunities[:SAMPLE_LIMIT]):
        if not isinstance(item, dict):
            add_error(errors, artifact, 'invalid_item', f'opportunities[{index}] must be an object')
            continue
        for field in ('id', 'source', 'title', 'summary'):
            if not non_empty_string(item.get(field)):
                add_error(errors, artifact, 'missing_field', f'opportunities[{index}].{field} must be non-empty string')
        confidence = item.get('confidence')
        if confidence is None or not number(confidence):
            add_error(errors, artifact, 'invalid_confidence', f'opportunities[{index}].confidence must be a number')
        else:
            confidence_value = float(confidence)
            if confidence_value < 0.0 or confidence_value > 1.0:
                add_error(errors, artifact, 'confidence_range', f'opportunities[{index}].confidence must be between 0 and 1')
        if item.get('tags') is not None and not list_of_strings(item.get('tags')):
            add_error(errors, artifact, 'invalid_tags', f'opportunities[{index}].tags must be an array of strings')
        if item.get('roleHints') is not None and not list_of_strings(item.get('roleHints')):
            add_error(errors, artifact, 'invalid_role_hints', f'opportunities[{index}].roleHints must be an array of strings')


def validate_assignments(payload: Any, errors: list[dict[str, Any]]) -> None:
    artifact = 'assignments'
    if not isinstance(payload, dict):
        add_error(errors, artifact, 'invalid_root', 'must be a JSON object')
        return

    assignments = payload.get('assignments')
    if not isinstance(assignments, list):
        add_error(errors, artifact, 'missing_assignments', 'assignments must be an array')
        return

    for index, item in enumerate(assignments[:SAMPLE_LIMIT]):
        if not isinstance(item, dict):
            add_error(errors, artifact, 'invalid_item', f'assignments[{index}] must be an object')
            continue
        for field in ('missionId', 'agentId', 'opportunityId', 'objective', 'status'):
            if not non_empty_string(item.get(field)):
                add_error(errors, artifact, 'missing_field', f'assignments[{index}].{field} must be non-empty string')
        if item.get('score') is not None and not number(item.get('score')):
            add_error(errors, artifact, 'invalid_score', f'assignments[{index}].score must be numeric')


def validate_tool_health(payload: Any, errors: list[dict[str, Any]]) -> None:
    artifact = 'tool_health'
    if not isinstance(payload, dict):
        add_error(errors, artifact, 'invalid_root', 'must be a JSON object')
        return
    if not isinstance(payload.get('ok'), bool):
        add_error(errors, artifact, 'invalid_ok', 'ok must be boolean')
    checks = payload.get('checks')
    if not isinstance(checks, list):
        add_error(errors, artifact, 'missing_checks', 'checks must be an array')
        return

    for index, item in enumerate(checks[:SAMPLE_LIMIT]):
        if not isinstance(item, dict):
            add_error(errors, artifact, 'invalid_item', f'checks[{index}] must be an object')
            continue
        if not non_empty_string(item.get('id')):
            add_error(errors, artifact, 'missing_id', f'checks[{index}].id must be non-empty string')
        if not non_empty_string(item.get('kind')):
            add_error(errors, artifact, 'missing_kind', f'checks[{index}].kind must be non-empty string')
        if not isinstance(item.get('ok'), bool):
            add_error(errors, artifact, 'invalid_check_ok', f'checks[{index}].ok must be boolean')


def validate_board(payload: Any, errors: list[dict[str, Any]]) -> None:
    artifact = 'mission_control_board'
    if not isinstance(payload, dict):
        add_error(errors, artifact, 'invalid_root', 'must be a JSON object')
        return
    if not isinstance(payload.get('ok'), bool):
        add_error(errors, artifact, 'invalid_ok', 'ok must be boolean')
    if payload.get('backlogCount') is not None and (not isinstance(payload.get('backlogCount'), int) or payload.get('backlogCount') < 0):
        add_error(errors, artifact, 'invalid_backlog_count', 'backlogCount must be a non-negative integer')
    if payload.get('focus') is not None and not list_of_strings(payload.get('focus')):
        add_error(errors, artifact, 'invalid_focus', 'focus must be an array of strings')


def validate_backlog(payload: Any, errors: list[dict[str, Any]]) -> None:
    artifact = 'mission_control_backlog'
    if not isinstance(payload, dict):
        add_error(errors, artifact, 'invalid_root', 'must be a JSON object')
        return

    items = payload.get('items')
    if not isinstance(items, list):
        add_error(errors, artifact, 'missing_items', 'items must be an array')
        return

    for index, item in enumerate(items[:SAMPLE_LIMIT]):
        if not isinstance(item, dict):
            add_error(errors, artifact, 'invalid_item', f'items[{index}] must be an object')
            continue
        for field in ('id', 'type', 'priority', 'title', 'objective', 'status'):
            if not non_empty_string(item.get(field)):
                add_error(errors, artifact, 'missing_field', f'items[{index}].{field} must be non-empty string')


def validate_runtime_state(payload: Any, errors: list[dict[str, Any]]) -> None:
    artifact = 'kyoshin_runtime'
    if not isinstance(payload, dict):
        add_error(errors, artifact, 'invalid_root', 'must be a JSON object')
        return
    if not isinstance(payload.get('ok'), bool):
        add_error(errors, artifact, 'invalid_ok', 'ok must be boolean')
    if payload.get('ok') is True and not isinstance(payload.get('summary'), dict):
        add_error(errors, artifact, 'missing_summary', 'summary must be an object when ok=true')
    if payload.get('ok') is False and payload.get('error') is not None and not non_empty_string(payload.get('error')):
        add_error(errors, artifact, 'invalid_error', 'error must be non-empty string when provided')


def validate_artifact(
    name: str,
    path: Path,
    required: bool,
    validator: Callable[[Any, list[dict[str, Any]]], None],
    errors: list[dict[str, Any]],
    reports: list[dict[str, Any]],
) -> None:
    if not path.exists():
        reports.append({'artifact': name, 'path': str(path), 'present': False, 'valid': not required})
        if required:
            add_error(errors, name, 'missing_file', 'required artifact missing')
        return

    payload, decode_error = load_json(path)
    if decode_error is not None:
        reports.append({'artifact': name, 'path': str(path), 'present': True, 'valid': False})
        add_error(errors, name, 'invalid_json', decode_error[:240])
        return

    count_before = len(errors)
    validator(payload, errors)
    valid = len(errors) == count_before
    reports.append({'artifact': name, 'path': str(path), 'present': True, 'valid': valid})


def run() -> int:
    ensure_dirs()
    require_runtime = parse_bool(os.getenv('KYO_REQUIRE_KYOSHIN_RUNTIME'), True)

    errors: list[dict[str, Any]] = []
    reports: list[dict[str, Any]] = []
    checks = [
        ('opportunities', FEEDS_DIR / 'opportunities.json', True, validate_opportunities),
        ('assignments', QUEUE_DIR / 'assignments.json', True, validate_assignments),
        ('tool_health', TOOLS_DIR / 'tool-health.json', True, validate_tool_health),
        ('mission_control_board', MISSION_CONTROL_DIR / 'board.json', True, validate_board),
        ('mission_control_backlog', MISSION_CONTROL_DIR / 'backlog.json', True, validate_backlog),
        ('kyoshin_runtime', STATE_DIR / 'kyoshin-runtime.json', require_runtime, validate_runtime_state),
    ]

    for name, path, required, validator in checks:
        validate_artifact(name, path, required, validator, errors, reports)

    out = {
        'ok': len(errors) == 0,
        'at': now_iso(),
        'filesChecked': len(checks),
        'filesPresent': len([row for row in reports if row.get('present')]),
        'filesValid': len([row for row in reports if row.get('valid')]),
        'errors': errors,
        'reports': reports,
    }
    write_json(OUTPUT_PATH, out)
    append_log(
        {
            'at': out['at'],
            'event': 'runtime_artifact_contracts',
            'ok': out['ok'],
            'filesChecked': out['filesChecked'],
            'filesPresent': out['filesPresent'],
            'filesValid': out['filesValid'],
            'errorCount': len(errors),
        }
    )
    print(json.dumps(out, ensure_ascii=True))
    return 0 if out['ok'] else 1


if __name__ == '__main__':
    raise SystemExit(run())
