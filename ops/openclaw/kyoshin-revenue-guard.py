#!/usr/bin/env python3
import json
import os
import shutil
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
TRADING_EXEC_PATH = STATE_DIR / 'trading-exec.json'
TRADING_ROUTE_PATH = STATE_DIR / 'trading-route.json'
TRADING_CAPABILITIES_PATH = STATE_DIR / 'trading-capabilities.json'
POLYMARKET_GEO_PATH = STATE_DIR / 'polymarket-geo.json'
LEDGER_PATH = Path(os.getenv('KYO_REVENUE_LEDGER_PATH', str(RECEIPTS_DIR / 'revenue-ledger.jsonl')).strip()).expanduser()

SCRIPT_DIR = Path(__file__).resolve().parent
BRIDGES_DIR = SCRIPT_DIR / 'bridges'
POLYMARKET_BRIDGE_PATH = BRIDGES_DIR / 'kyoshin-polymarket-bridge.mjs'
LIMITLESS_BRIDGE_PATH = BRIDGES_DIR / 'kyoshin-limitless-bridge.mjs'


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


def env_csv(name: str) -> list[str]:
    value = os.getenv(name, '')
    return [item.strip().lower() for item in value.split(',') if item.strip()]


ENABLE_REVENUE_GUARD = env_bool('KYO_ENABLE_REVENUE_GUARD', True)
ENABLE_CLAWMART_MONITOR = env_bool('KYO_ENABLE_CLAWMART_MONITOR', True)
ENABLE_X402_AGENTCASH = env_bool('KYO_ENABLE_X402_AGENTCASH', True)
ENABLE_TRADING_AGENT = env_bool('KYO_ENABLE_TRADING_AGENT', False)
REQUIRE_TRADING_AGENT = env_bool('KYO_REQUIRE_TRADING_AGENT', False)
REQUIRE_CLAWMART_STAKING_ROUTE = env_bool('KYO_REQUIRE_CLAWMART_STAKING_ROUTE', True)
WEEKLY_SPEND_CAP_USD = max(0.0, env_float('KYO_WEEKLY_SPEND_CAP_USD', 150.0))
X402_ACTIVITY_LOOKBACK_HOURS = max(1, min(168, env_int('KYO_X402_ACTIVITY_LOOKBACK_HOURS', 72)))
X402_ACTIVITY_GRACE_HOURS = max(1, min(168, env_int('KYO_X402_ACTIVITY_GRACE_HOURS', 72)))
TRADING_EXECUTION_MODE = os.getenv('KYO_TRADING_EXECUTION_MODE', 'paper').strip().lower()
TRADING_VENUES = env_csv('KYO_TRADING_VENUES') or ['polymarket', 'limitless', 'kalshi']
TRADING_MAX_DRAWDOWN_PCT = max(0.0, env_float('KYO_TRADING_MAX_DRAWDOWN_PCT', 8.0))
TRADING_WEEKLY_LOSS_CAP_USD = max(0.0, env_float('KYO_TRADING_WEEKLY_LOSS_CAP_USD', 300.0))
TRADING_ROUTE_LAG_TOLERANCE_USD = max(0.0, env_float('KYO_TRADING_ROUTE_LAG_TOLERANCE_USD', 1.0))
POLYMARKET_REQUIRE_GEO_ALLOWED = env_bool('KYO_TRADING_POLYMARKET_REQUIRE_GEO_ALLOWED', True)
BRIDGE_NODE_BIN = os.getenv('KYO_TRADING_BRIDGE_NODE_BIN', 'node').strip() or 'node'


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


