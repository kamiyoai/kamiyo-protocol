#!/usr/bin/env python3
import hashlib
import json
import os
import shlex
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

HOME_DIR = Path(os.environ.get('HOME', '~')).expanduser()
WORKSPACE = HOME_DIR / '.openclaw' / 'workspace'
RUNTIME_DIR = WORKSPACE / 'runtime'
STATE_DIR = RUNTIME_DIR / 'state'
FEEDS_DIR = RUNTIME_DIR / 'feeds'
RECEIPTS_DIR = RUNTIME_DIR / 'receipts'
LOG_DIR = RUNTIME_DIR / 'logs'

STATE_PATH = STATE_DIR / 'x402-agentcash-state.json'
OUTPUT_PATH = STATE_DIR / 'x402-agentcash.json'
LOG_PATH = LOG_DIR / 'x402-agentcash.jsonl'
LEDGER_PATH = Path(
    os.getenv('KYO_REVENUE_LEDGER_PATH', str(RECEIPTS_DIR / 'revenue-ledger.jsonl')).strip()
).expanduser()
ALLOWLIST_PATH = Path(
    os.getenv('KYO_X402_ALLOWLIST_PATH', str(FEEDS_DIR / 'x402-allowlist.json')).strip()
).expanduser()

ENABLE_AGENTCASH = os.getenv('KYO_ENABLE_X402_AGENTCASH', 'true').strip().lower() in {'1', 'true', 'yes', 'on'}
CHECK_ONLY = os.getenv('KYO_X402_AGENTCASH_CHECK_ONLY', 'false').strip().lower() in {'1', 'true', 'yes', 'on'}


def env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value.strip())
    except Exception:
        return default


def env_float(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return float(value.strip())
    except Exception:
        return default


MAX_CALLS_PER_TICK = max(1, min(20, env_int('KYO_X402_MAX_PAID_CALLS_PER_TICK', 3)))
MIN_JOB_MARGIN_USD = env_float('KYO_MIN_JOB_MARGIN_USD', 0.0)
MIN_JOB_SUCCESS_PROB = env_float('KYO_MIN_JOB_SUCCESS_PROB', 0.55)
MAX_JOB_COST_USD = env_float('KYO_MAX_JOB_COST_USD', 50.0)
WEEKLY_SPEND_CAP_USD = max(0.0, env_float('KYO_WEEKLY_SPEND_CAP_USD', 150.0))
CHECK_TIMEOUT_SECONDS = max(10, min(180, env_int('KYO_X402_AGENTCASH_CHECK_TIMEOUT_SECONDS', 45)))
FETCH_TIMEOUT_SECONDS = max(10, min(300, env_int('KYO_X402_AGENTCASH_FETCH_TIMEOUT_SECONDS', 90)))


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_dirs() -> None:
    for path in (WORKSPACE, RUNTIME_DIR, STATE_DIR, FEEDS_DIR, RECEIPTS_DIR, LOG_DIR):
        path.mkdir(parents=True, exist_ok=True)
        path.chmod(0o700)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + '\n', encoding='utf-8')
    path.chmod(0o600)


