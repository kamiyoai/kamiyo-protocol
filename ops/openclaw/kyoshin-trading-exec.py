#!/usr/bin/env python3
import hashlib
import json
import os
import shlex
import shutil
import subprocess
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

HOME_DIR = Path(os.environ.get('HOME', '~')).expanduser()
WORKSPACE = HOME_DIR / '.openclaw' / 'workspace'
RUNTIME_DIR = WORKSPACE / 'runtime'
FEEDS_DIR = RUNTIME_DIR / 'feeds'
STATE_DIR = RUNTIME_DIR / 'state'
RECEIPTS_DIR = RUNTIME_DIR / 'receipts'
LOG_DIR = RUNTIME_DIR / 'logs'

FEED_PATH = FEEDS_DIR / 'trading-opportunities.json'
POSITIONS_PATH = STATE_DIR / 'trading-positions.json'
STATE_PATH = STATE_DIR / 'trading-exec-state.json'
OUTPUT_PATH = STATE_DIR / 'trading-exec.json'
LEDGER_PATH = Path(
    os.getenv('KYO_REVENUE_LEDGER_PATH', str(RECEIPTS_DIR / 'revenue-ledger.jsonl')).strip()
).expanduser()
LOG_PATH = LOG_DIR / 'trading-exec.jsonl'

ENABLE_TRADING_AGENT = os.getenv('KYO_ENABLE_TRADING_AGENT', 'false').strip().lower() in {'1', 'true', 'yes', 'on'}
EXECUTION_MODE = os.getenv('KYO_TRADING_EXECUTION_MODE', 'paper').strip().lower() or 'paper'
VENUES = [
    item.strip().lower()
    for item in os.getenv('KYO_TRADING_VENUES', 'dflow,kalshi').split(',')
    if item.strip()
]
KALSHI_SIGNAL_ONLY = os.getenv('KYO_TRADING_KALSHI_SIGNAL_ONLY', 'true').strip().lower() in {'1', 'true', 'yes', 'on'}

DFLOW_API_BASE_URL = os.getenv('KYO_TRADING_DFLOW_API_BASE_URL', 'https://pond.dflow.net').strip().rstrip('/')
DFLOW_ORDER_PATH = os.getenv('KYO_TRADING_DFLOW_ORDER_PATH', '/api/v1/orders').strip() or '/api/v1/orders'
DFLOW_API_KEY = os.getenv('KYO_TRADING_DFLOW_API_KEY', '').strip()
DFLOW_EXEC_CMD = os.getenv('KYO_TRADING_DFLOW_EXEC_CMD', '').strip()
EXECUTION_BACKEND = os.getenv('KYO_TRADING_EXECUTION_BACKEND', 'dflow').strip().lower() or 'dflow'
SOLANA_KEYPAIR_PATH = (
    os.getenv('KYO_TRADING_SOLANA_KEYPAIR_PATH', '~/.config/solana/id.json').strip()
)
SOLANA_SIGNER_NODE_BIN = os.getenv('KYO_TRADING_SOLANA_SIGNER_NODE_BIN', 'node').strip() or 'node'
SINGULARITY_ORDER_TYPE = (
    os.getenv('KYO_TRADING_SINGULARITY_ORDER_TYPE', 'limit').strip().lower() or 'limit'
)
SINGULARITY_INCLUDE_PRICE = os.getenv('KYO_TRADING_SINGULARITY_INCLUDE_PRICE', 'false').strip().lower() in {
    '1',
    'true',
    'yes',
    'on',
}
SINGULARITY_TX_SIGNATURE_PREFIX = (
    os.getenv('KYO_TRADING_SINGULARITY_TX_SIGNATURE_PREFIX', 'kyo').strip() or 'kyo'
)
SINGULARITY_REQUIRE_TX_SIGNATURE = (
    os.getenv('KYO_TRADING_SINGULARITY_REQUIRE_TX_SIGNATURE', 'true').strip().lower()
    in {'1', 'true', 'yes', 'on'}
)

MAX_NOTIONAL_USD_PER_DAY = max(1.0, float(os.getenv('KYO_TRADING_MAX_NOTIONAL_USD_PER_DAY', '750')))
MAX_OPEN_POSITIONS = max(1, int(os.getenv('KYO_TRADING_MAX_OPEN_POSITIONS', '6')))
MAX_MARKET_EXPOSURE_USD = max(1.0, float(os.getenv('KYO_TRADING_MAX_MARKET_EXPOSURE_USD', '150')))
MAX_DRAWDOWN_PCT = max(0.1, float(os.getenv('KYO_TRADING_MAX_DRAWDOWN_PCT', '8')))
WEEKLY_LOSS_CAP_USD = max(1.0, float(os.getenv('KYO_TRADING_WEEKLY_LOSS_CAP_USD', '300')))
TAKE_PROFIT_PCT = max(0.1, float(os.getenv('KYO_TRADING_TAKE_PROFIT_PCT', '12')))
STOP_LOSS_PCT = max(0.1, float(os.getenv('KYO_TRADING_STOP_LOSS_PCT', '8')))
MAX_HOLD_HOURS = max(1.0, float(os.getenv('KYO_TRADING_MAX_HOLD_HOURS', '72')))
MAX_OPEN_PER_TICK = max(1, int(os.getenv('KYO_TRADING_MAX_OPEN_PER_TICK', '2')))
DEFAULT_POSITION_USD = max(1.0, float(os.getenv('KYO_TRADING_DEFAULT_POSITION_USD', '100')))
MIN_POSITION_USD = max(1.0, float(os.getenv('KYO_TRADING_MIN_POSITION_USD', '10')))
FEE_BPS = max(0.0, float(os.getenv('KYO_TRADING_FEE_BPS', '10')))
STARTING_EQUITY_USD = max(1.0, float(os.getenv('KYO_TRADING_STARTING_EQUITY_USD', '1000')))
KALSHI_SIGNAL_RECORD_LIMIT = max(0, int(os.getenv('KYO_TRADING_KALSHI_SIGNAL_RECORD_LIMIT', '3')))
RECENT_SIGNAL_LIMIT = max(20, min(1000, int(os.getenv('KYO_TRADING_RECENT_SIGNAL_LIMIT', '200'))))
TIMEOUT_SECONDS = max(3.0, min(45.0, float(os.getenv('KYO_TRADING_EXEC_TIMEOUT_SECONDS', '12'))))
EXEC_CMD_TIMEOUT_SECONDS = max(5, min(180, int(os.getenv('KYO_TRADING_EXEC_CMD_TIMEOUT_SECONDS', '45'))))
_LAST_AUTH_TS_MS = 0



