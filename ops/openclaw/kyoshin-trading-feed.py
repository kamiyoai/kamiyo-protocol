#!/usr/bin/env python3
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

HOME_DIR = Path(os.environ.get('HOME', '~')).expanduser()
WORKSPACE = HOME_DIR / '.openclaw' / 'workspace'
RUNTIME_DIR = WORKSPACE / 'runtime'
FEEDS_DIR = RUNTIME_DIR / 'feeds'
STATE_DIR = RUNTIME_DIR / 'state'
LOG_DIR = RUNTIME_DIR / 'logs'

OUTPUT_PATH = FEEDS_DIR / 'trading-opportunities.json'
STATE_PATH = STATE_DIR / 'trading-feed.json'
LOG_PATH = LOG_DIR / 'trading-feed.jsonl'

ENABLE_TRADING_AGENT = os.getenv('KYO_ENABLE_TRADING_AGENT', 'false').strip().lower() in {'1', 'true', 'yes', 'on'}
VENUES = [
    item.strip().lower()
    for item in os.getenv('KYO_TRADING_VENUES', 'dflow,kalshi').split(',')
    if item.strip()
]
KALSHI_SIGNAL_ONLY = os.getenv('KYO_TRADING_KALSHI_SIGNAL_ONLY', 'true').strip().lower() in {'1', 'true', 'yes', 'on'}

DFLOW_API_BASE_URL = os.getenv('KYO_TRADING_DFLOW_API_BASE_URL', 'https://dev-prediction-markets-api.dflow.net').strip().rstrip('/')
DFLOW_MARKETS_PATH = os.getenv('KYO_TRADING_DFLOW_MARKETS_PATH', '/api/v1/markets').strip() or '/api/v1/markets'
DFLOW_API_KEY = os.getenv('KYO_TRADING_DFLOW_API_KEY', '').strip()
DFLOW_MARKETS_STATUS = os.getenv('KYO_TRADING_DFLOW_MARKETS_STATUS', 'active').strip()
DFLOW_MARKETS_LIMIT = max(1, min(200, int(os.getenv('KYO_TRADING_DFLOW_MAX_OPPORTUNITIES', '30'))))

KALSHI_API_BASE_URL = os.getenv('KYO_TRADING_KALSHI_API_BASE_URL', 'https://api.elections.kalshi.com/trade-api/v2').strip().rstrip('/')
KALSHI_MARKETS_PATH = os.getenv('KYO_TRADING_KALSHI_MARKETS_PATH', '/markets').strip() or '/markets'
KALSHI_API_KEY_ID = os.getenv('KYO_TRADING_KALSHI_API_KEY_ID', '').strip()

TIMEOUT_SECONDS = max(3.0, min(45.0, float(os.getenv('KYO_TRADING_FEED_TIMEOUT_SECONDS', '12'))))
MAX_RESPONSE_BYTES = max(5000, min(5_000_000, int(os.getenv('KYO_TRADING_FEED_MAX_RESPONSE_BYTES', '2000000'))))
MAX_DFLOW_OPPORTUNITIES = max(1, min(200, int(os.getenv('KYO_TRADING_DFLOW_MAX_OPPORTUNITIES', '30'))))
MAX_KALSHI_OPPORTUNITIES = max(1, min(200, int(os.getenv('KYO_TRADING_KALSHI_MAX_OPPORTUNITIES', '30'))))
MAX_TOTAL_OPPORTUNITIES = max(1, min(300, int(os.getenv('KYO_TRADING_MAX_TOTAL_OPPORTUNITIES', '48'))))
USER_AGENT = os.getenv('KYO_TRADING_FEED_USER_AGENT', 'kyoshin-trading-feed/1.0').strip() or 'kyoshin-trading-feed/1.0'



def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()



def ensure_dirs() -> None:
    for path in (WORKSPACE, RUNTIME_DIR, FEEDS_DIR, STATE_DIR, LOG_DIR):
        path.mkdir(parents=True, exist_ok=True)
        path.chmod(0o700)



def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + '\n', encoding='utf-8')
    path.chmod(0o600)



