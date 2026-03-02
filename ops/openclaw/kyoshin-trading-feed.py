#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import math
import os
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

HOME_DIR = Path(os.environ.get('HOME', '~')).expanduser()
WORKSPACE = HOME_DIR / '.openclaw' / 'workspace'
RUNTIME_DIR = WORKSPACE / 'runtime'
STATE_DIR = RUNTIME_DIR / 'state'
FEEDS_DIR = RUNTIME_DIR / 'feeds'
LOG_DIR = RUNTIME_DIR / 'logs'

FEED_PATH = FEEDS_DIR / 'trading-opportunities.json'
STATE_PATH = STATE_DIR / 'trading-feed-state.json'
OUTPUT_PATH = STATE_DIR / 'trading-feed.json'
LOG_PATH = LOG_DIR / 'trading-feed.jsonl'


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
VENUES = [
    item.strip().lower()
    for item in os.getenv('KYO_TRADING_VENUES', 'polymarket,limitless,kalshi').split(',')
    if item.strip()
]
MAX_OPPORTUNITIES = max(1, min(500, env_int('KYO_TRADING_MAX_OPPORTUNITIES', 80)))
MIN_EXPECTED_NET_USD = env_float('KYO_TRADING_MIN_EDGE_USD', 0.05)
MIN_FILL_PROB = max(0.0, min(1.0, env_float('KYO_TRADING_MIN_FILL_PROB', 0.55)))
MIN_MARKET_LIQUIDITY_USD = max(0.0, env_float('KYO_TRADING_MIN_MARKET_LIQUIDITY_USD', 10_000.0))
MIN_TIME_TO_EXPIRY_MIN = max(0.0, env_float('KYO_TRADING_MIN_TIME_TO_EXPIRY_MIN', 45.0))
HTTP_TIMEOUT_SECONDS = max(3, min(60, env_int('KYO_TRADING_FEED_TIMEOUT_SECONDS', 15)))
ALLOW_INSECURE_HTTP = env_bool('KYO_ALLOW_INSECURE_HTTP_FEEDS', False)
MAX_POLYMARKET_CLOB_LOOKUPS = max(0, min(250, env_int('KYO_TRADING_POLYMARKET_CLOB_LOOKUPS', 60)))

POLYMARKET_GAMMA_BASE_URL = os.getenv('KYO_TRADING_POLYMARKET_GAMMA_BASE_URL', 'https://gamma-api.polymarket.com').strip().rstrip('/')
POLYMARKET_CLOB_BASE_URL = os.getenv('KYO_TRADING_POLYMARKET_CLOB_BASE_URL', 'https://clob.polymarket.com').strip().rstrip('/')
POLYMARKET_API_KEY = os.getenv('KYO_TRADING_POLYMARKET_API_KEY', '').strip()
LIMITLESS_API_BASE_URL = os.getenv('KYO_TRADING_LIMITLESS_API_BASE_URL', 'https://api.limitless.exchange').strip().rstrip('/')
LIMITLESS_API_KEY = os.getenv('KYO_TRADING_LIMITLESS_API_KEY', '').strip()
KALSHI_API_BASE_URL = os.getenv('KYO_TRADING_KALSHI_API_BASE_URL', 'https://api.elections.kalshi.com/trade-api/v2').strip().rstrip('/')
KALSHI_API_KEY_ID = os.getenv('KYO_TRADING_KALSHI_API_KEY_ID', '').strip()

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
    for path in (WORKSPACE, RUNTIME_DIR, STATE_DIR, FEEDS_DIR, LOG_DIR):
        path.mkdir(parents=True, exist_ok=True)
        path.chmod(0o700)


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
            'User-Agent': 'kyoshin-trading-feed/2.0',
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


def extract_price_pair(record: dict[str, Any]) -> tuple[float | None, float | None]:
    for key in ('prices', 'outcomePrices', 'outcome_prices', 'probabilities'):
        value = parse_jsonish(record.get(key))
        if isinstance(value, list) and len(value) >= 2:
            yes_price = parse_float(value[0], float('nan'))
            no_price = parse_float(value[1], float('nan'))
            if yes_price == yes_price and no_price == no_price:
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
    for key in ('endDate', 'expirationDate', 'endTime', 'expiry', 'expiresAt'):
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
                    record['_kyoshin_orderbook'] = orderbook_payload
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


def load_venue_payload(venue: str) -> Any:
    if venue == 'polymarket':
        return load_polymarket_payload()
    if venue == 'limitless':
        return load_limitless_payload()
    if venue == 'kalshi':
        return load_kalshi_payload()
    raise RuntimeError(f'unsupported_venue:{venue}')


