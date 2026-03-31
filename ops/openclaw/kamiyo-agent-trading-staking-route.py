#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

HOME_DIR = Path(os.environ.get('HOME', '~')).expanduser()
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from fundry_staking_deposit import run_fundry_staking_deposit

WORKSPACE = HOME_DIR / '.openclaw' / 'workspace'
RUNTIME_DIR = WORKSPACE / 'runtime'
STATE_DIR = RUNTIME_DIR / 'state'
RECEIPTS_DIR = RUNTIME_DIR / 'receipts'
LOG_DIR = RUNTIME_DIR / 'logs'

STATE_PATH = STATE_DIR / 'trading-route-state.json'
OUTPUT_PATH = STATE_DIR / 'trading-route.json'
LOG_PATH = LOG_DIR / 'trading-route.jsonl'
ROUTE_RECEIPTS_PATH = Path(
    os.getenv('KYO_TRADING_STAKING_RECEIPTS_PATH', str(RECEIPTS_DIR / 'trading-staking-route.jsonl')).strip()
).expanduser()
LEDGER_PATH = Path(
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
DEFAULT_POOL_URL = 'https://fundry.collaterize.com/staking/9mEd5iRcdbNUwaCmkPqYggLfg25B2DsTn1w6gNrgvC9d'
STAKING_POOL_URL = os.getenv('KYO_TRADING_STAKING_POOL_URL', DEFAULT_POOL_URL).strip() or DEFAULT_POOL_URL
ROUTE_BPS = max(0, min(10000, env_int('KYO_TRADING_ROUTE_NET_BPS', 5000)))
ROUTE_MIN_SOL = max(0.0, env_float('KYO_TRADING_ROUTE_MIN_SOL', 0.000001))
SOL_PRICE_USD = max(
    0.000001,
    env_float(
        'KYO_TRADING_SOL_PRICE_USD',
        env_float('KYO_RECEIPT_SOL_PRICE_USD', 150.0),
    ),
)
ROUTE_CMD = os.getenv('KYO_TRADING_STAKING_ROUTE_CMD', '').strip()
DRY_RUN = env_bool('KYO_TRADING_STAKING_DRY_RUN', False)
KEYPAIR_PATH = os.getenv('KYO_TRADING_STAKING_KEYPAIR_PATH', '').strip()
ADMIN_KEYPAIR_PATH = os.getenv('KYO_TRADING_STAKING_ADMIN_KEYPAIR_PATH', '').strip()
RPC_URL = os.getenv('KYO_TRADING_STAKING_RPC_URL', '').strip()
ROUTE_TOLERANCE_USD = max(0.0, env_float('KYO_TRADING_ROUTE_LAG_TOLERANCE_USD', 1.0))
ROUTE_REBASE_ON_OVERSHOOT = env_bool('KYO_TRADING_ROUTE_REBASE_ON_OVERSHOOT', True)
CLI_TIMEOUT_SECONDS = max(15, min(180, env_int('KYO_TRADING_ROUTE_CLI_TIMEOUT_SECONDS', 90)))
ROUTE_FEE_RESERVE_SOL = max(0.0, env_float('KYO_TRADING_ROUTE_FEE_RESERVE_SOL', 0.00001))
ROUTE_RENT_RESERVE_SOL = max(0.0, env_float('KYO_TRADING_ROUTE_ACCOUNT_RENT_RESERVE_SOL', 0.001))
ROUTE_MIN_WALLET_SOL = max(0.0, env_float('KYO_TRADING_ROUTE_MIN_WALLET_SOL', 0.0))
ROUTE_BASIS_WINDOW_HOURS = max(1, min(72, env_int('KYO_TRADING_ROUTE_BASIS_WINDOW_HOURS', 24)))
ROUTE_TOPUP_ENABLED = env_bool('KYO_TRADING_ROUTE_TOPUP_ENABLED', False)
ROUTE_TOPUP_TARGET_SOL = max(0.0, env_float('KYO_TRADING_ROUTE_TOPUP_TARGET_SOL', 0.0))
ROUTE_TOPUP_MAX_SOL_PER_RUN = max(0.0, env_float('KYO_TRADING_ROUTE_TOPUP_MAX_SOL_PER_RUN', 0.0))
ROUTE_TOPUP_FROM_KEYPAIR_PATH = os.getenv('KYO_TRADING_ROUTE_TOPUP_FROM_KEYPAIR_PATH', '').strip()
ROUTE_TOPUP_CMD = os.getenv('KYO_TRADING_ROUTE_TOPUP_CMD', '').strip()
ROUTE_EARNINGS_SWEEP_ENABLED = env_bool('KYO_TRADING_ROUTE_EARNINGS_SWEEP_ENABLED', False)
ROUTE_EARNINGS_SWEEP_CMD = os.getenv('KYO_TRADING_ROUTE_EARNINGS_SWEEP_CMD', '').strip()
ROUTE_EARNINGS_SWEEP_MIN_USD = max(0.0, env_float('KYO_TRADING_ROUTE_EARNINGS_SWEEP_MIN_USD', 0.0))
EVM_TX_HASH_RE = re.compile(r'^0x[a-fA-F0-9]{64}$')
SOLANA_SIGNATURE_RE = re.compile(r'^[1-9A-HJ-NP-Za-km-z]{80,96}$')


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_dirs() -> None:
    for path in (WORKSPACE, RUNTIME_DIR, STATE_DIR, RECEIPTS_DIR, LOG_DIR, ROUTE_RECEIPTS_PATH.parent, LEDGER_PATH.parent):
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


def has_settlement_evidence(row: dict[str, Any]) -> bool:
    if looks_like_chain_tx_ref(row.get('txSignature')):
        return True
    if str(row.get('settlementRef') or '').strip():
        return True
    if looks_like_chain_tx_ref(row.get('paymentRef')):
        return True
    metadata = row.get('metadata') if isinstance(row.get('metadata'), dict) else {}
    settlement = metadata.get('settlementEvidence') if isinstance(metadata, dict) else {}
    if isinstance(settlement, dict):
        if str(settlement.get('settlementRef') or settlement.get('fillId') or settlement.get('closeId') or '').strip():
            return True
        for key in ('txSignature', 'txHash', 'transactionHash', 'paymentRef'):
            if looks_like_chain_tx_ref(settlement.get(key)):
                return True
    return False


def realized_profit_from_close_row(row: dict[str, Any]) -> float:
    metadata = row.get('metadata') if isinstance(row.get('metadata'), dict) else {}
    explicit = row.get('realizedProfitUsd')
    if explicit is None and isinstance(metadata, dict):
        explicit = metadata.get('realizedProfitUsd')
    value = parse_float(explicit, float('nan'))
    if value == value:
        return round(value, 8)

    close_proceeds = parse_float(metadata.get('closeProceedsUsd'), float('nan'))
    open_cost = parse_float(metadata.get('openCostBasisUsd'), float('nan'))
    if close_proceeds == close_proceeds and open_cost == open_cost:
        return round(close_proceeds - open_cost, 8)

    return 0.0


def close_row_has_required_realized_fields(row: dict[str, Any]) -> bool:
    metadata = row.get('metadata') if isinstance(row.get('metadata'), dict) else {}
    for key in ('openCostBasisUsd', 'closeProceedsUsd', 'realizedProfitUsd'):
        value = parse_float(metadata.get(key), float('nan'))
        if value != value:
            return False
    close_order_id = str(metadata.get('closeOrderId') or row.get('orderId') or '').strip()
    close_payment_ref = str(metadata.get('closePaymentRef') or row.get('paymentRef') or '').strip()
    if not close_order_id or not close_payment_ref:
        return False
    return True


def looks_like_chain_tx_ref(value: Any) -> bool:
    text = str(value or '').strip()
    if not text:
        return False
    if EVM_TX_HASH_RE.match(text):
        return True
    return bool(SOLANA_SIGNATURE_RE.match(text))


def pool_id_from_url(url: str) -> str:
    text = url.strip().rstrip('/')
    if not text:
        return ''
    return text.split('/')[-1]


def format_sol(value: float) -> str:
    text = f'{value:.9f}'.rstrip('0').rstrip('.')
    return text if text else '0'


def floor_precision(value: float, precision: int = 8) -> float:
    if value <= 0:
        return 0.0
    factor = float(10**precision)
    return float(int(value * factor) / factor)


def parse_signature(stdout: str) -> str:
    text = stdout.strip()
    if not text:
        return ''
    try:
        payload = json.loads(text)
        if isinstance(payload, dict):
            signature = str(
                payload.get('signature')
                or payload.get('txSignature')
                or payload.get('value')
                or payload.get('result')
                or ''
            ).strip()
            if signature:
                return signature
    except Exception:
        pass
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return ''
    try:
        payload = json.loads(lines[-1])
        if isinstance(payload, dict):
            signature = str(payload.get('signature') or payload.get('txSignature') or '').strip()
            if signature:
                return signature
    except Exception:
        pass
    match = re.search(r'Signature:\s*([A-Za-z0-9]+)', text)
    if match:
        return match.group(1)
    return ''


def transfer_error(proc: subprocess.CompletedProcess[str]) -> str:
    return (proc.stderr or proc.stdout or f'solana_transfer_exit_{proc.returncode}').strip()[:350] or 'solana_transfer_failed'


def parse_solana_balance(output: str) -> float:
    text = str(output or '').strip()
    if not text:
        return 0.0
    match = re.search(r'([0-9]+(?:\.[0-9]+)?)\s*SOL', text, re.IGNORECASE)
    if match:
        return max(0.0, parse_float(match.group(1), 0.0))
    return max(0.0, parse_float(text, 0.0))


def keypair_pubkey(keypair: Path) -> str:
    keygen_bin = shutil.which('solana-keygen')
    if not keygen_bin:
        return ''
    proc = subprocess.run(
        [keygen_bin, 'pubkey', str(keypair)],
        capture_output=True,
        text=True,
        timeout=CLI_TIMEOUT_SECONDS,
        check=False,
    )
    if proc.returncode != 0:
        return ''
    return (proc.stdout or '').strip()


def read_solana_balance_pubkey(*, solana_bin: str, pubkey: str) -> float:
    key = str(pubkey or '').strip()
    if not key:
        return 0.0
    cmd = [solana_bin, 'balance', key]
    if RPC_URL:
        cmd.extend(['--url', RPC_URL])
    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=CLI_TIMEOUT_SECONDS,
        check=False,
    )
    if proc.returncode != 0:
        return 0.0
    return parse_solana_balance(proc.stdout or '')


