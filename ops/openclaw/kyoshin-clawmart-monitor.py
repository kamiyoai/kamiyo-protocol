#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

HOME_DIR = Path(os.environ.get('HOME', '~')).expanduser()
WORKSPACE = HOME_DIR / '.openclaw' / 'workspace'
RUNTIME_DIR = WORKSPACE / 'runtime'
STATE_DIR = RUNTIME_DIR / 'state'
MISSION_CONTROL_DIR = RUNTIME_DIR / 'mission-control'
RECEIPTS_DIR = RUNTIME_DIR / 'receipts'

BACKLOG_PATH = MISSION_CONTROL_DIR / 'backlog.json'
BOARD_PATH = MISSION_CONTROL_DIR / 'board.json'
STATE_PATH = STATE_DIR / 'clawmart-monitor-state.json'
OUTPUT_PATH = STATE_DIR / 'clawmart-monitor.json'

API_BASE_URL = os.getenv('CLAWMART_API_BASE_URL', 'https://www.shopclawmart.com/api/v1').strip().rstrip('/')
API_KEY = os.getenv('CLAWMART_API_KEY', '').strip()
DASHBOARD_URL = os.getenv('KYO_CLAWMART_DASHBOARD_URL', 'https://www.shopclawmart.com/dashboard').strip()
DEFAULT_KAMIYO_STAKING_POOL_URL = 'https://fundry.collaterize.com/staking/9mEd5iRcdbNUwaCmkPqYggLfg25B2DsTn1w6gNrgvC9d'
KAMIYO_STAKING_POOL_URL = os.getenv('KYO_KAMIYO_STAKING_POOL_URL', DEFAULT_KAMIYO_STAKING_POOL_URL).strip()
if not KAMIYO_STAKING_POOL_URL:
    KAMIYO_STAKING_POOL_URL = DEFAULT_KAMIYO_STAKING_POOL_URL


def env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value.strip())
    except Exception:
        return default


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


HTTP_TIMEOUT_SECONDS = max(3, min(60, env_int('KYO_CLAWMART_MONITOR_TIMEOUT_SECONDS', 12)))
MAX_TASKS = max(1, min(30, env_int('KYO_CLAWMART_MONITOR_MAX_TASKS', 8)))
REQUIRE_STAKING_ROUTE = env_bool('KYO_REQUIRE_CLAWMART_STAKING_ROUTE', True)
CLAWMART_ORDER_GROSS_USD = max(0.0, env_float('KYO_CLAWMART_ORDER_GROSS_USD', 0.0))
CLAWMART_ORDER_COST_USD = max(0.0, env_float('KYO_CLAWMART_ORDER_COST_USD', 0.0))
CLAWMART_ORDER_NET_USD_RAW = os.getenv('KYO_CLAWMART_ORDER_NET_USD')
CLAWMART_ORDER_NET_USD = None
if CLAWMART_ORDER_NET_USD_RAW is not None and CLAWMART_ORDER_NET_USD_RAW.strip():
    try:
        CLAWMART_ORDER_NET_USD = float(CLAWMART_ORDER_NET_USD_RAW.strip())
    except Exception:
        CLAWMART_ORDER_NET_USD = None
STAKING_ROUTE_RECEIPTS_PATH = Path(
    os.getenv('KYO_CLAWMART_STAKING_RECEIPTS_PATH', str(RUNTIME_DIR / 'receipts' / 'clawmart-staking-route.jsonl')).strip()
).expanduser()
REVENUE_LEDGER_PATH = Path(
    os.getenv('KYO_REVENUE_LEDGER_PATH', str(RECEIPTS_DIR / 'revenue-ledger.jsonl')).strip()
).expanduser()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_dirs() -> None:
    for path in (WORKSPACE, RUNTIME_DIR, STATE_DIR, MISSION_CONTROL_DIR, RECEIPTS_DIR):
        path.mkdir(parents=True, exist_ok=True)
        path.chmod(0o700)


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


