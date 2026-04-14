#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

HOME_DIR = Path(os.environ.get('HOME', '~')).expanduser()
WORKSPACE = HOME_DIR / '.openclaw' / 'workspace'
RUNTIME_DIR = WORKSPACE / 'runtime'
STATE_DIR = RUNTIME_DIR / 'state'
RECEIPTS_DIR = RUNTIME_DIR / 'receipts'
SEED_DIR = RUNTIME_DIR / 'seed'
LOG_DIR = RUNTIME_DIR / 'logs'

STATE_PATH = STATE_DIR / 'whop-catalog-state.json'
OUTPUT_PATH = STATE_DIR / 'whop-catalog.json'
ACTION_LOG_PATH = RECEIPTS_DIR / 'whop-catalog-actions.jsonl'
LOG_PATH = LOG_DIR / 'whop-catalog.jsonl'
CATALOG_PATH = Path(
    os.getenv('KYO_WHOP_CATALOG_PATH', str(SEED_DIR / 'whop-catalog.json')).strip()
).expanduser()

API_BASE_URL = os.getenv('KYO_WHOP_API_BASE_URL', 'https://api.whop.com/api/v5').strip().rstrip('/')
API_KEY = os.getenv('KYO_WHOP_API_KEY', '').strip()
COMPANY_ID = os.getenv('KYO_WHOP_COMPANY_ID', '').strip()


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


ENABLE_WHOP_MONITOR = env_bool('KYO_ENABLE_WHOP_MONITOR', False)
ENABLE_WHOP_CATALOG = env_bool('KYO_WHOP_CATALOG_ENABLED', True)
HTTP_TIMEOUT_SECONDS = max(3, min(60, env_int('KYO_WHOP_TIMEOUT_SECONDS', 15)))
MAX_OFFERS = max(1, min(100, env_int('KYO_WHOP_CATALOG_MAX_OFFERS', 20)))


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_dirs() -> None:
    for path in (WORKSPACE, RUNTIME_DIR, STATE_DIR, RECEIPTS_DIR, SEED_DIR, LOG_DIR, CATALOG_PATH.parent):
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


def read_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return fallback


def slugify(text: str) -> str:
    base = re.sub(r'[^a-z0-9]+', '-', text.strip().lower())
    base = re.sub(r'-{2,}', '-', base).strip('-')
    return base[:80] if base else 'offer'


def default_catalog() -> dict[str, Any]:
    return {
        'offers': [
            {
                'slug': 'kamiyo-agent-x402-facilitator-pipeline',
                'name': 'Kamiyo Agent x402 Facilitator Pipeline',
                'tagline': 'Deploy a policy-gated x402 execution lane with receipt-backed accounting.',
                'description': 'End-to-end x402 pipeline kit with allowlist policy, settlement ledger normalization, and operator KPI wiring.',
                'priceUsd': 149,
                'currency': 'USD',
                'visibility': 'public',
                'planType': 'one_time',
            },
            {
                'slug': 'kamiyo-agent-autonomous-operator-persona',
                'name': 'Kamiyo Agent Autonomous Operator Persona',
                'tagline': 'Run a hardened OpenClaw operator loop with auditable receipts.',
                'description': 'Persona package with operator policies, runtime guard rails, and non-fake-success execution patterns.',
                'priceUsd': 99,
                'currency': 'USD',
                'visibility': 'public',
                'planType': 'one_time',
            },
            {
                'slug': 'kamiyo-agent-revenue-ops-loop',
                'name': 'Kamiyo Agent Revenue Ops Loop',
                'tagline': 'Activate daily autonomous revenue execution with receipts and routing.',
                'description': 'Revenue lane configuration with loop cadence, KPI checkpoints, and rollback-safe policy controls.',
                'priceUsd': 129,
                'currency': 'USD',
                'visibility': 'public',
                'planType': 'one_time',
            },
            {
                'slug': 'kamiyo-agent-trust-layer-launch-kit',
                'name': 'Kamiyo Agent Trust Layer Launch Kit',
                'tagline': 'Escrow and dispute-ready trust adapters for agent commerce.',
                'description': 'Starter trust-layer package with escrow wiring, dispute flow templates, and guard-compatible ops hooks.',
                'priceUsd': 179,
                'currency': 'USD',
                'visibility': 'public',
                'planType': 'one_time',
            },
            {
                'slug': 'kamiyo-agent-24h-revenue-audit',
                'name': 'Kamiyo Agent 24h Revenue Audit',
                'tagline': 'One-day audit of revenue lanes, receipts, and policy blockers.',
                'description': 'Focused 24-hour audit output with blocker list, route parity checks, and immediate execution fixes.',
                'priceUsd': 49,
                'currency': 'USD',
                'visibility': 'public',
                'planType': 'one_time',
            },
        ]
    }