def read_solana_balance(*, solana_bin: str, keypair: Path) -> float:
    return read_solana_balance_pubkey(solana_bin=solana_bin, pubkey=keypair_pubkey(keypair))


def run_route_cmd(*, amount_sol: float, route_usd: float, delta_usd: float, checkpoint_id: str) -> dict[str, Any]:
    env = os.environ.copy()
    env.update(
        {
            'KYO_ROUTE_AMOUNT_SOL': format_sol(amount_sol),
            'KYO_ROUTE_AMOUNT_USD': f'{route_usd:.8f}',
            'KYO_ROUTE_DELTA_NET_USD': f'{delta_usd:.8f}',
            'KYO_ROUTE_STAKING_POOL_URL': STAKING_POOL_URL,
            'KYO_ROUTE_CHECKPOINT_ID': checkpoint_id,
            'KYO_ROUTE_SOURCE': 'trading',
        }
    )
    proc = subprocess.run(
        ['bash', '-lc', ROUTE_CMD],
        capture_output=True,
        text=True,
        timeout=CLI_TIMEOUT_SECONDS,
        check=False,
        env=env,
    )
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout or f'route_cmd_exit_{proc.returncode}').strip()[:350] or 'route_cmd_failed')

    payload = None
    for line in reversed((proc.stdout or '').splitlines()):
        stripped = line.strip()
        if not stripped:
            continue
        try:
            decoded = json.loads(stripped)
        except Exception:
            continue
        if isinstance(decoded, dict):
            payload = decoded
            break
    if payload is None:
        raise RuntimeError('route_cmd_invalid_json')

    signature = str(payload.get('txSignature') or payload.get('signature') or '').strip()
    if not signature:
        raise RuntimeError('route_cmd_missing_tx_signature')
    return {
        'method': 'custom_cmd',
        'txSignature': signature,
        'routedSol': max(0.0, parse_float(payload.get('routedSol') if 'routedSol' in payload else payload.get('amountSol'), amount_sol)),
    }


def run_transfer_from_keypair(*, solana_bin: str, from_keypair: Path, to_pubkey: str, amount_sol: float) -> dict[str, Any]:
    if amount_sol <= 0:
        raise RuntimeError('topup_amount_invalid')

    def transfer_once(sol_amount: float) -> subprocess.CompletedProcess[str]:
        cmd = [
            solana_bin,
            'transfer',
            to_pubkey,
            format_sol(sol_amount),
            '--keypair',
            str(from_keypair),
            '--allow-unfunded-recipient',
            '--output',
            'json',
        ]
        if RPC_URL:
            cmd.extend(['--url', RPC_URL])
        return subprocess.run(cmd, capture_output=True, text=True, timeout=CLI_TIMEOUT_SECONDS, check=False)

    attempted_sol = amount_sol
    proc = transfer_once(attempted_sol)
    if proc.returncode != 0:
        text = proc.stderr or proc.stdout or ''
        match = re.search(r'insufficient funds for spend \(([\d.]+) SOL\) \+ fee \(([\d.]+) SOL\)', text, re.IGNORECASE)
        if match:
            fee_sol = max(0.0, parse_float(match.group(2), 0.0))
            adjusted = floor_precision(max(0.0, amount_sol - fee_sol - ROUTE_FEE_RESERVE_SOL - ROUTE_RENT_RESERVE_SOL), 9)
            if adjusted > 0 and adjusted < amount_sol:
                attempted_sol = adjusted
                proc = transfer_once(attempted_sol)
        if proc.returncode != 0:
            raise RuntimeError(transfer_error(proc))

    signature = parse_signature(proc.stdout or '')
    if not signature:
        raise RuntimeError('missing_topup_tx_signature')
    return {
        'txSignature': signature,
        'toppedUpSol': attempted_sol,
    }