def fetch_json(path: str) -> dict[str, Any]:
    url = f'{API_BASE_URL}{path}'
    request = urllib.request.Request(
        url=url,
        headers={
            'Authorization': f'Bearer {API_KEY}',
            'Accept': 'application/json',
            'User-Agent': 'kyoshin-clawmart-monitor/1.0',
        },
        method='GET',
    )
    with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
        payload = response.read().decode('utf-8')
    decoded = json.loads(payload)
    if not isinstance(decoded, dict):
        raise ValueError(f'non-object JSON from {path}')
    return decoded


def to_non_negative_int(value: Any, fallback: int = 0) -> int:
    try:
        parsed = int(value)
        if parsed < 0:
            return fallback
        return parsed
    except Exception:
        return fallback


def to_float(value: Any, fallback: float = 0.0) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except Exception:
            return fallback
    return fallback


def extract_total_sales(payload: dict[str, Any]) -> int:
    data = payload.get('data')
    if isinstance(data, dict):
        if 'totalSales' in data:
            return to_non_negative_int(data.get('totalSales'))
    return to_non_negative_int(payload.get('totalSales'))


def extract_profile_id(payload: dict[str, Any]) -> str:
    data = payload.get('data')
    if isinstance(data, dict):
        profile = data.get('profile')
        if isinstance(profile, dict):
            profile_id = profile.get('id')
            if isinstance(profile_id, str):
                return profile_id.strip()
    return ''


def extract_listings(payload: dict[str, Any]) -> list[dict[str, Any]]:
    data = payload.get('data')
    listings: Any = []
    if isinstance(data, dict) and isinstance(data.get('listings'), list):
        listings = data.get('listings')
    elif isinstance(payload.get('listings'), list):
        listings = payload.get('listings')
    if not isinstance(listings, list):
        return []

    out: list[dict[str, Any]] = []
    for row in listings:
        if not isinstance(row, dict):
            continue
        listing_id = str(row.get('id') or '').strip()
        name = str(row.get('name') or '').strip()
        if not listing_id or not name:
            continue
        out.append(
            {
                'id': listing_id,
                'name': name,
                'status': str(row.get('status') or '').strip().lower(),
                'slug': str(row.get('slug') or '').strip(),
                'publicUrl': str(row.get('publicUrl') or '').strip(),
                'price': to_non_negative_int(row.get('price')),
                'versions': to_non_negative_int(row.get('versions')),
                'updatedAt': str(row.get('updatedAt') or '').strip(),
            }
        )
    return out


def compact_listing_state(row: dict[str, Any]) -> dict[str, Any]:
    return {
        'name': str(row.get('name') or '').strip(),
        'status': str(row.get('status') or '').strip().lower(),
        'slug': str(row.get('slug') or '').strip(),
        'price': to_non_negative_int(row.get('price')),
        'versions': to_non_negative_int(row.get('versions')),
        'updatedAt': str(row.get('updatedAt') or '').strip(),
    }


def safe_short_id(value: str) -> str:
    cleaned = ''.join(ch for ch in value.lower() if ch.isalnum())
    return cleaned[:12] if cleaned else 'unknown'


def build_task(
    task_id: str,
    task_type: str,
    priority: str,
    title: str,
    objective: str,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        'id': task_id,
        'type': task_type,
        'priority': priority,
        'title': title,
        'objective': objective,
        'status': 'todo',
    }
    if extra:
        payload.update(extra)
    return payload


def distribution_channels_ready() -> bool:
    keys = [
        'TWITTER_API_KEY',
        'TWITTER_API_SECRET',
        'TWITTER_ACCESS_TOKEN',
        'TWITTER_ACCESS_SECRET',
        'TG_TWITTER_API_KEY',
        'TG_TWITTER_API_SECRET',
        'TG_TWITTER_ACCESS_TOKEN',
        'TG_TWITTER_ACCESS_SECRET',
        'TELEGRAM_BOT_TOKEN',
        'TELEGRAM_XPOST_BOT_TOKEN',
        'DISCORD_WEBHOOK_URL',
        'SLACK_WEBHOOK_URL',
        'SENDGRID_API_KEY',
        'RESEND_API_KEY',
    ]
    return any(bool(os.getenv(key, '').strip()) for key in keys)


