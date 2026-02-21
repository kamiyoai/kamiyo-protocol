#!/usr/bin/env python3
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

HOME_DIR = Path(os.environ.get('HOME', '~')).expanduser()
WORKSPACE = HOME_DIR / '.openclaw' / 'workspace'
RUNTIME_DIR = WORKSPACE / 'runtime'
FEEDS_DIR = RUNTIME_DIR / 'feeds'
STATE_DIR = RUNTIME_DIR / 'state'
LOGS_DIR = RUNTIME_DIR / 'logs'
CONFIG_PATH = RUNTIME_DIR / 'marketplace-feeds.json'
OUTPUT_PATH = FEEDS_DIR / 'opportunities.json'
SUMMARY_PATH = FEEDS_DIR / 'opportunities-summary.json'
LOG_PATH = LOGS_DIR / 'marketplace-intake.jsonl'
TIMEOUT_SECONDS = float(os.getenv('KYO_MARKETPLACE_TIMEOUT_SECONDS', '20'))
MAX_OPPORTUNITIES = int(os.getenv('KYO_MARKETPLACE_MAX_OPPORTUNITIES', '200'))
MAX_RESPONSE_BYTES = int(os.getenv('KYO_MARKETPLACE_MAX_RESPONSE_BYTES', '2000000'))
MAX_SUMMARY_CHARS = int(os.getenv('KYO_MARKETPLACE_MAX_SUMMARY_CHARS', '2000'))
MAX_METADATA_JSON_BYTES = int(os.getenv('KYO_MARKETPLACE_MAX_METADATA_JSON_BYTES', '5000'))
ALLOW_INSECURE_HTTP = os.getenv('KYO_ALLOW_INSECURE_HTTP_FEEDS', '').strip().lower() in {'1', 'true', 'yes', 'on'}
USER_AGENT = os.getenv('KYO_MARKETPLACE_USER_AGENT', 'kyoshin-marketplace-intake/1.0')


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_dirs() -> None:
    for path in (RUNTIME_DIR, FEEDS_DIR, STATE_DIR, LOGS_DIR):
        path.mkdir(parents=True, exist_ok=True)
        path.chmod(0o700)


def load_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return fallback


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + '\n', encoding='utf-8')
    path.chmod(0o600)


def append_log(payload: dict[str, Any]) -> None:
    with LOG_PATH.open('a', encoding='utf-8') as handle:
        handle.write(json.dumps(payload, ensure_ascii=True) + '\n')
    LOG_PATH.chmod(0o600)


def default_config() -> dict[str, Any]:
    return {
        'feeds': [
            {
                'id': 'agent_ai_primary',
                'source': 'agent_ai',
                'enabled': False,
                'url': '',
                'authHeader': 'Authorization',
                'authEnv': 'KYO_AGENT_AI_API_KEY',
                'authPrefix': 'Bearer',
            },
            {
                'id': 'relevance_primary',
                'source': 'relevance',
                'enabled': False,
                'url': '',
                'authHeader': 'Authorization',
                'authEnv': 'KYO_RELEVANCE_API_KEY',
                'authPrefix': 'Bearer',
            },
            {
                'id': 'kore_primary',
                'source': 'kore',
                'enabled': False,
                'url': '',
                'authHeader': 'Authorization',
                'authEnv': 'KYO_KORE_API_KEY',
                'authPrefix': 'Bearer',
            },
        ]
    }


def normalize_text(value: Any, fallback: str = '') -> str:
    if isinstance(value, str):
        stripped = value.strip()
        if stripped:
            return stripped
    return fallback


