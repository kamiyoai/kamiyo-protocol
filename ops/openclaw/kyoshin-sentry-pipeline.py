#!/usr/bin/env python3
import argparse
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

HOME_DIR = Path(os.environ.get('HOME', '~')).expanduser()
WORKSPACE = HOME_DIR / '.openclaw' / 'workspace'
RUNTIME_DIR = WORKSPACE / 'runtime'
STATE_DIR = RUNTIME_DIR / 'state'
HOOKS_DIR = RUNTIME_DIR / 'hooks'
INCIDENTS_DIR = RUNTIME_DIR / 'incidents'
LOG_DIR = RUNTIME_DIR / 'logs'

INBOX_PATH = Path(os.getenv('KYO_SENTRY_WEBHOOK_INBOX_PATH', str(HOOKS_DIR / 'sentry-alerts.jsonl'))).expanduser()
OUTPUT_PATH = Path(os.getenv('KYO_SENTRY_TRIAGE_OUTPUT_PATH', str(INCIDENTS_DIR / 'sentry-triage.json'))).expanduser()
STATE_PATH = Path(os.getenv('KYO_SENTRY_TRIAGE_STATE_PATH', str(STATE_DIR / 'sentry-pipeline-state.json'))).expanduser()
LOG_PATH = Path(os.getenv('KYO_SENTRY_TRIAGE_LOG_PATH', str(LOG_DIR / 'kyoshin-sentry-pipeline.jsonl'))).expanduser()

MAX_INCIDENTS = max(10, min(1000, int(os.getenv('KYO_SENTRY_MAX_INCIDENTS', '200'))))

AUTO_FIX_RULES = (
    ('null_reference', re.compile(r'(nullpointer|null reference|none type|cannot read propert)')),
    ('type_mismatch', re.compile(r'(typeerror|type mismatch|cannot cast|unexpected type)')),
    ('missing_symbol', re.compile(r'(missing import|module not found|undefined variable|undefined name|nameerror)')),
    ('edge_case', re.compile(r'(index out of range|keyerror|attributeerror|unhandled edge case)')),
    ('serialization', re.compile(r'(json decode|json parse|serialization|deserialization|invalid json)')),
)

ESCALATE_RULES = (
    ('security_sensitive', re.compile(r'(auth|authentication|authorization|payment|wallet|private key|secret|token|encrypt|signature)')),
    ('schema_change', re.compile(r'(migration|schema|database ddl|alter table|sql migration)')),
    ('architecture', re.compile(r'(architecture|system design|protocol design|distributed lock|consensus logic)')),
    ('business_logic', re.compile(r'(business logic|pricing rule|settlement rule|governance|compliance)')),
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_dirs() -> None:
    for path in (WORKSPACE, RUNTIME_DIR, STATE_DIR, HOOKS_DIR, INCIDENTS_DIR, LOG_DIR):
        path.mkdir(parents=True, exist_ok=True)
        path.chmod(0o700)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + '\n', encoding='utf-8')
    path.chmod(0o600)