def extract_routed_total_sales(receipt: dict[str, Any]) -> int:
    for key in ('clawMartTotalSalesRouted', 'totalSalesRouted', 'clawMartTotalSales', 'totalSales'):
        if key in receipt:
            return to_non_negative_int(receipt.get(key))
    return 0


def existing_clawmart_order_checkpoints(path: Path) -> set[int]:
    if not path.exists():
        return set()
    checkpoints: set[int] = set()
    for raw in path.read_text(encoding='utf-8').splitlines():
        line = raw.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except Exception:
            continue
        if not isinstance(row, dict):
            continue
        source = str(row.get('source') or '').strip().lower()
        kind = str(row.get('kind') or '').strip().lower()
        if source != 'clawmart' or kind != 'paid_order':
            continue
        checkpoint = to_non_negative_int(row.get('orderCheckpoint'), 0)
        if checkpoint > 0:
            checkpoints.add(checkpoint)
    return checkpoints


def append_sales_ledger_rows(previous_total_sales: int, total_sales: int, ts: str) -> int:
    if total_sales <= previous_total_sales:
        return 0
    existing = existing_clawmart_order_checkpoints(REVENUE_LEDGER_PATH)
    unit_gross = max(0.0, to_float(CLAWMART_ORDER_GROSS_USD, 0.0))
    unit_cost = max(0.0, to_float(CLAWMART_ORDER_COST_USD, 0.0))
    if CLAWMART_ORDER_NET_USD is None:
        unit_net = unit_gross - unit_cost
    else:
        unit_net = to_float(CLAWMART_ORDER_NET_USD, unit_gross - unit_cost)
    added = 0
    for checkpoint in range(previous_total_sales + 1, total_sales + 1):
        if checkpoint in existing:
            continue
        row = {
            'id': f'clawmart-order-{checkpoint}',
            'source': 'clawmart',
            'kind': 'paid_order',
            'status': 'success',
            'at': ts,
            'orderCheckpoint': checkpoint,
            'totalSalesSnapshot': total_sales,
            'grossUsd': round(unit_gross, 8),
            'costUsd': round(unit_cost, 8),
            'netUsd': round(unit_net, 8),
            'valueEstimated': True,
        }
        append_json_line(REVENUE_LEDGER_PATH, row)
        added += 1
    return added


def staking_route_checkpoint(receipts_path: Path, required_pool_url: str) -> dict[str, Any]:
    if not receipts_path.exists():
        return {'lastRoutedTotalSales': 0, 'receiptCount': 0, 'lastReceiptAt': ''}

    last_routed_total_sales = 0
    receipt_count = 0
    last_receipt_at = ''
    try:
        rows = receipts_path.read_text(encoding='utf-8').splitlines()
    except Exception:
        return {'lastRoutedTotalSales': 0, 'receiptCount': 0, 'lastReceiptAt': ''}

    for raw in rows:
        line = raw.strip()
        if not line:
            continue
        try:
            receipt = json.loads(line)
        except Exception:
            continue
        if not isinstance(receipt, dict):
            continue

        pool_url = str(receipt.get('stakingPoolUrl') or receipt.get('poolUrl') or '').strip()
        if required_pool_url and pool_url != required_pool_url:
            continue

        source = str(receipt.get('source') or receipt.get('channel') or '').strip().lower()
        if source and source not in {'clawmart', 'claw_mart', 'kyoshin_clawmart'}:
            continue

        routed_total_sales = extract_routed_total_sales(receipt)
        if routed_total_sales <= 0:
            continue

        receipt_count += 1
        receipt_at = str(receipt.get('at') or receipt.get('timestamp') or receipt.get('routedAt') or '').strip()
        if routed_total_sales > last_routed_total_sales:
            last_routed_total_sales = routed_total_sales
            last_receipt_at = receipt_at
            continue
        if routed_total_sales == last_routed_total_sales and receipt_at:
            if not last_receipt_at or receipt_at > last_receipt_at:
                last_receipt_at = receipt_at

    return {
        'lastRoutedTotalSales': last_routed_total_sales,
        'receiptCount': receipt_count,
        'lastReceiptAt': last_receipt_at,
    }