def append_json_line(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a', encoding='utf-8') as handle:
        handle.write(json.dumps(payload, ensure_ascii=True) + '\n')
    path.chmod(0o600)


def parse_json_text(raw: str) -> dict[str, Any]:
    text = raw.strip()
    if not text:
        return {}
    try:
        decoded = json.loads(text)
        return decoded if isinstance(decoded, dict) else {}
    except Exception:
        pass
    start = text.find('{')
    end = text.rfind('}')
    if start < 0 or end <= start:
        return {}
    try:
        decoded = json.loads(text[start : end + 1])
        return decoded if isinstance(decoded, dict) else {}
    except Exception:
        return {}


def parse_float(value: Any, default: float = 0.0) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except Exception:
            return default
    return default


def extract_timestamp(value: Any) -> Optional[datetime]:
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    if text.endswith('Z'):
        text = text[:-1] + '+00:00'
    try:
        return datetime.fromisoformat(text)
    except Exception:
        return None


def rolling_7d_spend_usd(path: Path) -> float:
    if not path.exists():
        return 0.0
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    total = 0.0
    for raw in path.read_text(encoding='utf-8').splitlines():
        line = raw.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except Exception:
            continue
        if not isinstance(row, dict):
            continue
        ts = extract_timestamp(row.get('at') or row.get('executedAt') or row.get('timestamp'))
        if ts is None:
            continue
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        if ts < cutoff:
            continue
        total += max(0.0, parse_float(row.get('costUsd'), 0.0))
    return round(total, 8)


def run_cmd(args: list[str], timeout_seconds: int) -> tuple[int, str, str]:
    proc = subprocess.run(
        args,
        capture_output=True,
        text=True,
        timeout=timeout_seconds,
        check=False,
    )
    return proc.returncode, proc.stdout or '', proc.stderr or ''


def normalize_allowlist(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, dict):
        items = payload.get('endpoints')
    else:
        items = payload
    if not isinstance(items, list):
        return []
    out: list[dict[str, Any]] = []
    for row in items:
        if not isinstance(row, dict):
            continue
        url = str(row.get('url') or '').strip()
        if not url:
            continue
        method = str(row.get('method') or 'GET').strip().upper() or 'GET'
        out.append(
            {
                'id': str(row.get('id') or '').strip(),
                'url': url,
                'method': method,
                'expectedPayoutUsd': parse_float(row.get('expectedPayoutUsd'), 0.0),
                'successProbability': max(0.0, min(1.0, parse_float(row.get('successProbability'), 1.0))),
                'requestBody': row.get('requestBody'),
                'requestHeaders': row.get('requestHeaders') if isinstance(row.get('requestHeaders'), dict) else {},
                'tags': row.get('tags') if isinstance(row.get('tags'), list) else [],
            }
        )
    return out


def choose_payment_option(data: dict[str, Any], method: str) -> Optional[dict[str, Any]]:
    results = data.get('results')
    if not isinstance(results, list):
        return None
    for row in results:
        if not isinstance(row, dict):
            continue
        row_method = str(row.get('method') or '').strip().upper()
        if row_method and row_method != method:
            continue
        if not row.get('requiresPayment'):
            continue
        options = row.get('paymentOptions')
        if isinstance(options, list) and options:
            first = options[0]
            if isinstance(first, dict):
                return first
    for row in results:
        if not isinstance(row, dict):
            continue
        if row.get('requiresPayment'):
            options = row.get('paymentOptions')
            if isinstance(options, list) and options and isinstance(options[0], dict):
                return options[0]
    return None


def detect_payment_ref(payload: dict[str, Any]) -> str:
    for key in ('paymentRef', 'paymentReference', 'txSignature', 'transactionHash', 'signature'):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    data = payload.get('data')
    if isinstance(data, dict):
        return detect_payment_ref(data)
    return ''


def normalize_revenue_usd(payload: dict[str, Any], expected_payout_usd: float) -> float:
    for key in ('revenueUsd', 'payoutUsd', 'amountUsd', 'grossUsd'):
        if key in payload:
            value = parse_float(payload.get(key), expected_payout_usd)
            if value > 0:
                return value
    data = payload.get('data')
    if isinstance(data, dict):
        return normalize_revenue_usd(data, expected_payout_usd)
    return expected_payout_usd


def run() -> int:
    ensure_dirs()
    started_at = now_iso()

    if not ENABLE_AGENTCASH:
        summary = {
            'ok': True,
            'status': 'disabled',
            'startedAt': started_at,
            'allowlistPath': str(ALLOWLIST_PATH),
            'ledgerPath': str(LEDGER_PATH),
        }
        write_json(STATE_PATH, {'lastRunAt': now_iso(), 'lastStatus': summary})
        write_json(OUTPUT_PATH, summary)
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    if not ALLOWLIST_PATH.exists():
        summary = {
            'ok': False,
            'status': 'blocked',
            'reason': 'allowlist_missing',
            'startedAt': started_at,
            'allowlistPath': str(ALLOWLIST_PATH),
        }
        write_json(STATE_PATH, {'lastRunAt': now_iso(), 'lastStatus': summary})
        write_json(OUTPUT_PATH, summary)
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    try:
        allowlist_payload = json.loads(ALLOWLIST_PATH.read_text(encoding='utf-8'))
    except Exception:
        allowlist_payload = []
    endpoints = normalize_allowlist(allowlist_payload)
    if not endpoints:
        summary = {
            'ok': False,
            'status': 'blocked',
            'reason': 'allowlist_empty',
            'startedAt': started_at,
            'allowlistPath': str(ALLOWLIST_PATH),
        }
        write_json(STATE_PATH, {'lastRunAt': now_iso(), 'lastStatus': summary})
        write_json(OUTPUT_PATH, summary)
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    weekly_spend_usd = rolling_7d_spend_usd(LEDGER_PATH)
    checked = 0
    eligible = 0
    executed = 0
    successful = 0
    failed = 0
    skipped = 0
    total_estimated_cost_usd = 0.0
    records: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []

    for endpoint in endpoints:
        if executed >= MAX_CALLS_PER_TICK:
            break
        checked += 1
        url = endpoint['url']
        method = endpoint['method']
        expected_payout_usd = max(0.0, endpoint['expectedPayoutUsd'])
        success_probability = endpoint['successProbability']

        check_rc, check_stdout, check_stderr = run_cmd(
            ['npx', '-y', 'agentcash', 'check', url, '--format', 'json'],
            CHECK_TIMEOUT_SECONDS,
        )
        check_payload = parse_json_text(check_stdout)
        check_ok = check_rc == 0 and bool(check_payload.get('success'))
        if not check_ok:
            skipped += 1
            errors.append(
                {
                    'url': url,
                    'method': method,
                    'stage': 'check',
                    'error': (check_stderr or check_stdout).strip()[:500],
                }
            )
            continue

        payment_option = choose_payment_option(check_payload.get('data') if isinstance(check_payload.get('data'), dict) else {}, method)
        if not payment_option:
            skipped += 1
            continue

        estimated_cost_usd = max(0.0, parse_float(payment_option.get('price'), 0.0))
        expected_margin_usd = expected_payout_usd - estimated_cost_usd
        if success_probability < MIN_JOB_SUCCESS_PROB or estimated_cost_usd > MAX_JOB_COST_USD or expected_margin_usd < MIN_JOB_MARGIN_USD:
            skipped += 1
            continue

        if WEEKLY_SPEND_CAP_USD > 0 and (weekly_spend_usd + total_estimated_cost_usd + estimated_cost_usd) > WEEKLY_SPEND_CAP_USD:
            skipped += 1
            errors.append(
                {
                    'url': url,
                    'method': method,
                    'stage': 'policy',
                    'error': 'weekly_spend_cap_exceeded',
                    'capUsd': WEEKLY_SPEND_CAP_USD,
                }
            )
            continue

        eligible += 1
        total_estimated_cost_usd += estimated_cost_usd
        if CHECK_ONLY:
            continue

        fetch_cmd = ['npx', '-y', 'agentcash', 'fetch', url, '-m', method, '--format', 'json']
        body = endpoint.get('requestBody')
        if body is not None:
            fetch_cmd.extend(['-b', json.dumps(body, ensure_ascii=True)])
        headers = endpoint.get('requestHeaders')
        if isinstance(headers, dict):
            for key, value in headers.items():
                if not isinstance(key, str) or not isinstance(value, str):
                    continue
                fetch_cmd.extend(['-H', f'{key}:{value}'])

        fetch_rc, fetch_stdout, fetch_stderr = run_cmd(fetch_cmd, FETCH_TIMEOUT_SECONDS)
        fetch_payload = parse_json_text(fetch_stdout)
        fetch_ok = fetch_rc == 0 and bool(fetch_payload.get('success'))
        executed += 1

        gross_usd = normalize_revenue_usd(fetch_payload, expected_payout_usd) if fetch_ok else 0.0
        cost_usd = estimated_cost_usd
        net_usd = gross_usd - cost_usd
        endpoint_id = endpoint.get('id') or hashlib.sha1(f'{method}:{url}'.encode('utf-8')).hexdigest()[:12]
        record = {
            'id': f'x402-paid-{endpoint_id}-{int(datetime.now(timezone.utc).timestamp())}',
            'source': 'x402',
            'kind': 'paid_call',
            'status': 'success' if fetch_ok else 'failed',
            'at': now_iso(),
            'url': url,
            'method': method,
            'grossUsd': round(gross_usd, 8),
            'costUsd': round(cost_usd, 8),
            'netUsd': round(net_usd, 8),
            'expectedPayoutUsd': round(expected_payout_usd, 8),
            'estimatedCostUsd': round(estimated_cost_usd, 8),
            'expectedMarginUsd': round(expected_margin_usd, 8),
            'successProbability': round(success_probability, 6),
            'paymentRef': detect_payment_ref(fetch_payload),
            'tags': endpoint.get('tags') if isinstance(endpoint.get('tags'), list) else [],
            'error': '' if fetch_ok else ((fetch_stderr or fetch_stdout).strip()[:500]),
        }
        append_json_line(LEDGER_PATH, record)
        records.append(record)
        if fetch_ok:
            successful += 1
        else:
            failed += 1

    status = 'ok'
    ok = True
    reason = ''
    if CHECK_ONLY and eligible == 0:
        status = 'blocked'
        ok = False
        reason = 'no_eligible_endpoints'
    elif not CHECK_ONLY and executed == 0:
        status = 'blocked'
        ok = False
        reason = 'no_executed_calls'

    summary = {
        'ok': ok,
        'status': status,
        'reason': reason,
        'startedAt': started_at,
        'at': now_iso(),
        'allowlistPath': str(ALLOWLIST_PATH),
        'ledgerPath': str(LEDGER_PATH),
        'weeklySpendUsd': round(weekly_spend_usd, 8),
        'weeklySpendCapUsd': round(WEEKLY_SPEND_CAP_USD, 8),
        'checked': checked,
        'eligible': eligible,
        'executed': executed,
        'successfulPaidCalls': successful,
        'failedPaidCalls': failed,
        'skipped': skipped,
        'recordsAppended': len(records),
        'checkOnly': CHECK_ONLY,
        'errors': errors[:20],
    }
    write_json(STATE_PATH, {'lastRunAt': now_iso(), 'lastStatus': summary})
    write_json(OUTPUT_PATH, summary)
    append_json_line(
        LOG_PATH,
        {
            'at': now_iso(),
            'event': 'x402_agentcash',
            'ok': ok,
            'status': status,
            'executed': executed,
            'successfulPaidCalls': successful,
            'failedPaidCalls': failed,
            'recordsAppended': len(records),
        },
    )
    print(json.dumps(summary, ensure_ascii=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(run())
