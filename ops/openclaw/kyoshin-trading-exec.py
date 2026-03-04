#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
import re
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
SINGULARITY_PAPER_PATH = STATE_DIR / 'singularity-paper.json'
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
SINGULARITY_ENABLED = env_bool('KYO_TRADING_SINGULARITY_ENABLED', False)
SINGULARITY_MODE = os.getenv('KYO_TRADING_SINGULARITY_MODE', 'paper').strip().lower()
VENUES = [
    item.strip().lower()
    for item in os.getenv('KYO_TRADING_VENUES', 'polymarket,limitless,kalshi').split(',')
    if item.strip()
]
if SINGULARITY_ENABLED and 'singularity' not in VENUES:
    VENUES.append('singularity')
KALSHI_SIGNAL_ONLY = env_bool('KYO_TRADING_KALSHI_SIGNAL_ONLY', True)

STARTING_EQUITY_USD = max(1.0, env_float('KYO_TRADING_STARTING_EQUITY_USD', 200.0))
MAX_NOTIONAL_USD_PER_DAY = max(1.0, env_float('KYO_TRADING_MAX_NOTIONAL_USD_PER_DAY', 400.0))
MAX_OPEN_POSITIONS = max(1, env_int('KYO_TRADING_MAX_OPEN_POSITIONS', 2))
MAX_POSITIONS_PER_MARKET = max(1, env_int('KYO_TRADING_MAX_POSITIONS_PER_MARKET', 1))
MAX_MARKET_EXPOSURE_PCT = max(1.0, min(100.0, env_float('KYO_TRADING_MAX_MARKET_EXPOSURE_PCT', 25.0)))
MAX_DRAWDOWN_PCT = max(0.0, env_float('KYO_TRADING_MAX_DRAWDOWN_PCT', 8.0))
DAILY_LOSS_STOP_PCT = max(0.0, env_float('KYO_TRADING_DAILY_LOSS_STOP_PCT', 1.5))
WEEKLY_LOSS_CAP_USD = max(0.0, env_float('KYO_TRADING_WEEKLY_LOSS_CAP_USD', 300.0))
MAX_ORDER_SLIPPAGE_BPS = max(0.0, env_float('KYO_TRADING_MAX_ORDER_SLIPPAGE_BPS', 120.0))
MIN_EDGE_USD = env_float('KYO_TRADING_MIN_EDGE_USD', 0.05)
TAKE_PROFIT_PCT = max(0.0, env_float('KYO_TRADING_TAKE_PROFIT_PCT', 12.0))
STOP_LOSS_PCT = max(0.0, env_float('KYO_TRADING_STOP_LOSS_PCT', 8.0))
MAX_HOLD_HOURS = max(1.0, env_float('KYO_TRADING_MAX_HOLD_HOURS', 72.0))
ENTRY_PRICE_MIN = max(0.001, min(0.499, env_float('KYO_TRADING_ENTRY_PRICE_MIN', 0.05)))
ENTRY_PRICE_MAX = max(ENTRY_PRICE_MIN + 0.001, min(0.999, env_float('KYO_TRADING_ENTRY_PRICE_MAX', 0.95)))
CLOSE_ORPHAN_POSITIONS = env_bool('KYO_TRADING_CLOSE_ORPHAN_POSITIONS', True)
ORPHAN_POSITION_HOLD_HOURS = max(0.0, env_float('KYO_TRADING_ORPHAN_POSITION_HOLD_HOURS', 2.0))
BASE_NOTIONAL_PER_TRADE_USD = max(1.0, env_float('KYO_TRADING_NOTIONAL_PER_TRADE_USD', 25.0))
VENUE_MIN_ALLOC_PCT = max(0.0, min(100.0, env_float('KYO_TRADING_VENUE_MIN_ALLOC_PCT', 20.0)))
VENUE_MAX_ALLOC_PCT = max(VENUE_MIN_ALLOC_PCT, min(100.0, env_float('KYO_TRADING_VENUE_MAX_ALLOC_PCT', 70.0)))
MAX_EXEC_ATTEMPTS_PER_TICK = max(1, min(100, env_int('KYO_TRADING_MAX_EXEC_ATTEMPTS_PER_TICK', 5)))
MAX_FAILURES_PER_TICK = max(1, min(50, env_int('KYO_TRADING_MAX_FAILURES_PER_TICK', 3)))
TICK_INTERVAL_SEC = max(15, env_int('KYO_TRADING_TICK_INTERVAL_SEC', 300))
MICRO_LIVE_MAX_NOTIONAL_USD = max(1.0, env_float('KYO_TRADING_MICRO_LIVE_MAX_NOTIONAL_USD', 75.0))
REAL_CLOSE_ENABLED = env_bool('KYO_TRADING_REAL_CLOSE_ENABLED', False)
CLOSE_STRICT_TRACKING = env_bool('KYO_TRADING_CLOSE_STRICT_TRACKING', True)
CLOSE_PENDING_RETRY_SEC = max(60, env_int('KYO_TRADING_CLOSE_PENDING_RETRY_SEC', 600))
SLOT_RECOVERY_ENABLED = env_bool('KYO_TRADING_SLOT_RECOVERY_ENABLED', True)
SLOT_RECOVERY_MIN_HOLD_HOURS = max(0.0, env_float('KYO_TRADING_SLOT_RECOVERY_MIN_HOLD_HOURS', 1.0))
SLOT_RECOVERY_MIN_SCORE_DELTA = max(0.0, env_float('KYO_TRADING_SLOT_RECOVERY_MIN_SCORE_DELTA', 0.02))
SLOT_RECOVERY_MAX_CLOSES_PER_TICK = max(0, env_int('KYO_TRADING_SLOT_RECOVERY_MAX_CLOSES_PER_TICK', 1))
MIN_PAPER_CLOSES_FOR_LIVE = max(1, env_int('KYO_TRADING_MIN_PAPER_CLOSES_FOR_LIVE', 200))
MIN_LIVE_CLOSES_TARGET_48H = max(1, env_int('KYO_TRADING_MIN_LIVE_CLOSES_TARGET_48H', 20))
ENFORCE_MICRO_LIVE_GATES = env_bool('KYO_TRADING_ENFORCE_MICRO_LIVE_GATES', False)

POLYMARKET_EXEC_CMD = os.getenv('KYO_TRADING_POLYMARKET_EXEC_CMD', '').strip()
LIMITLESS_EXEC_CMD = os.getenv('KYO_TRADING_LIMITLESS_EXEC_CMD', '').strip()
LIMITLESS_REQUIRE_SIGNED_PAYLOAD = env_bool('KYO_TRADING_LIMITLESS_REQUIRE_SIGNED_PAYLOAD', True)
LIMITLESS_API_BASE_URL = os.getenv('KYO_TRADING_LIMITLESS_API_BASE_URL', 'https://api.limitless.exchange').strip().rstrip('/')
LIMITLESS_API_KEY = os.getenv('KYO_TRADING_LIMITLESS_API_KEY', '').strip()
LIMITLESS_SYNC_POSITIONS = env_bool('KYO_TRADING_LIMITLESS_SYNC_POSITIONS', False)
LIMITLESS_MIN_POSITION_SIZE = max(0.0, env_float('KYO_TRADING_LIMITLESS_MIN_POSITION_SIZE', 0.01))
POLYMARKET_GEO_URL = os.getenv('KYO_TRADING_POLYMARKET_GEO_URL', 'https://polymarket.com/api/geoblock').strip()
POLYMARKET_REQUIRE_GEO_ALLOWED = env_bool('KYO_TRADING_POLYMARKET_REQUIRE_GEO_ALLOWED', True)
POLYMARKET_CLOB_BASE_URL = os.getenv('KYO_TRADING_POLYMARKET_CLOB_BASE_URL', 'https://clob.polymarket.com').strip().rstrip('/')

NODE_BIN_NAME = os.getenv('KYO_TRADING_BRIDGE_NODE_BIN', 'node').strip() or 'node'
HTTP_TIMEOUT_SECONDS = max(3, min(60, env_int('KYO_TRADING_EXEC_TIMEOUT_SECONDS', 20)))
LIVE_ORDER_TIMEOUT_SECONDS = max(3, min(120, env_int('KYO_TRADING_LIVE_ORDER_TIMEOUT_SECONDS', 25)))
EVM_TX_HASH_RE = re.compile(r'^0x[a-fA-F0-9]{64}$')
SOLANA_SIGNATURE_RE = re.compile(r'^[1-9A-HJ-NP-Za-km-z]{80,96}$')


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
    if isinstance(value, (int, float)):
        epoch = float(value)
        if epoch > 1_000_000_000_000:
            epoch = epoch / 1000.0
        if epoch <= 0:
            return None
        try:
            return datetime.fromtimestamp(epoch, tz=timezone.utc)
        except Exception:
            return None
    if isinstance(value, str):
        numeric = value.strip()
        if numeric and numeric.replace('.', '', 1).isdigit():
            return parse_ts(parse_float(numeric, 0.0))
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


def to_optional_price(value: Any) -> float | None:
    price = parse_float(value, float('nan'))
    if price != price:
        return None
    if price <= 0 or price >= 1:
        return None
    return float(price)


def normalize_entry_midpoint(midpoint_value: Any, direction: str) -> float | None:
    midpoint = to_optional_price(midpoint_value)
    if midpoint is None:
        return None
    normalized = midpoint
    side = str(direction or '').strip().lower()
    if side == 'no' and normalized < 0.5:
        normalized = 1.0 - normalized
    elif side == 'yes' and normalized > 0.5:
        normalized = 1.0 - normalized
    return to_optional_price(normalized)


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