def select_listing_url(listings: list[dict[str, Any]], keywords: list[str]) -> str:
    normalized = [keyword.strip().lower() for keyword in keywords if keyword.strip()]
    for row in listings:
        name = str(row.get('name') or '').strip().lower()
        public_url = str(row.get('publicUrl') or '').strip()
        if not public_url:
            continue
        if any(keyword in name for keyword in normalized):
            return public_url
    for row in listings:
        public_url = str(row.get('publicUrl') or '').strip()
        if public_url:
            return public_url
    return DASHBOARD_URL


def build_promo_posts(listings: list[dict[str, Any]]) -> list[dict[str, str]]:
    operator_url = select_listing_url(listings, ['operator persona', 'trust layer operator', 'autonomous operator'])
    revenue_url = select_listing_url(listings, ['revenue ops'])
    x402_url = select_listing_url(listings, ['x402'])
    escrow_url = select_listing_url(listings, ['escrow'])
    dispute_url = select_listing_url(listings, ['dispute triage', 'dispute arbiter'])

    return [
        {
            'id': 'x-post-1',
            'channel': 'x',
            'text': (
                'Kyoshin launch pricing is live for autonomous ops: '
                f'Operator Persona ($79) {operator_url} | Revenue Ops Loop ($119) {revenue_url}. '
                'Built for teams that need execution + receipts, not hype.'
            ),
        },
        {
            'id': 'x-post-2',
            'channel': 'x',
            'text': (
                'If you run paid API routes, this is the fastest path to x402 execution: '
                f'Kyoshin x402 Facilitator Pipeline ($99) {x402_url}. '
                'Includes pricing ingestion, route execution checks, and settlement verification.'
            ),
        },
        {
            'id': 'x-post-3',
            'channel': 'x',
            'text': (
                'Trust layer stack is now modular: '
                f'Escrow Rail Setup ($149) {escrow_url} + Dispute Triage ($129) {dispute_url}. '
                'Use both to move from ad-hoc handling to repeatable trust ops.'
            ),
        },
    ]


def build_outreach_targets(listings: list[dict[str, Any]]) -> list[dict[str, str]]:
    operator_url = select_listing_url(listings, ['operator persona', 'trust layer operator', 'autonomous operator'])
    revenue_url = select_listing_url(listings, ['revenue ops'])
    x402_url = select_listing_url(listings, ['x402'])
    escrow_url = select_listing_url(listings, ['escrow'])
    dispute_url = select_listing_url(listings, ['dispute triage', 'dispute arbiter'])
    mcp_url = select_listing_url(listings, ['mcp'])

    base_dm = (
        'Hey {target}, quick note: we packaged a Kyoshin operator offer for {pain}. '
        'It is live here: {url}. If useful, I can share the exact setup path for your stack.'
    )

    specs = [
        ('solana_infra_founder', 'Solana infra founder', 'turning paid API routes into reliable revenue', x402_url),
        ('ai_agent_builder', 'AI agent builder', 'running autonomous execution with auditable receipts', revenue_url),
        ('defi_ops_lead', 'DeFi ops lead', 'operating trust flows with fewer manual handoffs', operator_url),
        ('marketplace_operator', 'Marketplace operator', 'dispute intake and escalation routing', dispute_url),
        ('escrow_startup', 'Escrow startup founder', 'shipping escrow rails with predictable operations', escrow_url),
        ('mcp_platform_engineer', 'MCP platform engineer', 'wiring trust-layer services into MCP adapters', mcp_url),
        ('dao_treasury_ops', 'DAO treasury operator', 'safer autonomous runbooks for execution teams', operator_url),
        ('x402_api_team', 'x402 API team lead', 'reducing friction from pricing to paid execution', x402_url),
        ('web3_support_head', 'Web3 support head', 'triaging trust incidents before they escalate', dispute_url),
        ('automation_consultant', 'automation consultant', 'productized autonomy loops for client ops', revenue_url),
    ]

    targets: list[dict[str, str]] = []
    for target_id, target_label, pain, offer_url in specs:
        targets.append(
            {
                'id': target_id,
                'target': target_label,
                'pain': pain,
                'offerUrl': offer_url,
                'dm': base_dm.format(target=target_label, pain=pain, url=offer_url),
            }
        )
    return targets


