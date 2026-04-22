#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from decimal import Decimal, ROUND_DOWN
from datetime import datetime, timezone
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

STATE_PATH = STATE_DIR / 'creator-fee-inflow-route-state.json'
OUTPUT_PATH = STATE_DIR / 'creator-fee-inflow-route.json'
LOG_PATH = LOG_DIR / 'creator-fee-inflow-route.jsonl'
RECEIPTS_PATH = Path(
    os.getenv('KYO_CREATOR_FEE_INFLOW_RECEIPTS_PATH', str(RECEIPTS_DIR / 'creator-fee-inflow-route.jsonl')).strip()
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


ENABLE_ROUTE = env_bool('KYO_ENABLE_CREATOR_FEE_INFLOW_ROUTE', False)
DEFAULT_POOL_URL = 'https://fundry.collaterize.com/staking/9mEd5iRcdbNUwaCmkPqYggLfg25B2DsTn1w6gNrgvC9d'
WATCH_WALLET = os.getenv('KYO_CREATOR_FEE_INFLOW_WALLET', '').strip()
STAKING_POOL_URL = os.getenv('KYO_CREATOR_FEE_STAKING_POOL_URL', DEFAULT_POOL_URL).strip() or DEFAULT_POOL_URL
ROUTE_BPS = max(0, min(10000, env_int('KYO_CREATOR_FEE_INFLOW_ROUTE_BPS', 5000)))
MIN_TRANSFER_SOL = max(0.0, env_float('KYO_CREATOR_FEE_INFLOW_MIN_TRANSFER_SOL', 0.000001))
ROUTE_CMD = os.getenv('KYO_CREATOR_FEE_INFLOW_ROUTE_CMD', '').strip()
DRY_RUN = env_bool('KYO_CREATOR_FEE_INFLOW_DRY_RUN', False)
KEYPAIR_PATH = os.getenv('KYO_CREATOR_FEE_INFLOW_KEYPAIR_PATH', '').strip()
ADMIN_KEYPAIR_PATH = os.getenv('KYO_CREATOR_FEE_INFLOW_ADMIN_KEYPAIR_PATH', '').strip()
RPC_URL = os.getenv('KYO_CREATOR_FEE_INFLOW_RPC_URL', '').strip() or os.getenv('SOLANA_RPC_URL', '').strip() or 'https://api.mainnet-beta.solana.com'
HTTP_TIMEOUT_SECONDS = max(3, min(60, env_int('KYO_CREATOR_FEE_INFLOW_TIMEOUT_SECONDS', 12)))
CLI_TIMEOUT_SECONDS = max(15, min(180, env_int('KYO_CREATOR_FEE_INFLOW_CLI_TIMEOUT_SECONDS', 90)))
BALANCE_EPSILON_SOL = max(0.0, env_float('KYO_CREATOR_FEE_INFLOW_BALANCE_EPSILON_SOL', 0.000000001))
SOLANA_SIGNATURE_RE = re.compile(r'^[1-9A-HJ-NP-Za-km-z]{80,96}$')


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_dirs() -> None:
    for path in (WORKSPACE, RUNTIME_DIR, STATE_DIR, RECEIPTS_DIR, LOG_DIR, RECEIPTS_PATH.parent):
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


def floor_precision(value: Any, precision: int = 9) -> float:
    dec_value = Decimal(str(value))
    if dec_value <= 0:
        return 0.0
    quantum = Decimal(1).scaleb(-precision)
    return float(dec_value.quantize(quantum, rounding=ROUND_DOWN))


def format_sol(value: float) -> str:
    text = f'{value:.9f}'.rstrip('0').rstrip('.')
    return text if text else '0'


def baseline_after_route(*, baseline_balance_sol: float, observed_after_sol: float, routed_sol: float) -> float:
    advanced_baseline = floor_precision(Decimal(str(max(0.0, baseline_balance_sol))) + Decimal(str(max(0.0, routed_sol))), 9)
    capped_observed_balance = floor_precision(max(0.0, observed_after_sol), 9)
    return min(capped_observed_balance, advanced_baseline)


def parse_signature(stdout: str) -> str:
    text = stdout.strip()
    if not text:
        return ''
    try:
        payload = json.loads(text)
        if isinstance(payload, dict):
            signature = str(payload.get('signature') or payload.get('txSignature') or payload.get('result') or '').strip()
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


def pool_id_from_url(url: str) -> str:
    text = url.strip().rstrip('/')
    if not text:
        return ''
    return text.split('/')[-1]


def rpc_request(method: str, params: list[Any]) -> dict[str, Any]:
    payload = json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': method, 'params': params}).encode('utf-8')
    request = urllib.request.Request(
        RPC_URL,
        data=payload,
        headers={
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'kamiyo-agent-creator-fee-inflow-route/1.0',
        },
        method='POST',
    )
    with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
        raw = response.read().decode('utf-8')
    decoded = json.loads(raw)
    if not isinstance(decoded, dict):
        raise ValueError('non-object rpc response')
    if decoded.get('error'):
        raise RuntimeError(str(decoded['error']))
    return decoded


def read_balance_sol(pubkey: str) -> float:
    try:
        response = rpc_request('getBalance', [pubkey, {'commitment': 'confirmed'}])
        result = response.get('result') if isinstance(response, dict) else {}
        value = result.get('value') if isinstance(result, dict) else None
        lamports = int(value or 0)
        return max(0.0, lamports / 1_000_000_000.0)
    except Exception:
        solana_bin = shutil.which('solana')
        if not solana_bin:
            raise
        cmd = [solana_bin, 'balance', pubkey]
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
            stderr = (proc.stderr or proc.stdout or f'solana_balance_exit_{proc.returncode}').strip()
            raise RuntimeError(stderr or 'solana_balance_failed')
        match = re.search(r'([0-9]+(?:\.[0-9]+)?)\s*SOL', proc.stdout or '', re.IGNORECASE)
        if match:
            return max(0.0, parse_float(match.group(1), 0.0))
        return max(0.0, parse_float(proc.stdout, 0.0))


def read_recent_signatures(pubkey: str, limit: int = 100) -> list[dict[str, Any]]:
    capped_limit = max(1, min(100, int(limit)))
    response = rpc_request('getSignaturesForAddress', [pubkey, {'limit': capped_limit, 'commitment': 'confirmed'}])
    result = response.get('result') if isinstance(response, dict) else None
    if isinstance(result, list):
        return [row for row in result if isinstance(row, dict)]
    return []


def read_block(slot: int) -> dict[str, Any]:
    response = rpc_request(
        'getBlock',
        [
            int(slot),
            {
                'encoding': 'json',
                'transactionDetails': 'full',
                'rewards': False,
                'maxSupportedTransactionVersion': 0,
            },
        ],
    )
    result = response.get('result') if isinstance(response, dict) else None
    return result if isinstance(result, dict) else {}


def latest_pool_route_snapshot(*, wallet_pubkey: str, pool_id: str) -> dict[str, Any]:
    wallet_signatures = read_recent_signatures(wallet_pubkey, limit=100)
    pool_signatures = read_recent_signatures(pool_id, limit=100)
    if not wallet_signatures or not pool_signatures:
        return {}

    pool_signature_set = {
        str(row.get('signature') or '').strip()
        for row in pool_signatures
        if not row.get('err') and SOLANA_SIGNATURE_RE.match(str(row.get('signature') or '').strip())
    }
    if not pool_signature_set:
        return {}

    target_signature_row = None
    for row in wallet_signatures:
        signature = str(row.get('signature') or '').strip()
        if not row.get('err') and signature in pool_signature_set:
            target_signature_row = row
            break
    if not target_signature_row:
        return {}

    signature = str(target_signature_row.get('signature') or '').strip()
    slot = int(target_signature_row.get('slot') or 0)
    if not signature or slot <= 0:
        return {}

    block = read_block(slot)
    transactions = block.get('transactions') if isinstance(block, dict) else None
    if not isinstance(transactions, list):
        return {}

    matched_transaction = None
    for transaction in transactions:
        tx_payload = transaction.get('transaction') if isinstance(transaction, dict) else None
        signatures = tx_payload.get('signatures') if isinstance(tx_payload, dict) else None
        tx_signature = str(signatures[0] if isinstance(signatures, list) and signatures else '').strip()
        if tx_signature == signature:
            matched_transaction = transaction
            break
    if not isinstance(matched_transaction, dict):
        return {}

    tx_payload = matched_transaction.get('transaction') if isinstance(matched_transaction, dict) else {}
    message = tx_payload.get('message') if isinstance(tx_payload, dict) else {}
    meta = matched_transaction.get('meta') if isinstance(matched_transaction, dict) else {}
    account_keys = list(message.get('accountKeys') or []) if isinstance(message, dict) else []
    loaded_addresses = meta.get('loadedAddresses') if isinstance(meta, dict) else {}
    if isinstance(loaded_addresses, dict):
        account_keys.extend(loaded_addresses.get('writable') or [])
        account_keys.extend(loaded_addresses.get('readonly') or [])
    if wallet_pubkey not in account_keys:
        return {}

    wallet_index = account_keys.index(wallet_pubkey)
    post_balances = meta.get('postBalances') if isinstance(meta, dict) else None
    if not isinstance(post_balances, list) or wallet_index >= len(post_balances):
        return {}

    lamports = int(post_balances[wallet_index] or 0)
    block_time = int(block.get('blockTime') or target_signature_row.get('blockTime') or 0)
    routed_at = datetime.fromtimestamp(block_time, tz=timezone.utc).isoformat() if block_time > 0 else ''
    return {
        'txSignature': signature,
        'slot': slot,
        'blockTime': block_time,
        'routedAt': routed_at,
        'postRouteBalanceSol': floor_precision(max(0.0, lamports / 1_000_000_000.0), 9),
    }


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


def route_authority_status() -> dict[str, Any]:
    if DRY_RUN:
        return {'ready': True, 'mode': 'dry_run', 'reason': '', 'signerPubkey': ''}
    if ROUTE_CMD:
        return {'ready': True, 'mode': 'custom_cmd', 'reason': '', 'signerPubkey': ''}
    if not KEYPAIR_PATH:
        return {'ready': False, 'mode': 'keypair', 'reason': 'missing_keypair_path', 'signerPubkey': ''}
    keypair = Path(KEYPAIR_PATH).expanduser()
    if not keypair.exists():
        return {'ready': False, 'mode': 'keypair', 'reason': 'keypair_not_found', 'signerPubkey': ''}
    signer_pubkey = keypair_pubkey(keypair)
    if not signer_pubkey:
        return {'ready': False, 'mode': 'keypair', 'reason': 'unable_to_resolve_signer_pubkey', 'signerPubkey': ''}
    if signer_pubkey != WATCH_WALLET:
        return {
            'ready': False,
            'mode': 'keypair',
            'reason': 'signer_pubkey_mismatch',
            'signerPubkey': signer_pubkey,
        }
    return {'ready': True, 'mode': 'keypair', 'reason': '', 'signerPubkey': signer_pubkey}


def run_custom_route_command(*, amount_sol: float, current_balance_sol: float, baseline_balance_sol: float, positive_delta_sol: float, pool_url: str, pool_id: str) -> dict[str, Any]:
    env = os.environ.copy()
    env.update(
        {
            'KYO_ROUTE_AMOUNT_SOL': format_sol(amount_sol),
            'KYO_ROUTE_SOURCE_WALLET': WATCH_WALLET,
            'KYO_ROUTE_OBSERVED_BALANCE_SOL': format_sol(current_balance_sol),
            'KYO_ROUTE_LAST_BASELINE_BALANCE_SOL': format_sol(baseline_balance_sol),
            'KYO_ROUTE_POSITIVE_DELTA_SOL': format_sol(positive_delta_sol),
            'KYO_ROUTE_TARGET_POOL_URL': pool_url,
            'KYO_ROUTE_TARGET_POOL_ID': pool_id,
        }
    )
    proc = subprocess.run(
        ['bash', '-lc', ROUTE_CMD],
        capture_output=True,
        text=True,
        timeout=CLI_TIMEOUT_SECONDS,
        env=env,
        check=False,
    )
    if proc.returncode != 0:
        stderr = (proc.stderr or proc.stdout or '').strip()
        raise RuntimeError(stderr or f'route_cmd_failed_exit_{proc.returncode}')
    lines = [line.strip() for line in (proc.stdout or '').splitlines() if line.strip()]
    if not lines:
        raise RuntimeError('route_cmd_empty_output')
    try:
        payload = json.loads(lines[-1])
    except Exception as exc:
        raise RuntimeError(f'route_cmd_invalid_json:{exc}') from exc
    if not isinstance(payload, dict):
        raise RuntimeError('route_cmd_non_object_json')
    tx_signature = str(payload.get('txSignature') or payload.get('signature') or '').strip()
    if not tx_signature:
        raise RuntimeError('route_cmd_missing_tx_signature')
    routed_sol = max(0.0, parse_float(payload.get('routedSol') if 'routedSol' in payload else payload.get('amountSol'), amount_sol))
    return {'txSignature': tx_signature, 'routedSol': routed_sol, 'method': 'custom_cmd'}


def run_staking_period_deposit(*, amount_sol: float) -> dict[str, Any]:
    return run_fundry_staking_deposit(
        amount_sol=amount_sol,
        pool_url=STAKING_POOL_URL,
        keypair_path=KEYPAIR_PATH,
        rpc_url=RPC_URL,
        dry_run=DRY_RUN,
        timeout_seconds=CLI_TIMEOUT_SECONDS,
        admin_keypair_path=ADMIN_KEYPAIR_PATH or KEYPAIR_PATH,
    )


def write_state(*, baseline_balance_sol: float, current_balance_sol: float, last_status: dict[str, Any], last_routed_at: str = '', last_tx_signature: str = '') -> None:
    payload = {
        'lastRunAt': now_iso(),
        'baselineBalanceSol': round(baseline_balance_sol, 9),
        'lastObservedBalanceSol': round(current_balance_sol, 9),
        'pendingPositiveDeltaSol': round(max(0.0, current_balance_sol - baseline_balance_sol), 9),
        'lastStatus': last_status,
    }
    if last_routed_at:
        payload['lastRoutedAt'] = last_routed_at
    if last_tx_signature:
        payload['lastTxSignature'] = last_tx_signature
    write_json(STATE_PATH, payload)


def write_status_only(last_status: dict[str, Any]) -> None:
    state = read_json(STATE_PATH, {})
    if not isinstance(state, dict):
        state = {}
    state['lastRunAt'] = now_iso()
    state['lastStatus'] = last_status
    write_json(STATE_PATH, state)


def run() -> int:
    ensure_dirs()
    started_at = now_iso()
    pool_id = pool_id_from_url(STAKING_POOL_URL)

    if not ENABLE_ROUTE:
        summary = {
            'ok': True,
            'status': 'disabled',
            'startedAt': started_at,
            'sourceWallet': WATCH_WALLET,
            'stakingPoolUrl': STAKING_POOL_URL,
            'receiptsPath': str(RECEIPTS_PATH),
        }
        write_status_only(summary)
        write_json(OUTPUT_PATH, summary)
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    if not WATCH_WALLET:
        summary = {
            'ok': False,
            'status': 'blocked',
            'reason': 'missing_watch_wallet',
            'startedAt': started_at,
            'stakingPoolUrl': STAKING_POOL_URL,
        }
        write_status_only(summary)
        write_json(OUTPUT_PATH, summary)
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    try:
        current_balance_sol = read_balance_sol(WATCH_WALLET)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, RuntimeError) as exc:
        summary = {
            'ok': False,
            'status': 'failed',
            'reason': 'balance_read_failed',
            'error': str(exc)[:500],
            'startedAt': started_at,
            'sourceWallet': WATCH_WALLET,
            'stakingPoolUrl': STAKING_POOL_URL,
        }
        write_status_only(summary)
        write_json(OUTPUT_PATH, summary)
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    previous_state = read_json(STATE_PATH, {})
    baseline_value = parse_float(previous_state.get('baselineBalanceSol'), float('nan')) if isinstance(previous_state, dict) else float('nan')
    last_routed_at = str(previous_state.get('lastRoutedAt') or '').strip() if isinstance(previous_state, dict) else ''
    last_tx_signature = str(previous_state.get('lastTxSignature') or '').strip() if isinstance(previous_state, dict) else ''
    reconciled_route = {}
    reconciled_from_chain = False
    if WATCH_WALLET and pool_id:
        try:
            reconciled_route = latest_pool_route_snapshot(wallet_pubkey=WATCH_WALLET, pool_id=pool_id)
        except Exception:
            reconciled_route = {}

    reconciled_post_route_balance_sol = max(0.0, parse_float(reconciled_route.get('postRouteBalanceSol'), 0.0))
    reconciled_tx_signature = str(reconciled_route.get('txSignature') or '').strip()
    reconciled_routed_at = str(reconciled_route.get('routedAt') or '').strip()
    if baseline_value != baseline_value and reconciled_tx_signature and reconciled_post_route_balance_sol <= current_balance_sol + BALANCE_EPSILON_SOL:
        baseline_value = reconciled_post_route_balance_sol
        last_routed_at = reconciled_routed_at or last_routed_at
        last_tx_signature = reconciled_tx_signature or last_tx_signature
        reconciled_from_chain = True

    if baseline_value != baseline_value:
        summary = {
            'ok': True,
            'status': 'initialized',
            'startedAt': started_at,
            'at': now_iso(),
            'sourceWallet': WATCH_WALLET,
            'observedBalanceSol': round(current_balance_sol, 9),
            'baselineBalanceSol': round(current_balance_sol, 9),
            'positiveDeltaSol': 0.0,
            'routeBps': ROUTE_BPS,
            'routeExecuted': False,
            'stakingPoolUrl': STAKING_POOL_URL,
            'stakingPoolId': pool_id,
            'receiptsPath': str(RECEIPTS_PATH),
        }
        write_state(
            baseline_balance_sol=current_balance_sol,
            current_balance_sol=current_balance_sol,
            last_status=summary,
            last_routed_at=last_routed_at,
            last_tx_signature=last_tx_signature,
        )
        write_json(OUTPUT_PATH, summary)
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    baseline_balance_sol = max(0.0, baseline_value)
    if (
        reconciled_tx_signature
        and reconciled_tx_signature != last_tx_signature
        and reconciled_post_route_balance_sol > baseline_balance_sol + BALANCE_EPSILON_SOL
        and reconciled_post_route_balance_sol <= current_balance_sol + BALANCE_EPSILON_SOL
    ):
        baseline_balance_sol = reconciled_post_route_balance_sol
        last_routed_at = reconciled_routed_at or last_routed_at
        last_tx_signature = reconciled_tx_signature
        reconciled_from_chain = True

    reconciliation_fields = {}
    if reconciled_from_chain:
        reconciliation_fields = {
            'baselineReconciledFromChain': True,
            'reconciledTxSignature': last_tx_signature,
            'reconciledRoutedAt': last_routed_at,
            'reconciledBaselineBalanceSol': round(baseline_balance_sol, 9),
        }

    if current_balance_sol + BALANCE_EPSILON_SOL < baseline_balance_sol:
        summary = {
            'ok': True,
            'status': 'rebased_down',
            'startedAt': started_at,
            'at': now_iso(),
            'sourceWallet': WATCH_WALLET,
            'previousBaselineBalanceSol': round(baseline_balance_sol, 9),
            'baselineBalanceSol': round(current_balance_sol, 9),
            'observedBalanceSol': round(current_balance_sol, 9),
            'positiveDeltaSol': 0.0,
            'routeBps': ROUTE_BPS,
            'routeExecuted': False,
            'stakingPoolUrl': STAKING_POOL_URL,
            'stakingPoolId': pool_id,
            'reason': 'balance_below_baseline',
            'receiptsPath': str(RECEIPTS_PATH),
        }
        summary.update(reconciliation_fields)
        write_state(
            baseline_balance_sol=current_balance_sol,
            current_balance_sol=current_balance_sol,
            last_status=summary,
            last_routed_at=last_routed_at,
            last_tx_signature=last_tx_signature,
        )
        write_json(OUTPUT_PATH, summary)
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    positive_delta_sol = floor_precision(Decimal(str(current_balance_sol)) - Decimal(str(baseline_balance_sol)), 9)
    route_sol = floor_precision(positive_delta_sol * (ROUTE_BPS / 10000.0), 9)

    if positive_delta_sol <= 0:
        summary = {
            'ok': True,
            'status': 'up_to_date',
            'startedAt': started_at,
            'at': now_iso(),
            'sourceWallet': WATCH_WALLET,
            'observedBalanceSol': round(current_balance_sol, 9),
            'baselineBalanceSol': round(baseline_balance_sol, 9),
            'positiveDeltaSol': 0.0,
            'routeSol': 0.0,
            'routeBps': ROUTE_BPS,
            'routeExecuted': False,
            'stakingPoolUrl': STAKING_POOL_URL,
            'stakingPoolId': pool_id,
            'receiptsPath': str(RECEIPTS_PATH),
        }
        summary.update(reconciliation_fields)
        write_state(
            baseline_balance_sol=baseline_balance_sol,
            current_balance_sol=current_balance_sol,
            last_status=summary,
            last_routed_at=last_routed_at,
            last_tx_signature=last_tx_signature,
        )
        write_json(OUTPUT_PATH, summary)
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    if route_sol < MIN_TRANSFER_SOL:
        summary = {
            'ok': True,
            'status': 'pending',
            'startedAt': started_at,
            'at': now_iso(),
            'sourceWallet': WATCH_WALLET,
            'observedBalanceSol': round(current_balance_sol, 9),
            'baselineBalanceSol': round(baseline_balance_sol, 9),
            'positiveDeltaSol': round(positive_delta_sol, 9),
            'routeSol': round(route_sol, 9),
            'routeBps': ROUTE_BPS,
            'routeExecuted': False,
            'reason': 'below_min_transfer',
            'minimumTransferSol': MIN_TRANSFER_SOL,
            'stakingPoolUrl': STAKING_POOL_URL,
            'stakingPoolId': pool_id,
            'receiptsPath': str(RECEIPTS_PATH),
        }
        summary.update(reconciliation_fields)
        write_state(
            baseline_balance_sol=baseline_balance_sol,
            current_balance_sol=current_balance_sol,
            last_status=summary,
            last_routed_at=last_routed_at,
            last_tx_signature=last_tx_signature,
        )
        write_json(OUTPUT_PATH, summary)
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    authority = route_authority_status()
    if not authority.get('ready'):
        summary = {
            'ok': False,
            'status': 'blocked',
            'startedAt': started_at,
            'at': now_iso(),
            'sourceWallet': WATCH_WALLET,
            'observedBalanceSol': round(current_balance_sol, 9),
            'baselineBalanceSol': round(baseline_balance_sol, 9),
            'positiveDeltaSol': round(positive_delta_sol, 9),
            'routeSol': round(route_sol, 9),
            'routeBps': ROUTE_BPS,
            'routeExecuted': False,
            'reason': str(authority.get('reason') or 'missing_route_authority'),
            'routeAuthorityMode': str(authority.get('mode') or ''),
            'routeAuthorityReady': False,
            'signerPubkey': str(authority.get('signerPubkey') or ''),
            'stakingPoolUrl': STAKING_POOL_URL,
            'stakingPoolId': pool_id,
            'receiptsPath': str(RECEIPTS_PATH),
        }
        summary.update(reconciliation_fields)
        write_state(
            baseline_balance_sol=baseline_balance_sol,
            current_balance_sol=current_balance_sol,
            last_status=summary,
            last_routed_at=last_routed_at,
            last_tx_signature=last_tx_signature,
        )
        write_json(OUTPUT_PATH, summary)
        append_json_line(
            LOG_PATH,
            {
                'at': now_iso(),
                'event': 'creator_fee_inflow_route',
                'ok': False,
                'status': 'blocked',
                'reason': summary['reason'],
                'positiveDeltaSol': summary['positiveDeltaSol'],
                'routeSol': summary['routeSol'],
            },
        )
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    try:
        if ROUTE_CMD:
            route_result = run_custom_route_command(
                amount_sol=route_sol,
                current_balance_sol=current_balance_sol,
                baseline_balance_sol=baseline_balance_sol,
                positive_delta_sol=positive_delta_sol,
                pool_url=STAKING_POOL_URL,
                pool_id=pool_id,
            )
        else:
            route_result = run_staking_period_deposit(amount_sol=route_sol)
    except Exception as exc:
        summary = {
            'ok': False,
            'status': 'failed',
            'startedAt': started_at,
            'at': now_iso(),
            'sourceWallet': WATCH_WALLET,
            'observedBalanceSol': round(current_balance_sol, 9),
            'baselineBalanceSol': round(baseline_balance_sol, 9),
            'positiveDeltaSol': round(positive_delta_sol, 9),
            'routeSol': round(route_sol, 9),
            'routeBps': ROUTE_BPS,
            'routeExecuted': False,
            'reason': 'route_execution_failed',
            'error': str(exc)[:500],
            'routeAuthorityMode': str(authority.get('mode') or ''),
            'routeAuthorityReady': True,
            'stakingPoolUrl': STAKING_POOL_URL,
            'stakingPoolId': pool_id,
            'receiptsPath': str(RECEIPTS_PATH),
        }
        summary.update(reconciliation_fields)
        write_state(
            baseline_balance_sol=baseline_balance_sol,
            current_balance_sol=current_balance_sol,
            last_status=summary,
            last_routed_at=last_routed_at,
            last_tx_signature=last_tx_signature,
        )
        write_json(OUTPUT_PATH, summary)
        append_json_line(
            LOG_PATH,
            {
                'at': now_iso(),
                'event': 'creator_fee_inflow_route',
                'ok': False,
                'status': 'failed',
                'reason': summary['reason'],
                'error': summary['error'],
                'positiveDeltaSol': summary['positiveDeltaSol'],
                'routeSol': summary['routeSol'],
            },
        )
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    routed_sol = max(0.0, parse_float(route_result.get('routedSol'), route_sol))
    tx_signature = str(route_result.get('txSignature') or '').strip()
    routed_at = now_iso()
    try:
        observed_after_sol = read_balance_sol(WATCH_WALLET)
    except Exception:
        observed_after_sol = max(0.0, current_balance_sol - routed_sol)
    # Advance the baseline only by the amount that actually routed so any
    # leftover inflow remains pending for the next run.
    new_baseline_balance_sol = baseline_after_route(
        baseline_balance_sol=baseline_balance_sol,
        observed_after_sol=observed_after_sol,
        routed_sol=routed_sol,
    )

    receipt = {
        'source': 'creator_fee_inflow',
        'channel': 'creator_fee_inflow',
        'sourceWallet': WATCH_WALLET,
        'stakingPoolUrl': STAKING_POOL_URL,
        'stakingPoolId': pool_id,
        'routeBps': ROUTE_BPS,
        'baselineBalanceSol': round(baseline_balance_sol, 9),
        'observedBalanceBeforeSol': round(current_balance_sol, 9),
        'observedBalanceAfterSol': round(observed_after_sol, 9),
        'positiveDeltaSol': round(positive_delta_sol, 9),
        'routedSol': round(routed_sol, 9),
        'txSignature': tx_signature,
        'routeMethod': str(route_result.get('method') or '').strip(),
        'stakingPeriod': str(route_result.get('stakingPeriod') or '').strip(),
        'periodVault': str(route_result.get('periodVault') or '').strip(),
        'periodNumber': str(route_result.get('periodNumber') or '').strip(),
        'at': routed_at,
    }
    append_json_line(RECEIPTS_PATH, receipt)

    summary = {
        'ok': True,
        'status': 'routed',
        'startedAt': started_at,
        'at': routed_at,
        'sourceWallet': WATCH_WALLET,
        'observedBalanceSol': round(current_balance_sol, 9),
        'baselineBalanceSol': round(baseline_balance_sol, 9),
        'postRouteBalanceSol': round(observed_after_sol, 9),
        'positiveDeltaSol': round(positive_delta_sol, 9),
        'routeSol': round(routed_sol, 9),
        'routeBps': ROUTE_BPS,
        'routeExecuted': True,
        'txSignature': tx_signature,
        'routeMethod': str(route_result.get('method') or '').strip(),
        'stakingPeriod': str(route_result.get('stakingPeriod') or '').strip(),
        'periodVault': str(route_result.get('periodVault') or '').strip(),
        'periodNumber': str(route_result.get('periodNumber') or '').strip(),
        'routeAuthorityMode': str(authority.get('mode') or ''),
        'routeAuthorityReady': True,
        'stakingPoolUrl': STAKING_POOL_URL,
        'stakingPoolId': pool_id,
        'receiptsPath': str(RECEIPTS_PATH),
    }
    summary.update(reconciliation_fields)
    write_state(
        baseline_balance_sol=new_baseline_balance_sol,
        current_balance_sol=observed_after_sol,
        last_status=summary,
        last_routed_at=routed_at,
        last_tx_signature=tx_signature,
    )
    write_json(OUTPUT_PATH, summary)
    append_json_line(
        LOG_PATH,
        {
            'at': routed_at,
            'event': 'creator_fee_inflow_route',
            'ok': True,
            'status': 'routed',
            'positiveDeltaSol': round(positive_delta_sol, 9),
            'routedSol': round(routed_sol, 9),
            'txSignature': tx_signature,
            'method': summary['routeMethod'],
        },
    )
    print(json.dumps(summary, ensure_ascii=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(run())
