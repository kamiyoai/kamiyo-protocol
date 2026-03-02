#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

HOME_DIR = Path(os.environ.get('HOME', '~')).expanduser()
WORKSPACE = HOME_DIR / '.openclaw' / 'workspace'
RUNTIME_DIR = WORKSPACE / 'runtime'
STATE_DIR = RUNTIME_DIR / 'state'
FEEDS_DIR = RUNTIME_DIR / 'feeds'
RECEIPTS_DIR = RUNTIME_DIR / 'receipts'
LOG_DIR = RUNTIME_DIR / 'logs'

STATE_PATH = STATE_DIR / 'trading-exec-state.json'
OUTPUT_PATH = STATE_DIR / 'trading-exec.json'
LOG_PATH = LOG_DIR / 'trading-exec.jsonl'
POSITIONS_PATH = STATE_DIR / 'trading-positions.json'
FEED_PATH = FEEDS_DIR / 'trading-opportunities.json'
REVENUE_GUARD_PATH = STATE_DIR / 'revenue-guard.json'
POLYMARKET_GEO_PATH = STATE_DIR / 'polymarket-geo.json'
CAPABILITIES_PATH = STATE_DIR / 'trading-capabilities.json'
LEDGER_PATH = Path(
    os.getenv('KYO_REVENUE_LEDGER_PATH', str(RECEIPTS_DIR / 'revenue-ledger.jsonl')).strip()
).expanduser()

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


ENABLE_TRADING_AGENT = env_bool('KYO_ENABLE_TRADING_AGENT', False)
EXECUTION_MODE = os.getenv('KYO_TRADING_EXECUTION_MODE', 'paper').strip().lower()
VENUES = [
    item.strip().lower()
    for item in os.getenv('KYO_TRADING_VENUES', 'polymarket,limitless,kalshi').split(',')
    if item.strip()
]
KALSHI_SIGNAL_ONLY = env_bool('KYO_TRADING_KALSHI_SIGNAL_ONLY', True)

STARTING_EQUITY_USD = max(1.0, env_float('KYO_TRADING_STARTING_EQUITY_USD', 200.0))
MAX_NOTIONAL_USD_PER_DAY = max(1.0, env_float('KYO_TRADING_MAX_NOTIONAL_USD_PER_DAY', 400.0))
MAX_OPEN_POSITIONS = max(1, env_int('KYO_TRADING_MAX_OPEN_POSITIONS', 2))
MAX_MARKET_EXPOSURE_PCT = max(1.0, min(100.0, env_float('KYO_TRADING_MAX_MARKET_EXPOSURE_PCT', 25.0)))
MAX_DRAWDOWN_PCT = max(0.0, env_float('KYO_TRADING_MAX_DRAWDOWN_PCT', 8.0))
DAILY_LOSS_STOP_PCT = max(0.0, env_float('KYO_TRADING_DAILY_LOSS_STOP_PCT', 1.5))
WEEKLY_LOSS_CAP_USD = max(0.0, env_float('KYO_TRADING_WEEKLY_LOSS_CAP_USD', 300.0))
MAX_ORDER_SLIPPAGE_BPS = max(0.0, env_float('KYO_TRADING_MAX_ORDER_SLIPPAGE_BPS', 120.0))
MIN_EDGE_USD = env_float('KYO_TRADING_MIN_EDGE_USD', 0.05)
TAKE_PROFIT_PCT = max(0.0, env_float('KYO_TRADING_TAKE_PROFIT_PCT', 12.0))
STOP_LOSS_PCT = max(0.0, env_float('KYO_TRADING_STOP_LOSS_PCT', 8.0))
MAX_HOLD_HOURS = max(1.0, env_float('KYO_TRADING_MAX_HOLD_HOURS', 72.0))
BASE_NOTIONAL_PER_TRADE_USD = max(1.0, env_float('KYO_TRADING_NOTIONAL_PER_TRADE_USD', 25.0))
VENUE_MIN_ALLOC_PCT = max(0.0, min(100.0, env_float('KYO_TRADING_VENUE_MIN_ALLOC_PCT', 20.0)))
VENUE_MAX_ALLOC_PCT = max(VENUE_MIN_ALLOC_PCT, min(100.0, env_float('KYO_TRADING_VENUE_MAX_ALLOC_PCT', 70.0)))

POLYMARKET_EXEC_CMD = os.getenv('KYO_TRADING_POLYMARKET_EXEC_CMD', '').strip()
LIMITLESS_EXEC_CMD = os.getenv('KYO_TRADING_LIMITLESS_EXEC_CMD', '').strip()
POLYMARKET_GEO_URL = os.getenv('KYO_TRADING_POLYMARKET_GEO_URL', 'https://polymarket.com/api/geoblock').strip()
POLYMARKET_REQUIRE_GEO_ALLOWED = env_bool('KYO_TRADING_POLYMARKET_REQUIRE_GEO_ALLOWED', True)