def parse_usdc_minor(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, int):
        if value <= 0:
            return 0.0
        return round(float(value) / 1_000_000.0, 8)
    text = str(value).strip()
    if not text:
        return 0.0
    if text.isdigit():
        numeric = parse_float(text, 0.0)
        if numeric <= 0:
            return 0.0
        return round(numeric / 1_000_000.0, 8)
    if text.replace('.', '', 1).isdigit():
        return round(parse_float(text, 0.0), 8)
    return 0.0


def parse_token_minor(value: Any) -> float:
    if value is None:
        return 0.0
    text = str(value).strip()
    if not text:
        return 0.0
    numeric = parse_float(text, 0.0)
    if numeric <= 0:
        return 0.0
    if text.replace('.', '', 1).isdigit() and '.' not in text:
        return round(numeric / 1_000_000.0, 8)
    return round(numeric, 8)


def fetch_limitless_live_positions(existing_positions: list[dict[str, Any]]) -> list[dict[str, Any]] | None:
    if not LIMITLESS_SYNC_POSITIONS or not LIMITLESS_API_BASE_URL or not LIMITLESS_API_KEY:
        return None
    url = f'{LIMITLESS_API_BASE_URL}/portfolio/positions'
    try:
        payload = request_json(url, headers={'X-API-Key': LIMITLESS_API_KEY})
    except Exception:
        return None
    clob = payload.get('clob') if isinstance(payload, dict) and isinstance(payload.get('clob'), list) else []
    rows: list[dict[str, Any]] = []
    existing_by_id: dict[str, dict[str, Any]] = {}
    for row in existing_positions:
        if not isinstance(row, dict):
            continue
        position_id = str(row.get('positionId') or row.get('id') or '').strip()
        if position_id:
            existing_by_id[position_id] = row
    for item in clob:
        if not isinstance(item, dict):
            continue
        market = item.get('market') if isinstance(item.get('market'), dict) else {}
        if not market:
            continue
        market_status = str(market.get('status') or '').strip().upper()
        if market_status not in {'FUNDED', 'OPEN', 'ACTIVE', 'TRADING'}:
            continue
        slug = str(market.get('slug') or '').strip()
        if not slug:
            continue
        latest = item.get('latestTrade') if isinstance(item.get('latestTrade'), dict) else {}
        positions = item.get('positions') if isinstance(item.get('positions'), dict) else {}
        balances = item.get('tokensBalance') if isinstance(item.get('tokensBalance'), dict) else {}
        yes_token = str(market.get('yesPositionId') or '').strip()
        no_token = str(market.get('noPositionId') or '').strip()
        token_ids = {'yes': yes_token, 'no': no_token}
        for outcome in ('yes', 'no'):
            outcome_position = positions.get(outcome) if isinstance(positions.get(outcome), dict) else {}
            cost = parse_usdc_minor(outcome_position.get('cost'))
            balance = parse_token_minor(balances.get(outcome))
            if balance < LIMITLESS_MIN_POSITION_SIZE and cost < LIMITLESS_MIN_POSITION_SIZE:
                continue
            if cost <= 0 and balance <= 0:
                continue
            fill_price = parse_usdc_minor(outcome_position.get('fillPrice'))
            latest_price = to_optional_price(
                latest.get('latestYesPrice') if outcome == 'yes' else latest.get('latestNoPrice')
            )
            entry_price = to_optional_price(fill_price) or latest_price
            mark_price = latest_price or entry_price
            token_id = token_ids.get(outcome, '')
            position_id = token_id or stable_trade_id('limitless-position', f'{slug}:{outcome}')
            prior = existing_by_id.get(position_id, {})
            opened_at = str(prior.get('openedAt') or '').strip() or now_iso()
            rows.append(
                {
                    'id': stable_trade_id('limitless-position-snapshot', f'{slug}:{outcome}:{position_id}'),
                    'positionId': position_id,
                    'orderId': '',
                    'marketId': slug,
                    'venue': 'limitless',
                    'status': 'open',
                    'openedAt': opened_at,
                    'notionalUsd': round(max(0.0, cost), 8),
                    'confidence': parse_float(prior.get('confidence'), 0.0),
                    'expectedNetUsd': parse_float(prior.get('expectedNetUsd'), 0.0),
                    'feesEstimate': parse_float(prior.get('feesEstimate'), 0.0),
                    'expectedSlippage': parse_float(prior.get('expectedSlippage'), 0.0),
                    'paymentRef': str(prior.get('paymentRef') or '').strip(),
                    'candidateId': str(prior.get('candidateId') or '').strip(),
                    'leaderFollowSnapshot': (
                        prior.get('leaderFollowSnapshot')
                        if isinstance(prior.get('leaderFollowSnapshot'), dict)
                        else {}
                    ),
                    'tokenId': token_id,
                    'side': 'buy',
                    'direction': outcome,
                    'entryPrice': round(entry_price, 8) if entry_price is not None else None,
                    'markPrice': round(mark_price, 8) if mark_price is not None else None,
                    'unrealizedPct': 0.0,
                    'limitlessMarketSlug': slug,
                    'limitlessTokenId': token_id,
                    'limitlessTokenIds': token_ids,
                    'limitlessPositionSize': round(max(0.0, balance), 8),
                    'limitlessMarketStatus': market_status,
                }
            )
    return rows


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
        if venue not in {'polymarket', 'limitless', 'kalshi', 'singularity'}:
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


def has_settlement_evidence_from_row(row: dict[str, Any]) -> bool:
    tx_signature = str(row.get('txSignature') or '').strip()
    if tx_signature and looks_like_chain_tx_ref(tx_signature):
        return True
    settlement_ref = str(row.get('settlementRef') or '').strip()
    if settlement_ref:
        return True
    payment_ref = str(row.get('paymentRef') or '').strip()
    if payment_ref and looks_like_chain_tx_ref(payment_ref):
        return True
    metadata = row.get('metadata') if isinstance(row.get('metadata'), dict) else {}
    settlement = metadata.get('settlementEvidence') if isinstance(metadata, dict) else {}
    if isinstance(settlement, dict):
        if str(settlement.get('settlementRef') or settlement.get('fillId') or settlement.get('closeId') or '').strip():
            return True
        signature = str(
            settlement.get('txSignature')
            or settlement.get('txHash')
            or settlement.get('transactionHash')
            or ''
        ).strip()
        if signature and looks_like_chain_tx_ref(signature):
            return True
    return False


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
        if not has_settlement_evidence_from_row(row):
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


def count_realized_closes(rows: list[dict[str, Any]]) -> int:
    count = 0
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
        if not has_settlement_evidence_from_row(row):
            continue
        count += 1
    return count


def build_pending_close_index(rows: list[dict[str, Any]]) -> dict[str, datetime]:
    index: dict[str, datetime] = {}
    for row in rows:
        if str(row.get('source') or '').strip().lower() != 'trading':
            continue
        if str(row.get('kind') or '').strip().lower() != 'trade_close':
            continue
        if str(row.get('status') or '').strip().lower() != 'pending':
            continue
        metadata = row.get('metadata') if isinstance(row.get('metadata'), dict) else {}
        linked_id = str(
            metadata.get('linkedOpenPositionId')
            or row.get('positionId')
            or ''
        ).strip()
        if not linked_id:
            continue
        ts = parse_ts(row.get('at') or row.get('timestamp') or row.get('executedAt'))
        if ts is None:
            continue
        previous = index.get(linked_id)
        if previous is None or ts > previous:
            index[linked_id] = ts
    return index


def candidate_score(candidate: dict[str, Any]) -> float:
    expected_net = max(0.0, parse_float(candidate.get('expectedNetUsd'), 0.0))
    confidence = clamp(parse_float(candidate.get('confidence'), 0.0), 0.0, 1.0)
    fill_probability = clamp(parse_float(candidate.get('fillProbability'), 0.5), 0.0, 1.0)
    fees = max(0.0, parse_float(candidate.get('feesEstimate'), 0.0))
    slippage = max(0.0, parse_float(candidate.get('expectedSlippage'), 0.0))
    metadata = candidate.get('metadata') if isinstance(candidate.get('metadata'), dict) else {}
    inventory_risk = max(0.0, parse_float(metadata.get('inventoryRisk'), 0.0))
    risk_penalty = (fees * 0.25) + (slippage * 0.5) + inventory_risk
    return round((expected_net * confidence * fill_probability) - risk_penalty, 12)


def build_venue_allocations(
    candidates: list[dict[str, Any]],
    daily_budget_usd: float,
    trading_venues: list[str],
) -> tuple[dict[str, float], dict[str, float]]:
    trading_venues = [venue for venue in trading_venues if venue in {'polymarket', 'limitless', 'singularity'}]
    if not trading_venues:
        return ({}, {})
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


def candidate_entry_price_allowed(candidate: dict[str, Any]) -> bool:
    metadata = candidate.get('metadata') if isinstance(candidate.get('metadata'), dict) else {}
    direction = str(metadata.get('direction') or '').strip().lower()
    entry_hint = normalize_entry_midpoint(metadata.get('midpoint'), direction)
    if entry_hint is None:
        return True
    return ENTRY_PRICE_MIN <= entry_hint <= ENTRY_PRICE_MAX


