#!/usr/bin/env python3
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

HOME_DIR = Path(os.environ.get('HOME', '~')).expanduser()
WORKSPACE = HOME_DIR / '.openclaw' / 'workspace'
RUNTIME_DIR = WORKSPACE / 'runtime'
STATE_DIR = RUNTIME_DIR / 'state'
RECEIPTS_DIR = RUNTIME_DIR / 'receipts'
LOG_DIR = RUNTIME_DIR / 'logs'

STATE_PATH = STATE_DIR / 'revenue-guard-state.json'
OUTPUT_PATH = STATE_DIR / 'revenue-guard.json'
LOG_PATH = LOG_DIR / 'revenue-guard.jsonl'
CLAWMART_MONITOR_PATH = STATE_DIR / 'clawmart-monitor.json'
LEDGER_PATH = Path(os.getenv('KYO_REVENUE_LEDGER_PATH', str(RECEIPTS_DIR / 'revenue-ledger.jsonl')).strip()).expanduser()


def env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in {'1', 'true', 'yes', 'on'}:
        return True
    if normalized in {'0', 'false', 'no', 'off'}:
        return False
    return default


def env_float(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return float(value.strip())
    except Exception:
        return default


def env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value.strip())
    except Exception:
        return default


ENABLE_REVENUE_GUARD = env_bool('KYO_ENABLE_REVENUE_GUARD', True)
ENABLE_CLAWMART_MONITOR = env_bool('KYO_ENABLE_CLAWMART_MONITOR', True)
ENABLE_X402_AGENTCASH = env_bool('KYO_ENABLE_X402_AGENTCASH', True)
REQUIRE_CLAWMART_STAKING_ROUTE = env_bool('KYO_REQUIRE_CLAWMART_STAKING_ROUTE', True)
WEEKLY_SPEND_CAP_USD = max(0.0, env_float('KYO_WEEKLY_SPEND_CAP_USD', 150.0))
X402_ACTIVITY_LOOKBACK_HOURS = max(1, min(168, env_int('KYO_X402_ACTIVITY_LOOKBACK_HOURS', 72)))
X402_ACTIVITY_GRACE_HOURS = max(1, min(168, env_int('KYO_X402_ACTIVITY_GRACE_HOURS', 72)))


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_dirs() -> None:
    for path in (WORKSPACE, RUNTIME_DIR, STATE_DIR, RECEIPTS_DIR, LOG_DIR):
        path.mkdir(parents=True, exist_ok=True)
        path.chmod(0o700)
    LEDGER_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not LEDGER_PATH.exists():
        LEDGER_PATH.touch()
    LEDGER_PATH.chmod(0o600)


def read_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return fallback


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + '\n', encoding='utf-8')
    path.chmod(0o600)