def run() -> int:
    ensure_dirs()

    backlog_payload = read_json(BACKLOG_PATH, {'ok': True, 'at': now_iso(), 'items': []})
    board_payload = read_json(BOARD_PATH, {'ok': True, 'at': now_iso(), 'focus': []})
    state_payload = read_json(STATE_PATH, {'totalSales': 0, 'listings': {}, 'lastRoutedTotalSales': 0})

    backlog_items = backlog_payload.get('items') if isinstance(backlog_payload, dict) else []
    if not isinstance(backlog_items, list):
        backlog_items = []
    board = board_payload if isinstance(board_payload, dict) else {'ok': True, 'at': now_iso(), 'focus': []}
    previous_total_sales = to_non_negative_int(state_payload.get('totalSales') if isinstance(state_payload, dict) else 0)
    previous_listings = state_payload.get('listings') if isinstance(state_payload, dict) else {}
    previous_growth_task_date = str(state_payload.get('lastGrowthTaskDate') or '').strip() if isinstance(state_payload, dict) else ''
    first_tracked_at = str(state_payload.get('firstTrackedAt') or '').strip() if isinstance(state_payload, dict) else ''
    previous_last_routed_total_sales = (
        to_non_negative_int(state_payload.get('lastRoutedTotalSales')) if isinstance(state_payload, dict) else 0
    )
    if not isinstance(previous_listings, dict):
        previous_listings = {}

    if not API_KEY:
        output = {
            'ok': False,
            'status': 'skipped',
            'reason': 'missing_api_key',
            'at': now_iso(),
            'tasksAdded': 0,
            'salesDelta': 0,
        }
        write_json(OUTPUT_PATH, output)
        print(json.dumps(output, ensure_ascii=True))
        return 0

    try:
        me_payload = fetch_json('/me')
        listings_payload = fetch_json('/listings')
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
        output = {
            'ok': False,
            'status': 'failed',
            'reason': 'api_error',
            'error': str(exc)[:500],
            'at': now_iso(),
            'tasksAdded': 0,
            'salesDelta': 0,
        }
        write_json(OUTPUT_PATH, output)
        print(json.dumps(output, ensure_ascii=True))
        return 0

    total_sales = extract_total_sales(me_payload)
    profile_id = extract_profile_id(me_payload)
    listings = extract_listings(listings_payload)
    current_map = {row['id']: compact_listing_state(row) for row in listings}

    active_count = sum(1 for row in listings if row.get('status') == 'active')
    sales_delta = max(0, total_sales - previous_total_sales)
    ledger_rows_appended = append_sales_ledger_rows(previous_total_sales, total_sales, now_iso()) if sales_delta > 0 else 0
    checkpoint = staking_route_checkpoint(STAKING_ROUTE_RECEIPTS_PATH, KAMIYO_STAKING_POOL_URL)
    last_routed_total_sales = max(previous_last_routed_total_sales, to_non_negative_int(checkpoint.get('lastRoutedTotalSales')))
    unrouted_sales_count = max(0, total_sales - last_routed_total_sales)
    staking_route_compliant = unrouted_sales_count == 0

    existing_ids = {str(row.get('id') or '') for row in backlog_items if isinstance(row, dict)}
    existing_growth_task_present = any(task_id.startswith('clawmart-growth-') for task_id in existing_ids)
    existing_promo_task_present = any(task_id.startswith('clawmart-promo-') for task_id in existing_ids)
    existing_outreach_task_present = any(task_id.startswith('clawmart-outreach-') for task_id in existing_ids)
    existing_channel_setup_task_present = any(task_id.startswith('clawmart-channel-setup-') for task_id in existing_ids)
    existing_staking_route_task_present = any(task_id.startswith('clawmart-staking-route-') for task_id in existing_ids)
    new_tasks: list[dict[str, Any]] = []

    def add_task(task: dict[str, Any]) -> None:
        task_id = str(task.get('id') or '')
        if not task_id or task_id in existing_ids:
            return
        if len(new_tasks) >= MAX_TASKS:
            return
        existing_ids.add(task_id)
        new_tasks.append(task)

    if sales_delta > 0:
        add_task(
            build_task(
                task_id=f'clawmart-sales-{total_sales}',
                task_type='clawmart_fulfillment',
                priority='high',
                title=f'[ClawMart] Fulfill {sales_delta} new sale(s)',
                objective=(
                    f'ClawMart totalSales increased from {previous_total_sales} to {total_sales}. '
                    f'Pull buyer/order details from {DASHBOARD_URL}, execute delivery, and append execution receipts.'
                ),
                extra={
                    'channel': 'clawmart',
                    'salesDelta': sales_delta,
                    'dashboardUrl': DASHBOARD_URL,
                },
            )
        )
    if REQUIRE_STAKING_ROUTE and unrouted_sales_count > 0 and (sales_delta > 0 or not existing_staking_route_task_present):
        add_task(
            build_task(
                task_id=f'clawmart-staking-route-{total_sales}',
                task_type='clawmart_staking_route',
                priority='high',
                title=f'[ClawMart] Route {unrouted_sales_count} unrouted sale(s) to KAMIYO staking',
                objective=(
                    f'Route all ClawMart earnings to the KAMIYO staking pool ({KAMIYO_STAKING_POOL_URL}) '
                    f'and append a route receipt row at {STAKING_ROUTE_RECEIPTS_PATH}. '
                    f'Required routed totalSales checkpoint: {total_sales}.'
                ),
                extra={
                    'channel': 'clawmart',
                    'requiredPoolUrl': KAMIYO_STAKING_POOL_URL,
                    'requiredRoutedTotalSales': total_sales,
                    'stakingReceiptPath': str(STAKING_ROUTE_RECEIPTS_PATH),
                    'unroutedSalesCount': unrouted_sales_count,
                },
            )
        )

    for listing in listings:
        listing_id = listing['id']
        short_id = safe_short_id(listing_id)
        current_versions = to_non_negative_int(listing.get('versions'))
        current_status = str(listing.get('status') or '').strip().lower()
        listing_name = str(listing.get('name') or '').strip()
        listing_url = str(listing.get('publicUrl') or '').strip()
        previous_row = previous_listings.get(listing_id)
        if not isinstance(previous_row, dict):
            add_task(
                build_task(
                    task_id=f'clawmart-listing-new-{short_id}',
                    task_type='clawmart_listing_launch',
                    priority='medium',
                    title=f'[ClawMart] Launch plan: {listing_name}',
                    objective=f'New listing detected. Publish an execution-proof post and route demand to fulfillment lane: {listing_url or DASHBOARD_URL}',
                    extra={'listingId': listing_id, 'listingName': listing_name},
                )
            )
            continue

        previous_versions = to_non_negative_int(previous_row.get('versions'))
        previous_status = str(previous_row.get('status') or '').strip().lower()

        if current_status != previous_status:
            add_task(
                build_task(
                    task_id=f'clawmart-status-{short_id}-{current_status or "unknown"}',
                    task_type='clawmart_listing_state_change',
                    priority='medium',
                    title=f'[ClawMart] Listing state changed: {listing_name}',
                    objective=f'Status changed from {previous_status or "unknown"} to {current_status or "unknown"}. Verify storefront and update outreach copy.',
                    extra={'listingId': listing_id, 'listingName': listing_name},
                )
            )

        if current_versions > previous_versions:
            add_task(
                build_task(
                    task_id=f'clawmart-version-{short_id}-{current_versions}',
                    task_type='clawmart_listing_version_update',
                    priority='medium',
                    title=f'[ClawMart] Promote v{current_versions}: {listing_name}',
                    objective=f'New listing version detected (v{current_versions}). Publish changelog and refresh conversion messaging.',
                    extra={'listingId': listing_id, 'listingName': listing_name, 'listingVersion': current_versions},
                )
            )

    now_ts = now_iso()
    today = now_ts[:10]
    next_growth_task_date = previous_growth_task_date
    if total_sales == 0 and active_count > 0:
        if previous_growth_task_date != today or not existing_growth_task_present:
            add_task(
                build_task(
                    task_id=f'clawmart-growth-{today}',
                    task_type='clawmart_growth_sprint',
                    priority='high',
                    title='[ClawMart] Growth sprint: first paid order',
                    objective=(
                        'No ClawMart sales recorded yet. Run one conversion sprint today: '
                        'refresh top listing copy, publish 2 proof posts with listing links, '
                        'send targeted outreach to 10 buyers, and log conversion receipts + learnings.'
                    ),
                    extra={'channel': 'clawmart', 'dashboardUrl': DASHBOARD_URL},
                )
            )
        promo_posts = build_promo_posts(listings)
        outreach_targets = build_outreach_targets(listings)
        if previous_growth_task_date != today or not existing_promo_task_present:
            add_task(
                build_task(
                    task_id=f'clawmart-promo-{today}',
                    task_type='clawmart_promo_blast',
                    priority='high',
                    title='[ClawMart] Publish promo posts',
                    objective='Publish 3 conversion-focused posts with direct listing links and track clicks/replies.',
                    extra={'channel': 'clawmart', 'posts': promo_posts},
                )
            )
        if previous_growth_task_date != today or not existing_outreach_task_present:
            add_task(
                build_task(
                    task_id=f'clawmart-outreach-{today}',
                    task_type='clawmart_outreach_sprint',
                    priority='high',
                    title='[ClawMart] Run 10-target outbound outreach',
                    objective='Send targeted DMs to 10 high-fit buyers and log responses + conversion receipts.',
                    extra={'channel': 'clawmart', 'targets': outreach_targets},
                )
            )
        if (previous_growth_task_date != today or not existing_channel_setup_task_present) and not distribution_channels_ready():
            add_task(
                build_task(
                    task_id=f'clawmart-channel-setup-{today}',
                    task_type='clawmart_distribution_channel_setup',
                    priority='high',
                    title='[ClawMart] Configure outbound distribution channel',
                    objective=(
                        'No outbound channel credentials are configured. '
                        'Set at least one channel for automated distribution (X, Telegram, Discord, Slack, or email) '
                        'and verify one successful dispatch receipt.'
                    ),
                    extra={'channel': 'clawmart'},
                )
            )
        next_growth_task_date = today

    no_sales_days = 0
    effective_first_tracked_at = first_tracked_at or now_ts
    if total_sales == 0:
        try:
            first_day = datetime.fromisoformat(effective_first_tracked_at.replace('Z', '+00:00')).date()
            today_day = datetime.fromisoformat(now_ts.replace('Z', '+00:00')).date()
            no_sales_days = max(0, (today_day - first_day).days)
        except Exception:
            no_sales_days = 0

    updated_items = new_tasks + [row for row in backlog_items if isinstance(row, dict)]
    backlog_out = {
        'ok': True,
        'at': now_ts,
        'items': updated_items,
    }
    write_json(BACKLOG_PATH, backlog_out)

    board.update(
        {
            'ok': True,
            'at': backlog_out['at'],
            'backlogCount': len(updated_items),
            'clawMartProfileId': profile_id,
            'clawMartTotalSales': total_sales,
            'clawMartSalesDelta': sales_delta,
            'clawMartListingsActive': active_count,
            'clawMartListingsTotal': len(listings),
            'clawMartNoSalesDays': no_sales_days,
            'clawMartDistributionChannelsReady': distribution_channels_ready(),
            'clawMartStakingPoolUrl': KAMIYO_STAKING_POOL_URL,
            'clawMartStakingRouteRequired': REQUIRE_STAKING_ROUTE,
            'clawMartStakingRouteCompliant': staking_route_compliant,
            'clawMartLastRoutedTotalSales': last_routed_total_sales,
            'clawMartUnroutedSalesCount': unrouted_sales_count,
            'clawMartStakingReceiptCount': to_non_negative_int(checkpoint.get('receiptCount')),
            'clawMartLastStakingReceiptAt': str(checkpoint.get('lastReceiptAt') or '').strip(),
            'clawMartRevenueLedgerPath': str(REVENUE_LEDGER_PATH),
            'clawMartLedgerRowsAppended': ledger_rows_appended,
        }
    )
    write_json(BOARD_PATH, board)

    next_state = {
        'ok': True,
        'at': backlog_out['at'],
        'profileId': profile_id,
        'totalSales': total_sales,
        'activeListings': active_count,
        'listings': current_map,
        'firstTrackedAt': effective_first_tracked_at,
        'lastGrowthTaskDate': next_growth_task_date,
        'noSalesDays': no_sales_days,
        'distributionChannelsReady': distribution_channels_ready(),
        'stakingPoolUrl': KAMIYO_STAKING_POOL_URL,
        'stakingRouteReceiptsPath': str(STAKING_ROUTE_RECEIPTS_PATH),
        'stakingRouteRequired': REQUIRE_STAKING_ROUTE,
        'stakingRouteCompliant': staking_route_compliant,
        'lastRoutedTotalSales': last_routed_total_sales,
        'unroutedSalesCount': unrouted_sales_count,
        'stakingReceiptCount': to_non_negative_int(checkpoint.get('receiptCount')),
        'lastStakingReceiptAt': str(checkpoint.get('lastReceiptAt') or '').strip(),
        'revenueLedgerPath': str(REVENUE_LEDGER_PATH),
        'ledgerRowsAppended': ledger_rows_appended,
        'lastAddedTaskIds': [str(row.get('id') or '') for row in new_tasks],
    }
    write_json(STATE_PATH, next_state)

    policy_ok = True
    policy_reason = ''
    if REQUIRE_STAKING_ROUTE and not staking_route_compliant:
        policy_ok = False
        policy_reason = 'staking_route_non_compliant'

    output = {
        'ok': policy_ok,
        'status': 'ok' if policy_ok else 'policy_blocked',
        'at': backlog_out['at'],
        'tasksAdded': len(new_tasks),
        'salesDelta': sales_delta,
        'totalSales': total_sales,
        'activeListings': active_count,
        'listingsTotal': len(listings),
        'noSalesDays': no_sales_days,
        'distributionChannelsReady': distribution_channels_ready(),
        'stakingPoolUrl': KAMIYO_STAKING_POOL_URL,
        'stakingRouteRequired': REQUIRE_STAKING_ROUTE,
        'stakingRouteCompliant': staking_route_compliant,
        'lastRoutedTotalSales': last_routed_total_sales,
        'unroutedSalesCount': unrouted_sales_count,
        'stakingReceiptCount': to_non_negative_int(checkpoint.get('receiptCount')),
        'stakingReceiptPath': str(STAKING_ROUTE_RECEIPTS_PATH),
        'revenueLedgerPath': str(REVENUE_LEDGER_PATH),
        'ledgerRowsAppended': ledger_rows_appended,
        'statePath': str(STATE_PATH),
        'backlogPath': str(BACKLOG_PATH),
    }
    if not policy_ok:
        output['reason'] = policy_reason
    write_json(OUTPUT_PATH, output)
    print(json.dumps(output, ensure_ascii=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(run())