def extract_process_error(stderr: str, stdout: str, fallback: str) -> str:
    for text in (stderr, stdout):
        if not text:
            continue
        for line in reversed(text.splitlines()):
            stripped = line.strip()
            if not stripped:
                continue
            try:
                payload = json.loads(stripped)
            except Exception:
                continue
            if not isinstance(payload, dict):
                continue
            error = payload.get('error')
            if isinstance(error, dict):
                code = str(error.get('code') or '').strip()
                message = str(error.get('message') or '').strip()
                details = error.get('details')
                detail_text = ''
                if isinstance(details, dict):
                    response = details.get('response')
                    if isinstance(response, dict):
                        detail_text = str(response.get('error') or '').strip()
                    if not detail_text:
                        body = details.get('body')
                        if isinstance(body, dict):
                            detail_text = str(
                                body.get('error')
                                or body.get('message')
                                or body.get('reason')
                                or body.get('detail')
                                or ''
                            ).strip()
                        elif isinstance(body, str):
                            detail_text = body.strip()
                parts = [part for part in [code, message, detail_text] if part]
                if parts:
                    return ': '.join(parts)[:350]
                continue
            return stripped[:350]
    return (fallback or '').strip()[:350] or 'process_failed'


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
        message = extract_process_error(proc.stderr or '', proc.stdout or '', f'exec_cmd_exit_{proc.returncode}')
        raise RuntimeError(message or 'exec_cmd_failed')

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
        message = extract_process_error(proc.stderr or '', proc.stdout or '', f'bridge_worker_exit_{proc.returncode}')
        raise RuntimeError(message or 'bridge_worker_failed')

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

    raw_payload = payload.get('raw') if isinstance(payload.get('raw'), dict) else {}
    settlement_ref = str(
        payload.get('settlementRef')
        or payload.get('fillId')
        or payload.get('closeId')
        or payload.get('txSignature')
        or payload.get('txHash')
        or payload.get('transactionHash')
        or raw_payload.get('settlementRef')
        or raw_payload.get('fillId')
        or raw_payload.get('closeId')
        or raw_payload.get('txSignature')
        or raw_payload.get('txHash')
        or raw_payload.get('transactionHash')
        or ''
    ).strip()
    tx_signature = str(
        payload.get('txSignature')
        or payload.get('txHash')
        or payload.get('transactionHash')
        or raw_payload.get('txSignature')
        or raw_payload.get('txHash')
        or raw_payload.get('transactionHash')
        or ''
    ).strip()

    return {
        'orderId': order_id,
        'positionId': position_id,
        'grossUsd': round(max(0.0, gross_usd), 8),
        'costUsd': round(max(0.0, cost_usd), 8),
        'netUsd': round(net_usd, 8),
        'realized': to_bool(payload.get('realized'), False),
        'paymentRef': str(payload.get('paymentRef') or '').strip(),
        'raw': raw_payload,
        'marketId': str(candidate.get('marketId') or ''),
        'settlementRef': settlement_ref,
        'txSignature': tx_signature,
    }


def has_settlement_evidence_from_result(result: dict[str, Any]) -> bool:
    if str(result.get('settlementRef') or '').strip():
        return True
    tx_signature = str(result.get('txSignature') or '').strip()
    if tx_signature and looks_like_chain_tx_ref(tx_signature):
        return True
    payment_ref = str(result.get('paymentRef') or '').strip()
    if payment_ref and looks_like_chain_tx_ref(payment_ref):
        return True
    raw = result.get('raw') if isinstance(result.get('raw'), dict) else {}
    if str(raw.get('settlementRef') or raw.get('fillId') or raw.get('closeId') or '').strip():
        return True
    for key in ('txSignature', 'txHash', 'transactionHash', 'paymentRef'):
        if looks_like_chain_tx_ref(raw.get(key)):
            return True
    return False


def looks_like_chain_tx_ref(value: Any) -> bool:
    text = str(value or '').strip()
    if not text:
        return False
    if EVM_TX_HASH_RE.match(text):
        return True
    return bool(SOLANA_SIGNATURE_RE.match(text))


def candidate_requests_realized_close(candidate: dict[str, Any]) -> bool:
    kind = str(candidate.get('kind') or '').strip().lower()
    if kind in {'trade_close', 'close_candidate'}:
        return True
    metadata = candidate.get('metadata') if isinstance(candidate.get('metadata'), dict) else {}
    intent = str(metadata.get('executionIntent') or metadata.get('intent') or '').strip().lower()
    return intent in {'close', 'exit', 'reduce', 'settle'}


def candidate_leader_follow_snapshot(candidate: dict[str, Any]) -> dict[str, Any]:
    metadata = candidate.get('metadata') if isinstance(candidate.get('metadata'), dict) else {}
    snapshot = metadata.get('leaderFollow') if isinstance(metadata.get('leaderFollow'), dict) else {}
    if not snapshot:
        return {}
    matched_raw = snapshot.get('matchedLeaders') if isinstance(snapshot.get('matchedLeaders'), list) else []
    matched: list[dict[str, Any]] = []
    for item in matched_raw[:8]:
        if not isinstance(item, dict):
            continue
        matched.append(
            {
                'leaderId': str(item.get('leaderId') or '').strip().lower(),
                'venue': str(item.get('venue') or '').strip().lower(),
                'direction': str(item.get('direction') or '').strip().lower(),
                'alignment': str(item.get('alignment') or '').strip().lower(),
                'weight': round(parse_float(item.get('weight'), 0.0), 8),
                'contribution': round(parse_float(item.get('contribution'), 0.0), 8),
                'hit': round(parse_float(item.get('hit'), 0.5), 6),
            }
        )
    return {
        'mode': str(snapshot.get('mode') or '').strip().lower(),
        'leaderBias': round(parse_float(snapshot.get('leaderBias'), 0.0), 8),
        'confidenceBefore': round(parse_float(snapshot.get('confidenceBefore'), 0.0), 6),
        'confidenceAfter': round(parse_float(snapshot.get('confidenceAfter'), 0.0), 6),
        'topLeaderIds': [str(item) for item in snapshot.get('topLeaderIds', []) if str(item).strip()][:5],
        'matchedLeaders': matched,
    }


def build_live_close_candidate(position: dict[str, Any], close_reason: str) -> dict[str, Any] | None:
    venue = str(position.get('venue') or '').strip().lower()
    if venue not in {'polymarket', 'limitless'}:
        return None
    market_id = str(position.get('marketId') or '').strip()
    if not market_id:
        return None
    midpoint = (
        to_optional_price(position.get('markPrice'))
        or to_optional_price(position.get('entryPrice'))
        or 0.5
    )
    direction = str(position.get('direction') or '').strip().lower()
    if direction not in {'yes', 'no'}:
        direction = 'yes'
    metadata: dict[str, Any] = {
        'executionIntent': 'close',
        'intent': 'close',
        'closeReason': close_reason,
        'direction': direction,
        'midpoint': round(float(midpoint), 8),
    }
    if venue == 'polymarket':
        token_id = str(position.get('tokenId') or position.get('polymarketTokenId') or '').strip()
        if not token_id:
            return None
        token_ids = (
            position.get('polymarketTokenIds')
            if isinstance(position.get('polymarketTokenIds'), dict)
            else {}
        )
        metadata.update(
            {
                'polymarketTokenId': token_id,
                'polymarketTokenIds': token_ids,
                'polymarketSide': 'SELL',
            }
        )
    else:
        market_slug = str(position.get('limitlessMarketSlug') or market_id).strip()
        token_id = str(position.get('limitlessTokenId') or position.get('tokenId') or '').strip()
        if not market_slug or not token_id:
            return None
        token_ids = (
            position.get('limitlessTokenIds')
            if isinstance(position.get('limitlessTokenIds'), dict)
            else {}
        )
        metadata.update(
            {
                'limitlessMarketSlug': market_slug,
                'limitlessTokenId': token_id,
                'limitlessTokenIds': token_ids,
                'limitlessSide': 'sell',
            }
        )
    candidate_id = stable_trade_id('close-candidate', str(position.get('positionId') or market_id))
    return {
        'id': candidate_id,
        'source': 'trading',
        'venue': venue,
        'kind': 'close_candidate',
        'marketId': market_id,
        'title': f'Close {market_id}',
        'summary': f'close candidate for {venue} position',
        'confidence': clamp(parse_float(position.get('confidence'), 0.5), 0.01, 0.99),
        'fillProbability': 1.0,
        'expectedSlippage': max(0.0, parse_float(position.get('expectedSlippage'), 0.0)),
        'feesEstimate': max(0.0, parse_float(position.get('feesEstimate'), 0.0)),
        'expectedNetUsd': parse_float(position.get('expectedNetUsd'), 0.0),
        'createdAt': now_iso(),
        'metadata': metadata,
    }


def write_mark_to_market_row(
    *,
    venue: str,
    market_id: str,
    position_id: str,
    order_id: str,
    gross_usd: float,
    cost_usd: float,
    net_usd: float,
    close_reason: str,
    metadata: dict[str, Any],
) -> dict[str, Any]:
    row = {
        'id': stable_trade_id('mark-to-market', position_id or order_id or now_iso()),
        'at': now_iso(),
        'source': 'trading',
        'venue': venue,
        'kind': 'mark_to_market',
        'status': 'success',
        'realized': False,
        'marketId': market_id,
        'positionId': position_id,
        'orderId': order_id,
        'grossUsd': round(gross_usd, 8),
        'costUsd': round(cost_usd, 8),
        'netUsd': round(net_usd, 8),
        'paymentRef': '',
        'metadata': {
            **metadata,
            'closeReason': close_reason,
            'syntheticClose': True,
        },
    }
    append_ledger_row(row)
    return row