def append_json_line(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a', encoding='utf-8') as handle:
        handle.write(json.dumps(payload, ensure_ascii=True) + '\n')
    path.chmod(0o600)


def parse_ts(value: Any) -> Optional[datetime]:
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    if text.endswith('Z'):
        text = text[:-1] + '+00:00'
    try:
        ts = datetime.fromisoformat(text)
    except Exception:
        return None
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts


def parse_float(value: Any, default: float = 0.0) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except Exception:
            return default
    return default


def parse_int(value: Any, default: int = 0) -> int:
    if isinstance(value, int):
        return value if value >= 0 else default
    if isinstance(value, float):
        parsed = int(value)
        return parsed if parsed >= 0 else default
    if isinstance(value, str):
        try:
            parsed = int(value.strip())
            return parsed if parsed >= 0 else default
        except Exception:
            return default
    return default


def ledger_rows(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    out: list[dict[str, Any]] = []
    for raw in path.read_text(encoding='utf-8').splitlines():
        line = raw.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except Exception:
            continue
        if isinstance(row, dict):
            out.append(row)
    return out


def run() -> int:
    ensure_dirs()
    started_at = now_iso()

    if not ENABLE_REVENUE_GUARD:
        summary = {
            'ok': True,
            'status': 'disabled',
            'startedAt': started_at,
            'at': now_iso(),
            'ledgerPath': str(LEDGER_PATH),
        }
        write_json(STATE_PATH, {'lastRunAt': summary['at'], 'lastStatus': summary})
        write_json(OUTPUT_PATH, summary)
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    state = read_json(STATE_PATH, {})
    if not isinstance(state, dict):
        state = {}

    rows = ledger_rows(LEDGER_PATH)
    now = datetime.now(timezone.utc)
    seven_day_cutoff = now - timedelta(days=7)
    x402_cutoff = now - timedelta(hours=X402_ACTIVITY_LOOKBACK_HOURS)

    weekly_spend_usd = 0.0
    x402_paid_calls_window = 0
    for row in rows:
        ts = parse_ts(row.get('at') or row.get('timestamp') or row.get('executedAt'))
        if ts is None:
            continue
        if ts >= seven_day_cutoff:
            weekly_spend_usd += max(0.0, parse_float(row.get('costUsd'), 0.0))
        source = str(row.get('source') or '').strip().lower()
        kind = str(row.get('kind') or '').strip().lower()
        status = str(row.get('status') or '').strip().lower()
        if ts >= x402_cutoff and source == 'x402' and kind == 'paid_call' and status == 'success':
            x402_paid_calls_window += 1

    weekly_spend_usd = round(weekly_spend_usd, 8)
    weekly_spend_cap_exceeded = WEEKLY_SPEND_CAP_USD > 0 and weekly_spend_usd > WEEKLY_SPEND_CAP_USD

    clawmart_api_key_present = bool(os.getenv('CLAWMART_API_KEY', '').strip())
    clawmart_missing_key = ENABLE_CLAWMART_MONITOR and not clawmart_api_key_present

    clawmart_monitor = read_json(CLAWMART_MONITOR_PATH, {})
    if not isinstance(clawmart_monitor, dict):
        clawmart_monitor = {}
    unrouted_sales_count = parse_int(clawmart_monitor.get('unroutedSalesCount'), 0)
    staking_route_non_compliant = REQUIRE_CLAWMART_STAKING_ROUTE and unrouted_sales_count > 0

    x402_first_seen_at_raw = str(state.get('x402FirstSeenAt') or '').strip()
    x402_first_seen_at = parse_ts(x402_first_seen_at_raw)
    if ENABLE_X402_AGENTCASH and x402_first_seen_at is None:
        x402_first_seen_at = now
        x402_first_seen_at_raw = x402_first_seen_at.isoformat()
    x402_grace_elapsed = False
    if ENABLE_X402_AGENTCASH and x402_first_seen_at is not None:
        x402_grace_elapsed = now >= (x402_first_seen_at + timedelta(hours=X402_ACTIVITY_GRACE_HOURS))
    x402_no_paid_calls_72h = ENABLE_X402_AGENTCASH and x402_grace_elapsed and x402_paid_calls_window == 0

    reasons: list[str] = []
    if weekly_spend_cap_exceeded:
        reasons.append('weekly_spend_cap_exceeded')
    if clawmart_missing_key:
        reasons.append('missing_clawmart_api_key')
    if staking_route_non_compliant:
        reasons.append('unrouted_clawmart_sales')
    if x402_no_paid_calls_72h:
        reasons.append('x402_zero_paid_calls_lookback')

    ok = len(reasons) == 0
    block_paid_execution = weekly_spend_cap_exceeded
    summary = {
        'ok': ok,
        'status': 'ok' if ok else 'policy_blocked',
        'startedAt': started_at,
        'at': now_iso(),
        'reasons': reasons,
        'blockPaidExecution': block_paid_execution,
        'ledgerPath': str(LEDGER_PATH),
        'weeklySpendUsd7d': weekly_spend_usd,
        'weeklySpendCapUsd': round(WEEKLY_SPEND_CAP_USD, 8),
        'weeklySpendCapExceeded': weekly_spend_cap_exceeded,
        'clawMartLaneEnabled': ENABLE_CLAWMART_MONITOR,
        'clawMartApiKeyPresent': clawmart_api_key_present,
        'clawMartUnroutedSalesCount': unrouted_sales_count,
        'clawMartStakingRouteRequired': REQUIRE_CLAWMART_STAKING_ROUTE,
        'x402LaneEnabled': ENABLE_X402_AGENTCASH,
        'x402PaidCallsLookback': x402_paid_calls_window,
        'x402LookbackHours': X402_ACTIVITY_LOOKBACK_HOURS,
        'x402GraceHours': X402_ACTIVITY_GRACE_HOURS,
        'x402GraceElapsed': x402_grace_elapsed,
        'x402FirstSeenAt': x402_first_seen_at_raw,
    }
    write_json(
        STATE_PATH,
        {
            'lastRunAt': summary['at'],
            'x402FirstSeenAt': x402_first_seen_at_raw,
            'lastStatus': summary,
        },
    )
    write_json(OUTPUT_PATH, summary)
    append_json_line(
        LOG_PATH,
        {
            'at': summary['at'],
            'event': 'revenue_guard',
            'ok': summary['ok'],
            'status': summary['status'],
            'reasons': reasons,
            'blockPaidExecution': block_paid_execution,
            'weeklySpendUsd7d': weekly_spend_usd,
            'weeklySpendCapUsd': round(WEEKLY_SPEND_CAP_USD, 8),
            'x402PaidCallsLookback': x402_paid_calls_window,
            'clawMartUnroutedSalesCount': unrouted_sales_count,
        },
    )
    print(json.dumps(summary, ensure_ascii=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(run())