def normalize_identifier(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return ''


def normalize_number(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except Exception:
            return None
    return None


def normalize_array_of_strings(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value:
        if isinstance(item, str):
            val = item.strip().lower()
            if val and val not in out:
                out.append(val)
    return out


def truncate_text(text: str, max_chars: int) -> str:
    if max_chars <= 0 or len(text) <= max_chars:
        return text
    if max_chars <= 3:
        return text[:max_chars]
    return text[: max_chars - 3].rstrip() + '...'


def compact_metadata(value: dict[str, Any]) -> Any:
    try:
        serialized = json.dumps(value, ensure_ascii=True, separators=(',', ':'))
    except Exception:
        return {'truncated': True, 'reason': 'unserializable'}

    if len(serialized) <= MAX_METADATA_JSON_BYTES:
        return value

    preview = truncate_text(serialized, MAX_METADATA_JSON_BYTES)
    return {
        'truncated': True,
        'bytes': len(serialized),
        'preview': preview,
    }


def normalize_label_names(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value:
        if isinstance(item, dict):
            name = normalize_text(item.get('name')).lower()
        elif isinstance(item, str):
            name = item.strip().lower()
        else:
            name = ''
        if name and name not in out:
            out.append(name)
    return out


def parse_items(source: str, payload: Any) -> list[dict[str, Any]]:
    records: list[dict[str, Any]]
    if isinstance(payload, list):
        records = [row for row in payload if isinstance(row, dict)]
    elif isinstance(payload, dict):
        if isinstance(payload.get('opportunities'), list):
            records = [row for row in payload['opportunities'] if isinstance(row, dict)]
        elif isinstance(payload.get('items'), list):
            records = [row for row in payload['items'] if isinstance(row, dict)]
        elif isinstance(payload.get('data'), list):
            records = [row for row in payload['data'] if isinstance(row, dict)]
        else:
            records = [payload]
    else:
        records = []

    out: list[dict[str, Any]] = []
    for idx, item in enumerate(records):
        title = normalize_text(item.get('title')) or normalize_text(item.get('name')) or f'opportunity-{idx + 1}'
        summary = (
            normalize_text(item.get('summary'))
            or normalize_text(item.get('description'))
            or normalize_text(item.get('body'))
            or normalize_text(item.get('content'))
            or 'No summary provided.'
        )
        summary = truncate_text(summary, MAX_SUMMARY_CHARS)
        opp_id = (
            normalize_identifier(item.get('id'))
            or normalize_identifier(item.get('opportunityId'))
            or normalize_identifier(item.get('listingId'))
            or f'{source}-{idx + 1}'
        )
        payout_usd = (
            normalize_number(item.get('payoutUsd'))
            or normalize_number(item.get('rewardUsd'))
            or normalize_number(item.get('budgetUsd'))
        )
        payout_sol = (
            normalize_number(item.get('payoutSol'))
            or normalize_number(item.get('rewardSol'))
            or normalize_number(item.get('budgetSol'))
        )
        confidence = normalize_number(item.get('confidence'))
        if confidence is None:
            confidence = 0.6
        confidence = max(0.0, min(1.0, confidence))

        created = normalize_text(item.get('createdAt')) or normalize_text(item.get('created_at')) or now_iso()
        expires = normalize_text(item.get('expiresAt')) or normalize_text(item.get('expires_at')) or None
        tags = normalize_array_of_strings(item.get('tags'))
        if not tags:
            tags = normalize_label_names(item.get('labels'))
        role_hints = normalize_array_of_strings(item.get('roleHints'))
        url = (
            normalize_text(item.get('html_url'))
            or normalize_text(item.get('marketplaceUrl'))
            or normalize_text(item.get('url'))
            or normalize_text(item.get('link'))
            or None
        )

        out.append(
            {
                'id': opp_id,
                'source': source,
                'title': title,
                'summary': summary,
                'url': url,
                'confidence': confidence,
                'tags': tags,
                'roleHints': role_hints,
                'payoutUsd': payout_usd,
                'payoutSol': payout_sol,
                'createdAt': created,
                'expiresAt': expires,
                'metadata': compact_metadata(item),
            }
        )

    return out


def auth_headers(feed: dict[str, Any]) -> dict[str, str]:
    headers = {'accept': 'application/json', 'user-agent': USER_AGENT}
    env_name = normalize_text(feed.get('authEnv'))
    token = os.getenv(env_name) if env_name else None
    if token:
        header_name = normalize_text(feed.get('authHeader'), 'Authorization')
        prefix = normalize_text(feed.get('authPrefix'))
        headers[header_name] = f'{prefix} {token}' if prefix else token
    return headers


def is_supported_feed_url(url: str) -> bool:
    parsed = urllib.parse.urlparse(url)
    scheme = parsed.scheme.lower()
    if scheme == 'file':
        return True
    if scheme == 'https':
        return True
    if scheme == 'http':
        return ALLOW_INSECURE_HTTP
    return False


def fetch_json(url: str, headers: dict[str, str]) -> Any:
    if not is_supported_feed_url(url):
        raise ValueError('unsupported_url_scheme')
    req = urllib.request.Request(url, headers=headers, method='GET')
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as response:
        raw = response.read(MAX_RESPONSE_BYTES + 1)
        if len(raw) > MAX_RESPONSE_BYTES:
            raise ValueError('response_too_large')
        return json.loads(raw.decode('utf-8'))


def dedupe(opportunities: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ranked = sorted(
        opportunities,
        key=lambda row: (
            float(row.get('confidence') or 0.0),
            float(row.get('payoutUsd') or 0.0),
            float(row.get('payoutSol') or 0.0),
        ),
        reverse=True,
    )

    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for row in ranked:
        key = f"{row.get('source', 'direct')}:{row.get('id', 'unknown')}".lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(row)
        if len(out) >= MAX_OPPORTUNITIES:
            break
    return out


def load_feeds() -> list[dict[str, Any]]:
    config = load_json(CONFIG_PATH, default_config())
    feeds = config.get('feeds') if isinstance(config, dict) else None
    if not isinstance(feeds, list):
        return []
    out: list[dict[str, Any]] = []
    for raw in feeds:
        if not isinstance(raw, dict):
            continue
        enabled = bool(raw.get('enabled'))
        url = normalize_text(raw.get('url'))
        source = normalize_text(raw.get('source'), 'direct')
        if not enabled or not url:
            continue
        out.append(
            {
                'id': normalize_text(raw.get('id'), source),
                'source': source,
                'url': url,
                'authEnv': normalize_text(raw.get('authEnv')),
                'authHeader': normalize_text(raw.get('authHeader'), 'Authorization'),
                'authPrefix': normalize_text(raw.get('authPrefix')),
            }
        )
    return out


def run() -> int:
    ensure_dirs()
    if not CONFIG_PATH.exists():
        write_json(CONFIG_PATH, default_config())

    feeds = load_feeds()
    now = now_iso()
    source_stats: list[dict[str, Any]] = []
    aggregate: list[dict[str, Any]] = []

    for feed in feeds:
        try:
            payload = fetch_json(feed['url'], auth_headers(feed))
            items = parse_items(feed['source'], payload)
            aggregate.extend(items)
            source_stats.append(
                {
                    'source': feed['source'],
                    'feedId': feed['id'],
                    'url': feed['url'],
                    'discovered': len(items),
                    'error': None,
                }
            )
        except urllib.error.HTTPError as exc:
            source_stats.append(
                {
                    'source': feed['source'],
                    'feedId': feed['id'],
                    'url': feed['url'],
                    'discovered': 0,
                    'error': f'http_{exc.code}',
                }
            )
        except urllib.error.URLError as exc:
            source_stats.append(
                {
                    'source': feed['source'],
                    'feedId': feed['id'],
                    'url': feed['url'],
                    'discovered': 0,
                    'error': f'url_error:{exc.reason}',
                }
            )
        except Exception as exc:
            source_stats.append(
                {
                    'source': feed['source'],
                    'feedId': feed['id'],
                    'url': feed['url'],
                    'discovered': 0,
                    'error': str(exc),
                }
            )

    opportunities = dedupe(aggregate)
    output = {
        'at': now,
        'feedsConfigured': len(feeds),
        'discoveredRaw': len(aggregate),
        'accepted': len(opportunities),
        'opportunities': opportunities,
        'sourceStats': source_stats,
    }

    write_json(OUTPUT_PATH, output)
    write_json(SUMMARY_PATH, {k: v for k, v in output.items() if k != 'opportunities'})
    append_log({'at': now, 'event': 'marketplace_intake', **{k: v for k, v in output.items() if k != 'opportunities'}})

    print(
        json.dumps(
            {
                'ok': True,
                'feedsConfigured': output['feedsConfigured'],
                'accepted': output['accepted'],
                'sourceStats': source_stats,
            },
            ensure_ascii=True,
        )
    )
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(run())
    except Exception as exc:
        print(json.dumps({'ok': False, 'error': str(exc)}, ensure_ascii=True))
        raise SystemExit(1)