def run_topup_cmd(*, amount_sol: float, to_pubkey: str, required_balance_sol: float, current_balance_sol: float) -> dict[str, Any]:
    env = os.environ.copy()
    env.update(
        {
            'KYO_ROUTE_TOPUP_TO_PUBKEY': to_pubkey,
            'KYO_ROUTE_TOPUP_AMOUNT_SOL': format_sol(amount_sol),
            'KYO_ROUTE_TOPUP_REQUIRED_BALANCE_SOL': format_sol(required_balance_sol),
            'KYO_ROUTE_TOPUP_CURRENT_BALANCE_SOL': format_sol(current_balance_sol),
        }
    )
    proc = subprocess.run(
        ['bash', '-lc', ROUTE_TOPUP_CMD],
        capture_output=True,
        text=True,
        timeout=CLI_TIMEOUT_SECONDS,
        check=False,
        env=env,
    )
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout or f'topup_cmd_exit_{proc.returncode}').strip()[:350] or 'topup_cmd_failed')

    payload = None
    for line in reversed((proc.stdout or '').splitlines()):
        stripped = line.strip()
        if not stripped:
            continue
        try:
            decoded = json.loads(stripped)
        except Exception:
            continue
        if isinstance(decoded, dict):
            payload = decoded
            break
    if payload is None:
        raise RuntimeError('topup_cmd_invalid_json')

    signature = str(payload.get('txSignature') or payload.get('signature') or '').strip()
    if not signature:
        raise RuntimeError('topup_cmd_missing_tx_signature')
    return {
        'txSignature': signature,
        'toppedUpSol': max(0.0, parse_float(payload.get('toppedUpSol') if 'toppedUpSol' in payload else payload.get('amountSol'), amount_sol)),
    }


def run_earnings_sweep_cmd(
    *,
    to_pubkey: str,
    route_usd: float,
    delta_usd: float,
    checkpoint_id: str,
    required_balance_sol: float,
    current_balance_sol: float,
) -> dict[str, Any]:
    target_sol = floor_precision(max(0.0, required_balance_sol - current_balance_sol), 9)
    env = os.environ.copy()
    env.update(
        {
            'KYO_ROUTE_SWEEP_TO_PUBKEY': to_pubkey,
            'KYO_ROUTE_SWEEP_TARGET_USD': f'{route_usd:.8f}',
            'KYO_ROUTE_SWEEP_DELTA_USD': f'{delta_usd:.8f}',
            'KYO_ROUTE_SWEEP_CHECKPOINT_ID': checkpoint_id,
            'KYO_ROUTE_SWEEP_REQUIRED_BALANCE_SOL': format_sol(required_balance_sol),
            'KYO_ROUTE_SWEEP_CURRENT_BALANCE_SOL': format_sol(current_balance_sol),
            'KYO_ROUTE_SWEEP_TARGET_SOL': format_sol(target_sol),
            'KYO_ROUTE_SWEEP_SOL_PRICE_USD': f'{SOL_PRICE_USD:.8f}',
        }
    )
    proc = subprocess.run(
        ['bash', '-lc', ROUTE_EARNINGS_SWEEP_CMD],
        capture_output=True,
        text=True,
        timeout=CLI_TIMEOUT_SECONDS,
        check=False,
        env=env,
    )
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout or f'earnings_sweep_cmd_exit_{proc.returncode}').strip()[:350] or 'earnings_sweep_cmd_failed')

    payload = None
    for line in reversed((proc.stdout or '').splitlines()):
        stripped = line.strip()
        if not stripped:
            continue
        try:
            decoded = json.loads(stripped)
        except Exception:
            continue
        if isinstance(decoded, dict):
            payload = decoded
            break
    if payload is None:
        raise RuntimeError('earnings_sweep_cmd_invalid_json')

    signature = str(payload.get('txSignature') or payload.get('signature') or '').strip()
    if not signature:
        raise RuntimeError('earnings_sweep_cmd_missing_tx_signature')
    swept_sol = max(
        0.0,
        parse_float(
            payload.get('sweptSol')
            if 'sweptSol' in payload
            else payload.get('amountSol'),
            0.0,
        ),
    )
    return {
        'txSignature': signature,
        'sweptSol': swept_sol,
    }


def route_wallet_snapshot(*, solana_bin: str) -> dict[str, Any]:
    snapshot: dict[str, Any] = {
        'pubkey': '',
        'balanceSol': 0.0,
        'keypairFound': False,
        'solanaCliFound': bool(solana_bin),
    }
    if not solana_bin or not KEYPAIR_PATH:
        return snapshot
    keypair = Path(KEYPAIR_PATH).expanduser()
    if not keypair.exists():
        return snapshot
    snapshot['keypairFound'] = True
    pubkey = keypair_pubkey(keypair)
    if not pubkey:
        return snapshot
    snapshot['pubkey'] = pubkey
    snapshot['balanceSol'] = read_solana_balance_pubkey(solana_bin=solana_bin, pubkey=pubkey)
    return snapshot


def compute_topup_amount(*, current_balance_sol: float, required_balance_sol: float) -> float:
    desired = max(required_balance_sol, ROUTE_MIN_WALLET_SOL, ROUTE_TOPUP_TARGET_SOL)
    deficit = max(0.0, desired - current_balance_sol)
    if deficit <= 0:
        return 0.0
    if ROUTE_TOPUP_MAX_SOL_PER_RUN > 0:
        deficit = min(deficit, ROUTE_TOPUP_MAX_SOL_PER_RUN)
    return floor_precision(deficit, 9)


def reserve_wallet_balance_sol() -> float:
    return max(0.0, ROUTE_MIN_WALLET_SOL + ROUTE_FEE_RESERVE_SOL + ROUTE_RENT_RESERVE_SOL)