NODE_BIN_NAME = os.getenv('KYO_TRADING_BRIDGE_NODE_BIN', 'node').strip() or 'node'
HTTP_TIMEOUT_SECONDS = max(3, min(60, env_int('KYO_TRADING_EXEC_TIMEOUT_SECONDS', 20)))
LIVE_ORDER_TIMEOUT_SECONDS = max(3, min(120, env_int('KYO_TRADING_LIVE_ORDER_TIMEOUT_SECONDS', 25)))


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def today_iso() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def ensure_dirs() -> None:
    for path in (WORKSPACE, RUNTIME_DIR, STATE_DIR, FEEDS_DIR, RECEIPTS_DIR, LOG_DIR, LEDGER_PATH.parent):
        path.mkdir(parents=True, exist_ok=True)
        path.chmod(0o700)
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
    with path.open('a', encoding='utf-8') as handle:
        handle.write(json.dumps(payload, ensure_ascii=True) + '\n')
    path.chmod(0o600)


def parse_float(value: Any, default: float = 0.0) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except Exception:
            return default
    return default


def parse_ts(value: Any) -> datetime | None:
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


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def jsonl_rows(path: Path) -> list[dict[str, Any]]:
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


def stable_trade_id(prefix: str, key: str) -> str:
    digest = hashlib.sha1(f'{prefix}:{key}:{datetime.now(timezone.utc).timestamp()}'.encode('utf-8')).hexdigest()[:18]
    return f'{prefix}-{digest}'


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


def is_allowed_url(url: str) -> bool:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme.lower() != 'https':
        return False
    return bool(parsed.netloc)


def request_json(url: str, headers: dict[str, str] | None = None) -> Any:
    if not is_allowed_url(url):
        raise RuntimeError(f'unsupported_url:{url}')
    request = urllib.request.Request(
        url=url,
        headers={
            'Accept': 'application/json',
            'User-Agent': 'kyoshin-trading-exec/2.0',
            **(headers or {}),
        },
        method='GET',
    )
    with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
        raw = response.read(2_000_000)
    return json.loads(raw.decode('utf-8'))


def node_bin() -> str:
    found = shutil.which(NODE_BIN_NAME)
    if found:
        return found
    return ''


def has_bridge(worker_path: Path) -> bool:
    return worker_path.exists() and worker_path.is_file() and bool(node_bin())


def normalize_candidates(payload: dict[str, Any]) -> list[dict[str, Any]]:
    rows = payload.get('opportunities') if isinstance(payload, dict) else []
    if not isinstance(rows, list):
        return []
    out: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        if str(row.get('source') or '').strip().lower() != 'trading':
            continue
        venue = str(row.get('venue') or '').strip().lower()
        kind = str(row.get('kind') or '').strip().lower()
        if venue not in {'polymarket', 'limitless', 'kalshi'}:
            continue
        if venue not in VENUES:
            continue
        if kind == 'signal':
            out.append(row)
            continue
        if kind != 'trade_candidate':
            continue
        expected_net = parse_float(row.get('expectedNetUsd'), 0.0)
        if expected_net < MIN_EDGE_USD:
            continue
        out.append(row)
    return out


def compute_trading_pnl(rows: list[dict[str, Any]]) -> tuple[float, float, float]:
    now = datetime.now(timezone.utc)
    cutoff_week = now - timedelta(days=7)
    cutoff_day = now - timedelta(days=1)
    all_realized = 0.0
    weekly_realized = 0.0
    daily_realized = 0.0
    for row in rows:
        if str(row.get('source') or '').strip().lower() != 'trading':
            continue
        if str(row.get('kind') or '').strip().lower() != 'trade_close':
            continue
        if str(row.get('status') or '').strip().lower() != 'success':
            continue
        realized_flag = row.get('realized')
        if realized_flag is not True and str(realized_flag).strip().lower() not in {'1', 'true'}:
            continue
        net = parse_float(row.get('netUsd'), 0.0)
        all_realized += net
        ts = parse_ts(row.get('at') or row.get('timestamp') or row.get('executedAt'))
        if ts is None:
            continue
        if ts >= cutoff_week:
            weekly_realized += net
        if ts >= cutoff_day:
            daily_realized += net
    return round(all_realized, 8), round(weekly_realized, 8), round(daily_realized, 8)


def candidate_score(candidate: dict[str, Any]) -> float:
    expected_net = max(0.0, parse_float(candidate.get('expectedNetUsd'), 0.0))
    confidence = clamp(parse_float(candidate.get('confidence'), 0.0), 0.0, 1.0)
    fill_probability = clamp(parse_float(candidate.get('fillProbability'), 0.5), 0.0, 1.0)
    return round(expected_net * confidence * fill_probability, 12)