def append_json_line(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a', encoding='utf-8') as handle:
        handle.write(json.dumps(payload, ensure_ascii=True) + '\n')
    path.chmod(0o600)


def read_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return fallback


def as_text(value: Any) -> str:
    if value is None:
        return ''
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def classify_environment(value: str) -> str:
    lowered = value.lower()
    if not lowered:
        return 'unknown'
    if any(token in lowered for token in ('prod', 'production', 'mainnet', 'live')):
        return 'production'
    if any(token in lowered for token in ('stag', 'test', 'dev', 'sandbox', 'preprod')):
        return 'staging'
    return 'unknown'


def parse_tags(issue: dict[str, Any]) -> dict[str, str]:
    raw = issue.get('tags')
    if isinstance(raw, dict):
        return {as_text(k): as_text(v) for k, v in raw.items() if as_text(k)}

    if not isinstance(raw, list):
        return {}

    out: dict[str, str] = {}
    for row in raw:
        if not isinstance(row, dict):
            continue
        key = as_text(row.get('key'))
        if not key:
            continue
        out[key] = as_text(row.get('value'))
    return out


def extract_issue(payload: dict[str, Any]) -> Optional[dict[str, Any]]:
    issue: dict[str, Any] = {}
    if isinstance(payload.get('data'), dict) and isinstance(payload['data'].get('issue'), dict):
        issue = payload['data']['issue']
    elif isinstance(payload.get('issue'), dict):
        issue = payload['issue']
    else:
        issue = payload

    issue_id = as_text(issue.get('id') or payload.get('issueId') or payload.get('issue_id'))
    if not issue_id:
        return None

    metadata = issue.get('metadata')
    if not isinstance(metadata, dict):
        metadata = {}
    tags = parse_tags(issue)
    environment = as_text(
        tags.get('environment')
        or tags.get('env')
        or tags.get('release.environment')
        or issue.get('environment')
    )
    environment_class = classify_environment(environment)

    project = issue.get('project')
    if isinstance(project, dict):
        project_name = as_text(project.get('slug') or project.get('name'))
    else:
        project_name = as_text(project)

    title = as_text(issue.get('title') or metadata.get('type') or metadata.get('value'))
    if not title:
        title = as_text(payload.get('title'))

    return {
        'issueId': issue_id,
        'shortId': as_text(issue.get('shortId') or payload.get('shortId')),
        'title': title,
        'culprit': as_text(issue.get('culprit') or payload.get('culprit')),
        'level': as_text(issue.get('level') or payload.get('level') or 'error').lower() or 'error',
        'status': as_text(issue.get('status') or payload.get('status') or 'unresolved').lower() or 'unresolved',
        'project': project_name,
        'permalink': as_text(issue.get('permalink') or payload.get('permalink')),
        'firstSeen': as_text(issue.get('firstSeen') or payload.get('firstSeen')),
        'lastSeen': as_text(issue.get('lastSeen') or payload.get('lastSeen')),
        'metadataType': as_text(metadata.get('type') or payload.get('exceptionType')),
        'metadataValue': as_text(metadata.get('value') or payload.get('message')),
        'eventCount': as_text(issue.get('count') or payload.get('eventCount')),
        'userCount': as_text(issue.get('userCount') or payload.get('userCount')),
        'tags': tags,
        'environment': environment,
        'environmentClass': environment_class,
    }


def first_rule(text: str, rules: tuple[tuple[str, re.Pattern[str]], ...]) -> Optional[str]:
    for name, pattern in rules:
        if pattern.search(text):
            return name
    return None


def classify_issue(issue: dict[str, Any]) -> dict[str, Any]:
    searchable = ' '.join(
        [
            as_text(issue.get('title')),
            as_text(issue.get('culprit')),
            as_text(issue.get('metadataType')),
            as_text(issue.get('metadataValue')),
        ]
    ).lower()

    escalate_reason = first_rule(searchable, ESCALATE_RULES)
    if escalate_reason:
        return {
            'route': 'escalate',
            'reason': escalate_reason,
            'confidence': 0.91 if escalate_reason in ('security_sensitive', 'schema_change') else 0.82,
            'autoFixAllowed': False,
        }

    auto_fix_reason = first_rule(searchable, AUTO_FIX_RULES)
    if auto_fix_reason:
        return {
            'route': 'auto_fix',
            'reason': auto_fix_reason,
            'confidence': 0.9,
            'autoFixAllowed': True,
        }

    return {
        'route': 'escalate',
        'reason': 'uncertain',
        'confidence': 0.5,
        'autoFixAllowed': False,
    }


def build_policy(issue: dict[str, Any], triage: dict[str, Any]) -> dict[str, Any]:
    env_class = as_text(issue.get('environmentClass') or 'unknown')
    route = as_text(triage.get('route') or 'escalate')
    production = env_class == 'production'

    if production:
        return {
            'baseBranch': 'main',
            'targetBranch': 'main',
            'checkStagingFirst': True,
            'requireHumanReview': True,
            'autoMergeAllowed': False,
            'notes': 'production incident: check if already fixed on staging before creating a main PR',
        }

    auto_fix = route == 'auto_fix'
    return {
        'baseBranch': 'staging',
        'targetBranch': 'staging',
        'checkStagingFirst': False,
        'requireHumanReview': not auto_fix,
        'autoMergeAllowed': auto_fix,
        'notes': 'staging incident: isolate in a worktree, write failing test first, run full tests + lint',
    }


def build_next_action(issue: dict[str, Any], triage: dict[str, Any], policy: dict[str, Any]) -> str:
    route = as_text(triage.get('route'))
    reason = as_text(triage.get('reason'))
    short_id = as_text(issue.get('shortId') or issue.get('issueId'))
    title = as_text(issue.get('title') or 'Untitled issue')
    base = as_text(policy.get('baseBranch') or 'staging')
    target = as_text(policy.get('targetBranch') or base)

    if route == 'auto_fix':
        return (
            f'{short_id} {title}: branch from {base}, write failing test first, implement fix, '
            f'run full tests + linter, open PR targeting {target}.'
        )

    return (
        f'{short_id} {title}: escalate to human review ({reason}); create diagnostics branch from {base} '
        f'and collect reproduction details before opening a PR to {target}.'
    )


def normalized_event(payload: dict[str, Any]) -> Optional[dict[str, Any]]:
    issue = extract_issue(payload)
    if issue is None:
        return None
    triage = classify_issue(issue)
    policy = build_policy(issue, triage)
    return {
        'at': now_iso(),
        'source': 'sentry_webhook',
        'issue': issue,
        'triage': triage,
        'policy': policy,
        'nextAction': build_next_action(issue, triage, policy),
    }


def ingest(payload: dict[str, Any]) -> int:
    ensure_dirs()
    event = normalized_event(payload)
    if event is None:
        print(json.dumps({'ok': False, 'status': 'error', 'error': 'missing_issue_id'}, ensure_ascii=True))
        return 1

    append_json_line(INBOX_PATH, event)
    append_json_line(
        LOG_PATH,
        {
            'at': now_iso(),
            'event': 'sentry_ingest',
            'issueId': event['issue'].get('issueId'),
            'route': event['triage'].get('route'),
            'reason': event['triage'].get('reason'),
        },
    )
    print(
        json.dumps(
            {
                'ok': True,
                'status': 'ingested',
                'issueId': event['issue'].get('issueId'),
                'shortId': event['issue'].get('shortId'),
                'route': event['triage'].get('route'),
                'reason': event['triage'].get('reason'),
                'inboxPath': str(INBOX_PATH),
            },
            ensure_ascii=True,
        )
    )
    return 0


def normalize_ingested_row(value: Any) -> Optional[dict[str, Any]]:
    if not isinstance(value, dict):
        return None
    if isinstance(value.get('issue'), dict) and isinstance(value.get('triage'), dict) and isinstance(value.get('policy'), dict):
        issue = value['issue']
        triage = value['triage']
        policy = value['policy']
        return {
            'at': as_text(value.get('at')) or now_iso(),
            'issue': issue,
            'triage': triage,
            'policy': policy,
            'nextAction': as_text(value.get('nextAction')) or build_next_action(issue, triage, policy),
        }

    return normalized_event(value)


def run_triage() -> int:
    ensure_dirs()
    state = read_json(
        STATE_PATH,
        {
            'cursor': 0,
            'incidents': {},
        },
    )
    if not isinstance(state, dict):
        state = {'cursor': 0, 'incidents': {}}

    cursor = int(state.get('cursor') or 0)
    incidents = state.get('incidents')
    if not isinstance(incidents, dict):
        incidents = {}

    processed_lines = 0
    parsed_events = 0
    errors = 0

    if INBOX_PATH.exists():
        file_size = INBOX_PATH.stat().st_size
        if cursor < 0 or cursor > file_size:
            cursor = 0
        with INBOX_PATH.open('r', encoding='utf-8') as handle:
            handle.seek(cursor)
            for raw_line in handle:
                processed_lines += 1
                line = raw_line.strip()
                if not line:
                    continue
                try:
                    parsed_line = json.loads(line)
                except Exception:
                    errors += 1
                    continue
                event = normalize_ingested_row(parsed_line)
                if event is None:
                    errors += 1
                    continue
                parsed_events += 1
                issue = event['issue']
                issue_id = as_text(issue.get('issueId'))
                if not issue_id:
                    errors += 1
                    continue

                existing = incidents.get(issue_id) if isinstance(incidents.get(issue_id), dict) else {}
                seen_count = int(existing.get('seenCount') or 0) + 1
                incident = {
                    'issueId': issue_id,
                    'shortId': as_text(issue.get('shortId')),
                    'title': as_text(issue.get('title')),
                    'culprit': as_text(issue.get('culprit')),
                    'level': as_text(issue.get('level') or 'error'),
                    'status': as_text(issue.get('status') or 'unresolved'),
                    'environment': as_text(issue.get('environment')),
                    'environmentClass': as_text(issue.get('environmentClass') or 'unknown'),
                    'project': as_text(issue.get('project')),
                    'permalink': as_text(issue.get('permalink')),
                    'lastSeen': as_text(issue.get('lastSeen')),
                    'eventCount': as_text(issue.get('eventCount')),
                    'userCount': as_text(issue.get('userCount')),
                    'triage': event['triage'],
                    'policy': event['policy'],
                    'nextAction': as_text(event.get('nextAction')),
                    'firstSeenAt': as_text(existing.get('firstSeenAt')) or as_text(event.get('at')) or now_iso(),
                    'updatedAt': as_text(event.get('at')) or now_iso(),
                    'seenCount': seen_count,
                }
                incidents[issue_id] = incident
            cursor = handle.tell()
    else:
        cursor = 0

    incident_rows = [row for row in incidents.values() if isinstance(row, dict)]
    incident_rows.sort(key=lambda row: as_text(row.get('updatedAt')), reverse=True)
    if len(incident_rows) > MAX_INCIDENTS:
        incident_rows = incident_rows[:MAX_INCIDENTS]
    incidents = {as_text(row.get('issueId')): row for row in incident_rows if as_text(row.get('issueId'))}

    auto_fix_candidates = 0
    escalations = 0
    production_incidents = 0
    for row in incident_rows:
        triage = row.get('triage')
        route = as_text(triage.get('route')) if isinstance(triage, dict) else ''
        if route == 'auto_fix':
            auto_fix_candidates += 1
        else:
            escalations += 1
        if as_text(row.get('environmentClass')) == 'production':
            production_incidents += 1

    output_payload = {
        'ok': True,
        'at': now_iso(),
        'inboxPath': str(INBOX_PATH),
        'statePath': str(STATE_PATH),
        'incidents': incident_rows,
        'totals': {
            'incidents': len(incident_rows),
            'autoFixCandidates': auto_fix_candidates,
            'escalations': escalations,
            'productionIncidents': production_incidents,
        },
    }
    write_json(OUTPUT_PATH, output_payload)

    next_state = {
        'cursor': cursor,
        'lastRunAt': now_iso(),
        'incidents': incidents,
    }
    write_json(STATE_PATH, next_state)

    summary = {
        'ok': True,
        'status': 'ok',
        'processedLines': processed_lines,
        'parsedEvents': parsed_events,
        'errors': errors,
        'totalIncidents': len(incident_rows),
        'autoFixCandidates': auto_fix_candidates,
        'escalations': escalations,
        'productionIncidents': production_incidents,
        'outputPath': str(OUTPUT_PATH),
    }
    append_json_line(
        LOG_PATH,
        {
            'at': now_iso(),
            'event': 'sentry_triage',
            **summary,
        },
    )
    print(json.dumps(summary, ensure_ascii=True))
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Kyoshin Sentry pipeline: ingest webhooks and maintain incident triage.')
    parser.add_argument('--ingest', action='store_true', help='Read one Sentry payload from stdin or --payload-file and append it to the inbox.')
    parser.add_argument('--payload-file', default='', help='JSON payload file used with --ingest. If omitted, stdin is used.')
    return parser.parse_args()


def load_ingest_payload(args: argparse.Namespace) -> dict[str, Any]:
    if args.payload_file:
        return json.loads(Path(args.payload_file).expanduser().read_text(encoding='utf-8'))
    raw = os.read(0, 2_000_000).decode('utf-8')
    if not raw.strip():
        return {}
    return json.loads(raw)


def run() -> int:
    args = parse_args()
    if args.ingest:
        payload = load_ingest_payload(args)
        return ingest(payload)
    return run_triage()


if __name__ == '__main__':
    raise SystemExit(run())