def maybe_topup_route_wallet(*, solana_bin: str, required_balance_sol: float) -> dict[str, Any]:
    snapshot = route_wallet_snapshot(solana_bin=solana_bin)
    result: dict[str, Any] = {
        'attempted': False,
        'ok': True,
        'reason': 'not_required',
        'requiredBalanceSol': round(max(0.0, required_balance_sol), 9),
        'pubkey': str(snapshot.get('pubkey') or ''),
        'balanceBeforeSol': round(parse_float(snapshot.get('balanceSol'), 0.0), 9),
        'balanceAfterSol': round(parse_float(snapshot.get('balanceSol'), 0.0), 9),
        'toppedUpSol': 0.0,
        'txSignature': '',
    }
    if required_balance_sol <= 0:
        return result
    if not snapshot.get('solanaCliFound'):
        result.update({'ok': False, 'reason': 'missing_solana_cli'})
        return result
    if not snapshot.get('keypairFound'):
        result.update({'ok': False, 'reason': 'missing_trading_staking_keypair'})
        return result
    current_balance = parse_float(snapshot.get('balanceSol'), 0.0)
    if current_balance >= required_balance_sol:
        result.update({'reason': 'already_sufficient'})
        return result
    if not ROUTE_TOPUP_ENABLED:
        result.update({'ok': False, 'reason': 'route_wallet_below_minimum_no_topup'})
        return result

    amount_sol = compute_topup_amount(current_balance_sol=current_balance, required_balance_sol=required_balance_sol)
    if amount_sol <= 0:
        result.update({'reason': 'already_sufficient'})
        return result

    route_pubkey = str(snapshot.get('pubkey') or '').strip()
    if not route_pubkey:
        result.update({'ok': False, 'reason': 'missing_trading_staking_pubkey'})
        return result

    result['attempted'] = True
    try:
        if ROUTE_TOPUP_CMD:
            topup = run_topup_cmd(
                amount_sol=amount_sol,
                to_pubkey=route_pubkey,
                required_balance_sol=required_balance_sol,
                current_balance_sol=current_balance,
            )
        else:
            if not ROUTE_TOPUP_FROM_KEYPAIR_PATH:
                raise RuntimeError('missing_route_topup_source_keypair')
            source_keypair = Path(ROUTE_TOPUP_FROM_KEYPAIR_PATH).expanduser()
            if not source_keypair.exists():
                raise RuntimeError('route_topup_source_keypair_not_found')
            topup = run_transfer_from_keypair(
                solana_bin=solana_bin,
                from_keypair=source_keypair,
                to_pubkey=route_pubkey,
                amount_sol=amount_sol,
            )
    except Exception as exc:
        result.update({'ok': False, 'reason': str(exc).strip()[:350] or 'route_topup_failed'})
        return result

    balance_after = read_solana_balance_pubkey(solana_bin=solana_bin, pubkey=route_pubkey)
    result.update(
        {
            'reason': 'topup_applied',
            'balanceAfterSol': round(balance_after, 9),
            'toppedUpSol': round(parse_float(topup.get('toppedUpSol'), amount_sol), 9),
            'txSignature': str(topup.get('txSignature') or '').strip(),
        }
    )
    if balance_after + 1e-9 < required_balance_sol:
        result.update({'ok': False, 'reason': 'route_wallet_still_below_required_after_topup'})
    return result


def maybe_sweep_route_wallet_earnings(
    *,
    solana_bin: str,
    required_balance_sol: float,
    route_usd: float,
    delta_usd: float,
    checkpoint_id: str,
) -> dict[str, Any]:
    snapshot = route_wallet_snapshot(solana_bin=solana_bin)
    result: dict[str, Any] = {
        'attempted': False,
        'ok': True,
        'reason': 'not_required',
        'requiredBalanceSol': round(max(0.0, required_balance_sol), 9),
        'pubkey': str(snapshot.get('pubkey') or ''),
        'balanceBeforeSol': round(parse_float(snapshot.get('balanceSol'), 0.0), 9),
        'balanceAfterSol': round(parse_float(snapshot.get('balanceSol'), 0.0), 9),
        'sweptSol': 0.0,
        'txSignature': '',
    }
    if required_balance_sol <= 0:
        return result
    if not ROUTE_EARNINGS_SWEEP_ENABLED:
        result.update({'reason': 'earnings_sweep_disabled'})
        return result
    if not ROUTE_EARNINGS_SWEEP_CMD:
        result.update({'ok': False, 'reason': 'missing_earnings_sweep_cmd'})
        return result
    if route_usd < ROUTE_EARNINGS_SWEEP_MIN_USD:
        result.update({'reason': 'earnings_sweep_below_min_usd'})
        return result
    if not snapshot.get('solanaCliFound'):
        result.update({'ok': False, 'reason': 'missing_solana_cli'})
        return result
    current_balance = parse_float(snapshot.get('balanceSol'), 0.0)
    if current_balance >= required_balance_sol:
        result.update({'reason': 'already_sufficient'})
        return result
    route_pubkey = str(snapshot.get('pubkey') or '').strip()
    if not route_pubkey:
        result.update({'ok': False, 'reason': 'missing_trading_staking_pubkey'})
        return result

    result['attempted'] = True
    try:
        sweep = run_earnings_sweep_cmd(
            to_pubkey=route_pubkey,
            route_usd=route_usd,
            delta_usd=delta_usd,
            checkpoint_id=checkpoint_id,
            required_balance_sol=required_balance_sol,
            current_balance_sol=current_balance,
        )
    except Exception as exc:
        result.update({'ok': False, 'reason': str(exc).strip()[:350] or 'earnings_sweep_failed'})
        return result

    balance_after = read_solana_balance_pubkey(solana_bin=solana_bin, pubkey=route_pubkey)
    result.update(
        {
            'reason': 'earnings_sweep_applied',
            'balanceAfterSol': round(balance_after, 9),
            'sweptSol': round(parse_float(sweep.get('sweptSol'), 0.0), 9),
            'txSignature': str(sweep.get('txSignature') or '').strip(),
        }
    )
    if balance_after + 1e-9 < required_balance_sol:
        result.update({'ok': False, 'reason': 'route_wallet_still_below_required_after_earnings_sweep'})
    return result


def run_staking_period_deposit(*, amount_sol: float) -> dict[str, Any]:
    return run_fundry_staking_deposit(
        amount_sol=amount_sol,
        pool_url=STAKING_POOL_URL,
        keypair_path=KEYPAIR_PATH,
        rpc_url=RPC_URL,
        dry_run=DRY_RUN,
        timeout_seconds=CLI_TIMEOUT_SECONDS,
        admin_keypair_path=ADMIN_KEYPAIR_PATH,
    )


def trading_realized_snapshot(rows: list[dict[str, Any]], *, window_hours: int) -> dict[str, Any]:
    total_realized_net = 0.0
    window_realized_net = 0.0
    latest_id = ''
    latest_ts = datetime.fromtimestamp(0, tz=timezone.utc)
    row_count = 0
    synthetic_realized_close_violations = 0
    missing_realized_field_rows = 0
    now = datetime.now(timezone.utc)
    window_cutoff = now - timedelta(hours=max(1, window_hours))
    for row in rows:
        source = str(row.get('source') or '').strip().lower()
        if source != 'trading':
            continue
        kind = str(row.get('kind') or '').strip().lower()
        if kind != 'trade_close':
            continue
        status = str(row.get('status') or '').strip().lower()
        if status != 'success':
            continue
        realized = row.get('realized')
        if realized is not True and str(realized).strip().lower() not in {'true', '1'}:
            continue
        if not has_settlement_evidence(row):
            synthetic_realized_close_violations += 1
            continue
        if not close_row_has_required_realized_fields(row):
            missing_realized_field_rows += 1
            continue
        realized_profit = realized_profit_from_close_row(row)
        total_realized_net += realized_profit
        row_count += 1
        ts = parse_ts(row.get('at') or row.get('timestamp') or row.get('executedAt'))
        if ts is not None and ts >= window_cutoff:
            window_realized_net += realized_profit
        if ts is not None and ts >= latest_ts:
            latest_ts = ts
            latest_id = str(row.get('id') or '').strip() or latest_id
    return {
        'realizedNetUsdTotal': round(max(0.0, total_realized_net), 8),
        'realizedNetUsdWindow': round(window_realized_net, 8),
        'checkpointId': latest_id,
        'realizedRows': row_count,
        'syntheticRealizedCloseViolations': synthetic_realized_close_violations,
        'missingRealizedFieldRows': missing_realized_field_rows,
        'routeBasisWindowHours': max(1, window_hours),
    }