def build_venue_allocations(candidates: list[dict[str, Any]], daily_budget_usd: float) -> tuple[dict[str, float], dict[str, float]]:
    trading_venues = ['polymarket', 'limitless']
    scores: dict[str, float] = {venue: 0.0 for venue in trading_venues}
    for candidate in candidates:
        venue = str(candidate.get('venue') or '').strip().lower()
        if venue in scores:
            scores[venue] += candidate_score(candidate)

    active_venues = [venue for venue in trading_venues if scores.get(venue, 0.0) > 0.0]
    if not active_venues:
        active_venues = [venue for venue in trading_venues if venue in VENUES]

    if not active_venues or daily_budget_usd <= 0:
        return ({venue: 0.0 for venue in trading_venues}, {venue: 0.0 for venue in trading_venues})

    total_score = sum(scores.get(venue, 0.0) for venue in active_venues)
    if total_score <= 0:
        weights = {venue: 1.0 / len(active_venues) for venue in active_venues}
    else:
        weights = {venue: scores.get(venue, 0.0) / total_score for venue in active_venues}

    min_share = VENUE_MIN_ALLOC_PCT / 100.0
    max_share = VENUE_MAX_ALLOC_PCT / 100.0
    clamped = {venue: clamp(weight, min_share, max_share) for venue, weight in weights.items()}
    clamped_total = sum(clamped.values())
    if clamped_total <= 0:
        normalized = {venue: 1.0 / len(active_venues) for venue in active_venues}
    else:
        normalized = {venue: clamped[venue] / clamped_total for venue in active_venues}

    budget_by_venue = {venue: round(daily_budget_usd * normalized.get(venue, 0.0), 8) for venue in trading_venues}
    weight_by_venue = {venue: round(normalized.get(venue, 0.0), 8) for venue in trading_venues}
    return budget_by_venue, weight_by_venue


def run_exec_cmd(command: str, env_vars: dict[str, str]) -> dict[str, Any]:
    env = os.environ.copy()
    env.update(env_vars)
    proc = subprocess.run(
        ['bash', '-lc', command],
        capture_output=True,
        text=True,
        timeout=LIVE_ORDER_TIMEOUT_SECONDS,
        check=False,
        env=env,
    )
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout or f'exec_cmd_exit_{proc.returncode}').strip()[:350] or 'exec_cmd_failed')

    text = (proc.stdout or '').strip()
    if not text:
        raise RuntimeError('exec_cmd_empty_output')
    try:
        payload = json.loads(text)
        if isinstance(payload, dict):
            return payload
    except Exception:
        pass
    for line in reversed(text.splitlines()):
        stripped = line.strip()
        if not stripped:
            continue
        try:
            payload = json.loads(stripped)
            if isinstance(payload, dict):
                return payload
        except Exception:
            continue
    raise RuntimeError('exec_cmd_invalid_json')


def run_bridge_worker(worker_path: Path, env_vars: dict[str, str]) -> dict[str, Any]:
    binary = node_bin()
    if not binary:
        raise RuntimeError('missing_node_runtime')
    if not worker_path.exists():
        raise RuntimeError('bridge_worker_not_found')
    env = os.environ.copy()
    env.update(env_vars)
    proc = subprocess.run(
        [binary, str(worker_path)],
        capture_output=True,
        text=True,
        timeout=LIVE_ORDER_TIMEOUT_SECONDS,
        check=False,
        env=env,
    )
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout or f'bridge_worker_exit_{proc.returncode}').strip()[:350] or 'bridge_worker_failed')

    text = (proc.stdout or '').strip()
    if not text:
        raise RuntimeError('bridge_worker_empty_output')
    try:
        payload = json.loads(text)
        if isinstance(payload, dict):
            return payload
    except Exception:
        pass
    for line in reversed(text.splitlines()):
        stripped = line.strip()
        if not stripped:
            continue
        try:
            payload = json.loads(stripped)
            if isinstance(payload, dict):
                return payload
        except Exception:
            continue
    raise RuntimeError('bridge_worker_invalid_json')


def venue_env_payload(candidate: dict[str, Any], notional_usd: float) -> dict[str, str]:
    return {
        'KYO_TRADING_MARKET_ID': str(candidate.get('marketId') or ''),
        'KYO_TRADING_CANDIDATE_ID': str(candidate.get('id') or ''),
        'KYO_TRADING_NOTIONAL_USD': f'{notional_usd:.8f}',
        'KYO_TRADING_CANDIDATE_JSON': json.dumps(candidate, ensure_ascii=True),
    }


def live_execute_polymarket(candidate: dict[str, Any], notional_usd: float) -> dict[str, Any]:
    env_payload = {'KYO_TRADING_VENUE': 'polymarket', **venue_env_payload(candidate, notional_usd)}
    if POLYMARKET_EXEC_CMD:
        return run_exec_cmd(POLYMARKET_EXEC_CMD, env_payload)
    if has_bridge(POLYMARKET_BRIDGE_PATH):
        return run_bridge_worker(POLYMARKET_BRIDGE_PATH, env_payload)
    raise RuntimeError('missing_polymarket_execution_transport')


def live_execute_limitless(candidate: dict[str, Any], notional_usd: float) -> dict[str, Any]:
    env_payload = {'KYO_TRADING_VENUE': 'limitless', **venue_env_payload(candidate, notional_usd)}
    if LIMITLESS_EXEC_CMD:
        return run_exec_cmd(LIMITLESS_EXEC_CMD, env_payload)
    if has_bridge(LIMITLESS_BRIDGE_PATH):
        return run_bridge_worker(LIMITLESS_BRIDGE_PATH, env_payload)
    raise RuntimeError('missing_limitless_execution_transport')