def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()



def ensure_dirs() -> None:
    for path in (WORKSPACE, RUNTIME_DIR, FEEDS_DIR, STATE_DIR, RECEIPTS_DIR, LOG_DIR):
        path.mkdir(parents=True, exist_ok=True)
        path.chmod(0o700)
    LEDGER_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not LEDGER_PATH.exists():
        LEDGER_PATH.touch()
    LEDGER_PATH.chmod(0o600)



def write_json(path: Path, payload: Any) -> None:
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



def parse_float(value: Any, default: float = 0.0) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except Exception:
            return default
    return default



def parse_ts(value: Any) -> Optional[datetime]:
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



def normalize_path(path: str) -> str:
    if not path:
        return '/'
    return path if path.startswith('/') else f'/{path}'


def next_auth_timestamp_ms() -> int:
    global _LAST_AUTH_TS_MS
    now_ms = int(time.time() * 1000)
    if now_ms <= _LAST_AUTH_TS_MS:
        now_ms = _LAST_AUTH_TS_MS + 1
    _LAST_AUTH_TS_MS = now_ms
    return now_ms


def build_synthetic_tx_signature(
    action: str,
    market_id: str,
    reference_id: str,
    notional_usd: float,
    price: float,
) -> str:
    digest = hashlib.sha256(
        f'{action}:{market_id}:{reference_id}:{notional_usd:.8f}:{price:.8f}'.encode('utf-8')
    ).hexdigest()
    return f'{SINGULARITY_TX_SIGNATURE_PREFIX}_{digest}'


def build_idempotency_key(action: str, market_id: str, reference_id: str) -> str:
    digest = hashlib.sha256(f'{action}:{market_id}:{reference_id}'.encode('utf-8')).hexdigest()[:24]
    return f'kyoshin-{action}-{market_id[:24]}-{digest}'


def sign_keiro_auth(timestamp_ms: int) -> dict[str, Any]:
    keypair_path = Path(SOLANA_KEYPAIR_PATH).expanduser()
    if not keypair_path.exists():
        return {'ok': False, 'error': 'missing_solana_keypair'}

    node_bin = shutil.which(SOLANA_SIGNER_NODE_BIN) or SOLANA_SIGNER_NODE_BIN
    signer_script = """
const fs = require('node:fs');
const nacl = require('tweetnacl');
const { Keypair } = require('@solana/web3.js');
const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function encode58(bytes) {
  if (!bytes || bytes.length === 0) return '';
  const digits = [0];
  for (let i = 0; i < bytes.length; i += 1) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j += 1) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  let out = '1'.repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i -= 1) out += alphabet[digits[i]];
  return out;
}
const tsRaw = process.env.KYO_AUTH_TIMESTAMP || '';
const ts = Number.parseInt(tsRaw, 10);
if (!Number.isFinite(ts) || ts <= 0) throw new Error('invalid_timestamp');
const keypairPath = process.env.KYO_SOLANA_KEYPAIR_PATH || '';
if (!keypairPath) throw new Error('missing_keypair_path');
const raw = fs.readFileSync(keypairPath, 'utf8');
const arr = JSON.parse(raw);
if (!Array.isArray(arr)) throw new Error('invalid_keypair_json');
const secret = Uint8Array.from(arr);
if (secret.length !== 64) throw new Error('invalid_secret_key_length');
const keypair = Keypair.fromSecretKey(secret);
const message = new TextEncoder().encode(`keiro-auth:${ts}`);
const signature = nacl.sign.detached(message, keypair.secretKey);
process.stdout.write(`${keypair.publicKey.toBase58()}:${encode58(signature)}:${ts}`);
"""
    env = os.environ.copy()
    env['KYO_SOLANA_KEYPAIR_PATH'] = str(keypair_path)
    env['KYO_AUTH_TIMESTAMP'] = str(timestamp_ms)
    proc = subprocess.run(
        [node_bin, '-e', signer_script],
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
        env=env,
    )
    if proc.returncode != 0:
        return {
            'ok': False,
            'error': (proc.stderr or proc.stdout or 'sign_keiro_auth_failed').strip()[:500],
        }

    payload = proc.stdout.strip()
    parts = payload.split(':')
    if len(parts) != 3 or not parts[0] or not parts[1] or not parts[2]:
        return {'ok': False, 'error': 'invalid_signed_auth_payload'}
    return {'ok': True, 'payload': f'Solana {payload}'}


