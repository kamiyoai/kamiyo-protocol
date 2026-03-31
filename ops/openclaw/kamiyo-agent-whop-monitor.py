#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

HOME_DIR = Path(os.environ.get('HOME', '~')).expanduser()
WORKSPACE = HOME_DIR / '.openclaw' / 'workspace'
RUNTIME_DIR = WORKSPACE / 'runtime'
STATE_DIR = RUNTIME_DIR / 'state'
RECEIPTS_DIR = RUNTIME_DIR / 'receipts'
LOG_DIR = RUNTIME_DIR / 'logs'

STATE_PATH = STATE_DIR / 'whop-monitor-state.json'
OUTPUT_PATH = STATE_DIR / 'whop-monitor.json'
LOG_PATH = LOG_DIR / 'whop-monitor.jsonl'
LEDGER_PATH = Path(
    os.getenv('KYO_REVENUE_LEDGER_PATH', str(RECEIPTS_DIR / 'revenue-ledger.jsonl')).strip()
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
SETTLEMENT_LAG_HOURS = max(0, min(168, env_int('KYO_WHOP_SETTLEMENT_LAG_HOURS', 24)))
HTTP_TIMEOUT_SECONDS = max(3, min(60, env_int('KYO_WHOP_TIMEOUT_SECONDS', 15)))
MAX_PAYMENTS = max(1, min(1000, env_int('KYO_WHOP_MONITOR_MAX_PAYMENTS', 200)))

PAID_STATUSES = {'paid', 'succeeded', 'completed', 'settled', 'active'}
REFUND_STATUSES = {'refunded', 'partially_refunded', 'partially-refunded', 'chargeback', 'reversed'}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_dirs() -> None:
    for path in (WORKSPACE, RUNTIME_DIR, STATE_DIR, RECEIPTS_DIR, LOG_DIR, LEDGER_PATH.parent):
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
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a', encoding='utf-8') as handle:
        handle.write(json.dumps(payload, ensure_ascii=True) + '\n')
    path.chmod(0o600)


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


def parse_float(value: Any, default: float = 0.0) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except Exception:
            return default
    return default


def to_usd(value: Any, cents: bool = False) -> float:
    amount = parse_float(value, 0.0)
    if cents:
        amount /= 100.0
    return round(amount, 8)


def money_from(item: dict[str, Any], keys: list[tuple[str, bool]]) -> float | None:
    for key, cents in keys:
        if key not in item:
            continue
        raw = item.get(key)
        if raw is None or raw == '':
            continue
        return to_usd(raw, cents=cents)
    return None


def request_json(path: str, query: dict[str, Any] | None = None) -> dict[str, Any]:
    if not API_BASE_URL:
        raise RuntimeError('missing_whop_api_base_url')
    if not API_KEY:
        raise RuntimeError('missing_whop_api_key')

    url = f'{API_BASE_URL}{path}'
    if query:
        pairs = [(str(k), str(v)) for k, v in query.items() if v is not None and str(v) != '']
        if pairs:
            url += '?' + urllib.parse.urlencode(pairs)
    request = urllib.request.Request(
        url=url,
        headers={
            'Authorization': f'Bearer {API_KEY}',
            'Accept': 'application/json',
            'User-Agent': 'kamiyo-agent-whop-monitor/1.0',
        },
        method='GET',
    )
    with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
        payload = response.read().decode('utf-8')
    decoded = json.loads(payload)
    if not isinstance(decoded, dict):
        raise ValueError(f'non-object JSON from {path}')
    return decoded


def extract_items(payload: dict[str, Any]) -> list[dict[str, Any]]:
    candidates: list[Any] = []
    for key in ('data', 'items', 'results', 'payments'):
        candidates.append(payload.get(key))
    data = payload.get('data')
    if isinstance(data, dict):
        for key in ('payments', 'items', 'results'):
            candidates.append(data.get(key))
    for value in candidates:
        if isinstance(value, list):
            return [row for row in value if isinstance(row, dict)]
    return []


def fetch_payments() -> list[dict[str, Any]]:
    attempts = [
        ('/companies/{company_id}/payments', {'limit': MAX_PAYMENTS}),
        ('/payments', {'company_id': COMPANY_ID, 'limit': MAX_PAYMENTS}),
    ]
    last_exc: Exception | None = None
    for template, query in attempts:
        path = template.format(company_id=COMPANY_ID)
        try:
            payload = request_json(path, query=query)
            return extract_items(payload)
        except Exception as exc:
            last_exc = exc
    if last_exc is not None:
        raise last_exc
    return []


def payment_id(item: dict[str, Any]) -> str:
    return str(item.get('id') or item.get('payment_id') or item.get('paymentId') or '').strip()


def payment_status(item: dict[str, Any]) -> str:
    return str(item.get('status') or item.get('payment_status') or '').strip().lower()


def payment_ts(item: dict[str, Any]) -> str:
    for key in ('paid_at', 'paidAt', 'captured_at', 'capturedAt', 'created_at', 'createdAt'):
        value = str(item.get(key) or '').strip()
        if value:
            return value
    return ''


def normalize_payment(item: dict[str, Any]) -> dict[str, Any] | None:
    pid = payment_id(item)
    if not pid:
        return None
    status = payment_status(item)
    if not status:
        return None
    if status not in PAID_STATUSES and status not in REFUND_STATUSES:
        return None

    gross = money_from(
        item,
        [
            ('amount_after_discount', True),
            ('gross_amount_cents', True),
            ('amount_cents', True),
            ('amount_after_discount', False),
            ('gross_amount', False),
            ('amount', False),
            ('total', False),
        ],
    )
    if gross is None:
        gross = 0.0
    amount_after_fees = money_from(
        item,
        [
            ('amount_after_fees_cents', True),
            ('net_amount_cents', True),
            ('amount_after_fees', False),
            ('net_amount', False),
            ('settled_amount', False),
        ],
    )
    if amount_after_fees is None:
        amount_after_fees = gross
    refunded = money_from(
        item,
        [
            ('refunded_amount_cents', True),
            ('refund_amount_cents', True),
            ('refunded_amount', False),
            ('refund_amount', False),
        ],
    )
    if refunded is None:
        refunded = 0.0

    net_basis = round(amount_after_fees - refunded, 8)
    return {
        'id': pid,
        'status': status,
        'paidAt': payment_ts(item),
        'currency': str(item.get('currency') or 'USD').strip().upper() or 'USD',
        'grossUsd': round(max(0.0, gross), 8),
        'netBasisUsd': net_basis,
        'refundedUsd': round(max(0.0, refunded), 8),
        'productId': str(item.get('product_id') or item.get('productId') or '').strip(),
        'planId': str(item.get('plan_id') or item.get('planId') or '').strip(),
        'paymentRef': str(item.get('external_id') or item.get('receipt') or item.get('order_id') or '').strip(),
    }


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


def summarize_whop_7d(rows: list[dict[str, Any]]) -> dict[str, float | int]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    gross = 0.0
    net = 0.0
    paid_orders = 0
    refunds = 0
    for row in rows:
        source = str(row.get('source') or '').strip().lower()
        if source != 'whop':
            continue
        kind = str(row.get('kind') or '').strip().lower()
        status = str(row.get('status') or '').strip().lower()
        ts = parse_ts(row.get('at') or row.get('timestamp') or row.get('executedAt'))
        if ts is None or ts < cutoff:
            continue
        if status != 'success':
            continue
        if kind == 'paid_order':
            gross += max(0.0, parse_float(row.get('grossUsd'), 0.0))
            paid_orders += 1
        if kind == 'refund_adjustment':
            refunds += 1
        if kind in {'paid_order', 'refund_adjustment'}:
            net += parse_float(row.get('netUsd'), 0.0)
    return {
        'grossUsd7d': round(gross, 8),
        'netUsd7d': round(net, 8),
        'paidOrders7d': paid_orders,
        'refundAdjustments7d': refunds,
    }


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

    state = read_json(STATE_PATH, {})
    if not isinstance(state, dict):
        state = {}
    payment_state = state.get('payments') if isinstance(state.get('payments'), dict) else {}
    if not isinstance(payment_state, dict):
        payment_state = {}

    try:
        raw_payments = fetch_payments()
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError, RuntimeError) as exc:
        summary = {
            'ok': False,
            'status': 'failed',
            'reason': 'api_error',
            'error': str(exc)[:400],
            'startedAt': started_at,
            'at': now_iso(),
        }
        write_json(STATE_PATH, {'lastRunAt': summary['at'], 'payments': payment_state, 'lastStatus': summary})
        write_json(OUTPUT_PATH, summary)
        append_json_line(LOG_PATH, {'at': summary['at'], 'event': 'whop_monitor', 'ok': False, 'reason': summary['reason']})
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    now = datetime.now(timezone.utc)
    lag_delta = timedelta(hours=SETTLEMENT_LAG_HOURS)
    rows_added = 0
    updates_processed = 0
    settled_count = 0
    unsettled_usd = 0.0
    realized_net_total_usd = 0.0

    for raw in raw_payments:
        normalized = normalize_payment(raw)
        if normalized is None:
            continue

        pid = normalized['id']
        paid_ts = parse_ts(normalized['paidAt'])
        realized = paid_ts is not None and (now - paid_ts) >= lag_delta
        prev = payment_state.get(pid) if isinstance(payment_state.get(pid), dict) else {}
        prev_net = parse_float(prev.get('netBasisUsd'), 0.0)
        prev_gross = max(0.0, parse_float(prev.get('grossUsd'), 0.0))
        prev_realized = bool(prev.get('realized', False))

        net_basis = round(normalized['netBasisUsd'], 8)
        delta_net = round(net_basis - prev_net, 8)
        status = normalized['status']
        effective_realized = realized or prev_realized

        if effective_realized:
            realized_net_total_usd += net_basis
            settled_count += 1
        else:
            unsettled_usd += max(0.0, net_basis)

        if abs(delta_net) >= 0.00000001:
            updates_processed += 1
            at = now_iso()
            if delta_net > 0:
                delta_gross = round(max(0.0, normalized['grossUsd'] - prev_gross), 8)
                gross_usd = delta_gross if delta_gross > 0 else round(delta_net, 8)
                cost_usd = round(max(0.0, gross_usd - delta_net), 8)
                row = {
                    'id': f'whop-paid-{pid}-{int(now.timestamp())}',
                    'source': 'whop',
                    'kind': 'paid_order',
                    'status': 'success',
                    'at': at,
                    'paymentId': pid,
                    'productId': normalized['productId'],
                    'planId': normalized['planId'],
                    'grossUsd': gross_usd,
                    'costUsd': cost_usd,
                    'netUsd': round(delta_net, 8),
                    'realized': effective_realized,
                    'paymentRef': normalized['paymentRef'],
                    'checkpointId': f'whop:{pid}:{int(now.timestamp())}',
                    'currency': normalized['currency'],
                }
                append_json_line(LEDGER_PATH, row)
                rows_added += 1
            else:
                row = {
                    'id': f'whop-refund-{pid}-{int(now.timestamp())}',
                    'source': 'whop',
                    'kind': 'refund_adjustment',
                    'status': 'success',
                    'at': at,
                    'paymentId': pid,
                    'productId': normalized['productId'],
                    'planId': normalized['planId'],
                    'grossUsd': 0.0,
                    'costUsd': round(abs(delta_net), 8),
                    'netUsd': round(delta_net, 8),
                    'realized': effective_realized,
                    'paymentRef': normalized['paymentRef'],
                    'checkpointId': f'whop:{pid}:{int(now.timestamp())}',
                    'currency': normalized['currency'],
                }
                append_json_line(LEDGER_PATH, row)
                rows_added += 1

        payment_state[pid] = {
            'status': status,
            'paidAt': normalized['paidAt'],
            'grossUsd': normalized['grossUsd'],
            'netBasisUsd': net_basis,
            'refundedUsd': normalized['refundedUsd'],
            'realized': realized,
            'productId': normalized['productId'],
            'planId': normalized['planId'],
            'paymentRef': normalized['paymentRef'],
            'updatedAt': now_iso(),
        }

    rows = ledger_rows(LEDGER_PATH)
    kpis = summarize_whop_7d(rows)
    at = now_iso()
    summary = {
        'ok': True,
        'status': 'ok',
        'startedAt': started_at,
        'at': at,
        'paymentsSeen': len(raw_payments),
        'paymentsTracked': len(payment_state),
        'updatesProcessed': updates_processed,
        'ledgerRowsAppended': rows_added,
        'settlementLagHours': SETTLEMENT_LAG_HOURS,
        'grossUsd7d': kpis['grossUsd7d'],
        'netUsd7d': kpis['netUsd7d'],
        'paidOrders7d': kpis['paidOrders7d'],
        'refundAdjustments7d': kpis['refundAdjustments7d'],
        'unsettledUsd': round(max(0.0, unsettled_usd), 8),
        'realizedNetUsdTotal': round(realized_net_total_usd, 8),
        'settledPayments': settled_count,
        'ledgerPath': str(LEDGER_PATH),
    }
    write_json(
        STATE_PATH,
        {
            'lastRunAt': at,
            'payments': payment_state,
            'lastStatus': summary,
        },
    )
    write_json(OUTPUT_PATH, summary)
    append_json_line(
        LOG_PATH,
        {
            'at': at,
            'event': 'whop_monitor',
            'ok': True,
            'paymentsSeen': len(raw_payments),
            'updatesProcessed': updates_processed,
            'ledgerRowsAppended': rows_added,
            'netUsd7d': kpis['netUsd7d'],
            'unsettledUsd': round(max(0.0, unsettled_usd), 8),
        },
    )
    print(json.dumps(summary, ensure_ascii=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(run())