def normalize_candidate(venue: str, record: dict[str, Any], index: int) -> dict[str, Any] | None:
    market_id = pick_string(record, ['marketId', 'market_id', 'id', 'ticker', 'slug', 'symbol', 'conditionId'])
    title = pick_string(record, ['title', 'question', 'name', 'market', 'label']) or f'{venue} market {index + 1}'

    yes_price, _ = extract_price_pair(record)
    midpoint = yes_price if yes_price is not None else pick_number(record, ['midPrice', 'mid_price', 'probability', 'yesPrice', 'price', 'mid'])
    if midpoint is None:
        midpoint = 0.5
    midpoint = clamp(midpoint, 0.0, 1.0)

    spread = pick_number(record, ['spread', 'spreadBps', 'edgeSpread', 'halfSpread'])
    if spread is None:
        bid = pick_number(record, ['bestBid', 'bid', 'yesBid'])
        ask = pick_number(record, ['bestAsk', 'ask', 'yesAsk'])
        orderbook = record.get('_kyoshin_orderbook') if isinstance(record.get('_kyoshin_orderbook'), dict) else None
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
    spread = max(0.0, spread)

    fees = max(
        0.0,
        pick_number(record, ['feesEstimate', 'feeEstimate', 'fee', 'takerFeeUsd', 'estimatedFeesUsd']) or 0.0,
    )
    liquidity = max(
        0.0,
        pick_number(record, ['liquidityUsd', 'volumeUsd24h', 'volume', 'openInterestUsd', 'liquidity']) or 0.0,
    )
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

    identifier = to_stable_id(venue, market_id, title, index)
    at = now_iso()
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
        'metadata': {
            'midpoint': round(midpoint, 8),
            'liquidityUsd': round(liquidity, 8),
            'timeToExpiryMin': time_to_expiry_minutes,
            'direction': direction,
            'marketplaceRecord': compact_record(record),
        },
    }


def apply_kalshi_signal_influence(opportunities: list[dict[str, Any]]) -> None:
    signals = [
        item for item in opportunities
        if item.get('venue') == 'kalshi' and item.get('kind') == 'signal' and isinstance(item, dict)
    ]
    trades = [
        item for item in opportunities
        if item.get('kind') == 'trade_candidate' and item.get('venue') in {'polymarket', 'limitless'} and isinstance(item, dict)
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


def run() -> int:
    ensure_dirs()
    started_at = now_iso()

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

    for venue in VENUES:
        if venue not in {'polymarket', 'limitless', 'kalshi'}:
            errors.append({'venue': venue, 'error': 'unsupported_venue'})
            source_stats.append({'venue': venue, 'discovered': 0, 'accepted': 0, 'error': 'unsupported_venue'})
            continue
        try:
            payload = load_venue_payload(venue)
            records = first_array(payload)
            discovered += len(records)
            venue_candidates: list[dict[str, Any]] = []
            for index, record in enumerate(records):
                candidate = normalize_candidate(venue, record, index)
                if candidate is None:
                    continue
                venue_candidates.append(candidate)
                if len(opportunities) + len(venue_candidates) >= MAX_OPPORTUNITIES:
                    break
            opportunities.extend(venue_candidates)
            source_stats.append(
                {
                    'venue': venue,
                    'discovered': len(records),
                    'accepted': len(venue_candidates),
                }
            )
            if len(opportunities) >= MAX_OPPORTUNITIES:
                break
        except Exception as exc:
            message = str(exc).strip() or 'venue_fetch_failed'
            errors.append({'venue': venue, 'error': message[:300]})
            source_stats.append({'venue': venue, 'discovered': 0, 'accepted': 0, 'error': message[:300]})

    opportunities = opportunities[:MAX_OPPORTUNITIES]
    apply_kalshi_signal_influence(opportunities)
    accepted = len(opportunities)

    feed_payload = {
        'ok': len(errors) == 0,
        'at': now_iso(),
        'startedAt': started_at,
        'source': 'kyoshin_trading_feed_v2',
        'discovered': discovered,
        'accepted': accepted,
        'venues': VENUES,
        'opportunities': opportunities,
        'sourceStats': source_stats,
        'deprecatedAliases': {
            'dflowCandidates': 0,
            'sapienceCandidates': 0,
        },
    }
    write_json(FEED_PATH, feed_payload)

    polymarket_candidates = len([row for row in opportunities if row.get('venue') == 'polymarket' and row.get('kind') == 'trade_candidate'])
    limitless_candidates = len([row for row in opportunities if row.get('venue') == 'limitless' and row.get('kind') == 'trade_candidate'])
    kalshi_signals = len([row for row in opportunities if row.get('venue') == 'kalshi' and row.get('kind') == 'signal'])

    summary = {
        'ok': len(errors) == 0,
        'status': 'ok' if len(errors) == 0 else 'degraded',
        'startedAt': started_at,
        'at': now_iso(),
        'feedPath': str(FEED_PATH),
        'discovered': discovered,
        'accepted': accepted,
        'venues': VENUES,
        'polymarketCandidates': polymarket_candidates,
        'limitlessCandidates': limitless_candidates,
        'kalshiSignals': kalshi_signals,
        'dflowCandidates': 0,
        'sapienceCandidates': 0,
        'deprecatedAliases': ['dflowCandidates', 'sapienceCandidates'],
        'sourceStats': source_stats,
        'errors': errors,
    }
    write_json(STATE_PATH, {'lastRunAt': summary['at'], 'lastStatus': summary})
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
            'kalshiSignals': kalshi_signals,
            'dflowCandidates': 0,
            'sapienceCandidates': 0,
            'errors': errors,
        },
    )
    print(json.dumps(summary, ensure_ascii=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(run())