def normalize_offer(item: Any) -> dict[str, Any] | None:
    if not isinstance(item, dict):
        return None
    name = str(item.get('name') or '').strip()
    if not name:
        return None
    slug = str(item.get('slug') or '').strip() or slugify(name)
    price_raw = item.get('priceUsd') if item.get('priceUsd') is not None else item.get('price')
    try:
        price_usd = round(max(0.0, float(price_raw)), 2)
    except Exception:
        price_usd = 0.0
    if price_usd <= 0.0:
        return None

    currency = str(item.get('currency') or 'USD').strip().upper() or 'USD'
    plan_type = str(item.get('planType') or 'one_time').strip().lower() or 'one_time'
    tagline = str(item.get('tagline') or '').strip()
    description = str(item.get('description') or item.get('about') or '').strip()
    if not description:
        description = tagline or name
    visibility = str(item.get('visibility') or 'public').strip().lower() or 'public'
    return {
        'slug': slug,
        'name': name,
        'tagline': tagline,
        'description': description,
        'priceUsd': price_usd,
        'currency': currency,
        'planType': plan_type,
        'visibility': visibility,
        'planName': str(item.get('planName') or name).strip() or name,
    }


def load_offers(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        path.write_text(json.dumps(default_catalog(), indent=2, ensure_ascii=True) + '\n', encoding='utf-8')
        path.chmod(0o600)
    payload = read_json(path, {})
    rows: Iterable[Any]
    if isinstance(payload, dict):
        rows = payload.get('offers') if isinstance(payload.get('offers'), list) else []
    elif isinstance(payload, list):
        rows = payload
    else:
        rows = []

    offers: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in rows:
        normalized = normalize_offer(row)
        if normalized is None:
            continue
        slug = normalized['slug']
        if slug in seen:
            continue
        seen.add(slug)
        offers.append(normalized)
        if len(offers) >= MAX_OFFERS:
            break

    if not offers:
        for row in default_catalog().get('offers', []):
            normalized = normalize_offer(row)
            if normalized is not None:
                offers.append(normalized)
    return offers


def request_json(method: str, path: str, payload: dict[str, Any] | None = None, query: dict[str, Any] | None = None) -> dict[str, Any]:
    if not API_BASE_URL:
        raise RuntimeError('missing_whop_api_base_url')
    if not API_KEY:
        raise RuntimeError('missing_whop_api_key')

    url = f'{API_BASE_URL}{path}'
    if query:
        pairs = [(str(k), str(v)) for k, v in query.items() if v is not None and str(v) != '']
        if pairs:
            url += '?' + urllib.parse.urlencode(pairs)

    body: bytes | None = None
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=True).encode('utf-8')
    request = urllib.request.Request(
        url=url,
        data=body,
        headers={
            'Authorization': f'Bearer {API_KEY}',
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'kamiyo-agent-whop-catalog/1.0',
        },
        method=method.upper(),
    )
    with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
        raw = response.read().decode('utf-8')
    decoded = json.loads(raw)
    if not isinstance(decoded, dict):
        raise ValueError(f'non-object JSON from {path}')
    return decoded


def data_items(payload: dict[str, Any], keys: tuple[str, ...] = ('data', 'items', 'results', 'products', 'plans')) -> list[dict[str, Any]]:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, list):
            return [row for row in value if isinstance(row, dict)]
        if isinstance(value, dict):
            nested_items = value.get('items') if isinstance(value.get('items'), list) else value.get(key)
            if isinstance(nested_items, list):
                return [row for row in nested_items if isinstance(row, dict)]
    if isinstance(payload.get('data'), dict):
        for nested_key in ('products', 'plans'):
            nested = payload['data'].get(nested_key)
            if isinstance(nested, list):
                return [row for row in nested if isinstance(row, dict)]
    return []


def item_from_payload(payload: dict[str, Any]) -> dict[str, Any] | None:
    if isinstance(payload, dict) and (
        payload.get('id') is not None
        or payload.get('product_id') is not None
        or payload.get('plan_id') is not None
    ):
        return payload
    if isinstance(payload.get('data'), dict):
        return payload.get('data')
    if isinstance(payload.get('item'), dict):
        return payload.get('item')
    if isinstance(payload.get('product'), dict):
        return payload.get('product')
    if isinstance(payload.get('plan'), dict):
        return payload.get('plan')
    return None


def item_id(item: dict[str, Any]) -> str:
    return str(item.get('id') or item.get('product_id') or item.get('plan_id') or '').strip()


def item_slug(item: dict[str, Any]) -> str:
    return str(item.get('slug') or item.get('handle') or item.get('key') or '').strip().lower()


def item_name(item: dict[str, Any]) -> str:
    return str(item.get('name') or item.get('title') or '').strip()