def parse_live_result(candidate: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    required = ['orderId', 'positionId', 'grossUsd', 'costUsd', 'netUsd', 'realized', 'paymentRef', 'raw']
    missing = [field for field in required if field not in payload]
    if missing:
        raise RuntimeError(f'bridge_contract_missing_fields:{"|".join(missing)}')

    order_id = str(payload.get('orderId') or '').strip()
    position_id = str(payload.get('positionId') or '').strip()
    if not order_id or not position_id:
        raise RuntimeError('bridge_contract_missing_ids')

    gross_usd = parse_float(payload.get('grossUsd'), float('nan'))
    cost_usd = parse_float(payload.get('costUsd'), float('nan'))
    net_usd = parse_float(payload.get('netUsd'), float('nan'))
    if gross_usd != gross_usd or cost_usd != cost_usd or net_usd != net_usd:
        raise RuntimeError('bridge_contract_invalid_amounts')

    return {
        'orderId': order_id,
        'positionId': position_id,
        'grossUsd': round(max(0.0, gross_usd), 8),
        'costUsd': round(max(0.0, cost_usd), 8),
        'netUsd': round(net_usd, 8),
        'realized': to_bool(payload.get('realized'), False),
        'paymentRef': str(payload.get('paymentRef') or '').strip(),
        'raw': payload.get('raw'),
        'marketId': str(candidate.get('marketId') or ''),
    }


def fetch_polymarket_geo() -> dict[str, Any]:
    if not POLYMARKET_GEO_URL:
        return {'ok': False, 'blocked': False, 'error': 'missing_geo_url', 'checkedAt': now_iso()}

    try:
        payload = request_json(POLYMARKET_GEO_URL)
    except Exception as exc:
        return {'ok': False, 'blocked': POLYMARKET_REQUIRE_GEO_ALLOWED, 'error': str(exc)[:320], 'checkedAt': now_iso()}

    blocked = False
    country = ''
    region = ''
    if isinstance(payload, dict):
        blocked = to_bool(
            payload.get('blocked')
            if 'blocked' in payload
            else payload.get('isBlocked')
            if 'isBlocked' in payload
            else payload.get('geoBlocked')
            if 'geoBlocked' in payload
            else payload.get('geoblocked'),
            False,
        )
        if 'allowed' in payload and isinstance(payload.get('allowed'), bool):
            blocked = blocked or not bool(payload.get('allowed'))
        country = str(payload.get('country') or payload.get('countryCode') or '').strip()
        region = str(payload.get('region') or payload.get('state') or '').strip()

    return {
        'ok': True,
        'blocked': blocked,
        'country': country,
        'region': region,
        'checkedAt': now_iso(),
        'raw': payload if isinstance(payload, dict) else {'payload': payload},
    }


def append_ledger_row(row: dict[str, Any]) -> None:
    append_json_line(LEDGER_PATH, row)


def run() -> int:
    ensure_dirs()
    started_at = now_iso()

    if EXECUTION_MODE not in {'paper', 'live'}:
        summary = {
            'ok': False,
            'status': 'blocked',
            'reason': 'invalid_execution_mode',
            'executionMode': EXECUTION_MODE,
            'startedAt': started_at,
            'at': now_iso(),
        }
        write_json(STATE_PATH, {'lastRunAt': summary['at'], 'lastStatus': summary})
        write_json(OUTPUT_PATH, summary)
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    polymarket_transport_ready = bool(POLYMARKET_EXEC_CMD) or has_bridge(POLYMARKET_BRIDGE_PATH)
    limitless_transport_ready = bool(LIMITLESS_EXEC_CMD) or has_bridge(LIMITLESS_BRIDGE_PATH)
    capabilities = {
        'ok': True,
        'at': now_iso(),
        'executionMode': EXECUTION_MODE,
        'liveVenueReady': {
            'polymarket': polymarket_transport_ready,
            'limitless': limitless_transport_ready,
        },
        'signalVenueReady': {
            'kalshi': 'kalshi' in VENUES,
        },
        'blockers': [],
        'bridgePaths': {
            'polymarket': str(POLYMARKET_BRIDGE_PATH),
            'limitless': str(LIMITLESS_BRIDGE_PATH),
        },
    }

    if not ENABLE_TRADING_AGENT:
        summary = {
            'ok': True,
            'status': 'disabled',
            'reason': 'trading_agent_disabled',
            'executionMode': EXECUTION_MODE,
            'startedAt': started_at,
            'at': now_iso(),
            'ledgerPath': str(LEDGER_PATH),
            'capabilitiesPath': str(CAPABILITIES_PATH),
            'polymarketGeoPath': str(POLYMARKET_GEO_PATH),
            'deprecatedAliases': {'dflowTradesTick': 0},
        }
        geo_payload = {'ok': True, 'blocked': False, 'checkedAt': summary['at'], 'status': 'disabled'}
        write_json(POLYMARKET_GEO_PATH, geo_payload)
        write_json(CAPABILITIES_PATH, capabilities)
        write_json(STATE_PATH, {'lastRunAt': summary['at'], 'lastStatus': summary})
        write_json(OUTPUT_PATH, summary)
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    feed_payload = read_json(FEED_PATH, {})
    candidates = normalize_candidates(feed_payload if isinstance(feed_payload, dict) else {})
    state = read_json(STATE_PATH, {})
    if not isinstance(state, dict):
        state = {}
    positions_state = read_json(POSITIONS_PATH, {})
    if not isinstance(positions_state, dict):
        positions_state = {}
    guard_state = read_json(REVENUE_GUARD_PATH, {})
    if not isinstance(guard_state, dict):
        guard_state = {}
    rows = jsonl_rows(LEDGER_PATH)

    current_day = today_iso()
    signal_seen = state.get('signalSeen') if isinstance(state.get('signalSeen'), dict) else {}
    daily_notional_used = parse_float(state.get('dailyNotionalUsdUsed'), 0.0)
    state_day = str(state.get('day') or '')
    if state_day != current_day:
        daily_notional_used = 0.0

    all_realized_net, weekly_realized_net, daily_realized_net = compute_trading_pnl(rows)
    current_equity = round(max(0.0, STARTING_EQUITY_USD + all_realized_net), 8)
    peak_equity = max(current_equity, parse_float(state.get('peakEquityUsd'), STARTING_EQUITY_USD), STARTING_EQUITY_USD)
    drawdown_pct = 0.0 if peak_equity <= 0 else round(max(0.0, ((peak_equity - current_equity) / peak_equity) * 100.0), 8)
    daily_loss_stop_usd = round(STARTING_EQUITY_USD * (DAILY_LOSS_STOP_PCT / 100.0), 8)

    geo_payload: dict[str, Any] = {'ok': True, 'blocked': False, 'checkedAt': now_iso(), 'status': 'not_required'}
    reasons: list[str] = []
    if to_bool(guard_state.get('blockPaidExecution'), False):
        reasons.append('revenue_guard_block_paid_execution')
    if drawdown_pct > MAX_DRAWDOWN_PCT:
        reasons.append('drawdown_limit_exceeded')
    if WEEKLY_LOSS_CAP_USD > 0 and weekly_realized_net < -WEEKLY_LOSS_CAP_USD:
        reasons.append('weekly_loss_cap_exceeded')
    if DAILY_LOSS_STOP_PCT > 0 and daily_realized_net < -daily_loss_stop_usd:
        reasons.append('daily_loss_stop_exceeded')

    live_mode = EXECUTION_MODE == 'live'
    if live_mode and 'polymarket' in VENUES and not polymarket_transport_ready:
        reasons.append('missing_polymarket_execution_transport')
    if live_mode and 'limitless' in VENUES and not limitless_transport_ready:
        reasons.append('missing_limitless_execution_transport')

    if live_mode and 'polymarket' in VENUES:
        geo_payload = fetch_polymarket_geo()
        if to_bool(geo_payload.get('blocked'), False):
            if POLYMARKET_REQUIRE_GEO_ALLOWED:
                reasons.append('polymarket_geo_blocked')
        if not to_bool(geo_payload.get('ok'), False) and POLYMARKET_REQUIRE_GEO_ALLOWED:
            reasons.append('polymarket_geo_check_failed')
    write_json(POLYMARKET_GEO_PATH, geo_payload)

    open_positions = positions_state.get('positions') if isinstance(positions_state.get('positions'), list) else []
    open_positions = [row for row in open_positions if isinstance(row, dict)]

    max_market_exposure_usd = round(max(1.0, current_equity * (MAX_MARKET_EXPOSURE_PCT / 100.0)), 8)
    market_exposure: dict[str, float] = {}
    for position in open_positions:
        if str(position.get('status') or 'open').strip().lower() != 'open':
            continue
        market_id = str(position.get('marketId') or '').strip()
        market_exposure[market_id] = market_exposure.get(market_id, 0.0) + max(0.0, parse_float(position.get('notionalUsd'), 0.0))

    executed = 0
    succeeded = 0
    failed = 0
    closed = 0
    signal_rows = 0
    records_appended = 0
    blocked_candidates = 0
    exec_errors: list[dict[str, Any]] = []
    trades_by_venue = {'polymarket': 0, 'limitless': 0}

    now = datetime.now(timezone.utc)
    keep_open_positions: list[dict[str, Any]] = []
    for position in open_positions:
        if str(position.get('status') or 'open').strip().lower() != 'open':
            continue
        opened_at = parse_ts(position.get('openedAt') or position.get('at'))
        if opened_at is None:
            keep_open_positions.append(position)
            continue
        held_hours = max(0.0, (now - opened_at).total_seconds() / 3600.0)
        unrealized_pct = parse_float(position.get('unrealizedPct'), 0.0)
        should_close = held_hours >= MAX_HOLD_HOURS
        close_reason = 'max_hold_reached'
        if unrealized_pct >= TAKE_PROFIT_PCT:
            should_close = True
            close_reason = 'take_profit'
        if unrealized_pct <= -STOP_LOSS_PCT:
            should_close = True
            close_reason = 'stop_loss'
        if EXECUTION_MODE == 'paper':
            should_close = True
            close_reason = 'paper_close'

        if not should_close:
            keep_open_positions.append(position)
            continue

        realized_net = parse_float(position.get('expectedNetUsd'), 0.0)
        confidence = clamp(parse_float(position.get('confidence'), 0.6), 0.2, 1.0)
        realized_net = round(realized_net * confidence, 8)
        cost_usd = max(0.0, parse_float(position.get('feesEstimate'), 0.0) + parse_float(position.get('expectedSlippage'), 0.0))
        gross_usd = max(0.0, round(realized_net + cost_usd, 8))
        close_row = {
            'id': stable_trade_id('trade-close', str(position.get('positionId') or position.get('id') or 'open')),
            'at': now_iso(),
            'source': 'trading',
            'venue': str(position.get('venue') or '').strip().lower(),
            'kind': 'trade_close',
            'status': 'success',
            'realized': True,
            'marketId': str(position.get('marketId') or ''),
            'positionId': str(position.get('positionId') or ''),
            'orderId': str(position.get('orderId') or ''),
            'grossUsd': round(gross_usd, 8),
            'costUsd': round(cost_usd, 8),
            'netUsd': round(realized_net, 8),
            'paymentRef': str(position.get('paymentRef') or ''),
            'metadata': {'closeReason': close_reason},
        }
        append_ledger_row(close_row)
        records_appended += 1
        closed += 1

    open_positions = keep_open_positions

    signal_candidates = [row for row in candidates if str(row.get('kind') or '').strip().lower() == 'signal']
    for signal in signal_candidates:
        signal_id = str(signal.get('id') or '')
        marker = str(signal_seen.get(signal_id) or '')
        if marker == current_day:
            continue
        signal_seen[signal_id] = current_day
        signal_rows += 1
        row = {
            'id': stable_trade_id('signal', signal_id or now_iso()),
            'at': now_iso(),
            'source': 'trading',
            'venue': str(signal.get('venue') or 'kalshi').strip().lower(),
            'kind': 'signal',
            'status': 'success',
            'realized': False,
            'marketId': str(signal.get('marketId') or ''),
            'grossUsd': 0.0,
            'costUsd': 0.0,
            'netUsd': 0.0,
            'metadata': {
                'confidence': parse_float(signal.get('confidence'), 0.0),
                'expectedNetUsd': parse_float(signal.get('expectedNetUsd'), 0.0),
            },
        }
        append_ledger_row(row)
        records_appended += 1

    tradable_candidates = [row for row in candidates if str(row.get('kind') or '').strip().lower() == 'trade_candidate']
    tradable_candidates.sort(
        key=lambda row: (
            candidate_score(row),
            parse_float(row.get('confidence'), 0.0),
        ),
        reverse=True,
    )

    available_daily_budget = max(0.0, MAX_NOTIONAL_USD_PER_DAY - daily_notional_used)
    venue_budgets, venue_weights = build_venue_allocations(tradable_candidates, available_daily_budget)
    venue_budget_remaining = dict(venue_budgets)

    if reasons:
        blocked_candidates = len(tradable_candidates)
    else:
        for candidate in tradable_candidates:
            if len(open_positions) >= MAX_OPEN_POSITIONS:
                blocked_candidates += 1
                continue
            venue = str(candidate.get('venue') or '').strip().lower()
            if venue == 'kalshi' and KALSHI_SIGNAL_ONLY:
                blocked_candidates += 1
                continue
            if venue not in {'polymarket', 'limitless'}:
                blocked_candidates += 1
                continue
            if live_mode and venue == 'polymarket' and to_bool(geo_payload.get('blocked'), False) and POLYMARKET_REQUIRE_GEO_ALLOWED:
                blocked_candidates += 1
                continue

            venue_remaining = max(0.0, venue_budget_remaining.get(venue, 0.0))
            if venue_remaining <= 0:
                blocked_candidates += 1
                continue

            market_id = str(candidate.get('marketId') or candidate.get('id') or '')
            current_market_exposure = market_exposure.get(market_id, 0.0)
            market_room = max_market_exposure_usd - current_market_exposure
            day_room = MAX_NOTIONAL_USD_PER_DAY - daily_notional_used
            notional_usd = min(BASE_NOTIONAL_PER_TRADE_USD, venue_remaining, market_room, day_room)
            if notional_usd <= 0:
                blocked_candidates += 1
                continue

            executed += 1
            open_id = stable_trade_id('trade-open', str(candidate.get('id') or now_iso()))
            open_row = {
                'id': open_id,
                'at': now_iso(),
                'source': 'trading',
                'venue': venue,
                'kind': 'trade_open',
                'status': 'success',
                'realized': False,
                'marketId': market_id,
                'positionId': open_id,
                'orderId': open_id,
                'grossUsd': 0.0,
                'costUsd': 0.0,
                'netUsd': 0.0,
                'metadata': {
                    'executionMode': EXECUTION_MODE,
                    'notionalUsd': round(notional_usd, 8),
                    'confidence': parse_float(candidate.get('confidence'), 0.0),
                    'expectedNetUsd': parse_float(candidate.get('expectedNetUsd'), 0.0),
                    'allocationWeight': venue_weights.get(venue, 0.0),
                },
            }

            daily_notional_used = round(daily_notional_used + notional_usd, 8)
            market_exposure[market_id] = round(current_market_exposure + notional_usd, 8)
            venue_budget_remaining[venue] = round(max(0.0, venue_budget_remaining.get(venue, 0.0) - notional_usd), 8)

            try:
                if live_mode:
                    if venue == 'polymarket':
                        result = parse_live_result(candidate, live_execute_polymarket(candidate, notional_usd))
                    elif venue == 'limitless':
                        result = parse_live_result(candidate, live_execute_limitless(candidate, notional_usd))
                    else:
                        raise RuntimeError('unsupported_live_venue')

                    open_row['orderId'] = result['orderId']
                    open_row['positionId'] = result['positionId']
                    open_row['paymentRef'] = result['paymentRef']
                    open_row['metadata']['liveResult'] = result['raw']
                    append_ledger_row(open_row)
                    records_appended += 1

                    if result['realized']:
                        close_row = {
                            'id': stable_trade_id('trade-close', result['positionId']),
                            'at': now_iso(),
                            'source': 'trading',
                            'venue': venue,
                            'kind': 'trade_close',
                            'status': 'success',
                            'realized': True,
                            'marketId': market_id,
                            'positionId': result['positionId'],
                            'orderId': result['orderId'],
                            'grossUsd': result['grossUsd'],
                            'costUsd': result['costUsd'],
                            'netUsd': result['netUsd'],
                            'paymentRef': result['paymentRef'],
                            'metadata': {'executionMode': 'live'},
                        }
                        append_ledger_row(close_row)
                        records_appended += 1
                        closed += 1
                    else:
                        open_positions.append(
                            {
                                'id': open_id,
                                'positionId': result['positionId'],
                                'orderId': result['orderId'],
                                'marketId': market_id,
                                'venue': venue,
                                'status': 'open',
                                'openedAt': now_iso(),
                                'notionalUsd': round(notional_usd, 8),
                                'confidence': parse_float(candidate.get('confidence'), 0.0),
                                'expectedNetUsd': parse_float(candidate.get('expectedNetUsd'), 0.0),
                                'feesEstimate': parse_float(candidate.get('feesEstimate'), 0.0),
                                'expectedSlippage': parse_float(candidate.get('expectedSlippage'), 0.0),
                                'paymentRef': result['paymentRef'],
                                'unrealizedPct': 0.0,
                            }
                        )
                    succeeded += 1
                    trades_by_venue[venue] += 1
                else:
                    append_ledger_row(open_row)
                    records_appended += 1
                    expected_net = parse_float(candidate.get('expectedNetUsd'), 0.0)
                    confidence = clamp(parse_float(candidate.get('confidence'), 0.6), 0.2, 1.0)
                    realized_net = round(expected_net * confidence, 8)
                    cost_usd = max(0.0, parse_float(candidate.get('feesEstimate'), 0.0) + parse_float(candidate.get('expectedSlippage'), 0.0))
                    gross_usd = max(0.0, round(realized_net + cost_usd, 8))
                    close_row = {
                        'id': stable_trade_id('trade-close', str(candidate.get('id') or open_id)),
                        'at': now_iso(),
                        'source': 'trading',
                        'venue': venue,
                        'kind': 'trade_close',
                        'status': 'success',
                        'realized': True,
                        'marketId': market_id,
                        'positionId': open_id,
                        'orderId': open_id,
                        'grossUsd': round(gross_usd, 8),
                        'costUsd': round(cost_usd, 8),
                        'netUsd': round(realized_net, 8),
                        'paymentRef': '',
                        'metadata': {'executionMode': 'paper'},
                    }
                    append_ledger_row(close_row)
                    records_appended += 1
                    closed += 1
                    succeeded += 1
                    trades_by_venue[venue] += 1
            except Exception as exc:
                failed += 1
                error_message = str(exc).strip()[:300] or 'trade_execution_failed'
                exec_errors.append({'candidateId': str(candidate.get('id') or ''), 'venue': venue, 'error': error_message})

                daily_notional_used = round(max(0.0, daily_notional_used - notional_usd), 8)
                market_exposure[market_id] = round(max(0.0, market_exposure.get(market_id, 0.0) - notional_usd), 8)
                venue_budget_remaining[venue] = round(venue_budget_remaining.get(venue, 0.0) + notional_usd, 8)

                failure_row = {
                    'id': stable_trade_id('trade-open-failed', str(candidate.get('id') or now_iso())),
                    'at': now_iso(),
                    'source': 'trading',
                    'venue': venue,
                    'kind': 'trade_open',
                    'status': 'failed',
                    'realized': False,
                    'marketId': market_id,
                    'positionId': '',
                    'orderId': '',
                    'grossUsd': 0.0,
                    'costUsd': 0.0,
                    'netUsd': 0.0,
                    'paymentRef': '',
                    'error': error_message,
                }
                append_ledger_row(failure_row)
                records_appended += 1

    if len(open_positions) > MAX_OPEN_POSITIONS:
        open_positions = open_positions[:MAX_OPEN_POSITIONS]

    all_realized_net_after, weekly_realized_net_after, daily_realized_net_after = compute_trading_pnl(jsonl_rows(LEDGER_PATH))
    current_equity_after = round(max(0.0, STARTING_EQUITY_USD + all_realized_net_after), 8)
    peak_equity = max(peak_equity, current_equity_after)
    drawdown_pct_after = 0.0 if peak_equity <= 0 else round(max(0.0, ((peak_equity - current_equity_after) / peak_equity) * 100.0), 8)

    positions_payload = {
        'ok': True,
        'at': now_iso(),
        'day': current_day,
        'positions': open_positions,
        'openPositions': len(open_positions),
        'peakEquityUsd': round(peak_equity, 8),
        'currentEquityUsd': current_equity_after,
        'dailyNotionalUsdUsed': round(daily_notional_used, 8),
        'maxNotionalUsdPerDay': round(MAX_NOTIONAL_USD_PER_DAY, 8),
        'venueBudgets': venue_budgets,
        'venueBudgetRemaining': venue_budget_remaining,
        'venueWeights': venue_weights,
    }
    write_json(POSITIONS_PATH, positions_payload)

    status = 'ok'
    if reasons:
        status = 'blocked'
    elif failed > 0:
        status = 'degraded'

    capabilities['blockers'] = sorted(set(reasons))
    capabilities['ok'] = len(capabilities['blockers']) == 0
    write_json(CAPABILITIES_PATH, capabilities)

    summary = {
        'ok': status == 'ok',
        'status': status,
        'startedAt': started_at,
        'at': now_iso(),
        'executionMode': EXECUTION_MODE,
        'reasons': sorted(set(reasons)),
        'candidates': len(candidates),
        'tradableCandidates': len(tradable_candidates),
        'signalCandidates': len(signal_candidates),
        'executedTrades': executed,
        'successfulTrades': succeeded,
        'failedTrades': failed,
        'closedTradesTick': closed,
        'openPositions': len(open_positions),
        'signalsRecorded': signal_rows,
        'blockedCandidates': blocked_candidates,
        'recordsAppended': records_appended,
        'dailyNotionalUsdUsed': round(daily_notional_used, 8),
        'maxNotionalUsdPerDay': round(MAX_NOTIONAL_USD_PER_DAY, 8),
        'maxOpenPositions': MAX_OPEN_POSITIONS,
        'maxMarketExposureUsd': round(max_market_exposure_usd, 8),
        'drawdownPct': drawdown_pct_after,
        'maxDrawdownPct': round(MAX_DRAWDOWN_PCT, 8),
        'dailyLossStopPct': round(DAILY_LOSS_STOP_PCT, 8),
        'weeklyLossCapUsd': round(WEEKLY_LOSS_CAP_USD, 8),
        'dailyRealizedNetUsd': round(daily_realized_net_after, 8),
        'weeklyRealizedNetUsd': round(weekly_realized_net_after, 8),
        'allRealizedNetUsd': round(all_realized_net_after, 8),
        'peakEquityUsd': round(peak_equity, 8),
        'currentEquityUsd': round(current_equity_after, 8),
        'polymarketTradesTick': trades_by_venue['polymarket'],
        'limitlessTradesTick': trades_by_venue['limitless'],
        'kalshiSignalsTick': signal_rows,
        'venueWeights': venue_weights,
        'venueBudgets': venue_budgets,
        'venueBudgetRemaining': venue_budget_remaining,
        'capabilitiesPath': str(CAPABILITIES_PATH),
        'polymarketGeoPath': str(POLYMARKET_GEO_PATH),
        'positionsPath': str(POSITIONS_PATH),
        'ledgerPath': str(LEDGER_PATH),
        'deprecatedAliases': {'dflowTradesTick': 0},
        'errors': exec_errors,
    }

    write_json(
        STATE_PATH,
        {
            'lastRunAt': summary['at'],
            'day': current_day,
            'dailyNotionalUsdUsed': round(daily_notional_used, 8),
            'peakEquityUsd': round(peak_equity, 8),
            'signalSeen': signal_seen,
            'lastStatus': summary,
        },
    )
    write_json(OUTPUT_PATH, summary)
    append_json_line(
        LOG_PATH,
        {
            'at': summary['at'],
            'event': 'trading_exec',
            'ok': summary['ok'],
            'status': summary['status'],
            'executionMode': EXECUTION_MODE,
            'executedTrades': executed,
            'successfulTrades': succeeded,
            'failedTrades': failed,
            'closedTradesTick': closed,
            'openPositions': len(open_positions),
            'polymarketTradesTick': trades_by_venue['polymarket'],
            'limitlessTradesTick': trades_by_venue['limitless'],
            'kalshiSignalsTick': signal_rows,
            'drawdownPct': drawdown_pct_after,
            'weeklyRealizedNetUsd': weekly_realized_net_after,
            'reasons': summary['reasons'],
        },
    )
    print(json.dumps(summary, ensure_ascii=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(run())