def to_bool(value: Any, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {'1', 'true', 'yes', 'on'}:
            return True
        if normalized in {'0', 'false', 'no', 'off'}:
            return False
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


def node_ready() -> bool:
    return bool(shutil.which(BRIDGE_NODE_BIN))


def has_bridge_transport(worker_path: Path) -> bool:
    return node_ready() and worker_path.exists() and worker_path.is_file()


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

    trading_exec = read_json(TRADING_EXEC_PATH, {})
    if not isinstance(trading_exec, dict):
        trading_exec = {}
    trading_route = read_json(TRADING_ROUTE_PATH, {})
    if not isinstance(trading_route, dict):
        trading_route = {}
    trading_capabilities = read_json(TRADING_CAPABILITIES_PATH, {})
    if not isinstance(trading_capabilities, dict):
        trading_capabilities = {}
    polymarket_geo = read_json(POLYMARKET_GEO_PATH, {})
    if not isinstance(polymarket_geo, dict):
        polymarket_geo = {}

    trading_drawdown_pct = max(0.0, parse_float(trading_exec.get('drawdownPct'), 0.0))
    trading_weekly_net_usd = parse_float(trading_exec.get('weeklyRealizedNetUsd'), 0.0)
    trading_unrouted_realized_net_usd = max(0.0, parse_float(trading_route.get('unroutedRealizedNetUsd'), 0.0))
    trading_drawdown_breach = ENABLE_TRADING_AGENT and trading_drawdown_pct > TRADING_MAX_DRAWDOWN_PCT
    trading_weekly_loss_breach = (
        ENABLE_TRADING_AGENT
        and TRADING_WEEKLY_LOSS_CAP_USD > 0
        and trading_weekly_net_usd < -TRADING_WEEKLY_LOSS_CAP_USD
    )
    trading_route_lag = ENABLE_TRADING_AGENT and trading_unrouted_realized_net_usd > TRADING_ROUTE_LAG_TOLERANCE_USD

    trading_required_disabled = REQUIRE_TRADING_AGENT and not ENABLE_TRADING_AGENT
    trading_polymarket_live = ENABLE_TRADING_AGENT and TRADING_EXECUTION_MODE == 'live' and 'polymarket' in TRADING_VENUES
    trading_limitless_live = ENABLE_TRADING_AGENT and TRADING_EXECUTION_MODE == 'live' and 'limitless' in TRADING_VENUES

    trading_missing_polymarket_transport = trading_polymarket_live and not (
        bool(os.getenv('KYO_TRADING_POLYMARKET_EXEC_CMD', '').strip())
        or has_bridge_transport(POLYMARKET_BRIDGE_PATH)
    )
    trading_missing_limitless_transport = trading_limitless_live and not (
        bool(os.getenv('KYO_TRADING_LIMITLESS_EXEC_CMD', '').strip())
        or has_bridge_transport(LIMITLESS_BRIDGE_PATH)
    )

    trading_polymarket_geo_blocked = (
        trading_polymarket_live
        and POLYMARKET_REQUIRE_GEO_ALLOWED
        and to_bool(polymarket_geo.get('blocked'), False)
    )

    capability_blockers = []
    if isinstance(trading_capabilities.get('blockers'), list):
        for entry in trading_capabilities.get('blockers'):
            if isinstance(entry, str) and entry.strip():
                capability_blockers.append(entry.strip())

    reasons: list[str] = []
    if weekly_spend_cap_exceeded:
        reasons.append('weekly_spend_cap_exceeded')
    if clawmart_missing_key:
        reasons.append('missing_clawmart_api_key')
    if staking_route_non_compliant:
        reasons.append('unrouted_clawmart_sales')
    if x402_no_paid_calls_72h:
        reasons.append('x402_zero_paid_calls_lookback')
    if trading_required_disabled:
        reasons.append('trading_lane_required_disabled')
    if trading_missing_polymarket_transport:
        reasons.append('missing_trading_polymarket_transport')
    if trading_missing_limitless_transport:
        reasons.append('missing_trading_limitless_transport')
    if trading_polymarket_geo_blocked:
        reasons.append('polymarket_geo_blocked')
    if trading_drawdown_breach:
        reasons.append('trading_drawdown_breach')
    if trading_weekly_loss_breach:
        reasons.append('trading_weekly_loss_cap_breach')
    if trading_route_lag:
        reasons.append('trading_route_parity_lag')

    for blocker in capability_blockers:
        if blocker not in reasons:
            reasons.append(blocker)

    reasons = sorted(dict.fromkeys(reasons))
    ok = len(reasons) == 0
    block_paid_execution = (
        weekly_spend_cap_exceeded
        or trading_required_disabled
        or trading_missing_polymarket_transport
        or trading_missing_limitless_transport
        or trading_drawdown_breach
        or trading_weekly_loss_breach
    )

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
        'tradingLaneEnabled': ENABLE_TRADING_AGENT,
        'tradingLaneRequired': REQUIRE_TRADING_AGENT,
        'tradingExecutionMode': TRADING_EXECUTION_MODE,
        'tradingVenues': TRADING_VENUES,
        'tradingDrawdownPct': trading_drawdown_pct,
        'tradingMaxDrawdownPct': round(TRADING_MAX_DRAWDOWN_PCT, 8),
        'tradingWeeklyRealizedNetUsd': round(trading_weekly_net_usd, 8),
        'tradingWeeklyLossCapUsd': round(TRADING_WEEKLY_LOSS_CAP_USD, 8),
        'tradingUnroutedRealizedNetUsd': round(trading_unrouted_realized_net_usd, 8),
        'tradingRouteLagToleranceUsd': round(TRADING_ROUTE_LAG_TOLERANCE_USD, 8),
        'tradingMissingPolymarketTransport': trading_missing_polymarket_transport,
        'tradingMissingLimitlessTransport': trading_missing_limitless_transport,
        'tradingPolymarketGeoBlocked': trading_polymarket_geo_blocked,
        'tradingCapabilitiesPath': str(TRADING_CAPABILITIES_PATH),
        'tradingPolymarketGeoPath': str(POLYMARKET_GEO_PATH),
        'tradingCapabilityBlockers': capability_blockers,
        'deprecatedAliases': {'tradingMissingDflowTransport': False},
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
            'tradingDrawdownPct': trading_drawdown_pct,
            'tradingWeeklyRealizedNetUsd': round(trading_weekly_net_usd, 8),
            'tradingUnroutedRealizedNetUsd': round(trading_unrouted_realized_net_usd, 8),
            'tradingPolymarketGeoBlocked': trading_polymarket_geo_blocked,
        },
    )
    print(json.dumps(summary, ensure_ascii=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(run())