def checkout_url(plan: dict[str, Any], product: dict[str, Any], fallback_slug: str) -> str:
    for key in ('checkout_url', 'checkoutUrl', 'checkout_link', 'checkoutLink', 'direct_link', 'link', 'url'):
        value = str(plan.get(key) or '').strip()
        if value:
            return value
    for key in ('checkout_url', 'checkoutUrl', 'public_url', 'publicUrl', 'url'):
        value = str(product.get(key) or '').strip()
        if value:
            return value
    return f'https://whop.com/checkout/{fallback_slug}'


def list_products() -> list[dict[str, Any]]:
    attempts = [
        ('GET', f'/companies/{COMPANY_ID}/products', None),
        ('GET', '/products', {'company_id': COMPANY_ID}),
    ]
    last_exc: Exception | None = None
    for method, path, query in attempts:
        try:
            payload = request_json(method, path, query=query)
            return data_items(payload)
        except Exception as exc:
            last_exc = exc
    if last_exc is not None:
        raise last_exc
    return []


def list_plans(product_id: str) -> list[dict[str, Any]]:
    attempts = [
        ('GET', f'/products/{product_id}/plans', None),
        ('GET', '/plans', {'product_id': product_id}),
    ]
    last_exc: Exception | None = None
    for method, path, query in attempts:
        try:
            payload = request_json(method, path, query=query)
            return data_items(payload)
        except Exception as exc:
            last_exc = exc
    if last_exc is not None:
        raise last_exc
    return []


def create_or_update_product(existing: dict[str, Any] | None, offer: dict[str, Any]) -> tuple[dict[str, Any], str]:
    payload = {
        'name': offer['name'],
        'description': offer['description'],
        'slug': offer['slug'],
        'company_id': COMPANY_ID,
        'visibility': offer['visibility'],
        'metadata': {'tagline': offer['tagline'], 'source': 'kamiyo_agent_whop_catalog'},
    }
    if existing is not None:
        product_id = item_id(existing)
        response = request_json('PATCH', f'/products/{product_id}', payload=payload)
        updated = item_from_payload(response) or existing
        return updated, 'updated'

    attempts = [
        ('POST', f'/companies/{COMPANY_ID}/products', payload),
        ('POST', '/products', payload),
    ]
    last_exc: Exception | None = None
    for method, path, body in attempts:
        try:
            response = request_json(method, path, payload=body)
            created = item_from_payload(response)
            if created is not None:
                return created, 'created'
        except Exception as exc:
            last_exc = exc
    if last_exc is not None:
        raise last_exc
    raise RuntimeError('create_product_failed')


def create_or_update_plan(product: dict[str, Any], existing: dict[str, Any] | None, offer: dict[str, Any]) -> tuple[dict[str, Any], str]:
    product_id = item_id(product)
    amount_cents = int(round(offer['priceUsd'] * 100))
    payload = {
        'product_id': product_id,
        'name': offer['planName'],
        'slug': f"{offer['slug']}-one-time",
        'currency': offer['currency'],
        'amount': amount_cents,
        'price': amount_cents,
        'interval': 'one_time',
        'is_public': True,
    }
    if existing is not None:
        plan_id = item_id(existing)
        response = request_json('PATCH', f'/plans/{plan_id}', payload=payload)
        updated = item_from_payload(response) or existing
        return updated, 'updated'

    attempts = [
        ('POST', f'/products/{product_id}/plans', payload),
        ('POST', '/plans', payload),
    ]
    last_exc: Exception | None = None
    for method, path, body in attempts:
        try:
            response = request_json(method, path, payload=body)
            created = item_from_payload(response)
            if created is not None:
                return created, 'created'
        except Exception as exc:
            last_exc = exc
    if last_exc is not None:
        raise last_exc
    raise RuntimeError('create_plan_failed')


