#!/usr/bin/env python3
import hashlib
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional, Tuple

HOME_DIR = Path(os.environ.get('HOME', '~')).expanduser()
WORKSPACE = HOME_DIR / '.openclaw' / 'workspace'
RUNTIME_DIR = WORKSPACE / 'runtime'
FEEDS_DIR = RUNTIME_DIR / 'feeds'
STATE_DIR = RUNTIME_DIR / 'state'
LOGS_DIR = RUNTIME_DIR / 'logs'

OUTPUT_PATH = FEEDS_DIR / 'x402-opportunities.json'
SUMMARY_PATH = STATE_DIR / 'x402-feed-state.json'
LOG_PATH = LOGS_DIR / 'x402-feed.jsonl'

TIMEOUT_SECONDS = float(os.getenv('KYO_X402_FEED_TIMEOUT_SECONDS', '12'))
ALLOW_INSECURE_HTTP = os.getenv('KYO_ALLOW_INSECURE_HTTP_FEEDS', '').strip().lower() in {'1', 'true', 'yes', 'on'}
MAX_OPPORTUNITIES = max(1, int(os.getenv('KYO_X402_MAX_OPPORTUNITIES', '50')))


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_dirs() -> None:
    for path in (WORKSPACE, RUNTIME_DIR, FEEDS_DIR, STATE_DIR, LOGS_DIR):
        path.mkdir(parents=True, exist_ok=True)
        path.chmod(0o700)


def parse_csv(raw: str) -> list[str]:
    return [item.strip() for item in raw.split(',') if item.strip()]


