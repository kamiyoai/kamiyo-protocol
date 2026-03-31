#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import math
import os
import time
import urllib.parse
import urllib.request
from base64 import b64encode
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

try:
    from nacl.signing import SigningKey
except Exception:  # pragma: no cover - optional runtime dependency
    SigningKey = None

HOME_DIR = Path(os.environ.get('HOME', '~')).expanduser()
WORKSPACE = HOME_DIR / '.openclaw' / 'workspace'
RUNTIME_DIR = WORKSPACE / 'runtime'
STATE_DIR = RUNTIME_DIR / 'state'
FEEDS_DIR = RUNTIME_DIR / 'feeds'
RECEIPTS_DIR = RUNTIME_DIR / 'receipts'
SEED_DIR = RUNTIME_DIR / 'seed'
LOG_DIR = RUNTIME_DIR / 'logs'

FEED_PATH = FEEDS_DIR / 'trading-opportunities.json'
STATE_PATH = STATE_DIR / 'trading-feed-state.json'
OUTPUT_PATH = STATE_DIR / 'trading-feed.json'
LOG_PATH = LOG_DIR / 'trading-feed.jsonl'
LEADER_STATE_PATH = STATE_DIR / 'leader-follow-state.json'
LEADER_OUTPUT_PATH = STATE_DIR / 'leader-follow.json'
LEADER_LOG_PATH = LOG_DIR / 'leader-follow.jsonl'
REVENUE_GUARD_PATH = STATE_DIR / 'revenue-guard.json'
REVENUE_LEDGER_PATH = Path(
    os.getenv('KYO_REVENUE_LEDGER_PATH', str(RECEIPTS_DIR / 'revenue-ledger.jsonl')).strip()
).expanduser()


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
SINGULARITY_ENABLED = env_bool('KYO_TRADING_SINGULARITY_ENABLED', False)
VENUES = [
    item.strip().lower()
    for item in os.getenv('KYO_TRADING_VENUES', 'polymarket,limitless,kalshi').split(',')
    if item.strip()
]
if SINGULARITY_ENABLED and 'singularity' not in VENUES:
    VENUES = [venue for venue in VENUES if venue != 'singularity'] + ['singularity']
MAX_OPPORTUNITIES = max(1, min(500, env_int('KYO_TRADING_MAX_OPPORTUNITIES', 80)))
MIN_EXPECTED_NET_USD = env_float('KYO_TRADING_MIN_EDGE_USD', 0.05)
MIN_FILL_PROB = max(0.0, min(1.0, env_float('KYO_TRADING_MIN_FILL_PROB', 0.55)))
MIN_MARKET_LIQUIDITY_USD = max(0.0, env_float('KYO_TRADING_MIN_MARKET_LIQUIDITY_USD', 10_000.0))
MIN_TIME_TO_EXPIRY_MIN = max(0.0, env_float('KYO_TRADING_MIN_TIME_TO_EXPIRY_MIN', 45.0))
MAX_TIME_TO_EXPIRY_MIN = max(MIN_TIME_TO_EXPIRY_MIN, env_float('KYO_TRADING_MAX_TIME_TO_EXPIRY_MIN', 1440.0))
MAX_EVENT_CLUSTER_EXPOSURE_PCT = max(
    1.0,
    min(100.0, env_float('KYO_TRADING_MAX_EVENT_CLUSTER_EXPOSURE_PCT', 35.0)),
)
VENUE_CANDIDATE_STARVATION_TICKS = max(
    1,
    min(288, env_int('KYO_TRADING_VENUE_STARVATION_TICKS', 3)),
)
HTTP_TIMEOUT_SECONDS = max(3, min(60, env_int('KYO_TRADING_FEED_TIMEOUT_SECONDS', 15)))
ALLOW_INSECURE_HTTP = env_bool('KYO_ALLOW_INSECURE_HTTP_FEEDS', False)
MAX_POLYMARKET_CLOB_LOOKUPS = max(0, min(250, env_int('KYO_TRADING_POLYMARKET_CLOB_LOOKUPS', 60)))
MAX_SINGULARITY_ORDERBOOK_LOOKUPS = max(
    0,
    min(250, env_int('KYO_TRADING_SINGULARITY_ORDERBOOK_LOOKUPS', 80)),
)
LEADER_FOLLOW_ENABLED = env_bool('KYO_TRADING_LEADER_FOLLOW_ENABLED', True)
LEADER_FOLLOW_MODE = os.getenv('KYO_TRADING_LEADER_FOLLOW_MODE', 'shadow_auto').strip().lower() or 'shadow_auto'
LEADER_MAX_ACCOUNTS_PER_VENUE = max(5, min(250, env_int('KYO_TRADING_LEADER_MAX_ACCOUNTS_PER_VENUE', 40)))
LEADER_LOOKBACK_HOURS = max(1.0, env_float('KYO_TRADING_LEADER_LOOKBACK_HOURS', 72.0))
LEADER_RECENCY_HALFLIFE_HOURS = max(1.0, env_float('KYO_TRADING_LEADER_RECENCY_HALFLIFE_HOURS', 12.0))
LEADER_MIN_WEIGHT = max(0.001, env_float('KYO_TRADING_LEADER_MIN_WEIGHT', 0.05))
LEADER_MAX_WEIGHT = max(LEADER_MIN_WEIGHT, env_float('KYO_TRADING_LEADER_MAX_WEIGHT', 2.5))
LEADER_MAX_CONFIDENCE_BOOST = max(0.0, env_float('KYO_TRADING_LEADER_MAX_CONFIDENCE_BOOST_PCT', 20.0)) / 100.0
LEADER_MAX_CONFIDENCE_PENALTY = max(0.0, env_float('KYO_TRADING_LEADER_MAX_CONFIDENCE_PENALTY_PCT', 25.0)) / 100.0
LEADER_PROMOTE_MIN_SAMPLES = max(1, env_int('KYO_TRADING_LEADER_PROMOTE_MIN_SAMPLES', 120))
LEADER_PROMOTE_MIN_EDGE_USD = env_float('KYO_TRADING_LEADER_PROMOTE_MIN_EDGE_USD', 0.0)
LIMITLESS_LEADER_EVENTS_PER_MARKET = max(
    10,
    min(500, env_int('KYO_TRADING_LIMITLESS_LEADER_EVENTS_PER_MARKET', 60)),
)

POLYMARKET_GAMMA_BASE_URL = os.getenv('KYO_TRADING_POLYMARKET_GAMMA_BASE_URL', 'https://gamma-api.polymarket.com').strip().rstrip('/')
POLYMARKET_CLOB_BASE_URL = os.getenv('KYO_TRADING_POLYMARKET_CLOB_BASE_URL', 'https://clob.polymarket.com').strip().rstrip('/')
POLYMARKET_API_KEY = os.getenv('KYO_TRADING_POLYMARKET_API_KEY', '').strip()
POLYMARKET_LEADERBOARD_URLS = [
    item.strip()
    for item in os.getenv(
        'KYO_TRADING_POLYMARKET_LEADERBOARD_URLS',
        ','.join(
            [
                'https://lb-api.polymarket.com/leaderboard?limit=50',
                'https://data-api.polymarket.com/leaderboard?limit=50',
            ]
        ),
    ).split(',')
    if item.strip()
]
POLYMARKET_USER_TRADES_URL_TEMPLATE = os.getenv(
    'KYO_TRADING_POLYMARKET_USER_TRADES_URL_TEMPLATE',
    'https://data-api.polymarket.com/trades?user={account}&limit=80',
).strip()
LIMITLESS_API_BASE_URL = os.getenv('KYO_TRADING_LIMITLESS_API_BASE_URL', 'https://api.limitless.exchange').strip().rstrip('/')
LIMITLESS_API_KEY = os.getenv('KYO_TRADING_LIMITLESS_API_KEY', '').strip()
KALSHI_API_BASE_URL = os.getenv('KYO_TRADING_KALSHI_API_BASE_URL', 'https://api.elections.kalshi.com/trade-api/v2').strip().rstrip('/')
KALSHI_API_KEY_ID = os.getenv('KYO_TRADING_KALSHI_API_KEY_ID', '').strip()
SINGULARITY_API_BASE_URL = os.getenv('KYO_TRADING_SINGULARITY_API_BASE_URL', '').strip().rstrip('/')
SINGULARITY_AUTH_WALLET = os.getenv('KYO_TRADING_SINGULARITY_AUTH_WALLET', '').strip()
SINGULARITY_PRIVATE_KEY_PATH = os.getenv('KYO_TRADING_SINGULARITY_PRIVATE_KEY_PATH', '').strip()
SINGULARITY_BEARER_TOKEN = os.getenv('KYO_TRADING_SINGULARITY_BEARER_TOKEN', '').strip()
LEADER_SEED_PATH_ENV = os.getenv('KYO_TRADING_LEADER_SEED_PATH', 'runtime/seed/leader-follow-wallets.json').strip()