def append_json_line(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a', encoding='utf-8') as handle:
        handle.write(json.dumps(payload, ensure_ascii=True) + '\n')
    path.chmod(0o600)



def as_list(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    if isinstance(payload, dict):
        if isinstance(payload.get('items'), list):
            return [row for row in payload['items'] if isinstance(row, dict)]
        if isinstance(payload.get('data'), list):
            return [row for row in payload['data'] if isinstance(row, dict)]
        if isinstance(payload.get('markets'), list):
            return [row for row in payload['markets'] if isinstance(row, dict)]
        if isinstance(payload.get('events'), list):
            out: list[dict[str, Any]] = []
            for event in payload['events']:
                if not isinstance(event, dict):
                    continue
                markets = event.get('markets') if isinstance(event.get('markets'), list) else []
                if not markets:
                    continue
                for market in markets:
                    if not isinstance(market, dict):
                        continue
                    merged = dict(market)
                    if 'eventTicker' not in merged:
                        merged['eventTicker'] = event.get('ticker')
                    if 'eventTitle' not in merged:
                        merged['eventTitle'] = event.get('title')
                    if 'eventVolume' not in merged:
                        merged['eventVolume'] = event.get('volume')
                    out.append(merged)
            if out:
                return out
        if isinstance(payload.get('quotes'), list):
            return [row for row in payload['quotes'] if isinstance(row, dict)]
    return []



def as_string(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if value is None:
        return ''
    return str(value).strip()



def as_float(value: Any) -> Optional[float]:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except Exception:
            return None
    return None



def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))



def compact(value: Any, max_bytes: int = 4500) -> Any:
    try:
        serialized = json.dumps(value, ensure_ascii=True, separators=(',', ':'))
    except Exception:
        return {'truncated': True, 'reason': 'unserializable'}
    if len(serialized) <= max_bytes:
        return value
    return {
        'truncated': True,
        'bytes': len(serialized),
        'preview': serialized[: max_bytes - 3] + '...',
    }



def build_url(base_url: str, path: str, query: Optional[dict[str, Any]] = None) -> str:
    normalized_path = path if path.startswith('/') else f'/{path}'
    url = f'{base_url}{normalized_path}'
    if query:
        query_str = urllib.parse.urlencode({key: value for key, value in query.items() if value not in (None, '')})
        if query_str:
            url = f'{url}?{query_str}'
    return url



def fetch_json(base_url: str, path: str, headers: dict[str, str], query: Optional[dict[str, Any]] = None) -> Any:
    url = build_url(base_url, path, query)
    request = urllib.request.Request(url, headers=headers, method='GET')
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        raw = response.read(MAX_RESPONSE_BYTES + 1)
    if len(raw) > MAX_RESPONSE_BYTES:
        raise ValueError('response_too_large')
    return json.loads(raw.decode('utf-8'))



def dflow_headers() -> dict[str, str]:
    headers = {
        'accept': 'application/json',
        'user-agent': USER_AGENT,
    }
    if DFLOW_API_KEY:
        headers['authorization'] = f'Bearer {DFLOW_API_KEY}'
    return headers



def kalshi_headers() -> dict[str, str]:
    headers = {
        'accept': 'application/json',
        'user-agent': USER_AGENT,
    }
    if KALSHI_API_KEY_ID:
        headers['KALSHI-ACCESS-KEY'] = KALSHI_API_KEY_ID
    return headers



def parse_probability(row: dict[str, Any], keys: list[str]) -> Optional[float]:
    for key in keys:
        value = as_float(row.get(key))
        if value is None:
            continue
        if 0 <= value <= 1:
            return value
        if 1 < value <= 100:
            return value / 100.0
    return None



def build_dflow_opportunities(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    created_at = now_iso()
    opportunities: list[dict[str, Any]] = []

    for idx, row in enumerate(rows[:MAX_DFLOW_OPPORTUNITIES]):
        market_id = as_string(row.get('marketId') or row.get('ticker') or row.get('id') or row.get('questionId')) or f'dflow-{idx + 1}'
        title = as_string(row.get('question') or row.get('title') or row.get('name')) or f'DFlow market {idx + 1}'
        price = parse_probability(
            row,
            [
                'yesAsk',
                'yesBid',
                'yes_ask',
                'yes_bid',
                'yesPrice',
                'probability',
                'price',
                'midPrice',
            ],
        )
        if price is None:
            price = 0.5
        price = clamp(price, 0.01, 0.99)

        volume_usd = as_float(row.get('volumeUsd') or row.get('volume')) or 0.0
        liquidity_usd = as_float(row.get('liquidityUsd') or row.get('liquidity')) or 0.0
        edge_score = abs(price - 0.5) * 2.0

        confidence = clamp(
            0.45 + min(volume_usd / 150000.0, 0.2) + min(liquidity_usd / 150000.0, 0.15) + (edge_score * 0.25),
            0.45,
            0.93,
        )
        suggested_side = 'yes' if price < 0.5 else 'no'
        url = as_string(row.get('url') or row.get('marketUrl')) or f'{DFLOW_API_BASE_URL}/markets/{market_id}'

        opportunities.append(
            {
                'id': f'trading-dflow-{market_id.lower()[:48]}',
                'source': 'trading',
                'title': f'DFlow candidate: {title}',
                'summary': (
                    f"DFlow market candidate with implied probability {price:.3f}, "
                    f"edge score {edge_score:.3f}, and liquidity ${liquidity_usd:,.2f}."
                ),
                'url': url,
                'confidence': confidence,
                'roleHints': ['trading', 'research'],
                'tags': ['trading', 'dflow', 'prediction-market'],
                'payoutUsd': None,
                'payoutSol': None,
                'createdAt': created_at,
                'metadata': {
                    'venue': 'dflow',
                    'marketId': market_id,
                    'kind': 'trade_candidate',
                    'price': round(price, 8),
                    'edgeScore': round(edge_score, 8),
                    'liquidityUsd': round(liquidity_usd, 8),
                    'volumeUsd': round(volume_usd, 8),
                    'suggestedSide': suggested_side,
                    'signalOnly': False,
                    'marketplaceRecord': compact(row),
                },
            }
        )

    return opportunities



def build_kalshi_opportunities(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    created_at = now_iso()
    opportunities: list[dict[str, Any]] = []

    for idx, row in enumerate(rows[:MAX_KALSHI_OPPORTUNITIES]):
        market_id = as_string(row.get('ticker') or row.get('id') or row.get('market_ticker')) or f'kalshi-{idx + 1}'
        title = as_string(row.get('title') or row.get('question') or row.get('event_title')) or f'Kalshi market {idx + 1}'
        yes_ask = parse_probability(row, ['yes_ask', 'yesAsk', 'yes_price', 'yesPrice'])
        yes_bid = parse_probability(row, ['yes_bid', 'yesBid'])
        probability = yes_ask if yes_ask is not None else yes_bid
        if probability is None:
            probability = 0.5
        probability = clamp(probability, 0.01, 0.99)

        volume = as_float(row.get('volume') or row.get('volumeUsd') or row.get('open_interest')) or 0.0
        confidence = clamp(0.4 + min(volume / 200000.0, 0.2) + (abs(probability - 0.5) * 0.22), 0.4, 0.88)

        url = as_string(row.get('url')) or f'{KALSHI_API_BASE_URL}/markets/{market_id}'
        opportunities.append(
            {
                'id': f'trading-kalshi-{market_id.lower()[:48]}',
                'source': 'trading',
                'title': f'Kalshi signal: {title}',
                'summary': (
                    f"Kalshi signal-only market with implied probability {probability:.3f} "
                    f"and volume proxy {volume:,.2f}."
                ),
                'url': url,
                'confidence': confidence,
                'roleHints': ['trading', 'research'],
                'tags': ['trading', 'kalshi', 'prediction-market', 'signal-only'],
                'payoutUsd': None,
                'payoutSol': None,
                'createdAt': created_at,
                'metadata': {
                    'venue': 'kalshi',
                    'marketId': market_id,
                    'kind': 'signal',
                    'price': round(probability, 8),
                    'signalOnly': bool(KALSHI_SIGNAL_ONLY),
                    'marketplaceRecord': compact(row),
                },
            }
        )

    return opportunities



def run() -> int:
    ensure_dirs()
    started_at = now_iso()

    if not ENABLE_TRADING_AGENT:
        payload = {
            'ok': True,
            'status': 'disabled',
            'at': now_iso(),
            'startedAt': started_at,
            'venues': VENUES,
            'accepted': 0,
            'discovered': 0,
            'opportunities': [],
            'sourceStats': [],
        }
        write_json(OUTPUT_PATH, payload)
        write_json(STATE_PATH, payload)
        append_json_line(LOG_PATH, {'at': payload['at'], 'event': 'trading_feed', 'status': 'disabled', 'accepted': 0})
        print(json.dumps(payload, ensure_ascii=True))
        return 0

    opportunities: list[dict[str, Any]] = []
    source_stats: list[dict[str, Any]] = []
    discovered_total = 0
    successful_sources = 0

    if 'dflow' in VENUES:
        try:
            payload = fetch_json(
                DFLOW_API_BASE_URL,
                DFLOW_MARKETS_PATH,
                dflow_headers(),
                query={
                    'status': DFLOW_MARKETS_STATUS,
                    'limit': DFLOW_MARKETS_LIMIT,
                    'withNestedMarkets': 'true',
                },
            )
            rows = as_list(payload)
            discovered_total += len(rows)
            dflow_opps = build_dflow_opportunities(rows)
            opportunities.extend(dflow_opps)
            source_stats.append({'source': 'dflow', 'discovered': len(rows), 'accepted': len(dflow_opps)})
            successful_sources += 1
        except Exception as exc:
            source_stats.append({'source': 'dflow', 'discovered': 0, 'accepted': 0, 'error': str(exc)[:300]})

    if 'kalshi' in VENUES:
        try:
            payload = fetch_json(
                KALSHI_API_BASE_URL,
                KALSHI_MARKETS_PATH,
                kalshi_headers(),
                query={'limit': MAX_KALSHI_OPPORTUNITIES},
            )
            rows = as_list(payload)
            discovered_total += len(rows)
            kalshi_opps = build_kalshi_opportunities(rows)
            opportunities.extend(kalshi_opps)
            source_stats.append({'source': 'kalshi', 'discovered': len(rows), 'accepted': len(kalshi_opps)})
            successful_sources += 1
        except Exception as exc:
            source_stats.append({'source': 'kalshi', 'discovered': 0, 'accepted': 0, 'error': str(exc)[:300]})

    opportunities.sort(
        key=lambda row: (
            -float(row.get('confidence') or 0),
            -float(((row.get('metadata') or {}) if isinstance(row.get('metadata'), dict) else {}).get('edgeScore') or 0),
            str(row.get('id') or ''),
        )
    )
    opportunities = opportunities[:MAX_TOTAL_OPPORTUNITIES]

    status = 'ok'
    ok = True
    if successful_sources == 0 and len(VENUES) > 0:
        ok = False
        status = 'failed'
    elif len(opportunities) == 0:
        status = 'no_opportunities'

    out = {
        'ok': ok,
        'status': status,
        'at': now_iso(),
        'startedAt': started_at,
        'venues': VENUES,
        'kalshiSignalOnly': KALSHI_SIGNAL_ONLY,
        'accepted': len(opportunities),
        'discovered': discovered_total,
        'opportunities': opportunities,
        'sourceStats': source_stats,
        'outputPath': str(OUTPUT_PATH),
    }
    write_json(OUTPUT_PATH, out)
    write_json(STATE_PATH, out)
    append_json_line(
        LOG_PATH,
        {
            'at': out['at'],
            'event': 'trading_feed',
            'ok': ok,
            'status': status,
            'accepted': len(opportunities),
            'discovered': discovered_total,
        },
    )
    print(json.dumps(out, ensure_ascii=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(run())