def dedupe(values: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for value in values:
        key = value.strip()
        if not key:
            continue
        lower = key.lower()
        if lower in seen:
            continue
        seen.add(lower)
        out.append(key)
    return out


def normalize_base_url(raw: str) -> str:
    value = raw.strip()
    if not value:
        return ''
    return value.rstrip('/')


def is_supported_url(url: str) -> bool:
    parsed = urllib.parse.urlparse(url)
    scheme = parsed.scheme.lower()
    if scheme == 'https':
        return True
    if scheme == 'http':
        return ALLOW_INSECURE_HTTP or parsed.hostname in {'127.0.0.1', 'localhost'}
    return False


def parse_float(value: Any) -> Optional[float]:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except Exception:
            return None
    return None


def parse_bool(raw: str, default: bool) -> bool:
    value = raw.strip().lower()
    if value in {'1', 'true', 'yes', 'on'}:
        return True
    if value in {'0', 'false', 'no', 'off'}:
        return False
    return default


def resolve_pricing_urls() -> list[str]:
    urls = parse_csv(os.getenv('KYO_X402_PRICING_URLS', ''))
    single = os.getenv('KYO_X402_PRICING_URL', '').strip()
    if single:
        urls.append(single)

    base = normalize_base_url(os.getenv('KYO_X402_FACILITATOR_BASE_URL', ''))
    if base and not urls:
        urls.append(f'{base}/api/paid/pricing')

    return dedupe(urls)


def load_manual_endpoint_specs() -> list[dict[str, Any]]:
    raw = os.getenv('KYO_X402_ENDPOINTS_JSON', '').strip()
    if not raw:
        return []
    try:
        payload = json.loads(raw)
    except Exception:
        return []
    if not isinstance(payload, list):
        return []
    return [item for item in payload if isinstance(item, dict)]


def request_json(url: str) -> Any:
    if not is_supported_url(url):
        raise ValueError(f'unsupported_url:{url}')
    req = urllib.request.Request(
        url,
        headers={'accept': 'application/json', 'user-agent': 'kyoshin-x402-feed/1.0'},
        method='GET',
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as response:
        raw = response.read(1_000_000)
    return json.loads(raw.decode('utf-8'))


def as_record(value: Any) -> Optional[dict[str, Any]]:
    if isinstance(value, dict):
        return value
    return None


def normalize_method(value: Any) -> str:
    if not isinstance(value, str):
        return 'GET'
    method = value.strip().upper()
    if method in {'GET', 'POST', 'PUT', 'PATCH', 'DELETE'}:
        return method
    return 'GET'


def clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def build_endpoint_url(base_url: str, endpoint: str) -> str:
    endpoint_clean = endpoint.strip()
    if not endpoint_clean:
        return ''
    parsed = urllib.parse.urlparse(endpoint_clean)
    if parsed.scheme:
        return endpoint_clean
    if not base_url:
        return ''
    return urllib.parse.urljoin(base_url.rstrip('/') + '/', endpoint_clean.lstrip('/'))


def stable_id(method: str, url: str) -> str:
    digest = hashlib.sha1(f'{method}:{url}'.encode('utf-8')).hexdigest()[:14]
    return f'x402-{digest}'


def compact_record(value: dict[str, Any], max_bytes: int = 5000) -> dict[str, Any]:
    try:
        raw = json.dumps(value, ensure_ascii=True, separators=(',', ':'))
    except Exception:
        return {'truncated': True, 'reason': 'unserializable'}
    if len(raw) <= max_bytes:
        return value
    return {
        'truncated': True,
        'bytes': len(raw),
        'preview': raw[: max_bytes - 3] + '...',
    }


def normalize_headers(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        return {}
    out: dict[str, str] = {}
    for key, raw in value.items():
        if not isinstance(key, str):
            continue
        if isinstance(raw, str) and raw.strip():
            out[key] = raw.strip()
    return out


def descriptor_from_pricing_url(url: str, payload: Any) -> Tuple[list[dict[str, Any]], Optional[str]]:
    root = as_record(payload)
    if not root:
        return [], 'invalid_pricing_payload'

    endpoints = as_record(root.get('endpoints'))
    if not endpoints:
        return [], 'missing_endpoints'

    default_multiplier = max(1.0, parse_float(os.getenv('KYO_X402_EXPECTED_MARGIN_MULTIPLIER', '3')) or 3.0)
    min_payout = max(0.0, parse_float(os.getenv('KYO_X402_MIN_PAYOUT_USD', '0.01')) or 0.01)
    default_confidence = clamp(parse_float(os.getenv('KYO_X402_DEFAULT_CONFIDENCE', '0.72')) or 0.72, 0.0, 1.0)
    default_role_hints = parse_csv(os.getenv('KYO_X402_ROLE_HINTS', 'executor,ops'))
    default_tags = parse_csv(os.getenv('KYO_X402_DEFAULT_TAGS', 'x402,machine_pay,self_facilitator'))
    generated_at = now_iso()

    parsed_url = urllib.parse.urlparse(url)
    root_url = f'{parsed_url.scheme}://{parsed_url.netloc}'

    out: list[dict[str, Any]] = []
    for endpoint_key, raw_entry in endpoints.items():
        entry = as_record(raw_entry)
        if not isinstance(endpoint_key, str) or not entry:
            continue

        method = normalize_method(entry.get('method'))
        endpoint_url = build_endpoint_url(root_url, endpoint_key)
        if not endpoint_url:
            continue

        price_usd = parse_float(entry.get('priceUsd'))
        payout_usd = parse_float(
            entry.get('expectedPayoutUsd')
            if entry.get('expectedPayoutUsd') is not None
            else entry.get('payoutUsd')
        )
        if payout_usd is None and price_usd is not None:
            payout_usd = max(min_payout, round(price_usd * default_multiplier, 6))

        title = str(entry.get('title') or f'x402 execution contract {endpoint_key}').strip()
        summary = str(entry.get('description') or 'Execute x402 machine-pay contract and collect verifiable settlement output.').strip()
        if not title:
            continue
        if not summary:
            summary = 'Execute x402 machine-pay contract and collect verifiable settlement output.'

        headers = normalize_headers(entry.get('headers'))
        request_body = entry.get('body') if entry.get('body') is not None else entry.get('requestBody')
        role_hints = [item.lower() for item in (entry.get('roleHints') or default_role_hints) if isinstance(item, str) and item.strip()]
        tags = [item.lower() for item in (entry.get('tags') or default_tags) if isinstance(item, str) and item.strip()]
        tags = dedupe(tags + ['x402'])

        confidence = clamp(parse_float(entry.get('confidence')) or default_confidence, 0.0, 1.0)
        opportunity_id = str(entry.get('id') or stable_id(method, endpoint_url))

        out.append(
            {
                'id': opportunity_id,
                'source': 'x402',
                'title': title,
                'summary': summary,
                'url': endpoint_url,
                'confidence': confidence,
                'roleHints': role_hints,
                'tags': tags,
                'payoutUsd': payout_usd,
                'payoutSol': None,
                'createdAt': generated_at,
                'metadata': {
                    'source': 'x402_feed_builder_v1',
                    'executionMode': 'api',
                    'request': {
                        'method': method,
                        'headers': headers,
                        'body': request_body,
                    },
                    'pricing': {
                        'priceUsd': price_usd,
                        'expectedPayoutUsd': payout_usd,
                        'pricingUrl': url,
                        'endpointKey': endpoint_key,
                    },
                    'marketplaceRecord': compact_record(entry),
                },
            }
        )

    return out, None


def descriptor_from_manual_specs(specs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not specs:
        return []

    default_multiplier = max(1.0, parse_float(os.getenv('KYO_X402_EXPECTED_MARGIN_MULTIPLIER', '3')) or 3.0)
    min_payout = max(0.0, parse_float(os.getenv('KYO_X402_MIN_PAYOUT_USD', '0.01')) or 0.01)
    default_confidence = clamp(parse_float(os.getenv('KYO_X402_DEFAULT_CONFIDENCE', '0.72')) or 0.72, 0.0, 1.0)
    default_role_hints = parse_csv(os.getenv('KYO_X402_ROLE_HINTS', 'executor,ops'))
    default_tags = parse_csv(os.getenv('KYO_X402_DEFAULT_TAGS', 'x402,machine_pay,self_facilitator'))
    generated_at = now_iso()
    base_url = normalize_base_url(os.getenv('KYO_X402_FACILITATOR_BASE_URL', ''))

    out: list[dict[str, Any]] = []
    for idx, entry in enumerate(specs):
        endpoint_value = (
            str(entry.get('url') or '').strip()
            or str(entry.get('endpoint') or '').strip()
            or str(entry.get('path') or '').strip()
        )
        endpoint_url = build_endpoint_url(base_url, endpoint_value)
        if not endpoint_url:
            continue

        method = normalize_method(entry.get('method'))
        price_usd = parse_float(entry.get('priceUsd'))
        payout_usd = parse_float(entry.get('expectedPayoutUsd') if entry.get('expectedPayoutUsd') is not None else entry.get('payoutUsd'))
        if payout_usd is None and price_usd is not None:
            payout_usd = max(min_payout, round(price_usd * default_multiplier, 6))

        title = str(entry.get('title') or f'x402 execution contract {idx + 1}').strip()
        summary = str(entry.get('summary') or entry.get('description') or 'Execute x402 machine-pay contract and collect verifiable settlement output.').strip()
        if not title:
            continue

        role_hints = [item.lower() for item in (entry.get('roleHints') or default_role_hints) if isinstance(item, str) and item.strip()]
        tags = [item.lower() for item in (entry.get('tags') or default_tags) if isinstance(item, str) and item.strip()]
        tags = dedupe(tags + ['x402'])
        confidence = clamp(parse_float(entry.get('confidence')) or default_confidence, 0.0, 1.0)

        out.append(
            {
                'id': str(entry.get('id') or stable_id(method, endpoint_url)),
                'source': 'x402',
                'title': title,
                'summary': summary,
                'url': endpoint_url,
                'confidence': confidence,
                'roleHints': role_hints,
                'tags': tags,
                'payoutUsd': payout_usd,
                'payoutSol': parse_float(entry.get('payoutSol')),
                'createdAt': generated_at,
                'metadata': {
                    'source': 'x402_feed_builder_v1',
                    'executionMode': 'api',
                    'request': {
                        'method': method,
                        'headers': normalize_headers(entry.get('headers')),
                        'body': entry.get('body'),
                    },
                    'pricing': {
                        'priceUsd': price_usd,
                        'expectedPayoutUsd': payout_usd,
                        'manual': True,
                    },
                    'marketplaceRecord': compact_record(entry),
                },
            }
        )

    return out


def dedupe_ranked(opportunities: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ranked = sorted(
        opportunities,
        key=lambda row: (
            float(row.get('payoutUsd') or 0.0),
            float(row.get('confidence') or 0.0),
        ),
        reverse=True,
    )

    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in ranked:
        key = str(row.get('id') or '').strip().lower()
        if not key:
            continue
        if key in seen:
            continue
        seen.add(key)
        out.append(row)
        if len(out) >= MAX_OPPORTUNITIES:
            break
    return out


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + '\n', encoding='utf-8')
    path.chmod(0o600)


def append_log(payload: dict[str, Any]) -> None:
    with LOG_PATH.open('a', encoding='utf-8') as handle:
        handle.write(json.dumps(payload, ensure_ascii=True) + '\n')
    LOG_PATH.chmod(0o600)


def run() -> int:
    ensure_dirs()
    started_at = now_iso()

    discovered = 0
    errors: list[dict[str, str]] = []
    source_stats: list[dict[str, Any]] = []
    aggregate: list[dict[str, Any]] = []

    for spec in descriptor_from_manual_specs(load_manual_endpoint_specs()):
        aggregate.append(spec)
    if aggregate:
        source_stats.append({'source': 'manual_specs', 'discovered': len(aggregate), 'error': None})
        discovered += len(aggregate)

    for url in resolve_pricing_urls():
        try:
            payload = request_json(url)
            rows, parse_error = descriptor_from_pricing_url(url, payload)
            aggregate.extend(rows)
            discovered += len(rows)
            source_stats.append(
                {
                    'source': 'pricing_url',
                    'url': url,
                    'discovered': len(rows),
                    'error': parse_error,
                }
            )
            if parse_error:
                errors.append({'source': url, 'error': parse_error})
        except urllib.error.HTTPError as exc:
            source_stats.append({'source': 'pricing_url', 'url': url, 'discovered': 0, 'error': f'http_{exc.code}'})
            errors.append({'source': url, 'error': f'http_{exc.code}'})
        except urllib.error.URLError as exc:
            source_stats.append({'source': 'pricing_url', 'url': url, 'discovered': 0, 'error': f'url_error:{exc.reason}'})
            errors.append({'source': url, 'error': f'url_error:{exc.reason}'})
        except Exception as exc:
            source_stats.append({'source': 'pricing_url', 'url': url, 'discovered': 0, 'error': str(exc)})
            errors.append({'source': url, 'error': str(exc)})

    opportunities = dedupe_ranked(aggregate)
    output = {
        'at': now_iso(),
        'startedAt': started_at,
        'discovered': discovered,
        'accepted': len(opportunities),
        'opportunities': opportunities,
        'sourceStats': source_stats,
        'errors': errors,
    }
    write_json(OUTPUT_PATH, output)
    write_json(SUMMARY_PATH, {k: v for k, v in output.items() if k != 'opportunities'})
    append_log(
        {
            'at': output['at'],
            'event': 'x402_feed',
            'accepted': output['accepted'],
            'discovered': output['discovered'],
            'sources': len(source_stats),
            'errors': len(errors),
        }
    )

    print(
        json.dumps(
            {
                'ok': True,
                'accepted': output['accepted'],
                'discovered': output['discovered'],
                'outputPath': str(OUTPUT_PATH),
                'sourceStats': source_stats,
                'errors': errors,
            },
            ensure_ascii=True,
        )
    )
    return 0


if __name__ == '__main__':
    raise SystemExit(run())