def run() -> int:
    ensure_dirs()
    started_at = now_iso()

    if not ENABLE_WHOP_MONITOR:
        summary = {
            'ok': True,
            'status': 'disabled',
            'reason': 'whop_monitor_disabled',
            'startedAt': started_at,
            'at': now_iso(),
        }
        write_json(STATE_PATH, {'lastRunAt': summary['at'], 'lastStatus': summary})
        write_json(OUTPUT_PATH, summary)
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    if not ENABLE_WHOP_CATALOG:
        summary = {
            'ok': True,
            'status': 'disabled',
            'reason': 'whop_catalog_disabled',
            'startedAt': started_at,
            'at': now_iso(),
        }
        write_json(STATE_PATH, {'lastRunAt': summary['at'], 'lastStatus': summary})
        write_json(OUTPUT_PATH, summary)
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    if not API_KEY:
        summary = {
            'ok': False,
            'status': 'blocked',
            'reason': 'missing_whop_api_key',
            'startedAt': started_at,
            'at': now_iso(),
        }
        write_json(STATE_PATH, {'lastRunAt': summary['at'], 'lastStatus': summary})
        write_json(OUTPUT_PATH, summary)
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    if not COMPANY_ID:
        summary = {
            'ok': False,
            'status': 'blocked',
            'reason': 'missing_whop_company_id',
            'startedAt': started_at,
            'at': now_iso(),
        }
        write_json(STATE_PATH, {'lastRunAt': summary['at'], 'lastStatus': summary})
        write_json(OUTPUT_PATH, summary)
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    offers = load_offers(CATALOG_PATH)
    created_products = 0
    updated_products = 0
    created_plans = 0
    updated_plans = 0
    errors: list[dict[str, str]] = []
    mapped: list[dict[str, Any]] = []

    try:
        existing_products = list_products()
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError, RuntimeError) as exc:
        summary = {
            'ok': False,
            'status': 'failed',
            'reason': 'api_error',
            'error': str(exc)[:400],
            'startedAt': started_at,
            'at': now_iso(),
            'catalogPath': str(CATALOG_PATH),
            'offersCount': len(offers),
        }
        write_json(STATE_PATH, {'lastRunAt': summary['at'], 'lastStatus': summary})
        write_json(OUTPUT_PATH, summary)
        append_json_line(LOG_PATH, {'at': summary['at'], 'event': 'whop_catalog', 'ok': False, 'reason': summary['reason']})
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    by_slug = {item_slug(row): row for row in existing_products if item_slug(row)}

    for offer in offers:
        slug = offer['slug']
        product_existing = by_slug.get(slug)
        try:
            product_item, product_action = create_or_update_product(product_existing, offer)
            product_id = item_id(product_item)
            if not product_id:
                raise RuntimeError('missing_product_id')
            by_slug[slug] = product_item
            if product_action == 'created':
                created_products += 1
            else:
                updated_products += 1

            plans = list_plans(product_id)
            plan_slug = f'{slug}-one-time'
            plan_existing = None
            for row in plans:
                if item_slug(row) == plan_slug or item_name(row).strip().lower() == offer['planName'].strip().lower():
                    plan_existing = row
                    break

            plan_item, plan_action = create_or_update_plan(product_item, plan_existing, offer)
            plan_id = item_id(plan_item)
            if not plan_id:
                raise RuntimeError('missing_plan_id')
            if plan_action == 'created':
                created_plans += 1
            else:
                updated_plans += 1

            checkout = checkout_url(plan_item, product_item, slug)
            mapped_row = {
                'slug': slug,
                'name': offer['name'],
                'priceUsd': offer['priceUsd'],
                'currency': offer['currency'],
                'productId': product_id,
                'planId': plan_id,
                'checkoutUrl': checkout,
                'updatedAt': now_iso(),
            }
            mapped.append(mapped_row)
            append_json_line(
                ACTION_LOG_PATH,
                {
                    'at': mapped_row['updatedAt'],
                    'source': 'whop',
                    'action': f'upsert_{product_action}_{plan_action}',
                    'slug': slug,
                    'productId': product_id,
                    'planId': plan_id,
                    'checkoutUrl': checkout,
                    'priceUsd': offer['priceUsd'],
                },
            )
        except Exception as exc:
            errors.append({'slug': slug, 'error': str(exc)[:300]})
            append_json_line(
                ACTION_LOG_PATH,
                {
                    'at': now_iso(),
                    'source': 'whop',
                    'action': 'upsert_failed',
                    'slug': slug,
                    'error': str(exc)[:300],
                },
            )

    mapped.sort(key=lambda row: str(row.get('slug') or ''))
    at = now_iso()
    summary = {
        'ok': len(errors) == 0,
        'status': 'ok' if not errors else 'partial_failure',
        'startedAt': started_at,
        'at': at,
        'catalogPath': str(CATALOG_PATH),
        'offersCount': len(offers),
        'mappedOffers': len(mapped),
        'createdProducts': created_products,
        'updatedProducts': updated_products,
        'createdPlans': created_plans,
        'updatedPlans': updated_plans,
        'errors': errors,
        'offers': mapped,
    }
    write_json(STATE_PATH, {'lastRunAt': at, 'offers': mapped, 'lastStatus': summary})
    write_json(OUTPUT_PATH, summary)
    append_json_line(
        LOG_PATH,
        {
            'at': at,
            'event': 'whop_catalog',
            'ok': summary['ok'],
            'status': summary['status'],
            'offersCount': len(offers),
            'mappedOffers': len(mapped),
            'createdProducts': created_products,
            'updatedProducts': updated_products,
            'createdPlans': created_plans,
            'updatedPlans': updated_plans,
            'errorCount': len(errors),
        },
    )
    print(json.dumps(summary, ensure_ascii=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(run())