def best_price(levels: Any, mode: str) -> float | None:
    if not isinstance(levels, list):
        return None
    values: list[float] = []
    for row in levels:
        if isinstance(row, dict):
            price = to_optional_price(row.get('price'))
        elif isinstance(row, (list, tuple)) and row:
            price = to_optional_price(row[0])
        else:
            price = None
        if price is not None:
            values.append(price)
    if not values:
        return None
    return min(values) if mode == 'ask' else max(values)


def fetch_polymarket_mark_price(token_id: str) -> float | None:
    token = str(token_id or '').strip()
    if not token:
        return None
    if not POLYMARKET_CLOB_BASE_URL:
        return None
    url = f'{POLYMARKET_CLOB_BASE_URL}/book?token_id={urllib.parse.quote(token, safe="")}'
    try:
        payload = request_json(url)
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None
    bid = best_price(payload.get('bids'), 'bid')
    ask = best_price(payload.get('asks'), 'ask')
    if bid is not None and ask is not None:
        return round((bid + ask) / 2.0, 8)
    if bid is not None:
        return round(bid, 8)
    if ask is not None:
        return round(ask, 8)
    return None


def position_unrealized_pct(position: dict[str, Any], mark_price: float | None) -> float:
    entry_price = to_optional_price(position.get('entryPrice'))
    if entry_price is None:
        return parse_float(position.get('unrealizedPct'), 0.0)
    if mark_price is None:
        return parse_float(position.get('unrealizedPct'), 0.0)
    side = str(position.get('side') or 'buy').strip().lower()
    if side == 'sell':
        return ((entry_price - mark_price) / entry_price) * 100.0
    return ((mark_price - entry_price) / entry_price) * 100.0


def position_close_amounts(position: dict[str, Any], close_reason: str) -> tuple[float, float, float]:
    notional = max(0.0, parse_float(position.get('notionalUsd'), 0.0))
    entry_price = to_optional_price(position.get('entryPrice'))
    mark_price = to_optional_price(position.get('markPrice'))
    side = str(position.get('side') or 'buy').strip().lower()

    if entry_price is not None and mark_price is not None and notional > 0:
        if side == 'sell':
            pnl_pct = (entry_price - mark_price) / entry_price
        else:
            pnl_pct = (mark_price - entry_price) / entry_price
        gross_usd = round(notional * pnl_pct, 8)
    else:
        expected = parse_float(position.get('expectedNetUsd'), 0.0)
        confidence = clamp(parse_float(position.get('confidence'), 0.6), 0.2, 1.0)
        gross_usd = round(expected * confidence, 8)

    if close_reason in {'take_profit', 'stop_loss'}:
        cost_usd = 0.0
    else:
        cost_usd = max(
            0.0,
            parse_float(position.get('feesEstimate'), 0.0) + parse_float(position.get('expectedSlippage'), 0.0),
        )
    net_usd = round(gross_usd - cost_usd, 8)
    return gross_usd, round(cost_usd, 8), net_usd


def polymarket_position_hints(candidates: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    hints: dict[str, dict[str, Any]] = {}
    for candidate in candidates:
        if str(candidate.get('venue') or '').strip().lower() != 'polymarket':
            continue
        if str(candidate.get('kind') or '').strip().lower() != 'trade_candidate':
            continue
        market_id = str(candidate.get('marketId') or '').strip()
        if not market_id:
            continue
        metadata = candidate.get('metadata') if isinstance(candidate.get('metadata'), dict) else {}
        direction = str(metadata.get('direction') or '').strip().lower()
        token_ids = metadata.get('polymarketTokenIds') if isinstance(metadata.get('polymarketTokenIds'), dict) else {}
        token_id = ''
        if direction == 'no':
            token_id = str(token_ids.get('no') or metadata.get('polymarketTokenId') or '').strip()
        elif direction == 'yes':
            token_id = str(metadata.get('polymarketTokenId') or token_ids.get('yes') or '').strip()
        else:
            token_id = str(metadata.get('polymarketTokenId') or token_ids.get('yes') or token_ids.get('no') or '').strip()
        entry_price = normalize_entry_midpoint(metadata.get('midpoint'), direction)
        score = candidate_score(candidate)
        current = hints.get(market_id)
        if current is None or score > parse_float(current.get('score'), -1.0):
            hints[market_id] = {
                'tokenId': token_id,
                'direction': direction,
                'entryPrice': entry_price,
                'score': score,
            }
    return hints


def concentration_overflow_ids(positions: list[dict[str, Any]], max_positions_per_market: int) -> set[str]:
    if max_positions_per_market <= 0:
        return set()
    grouped: dict[str, list[tuple[datetime, str]]] = {}
    for position in positions:
        market_id = str(position.get('marketId') or '').strip()
        position_key = str(position.get('positionId') or position.get('id') or '').strip()
        if not market_id or not position_key:
            continue
        opened_at = parse_ts(position.get('openedAt') or position.get('at')) or datetime.min.replace(tzinfo=timezone.utc)
        grouped.setdefault(market_id, []).append((opened_at, position_key))

    overflow: set[str] = set()
    for rows in grouped.values():
        if len(rows) <= max_positions_per_market:
            continue
        rows.sort(key=lambda row: row[0])
        for _, position_key in rows[max_positions_per_market:]:
            overflow.add(position_key)
    return overflow


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


def summarize_singularity_paper(rows: list[dict[str, Any]]) -> dict[str, float | int]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    returns: list[float] = []
    trades = 0
    wins = 0
    for row in rows:
        if str(row.get('source') or '').strip().lower() != 'trading':
            continue
        if str(row.get('venue') or '').strip().lower() != 'singularity':
            continue
        if str(row.get('kind') or '').strip().lower() != 'mark_to_market':
            continue
        if str(row.get('status') or '').strip().lower() != 'success':
            continue
        ts = parse_ts(row.get('at') or row.get('timestamp') or row.get('executedAt'))
        if ts is None or ts < cutoff:
            continue
        metadata = row.get('metadata') if isinstance(row.get('metadata'), dict) else {}
        if str(metadata.get('executionMode') or '').strip().lower() != 'paper':
            continue
        net = parse_float(row.get('netUsd'), 0.0)
        trades += 1
        if net > 0:
            wins += 1
        returns.append(net)

    win_rate = 0.0 if trades == 0 else round(wins / trades, 6)
    if len(returns) < 2:
        sharpe = 0.0
    else:
        mean = sum(returns) / len(returns)
        variance = sum((value - mean) ** 2 for value in returns) / len(returns)
        std_dev = variance ** 0.5
        sharpe = 0.0 if std_dev <= 0 else round(mean / std_dev, 6)
    return {
        'paperTrades7d': trades,
        'paperWins7d': wins,
        'paperWinRate7d': win_rate,
        'paperSharpeWindow': sharpe,
    }


def summarize_live_48h(rows: list[dict[str, Any]]) -> dict[str, float | int]:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=48)
    net = 0.0
    trades = 0
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
        metadata = row.get('metadata') if isinstance(row.get('metadata'), dict) else {}
        if str(metadata.get('executionMode') or '').strip().lower() != 'live':
            continue
        if not has_settlement_evidence_from_row(row):
            continue
        ts = parse_ts(row.get('at') or row.get('timestamp') or row.get('executedAt'))
        if ts is None or ts < cutoff:
            continue
        net += parse_float(row.get('netUsd'), 0.0)
        trades += 1
    return {'tradingNetUsd48h': round(net, 8), 'microLiveTrades48h': trades}