KALSHI_ALIGN_MULTIPLIER = 1.10
KALSHI_CONFLICT_MULTIPLIER = 0.85
THEME_STOPWORDS = {
    'the', 'and', 'for', 'with', 'will', 'this', 'that', 'from', 'what', 'when', 'where',
    'after', 'before', 'above', 'below', 'over', 'under', 'into', 'about', 'market', 'price',
    'yes', 'no', 'usd', 'us', 'is', 'are', 'to', 'of', 'in', 'on', 'at', 'by', 'or', 'a', 'an',
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_dirs() -> None:
    for path in (WORKSPACE, RUNTIME_DIR, STATE_DIR, FEEDS_DIR, RECEIPTS_DIR, SEED_DIR, LOG_DIR):
        path.mkdir(parents=True, exist_ok=True)
        path.chmod(0o700)


def resolve_workspace_path(path_value: str, fallback: Path) -> Path:
    text = path_value.strip()
    if not text:
        return fallback
    candidate = Path(text).expanduser()
    if candidate.is_absolute():
        return candidate
    if text.startswith('runtime/'):
        return RUNTIME_DIR / text.split('/', 1)[1]
    return WORKSPACE / text


def read_json_file(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return fallback


def parse_float(value: Any, default: float = 0.0) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except Exception:
            return default
    return default


def parse_bool(value: Any, default: bool = False) -> bool:
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


def parse_epoch_ms() -> int:
    return int(time.time() * 1000)


def base58_encode(payload: bytes) -> str:
    alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
    if not payload:
        return ''
    number = int.from_bytes(payload, 'big')
    encoded = ''
    while number > 0:
        number, remainder = divmod(number, 58)
        encoded = alphabet[remainder] + encoded
    prefix = 0
    for value in payload:
        if value == 0:
            prefix += 1
        else:
            break
    return ('1' * prefix) + encoded


def load_singularity_private_key_seed(path_value: str) -> bytes | None:
    if not path_value:
        return None
    path = Path(path_value).expanduser()
    if not path.exists():
        return None
    try:
        raw = path.read_text(encoding='utf-8').strip()
    except Exception:
        return None
    if not raw:
        return None

    key_bytes: bytes | None = None
    if raw.startswith('['):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                values = [int(item) for item in parsed]
                if values:
                    key_bytes = bytes(values)
        except Exception:
            key_bytes = None
    elif raw.startswith('{'):
        try:
            parsed = json.loads(raw)
        except Exception:
            parsed = {}
        if isinstance(parsed, dict):
            value = parsed.get('secretKey') or parsed.get('privateKey') or parsed.get('seed')
            if isinstance(value, list):
                try:
                    key_bytes = bytes(int(item) for item in value)
                except Exception:
                    key_bytes = None
            elif isinstance(value, str):
                text = value.strip()
                if text:
                    try:
                        key_bytes = bytes.fromhex(text[2:] if text.startswith('0x') else text)
                    except Exception:
                        key_bytes = None
    else:
        text = raw
        try:
            key_bytes = bytes.fromhex(text[2:] if text.startswith('0x') else text)
        except Exception:
            key_bytes = None

    if not key_bytes:
        return None
    if len(key_bytes) >= 32:
        return key_bytes[:32]
    return None


def build_singularity_auth_header() -> str:
    if SINGULARITY_BEARER_TOKEN:
        return f'Bearer {SINGULARITY_BEARER_TOKEN}'
    if not (SINGULARITY_AUTH_WALLET and SINGULARITY_PRIVATE_KEY_PATH and SigningKey is not None):
        return ''
    seed = load_singularity_private_key_seed(SINGULARITY_PRIVATE_KEY_PATH)
    if seed is None:
        return ''
    message_ts = parse_epoch_ms()
    message = f'keiro-auth:{message_ts}'.encode('utf-8')
    try:
        signer = SigningKey(seed)
        signature = signer.sign(message).signature
    except Exception:
        return ''
    signature_b58 = base58_encode(signature)
    if not signature_b58:
        signature_b58 = b64encode(signature).decode('ascii')
    return f'Solana {SINGULARITY_AUTH_WALLET}:{signature_b58}:{message_ts}'


def build_singularity_headers() -> dict[str, str]:
    headers: dict[str, str] = {}
    auth_header = build_singularity_auth_header()
    if auth_header:
        headers['Authorization'] = auth_header
    return headers


def parse_jsonish(value: Any) -> Any:
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return value
        if stripped[:1] in {'{', '['}:
            try:
                return json.loads(stripped)
            except Exception:
                return value
    return value


def pick_string(record: dict[str, Any], keys: list[str]) -> str:
    for key in keys:
        value = record.get(key)
        if isinstance(value, str):
            stripped = value.strip()
            if stripped:
                return stripped
    return ''


def pick_number(record: dict[str, Any], keys: list[str]) -> float | None:
    for key in keys:
        if key not in record:
            continue
        value = parse_float(record.get(key), float('nan'))
        if value == value:
            return value
    return None


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + '\n', encoding='utf-8')
    path.chmod(0o600)


def append_json_line(path: Path, payload: dict[str, Any]) -> None:
    with path.open('a', encoding='utf-8') as handle:
        handle.write(json.dumps(payload, ensure_ascii=True) + '\n')
    path.chmod(0o600)


def normalize_url(base_url: str, suffix: str) -> str:
    if not base_url:
        return ''
    if suffix.startswith('http://') or suffix.startswith('https://'):
        return suffix
    return urllib.parse.urljoin(base_url.rstrip('/') + '/', suffix.lstrip('/'))


def is_allowed_url(url: str) -> bool:
    parsed = urllib.parse.urlparse(url)
    scheme = parsed.scheme.lower()
    if scheme == 'https':
        return True
    if scheme != 'http':
        return False
    if ALLOW_INSECURE_HTTP:
        return True
    return parsed.hostname in {'127.0.0.1', 'localhost'}


def request_json(url: str, headers: dict[str, str] | None = None) -> Any:
    if not is_allowed_url(url):
        raise RuntimeError(f'unsupported_url:{url}')
    request = urllib.request.Request(
        url=url,
        headers={
            'Accept': 'application/json',
            'User-Agent': 'kamiyo-agent-trading-feed/3.0',
            **(headers or {}),
        },
        method='GET',
    )
    with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
        raw = response.read(4_000_000)
    return json.loads(raw.decode('utf-8'))


def first_array(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    if not isinstance(payload, dict):
        return []
    candidates: list[Any] = [
        payload.get('data'),
        payload.get('results'),
        payload.get('items'),
        payload.get('markets'),
        payload.get('predictions'),
        payload.get('conditions'),
    ]
    data = payload.get('data')
    if isinstance(data, dict):
        candidates.extend(
            [
                data.get('results'),
                data.get('items'),
                data.get('markets'),
                data.get('predictions'),
                data.get('conditions'),
            ]
        )
    for value in candidates:
        parsed = parse_jsonish(value)
        if isinstance(parsed, list):
            return [row for row in parsed if isinstance(row, dict)]
    return []


def to_stable_id(venue: str, market_id: str, title: str, index: int) -> str:
    key = f'{venue}:{market_id}:{title}:{index}'
    digest = hashlib.sha1(key.encode('utf-8')).hexdigest()[:16]
    return f'trade-{venue}-{digest}'


def compact_record(record: dict[str, Any], max_bytes: int = 5000) -> dict[str, Any]:
    try:
        raw = json.dumps(record, ensure_ascii=True, separators=(',', ':'))
    except Exception:
        return {'truncated': True, 'reason': 'unserializable'}
    if len(raw) <= max_bytes:
        return record
    return {'truncated': True, 'preview': raw[: max_bytes - 3] + '...'}


def parse_string_array(value: Any) -> list[str]:
    parsed = parse_jsonish(value)
    if not isinstance(parsed, list):
        return []
    out: list[str] = []
    for item in parsed:
        if not isinstance(item, str):
            continue
        stripped = item.strip()
        if stripped:
            out.append(stripped)
    return out


def extract_price_pair(record: dict[str, Any]) -> tuple[float | None, float | None]:
    def normalize_probability(value: float) -> float:
        # Some venue payloads emit percentages (0-100) instead of 0-1.
        if 1.0 < value <= 100.0:
            return value / 100.0
        return value

    for key in ('prices', 'outcomePrices', 'outcome_prices', 'probabilities'):
        value = parse_jsonish(record.get(key))
        if isinstance(value, list) and len(value) >= 2:
            yes_price = parse_float(value[0], float('nan'))
            no_price = parse_float(value[1], float('nan'))
            if yes_price == yes_price and no_price == no_price:
                yes_price = normalize_probability(yes_price)
                no_price = normalize_probability(no_price)
                return yes_price, no_price
    tokens = parse_jsonish(record.get('tokens'))
    if isinstance(tokens, dict):
        yes_price = parse_float(tokens.get('yesPrice') if 'yesPrice' in tokens else tokens.get('yes_price'), float('nan'))
        no_price = parse_float(tokens.get('noPrice') if 'noPrice' in tokens else tokens.get('no_price'), float('nan'))
        if yes_price == yes_price and no_price == no_price:
            return yes_price, no_price
    midpoint = pick_number(record, ['midPrice', 'mid_price', 'probability', 'yesPrice', 'price', 'mid'])
    if midpoint is not None:
        midpoint = clamp(midpoint, 0.0, 1.0)
        return midpoint, 1.0 - midpoint
    return None, None


def extract_polymarket_token_id(record: dict[str, Any]) -> str:
    yes_token, no_token = extract_polymarket_token_ids(record)
    if yes_token:
        return yes_token
    if no_token:
        return no_token

    direct = pick_string(record, ['clobTokenId', 'clobTokenID', 'tokenId', 'token_id'])
    if direct:
        return direct

    for key in ('clobTokenIds', 'clob_token_ids', 'tokenIds'):
        value = parse_jsonish(record.get(key))
        if isinstance(value, list):
            for item in value:
                if isinstance(item, str) and item.strip():
                    return item.strip()

    tokens = parse_jsonish(record.get('tokens'))
    if isinstance(tokens, dict):
        for key in ('yes', 'YES', 'no', 'NO'):
            value = tokens.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()

    outcome_tokens = parse_jsonish(record.get('outcomeTokens'))
    if isinstance(outcome_tokens, list):
        for item in outcome_tokens:
            if isinstance(item, str) and item.strip():
                return item.strip()
            if isinstance(item, dict):
                token = pick_string(item, ['tokenId', 'token_id', 'id'])
                if token:
                    return token
    return ''


def extract_polymarket_token_ids(record: dict[str, Any]) -> tuple[str, str]:
    yes_token = ''
    no_token = ''

    token_ids: list[str] = []
    for key in ('clobTokenIds', 'clob_token_ids', 'tokenIds'):
        token_ids = parse_string_array(record.get(key))
        if token_ids:
            break
    if not token_ids:
        direct = pick_string(record, ['clobTokenId', 'clobTokenID', 'tokenId', 'token_id'])
        if direct:
            token_ids = [direct]

    outcomes = [label.lower() for label in parse_string_array(record.get('outcomes'))]
    if token_ids and outcomes and len(token_ids) == len(outcomes):
        for index, outcome in enumerate(outcomes):
            token = token_ids[index]
            if outcome == 'yes':
                yes_token = token
            elif outcome == 'no':
                no_token = token

    if not yes_token and token_ids:
        yes_token = token_ids[0]
    if not no_token and len(token_ids) > 1:
        no_token = token_ids[1]

    outcome_tokens = parse_jsonish(record.get('outcomeTokens'))
    if isinstance(outcome_tokens, list):
        for item in outcome_tokens:
            if not isinstance(item, dict):
                continue
            token = pick_string(item, ['tokenId', 'token_id', 'id'])
            outcome = pick_string(item, ['outcome', 'name', 'label']).strip().lower()
            if outcome == 'yes' and token:
                yes_token = yes_token or token
            elif outcome == 'no' and token:
                no_token = no_token or token

    tokens = parse_jsonish(record.get('tokens'))
    if isinstance(tokens, dict):
        yes_value = pick_string(tokens, ['yes', 'YES'])
        no_value = pick_string(tokens, ['no', 'NO'])
        if yes_value:
            yes_token = yes_token or yes_value
        if no_value:
            no_token = no_token or no_value

    return yes_token, no_token


def best_bid_ask(orderbook: dict[str, Any]) -> tuple[float | None, float | None]:
    bids = parse_jsonish(orderbook.get('bids'))
    asks = parse_jsonish(orderbook.get('asks'))

    def price_from_row(row: Any) -> float | None:
        if isinstance(row, (list, tuple)) and row:
            value = parse_float(row[0], float('nan'))
            return value if value == value else None
        if isinstance(row, dict):
            for key in ('price', 'p'):
                value = parse_float(row.get(key), float('nan'))
                if value == value:
                    return value
        return None

    best_bid = None
    best_ask = None
    if isinstance(bids, list):
        for row in bids:
            price = price_from_row(row)
            if price is None:
                continue
            best_bid = price if best_bid is None else max(best_bid, price)
    if isinstance(asks, list):
        for row in asks:
            price = price_from_row(row)
            if price is None:
                continue
            best_ask = price if best_ask is None else min(best_ask, price)
    return best_bid, best_ask


def parse_time_to_expiry_minutes(record: dict[str, Any]) -> float | None:
    for key in (
        'endDate',
        'expirationDate',
        'endTime',
        'expiry',
        'expiresAt',
        'expiration',
        'expiresAtMs',
        'expiryMs',
        'expiryTimestamp',
        'endTimestamp',
    ):
        ts = parse_ts(record.get(key))
        if ts is None:
            continue
        delta = (ts - datetime.now(timezone.utc)).total_seconds() / 60.0
        return round(delta, 6)
    return None


def tokenize_theme(text: str) -> set[str]:
    if not text:
        return set()
    cleaned = ''.join(ch.lower() if ch.isalnum() else ' ' for ch in text)
    parts = [part for part in cleaned.split() if len(part) >= 3 and part not in THEME_STOPWORDS]
    return set(parts)


def normalize_direction_from_midpoint(midpoint: float | None) -> str:
    if midpoint is None:
        return 'unknown'
    return 'yes' if midpoint >= 0.5 else 'no'


def orderbook_depth_usd(orderbook: Any) -> float:
    if not isinstance(orderbook, dict):
        return 0.0

    def parse_level(row: Any) -> tuple[float, float]:
        if isinstance(row, dict):
            price = parse_float(row.get('price') if 'price' in row else row.get('p'), 0.0)
            size = parse_float(
                row.get('size') if 'size' in row else row.get('quantity') if 'quantity' in row else row.get('q'),
                0.0,
            )
            return price, size
        if isinstance(row, (list, tuple)):
            if len(row) < 2:
                return 0.0, 0.0
            return parse_float(row[0], 0.0), parse_float(row[1], 0.0)
        return 0.0, 0.0

    total = 0.0
    for side in ('bids', 'asks'):
        levels = parse_jsonish(orderbook.get(side))
        if not isinstance(levels, list):
            continue
        for row in levels[:20]:
            price, size = parse_level(row)
            if price > 0 and size > 0:
                total += price * size
    return round(max(0.0, total), 8)


def normalize_event_cluster(venue: str, title: str, record: dict[str, Any]) -> str:
    explicit = pick_string(
        record,
        [
            'eventCluster',
            'event_cluster',
            'category',
            'topic',
            'tag',
            'event',
            'eventGroup',
            'event_group',
        ],
    )
    if explicit:
        cleaned = ''.join(ch.lower() if ch.isalnum() else '-' for ch in explicit).strip('-')
        if cleaned:
            return f'{venue}:{cleaned}'
    tokens = sorted(tokenize_theme(title))
    if not tokens:
        return f'{venue}:uncategorized'
    return f'{venue}:{"-".join(tokens[:4])}'


def parse_trading_direction(value: Any) -> str:
    text = str(value or '').strip().lower()
    if not text:
        return 'unknown'
    yes_tokens = {'yes', 'y', 'long', 'buy', 'up', 'bull', 'for'}
    no_tokens = {'no', 'n', 'short', 'sell', 'down', 'bear', 'against'}
    parts = tokenize_theme(text) | {text}
    if any(token in yes_tokens for token in parts):
        return 'yes'
    if any(token in no_tokens for token in parts):
        return 'no'
    return 'unknown'


def normalize_leader_id(value: Any) -> str:
    text = str(value or '').strip().lower()
    if not text:
        return ''
    if text.startswith('0x') and len(text) >= 42:
        return text[:42]
    return text


def normalize_market_key(value: Any) -> str:
    text = str(value or '').strip().lower()
    return text


def safe_venue(value: Any) -> str:
    venue = str(value or '').strip().lower()
    if venue in {'polymarket', 'limitless'}:
        return venue
    return ''


def normalize_hit_score(value: Any, pnl_usd: float) -> float:
    parsed = parse_float(value, float('nan'))
    if parsed == parsed:
        if parsed > 1.0:
            parsed = parsed / 100.0
        return clamp(parsed, 0.0, 1.0)
    if pnl_usd > 0:
        return 1.0
    if pnl_usd < 0:
        return 0.0
    return 0.5


def leader_recency_decay(ts: datetime | None) -> float:
    if ts is None:
        return 0.5
    age_hours = max(0.0, (datetime.now(timezone.utc) - ts).total_seconds() / 3600.0)
    if LEADER_RECENCY_HALFLIFE_HOURS <= 0:
        return 1.0
    return clamp(math.pow(0.5, age_hours / LEADER_RECENCY_HALFLIFE_HOURS), 0.05, 1.0)


def parse_leader_seed_path() -> Path:
    fallback = RUNTIME_DIR / 'seed' / 'leader-follow-wallets.json'
    return resolve_workspace_path(LEADER_SEED_PATH_ENV, fallback)


def load_leader_seed_rows() -> list[dict[str, Any]]:
    seed_path = parse_leader_seed_path()
    payload = read_json_file(seed_path, [])
    rows: list[dict[str, Any]] = []
    candidates: list[Any]
    if isinstance(payload, list):
        candidates = payload
    elif isinstance(payload, dict):
        items = payload.get('leaders')
        candidates = items if isinstance(items, list) else []
    else:
        candidates = []

    def seed_venues(raw: Any) -> list[str]:
        venue = safe_venue(raw)
        if venue:
            return [venue]
        return ['polymarket', 'limitless']

    for item in candidates:
        if isinstance(item, str):
            leader_id = normalize_leader_id(item)
            if not leader_id:
                continue
            for venue in seed_venues(None):
                rows.append(
                    {
                        'leaderId': leader_id,
                        'venue': venue,
                        'marketId': '',
                        'title': '',
                        'direction': 'unknown',
                        'tradeUsd': 0.0,
                        'pnlUsd': 0.0,
                        'hit': 0.5,
                        'ts': now_iso(),
                        'source': 'seed',
                    }
                )
            continue
        if not isinstance(item, dict):
            continue
        leader_id = normalize_leader_id(
            item.get('leaderId') or item.get('wallet') or item.get('account') or item.get('address')
        )
        if not leader_id:
            continue
        for venue in seed_venues(item.get('venue')):
            rows.append(
                {
                    'leaderId': leader_id,
                    'venue': venue,
                    'marketId': normalize_market_key(item.get('marketId') or item.get('market') or item.get('slug')),
                    'title': str(item.get('title') or ''),
                    'direction': parse_trading_direction(item.get('direction')),
                    'tradeUsd': max(0.0, parse_float(item.get('tradeUsd') or item.get('sizeUsd'), 0.0)),
                    'pnlUsd': parse_float(item.get('pnlUsd'), 0.0),
                    'hit': normalize_hit_score(item.get('hit'), parse_float(item.get('pnlUsd'), 0.0)),
                    'ts': str(item.get('ts') or item.get('at') or now_iso()),
                    'source': 'seed',
                }
            )
    return rows


def parse_leader_activity_row(row: dict[str, Any]) -> dict[str, Any] | None:
    leader_id = normalize_leader_id(row.get('leaderId') or row.get('account') or row.get('wallet') or row.get('address'))
    if not leader_id:
        return None
    venue = safe_venue(row.get('venue'))
    if not venue:
        return None
    market_id = normalize_market_key(row.get('marketId') or row.get('slug') or row.get('conditionId'))
    title = str(row.get('title') or row.get('question') or '').strip()
    direction = parse_trading_direction(row.get('direction') or row.get('side') or row.get('outcome'))
    trade_usd = max(0.0, parse_float(row.get('tradeUsd') or row.get('amountUsd') or row.get('sizeUsd'), 0.0))
    pnl_usd = parse_float(row.get('pnlUsd') or row.get('edgeUsd') or row.get('profitUsd'), 0.0)
    hit = normalize_hit_score(row.get('hit') or row.get('winRate'), pnl_usd)
    timestamp = parse_ts(row.get('ts') or row.get('createdAt') or row.get('at') or row.get('timestamp'))
    return {
        'leaderId': leader_id,
        'venue': venue,
        'marketId': market_id,
        'title': title,
        'direction': direction,
        'tradeUsd': round(trade_usd, 8),
        'pnlUsd': round(pnl_usd, 8),
        'hit': round(hit, 6),
        'ts': (timestamp or datetime.now(timezone.utc)).isoformat(),
        'source': str(row.get('source') or 'activity').strip() or 'activity',
    }


def limitless_extract_event_rows(market: dict[str, Any], events_payload: Any) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    market_id = normalize_market_key(
        pick_string(market, ['slug', 'marketSlug', 'market_id', 'marketId', 'id'])
    )
    title = pick_string(market, ['title', 'question', 'name'])
    for raw in first_array(events_payload):
        event_type = pick_string(raw, ['type', 'eventType', 'activityType', 'kind']).upper()
        if event_type and 'TRADE' not in event_type:
            continue
        event_data = raw.get('data') if isinstance(raw.get('data'), dict) else {}
        user_data = raw.get('user') if isinstance(raw.get('user'), dict) else {}
        account = normalize_leader_id(
            user_data.get('account')
            or user_data.get('wallet')
            or raw.get('account')
            or raw.get('wallet')
            or event_data.get('account')
            or event_data.get('wallet')
        )
        if not account:
            continue
        trade_usd = max(
            0.0,
            parse_float(
                event_data.get('tradeAmountUSD')
                or event_data.get('tradeAmountUsd')
                or event_data.get('amountUsd')
                or event_data.get('sizeUsd')
                or raw.get('tradeAmountUSD')
                or raw.get('amountUsd'),
                0.0,
            ),
        )
        pnl_usd = parse_float(
            event_data.get('pnlUsd')
            or event_data.get('profitUsd')
            or raw.get('pnlUsd')
            or raw.get('profitUsd'),
            0.0,
        )
        direction = parse_trading_direction(
            event_data.get('direction')
            or event_data.get('side')
            or event_data.get('strategy')
            or event_data.get('outcome')
            or raw.get('direction')
            or raw.get('side')
        )
        ts = parse_ts(
            raw.get('createdAt')
            or raw.get('timestamp')
            or event_data.get('createdAt')
            or event_data.get('timestamp')
        )
        normalized = parse_leader_activity_row(
            {
                'leaderId': account,
                'venue': 'limitless',
                'marketId': market_id,
                'title': title,
                'direction': direction,
                'tradeUsd': trade_usd,
                'pnlUsd': pnl_usd,
                'hit': event_data.get('hit'),
                'ts': (ts or datetime.now(timezone.utc)).isoformat(),
                'source': 'limitless_events',
            }
        )
        if normalized is not None:
            rows.append(normalized)
    return rows


def latest_pnl_value(payload: Any) -> float:
    points = first_array(payload)
    if not points:
        return 0.0
    first = points[0]
    last = points[-1]
    first_value = parse_float(
        first.get('value')
        if isinstance(first, dict)
        else 0.0,
        0.0,
    )
    last_value = parse_float(
        last.get('value')
        if isinstance(last, dict)
        else 0.0,
        first_value,
    )
    return round(last_value - first_value, 8)


def load_limitless_leader_activity(limitless_records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    headers: dict[str, str] = {}
    if LIMITLESS_API_KEY:
        headers['X-API-Key'] = LIMITLESS_API_KEY
    rows: list[dict[str, Any]] = []
    if not LIMITLESS_API_BASE_URL:
        return rows

    max_markets = max(3, min(40, LEADER_MAX_ACCOUNTS_PER_VENUE))
    markets = limitless_records[:max_markets]
    discovered_accounts: list[str] = []
    for market in markets:
        slug = pick_string(market, ['slug', 'marketSlug', 'market_slug'])
        if not slug:
            continue
        events_url = normalize_url(
            LIMITLESS_API_BASE_URL,
            f'/markets/{urllib.parse.quote(slug)}/get-feed-events?limit={LIMITLESS_LEADER_EVENTS_PER_MARKET}',
        )
        if not events_url:
            continue
        try:
            payload = request_json(events_url, headers=headers)
        except Exception:
            continue
        event_rows = limitless_extract_event_rows(market, payload)
        rows.extend(event_rows)
        for row in event_rows:
            leader_id = str(row.get('leaderId') or '').strip().lower()
            if leader_id and leader_id not in discovered_accounts:
                discovered_accounts.append(leader_id)

    account_pnl: dict[str, float] = {}
    for account in discovered_accounts[:LEADER_MAX_ACCOUNTS_PER_VENUE]:
        pnl_url = normalize_url(LIMITLESS_API_BASE_URL, f'/portfolio/{urllib.parse.quote(account)}/pnl-chart')
        if not pnl_url:
            continue
        try:
            account_pnl[account] = latest_pnl_value(request_json(pnl_url, headers=headers))
        except Exception:
            continue
    if account_pnl:
        for row in rows:
            leader_id = str(row.get('leaderId') or '').strip().lower()
            if leader_id in account_pnl and parse_float(row.get('pnlUsd'), 0.0) == 0.0:
                pnl = account_pnl[leader_id]
                row['pnlUsd'] = round(pnl, 8)
                row['hit'] = normalize_hit_score(row.get('hit'), pnl)
    return rows


def parse_polymarket_account(row: dict[str, Any]) -> str:
    direct = normalize_leader_id(
        row.get('proxyWallet')
        or row.get('walletAddress')
        or row.get('wallet')
        or row.get('account')
        or row.get('address')
        or row.get('user')
    )
    if direct:
        return direct
    user = row.get('user') if isinstance(row.get('user'), dict) else {}
    return normalize_leader_id(
        user.get('wallet')
        or user.get('address')
        or user.get('account')
        or user.get('proxyWallet')
    )


def parse_polymarket_leaderboard_rows(payload: Any) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for entry in first_array(payload):
        account = parse_polymarket_account(entry)
        if not account:
            continue
        rows.append(
            {
                'leaderId': account,
                'pnlUsd': parse_float(
                    entry.get('pnl')
                    or entry.get('profit')
                    or entry.get('profitUsd')
                    or entry.get('realizedPnl')
                    or entry.get('totalPnl'),
                    0.0,
                ),
                'tradeUsd': max(
                    0.0,
                    parse_float(entry.get('volume') or entry.get('volumeUsd') or entry.get('tradedVolume'), 0.0),
                ),
                'hit': normalize_hit_score(
                    entry.get('winRate') or entry.get('hitRate') or entry.get('accuracy'),
                    parse_float(entry.get('pnl') or entry.get('profit') or entry.get('profitUsd'), 0.0),
                ),
            }
        )
    return rows


def load_polymarket_leader_activity() -> list[dict[str, Any]]:
    headers: dict[str, str] = {}
    if POLYMARKET_API_KEY:
        headers['Authorization'] = f'Bearer {POLYMARKET_API_KEY}'
    leaderboard_rows: list[dict[str, Any]] = []
    for url in POLYMARKET_LEADERBOARD_URLS:
        try:
            leaderboard_rows = parse_polymarket_leaderboard_rows(request_json(url, headers=headers))
        except Exception:
            continue
        if leaderboard_rows:
            break

    activity_rows: list[dict[str, Any]] = []
    for entry in leaderboard_rows[:LEADER_MAX_ACCOUNTS_PER_VENUE]:
        leader_id = str(entry.get('leaderId') or '').strip().lower()
        if not leader_id:
            continue
        trades_url = POLYMARKET_USER_TRADES_URL_TEMPLATE.replace('{account}', urllib.parse.quote(leader_id))
        if not trades_url:
            continue
        try:
            payload = request_json(trades_url, headers=headers)
        except Exception:
            continue
        market_rows = first_array(payload)
        if not market_rows:
            normalized = parse_leader_activity_row(
                {
                    'leaderId': leader_id,
                    'venue': 'polymarket',
                    'marketId': '',
                    'title': '',
                    'direction': 'unknown',
                    'tradeUsd': entry.get('tradeUsd'),
                    'pnlUsd': entry.get('pnlUsd'),
                    'hit': entry.get('hit'),
                    'ts': now_iso(),
                    'source': 'polymarket_leaderboard',
                }
            )
            if normalized is not None:
                activity_rows.append(normalized)
            continue
        for trade in market_rows[:LIMITLESS_LEADER_EVENTS_PER_MARKET]:
            direction = parse_trading_direction(
                trade.get('side') or trade.get('outcome') or trade.get('position') or trade.get('direction')
            )
            trade_usd = max(
                0.0,
                parse_float(
                    trade.get('amountUsd')
                    or trade.get('sizeUsd')
                    or trade.get('notionalUsd')
                    or trade.get('amount')
                    or trade.get('size'),
                    0.0,
                ),
            )
            pnl_usd = parse_float(
                trade.get('pnlUsd') or trade.get('profitUsd') or trade.get('realizedPnl') or entry.get('pnlUsd'),
                0.0,
            )
            normalized = parse_leader_activity_row(
                {
                    'leaderId': leader_id,
                    'venue': 'polymarket',
                    'marketId': trade.get('marketId') or trade.get('market') or trade.get('conditionId') or trade.get('slug'),
                    'title': trade.get('title') or trade.get('question') or trade.get('marketQuestion') or '',
                    'direction': direction,
                    'tradeUsd': trade_usd if trade_usd > 0 else entry.get('tradeUsd'),
                    'pnlUsd': pnl_usd,
                    'hit': trade.get('win') or trade.get('hit') or entry.get('hit'),
                    'ts': trade.get('timestamp') or trade.get('createdAt') or now_iso(),
                    'source': 'polymarket_user_trades',
                }
            )
            if normalized is not None:
                activity_rows.append(normalized)
    return activity_rows


def leader_key(venue: str, leader_id: str) -> str:
    return f'{venue}:{leader_id}'.lower()


def load_leader_state() -> dict[str, Any]:
    state = read_json_file(LEADER_STATE_PATH, {})
    if not isinstance(state, dict):
        state = {}
    leaders = state.get('leaders')
    if not isinstance(leaders, dict):
        leaders = {}
    state['leaders'] = leaders
    processed = state.get('processedLedgerIds')
    if not isinstance(processed, list):
        processed = []
    state['processedLedgerIds'] = [str(item) for item in processed if str(item).strip()]
    return state


def save_leader_state(state: dict[str, Any]) -> None:
    write_json(LEADER_STATE_PATH, state)


def leader_entry(state: dict[str, Any], venue: str, leader_id: str) -> dict[str, Any]:
    leaders = state.get('leaders')
    if not isinstance(leaders, dict):
        leaders = {}
        state['leaders'] = leaders
    key = leader_key(venue, leader_id)
    current = leaders.get(key)
    if not isinstance(current, dict):
        current = {
            'leaderId': leader_id,
            'venue': venue,
            'weight': 1.0,
            'samples': 0,
            'ewmaEdge': 0.0,
            'ewmaHitRate': 0.5,
            'ewmaVolume': 0.0,
            'ewmaDrawdown': 0.0,
            'regret': 0.0,
            'lastSeenAt': '',
        }
        leaders[key] = current
    return current


def update_leader_from_observation(
    state: dict[str, Any],
    *,
    venue: str,
    leader_id: str,
    edge_usd: float,
    hit: float,
    volume_usd: float,
    venue_median_edge: float,
    seen_at: str,
) -> dict[str, Any]:
    current = leader_entry(state, venue, leader_id)
    alpha = 0.2
    ewma_edge = parse_float(current.get('ewmaEdge'), 0.0) * (1.0 - alpha) + edge_usd * alpha
    ewma_hit = parse_float(current.get('ewmaHitRate'), 0.5) * (1.0 - alpha) + clamp(hit, 0.0, 1.0) * alpha
    ewma_volume = parse_float(current.get('ewmaVolume'), 0.0) * (1.0 - alpha) + max(0.0, volume_usd) * alpha
    edge_shortfall = max(0.0, venue_median_edge - edge_usd)
    regret = parse_float(current.get('regret'), 0.0) * (1.0 - alpha) + edge_shortfall * alpha
    drawdown_obs = max(0.0, -edge_usd)
    ewma_drawdown = parse_float(current.get('ewmaDrawdown'), 0.0) * (1.0 - alpha) + drawdown_obs * alpha

    edge_scale = max(1.0, abs(ewma_volume) * 0.05)
    edge_signal = math.tanh(ewma_edge / edge_scale)
    hit_signal = (ewma_hit - 0.5) * 2.0
    regret_signal = math.tanh(regret / 5.0)
    drawdown_signal = math.tanh(ewma_drawdown / 5.0)
    raw_weight = 1.0 + (edge_signal * 0.7) + (hit_signal * 0.3) - (regret_signal * 0.4) - (drawdown_signal * 0.4)
    next_weight = clamp(raw_weight, LEADER_MIN_WEIGHT, LEADER_MAX_WEIGHT)

    current.update(
        {
            'weight': round(next_weight, 8),
            'samples': int(parse_float(current.get('samples'), 0.0) + 1),
            'ewmaEdge': round(ewma_edge, 8),
            'ewmaHitRate': round(ewma_hit, 8),
            'ewmaVolume': round(ewma_volume, 8),
            'ewmaDrawdown': round(ewma_drawdown, 8),
            'regret': round(regret, 8),
            'lastSeenAt': seen_at,
        }
    )
    return current


def read_recent_ledger_feedback(state: dict[str, Any]) -> list[dict[str, Any]]:
    if not REVENUE_LEDGER_PATH.exists():
        return []
    processed = set(str(item) for item in state.get('processedLedgerIds') or [])
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max(24.0, LEADER_LOOKBACK_HOURS * 2.0))
    updates: list[dict[str, Any]] = []
    new_ids: list[str] = []
    for raw in REVENUE_LEDGER_PATH.read_text(encoding='utf-8').splitlines():
        line = raw.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except Exception:
            continue
        if not isinstance(row, dict):
            continue
        row_id = str(row.get('id') or '').strip()
        if not row_id or row_id in processed:
            continue
        if str(row.get('source') or '').strip().lower() != 'trading':
            continue
        kind = str(row.get('kind') or '').strip().lower()
        if kind not in {'trade_close', 'mark_to_market'}:
            continue
        status = str(row.get('status') or '').strip().lower()
        if status != 'success':
            continue
        ts = parse_ts(row.get('at') or row.get('timestamp') or row.get('executedAt'))
        if ts is None or ts < cutoff:
            continue
        metadata = row.get('metadata') if isinstance(row.get('metadata'), dict) else {}
        snapshot = metadata.get('leaderFollowSnapshot') if isinstance(metadata.get('leaderFollowSnapshot'), dict) else {}
        matched = snapshot.get('matchedLeaders') if isinstance(snapshot.get('matchedLeaders'), list) else []
        if not matched:
            continue
        net_usd = parse_float(row.get('netUsd'), 0.0)
        gross_usd = max(0.0, parse_float(row.get('grossUsd'), 0.0))
        split_count = max(1, len(matched))
        edge_each = net_usd / split_count
        volume_each = gross_usd / split_count if gross_usd > 0 else abs(edge_each)
        for match in matched:
            if not isinstance(match, dict):
                continue
            leader_id = normalize_leader_id(match.get('leaderId'))
            venue = safe_venue(match.get('venue'))
            if not leader_id or not venue:
                continue
            updates.append(
                {
                    'leaderId': leader_id,
                    'venue': venue,
                    'marketId': normalize_market_key(row.get('marketId')),
                    'title': '',
                    'direction': parse_trading_direction(match.get('direction')),
                    'tradeUsd': volume_each,
                    'pnlUsd': edge_each,
                    'hit': normalize_hit_score(match.get('hit'), edge_each),
                    'ts': ts.isoformat(),
                    'source': 'ledger_feedback',
                }
            )
        new_ids.append(row_id)
    if new_ids:
        merged = [*state.get('processedLedgerIds', []), *new_ids]
        state['processedLedgerIds'] = merged[-4000:]
    return updates


def collect_leader_activity(records_by_venue: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seed_rows = load_leader_seed_rows()
    rows.extend(seed_rows)
    limitless_rows = load_limitless_leader_activity(records_by_venue.get('limitless', []))
    rows.extend(limitless_rows)
    rows.extend(load_polymarket_leader_activity())
    normalized: list[dict[str, Any]] = []
    for row in rows:
        parsed = parse_leader_activity_row(row)
        if parsed is not None:
            normalized.append(parsed)
    return normalized


def match_leader_candidates(
    candidate: dict[str, Any],
    leader_rows: list[dict[str, Any]],
    leader_state: dict[str, Any],
) -> list[dict[str, Any]]:
    market_id = normalize_market_key(candidate.get('marketId'))
    title = str(candidate.get('title') or '').strip()
    metadata = candidate.get('metadata') if isinstance(candidate.get('metadata'), dict) else {}
    candidate_cluster = str(metadata.get('eventCluster') or '').strip().lower()
    candidate_direction = parse_trading_direction(metadata.get('direction'))
    matches: list[dict[str, Any]] = []
    exact: list[dict[str, Any]] = []
    fallback: list[dict[str, Any]] = []
    candidate_tokens = tokenize_theme(title)
    if candidate_cluster:
        candidate_tokens |= tokenize_theme(candidate_cluster)
    for row in leader_rows:
        row_market = normalize_market_key(row.get('marketId'))
        if market_id and row_market and market_id == row_market:
            exact.append(row)
            continue
        row_tokens = tokenize_theme(str(row.get('title') or ''))
        if not row_tokens or not candidate_tokens:
            continue
        overlap = len(candidate_tokens & row_tokens)
        if overlap <= 0:
            continue
        fallback.append({**row, '_tokenOverlap': overlap})
    source_rows = exact if exact else sorted(
        fallback,
        key=lambda item: parse_float(item.get('_tokenOverlap'), 0.0),
        reverse=True,
    )
    for row in source_rows[:8]:
        venue = safe_venue(row.get('venue'))
        leader_id = normalize_leader_id(row.get('leaderId'))
        if not venue or not leader_id:
            continue
        entry = leader_entry(leader_state, venue, leader_id)
        row_direction = parse_trading_direction(row.get('direction'))
        alignment = 'neutral'
        sign = 0.0
        if row_direction != 'unknown' and candidate_direction != 'unknown':
            if row_direction == candidate_direction:
                alignment = 'aligned'
                sign = 1.0
            else:
                alignment = 'conflicting'
                sign = -1.0
        recency = leader_recency_decay(parse_ts(row.get('ts')))
        notional = max(1.0, parse_float(row.get('tradeUsd'), 0.0))
        notional_factor = clamp(math.log10(notional + 1.0), 0.2, 1.2)
        weight = clamp(parse_float(entry.get('weight'), 1.0), LEADER_MIN_WEIGHT, LEADER_MAX_WEIGHT)
        contribution = sign * weight * recency * notional_factor
        matches.append(
            {
                'leaderId': leader_id,
                'venue': venue,
                'weight': round(weight, 8),
                'alignment': alignment,
                'direction': row_direction,
                'recency': round(recency, 8),
                'tradeUsd': round(parse_float(row.get('tradeUsd'), 0.0), 8),
                'contribution': round(contribution, 8),
                'hit': round(parse_float(row.get('hit'), 0.5), 6),
            }
        )
    return matches


def apply_leader_follow_influence(
    opportunities: list[dict[str, Any]],
    records_by_venue: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    started_at = now_iso()
    if not LEADER_FOLLOW_ENABLED:
        state_payload = {
            'mode': 'disabled',
            'requestedMode': LEADER_FOLLOW_MODE,
            'lastRunAt': now_iso(),
            'leaders': {},
            'processedLedgerIds': [],
            'learningSamples': 0,
            'rollingEdgeUsd': 0.0,
            'topLeaders': [],
        }
        write_json(LEADER_STATE_PATH, state_payload)
        summary = {
            'ok': True,
            'status': 'disabled',
            'mode': 'disabled',
            'startedAt': started_at,
            'at': now_iso(),
            'leaderUniverseSize': 0,
            'leaderCandidatesInfluenced': 0,
            'leaderTopIds': [],
            'leaderFollowAvgBias': 0.0,
            'promotedAt': '',
            'demotedAt': '',
            'reason': 'leader_follow_disabled',
        }
        write_json(LEADER_OUTPUT_PATH, summary)
        return summary

    state = load_leader_state()
    activity_rows = collect_leader_activity(records_by_venue)
    activity_rows.extend(read_recent_ledger_feedback(state))
    recent_cutoff = datetime.now(timezone.utc) - timedelta(hours=LEADER_LOOKBACK_HOURS)
    activity_rows = [
        row
        for row in activity_rows
        if parse_ts(row.get('ts')) is None or parse_ts(row.get('ts')) >= recent_cutoff
    ]

    venue_edges: dict[str, list[float]] = {}
    for row in activity_rows:
        venue = safe_venue(row.get('venue'))
        if not venue:
            continue
        venue_edges.setdefault(venue, []).append(parse_float(row.get('pnlUsd'), 0.0))
    venue_medians: dict[str, float] = {}
    for venue, edges in venue_edges.items():
        if not edges:
            venue_medians[venue] = 0.0
            continue
        sorted_edges = sorted(edges)
        middle = len(sorted_edges) // 2
        if len(sorted_edges) % 2:
            venue_medians[venue] = sorted_edges[middle]
        else:
            venue_medians[venue] = (sorted_edges[middle - 1] + sorted_edges[middle]) / 2.0

    for row in activity_rows:
        venue = safe_venue(row.get('venue'))
        leader_id = normalize_leader_id(row.get('leaderId'))
        if not venue or not leader_id:
            continue
        update_leader_from_observation(
            state,
            venue=venue,
            leader_id=leader_id,
            edge_usd=parse_float(row.get('pnlUsd'), 0.0),
            hit=parse_float(row.get('hit'), 0.5),
            volume_usd=max(0.0, parse_float(row.get('tradeUsd'), 0.0)),
            venue_median_edge=parse_float(venue_medians.get(venue), 0.0),
            seen_at=str(row.get('ts') or now_iso()),
        )

    leaders_map = state.get('leaders') if isinstance(state.get('leaders'), dict) else {}
    sorted_leaders = sorted(
        [
            row
            for row in leaders_map.values()
            if isinstance(row, dict) and safe_venue(row.get('venue')) and normalize_leader_id(row.get('leaderId'))
        ],
        key=lambda row: parse_float(row.get('weight'), 0.0),
        reverse=True,
    )
    allowed_keys: set[str] = set()
    by_venue: dict[str, list[dict[str, Any]]] = {'polymarket': [], 'limitless': []}
    for row in sorted_leaders:
        venue = safe_venue(row.get('venue'))
        if not venue:
            continue
        by_venue.setdefault(venue, []).append(row)
    for venue, rows in by_venue.items():
        for row in rows[:LEADER_MAX_ACCOUNTS_PER_VENUE]:
            key = leader_key(venue, normalize_leader_id(row.get('leaderId')))
            if key:
                allowed_keys.add(key)

    mode_requested = LEADER_FOLLOW_MODE
    mode_current = str(state.get('mode') or 'shadow').strip().lower() or 'shadow'
    revenue_guard = read_json_file(REVENUE_GUARD_PATH, {})
    guard_ok = bool(revenue_guard.get('ok', False)) if isinstance(revenue_guard, dict) else False
    synthetic_violations = parse_float(
        revenue_guard.get('syntheticRealizedCloseViolations')
        if isinstance(revenue_guard, dict)
        else 0.0,
        0.0,
    )
    learning_samples = sum(int(parse_float(row.get('samples'), 0.0)) for row in sorted_leaders[:LEADER_MAX_ACCOUNTS_PER_VENUE])
    rolling_edge = 0.0
    if sorted_leaders:
        rolling_edge = sum(parse_float(row.get('ewmaEdge'), 0.0) for row in sorted_leaders[:20]) / max(
            1,
            min(20, len(sorted_leaders)),
        )

    promoted = False
    demoted = False
    if mode_requested in {'live', 'on'}:
        mode_current = 'live'
    elif mode_requested in {'shadow', 'off'}:
        mode_current = 'shadow'
    else:
        can_promote = (
            learning_samples >= LEADER_PROMOTE_MIN_SAMPLES
            and rolling_edge >= LEADER_PROMOTE_MIN_EDGE_USD
            and synthetic_violations <= 0.0
            and guard_ok
        )
        if mode_current != 'live' and can_promote:
            mode_current = 'live'
            promoted = True
        elif mode_current == 'live' and not can_promote:
            mode_current = 'shadow'
            demoted = True

    influenced = 0
    bias_total = 0.0
    trade_candidates = [
        row for row in opportunities
        if isinstance(row, dict) and str(row.get('kind') or '').strip().lower() == 'trade_candidate'
    ]
    for candidate in trade_candidates:
        matches = match_leader_candidates(candidate, activity_rows, state)
        if not matches:
            metadata = candidate.get('metadata') if isinstance(candidate.get('metadata'), dict) else {}
            metadata['leaderFollow'] = {
                'mode': mode_current,
                'confidenceBefore': round(parse_float(candidate.get('confidence'), 0.0), 6),
                'confidenceAfter': round(parse_float(candidate.get('confidence'), 0.0), 6),
                'leaderBias': 0.0,
                'matchedLeaders': [],
                'topLeaderIds': [],
            }
            candidate['metadata'] = metadata
            continue
        filtered_matches = [
            match for match in matches
            if leader_key(match.get('venue', ''), match.get('leaderId', '')) in allowed_keys
        ]
        if not filtered_matches:
            filtered_matches = matches
        raw_bias = sum(parse_float(match.get('contribution'), 0.0) for match in filtered_matches)
        bounded_bias = clamp(
            math.tanh(raw_bias / max(1.0, len(filtered_matches) * 0.8)),
            -LEADER_MAX_CONFIDENCE_PENALTY,
            LEADER_MAX_CONFIDENCE_BOOST,
        )
        confidence_before = round(parse_float(candidate.get('confidence'), 0.0), 6)
        confidence_after = confidence_before
        if mode_current == 'live':
            confidence_after = round(clamp(confidence_before * (1.0 + bounded_bias), 0.01, 0.99), 6)
            candidate['confidence'] = confidence_after
        top_leader_ids = [
            f"{row.get('venue')}:{row.get('leaderId')}"
            for row in sorted(filtered_matches, key=lambda item: parse_float(item.get('weight'), 0.0), reverse=True)[:5]
        ]
        metadata = candidate.get('metadata') if isinstance(candidate.get('metadata'), dict) else {}
        metadata['leaderFollow'] = {
            'mode': mode_current,
            'confidenceBefore': confidence_before,
            'confidenceAfter': confidence_after,
            'leaderBias': round(bounded_bias, 8),
            'matchedLeaders': filtered_matches,
            'topLeaderIds': top_leader_ids,
        }
        candidate['metadata'] = metadata
        influenced += 1
        bias_total += bounded_bias

    top_leaders = []
    for row in sorted_leaders[:10]:
        top_leaders.append(
            {
                'leaderId': normalize_leader_id(row.get('leaderId')),
                'venue': safe_venue(row.get('venue')),
                'weight': round(parse_float(row.get('weight'), 0.0), 8),
                'samples': int(parse_float(row.get('samples'), 0.0)),
                'ewmaEdge': round(parse_float(row.get('ewmaEdge'), 0.0), 8),
                'ewmaHitRate': round(parse_float(row.get('ewmaHitRate'), 0.0), 8),
                'regret': round(parse_float(row.get('regret'), 0.0), 8),
                'lastSeenAt': str(row.get('lastSeenAt') or ''),
            }
        )

    now_value = now_iso()
    if promoted:
        state['promotedAt'] = now_value
    if demoted:
        state['demotedAt'] = now_value
    state['requestedMode'] = mode_requested
    state['mode'] = mode_current
    state['lastRunAt'] = now_value
    state['learningSamples'] = learning_samples
    state['rollingEdgeUsd'] = round(rolling_edge, 8)
    state['syntheticCloseViolations'] = int(synthetic_violations)
    state['guardOk'] = guard_ok
    state['topLeaders'] = top_leaders
    save_leader_state(state)

    summary = {
        'ok': True,
        'status': 'ok',
        'startedAt': started_at,
        'at': now_value,
        'mode': mode_current,
        'requestedMode': mode_requested,
        'promotedAt': str(state.get('promotedAt') or ''),
        'demotedAt': str(state.get('demotedAt') or ''),
        'leaderUniverseSize': len(sorted_leaders),
        'learningSamples': learning_samples,
        'rollingEdgeUsd': round(rolling_edge, 8),
        'leaderCandidatesInfluenced': influenced,
        'leaderFollowAvgBias': round((bias_total / influenced) if influenced else 0.0, 8),
        'leaderTopIds': [f"{row['venue']}:{row['leaderId']}" for row in top_leaders[:5]],
        'topLeaders': top_leaders,
        'activityRows': len(activity_rows),
        'seedRows': len([row for row in activity_rows if str(row.get('source')) == 'seed']),
        'syntheticCloseViolations': int(synthetic_violations),
        'guardOk': guard_ok,
    }
    write_json(LEADER_OUTPUT_PATH, summary)
    append_json_line(
        LEADER_LOG_PATH,
        {
            'at': now_value,
            'event': 'leader_follow',
            'mode': mode_current,
            'requestedMode': mode_requested,
            'promoted': promoted,
            'demoted': demoted,
            'leaderUniverseSize': len(sorted_leaders),
            'learningSamples': learning_samples,
            'rollingEdgeUsd': round(rolling_edge, 8),
            'leaderCandidatesInfluenced': influenced,
            'leaderFollowAvgBias': summary['leaderFollowAvgBias'],
            'leaderTopIds': summary['leaderTopIds'],
            'activityRows': len(activity_rows),
            'seedRows': summary['seedRows'],
            'syntheticCloseViolations': int(synthetic_violations),
            'guardOk': guard_ok,
        },
    )
    return summary


def load_polymarket_payload() -> Any:
    headers: dict[str, str] = {}
    if POLYMARKET_API_KEY:
        headers['Authorization'] = f'Bearer {POLYMARKET_API_KEY}'

    market_attempts = [
        normalize_url(POLYMARKET_GAMMA_BASE_URL, '/markets?active=true&closed=false&limit=500'),
        normalize_url(POLYMARKET_GAMMA_BASE_URL, '/markets?active=true&limit=500'),
        normalize_url(POLYMARKET_GAMMA_BASE_URL, '/markets'),
    ]
    last_error: Exception | None = None
    payload: Any = None
    for url in market_attempts:
        if not url:
            continue
        try:
            payload = request_json(url, headers=headers)
            break
        except Exception as exc:
            last_error = exc
    if payload is None:
        raise RuntimeError(str(last_error)[:300] if last_error else 'polymarket_fetch_failed')

    records = first_array(payload)
    clob_lookups = 0
    for record in records:
        if clob_lookups >= MAX_POLYMARKET_CLOB_LOOKUPS:
            break
        token_id = extract_polymarket_token_id(record)
        if not token_id:
            continue
        orderbook_urls = [
            normalize_url(POLYMARKET_CLOB_BASE_URL, f'/book?token_id={urllib.parse.quote(token_id)}'),
            normalize_url(POLYMARKET_CLOB_BASE_URL, f'/orderbook?token_id={urllib.parse.quote(token_id)}'),
            normalize_url(POLYMARKET_CLOB_BASE_URL, f'/book?tokenId={urllib.parse.quote(token_id)}'),
        ]
        for orderbook_url in orderbook_urls:
            if not orderbook_url:
                continue
            try:
                orderbook_payload = request_json(orderbook_url, headers=headers)
                if isinstance(orderbook_payload, dict):
                    record['_kamiyo_agent_orderbook'] = orderbook_payload
                clob_lookups += 1
                break
            except Exception:
                continue

    return {'markets': records}


def load_limitless_payload() -> Any:
    headers: dict[str, str] = {}
    if LIMITLESS_API_KEY:
        headers['X-API-Key'] = LIMITLESS_API_KEY
    attempts = [
        normalize_url(LIMITLESS_API_BASE_URL, '/markets/active'),
        normalize_url(LIMITLESS_API_BASE_URL, '/markets/search'),
        normalize_url(LIMITLESS_API_BASE_URL, '/feed'),
    ]
    last_error: Exception | None = None
    for url in attempts:
        if not url:
            continue
        try:
            return request_json(url, headers=headers)
        except Exception as exc:
            last_error = exc
    raise RuntimeError(str(last_error)[:300] if last_error else 'limitless_fetch_failed')


def load_kalshi_payload() -> Any:
    headers: dict[str, str] = {}
    if KALSHI_API_KEY_ID:
        headers['KALSHI-API-KEY'] = KALSHI_API_KEY_ID
    attempts = [
        normalize_url(KALSHI_API_BASE_URL, '/markets'),
        normalize_url(KALSHI_API_BASE_URL, '/events'),
    ]
    last_error: Exception | None = None
    for url in attempts:
        if not url:
            continue
        try:
            return request_json(url, headers=headers)
        except Exception as exc:
            last_error = exc
    raise RuntimeError(str(last_error)[:300] if last_error else 'kalshi_fetch_failed')


def load_singularity_payload() -> Any:
    if not SINGULARITY_API_BASE_URL:
        raise RuntimeError('missing_singularity_api_base_url')
    headers = build_singularity_headers()
    market_url = normalize_url(SINGULARITY_API_BASE_URL, '/api/markets')
    positions_url = normalize_url(SINGULARITY_API_BASE_URL, '/api/positions')
    markets_payload = request_json(market_url, headers=headers)
    markets = first_array(markets_payload)
    positions_payload: Any = {}
    try:
        positions_payload = request_json(positions_url, headers=headers)
    except Exception:
        positions_payload = {'positions': []}
    positions = first_array(positions_payload)
    positions_by_market: dict[str, dict[str, Any]] = {}
    for row in positions:
        market_id = pick_string(row, ['marketId', 'market_id', 'id', 'slug'])
        if market_id and market_id not in positions_by_market:
            positions_by_market[market_id] = row

    orderbook_lookups = 0
    for record in markets:
        if orderbook_lookups >= MAX_SINGULARITY_ORDERBOOK_LOOKUPS:
            break
        market_id = pick_string(record, ['marketId', 'market_id', 'id', 'slug'])
        if not market_id:
            continue
        orderbook_urls = [
            normalize_url(SINGULARITY_API_BASE_URL, f'/api/markets/{urllib.parse.quote(market_id)}/orderbook'),
            normalize_url(SINGULARITY_API_BASE_URL, f'/api/orderbook?marketId={urllib.parse.quote(market_id)}'),
        ]
        for orderbook_url in orderbook_urls:
            if not orderbook_url:
                continue
            try:
                orderbook_payload = request_json(orderbook_url, headers=headers)
                if isinstance(orderbook_payload, dict):
                    record['_kamiyo_agent_orderbook'] = orderbook_payload
                    orderbook_lookups += 1
                break
            except Exception:
                continue
        if market_id in positions_by_market:
            record['_kamiyo_agent_position'] = positions_by_market[market_id]
    return {'markets': markets, 'positions': positions}


def load_venue_payload(venue: str) -> Any:
    if venue == 'polymarket':
        return load_polymarket_payload()
    if venue == 'limitless':
        return load_limitless_payload()
    if venue == 'kalshi':
        return load_kalshi_payload()
    if venue == 'singularity':
        return load_singularity_payload()
    raise RuntimeError(f'unsupported_venue:{venue}')


def normalize_candidate(venue: str, record: dict[str, Any], index: int) -> dict[str, Any] | None:
    market_id = pick_string(record, ['marketId', 'market_id', 'id', 'ticker', 'slug', 'symbol', 'conditionId'])
    title = pick_string(record, ['title', 'question', 'name', 'market', 'label']) or f'{venue} market {index + 1}'
    if venue == 'limitless':
        trade_type = pick_string(record, ['tradeType', 'trade_type']).strip().lower()
        if trade_type and trade_type != 'clob':
            return None
        slug = pick_string(record, ['slug', 'marketSlug', 'market_slug'])
        if slug:
            market_id = slug
    if venue == 'singularity':
        slug = pick_string(record, ['slug', 'marketSlug', 'market_slug'])
        if slug:
            market_id = slug

    yes_price, _ = extract_price_pair(record)
    midpoint = yes_price if yes_price is not None else pick_number(record, ['midPrice', 'mid_price', 'probability', 'yesPrice', 'price', 'mid'])
    if midpoint is None:
        midpoint = 0.5
    midpoint = clamp(midpoint, 0.0, 1.0)

    spread = pick_number(record, ['spread', 'spreadBps', 'edgeSpread', 'halfSpread'])
    if spread is None:
        bid = pick_number(record, ['bestBid', 'bid', 'yesBid'])
        ask = pick_number(record, ['bestAsk', 'ask', 'yesAsk'])
        orderbook = record.get('_kamiyo_agent_orderbook') if isinstance(record.get('_kamiyo_agent_orderbook'), dict) else None
        if orderbook is not None:
            ob_bid, ob_ask = best_bid_ask(orderbook)
            if ob_bid is not None:
                bid = ob_bid
            if ob_ask is not None:
                ask = ob_ask
        if bid is not None and ask is not None and ask >= bid:
            spread = ask - bid
        else:
            spread = 0.01
    if venue == 'limitless':
        spread = max(spread, 0.02)
    if venue == 'polymarket':
        spread = max(spread, 0.015)
    if venue == 'singularity':
        spread = max(spread, 0.0125)
    spread = max(0.0, spread)

    fees = max(
        0.0,
        pick_number(record, ['feesEstimate', 'feeEstimate', 'fee', 'takerFeeUsd', 'estimatedFeesUsd']) or 0.0,
    )
    liquidity = max(
        0.0,
        pick_number(record, ['liquidityUsd', 'volumeUsd24h', 'volume', 'openInterestUsd', 'liquidity']) or 0.0,
    )
    if liquidity <= 0:
        liquidity = orderbook_depth_usd(record.get('_kamiyo_agent_orderbook'))
    fill_probability = pick_number(record, ['fillProbability', 'fill_prob', 'fill_probability'])
    if fill_probability is None:
        fill_probability = clamp(0.25 + (liquidity / 250_000.0), 0.2, 0.98)
    fill_probability = clamp(fill_probability, 0.0, 1.0)

    explicit_edge = pick_number(record, ['edgeEstimate', 'expectedEdge', 'edge', 'edgeUsd'])
    if explicit_edge is not None:
        edge_estimate = explicit_edge
    elif venue == 'polymarket':
        liquidity_term = min(0.14, math.log10(max(1.0, liquidity + 1.0)) / 18.0)
        edge_estimate = max(0.0, (abs(0.5 - midpoint) * 0.5) + (spread * 0.25) + liquidity_term)
    elif venue == 'limitless':
        liquidity_term = min(0.12, math.log10(max(1.0, liquidity + 1.0)) / 20.0)
        edge_estimate = max(0.0, (abs(0.5 - midpoint) * 0.45) + (spread * 0.2) + liquidity_term)
    elif venue == 'singularity':
        liquidity_term = min(0.1, math.log10(max(1.0, liquidity + 1.0)) / 24.0)
        edge_estimate = max(0.0, (abs(0.5 - midpoint) * 0.42) + (spread * 0.18) + liquidity_term)
    else:
        edge_estimate = max(0.0, (abs(0.5 - midpoint) * 0.25) + (spread * 0.1))

    expected_slippage = max(
        0.0,
        pick_number(record, ['expectedSlippage', 'slippageEstimate', 'slippageUsd']) or spread * 0.35,
    )
    expected_net = (edge_estimate * fill_probability) - fees - expected_slippage
    confidence = clamp(
        pick_number(record, ['confidence', 'score']) or (0.35 + fill_probability * 0.45 + min(edge_estimate, 1.0) * 0.2),
        0.01,
        0.99,
    )
    time_to_expiry_minutes = parse_time_to_expiry_minutes(record)
    direction = normalize_direction_from_midpoint(midpoint)
    kind = 'signal' if venue == 'kalshi' else 'trade_candidate'

    if kind == 'trade_candidate':
        if expected_net < MIN_EXPECTED_NET_USD:
            return None
        if fill_probability < MIN_FILL_PROB:
            return None
        if liquidity < MIN_MARKET_LIQUIDITY_USD:
            return None
        if time_to_expiry_minutes is not None and time_to_expiry_minutes < MIN_TIME_TO_EXPIRY_MIN:
            return None
        if time_to_expiry_minutes is not None and time_to_expiry_minutes > MAX_TIME_TO_EXPIRY_MIN:
            return None

    identifier = to_stable_id(venue, market_id, title, index)
    at = now_iso()
    metadata: dict[str, Any] = {
        'midpoint': round(midpoint, 8),
        'liquidityUsd': round(liquidity, 8),
        'timeToExpiryMin': time_to_expiry_minutes,
        'direction': direction,
        'eventCluster': normalize_event_cluster(venue, title, record),
        'marketplaceRecord': compact_record(record),
    }
    if venue == 'polymarket':
        yes_token, no_token = extract_polymarket_token_ids(record)
        selected_token = yes_token if direction == 'yes' else no_token
        if not selected_token:
            selected_token = yes_token or no_token or extract_polymarket_token_id(record)
        tick_size = pick_number(record, ['orderPriceMinTickSize', 'tickSize', 'tick_size', 'minimumTickSize'])
        if tick_size is None or tick_size <= 0:
            tick_size = 0.001
        metadata.update(
            {
                'polymarketTokenId': selected_token,
                'polymarketTokenIds': {'yes': yes_token, 'no': no_token},
                'polymarketConditionId': pick_string(record, ['conditionId', 'condition_id']),
                'polymarketNegRisk': parse_bool(record.get('negRisk'), False),
                'polymarketTickSize': round(float(tick_size), 8),
            }
        )
    elif venue == 'limitless':
        tokens = parse_jsonish(record.get('tokens'))
        yes_token = ''
        no_token = ''
        if isinstance(tokens, dict):
            yes_token = pick_string(tokens, ['yes', 'YES'])
            no_token = pick_string(tokens, ['no', 'NO'])
        if not yes_token and not no_token:
            position_ids = []
            for key in ('positionIds', 'position_ids', 'tokenIds'):
                position_ids = parse_string_array(record.get(key))
                if position_ids:
                    break
            if position_ids:
                yes_token = position_ids[0]
                if len(position_ids) > 1:
                    no_token = position_ids[1]
        selected_token = yes_token if direction == 'yes' else no_token
        if not selected_token:
            selected_token = yes_token or no_token
        market_slug = pick_string(record, ['slug', 'marketSlug', 'market_slug'])
        if not market_slug or not selected_token:
            return None
        metadata.update(
            {
                'limitlessMarketSlug': market_slug,
                'limitlessTokenId': selected_token,
                'limitlessTokenIds': {'yes': yes_token, 'no': no_token},
                'limitlessTradeType': pick_string(record, ['tradeType', 'trade_type']).strip().lower(),
            }
        )
    elif venue == 'singularity':
        metadata.update(
            {
                'singularityMarketId': market_id or identifier,
                'singularityPositionHint': compact_record(
                    record.get('_kamiyo_agent_position')
                    if isinstance(record.get('_kamiyo_agent_position'), dict)
                    else {}
                ),
            }
        )

    return {
        'id': identifier,
        'source': 'trading',
        'venue': venue,
        'kind': kind,
        'marketId': market_id or identifier,
        'title': title,
        'summary': f'{venue} opportunity candidate for market-making edge execution.',
        'confidence': round(confidence, 6),
        'edgeEstimate': round(edge_estimate, 8),
        'fillProbability': round(fill_probability, 8),
        'expectedSlippage': round(expected_slippage, 8),
        'feesEstimate': round(fees, 8),
        'expectedNetUsd': round(expected_net, 8),
        'createdAt': at,
        'metadata': metadata,
    }


def apply_kalshi_signal_influence(opportunities: list[dict[str, Any]]) -> None:
    signals = [
        item for item in opportunities
        if item.get('venue') == 'kalshi' and item.get('kind') == 'signal' and isinstance(item, dict)
    ]
    trades = [
        item for item in opportunities
        if item.get('kind') == 'trade_candidate' and item.get('venue') in {'polymarket', 'limitless', 'singularity'} and isinstance(item, dict)
    ]
    if not signals or not trades:
        return

    signal_rows: list[dict[str, Any]] = []
    for signal in signals:
        signal_title = str(signal.get('title') or '')
        signal_tokens = tokenize_theme(signal_title)
        metadata = signal.get('metadata') if isinstance(signal.get('metadata'), dict) else {}
        signal_direction = str(metadata.get('direction') or '').strip().lower() or 'unknown'
        signal_rows.append(
            {
                'id': str(signal.get('id') or ''),
                'marketId': str(signal.get('marketId') or ''),
                'tokens': signal_tokens,
                'direction': signal_direction,
            }
        )

    for trade in trades:
        title = str(trade.get('title') or '')
        trade_tokens = tokenize_theme(title)
        if not trade_tokens:
            continue

        best_signal: dict[str, Any] | None = None
        best_overlap = 0
        for signal in signal_rows:
            overlap = len(trade_tokens & signal['tokens'])
            if overlap > best_overlap:
                best_overlap = overlap
                best_signal = signal
        if best_signal is None or best_overlap == 0:
            continue

        trade_metadata = trade.get('metadata') if isinstance(trade.get('metadata'), dict) else {}
        trade_direction = str(trade_metadata.get('direction') or '').strip().lower() or 'unknown'
        signal_direction = str(best_signal.get('direction') or 'unknown').strip().lower()

        confidence_before = parse_float(trade.get('confidence'), 0.0)
        multiplier = 1.0
        alignment = 'neutral'
        if signal_direction != 'unknown' and trade_direction != 'unknown':
            if signal_direction == trade_direction:
                multiplier = KALSHI_ALIGN_MULTIPLIER
                alignment = 'aligned'
            else:
                multiplier = KALSHI_CONFLICT_MULTIPLIER
                alignment = 'conflicting'

        confidence_after = round(clamp(confidence_before * multiplier, 0.01, 0.99), 6)
        trade['confidence'] = confidence_after

        influence = {
            'signalId': best_signal.get('id'),
            'signalMarketId': best_signal.get('marketId'),
            'alignment': alignment,
            'overlapTokens': best_overlap,
            'confidenceBefore': round(confidence_before, 6),
            'confidenceAfter': confidence_after,
        }
        trade_metadata['kalshiSignalInfluence'] = influence
        trade['metadata'] = trade_metadata


def apply_event_cluster_concentration_cap(
    opportunities: list[dict[str, Any]],
    max_exposure_pct: float,
) -> tuple[list[dict[str, Any]], int]:
    trade_rows = [
        row
        for row in opportunities
        if isinstance(row, dict) and str(row.get('kind') or '').strip().lower() == 'trade_candidate'
    ]
    total_trade_rows = len(trade_rows)
    if total_trade_rows <= 1:
        return opportunities, 0
    if max_exposure_pct >= 100.0:
        return opportunities, 0

    max_per_cluster = max(1, int(math.ceil(total_trade_rows * (max_exposure_pct / 100.0))))
    kept: list[dict[str, Any]] = []
    cluster_counts: dict[str, int] = {}
    dropped = 0

    for row in opportunities:
        if not isinstance(row, dict):
            continue
        kind = str(row.get('kind') or '').strip().lower()
        if kind != 'trade_candidate':
            kept.append(row)
            continue
        metadata = row.get('metadata') if isinstance(row.get('metadata'), dict) else {}
        cluster = str(metadata.get('eventCluster') or '').strip().lower()
        if not cluster:
            cluster = normalize_event_cluster(
                str(row.get('venue') or 'unknown'),
                str(row.get('title') or ''),
                metadata,
            ).lower()
        count = cluster_counts.get(cluster, 0)
        if count >= max_per_cluster:
            dropped += 1
            continue
        cluster_counts[cluster] = count + 1
        kept.append(row)

    return kept, dropped


def limit_with_venue_round_robin(
    opportunities: list[dict[str, Any]],
    venues: list[str],
    max_items: int,
) -> list[dict[str, Any]]:
    if max_items <= 0 or not opportunities:
        return []

    grouped: dict[str, list[dict[str, Any]]] = {}
    for item in opportunities:
        venue = str(item.get('venue') or '').strip().lower() or 'unknown'
        grouped.setdefault(venue, []).append(item)

    venue_order = [venue for venue in venues if venue in grouped]
    for venue in grouped:
        if venue not in venue_order:
            venue_order.append(venue)

    cursors = {venue: 0 for venue in venue_order}
    selected: list[dict[str, Any]] = []
    while len(selected) < max_items:
        advanced = False
        for venue in venue_order:
            rows = grouped.get(venue) or []
            cursor = cursors.get(venue, 0)
            if cursor >= len(rows):
                continue
            selected.append(rows[cursor])
            cursors[venue] = cursor + 1
            advanced = True
            if len(selected) >= max_items:
                break
        if not advanced:
            break
    return selected


def run() -> int:
    ensure_dirs()
    started_at = now_iso()
    prior_state = read_json_file(STATE_PATH, {})
    if not isinstance(prior_state, dict):
        prior_state = {}
    prior_streaks = prior_state.get('venueCandidateStreaks')
    if not isinstance(prior_streaks, dict):
        prior_streaks = {}

    if not ENABLE_TRADING_AGENT:
        summary = {
            'ok': True,
            'status': 'disabled',
            'reason': 'trading_agent_disabled',
            'startedAt': started_at,
            'at': now_iso(),
            'venues': VENUES,
            'feedPath': str(FEED_PATH),
        }
        write_json(STATE_PATH, {'lastRunAt': summary['at'], 'lastStatus': summary})
        write_json(OUTPUT_PATH, summary)
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    discovered = 0
    opportunities: list[dict[str, Any]] = []
    source_stats: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    records_by_venue: dict[str, list[dict[str, Any]]] = {}

    for venue in VENUES:
        if venue not in {'polymarket', 'limitless', 'kalshi', 'singularity'}:
            errors.append({'venue': venue, 'error': 'unsupported_venue'})
            source_stats.append({'venue': venue, 'discovered': 0, 'accepted': 0, 'error': 'unsupported_venue'})
            continue
        try:
            payload = load_venue_payload(venue)
            records = first_array(payload)
            records_by_venue[venue] = records
            discovered += len(records)
            venue_candidates: list[dict[str, Any]] = []
            for index, record in enumerate(records):
                candidate = normalize_candidate(venue, record, index)
                if candidate is None:
                    continue
                venue_candidates.append(candidate)
            opportunities.extend(venue_candidates)
            source_stats.append(
                {
                    'venue': venue,
                    'discovered': len(records),
                    'accepted': len(venue_candidates),
                }
            )
        except Exception as exc:
            message = str(exc).strip() or 'venue_fetch_failed'
            errors.append({'venue': venue, 'error': message[:300]})
            source_stats.append({'venue': venue, 'discovered': 0, 'accepted': 0, 'error': message[:300]})
            records_by_venue[venue] = []

    apply_kalshi_signal_influence(opportunities)
    leader_follow_summary = apply_leader_follow_influence(opportunities, records_by_venue)
    opportunities, concentration_filtered = apply_event_cluster_concentration_cap(
        opportunities,
        MAX_EVENT_CLUSTER_EXPOSURE_PCT,
    )
    opportunities = limit_with_venue_round_robin(opportunities, VENUES, MAX_OPPORTUNITIES)
    accepted = len(opportunities)

    polymarket_candidates = len([row for row in opportunities if row.get('venue') == 'polymarket' and row.get('kind') == 'trade_candidate'])
    limitless_candidates = len([row for row in opportunities if row.get('venue') == 'limitless' and row.get('kind') == 'trade_candidate'])
    singularity_candidates = len([row for row in opportunities if row.get('venue') == 'singularity' and row.get('kind') == 'trade_candidate'])
    kalshi_signals = len([row for row in opportunities if row.get('venue') == 'kalshi' and row.get('kind') == 'signal'])
    venue_candidate_counts = {
        'polymarket': polymarket_candidates,
        'limitless': limitless_candidates,
    }
    venue_candidate_streaks: dict[str, int] = {}
    for venue, count in venue_candidate_counts.items():
        previous = int(parse_float(prior_streaks.get(venue), 0.0))
        if venue in VENUES:
            venue_candidate_streaks[venue] = 0 if count > 0 else max(0, previous) + 1
        else:
            venue_candidate_streaks[venue] = 0
    warnings: list[str] = []
    if (
        'polymarket' in VENUES
        and venue_candidate_streaks.get('polymarket', 0) >= VENUE_CANDIDATE_STARVATION_TICKS
    ):
        warnings.append('venue_candidate_starvation_polymarket')
    if (
        'limitless' in VENUES
        and venue_candidate_streaks.get('limitless', 0) >= VENUE_CANDIDATE_STARVATION_TICKS
    ):
        warnings.append('venue_candidate_starvation_limitless')
    warnings = sorted(dict.fromkeys(warnings))
    status = 'degraded' if errors or warnings else 'ok'
    feed_payload = {
        'ok': len(errors) == 0,
        'status': status,
        'at': now_iso(),
        'startedAt': started_at,
        'source': 'kamiyo_agent_trading_feed_v3',
        'discovered': discovered,
        'accepted': accepted,
        'venues': VENUES,
        'opportunities': opportunities,
        'sourceStats': source_stats,
        'leaderFollow': leader_follow_summary,
        'eventClusterConcentrationFiltered': concentration_filtered,
        'maxEventClusterExposurePct': MAX_EVENT_CLUSTER_EXPOSURE_PCT,
        'warnings': warnings,
        'venueCandidateStreaks': venue_candidate_streaks,
        'venueCandidateStarvationTicks': VENUE_CANDIDATE_STARVATION_TICKS,
        'deprecatedAliases': {
            'dflowCandidates': 0,
            'sapienceCandidates': 0,
        },
    }
    write_json(FEED_PATH, feed_payload)

    summary = {
        'ok': len(errors) == 0,
        'status': status,
        'startedAt': started_at,
        'at': now_iso(),
        'feedPath': str(FEED_PATH),
        'discovered': discovered,
        'accepted': accepted,
        'venues': VENUES,
        'polymarketCandidates': polymarket_candidates,
        'limitlessCandidates': limitless_candidates,
        'singularityPaperCandidates': singularity_candidates,
        'kalshiSignals': kalshi_signals,
        'eventClusterConcentrationFiltered': concentration_filtered,
        'maxEventClusterExposurePct': MAX_EVENT_CLUSTER_EXPOSURE_PCT,
        'dflowCandidates': 0,
        'sapienceCandidates': 0,
        'deprecatedAliases': ['dflowCandidates', 'sapienceCandidates'],
        'sourceStats': source_stats,
        'errors': errors,
        'warnings': warnings,
        'venueCandidateStreaks': venue_candidate_streaks,
        'venueCandidateStarvationTicks': VENUE_CANDIDATE_STARVATION_TICKS,
    }
    if isinstance(leader_follow_summary, dict):
        summary.update(
            {
                'leaderFollowEnabled': LEADER_FOLLOW_ENABLED,
                'leaderFollowMode': str(leader_follow_summary.get('mode') or ''),
                'leaderCandidatesInfluenced': int(parse_float(leader_follow_summary.get('leaderCandidatesInfluenced'), 0.0)),
                'leaderUniverseSize': int(parse_float(leader_follow_summary.get('leaderUniverseSize'), 0.0)),
                'leaderTopIds': leader_follow_summary.get('leaderTopIds') if isinstance(leader_follow_summary.get('leaderTopIds'), list) else [],
                'leaderFollowAvgBias': round(parse_float(leader_follow_summary.get('leaderFollowAvgBias'), 0.0), 8),
                'leaderFollowPromotedAt': str(leader_follow_summary.get('promotedAt') or ''),
            }
        )
    else:
        summary.update(
            {
                'leaderFollowEnabled': LEADER_FOLLOW_ENABLED,
                'leaderFollowMode': 'disabled',
                'leaderCandidatesInfluenced': 0,
                'leaderUniverseSize': 0,
                'leaderTopIds': [],
                'leaderFollowAvgBias': 0.0,
                'leaderFollowPromotedAt': '',
            }
        )
    write_json(
        STATE_PATH,
        {
            'lastRunAt': summary['at'],
            'venueCandidateStreaks': venue_candidate_streaks,
            'lastStatus': summary,
        },
    )
    write_json(OUTPUT_PATH, summary)
    append_json_line(
        LOG_PATH,
        {
            'at': summary['at'],
            'event': 'trading_feed',
            'ok': summary['ok'],
            'status': summary['status'],
            'discovered': summary['discovered'],
            'accepted': summary['accepted'],
            'polymarketCandidates': polymarket_candidates,
            'limitlessCandidates': limitless_candidates,
            'singularityPaperCandidates': singularity_candidates,
            'kalshiSignals': kalshi_signals,
            'eventClusterConcentrationFiltered': concentration_filtered,
            'dflowCandidates': 0,
            'sapienceCandidates': 0,
            'leaderFollowMode': summary.get('leaderFollowMode'),
            'leaderCandidatesInfluenced': summary.get('leaderCandidatesInfluenced'),
            'leaderUniverseSize': summary.get('leaderUniverseSize'),
            'leaderFollowAvgBias': summary.get('leaderFollowAvgBias'),
            'errors': errors,
            'warnings': warnings,
            'venueCandidateStreaks': venue_candidate_streaks,
        },
    )
    print(json.dumps(summary, ensure_ascii=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(run())