def run() -> int:
    ensure_dirs()
    started_at = now_iso()

    if not ENABLE_TRADING_AGENT:
        summary = {
            'ok': True,
            'status': 'disabled',
            'reason': 'trading_agent_disabled',
            'at': now_iso(),
            'startedAt': started_at,
        }
        write_json(STATE_PATH, {'lastRunAt': summary['at'], 'lastStatus': summary})
        write_json(OUTPUT_PATH, summary)
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    rows = jsonl_rows(LEDGER_PATH)
    realized_snapshot = trading_realized_snapshot(rows, window_hours=ROUTE_BASIS_WINDOW_HOURS)
    total_realized_net_usd = round(parse_float(realized_snapshot.get('realizedNetUsdTotal'), 0.0), 8)
    realized_net_usd_24h = round(parse_float(realized_snapshot.get('realizedNetUsdWindow'), 0.0), 8)
    checkpoint_id = str(realized_snapshot.get('checkpointId') or '')
    realized_rows = int(realized_snapshot.get('realizedRows') or 0)
    synthetic_violations = int(realized_snapshot.get('syntheticRealizedCloseViolations') or 0)
    missing_realized_field_rows = int(realized_snapshot.get('missingRealizedFieldRows') or 0)
    state = read_json(STATE_PATH, {})
    if not isinstance(state, dict):
        state = {}
    solana_bin = shutil.which('solana') or ''
    route_wallet = route_wallet_snapshot(solana_bin=solana_bin)
    topup_result: dict[str, Any] = {
        'attempted': False,
        'ok': True,
        'reason': 'not_required',
        'requiredBalanceSol': round(max(0.0, ROUTE_MIN_WALLET_SOL), 9),
        'pubkey': str(route_wallet.get('pubkey') or ''),
        'balanceBeforeSol': round(parse_float(route_wallet.get('balanceSol'), 0.0), 9),
        'balanceAfterSol': round(parse_float(route_wallet.get('balanceSol'), 0.0), 9),
        'toppedUpSol': 0.0,
        'txSignature': '',
    }
    sweep_result: dict[str, Any] = {
        'attempted': False,
        'ok': True,
        'reason': 'not_required',
        'requiredBalanceSol': round(max(0.0, ROUTE_MIN_WALLET_SOL), 9),
        'pubkey': str(route_wallet.get('pubkey') or ''),
        'balanceBeforeSol': round(parse_float(route_wallet.get('balanceSol'), 0.0), 9),
        'balanceAfterSol': round(parse_float(route_wallet.get('balanceSol'), 0.0), 9),
        'sweptSol': 0.0,
        'txSignature': '',
    }

    def apply_wallet_fields(summary: dict[str, Any]) -> None:
        balance_after = parse_float(route_wallet.get('balanceSol'), 0.0)
        if sweep_result.get('attempted'):
            balance_after = parse_float(sweep_result.get('balanceAfterSol'), balance_after)
        if topup_result.get('attempted'):
            balance_after = parse_float(topup_result.get('balanceAfterSol'), balance_after)
        summary.update(
            {
                'routeWalletMinSol': ROUTE_MIN_WALLET_SOL,
                'routeWalletPubkey': str(topup_result.get('pubkey') or sweep_result.get('pubkey') or route_wallet.get('pubkey') or ''),
                'routeWalletBalanceSol': round(balance_after, 9),
                'earningsSweepEnabled': ROUTE_EARNINGS_SWEEP_ENABLED,
                'earningsSweepAttempted': bool(sweep_result.get('attempted')),
                'earningsSweepOk': bool(sweep_result.get('ok')),
                'earningsSweepReason': str(sweep_result.get('reason') or ''),
                'earningsSweepAmountSol': round(parse_float(sweep_result.get('sweptSol'), 0.0), 9),
                'earningsSweepTxSignature': str(sweep_result.get('txSignature') or ''),
                'topupEnabled': ROUTE_TOPUP_ENABLED,
                'topupAttempted': bool(topup_result.get('attempted')),
                'topupOk': bool(topup_result.get('ok')),
                'topupReason': str(topup_result.get('reason') or ''),
                'topupAmountSol': round(parse_float(topup_result.get('toppedUpSol'), 0.0), 9),
                'topupTxSignature': str(topup_result.get('txSignature') or ''),
                'topupRequiredBalanceSol': round(parse_float(topup_result.get('requiredBalanceSol'), ROUTE_MIN_WALLET_SOL), 9),
            }
        )
    processed_realized_net_usd = max(0.0, parse_float(state.get('processedRealizedNetUsd'), 0.0))
    rebased_processed_overshoot = False
    if ROUTE_REBASE_ON_OVERSHOOT and processed_realized_net_usd > total_realized_net_usd:
        processed_realized_net_usd = total_realized_net_usd
        rebased_processed_overshoot = True

    delta_unrouted_usd = round(total_realized_net_usd - processed_realized_net_usd, 8)
    route_usd_24h = floor_precision(max(0.0, realized_net_usd_24h) * (ROUTE_BPS / 10_000.0), 8)
    reserve_balance_sol = reserve_wallet_balance_sol()
    if delta_unrouted_usd <= ROUTE_TOLERANCE_USD:
        if reserve_balance_sol > 0:
            sweep_result = maybe_sweep_route_wallet_earnings(
                solana_bin=solana_bin,
                required_balance_sol=reserve_balance_sol,
                route_usd=0.0,
                delta_usd=delta_unrouted_usd,
                checkpoint_id=checkpoint_id,
            )
            if sweep_result.get('attempted') and str(sweep_result.get('txSignature') or '').strip():
                append_json_line(
                    LOG_PATH,
                    {
                        'at': now_iso(),
                        'event': 'trading_route_wallet_earnings_sweep',
                        'ok': bool(sweep_result.get('ok')),
                        'reason': str(sweep_result.get('reason') or ''),
                        'amountSol': round(parse_float(sweep_result.get('sweptSol'), 0.0), 9),
                        'txSignature': str(sweep_result.get('txSignature') or ''),
                        'routeWalletPubkey': str(sweep_result.get('pubkey') or ''),
                    },
                )
            sweep_balance_after = parse_float(
                sweep_result.get('balanceAfterSol'),
                parse_float(route_wallet.get('balanceSol'), 0.0),
            )
            if sweep_balance_after < reserve_balance_sol:
                topup_result = maybe_topup_route_wallet(
                    solana_bin=solana_bin,
                    required_balance_sol=reserve_balance_sol,
                )
        summary = {
            'ok': True,
            'status': 'up_to_date',
            'reason': 'within_tolerance' if delta_unrouted_usd > 0 else 'no_unrouted_balance',
            'routeSkippedReason': 'within_tolerance' if delta_unrouted_usd > 0 else 'no_unrouted_balance',
            'at': now_iso(),
            'startedAt': started_at,
            'realizedNetUsdTotal': total_realized_net_usd,
            'realizedNetUsd24h': realized_net_usd_24h,
            'processedRealizedNetUsd': processed_realized_net_usd,
            'deltaUnroutedUsd': round(max(0.0, delta_unrouted_usd), 8),
            'unroutedRealizedNetUsd': round(max(0.0, delta_unrouted_usd), 8),
            'routeUsd24h': route_usd_24h,
            'routeLagToleranceUsd': ROUTE_TOLERANCE_USD,
            'routeBasisWindowHours': ROUTE_BASIS_WINDOW_HOURS,
            'routeBps': ROUTE_BPS,
            'routeMinSol': ROUTE_MIN_SOL,
            'solPriceUsd': SOL_PRICE_USD,
            'checkpointId': checkpoint_id,
            'realizedRows': realized_rows,
            'syntheticRealizedCloseViolations': synthetic_violations,
            'missingRealizedFieldRows': missing_realized_field_rows,
            'rebasedProcessedOvershoot': rebased_processed_overshoot,
            'lastRoutedLedgerCursor': str(state.get('lastRoutedLedgerCursor') or ''),
            'lastRoutedNetUsd': round(parse_float(state.get('lastRoutedNetUsd'), 0.0), 8),
            'stakingPoolUrl': STAKING_POOL_URL,
            'receiptsPath': str(ROUTE_RECEIPTS_PATH),
            'ledgerPath': str(LEDGER_PATH),
        }
        apply_wallet_fields(summary)
        write_json(
            STATE_PATH,
            {
                'lastRunAt': summary['at'],
                'processedRealizedNetUsd': processed_realized_net_usd,
                'lastRoutedLedgerCursor': str(state.get('lastRoutedLedgerCursor') or ''),
                'lastRoutedNetUsd': round(parse_float(state.get('lastRoutedNetUsd'), 0.0), 8),
                'lastStatus': summary,
            },
        )
        write_json(OUTPUT_PATH, summary)
        append_json_line(
            LOG_PATH,
            {
                'at': summary['at'],
                'event': 'trading_staking_route',
                'ok': summary['ok'],
                'status': summary['status'],
                'reason': summary['reason'],
                'deltaUnroutedUsd': summary['deltaUnroutedUsd'],
                'syntheticRealizedCloseViolations': synthetic_violations,
            },
        )
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    if realized_net_usd_24h <= 0:
        summary = {
            'ok': True,
            'status': 'no_route',
            'reason': 'no_positive_realized_24h',
            'routeSkippedReason': 'no_positive_realized_24h',
            'at': now_iso(),
            'startedAt': started_at,
            'realizedNetUsdTotal': total_realized_net_usd,
            'realizedNetUsd24h': realized_net_usd_24h,
            'processedRealizedNetUsd': processed_realized_net_usd,
            'deltaUnroutedUsd': delta_unrouted_usd,
            'unroutedRealizedNetUsd': delta_unrouted_usd,
            'routeUsd24h': route_usd_24h,
            'routeBasisWindowHours': ROUTE_BASIS_WINDOW_HOURS,
            'routeBps': ROUTE_BPS,
            'routeMinSol': ROUTE_MIN_SOL,
            'solPriceUsd': SOL_PRICE_USD,
            'checkpointId': checkpoint_id,
            'realizedRows': realized_rows,
            'syntheticRealizedCloseViolations': synthetic_violations,
            'missingRealizedFieldRows': missing_realized_field_rows,
            'stakingPoolUrl': STAKING_POOL_URL,
            'receiptsPath': str(ROUTE_RECEIPTS_PATH),
            'ledgerPath': str(LEDGER_PATH),
        }
        apply_wallet_fields(summary)
        write_json(
            STATE_PATH,
            {
                'lastRunAt': summary['at'],
                'processedRealizedNetUsd': processed_realized_net_usd,
                'lastRoutedLedgerCursor': str(state.get('lastRoutedLedgerCursor') or ''),
                'lastRoutedNetUsd': round(parse_float(state.get('lastRoutedNetUsd'), 0.0), 8),
                'lastStatus': summary,
            },
        )
        write_json(OUTPUT_PATH, summary)
        append_json_line(
            LOG_PATH,
            {
                'at': summary['at'],
                'event': 'trading_staking_route',
                'ok': summary['ok'],
                'status': summary['status'],
                'reason': summary['reason'],
                'deltaUnroutedUsd': summary['deltaUnroutedUsd'],
                'realizedNetUsd24h': summary['realizedNetUsd24h'],
                'routeUsd24h': summary['routeUsd24h'],
                'missingRealizedFieldRows': missing_realized_field_rows,
                'syntheticRealizedCloseViolations': synthetic_violations,
            },
        )
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    route_usd_parity = floor_precision(max(0.0, delta_unrouted_usd) * (ROUTE_BPS / 10_000.0), 8)
    route_usd = min(route_usd_24h, route_usd_parity)
    route_sol = floor_precision(route_usd / SOL_PRICE_USD, 9)
    required_route_balance_sol = max(reserve_balance_sol, route_sol + reserve_balance_sol)
    if required_route_balance_sol > 0:
        sweep_result = maybe_sweep_route_wallet_earnings(
            solana_bin=solana_bin,
            required_balance_sol=required_route_balance_sol,
            route_usd=route_usd,
            delta_usd=delta_unrouted_usd,
            checkpoint_id=checkpoint_id,
        )
        if sweep_result.get('attempted') and str(sweep_result.get('txSignature') or '').strip():
            append_json_line(
                LOG_PATH,
                {
                    'at': now_iso(),
                    'event': 'trading_route_wallet_earnings_sweep',
                    'ok': bool(sweep_result.get('ok')),
                    'reason': str(sweep_result.get('reason') or ''),
                    'amountSol': round(parse_float(sweep_result.get('sweptSol'), 0.0), 9),
                    'txSignature': str(sweep_result.get('txSignature') or ''),
                    'routeWalletPubkey': str(sweep_result.get('pubkey') or ''),
                },
            )
        sweep_balance_after = parse_float(
            sweep_result.get('balanceAfterSol'),
            parse_float(route_wallet.get('balanceSol'), 0.0),
        )
        if sweep_balance_after < reserve_balance_sol:
            topup_result = maybe_topup_route_wallet(
                solana_bin=solana_bin,
                required_balance_sol=reserve_balance_sol,
            )
        if topup_result.get('attempted') and str(topup_result.get('txSignature') or '').strip():
            append_json_line(
                LOG_PATH,
                {
                    'at': now_iso(),
                    'event': 'trading_route_wallet_topup',
                    'ok': bool(topup_result.get('ok')),
                    'reason': str(topup_result.get('reason') or ''),
                    'amountSol': round(parse_float(topup_result.get('toppedUpSol'), 0.0), 9),
                    'txSignature': str(topup_result.get('txSignature') or ''),
                    'routeWalletPubkey': str(topup_result.get('pubkey') or ''),
                },
            )
    available_route_balance_sol = parse_float(route_wallet.get('balanceSol'), 0.0)
    if sweep_result.get('attempted'):
        available_route_balance_sol = parse_float(sweep_result.get('balanceAfterSol'), available_route_balance_sol)
    if topup_result.get('attempted'):
        available_route_balance_sol = parse_float(topup_result.get('balanceAfterSol'), available_route_balance_sol)
    if route_sol < ROUTE_MIN_SOL:
        summary = {
            'ok': True,
            'status': 'no_route',
            'reason': 'below_min_sol',
            'routeSkippedReason': 'below_min_sol',
            'at': now_iso(),
            'startedAt': started_at,
            'realizedNetUsdTotal': total_realized_net_usd,
            'realizedNetUsd24h': realized_net_usd_24h,
            'processedRealizedNetUsd': processed_realized_net_usd,
            'deltaUnroutedUsd': delta_unrouted_usd,
            'unroutedRealizedNetUsd': delta_unrouted_usd,
            'routeUsd24h': route_usd_24h,
            'routeUsd': route_usd,
            'routeSol': route_sol,
            'routeBasisWindowHours': ROUTE_BASIS_WINDOW_HOURS,
            'routeMinSol': ROUTE_MIN_SOL,
            'solPriceUsd': SOL_PRICE_USD,
            'routeBps': ROUTE_BPS,
            'checkpointId': checkpoint_id,
            'stakingPoolUrl': STAKING_POOL_URL,
            'syntheticRealizedCloseViolations': synthetic_violations,
            'missingRealizedFieldRows': missing_realized_field_rows,
            'receiptsPath': str(ROUTE_RECEIPTS_PATH),
            'ledgerPath': str(LEDGER_PATH),
        }
        apply_wallet_fields(summary)
        write_json(
            STATE_PATH,
            {
                'lastRunAt': summary['at'],
                'processedRealizedNetUsd': processed_realized_net_usd,
                'lastRoutedLedgerCursor': str(state.get('lastRoutedLedgerCursor') or ''),
                'lastRoutedNetUsd': round(parse_float(state.get('lastRoutedNetUsd'), 0.0), 8),
                'lastStatus': summary,
            },
        )
        write_json(OUTPUT_PATH, summary)
        append_json_line(
            LOG_PATH,
            {
                'at': summary['at'],
                'event': 'trading_staking_route',
                'ok': summary['ok'],
                'status': summary['status'],
                'reason': summary['reason'],
                'routeUsd': route_usd,
                'routeSol': route_sol,
                'syntheticRealizedCloseViolations': synthetic_violations,
            },
        )
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    if available_route_balance_sol + 1e-9 < required_route_balance_sol:
        summary = {
            'ok': False,
            'status': 'blocked',
            'reason': 'insufficient_route_wallet_profit_balance',
            'routeSkippedReason': 'insufficient_route_wallet_profit_balance',
            'at': now_iso(),
            'startedAt': started_at,
            'realizedNetUsdTotal': total_realized_net_usd,
            'realizedNetUsd24h': realized_net_usd_24h,
            'processedRealizedNetUsd': processed_realized_net_usd,
            'deltaUnroutedUsd': delta_unrouted_usd,
            'unroutedRealizedNetUsd': delta_unrouted_usd,
            'routeUsd24h': route_usd_24h,
            'routeUsd': route_usd,
            'routeSol': route_sol,
            'routeBasisWindowHours': ROUTE_BASIS_WINDOW_HOURS,
            'routeBps': ROUTE_BPS,
            'solPriceUsd': SOL_PRICE_USD,
            'checkpointId': checkpoint_id,
            'syntheticRealizedCloseViolations': synthetic_violations,
            'missingRealizedFieldRows': missing_realized_field_rows,
            'stakingPoolUrl': STAKING_POOL_URL,
            'requiredRouteBalanceSol': round(required_route_balance_sol, 9),
            'availableRouteBalanceSol': round(available_route_balance_sol, 9),
            'receiptsPath': str(ROUTE_RECEIPTS_PATH),
            'ledgerPath': str(LEDGER_PATH),
        }
        apply_wallet_fields(summary)
        write_json(
            STATE_PATH,
            {
                'lastRunAt': summary['at'],
                'processedRealizedNetUsd': processed_realized_net_usd,
                'lastRoutedLedgerCursor': str(state.get('lastRoutedLedgerCursor') or ''),
                'lastRoutedNetUsd': round(parse_float(state.get('lastRoutedNetUsd'), 0.0), 8),
                'lastStatus': summary,
            },
        )
        write_json(OUTPUT_PATH, summary)
        append_json_line(
            LOG_PATH,
            {
                'at': summary['at'],
                'event': 'trading_staking_route',
                'ok': False,
                'status': summary['status'],
                'reason': summary['reason'],
                'routeUsd': route_usd,
                'routeSol': route_sol,
                'availableRouteBalanceSol': summary['availableRouteBalanceSol'],
                'requiredRouteBalanceSol': summary['requiredRouteBalanceSol'],
                'syntheticRealizedCloseViolations': synthetic_violations,
            },
        )
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    pool_id = pool_id_from_url(STAKING_POOL_URL)
    if not pool_id:
        summary = {
            'ok': False,
            'status': 'blocked',
            'reason': 'invalid_staking_pool_url',
            'routeSkippedReason': 'invalid_staking_pool_url',
            'at': now_iso(),
            'startedAt': started_at,
            'stakingPoolUrl': STAKING_POOL_URL,
            'realizedNetUsd24h': realized_net_usd_24h,
            'routeUsd24h': route_usd_24h,
            'deltaUnroutedUsd': delta_unrouted_usd,
            'unroutedRealizedNetUsd': delta_unrouted_usd,
            'routeUsd': route_usd,
            'routeSol': route_sol,
            'routeBasisWindowHours': ROUTE_BASIS_WINDOW_HOURS,
            'syntheticRealizedCloseViolations': synthetic_violations,
            'missingRealizedFieldRows': missing_realized_field_rows,
        }
        apply_wallet_fields(summary)
        write_json(
            STATE_PATH,
            {
                'lastRunAt': summary['at'],
                'processedRealizedNetUsd': processed_realized_net_usd,
                'lastRoutedLedgerCursor': str(state.get('lastRoutedLedgerCursor') or ''),
                'lastRoutedNetUsd': round(parse_float(state.get('lastRoutedNetUsd'), 0.0), 8),
                'lastStatus': summary,
            },
        )
        write_json(OUTPUT_PATH, summary)
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    try:
        if ROUTE_CMD:
            route_result = run_route_cmd(
                amount_sol=route_sol,
                route_usd=route_usd,
                delta_usd=delta_unrouted_usd,
                checkpoint_id=checkpoint_id,
            )
        else:
            route_result = run_staking_period_deposit(amount_sol=route_sol)
    except Exception as exc:
        error_message = str(exc).strip()[:350] or 'route_execution_failed'
        summary = {
            'ok': False,
            'status': 'blocked',
            'reason': error_message,
            'routeSkippedReason': 'route_execution_failed',
            'at': now_iso(),
            'startedAt': started_at,
            'realizedNetUsdTotal': total_realized_net_usd,
            'realizedNetUsd24h': realized_net_usd_24h,
            'processedRealizedNetUsd': processed_realized_net_usd,
            'deltaUnroutedUsd': delta_unrouted_usd,
            'unroutedRealizedNetUsd': delta_unrouted_usd,
            'routeUsd24h': route_usd_24h,
            'routeUsd': route_usd,
            'routeSol': route_sol,
            'routeBasisWindowHours': ROUTE_BASIS_WINDOW_HOURS,
            'routeBps': ROUTE_BPS,
            'solPriceUsd': SOL_PRICE_USD,
            'stakingPoolUrl': STAKING_POOL_URL,
            'checkpointId': checkpoint_id,
            'syntheticRealizedCloseViolations': synthetic_violations,
            'missingRealizedFieldRows': missing_realized_field_rows,
        }
        apply_wallet_fields(summary)
        write_json(
            STATE_PATH,
            {
                'lastRunAt': summary['at'],
                'processedRealizedNetUsd': processed_realized_net_usd,
                'lastRoutedLedgerCursor': str(state.get('lastRoutedLedgerCursor') or ''),
                'lastRoutedNetUsd': round(parse_float(state.get('lastRoutedNetUsd'), 0.0), 8),
                'lastStatus': summary,
            },
        )
        write_json(OUTPUT_PATH, summary)
        append_json_line(
            LOG_PATH,
            {
                'at': summary['at'],
                'event': 'trading_staking_route',
                'ok': False,
                'status': summary['status'],
                'reason': summary['reason'],
                'deltaUnroutedUsd': delta_unrouted_usd,
                'syntheticRealizedCloseViolations': synthetic_violations,
            },
        )
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    routed_sol = max(0.0, parse_float(route_result.get('routedSol'), route_sol))
    routed_usd = round(routed_sol * SOL_PRICE_USD, 8)
    tx_signature = str(route_result.get('txSignature') or '').strip()
    route_method = str(route_result.get('method') or ('dry_run' if DRY_RUN else 'staking_period_deposit')).strip()
    staking_period = str(route_result.get('stakingPeriod') or '').strip()
    period_vault = str(route_result.get('periodVault') or '').strip()
    period_number = str(route_result.get('periodNumber') or '').strip()
    routed_at = now_iso()
    processed_increment_usd = 0.0
    if ROUTE_BPS > 0:
        processed_increment_usd = round(routed_usd * (10_000.0 / float(ROUTE_BPS)), 8)
    processed_realized_after = round(min(total_realized_net_usd, processed_realized_net_usd + processed_increment_usd), 8)
    unrouted_after = round(max(0.0, total_realized_net_usd - processed_realized_after), 8)

    receipt = {
        'at': routed_at,
        'source': 'trading',
        'channel': 'trading',
        'routeBps': ROUTE_BPS,
        'routeUsd': routed_usd,
        'routedSol': round(routed_sol, 9),
        'solPriceUsd': round(SOL_PRICE_USD, 8),
        'txSignature': tx_signature,
        'method': route_method,
        'checkpointId': checkpoint_id,
        'realizedNetUsdTotal': total_realized_net_usd,
        'deltaUnroutedUsd': delta_unrouted_usd,
        'stakingPoolUrl': STAKING_POOL_URL,
        'lastRoutedTradingLedgerId': checkpoint_id,
        'stakingPeriod': staking_period,
        'periodVault': period_vault,
        'periodNumber': period_number,
    }
    append_json_line(ROUTE_RECEIPTS_PATH, receipt)

    ledger_row = {
        'id': f'trading-route-{int(datetime.now(timezone.utc).timestamp())}',
        'at': routed_at,
        'source': 'trading',
        'venue': 'routing',
        'kind': 'route',
        'status': 'success',
        'realized': True,
        'grossUsd': 0.0,
        'costUsd': routed_usd,
        'netUsd': round(-routed_usd, 8),
        'paymentRef': tx_signature,
        'txSignature': tx_signature,
        'checkpointId': checkpoint_id,
        'metadata': {
            'routeBps': ROUTE_BPS,
            'routedSol': round(routed_sol, 9),
            'stakingPoolUrl': STAKING_POOL_URL,
            'method': route_method,
            'stakingPeriod': staking_period,
            'periodVault': period_vault,
            'periodNumber': period_number,
        },
    }
    append_json_line(LEDGER_PATH, ledger_row)

    summary = {
        'ok': True,
        'status': 'routed',
        'routeSkippedReason': '',
        'at': routed_at,
        'startedAt': started_at,
        'realizedNetUsdTotal': total_realized_net_usd,
        'realizedNetUsd24h': realized_net_usd_24h,
        'processedRealizedNetUsd': processed_realized_after,
        'deltaUnroutedUsd': delta_unrouted_usd,
        'unroutedRealizedNetUsd': unrouted_after,
        'routeUsd24h': route_usd_24h,
        'routeUsd': routed_usd,
        'routeSol': round(routed_sol, 9),
        'routeBasisWindowHours': ROUTE_BASIS_WINDOW_HOURS,
        'routeBps': ROUTE_BPS,
        'routeMinSol': ROUTE_MIN_SOL,
        'solPriceUsd': round(SOL_PRICE_USD, 8),
        'checkpointId': checkpoint_id,
        'syntheticRealizedCloseViolations': synthetic_violations,
        'missingRealizedFieldRows': missing_realized_field_rows,
        'txSignature': tx_signature,
        'method': route_method,
        'stakingPoolUrl': STAKING_POOL_URL,
        'stakingPeriod': staking_period,
        'periodVault': period_vault,
        'periodNumber': period_number,
        'receiptsPath': str(ROUTE_RECEIPTS_PATH),
        'ledgerPath': str(LEDGER_PATH),
        'lastRoutedLedgerCursor': checkpoint_id,
        'lastRoutedNetUsd': round(route_usd, 8),
    }
    apply_wallet_fields(summary)
    write_json(
        STATE_PATH,
        {
            'lastRunAt': summary['at'],
            'processedRealizedNetUsd': processed_realized_after,
            'lastRoutedLedgerCursor': checkpoint_id,
            'lastRoutedNetUsd': routed_usd,
            'lastStatus': summary,
        },
    )
    write_json(OUTPUT_PATH, summary)
    append_json_line(
        LOG_PATH,
        {
            'at': summary['at'],
            'event': 'trading_staking_route',
            'ok': True,
            'status': summary['status'],
            'routeUsd': summary['routeUsd'],
            'routeSol': summary['routeSol'],
            'txSignature': tx_signature,
            'checkpointId': checkpoint_id,
            'syntheticRealizedCloseViolations': synthetic_violations,
        },
    )
    print(json.dumps(summary, ensure_ascii=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(run())