def guard_is_fresh_and_ok(guard_state: dict[str, Any]) -> bool:
    if not isinstance(guard_state, dict):
        return False
    status = str(guard_state.get('status') or '').strip().lower()
    if status not in {'ok', 'degraded'}:
        return False
    if bool(guard_state.get('ok')) is not True:
        return False
    at = parse_ts(guard_state.get('at') or guard_state.get('lastRunAt'))
    if at is None:
        return False
    return at >= datetime.now(timezone.utc) - timedelta(hours=12)


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
    singularity_paper_ready = SINGULARITY_ENABLED and SINGULARITY_MODE == 'paper' and EXECUTION_MODE == 'paper'
    capabilities = {
        'ok': True,
        'at': now_iso(),
        'executionMode': EXECUTION_MODE,
        'tickIntervalSec': TICK_INTERVAL_SEC,
        'liveVenueReady': {
            'polymarket': polymarket_transport_ready,
            'limitless': limitless_transport_ready,
        },
        'paperVenueReady': {
            'singularity': singularity_paper_ready,
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
        singularity_payload = {
            'ok': True,
            'status': 'disabled',
            'executionMode': EXECUTION_MODE,
            'enabled': SINGULARITY_ENABLED,
            'at': summary['at'],
            'paperTrades7d': 0,
            'paperWins7d': 0,
            'paperWinRate7d': 0.0,
            'paperSharpeWindow': 0.0,
        }
        write_json(POLYMARKET_GEO_PATH, geo_payload)
        write_json(SINGULARITY_PAPER_PATH, singularity_payload)
        write_json(CAPABILITIES_PATH, capabilities)
        write_json(STATE_PATH, {'lastRunAt': summary['at'], 'lastStatus': summary})
        write_json(OUTPUT_PATH, summary)
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    feed_payload = read_json(FEED_PATH, {})
    candidates = normalize_candidates(feed_payload if isinstance(feed_payload, dict) else {})
    polymarket_hints = polymarket_position_hints(candidates)
    candidate_market_ids = {
        str(row.get('marketId') or '').strip()
        for row in candidates
        if str(row.get('kind') or '').strip().lower() == 'trade_candidate' and str(row.get('marketId') or '').strip()
    }
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
    pending_close_index = build_pending_close_index(rows)

    current_day = today_iso()
    signal_seen = state.get('signalSeen') if isinstance(state.get('signalSeen'), dict) else {}
    daily_notional_used = parse_float(state.get('dailyNotionalUsdUsed'), 0.0)
    state_day = str(state.get('day') or '')
    if state_day != current_day:
        daily_notional_used = 0.0

    all_realized_net, weekly_realized_net, daily_realized_net = compute_trading_pnl(rows)
    current_equity = round(max(0.0, STARTING_EQUITY_USD + all_realized_net), 8)
    realized_close_count = count_realized_closes(rows)
    peak_equity_state = parse_float(state.get('peakEquityUsd'), STARTING_EQUITY_USD)
    peak_equity_reconciled = False
    if realized_close_count == 0 and all_realized_net <= 0 and peak_equity_state > current_equity:
        peak_equity_state = max(current_equity, STARTING_EQUITY_USD)
        peak_equity_reconciled = True
    peak_equity = max(current_equity, peak_equity_state, STARTING_EQUITY_USD)
    drawdown_pct = 0.0 if peak_equity <= 0 else round(max(0.0, ((peak_equity - current_equity) / peak_equity) * 100.0), 8)
    daily_loss_stop_usd = round(STARTING_EQUITY_USD * (DAILY_LOSS_STOP_PCT / 100.0), 8)

    geo_payload: dict[str, Any] = {'ok': True, 'blocked': False, 'checkedAt': now_iso(), 'status': 'not_required'}
    hard_reasons: list[str] = []
    warnings: list[str] = []
    venue_blockers: dict[str, str] = {}

    configured_live_venues = [venue for venue in ('polymarket', 'limitless') if venue in VENUES]
    usable_live_venues = list(configured_live_venues)

    def refresh_live_venue_status() -> None:
        nonlocal usable_live_venues
        usable_live_venues = [venue for venue in configured_live_venues if venue not in venue_blockers]

    def add_hard_reason(reason: str) -> None:
        if reason and reason not in hard_reasons:
            hard_reasons.append(reason)

    def add_warning(reason: str) -> None:
        if reason and reason not in warnings:
            warnings.append(reason)

    if to_bool(guard_state.get('blockPaidExecution'), False):
        add_hard_reason('revenue_guard_block_paid_execution')
    if drawdown_pct > MAX_DRAWDOWN_PCT:
        add_hard_reason('drawdown_limit_exceeded')
    if WEEKLY_LOSS_CAP_USD > 0 and weekly_realized_net < -WEEKLY_LOSS_CAP_USD:
        add_hard_reason('weekly_loss_cap_exceeded')
    if DAILY_LOSS_STOP_PCT > 0 and daily_realized_net < -daily_loss_stop_usd:
        add_hard_reason('daily_loss_stop_exceeded')

    singularity_paper_metrics = summarize_singularity_paper(rows)
    live_48h_metrics = summarize_live_48h(rows)
    live_mode = EXECUTION_MODE == 'live'
    if live_mode:
        MAX_NOTIONAL_USD_PER_DAY_EFFECTIVE = round(min(MAX_NOTIONAL_USD_PER_DAY, MICRO_LIVE_MAX_NOTIONAL_USD), 8)
    else:
        MAX_NOTIONAL_USD_PER_DAY_EFFECTIVE = round(MAX_NOTIONAL_USD_PER_DAY, 8)
    if live_mode and ENFORCE_MICRO_LIVE_GATES:
        if not guard_is_fresh_and_ok(guard_state):
            add_hard_reason('micro_live_guard_window_not_ready')
        if int(singularity_paper_metrics.get('paperTrades7d') or 0) < MIN_PAPER_CLOSES_FOR_LIVE:
            add_hard_reason('micro_live_paper_sample_too_small')
        if parse_float(singularity_paper_metrics.get('paperSharpeWindow'), 0.0) <= 0:
            add_hard_reason('micro_live_paper_sharpe_non_positive')
    if live_mode and 'polymarket' in VENUES and not polymarket_transport_ready:
        venue_blockers['polymarket'] = 'missing_polymarket_execution_transport'
    if live_mode and 'limitless' in VENUES and not limitless_transport_ready:
        venue_blockers['limitless'] = 'missing_limitless_execution_transport'

    if live_mode and 'polymarket' in VENUES:
        geo_payload = fetch_polymarket_geo()
        if to_bool(geo_payload.get('blocked'), False):
            if POLYMARKET_REQUIRE_GEO_ALLOWED:
                venue_blockers['polymarket'] = 'polymarket_geo_blocked'
        if not to_bool(geo_payload.get('ok'), False) and POLYMARKET_REQUIRE_GEO_ALLOWED:
            venue_blockers['polymarket'] = 'polymarket_geo_check_failed'
    write_json(POLYMARKET_GEO_PATH, geo_payload)

    refresh_live_venue_status()
    for blocker in venue_blockers.values():
        add_warning(blocker)
    if live_mode and configured_live_venues and not usable_live_venues:
        add_hard_reason('no_live_trading_venue_available')

    open_positions = positions_state.get('positions') if isinstance(positions_state.get('positions'), list) else []
    open_positions = [row for row in open_positions if isinstance(row, dict)]
    limitless_synced_count = 0
    if live_mode and LIMITLESS_SYNC_POSITIONS:
        limitless_synced = fetch_limitless_live_positions(open_positions)
        if limitless_synced is not None:
            preserved = [
                row for row in open_positions
                if str(row.get('venue') or '').strip().lower() != 'limitless'
            ]
            open_positions = [*preserved, *limitless_synced]
            limitless_synced_count = len(limitless_synced)

    max_market_exposure_usd = round(max(1.0, current_equity * (MAX_MARKET_EXPOSURE_PCT / 100.0)), 8)
    market_exposure: dict[str, float] = {}
    market_open_counts: dict[str, int] = {}
    for position in open_positions:
        if str(position.get('status') or 'open').strip().lower() != 'open':
            continue
        market_id = str(position.get('marketId') or '').strip()
        market_exposure[market_id] = market_exposure.get(market_id, 0.0) + max(0.0, parse_float(position.get('notionalUsd'), 0.0))
        market_open_counts[market_id] = market_open_counts.get(market_id, 0) + 1
    concentration_overflow = concentration_overflow_ids(open_positions, MAX_POSITIONS_PER_MARKET)

    executed = 0
    succeeded = 0
    failed = 0
    closed = 0
    signal_rows = 0
    records_appended = 0
    blocked_candidates = 0
    blocked_price_band = 0
    exec_errors: list[dict[str, Any]] = []
    trades_by_venue = {'polymarket': 0, 'limitless': 0, 'singularity': 0}
    mark_to_market_rows = 0
    synthetic_close_violations_tick = 0
    live_close_attempts_tick = 0
    live_close_realized_tick = 0
    live_close_deferred_tick = 0
    slot_recovery_closed = 0

    tradable_candidates = [row for row in candidates if str(row.get('kind') or '').strip().lower() == 'trade_candidate']
    tradable_candidates.sort(
        key=lambda row: (
            candidate_score(row),
            parse_float(row.get('confidence'), 0.0),
        ),
        reverse=True,
    )
    trade_candidate_hints: dict[str, dict[str, Any]] = {}
    for candidate in tradable_candidates:
        market_id = str(candidate.get('marketId') or '').strip()
        metadata = candidate.get('metadata') if isinstance(candidate.get('metadata'), dict) else None
        if market_id and isinstance(metadata, dict):
            trade_candidate_hints[market_id] = metadata

    slot_recovery_reference_score = 0.0
    if (
        SLOT_RECOVERY_ENABLED
        and live_mode
        and not hard_reasons
        and len(open_positions) >= MAX_OPEN_POSITIONS
        and SLOT_RECOVERY_MAX_CLOSES_PER_TICK > 0
    ):
        for candidate in tradable_candidates:
            venue = str(candidate.get('venue') or '').strip().lower()
            if venue not in {'polymarket', 'limitless'}:
                continue
            if venue in venue_blockers:
                continue
            if venue == 'polymarket' and to_bool(geo_payload.get('blocked'), False) and POLYMARKET_REQUIRE_GEO_ALLOWED:
                continue
            if not candidate_entry_price_allowed(candidate):
                continue
            market_id = str(candidate.get('marketId') or '').strip()
            if market_id and market_open_counts.get(market_id, 0) >= MAX_POSITIONS_PER_MARKET:
                continue
            score = max(0.0, candidate_score(candidate))
            if score <= 0:
                continue
            slot_recovery_reference_score = score
            break

    now = datetime.now(timezone.utc)
    keep_open_positions: list[dict[str, Any]] = []
    mark_cache: dict[str, float | None] = {}
    for position in open_positions:
        if str(position.get('status') or 'open').strip().lower() != 'open':
            continue
        venue = str(position.get('venue') or '').strip().lower()
        market_id = str(position.get('marketId') or '').strip()
        hint_metadata = trade_candidate_hints.get(market_id) if market_id else None
        if venue == 'limitless' and isinstance(hint_metadata, dict):
            if not str(position.get('limitlessMarketSlug') or '').strip():
                position['limitlessMarketSlug'] = str(hint_metadata.get('limitlessMarketSlug') or market_id).strip()
            if not str(position.get('limitlessTokenId') or '').strip():
                position['limitlessTokenId'] = str(hint_metadata.get('limitlessTokenId') or '').strip()
            if not str(position.get('tokenId') or '').strip():
                position['tokenId'] = str(
                    position.get('limitlessTokenId') or hint_metadata.get('limitlessTokenId') or ''
                ).strip()
            if not isinstance(position.get('limitlessTokenIds'), dict):
                token_ids = hint_metadata.get('limitlessTokenIds')
                position['limitlessTokenIds'] = token_ids if isinstance(token_ids, dict) else {}
            if not str(position.get('direction') or '').strip():
                position['direction'] = str(hint_metadata.get('direction') or '').strip().lower()
            if to_optional_price(position.get('entryPrice')) is None:
                entry_hint = normalize_entry_midpoint(
                    hint_metadata.get('midpoint'),
                    str(position.get('direction') or hint_metadata.get('direction') or ''),
                )
                if entry_hint is not None:
                    position['entryPrice'] = round(entry_hint, 8)
                    position['markPrice'] = round(entry_hint, 8)
        if venue == 'polymarket':
            hint = polymarket_hints.get(market_id, {})
            if isinstance(hint, dict):
                token_id_hint = str(hint.get('tokenId') or '').strip()
                direction_hint = str(hint.get('direction') or '').strip().lower()
                entry_hint = to_optional_price(hint.get('entryPrice'))
                if not str(position.get('tokenId') or '').strip() and token_id_hint:
                    position['tokenId'] = token_id_hint
                if not str(position.get('direction') or '').strip() and direction_hint:
                    position['direction'] = direction_hint
                if to_optional_price(position.get('entryPrice')) is None and entry_hint is not None:
                    position['entryPrice'] = round(entry_hint, 8)
                if not str(position.get('side') or '').strip():
                    position['side'] = 'buy'
        mark_price: float | None = None
        if venue == 'polymarket':
            token_id = str(position.get('tokenId') or '').strip()
            if token_id:
                if token_id not in mark_cache:
                    mark_cache[token_id] = fetch_polymarket_mark_price(token_id)
                mark_price = mark_cache.get(token_id)
        if mark_price is not None:
            position['markPrice'] = round(mark_price, 8)
        position['unrealizedPct'] = round(position_unrealized_pct(position, mark_price), 6)

        opened_at = parse_ts(position.get('openedAt') or position.get('at'))
        if opened_at is None:
            keep_open_positions.append(position)
            continue
        held_hours = max(0.0, (now - opened_at).total_seconds() / 3600.0)
        unrealized_pct = parse_float(position.get('unrealizedPct'), 0.0)
        should_close = held_hours >= MAX_HOLD_HOURS
        close_reason = 'max_hold_reached'
        position_key = str(position.get('positionId') or position.get('id') or '').strip()
        if position_key and position_key in concentration_overflow:
            should_close = True
            close_reason = 'market_concentration'
        if (
            CLOSE_ORPHAN_POSITIONS
            and market_id
            and market_id not in candidate_market_ids
            and held_hours >= ORPHAN_POSITION_HOLD_HOURS
        ):
            should_close = True
            close_reason = 'orphan_market'
        if unrealized_pct >= TAKE_PROFIT_PCT:
            should_close = True
            close_reason = 'take_profit'
        if unrealized_pct <= -STOP_LOSS_PCT:
            should_close = True
            close_reason = 'stop_loss'
        if EXECUTION_MODE == 'paper':
            should_close = True
            close_reason = 'paper_close'
        if (
            not should_close
            and slot_recovery_reference_score > 0.0
            and slot_recovery_closed < SLOT_RECOVERY_MAX_CLOSES_PER_TICK
            and held_hours >= SLOT_RECOVERY_MIN_HOLD_HOURS
        ):
            position_score = max(
                0.0,
                parse_float(position.get('expectedNetUsd'), 0.0)
                * clamp(parse_float(position.get('confidence'), 0.0), 0.0, 1.0),
            )
            if slot_recovery_reference_score >= (position_score + SLOT_RECOVERY_MIN_SCORE_DELTA):
                should_close = True
                close_reason = 'slot_recovery'
                slot_recovery_closed += 1

        if not should_close:
            keep_open_positions.append(position)
            continue

        if REAL_CLOSE_ENABLED and live_mode and venue in {'polymarket', 'limitless'}:
            close_candidate = build_live_close_candidate(position, close_reason)
            if close_candidate is not None:
                linked_position_id = str(position.get('positionId') or position.get('id') or '').strip()
                if CLOSE_STRICT_TRACKING and linked_position_id:
                    pending_at = pending_close_index.get(linked_position_id)
                    if pending_at is not None:
                        pending_age_sec = max(0.0, (now - pending_at).total_seconds())
                        if pending_age_sec < CLOSE_PENDING_RETRY_SEC:
                            live_close_deferred_tick += 1
                            add_warning(f'{venue}_close_pending_inflight')
                            keep_open_positions.append(position)
                            continue
                close_notional = max(1.0, parse_float(position.get('notionalUsd'), 0.0))
                if venue == 'limitless':
                    close_size = parse_float(position.get('limitlessPositionSize'), 0.0)
                    if close_size > 0.0:
                        close_size *= 0.95
                    close_notional = max(
                        0.000001,
                        close_size
                        or parse_float(position.get('notionalUsd'), 0.0),
                    )
                try:
                    live_close_attempts_tick += 1
                    if venue == 'polymarket':
                        close_result = parse_live_result(
                            close_candidate,
                            live_execute_polymarket(close_candidate, close_notional),
                        )
                    else:
                        close_result = parse_live_result(
                            close_candidate,
                            live_execute_limitless(close_candidate, close_notional),
                        )
                    can_record_realized_close = (
                        close_result['realized']
                        and candidate_requests_realized_close(close_candidate)
                        and has_settlement_evidence_from_result(close_result)
                    )
                    if can_record_realized_close:
                        live_close_realized_tick += 1
                        close_row = {
                            'id': stable_trade_id(
                                'trade-close',
                                str(close_result.get('positionId') or position.get('positionId') or position.get('id') or ''),
                            ),
                            'at': now_iso(),
                            'source': 'trading',
                            'venue': venue,
                            'kind': 'trade_close',
                            'status': 'success',
                            'realized': True,
                            'marketId': market_id,
                            'positionId': str(close_result.get('positionId') or position.get('positionId') or ''),
                            'orderId': str(close_result.get('orderId') or position.get('orderId') or ''),
                            'grossUsd': close_result['grossUsd'],
                            'costUsd': close_result['costUsd'],
                            'netUsd': close_result['netUsd'],
                            'paymentRef': close_result['paymentRef'],
                            'txSignature': close_result['txSignature'],
                            'metadata': {
                                'executionMode': 'live',
                                'executionIntent': 'close',
                                'closeReason': close_reason,
                                'candidateId': str(position.get('candidateId') or '').strip(),
                                'leaderFollowSnapshot': position.get('leaderFollowSnapshot')
                                if isinstance(position.get('leaderFollowSnapshot'), dict)
                                else {},
                                'linkedOpenPositionId': str(position.get('positionId') or position.get('id') or ''),
                                'settlementEvidence': {
                                    'settlementRef': close_result['settlementRef'],
                                    'txSignature': close_result['txSignature'],
                                    'paymentRef': close_result['paymentRef'],
                                },
                            },
                        }
                        append_ledger_row(close_row)
                        records_appended += 1
                        closed += 1
                        continue
                    if CLOSE_STRICT_TRACKING:
                        live_close_deferred_tick += 1
                        add_warning(f'{venue}_close_unsettled')
                        pending_row = {
                            'id': stable_trade_id(
                                'trade-close-pending',
                                str(close_result.get('positionId') or position.get('positionId') or position.get('id') or ''),
                            ),
                            'at': now_iso(),
                            'source': 'trading',
                            'venue': venue,
                            'kind': 'trade_close',
                            'status': 'pending',
                            'realized': False,
                            'marketId': market_id,
                            'positionId': str(close_result.get('positionId') or position.get('positionId') or ''),
                            'orderId': str(close_result.get('orderId') or position.get('orderId') or ''),
                            'grossUsd': close_result['grossUsd'],
                            'costUsd': close_result['costUsd'],
                            'netUsd': close_result['netUsd'],
                            'paymentRef': close_result['paymentRef'],
                            'txSignature': close_result['txSignature'],
                            'metadata': {
                                'executionMode': 'live',
                                'executionIntent': 'close',
                                'closeReason': close_reason,
                                'candidateId': str(position.get('candidateId') or '').strip(),
                                'leaderFollowSnapshot': position.get('leaderFollowSnapshot')
                                if isinstance(position.get('leaderFollowSnapshot'), dict)
                                else {},
                                'linkedOpenPositionId': str(position.get('positionId') or position.get('id') or ''),
                                'settlementEvidence': {
                                    'settlementRef': close_result['settlementRef'],
                                    'txSignature': close_result['txSignature'],
                                    'paymentRef': close_result['paymentRef'],
                                },
                            },
                        }
                        append_ledger_row(pending_row)
                        records_appended += 1
                        linked_id = str(position.get('positionId') or position.get('id') or '').strip()
                        if linked_id:
                            pending_close_index[linked_id] = now
                        keep_open_positions.append(position)
                        continue
                    if close_result['realized']:
                        add_warning('synthetic_realized_close_detected')
                        synthetic_close_violations_tick += 1
                except Exception as exc:
                    add_warning(f'{venue}_close_execution_failed')
                    exec_errors.append(
                        {
                            'candidateId': str(position.get('candidateId') or position.get('id') or ''),
                            'venue': venue,
                            'error': (str(exc).strip()[:300] or 'close_execution_failed'),
                        }
                    )
                    if CLOSE_STRICT_TRACKING:
                        live_close_deferred_tick += 1
                        failed_close_row = {
                            'id': stable_trade_id(
                                'trade-close-failed',
                                str(position.get('positionId') or position.get('id') or ''),
                            ),
                            'at': now_iso(),
                            'source': 'trading',
                            'venue': venue,
                            'kind': 'trade_close',
                            'status': 'failed',
                            'realized': False,
                            'marketId': market_id,
                            'positionId': str(position.get('positionId') or ''),
                            'orderId': str(position.get('orderId') or ''),
                            'grossUsd': 0.0,
                            'costUsd': 0.0,
                            'netUsd': 0.0,
                            'paymentRef': '',
                            'error': (str(exc).strip()[:300] or 'close_execution_failed'),
                            'metadata': {
                                'executionMode': 'live',
                                'executionIntent': 'close',
                                'closeReason': close_reason,
                                'candidateId': str(position.get('candidateId') or '').strip(),
                                'linkedOpenPositionId': str(position.get('positionId') or position.get('id') or ''),
                            },
                        }
                        append_ledger_row(failed_close_row)
                        records_appended += 1
                        keep_open_positions.append(position)
                        continue

        gross_usd, cost_usd, realized_net = position_close_amounts(position, close_reason)
        write_mark_to_market_row(
            venue=venue,
            market_id=str(position.get('marketId') or ''),
            position_id=str(position.get('positionId') or ''),
            order_id=str(position.get('orderId') or ''),
            gross_usd=gross_usd,
            cost_usd=cost_usd,
            net_usd=realized_net,
            close_reason=close_reason,
            metadata={
                'entryPrice': position.get('entryPrice'),
                'markPrice': position.get('markPrice'),
                'unrealizedPct': position.get('unrealizedPct'),
                'executionMode': EXECUTION_MODE,
                'candidateId': str(position.get('candidateId') or '').strip(),
                'leaderFollowSnapshot': position.get('leaderFollowSnapshot')
                if isinstance(position.get('leaderFollowSnapshot'), dict)
                else {},
            },
        )
        mark_to_market_rows += 1
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

    allocation_venues = ['polymarket', 'limitless']
    if singularity_paper_ready:
        allocation_venues.append('singularity')
    available_daily_budget = max(0.0, MAX_NOTIONAL_USD_PER_DAY_EFFECTIVE - daily_notional_used)
    venue_budgets, venue_weights = build_venue_allocations(tradable_candidates, available_daily_budget, allocation_venues)
    venue_budget_remaining = dict(venue_budgets)

    if hard_reasons:
        blocked_candidates = len(tradable_candidates)
    else:
        for candidate in tradable_candidates:
            if executed >= MAX_EXEC_ATTEMPTS_PER_TICK:
                break
            if failed >= MAX_FAILURES_PER_TICK:
                break
            if len(open_positions) >= MAX_OPEN_POSITIONS:
                blocked_candidates += 1
                continue
            venue = str(candidate.get('venue') or '').strip().lower()
            if venue == 'kalshi' and KALSHI_SIGNAL_ONLY:
                blocked_candidates += 1
                continue
            if venue == 'singularity':
                if live_mode or not singularity_paper_ready:
                    blocked_candidates += 1
                    continue
            if venue not in {'polymarket', 'limitless', 'singularity'}:
                blocked_candidates += 1
                continue
            if live_mode and venue in venue_blockers:
                blocked_candidates += 1
                continue
            metadata = candidate.get('metadata') if isinstance(candidate.get('metadata'), dict) else {}
            if not candidate_entry_price_allowed(candidate):
                blocked_candidates += 1
                blocked_price_band += 1
                continue
            if live_mode and venue == 'polymarket' and to_bool(geo_payload.get('blocked'), False) and POLYMARKET_REQUIRE_GEO_ALLOWED:
                blocked_candidates += 1
                continue
            if live_mode and venue == 'limitless' and LIMITLESS_REQUIRE_SIGNED_PAYLOAD and not LIMITLESS_EXEC_CMD:
                has_signed_payload = isinstance(metadata.get('limitlessOrder'), dict) or isinstance(metadata.get('orderPayload'), dict)
                if not has_signed_payload:
                    blocked_candidates += 1
                    continue

            venue_remaining = max(0.0, venue_budget_remaining.get(venue, 0.0))
            if venue_remaining <= 0:
                blocked_candidates += 1
                continue

            market_id = str(candidate.get('marketId') or candidate.get('id') or '')
            if market_id and market_open_counts.get(market_id, 0) >= MAX_POSITIONS_PER_MARKET:
                blocked_candidates += 1
                continue
            current_market_exposure = market_exposure.get(market_id, 0.0)
            market_room = max_market_exposure_usd - current_market_exposure
            day_room = MAX_NOTIONAL_USD_PER_DAY_EFFECTIVE - daily_notional_used
            notional_usd = min(BASE_NOTIONAL_PER_TRADE_USD, venue_remaining, market_room, day_room)
            if notional_usd <= 0:
                blocked_candidates += 1
                continue

            executed += 1
            candidate_id = str(candidate.get('id') or '').strip()
            leader_follow_snapshot = candidate_leader_follow_snapshot(candidate)
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
                    'candidateId': candidate_id,
                    'leaderFollowSnapshot': leader_follow_snapshot,
                    'notionalUsd': round(notional_usd, 8),
                    'confidence': parse_float(candidate.get('confidence'), 0.0),
                    'expectedNetUsd': parse_float(candidate.get('expectedNetUsd'), 0.0),
                    'allocationWeight': venue_weights.get(venue, 0.0),
                },
            }

            daily_notional_used = round(daily_notional_used + notional_usd, 8)
            market_exposure[market_id] = round(current_market_exposure + notional_usd, 8)
            market_open_counts[market_id] = market_open_counts.get(market_id, 0) + 1
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

                    can_record_realized_close = result['realized'] and candidate_requests_realized_close(
                        candidate
                    ) and has_settlement_evidence_from_result(result)

                    if can_record_realized_close:
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
                            'txSignature': result['txSignature'],
                            'metadata': {
                                'executionMode': 'live',
                                'candidateId': candidate_id,
                                'leaderFollowSnapshot': leader_follow_snapshot,
                                'settlementEvidence': {
                                    'settlementRef': result['settlementRef'],
                                    'txSignature': result['txSignature'],
                                    'paymentRef': result['paymentRef'],
                                },
                            },
                        }
                        append_ledger_row(close_row)
                        records_appended += 1
                        closed += 1
                    elif result['realized']:
                        add_warning('synthetic_realized_close_detected')
                        synthetic_close_violations_tick += 1
                        write_mark_to_market_row(
                            venue=venue,
                            market_id=market_id,
                            position_id=result['positionId'],
                            order_id=result['orderId'],
                            gross_usd=result['grossUsd'],
                            cost_usd=result['costUsd'],
                            net_usd=result['netUsd'],
                            close_reason='missing_settlement_evidence',
                            metadata={
                                'executionMode': 'live',
                                'candidateId': candidate_id,
                                'leaderFollowSnapshot': leader_follow_snapshot,
                                'paymentRef': result['paymentRef'],
                                'ignoredRealized': True,
                            },
                        )
                        records_appended += 1
                        mark_to_market_rows += 1
                    if not can_record_realized_close:
                        metadata = candidate.get('metadata') if isinstance(candidate.get('metadata'), dict) else {}
                        live_raw = result.get('raw') if isinstance(result.get('raw'), dict) else {}
                        token_selection = (
                            live_raw.get('tokenSelection')
                            if isinstance(live_raw.get('tokenSelection'), dict)
                            else {}
                        )
                        token_id = str(
                            token_selection.get('tokenID')
                            or metadata.get('polymarketTokenId')
                            or metadata.get('limitlessTokenId')
                            or ''
                        ).strip()
                        entry_price = normalize_entry_midpoint(metadata.get('midpoint'), str(metadata.get('direction') or ''))
                        if venue == 'polymarket' and token_id:
                            mark_price = fetch_polymarket_mark_price(token_id)
                            if mark_price is not None:
                                entry_price = mark_price
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
                                'candidateId': candidate_id,
                                'leaderFollowSnapshot': leader_follow_snapshot,
                                'tokenId': token_id,
                                'side': 'buy',
                                'direction': str(metadata.get('direction') or '').strip().lower(),
                                'entryPrice': round(entry_price, 8) if entry_price is not None else None,
                                'markPrice': round(entry_price, 8) if entry_price is not None else None,
                                'unrealizedPct': 0.0,
                                'polymarketTokenId': str(metadata.get('polymarketTokenId') or '').strip(),
                                'polymarketTokenIds': (
                                    metadata.get('polymarketTokenIds')
                                    if isinstance(metadata.get('polymarketTokenIds'), dict)
                                    else {}
                                ),
                                'polymarketTickSize': parse_float(metadata.get('polymarketTickSize'), 0.0),
                                'limitlessMarketSlug': str(metadata.get('limitlessMarketSlug') or '').strip(),
                                'limitlessTokenId': str(metadata.get('limitlessTokenId') or '').strip(),
                                'limitlessTokenIds': (
                                    metadata.get('limitlessTokenIds')
                                    if isinstance(metadata.get('limitlessTokenIds'), dict)
                                    else {}
                                ),
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
                    write_mark_to_market_row(
                        venue=venue,
                        market_id=market_id,
                        position_id=open_id,
                        order_id=open_id,
                        gross_usd=gross_usd,
                        cost_usd=cost_usd,
                        net_usd=realized_net,
                        close_reason='paper_close',
                        metadata={
                            'executionMode': 'paper',
                            'paperTrade': True,
                            'candidateId': candidate_id,
                            'leaderFollowSnapshot': leader_follow_snapshot,
                        },
                    )
                    records_appended += 1
                    mark_to_market_rows += 1
                    closed += 1
                    succeeded += 1
                    trades_by_venue[venue] += 1
            except Exception as exc:
                failed += 1
                error_message = str(exc).strip()[:300] or 'trade_execution_failed'
                exec_errors.append({'candidateId': str(candidate.get('id') or ''), 'venue': venue, 'error': error_message})
                normalized_error = error_message.lower()
                has_auth_error = 'unauthorized' in normalized_error or 'invalid api key' in normalized_error
                has_signer_alignment_error = 'signer_alignment_mismatch' in normalized_error
                has_create_key_error = 'could not create api key' in normalized_error
                has_unmatched_error = (
                    'order_unmatched' in normalized_error
                    or 'market order unmatched' in normalized_error
                    or 'order unmatched' in normalized_error
                )
                has_balance_error = (
                    'not enough balance / allowance' in normalized_error
                    or 'insufficient balance' in normalized_error
                    or 'insufficient funds' in normalized_error
                )

                if has_balance_error:
                    blocker = f'{venue}_insufficient_balance'
                    venue_blockers[venue] = blocker
                    add_warning(blocker)
                elif has_auth_error or has_create_key_error or has_signer_alignment_error:
                    blocker = f'{venue}_auth_failed'
                    venue_blockers[venue] = blocker
                    add_warning(blocker)
                elif has_unmatched_error:
                    add_warning(f'{venue}_order_unmatched')
                else:
                    add_warning(f'{venue}_execution_failed')

                daily_notional_used = round(max(0.0, daily_notional_used - notional_usd), 8)
                market_exposure[market_id] = round(max(0.0, market_exposure.get(market_id, 0.0) - notional_usd), 8)
                if market_id:
                    market_open_counts[market_id] = max(0, market_open_counts.get(market_id, 1) - 1)
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
                refresh_live_venue_status()
                if live_mode and configured_live_venues and not usable_live_venues:
                    add_hard_reason('no_live_trading_venue_available')
                    break

    if len(open_positions) > MAX_OPEN_POSITIONS and not LIMITLESS_SYNC_POSITIONS:
        open_positions = open_positions[:MAX_OPEN_POSITIONS]

    ledger_rows_after = jsonl_rows(LEDGER_PATH)
    all_realized_net_after, weekly_realized_net_after, daily_realized_net_after = compute_trading_pnl(ledger_rows_after)
    current_equity_after = round(max(0.0, STARTING_EQUITY_USD + all_realized_net_after), 8)
    peak_equity = max(peak_equity, current_equity_after)
    drawdown_pct_after = 0.0 if peak_equity <= 0 else round(max(0.0, ((peak_equity - current_equity_after) / peak_equity) * 100.0), 8)
    singularity_paper_metrics = summarize_singularity_paper(ledger_rows_after)
    live_48h_metrics = summarize_live_48h(ledger_rows_after)

    singularity_paper_summary = {
        'ok': True,
        'status': 'ok' if SINGULARITY_ENABLED else 'disabled',
        'at': now_iso(),
        'executionMode': EXECUTION_MODE,
        'enabled': SINGULARITY_ENABLED,
        'mode': SINGULARITY_MODE,
        **singularity_paper_metrics,
    }
    write_json(SINGULARITY_PAPER_PATH, singularity_paper_summary)

    positions_payload = {
        'ok': True,
        'at': now_iso(),
        'day': current_day,
        'positions': open_positions,
        'openPositions': len(open_positions),
        'limitlessSyncedCount': limitless_synced_count,
        'peakEquityUsd': round(peak_equity, 8),
        'currentEquityUsd': current_equity_after,
        'dailyNotionalUsdUsed': round(daily_notional_used, 8),
        'maxNotionalUsdPerDay': round(MAX_NOTIONAL_USD_PER_DAY_EFFECTIVE, 8),
        'maxNotionalUsdPerDayConfigured': round(MAX_NOTIONAL_USD_PER_DAY, 8),
        'venueBudgets': venue_budgets,
        'venueBudgetRemaining': venue_budget_remaining,
        'venueWeights': venue_weights,
    }
    write_json(POSITIONS_PATH, positions_payload)

    status = 'ok'
    if hard_reasons:
        status = 'blocked'
    elif failed > 0 or warnings:
        status = 'degraded'

    live_readiness = capabilities.get('liveVenueReady') if isinstance(capabilities.get('liveVenueReady'), dict) else {}
    for venue in ('polymarket', 'limitless'):
        current = bool(live_readiness.get(venue))
        if venue in configured_live_venues:
            live_readiness[venue] = current and venue not in venue_blockers
        else:
            live_readiness[venue] = current
    capabilities['liveVenueReady'] = live_readiness
    capabilities['blockers'] = sorted(set(hard_reasons))
    capabilities['warnings'] = sorted(set(warnings))
    capabilities['venueBlockers'] = dict(sorted(venue_blockers.items()))
    capabilities['paperMetrics'] = singularity_paper_metrics
    capabilities['ok'] = len(capabilities['blockers']) == 0
    write_json(CAPABILITIES_PATH, capabilities)

    summary = {
        'ok': status == 'ok',
        'status': status,
        'startedAt': started_at,
        'at': now_iso(),
        'executionMode': EXECUTION_MODE,
        'reasons': sorted(set(hard_reasons)),
        'warnings': sorted(set(warnings)),
        'venueBlockers': dict(sorted(venue_blockers.items())),
        'configuredLiveVenues': configured_live_venues,
        'activeLiveVenues': usable_live_venues,
        'candidates': len(candidates),
        'tradableCandidates': len(tradable_candidates),
        'signalCandidates': len(signal_candidates),
        'executedTrades': executed,
        'successfulTrades': succeeded,
        'failedTrades': failed,
        'closedTradesTick': closed,
        'liveCloseAttemptsTick': live_close_attempts_tick,
        'liveCloseRealizedTick': live_close_realized_tick,
        'liveCloseDeferredTick': live_close_deferred_tick,
        'slotRecoveryClosedTick': slot_recovery_closed,
        'markToMarketRowsTick': mark_to_market_rows,
        'syntheticCloseViolationsTick': synthetic_close_violations_tick,
        'openPositions': len(open_positions),
        'limitlessSyncedCount': limitless_synced_count,
        'signalsRecorded': signal_rows,
        'blockedCandidates': blocked_candidates,
        'recordsAppended': records_appended,
        'dailyNotionalUsdUsed': round(daily_notional_used, 8),
        'maxNotionalUsdPerDay': round(MAX_NOTIONAL_USD_PER_DAY_EFFECTIVE, 8),
        'maxNotionalUsdPerDayConfigured': round(MAX_NOTIONAL_USD_PER_DAY, 8),
        'entryPriceMin': round(ENTRY_PRICE_MIN, 8),
        'entryPriceMax': round(ENTRY_PRICE_MAX, 8),
        'blockedByPriceBand': blocked_price_band,
        'maxOpenPositions': MAX_OPEN_POSITIONS,
        'maxPositionsPerMarket': MAX_POSITIONS_PER_MARKET,
        'maxExecAttemptsPerTick': MAX_EXEC_ATTEMPTS_PER_TICK,
        'maxFailuresPerTick': MAX_FAILURES_PER_TICK,
        'maxMarketExposureUsd': round(max_market_exposure_usd, 8),
        'drawdownPct': drawdown_pct_after,
        'peakEquityReconciled': peak_equity_reconciled,
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
        'singularityPaperTradesTick': trades_by_venue['singularity'],
        'kalshiSignalsTick': signal_rows,
        'tradingNetUsd48h': live_48h_metrics['tradingNetUsd48h'],
        'microLiveTrades48h': live_48h_metrics['microLiveTrades48h'],
        'paperTrades7d': singularity_paper_metrics['paperTrades7d'],
        'paperWinRate7d': singularity_paper_metrics['paperWinRate7d'],
        'paperSharpeWindow': singularity_paper_metrics['paperSharpeWindow'],
        'minPaperClosesForLive': MIN_PAPER_CLOSES_FOR_LIVE,
        'minLiveClosesTarget48h': MIN_LIVE_CLOSES_TARGET_48H,
        'enforceMicroLiveGates': ENFORCE_MICRO_LIVE_GATES,
        'singularityPaperPath': str(SINGULARITY_PAPER_PATH),
        'venueWeights': venue_weights,
        'venueBudgets': venue_budgets,
        'venueBudgetRemaining': venue_budget_remaining,
        'slotRecoveryReferenceScore': round(slot_recovery_reference_score, 8),
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
            'markToMarketRowsTick': mark_to_market_rows,
            'syntheticCloseViolationsTick': synthetic_close_violations_tick,
            'openPositions': len(open_positions),
            'polymarketTradesTick': trades_by_venue['polymarket'],
            'limitlessTradesTick': trades_by_venue['limitless'],
            'singularityPaperTradesTick': trades_by_venue['singularity'],
            'kalshiSignalsTick': signal_rows,
            'drawdownPct': drawdown_pct_after,
            'weeklyRealizedNetUsd': weekly_realized_net_after,
            'reasons': summary['reasons'],
            'warnings': summary['warnings'],
        },
    )
    print(json.dumps(summary, ensure_ascii=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(run())