def singularity_order_payload(
    action: str,
    market_id: str,
    side: str,
    notional_usd: float,
    reference_id: str,
    price: float,
) -> dict[str, Any]:
    outcome = side if side in {'yes', 'no'} else ('yes' if price < 0.5 else 'no')
    safe_price = clamp(price, 0.01, 0.99)
    quantity = max(0.000001, round(notional_usd / safe_price, 8))
    order_type = SINGULARITY_ORDER_TYPE if SINGULARITY_ORDER_TYPE in {'market', 'limit'} else 'market'

    payload: dict[str, Any] = {
        'marketId': market_id,
        'side': 'buy' if action == 'open' else 'sell',
        'outcome': outcome,
        'orderType': order_type,
        'quantity': quantity,
    }
    if order_type == 'limit' or SINGULARITY_INCLUDE_PRICE:
        payload['price'] = round(safe_price, 8)
    if SINGULARITY_REQUIRE_TX_SIGNATURE:
        payload['txSignature'] = build_synthetic_tx_signature(
            action=action,
            market_id=market_id,
            reference_id=reference_id,
            notional_usd=notional_usd,
            price=safe_price,
        )
    return payload


def load_ledger_rows(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    for raw in path.read_text(encoding='utf-8').splitlines():
        line = raw.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except Exception:
            continue
        if isinstance(row, dict):
            rows.append(row)
    return rows



def start_of_utc_day(now: datetime) -> datetime:
    return now.replace(hour=0, minute=0, second=0, microsecond=0)



def daily_notional_from_ledger(rows: list[dict[str, Any]], now: datetime) -> float:
    cutoff = start_of_utc_day(now)
    total = 0.0
    for row in rows:
        ts = parse_ts(row.get('at') or row.get('timestamp') or row.get('executedAt'))
        if ts is None or ts < cutoff:
            continue
        if str(row.get('source') or '').strip().lower() != 'trading':
            continue
        if str(row.get('venue') or '').strip().lower() != 'dflow':
            continue
        if str(row.get('kind') or '').strip().lower() != 'trade_open':
            continue
        if str(row.get('status') or '').strip().lower() != 'success':
            continue
        total += max(0.0, parse_float(row.get('notionalUsd'), 0.0))
    return round(total, 8)



def weekly_realized_net_from_ledger(rows: list[dict[str, Any]], now: datetime) -> float:
    cutoff = now - timedelta(days=7)
    total = 0.0
    for row in rows:
        ts = parse_ts(row.get('at') or row.get('timestamp') or row.get('executedAt'))
        if ts is None or ts < cutoff:
            continue
        if str(row.get('source') or '').strip().lower() != 'trading':
            continue
        if str(row.get('venue') or '').strip().lower() != 'dflow':
            continue
        if str(row.get('kind') or '').strip().lower() != 'trade_close':
            continue
        if str(row.get('status') or '').strip().lower() != 'success':
            continue
        if str(row.get('realized') or '').strip().lower() not in {'true', '1'} and row.get('realized') is not True:
            continue
        total += parse_float(row.get('netUsd'), 0.0)
    return round(total, 8)



def normalize_positions(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        payload = {}
    open_positions_raw = payload.get('openPositions') if isinstance(payload.get('openPositions'), list) else []
    open_positions: list[dict[str, Any]] = []
    for row in open_positions_raw:
        if not isinstance(row, dict):
            continue
        market_id = str(row.get('marketId') or '').strip()
        venue = str(row.get('venue') or '').strip().lower()
        side = str(row.get('side') or '').strip().lower()
        entry_price = parse_float(row.get('entryPrice'), 0.0)
        notional_usd = parse_float(row.get('notionalUsd'), 0.0)
        opened_at = str(row.get('openedAt') or '').strip()
        if not market_id or venue != 'dflow' or side not in {'yes', 'no'}:
            continue
        if notional_usd <= 0 or entry_price <= 0:
            continue
        if parse_ts(opened_at) is None:
            opened_at = now_iso()
        open_positions.append(
            {
                'positionId': str(row.get('positionId') or '').strip() or f"pos-{market_id}-{int(datetime.now(timezone.utc).timestamp())}",
                'marketId': market_id,
                'venue': 'dflow',
                'side': side,
                'entryPrice': clamp(entry_price, 0.01, 0.99),
                'notionalUsd': round(notional_usd, 8),
                'openedAt': opened_at,
                'orderId': str(row.get('orderId') or '').strip(),
                'paymentRef': str(row.get('paymentRef') or '').strip(),
            }
        )
    starting_equity = max(1.0, parse_float(payload.get('startingEquityUsd'), STARTING_EQUITY_USD))
    peak_equity = max(starting_equity, parse_float(payload.get('peakEquityUsd'), starting_equity))
    realized_net = parse_float(payload.get('realizedNetUsd'), 0.0)
    return {
        'version': 1,
        'startingEquityUsd': round(starting_equity, 8),
        'peakEquityUsd': round(peak_equity, 8),
        'realizedNetUsd': round(realized_net, 8),
        'openPositions': open_positions,
        'updatedAt': now_iso(),
    }



def load_opportunities(path: Path) -> list[dict[str, Any]]:
    payload = read_json(path, {})
    items = payload.get('opportunities') if isinstance(payload, dict) else []
    if not isinstance(items, list):
        return []
    return [row for row in items if isinstance(row, dict)]



def market_prices_from_opportunities(opportunities: list[dict[str, Any]]) -> dict[str, float]:
    prices: dict[str, float] = {}
    for row in opportunities:
        metadata = row.get('metadata') if isinstance(row.get('metadata'), dict) else {}
        market_id = str(metadata.get('marketId') or '').strip()
        venue = str(metadata.get('venue') or '').strip().lower()
        if venue != 'dflow' or not market_id:
            continue
        price = parse_float(metadata.get('price'), 0.5)
        prices[market_id] = clamp(price, 0.01, 0.99)
    return prices



def dflow_candidates(opportunities: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in opportunities:
        if str(row.get('source') or '').strip().lower() != 'trading':
            continue
        metadata = row.get('metadata') if isinstance(row.get('metadata'), dict) else {}
        if str(metadata.get('venue') or '').strip().lower() != 'dflow':
            continue
        if bool(metadata.get('signalOnly')):
            continue
        market_id = str(metadata.get('marketId') or '').strip()
        if not market_id:
            continue
        confidence = parse_float(row.get('confidence'), 0.0)
        edge = parse_float(metadata.get('edgeScore'), 0.0)
        out.append(
            {
                'id': str(row.get('id') or '').strip() or f'dflow-{market_id}',
                'marketId': market_id,
                'confidence': confidence,
                'edgeScore': edge,
                'price': clamp(parse_float(metadata.get('price'), 0.5), 0.01, 0.99),
                'suggestedSide': str(metadata.get('suggestedSide') or '').strip().lower(),
            }
        )
    out.sort(key=lambda item: (-item['confidence'], -item['edgeScore'], item['id']))
    return out



def kalshi_signal_candidates(opportunities: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in opportunities:
        if str(row.get('source') or '').strip().lower() != 'trading':
            continue
        metadata = row.get('metadata') if isinstance(row.get('metadata'), dict) else {}
        if str(metadata.get('venue') or '').strip().lower() != 'kalshi':
            continue
        market_id = str(metadata.get('marketId') or '').strip()
        if not market_id:
            continue
        out.append(
            {
                'id': str(row.get('id') or '').strip() or f'kalshi-{market_id}',
                'marketId': market_id,
                'confidence': parse_float(row.get('confidence'), 0.0),
                'price': clamp(parse_float(metadata.get('price'), 0.5), 0.01, 0.99),
            }
        )
    out.sort(key=lambda item: (-item['confidence'], item['id']))
    return out



def side_value(probability: float, side: str) -> float:
    if side == 'yes':
        return clamp(probability, 0.0, 1.0)
    return clamp(1.0 - probability, 0.0, 1.0)



def pnl_for_position(position: dict[str, Any], current_price: float) -> tuple[float, float]:
    side = str(position.get('side') or 'yes').strip().lower()
    entry_price = clamp(parse_float(position.get('entryPrice'), 0.5), 0.01, 0.99)
    notional = max(0.0, parse_float(position.get('notionalUsd'), 0.0))
    entry_value = max(0.01, side_value(entry_price, side))
    current_value = max(0.0, side_value(current_price, side))
    pnl_pct = (current_value - entry_value) / entry_value
    pnl_usd = notional * pnl_pct
    return pnl_pct, pnl_usd



def fee_for_notional(notional_usd: float) -> float:
    return max(0.0, notional_usd * (FEE_BPS / 10_000.0))



def parse_json_text(raw: str) -> dict[str, Any]:
    text = raw.strip()
    if not text:
        return {}
    try:
        decoded = json.loads(text)
        return decoded if isinstance(decoded, dict) else {}
    except Exception:
        pass
    start = text.find('{')
    end = text.rfind('}')
    if start < 0 or end <= start:
        return {}
    try:
        decoded = json.loads(text[start : end + 1])
        return decoded if isinstance(decoded, dict) else {}
    except Exception:
        return {}



def run_exec_command(env_vars: dict[str, str]) -> dict[str, Any]:
    env = os.environ.copy()
    env.update(env_vars)
    proc = subprocess.run(
        ['bash', '-lc', DFLOW_EXEC_CMD],
        capture_output=True,
        text=True,
        timeout=EXEC_CMD_TIMEOUT_SECONDS,
        check=False,
        env=env,
    )
    if proc.returncode != 0:
        return {
            'ok': False,
            'error': (proc.stderr or proc.stdout or f'exec_cmd_exit_{proc.returncode}').strip()[:500],
        }
    payload = parse_json_text(proc.stdout or '')
    if not payload:
        return {'ok': False, 'error': 'exec_cmd_invalid_json'}
    order_id = str(payload.get('orderId') or payload.get('id') or '').strip()
    tx_signature = str(payload.get('txSignature') or payload.get('signature') or '').strip()
    payment_ref = str(payload.get('paymentRef') or '').strip()
    fill_price = parse_float(payload.get('fillPrice'), None)
    return {
        'ok': True,
        'orderId': order_id,
        'txSignature': tx_signature,
        'paymentRef': payment_ref,
        'fillPrice': fill_price,
        'raw': payload,
    }



def post_json(url: str, headers: dict[str, str], payload: dict[str, Any]) -> tuple[int, Any]:
    request = urllib.request.Request(
        url=url,
        data=json.dumps(payload, ensure_ascii=True).encode('utf-8'),
        headers=headers,
        method='POST',
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            raw = response.read().decode('utf-8')
            return int(response.status), json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        try:
            raw = exc.read().decode('utf-8')
            decoded = json.loads(raw) if raw else {}
        except Exception:
            decoded = {'error': str(exc)}
        return int(exc.code), decoded



def execute_order_singularity(
    action: str,
    market_id: str,
    side: str,
    notional_usd: float,
    reference_id: str,
    price: float,
) -> dict[str, Any]:
    signed_auth = sign_keiro_auth(next_auth_timestamp_ms())
    if not signed_auth.get('ok'):
        return {'ok': False, 'error': str(signed_auth.get('error') or 'sign_keiro_auth_failed')}

    idempotency_key = build_idempotency_key(action, market_id, reference_id)
    payload = singularity_order_payload(
        action=action,
        market_id=market_id,
        side=side,
        notional_usd=notional_usd,
        reference_id=reference_id,
        price=price,
    )
    url = f'{DFLOW_API_BASE_URL}{normalize_path(DFLOW_ORDER_PATH)}'
    status, response = post_json(
        url,
        {
            'accept': 'application/json',
            'content-type': 'application/json',
            'authorization': str(signed_auth.get('payload') or ''),
            'x-idempotency-key': idempotency_key,
        },
        payload,
    )
    if status < 200 or status >= 300:
        return {
            'ok': False,
            'error': f'http_{status}',
            'status': status,
            'idempotencyKey': idempotency_key,
            'request': payload,
            'raw': response,
        }

    if isinstance(response, dict):
        order_id = str(response.get('orderId') or response.get('id') or '').strip()
        tx_signature = str(
            response.get('txSignature')
            or response.get('signature')
            or payload.get('txSignature')
            or ''
        ).strip()
        fill_price = parse_float(response.get('fillPrice') or response.get('price'), price)
    else:
        order_id = ''
        tx_signature = str(payload.get('txSignature') or '')
        fill_price = price

    return {
        'ok': True,
        'orderId': order_id,
        'txSignature': tx_signature,
        'paymentRef': str(idempotency_key),
        'fillPrice': fill_price,
        'idempotencyKey': idempotency_key,
        'request': payload,
        'raw': response,
    }


def execute_order(action: str, market_id: str, side: str, notional_usd: float, reference_id: str, price: float) -> dict[str, Any]:
    if EXECUTION_MODE == 'paper':
        return {
            'ok': True,
            'orderId': f'paper-{action}-{market_id}-{int(datetime.now(timezone.utc).timestamp())}',
            'txSignature': '',
            'paymentRef': '',
            'fillPrice': price,
            'raw': {'mode': 'paper'},
        }

    if DFLOW_EXEC_CMD:
        return run_exec_command(
            {
                'KYO_TRADING_ACTION': action,
                'KYO_TRADING_MARKET_ID': market_id,
                'KYO_TRADING_SIDE': side,
                'KYO_TRADING_NOTIONAL_USD': f'{notional_usd:.8f}',
                'KYO_TRADING_REFERENCE_ID': reference_id,
                'KYO_TRADING_EXECUTION_MODE': EXECUTION_MODE,
                'KYO_TRADING_PRICE': f'{price:.8f}',
                'KYO_TRADING_DFLOW_API_BASE_URL': DFLOW_API_BASE_URL,
            }
        )

    if EXECUTION_BACKEND == 'singularity':
        return execute_order_singularity(
            action=action,
            market_id=market_id,
            side=side,
            notional_usd=notional_usd,
            reference_id=reference_id,
            price=price,
        )

    if not DFLOW_API_KEY:
        return {'ok': False, 'error': 'missing_dflow_api_key'}

    url = f'{DFLOW_API_BASE_URL}{normalize_path(DFLOW_ORDER_PATH)}'
    status, payload = post_json(
        url,
        {
            'accept': 'application/json',
            'content-type': 'application/json',
            'authorization': f'Bearer {DFLOW_API_KEY}',
        },
        {
            'action': action,
            'marketId': market_id,
            'side': side,
            'notionalUsd': round(notional_usd, 8),
            'referenceId': reference_id,
        },
    )
    if status < 200 or status >= 300:
        return {
            'ok': False,
            'error': f'http_{status}',
            'raw': payload,
        }

    order_id = str(payload.get('orderId') or payload.get('id') or '').strip()
    tx_signature = str(payload.get('txSignature') or payload.get('signature') or '').strip()
    payment_ref = str(payload.get('paymentRef') or '').strip()
    fill_price = parse_float(payload.get('fillPrice'), price)
    return {
        'ok': True,
        'orderId': order_id,
        'txSignature': tx_signature,
        'paymentRef': payment_ref,
        'fillPrice': fill_price,
        'raw': payload,
    }



def append_ledger_row(row: dict[str, Any]) -> None:
    append_json_line(LEDGER_PATH, row)



def market_exposure(open_positions: list[dict[str, Any]], market_id: str) -> float:
    total = 0.0
    for row in open_positions:
        if str(row.get('marketId') or '').strip() != market_id:
            continue
        total += max(0.0, parse_float(row.get('notionalUsd'), 0.0))
    return total



def calc_unrealized(open_positions: list[dict[str, Any]], prices: dict[str, float]) -> float:
    total = 0.0
    for row in open_positions:
        market_id = str(row.get('marketId') or '').strip()
        if not market_id:
            continue
        if market_id not in prices:
            continue
        _, pnl_usd = pnl_for_position(row, prices[market_id])
        total += pnl_usd
    return round(total, 8)



def run() -> int:
    ensure_dirs()
    started_at = now_iso()

    if not ENABLE_TRADING_AGENT:
        summary = {
            'ok': True,
            'status': 'disabled',
            'startedAt': started_at,
            'at': now_iso(),
            'executionMode': EXECUTION_MODE,
            'executionBackend': EXECUTION_BACKEND,
        }
        write_json(STATE_PATH, {'lastRunAt': summary['at'], 'lastStatus': summary, 'recentSignalIds': []})
        write_json(OUTPUT_PATH, summary)
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    now = datetime.now(timezone.utc)
    ledger_rows = load_ledger_rows(LEDGER_PATH)
    opportunities = load_opportunities(FEED_PATH)
    prices = market_prices_from_opportunities(opportunities)

    state = read_json(STATE_PATH, {})
    if not isinstance(state, dict):
        state = {}
    recent_signal_ids_raw = state.get('recentSignalIds') if isinstance(state.get('recentSignalIds'), list) else []
    recent_signal_ids = [str(item).strip() for item in recent_signal_ids_raw if isinstance(item, str) and str(item).strip()]

    positions = normalize_positions(read_json(POSITIONS_PATH, {}))

    daily_notional = daily_notional_from_ledger(ledger_rows, now)
    weekly_realized_net = weekly_realized_net_from_ledger(ledger_rows, now)

    weekly_loss_cap_exceeded = WEEKLY_LOSS_CAP_USD > 0 and weekly_realized_net <= (-WEEKLY_LOSS_CAP_USD)

    if EXECUTION_MODE == 'live':
        block_reason = ''
        if EXECUTION_BACKEND == 'singularity':
            keypair_path = Path(SOLANA_KEYPAIR_PATH).expanduser()
            if not keypair_path.exists():
                block_reason = 'missing_solana_keypair'
            elif shutil.which(SOLANA_SIGNER_NODE_BIN) is None and not Path(SOLANA_SIGNER_NODE_BIN).exists():
                block_reason = 'missing_node_runtime'
        elif not DFLOW_EXEC_CMD and not DFLOW_API_KEY:
            block_reason = 'missing_dflow_api_key'

        if block_reason:
            summary = {
                'ok': False,
                'status': 'blocked',
                'reason': block_reason,
                'startedAt': started_at,
                'at': now_iso(),
                'executionMode': EXECUTION_MODE,
                'executionBackend': EXECUTION_BACKEND,
                'openPositions': len(positions['openPositions']),
                'dailyNotionalUsd': daily_notional,
                'weeklyRealizedNetUsd': weekly_realized_net,
                'drawdownPct': 0.0,
                'drawdownBreakerExceeded': False,
                'weeklyLossCapExceeded': weekly_loss_cap_exceeded,
                'blockPaidExecution': True,
            }
            write_json(STATE_PATH, {'lastRunAt': summary['at'], 'lastStatus': summary, 'recentSignalIds': recent_signal_ids})
            write_json(OUTPUT_PATH, summary)
            print(json.dumps(summary, ensure_ascii=True))
            return 0

    opened = 0
    closed = 0
    failed = 0
    signal_rows = 0
    appended = 0
    realized_net_delta = 0.0
    opened_notional_tick = 0.0

    next_open_positions: list[dict[str, Any]] = []

    for position in positions['openPositions']:
        market_id = str(position.get('marketId') or '').strip()
        if not market_id or market_id not in prices:
            next_open_positions.append(position)
            continue

        current_price = prices[market_id]
        pnl_pct, pnl_usd = pnl_for_position(position, current_price)
        opened_at = parse_ts(position.get('openedAt'))
        hold_hours = 0.0
        if opened_at is not None:
            hold_hours = max(0.0, (now - opened_at).total_seconds() / 3600.0)

        should_close = (
            pnl_pct >= TAKE_PROFIT_PCT / 100.0
            or pnl_pct <= -(STOP_LOSS_PCT / 100.0)
            or hold_hours >= MAX_HOLD_HOURS
        )
        if not should_close:
            next_open_positions.append(position)
            continue

        reference_id = f"close-{market_id}-{int(now.timestamp())}"
        close_result = execute_order('close', market_id, str(position.get('side') or 'yes'), parse_float(position.get('notionalUsd'), 0.0), reference_id, current_price)
        if not close_result.get('ok'):
            failed += 1
            append_ledger_row(
                {
                    'id': f'trading-close-failed-{market_id}-{int(now.timestamp())}',
                    'source': 'trading',
                    'venue': 'dflow',
                    'kind': 'trade_close',
                    'status': 'failed',
                    'realized': True,
                    'at': now_iso(),
                    'marketId': market_id,
                    'positionId': str(position.get('positionId') or '').strip(),
                    'orderId': '',
                    'grossUsd': 0.0,
                    'costUsd': 0.0,
                    'netUsd': 0.0,
                    'notionalUsd': round(parse_float(position.get('notionalUsd'), 0.0), 8),
                    'error': str(close_result.get('error') or 'close_failed')[:500],
                }
            )
            appended += 1
            next_open_positions.append(position)
            continue

        fee_usd = fee_for_notional(parse_float(position.get('notionalUsd'), 0.0))
        gross_usd = max(0.0, pnl_usd)
        cost_usd = max(0.0, -pnl_usd) + fee_usd
        net_usd = pnl_usd - fee_usd
        realized_net_delta += net_usd
        closed += 1

        append_ledger_row(
            {
                'id': f'trading-close-{market_id}-{int(now.timestamp())}',
                'source': 'trading',
                'venue': 'dflow',
                'kind': 'trade_close',
                'status': 'success',
                'realized': True,
                'at': now_iso(),
                'marketId': market_id,
                'positionId': str(position.get('positionId') or '').strip(),
                'orderId': str(close_result.get('orderId') or '').strip(),
                'txSignature': str(close_result.get('txSignature') or '').strip(),
                'paymentRef': str(close_result.get('paymentRef') or '').strip(),
                'entryPrice': round(parse_float(position.get('entryPrice'), 0.0), 8),
                'exitPrice': round(parse_float(close_result.get('fillPrice'), current_price), 8),
                'grossUsd': round(gross_usd, 8),
                'costUsd': round(cost_usd, 8),
                'netUsd': round(net_usd, 8),
                'notionalUsd': round(parse_float(position.get('notionalUsd'), 0.0), 8),
                'holdHours': round(hold_hours, 6),
                'pnlPct': round(pnl_pct * 100.0, 6),
                'closeReason': 'tp_sl_or_max_hold',
                'error': '',
            }
        )
        appended += 1

    positions['openPositions'] = next_open_positions

    unrealized_net_pre_open = calc_unrealized(positions['openPositions'], prices)
    realized_net_total = round(parse_float(positions.get('realizedNetUsd'), 0.0) + realized_net_delta, 8)

    equity_pre_open = parse_float(positions.get('startingEquityUsd'), STARTING_EQUITY_USD) + realized_net_total + unrealized_net_pre_open
    peak_pre_open = max(parse_float(positions.get('peakEquityUsd'), STARTING_EQUITY_USD), equity_pre_open)
    drawdown_pct_pre_open = 0.0
    if peak_pre_open > 0:
        drawdown_pct_pre_open = max(0.0, ((peak_pre_open - equity_pre_open) / peak_pre_open) * 100.0)

    drawdown_breaker_exceeded = drawdown_pct_pre_open > MAX_DRAWDOWN_PCT
    block_opens = drawdown_breaker_exceeded or weekly_loss_cap_exceeded

    if 'dflow' in VENUES and not block_opens:
        open_market_ids = {str(row.get('marketId') or '').strip() for row in positions['openPositions']}
        for candidate in dflow_candidates(opportunities):
            if opened >= MAX_OPEN_PER_TICK:
                break
            if len(positions['openPositions']) >= MAX_OPEN_POSITIONS:
                break
            market_id = str(candidate.get('marketId') or '').strip()
            if not market_id or market_id in open_market_ids:
                continue

            daily_remaining = MAX_NOTIONAL_USD_PER_DAY - (daily_notional + opened_notional_tick)
            market_remaining = MAX_MARKET_EXPOSURE_USD - market_exposure(positions['openPositions'], market_id)
            notional_usd = min(DEFAULT_POSITION_USD, daily_remaining, market_remaining)
            if notional_usd < MIN_POSITION_USD:
                continue

            side = str(candidate.get('suggestedSide') or '').strip().lower()
            if side not in {'yes', 'no'}:
                side = 'yes' if parse_float(candidate.get('price'), 0.5) < 0.5 else 'no'
            entry_price = clamp(parse_float(candidate.get('price'), 0.5), 0.01, 0.99)

            reference_id = f"open-{market_id}-{int(now.timestamp())}"
            open_result = execute_order('open', market_id, side, notional_usd, reference_id, entry_price)
            if not open_result.get('ok'):
                failed += 1
                append_ledger_row(
                    {
                        'id': f'trading-open-failed-{market_id}-{int(now.timestamp())}',
                        'source': 'trading',
                        'venue': 'dflow',
                        'kind': 'trade_open',
                        'status': 'failed',
                        'realized': False,
                        'at': now_iso(),
                        'marketId': market_id,
                        'positionId': '',
                        'orderId': '',
                        'grossUsd': 0.0,
                        'costUsd': 0.0,
                        'netUsd': 0.0,
                        'notionalUsd': round(notional_usd, 8),
                        'error': str(open_result.get('error') or 'open_failed')[:500],
                    }
                )
                appended += 1
                continue

            fee_usd = fee_for_notional(notional_usd)
            fill_price = clamp(parse_float(open_result.get('fillPrice'), entry_price), 0.01, 0.99)
            position_id = f"pos-{market_id}-{int(now.timestamp())}-{opened + 1}"

            positions['openPositions'].append(
                {
                    'positionId': position_id,
                    'marketId': market_id,
                    'venue': 'dflow',
                    'side': side,
                    'entryPrice': round(fill_price, 8),
                    'notionalUsd': round(notional_usd, 8),
                    'openedAt': now_iso(),
                    'orderId': str(open_result.get('orderId') or '').strip(),
                    'paymentRef': str(open_result.get('paymentRef') or '').strip(),
                }
            )
            open_market_ids.add(market_id)
            opened += 1
            opened_notional_tick += notional_usd

            append_ledger_row(
                {
                    'id': f'trading-open-{market_id}-{int(now.timestamp())}-{opened}',
                    'source': 'trading',
                    'venue': 'dflow',
                    'kind': 'trade_open',
                    'status': 'success',
                    'realized': False,
                    'at': now_iso(),
                    'marketId': market_id,
                    'positionId': position_id,
                    'orderId': str(open_result.get('orderId') or '').strip(),
                    'txSignature': str(open_result.get('txSignature') or '').strip(),
                    'paymentRef': str(open_result.get('paymentRef') or '').strip(),
                    'entryPrice': round(fill_price, 8),
                    'grossUsd': 0.0,
                    'costUsd': round(fee_usd, 8),
                    'netUsd': round(-fee_usd, 8),
                    'notionalUsd': round(notional_usd, 8),
                    'error': '',
                }
            )
            appended += 1

    if 'kalshi' in VENUES and KALSHI_SIGNAL_ONLY and KALSHI_SIGNAL_RECORD_LIMIT > 0:
        for signal in kalshi_signal_candidates(opportunities):
            signal_id = str(signal.get('id') or '').strip()
            if not signal_id or signal_id in recent_signal_ids:
                continue
            append_ledger_row(
                {
                    'id': f"trading-signal-{signal_id}-{int(now.timestamp())}",
                    'source': 'trading',
                    'venue': 'kalshi',
                    'kind': 'signal',
                    'status': 'success',
                    'realized': False,
                    'at': now_iso(),
                    'marketId': str(signal.get('marketId') or '').strip(),
                    'grossUsd': 0.0,
                    'costUsd': 0.0,
                    'netUsd': 0.0,
                    'confidence': round(parse_float(signal.get('confidence'), 0.0), 6),
                    'price': round(parse_float(signal.get('price'), 0.5), 8),
                    'error': '',
                }
            )
            appended += 1
            signal_rows += 1
            recent_signal_ids.append(signal_id)
            if signal_rows >= KALSHI_SIGNAL_RECORD_LIMIT:
                break

    recent_signal_ids = recent_signal_ids[-RECENT_SIGNAL_LIMIT:]

    unrealized_net = calc_unrealized(positions['openPositions'], prices)
    equity = parse_float(positions.get('startingEquityUsd'), STARTING_EQUITY_USD) + realized_net_total + unrealized_net
    peak_equity = max(parse_float(positions.get('peakEquityUsd'), STARTING_EQUITY_USD), equity)
    drawdown_pct = 0.0
    if peak_equity > 0:
        drawdown_pct = max(0.0, ((peak_equity - equity) / peak_equity) * 100.0)

    drawdown_breaker_exceeded = drawdown_pct > MAX_DRAWDOWN_PCT
    weekly_realized_net_after = round(weekly_realized_net + realized_net_delta, 8)
    weekly_loss_cap_exceeded = WEEKLY_LOSS_CAP_USD > 0 and weekly_realized_net_after <= (-WEEKLY_LOSS_CAP_USD)

    positions['peakEquityUsd'] = round(peak_equity, 8)
    positions['realizedNetUsd'] = round(realized_net_total, 8)
    positions['updatedAt'] = now_iso()
    write_json(POSITIONS_PATH, positions)

    reasons: list[str] = []
    if drawdown_breaker_exceeded:
        reasons.append('drawdown_breaker_exceeded')
    if weekly_loss_cap_exceeded:
        reasons.append('weekly_loss_cap_exceeded')

    ok = len(reasons) == 0
    status = 'ok'
    if not ok:
        status = 'blocked'
    elif opened == 0 and closed == 0 and signal_rows == 0:
        status = 'idle'

    summary = {
        'ok': ok,
        'status': status,
        'reasons': reasons,
        'startedAt': started_at,
        'at': now_iso(),
        'executionMode': EXECUTION_MODE,
        'executionBackend': EXECUTION_BACKEND,
        'venues': VENUES,
        'kalshiSignalOnly': KALSHI_SIGNAL_ONLY,
        'openedTrades': opened,
        'closedTrades': closed,
        'failedTrades': failed,
        'signalRowsAppended': signal_rows,
        'ledgerRowsAppended': appended,
        'openPositions': len(positions['openPositions']),
        'dailyNotionalUsd': round(daily_notional + opened_notional_tick, 8),
        'maxNotionalUsdPerDay': round(MAX_NOTIONAL_USD_PER_DAY, 8),
        'weeklyRealizedNetUsd': weekly_realized_net_after,
        'weeklyLossCapUsd': round(WEEKLY_LOSS_CAP_USD, 8),
        'weeklyLossCapExceeded': weekly_loss_cap_exceeded,
        'drawdownPct': round(drawdown_pct, 8),
        'maxDrawdownPct': round(MAX_DRAWDOWN_PCT, 8),
        'drawdownBreakerExceeded': drawdown_breaker_exceeded,
        'equityUsd': round(equity, 8),
        'peakEquityUsd': round(peak_equity, 8),
        'realizedNetUsdTotal': round(realized_net_total, 8),
        'unrealizedNetUsd': round(unrealized_net, 8),
        'blockPaidExecution': bool(drawdown_breaker_exceeded or weekly_loss_cap_exceeded),
        'feedPath': str(FEED_PATH),
        'positionsPath': str(POSITIONS_PATH),
        'ledgerPath': str(LEDGER_PATH),
    }

    write_json(
        STATE_PATH,
        {
            'lastRunAt': summary['at'],
            'recentSignalIds': recent_signal_ids,
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
            'openedTrades': summary['openedTrades'],
            'closedTrades': summary['closedTrades'],
            'failedTrades': summary['failedTrades'],
            'openPositions': summary['openPositions'],
            'drawdownPct': summary['drawdownPct'],
            'weeklyRealizedNetUsd': summary['weeklyRealizedNetUsd'],
        },
    )
    print(json.dumps(summary, ensure_ascii=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(run())
