#!/usr/bin/env python3
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
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

STATE_PATH = STATE_DIR / 'clawmart-staking-route-state.json'
OUTPUT_PATH = STATE_DIR / 'clawmart-staking-route.json'
LOG_PATH = LOG_DIR / 'clawmart-staking-route.jsonl'

DEFAULT_KAMIYO_STAKING_POOL_URL = 'https://fundry.collaterize.com/staking/9mEd5iRcdbNUwaCmkPqYggLfg25B2DsTn1w6gNrgvC9d'
KAMIYO_STAKING_POOL_URL = os.getenv('KYO_KAMIYO_STAKING_POOL_URL', DEFAULT_KAMIYO_STAKING_POOL_URL).strip() or DEFAULT_KAMIYO_STAKING_POOL_URL
RECEIPTS_PATH = Path(
    os.getenv('KYO_CLAWMART_STAKING_RECEIPTS_PATH', str(RECEIPTS_DIR / 'clawmart-staking-route.jsonl')).strip()
).expanduser()

API_BASE_URL = os.getenv('CLAWMART_API_BASE_URL', 'https://www.shopclawmart.com/api/v1').strip().rstrip('/')
API_KEY = os.getenv('CLAWMART_API_KEY', '').strip()
ROUTE_CMD = os.getenv('KYO_CLAWMART_STAKING_ROUTE_CMD', '').strip()
DRY_RUN = os.getenv('KYO_CLAWMART_STAKING_DRY_RUN', '').strip().lower() in {'1', 'true', 'yes', 'on'}
ENABLE_STAKING_ROUTE = os.getenv('KYO_ENABLE_CLAWMART_STAKING_ROUTE', 'true').strip().lower() in {'1', 'true', 'yes', 'on'}
SOLANA_KEYPAIR_PATH = os.getenv('KYO_CLAWMART_STAKING_KEYPAIR_PATH', '').strip()
STAKING_ADMIN_KEYPAIR_PATH = os.getenv('KYO_CLAWMART_STAKING_ADMIN_KEYPAIR_PATH', '').strip()
SOLANA_RPC_URL = os.getenv('KYO_CLAWMART_STAKING_RPC_URL', '').strip()


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


SOL_PER_SALE = max(0.0, env_float('KYO_CLAWMART_STAKING_SOL_PER_SALE', 0.0))
MIN_TRANSFER_SOL = max(0.0, env_float('KYO_CLAWMART_STAKING_MIN_TRANSFER_SOL', 0.000001))
HTTP_TIMEOUT_SECONDS = max(3, min(60, env_int('KYO_CLAWMART_MONITOR_TIMEOUT_SECONDS', 12)))
CLI_TIMEOUT_SECONDS = max(15, min(180, env_int('KYO_CLAWMART_STAKING_CLI_TIMEOUT_SECONDS', 90)))


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_dirs() -> None:
    for path in (WORKSPACE, RUNTIME_DIR, STATE_DIR, RECEIPTS_DIR, LOG_DIR):
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


def to_non_negative_int(value: Any, fallback: int = 0) -> int:
    try:
        parsed = int(value)
        return parsed if parsed >= 0 else fallback
    except Exception:
        return fallback


def to_non_negative_float(value: Any, fallback: float = 0.0) -> float:
    try:
        parsed = float(value)
        return parsed if parsed >= 0 else fallback
    except Exception:
        return fallback


def fetch_json(path: str) -> dict[str, Any]:
    url = f'{API_BASE_URL}{path}'
    request = urllib.request.Request(
        url=url,
        headers={
            'Authorization': f'Bearer {API_KEY}',
            'Accept': 'application/json',
            'User-Agent': 'kyoshin-clawmart-staking-route/1.0',
        },
        method='GET',
    )
    with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
        payload = response.read().decode('utf-8')
    decoded = json.loads(payload)
    if not isinstance(decoded, dict):
        raise ValueError(f'non-object JSON from {path}')
    return decoded


def extract_total_sales(payload: dict[str, Any]) -> int:
    data = payload.get('data')
    if isinstance(data, dict) and 'totalSales' in data:
        return to_non_negative_int(data.get('totalSales'))
    return to_non_negative_int(payload.get('totalSales'))


def extract_routed_total_sales(receipt: dict[str, Any]) -> int:
    for key in ('clawMartTotalSalesRouted', 'totalSalesRouted', 'clawMartTotalSales', 'totalSales'):
        if key in receipt:
            return to_non_negative_int(receipt.get(key))
    return 0


def parse_pool_id(pool_url: str) -> str:
    value = pool_url.strip().rstrip('/')
    if not value:
        return ''
    return value.split('/')[-1]


def staking_checkpoint(receipts_path: Path, required_pool_url: str) -> tuple[int, int]:
    if not receipts_path.exists():
        return 0, 0
    try:
        rows = receipts_path.read_text(encoding='utf-8').splitlines()
    except Exception:
        return 0, 0

    routed_total_sales = 0
    matched_receipts = 0
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
        routed_value = extract_routed_total_sales(receipt)
        if routed_value <= 0:
            continue
        matched_receipts += 1
        routed_total_sales = max(routed_total_sales, routed_value)
    return routed_total_sales, matched_receipts


def format_sol_amount(value: float) -> str:
    formatted = f'{value:.9f}'.rstrip('0').rstrip('.')
    return formatted if formatted else '0'


def parse_signature(stdout: str) -> str:
    text = stdout.strip()
    if not text:
        return ''
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return ''
    candidate = lines[-1]
    try:
        parsed = json.loads(candidate)
        if isinstance(parsed, dict):
            signature = str(parsed.get('signature') or parsed.get('txSignature') or '').strip()
            if signature:
                return signature
    except Exception:
        pass
    match = re.search(r'Signature:\s*([A-Za-z0-9]+)', text)
    if match:
        return match.group(1)
    return ''


def run_custom_route_command(
    *,
    amount_sol: float,
    total_sales: int,
    delta_sales: int,
    previous_routed_total_sales: int,
    pool_url: str,
    pool_id: str,
) -> dict[str, Any]:
    env = os.environ.copy()
    env.update(
        {
            'KYO_ROUTE_AMOUNT_SOL': format_sol_amount(amount_sol),
            'KYO_ROUTE_TOTAL_SALES': str(total_sales),
            'KYO_ROUTE_DELTA_SALES': str(delta_sales),
            'KYO_ROUTE_LAST_ROUTED_TOTAL_SALES': str(previous_routed_total_sales),
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
        stderr = (proc.stderr or '').strip()
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
    routed_sol = to_non_negative_float(payload.get('routedSol') if 'routedSol' in payload else payload.get('amountSol'), amount_sol)
    return {
        'txSignature': tx_signature,
        'routedSol': routed_sol,
        'method': 'custom_cmd',
    }


def run_staking_period_deposit(*, amount_sol: float) -> dict[str, Any]:
    return run_fundry_staking_deposit(
        amount_sol=amount_sol,
        pool_url=KAMIYO_STAKING_POOL_URL,
        keypair_path=SOLANA_KEYPAIR_PATH,
        rpc_url=SOLANA_RPC_URL,
        dry_run=DRY_RUN,
        timeout_seconds=CLI_TIMEOUT_SECONDS,
        admin_keypair_path=STAKING_ADMIN_KEYPAIR_PATH,
    )


def run() -> int:
    ensure_dirs()
    started_at = now_iso()

    if not ENABLE_STAKING_ROUTE:
        summary = {
            'ok': True,
            'status': 'disabled',
            'startedAt': started_at,
            'stakingPoolUrl': KAMIYO_STAKING_POOL_URL,
            'receiptsPath': str(RECEIPTS_PATH),
        }
        write_json(STATE_PATH, {'lastRunAt': now_iso(), 'lastStatus': summary})
        write_json(OUTPUT_PATH, summary)
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    if not API_KEY:
        summary = {
            'ok': False,
            'status': 'blocked',
            'reason': 'missing_api_key',
            'startedAt': started_at,
        }
        write_json(STATE_PATH, {'lastRunAt': now_iso(), 'lastStatus': summary})
        write_json(OUTPUT_PATH, summary)
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    try:
        me_payload = fetch_json('/me')
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
        summary = {
            'ok': False,
            'status': 'failed',
            'reason': 'api_error',
            'error': str(exc)[:500],
            'startedAt': started_at,
        }
        write_json(STATE_PATH, {'lastRunAt': now_iso(), 'lastStatus': summary})
        write_json(OUTPUT_PATH, summary)
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    total_sales = extract_total_sales(me_payload)
    last_routed_total_sales, prior_receipt_count = staking_checkpoint(RECEIPTS_PATH, KAMIYO_STAKING_POOL_URL)
    delta_sales = max(0, total_sales - last_routed_total_sales)
    pool_id = parse_pool_id(KAMIYO_STAKING_POOL_URL)

    if delta_sales == 0:
        summary = {
            'ok': True,
            'status': 'up_to_date',
            'startedAt': started_at,
            'at': now_iso(),
            'totalSales': total_sales,
            'lastRoutedTotalSales': last_routed_total_sales,
            'deltaSales': 0,
            'receiptsPath': str(RECEIPTS_PATH),
            'stakingPoolUrl': KAMIYO_STAKING_POOL_URL,
            'stakingPoolId': pool_id,
            'receiptCount': prior_receipt_count,
            'routeExecuted': False,
        }
        write_json(STATE_PATH, {'lastRunAt': now_iso(), 'lastStatus': summary})
        write_json(OUTPUT_PATH, summary)
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    amount_sol = round(delta_sales * SOL_PER_SALE, 9)
    if SOL_PER_SALE <= 0 or amount_sol <= 0 or amount_sol < MIN_TRANSFER_SOL:
        summary = {
            'ok': False,
            'status': 'blocked',
            'reason': 'missing_sol_per_sale',
            'startedAt': started_at,
            'at': now_iso(),
            'totalSales': total_sales,
            'lastRoutedTotalSales': last_routed_total_sales,
            'deltaSales': delta_sales,
            'requiredMinTransferSol': MIN_TRANSFER_SOL,
            'solPerSale': SOL_PER_SALE,
            'computedTransferSol': amount_sol,
            'stakingPoolUrl': KAMIYO_STAKING_POOL_URL,
            'stakingPoolId': pool_id,
        }
        write_json(STATE_PATH, {'lastRunAt': now_iso(), 'lastStatus': summary})
        write_json(OUTPUT_PATH, summary)
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    try:
        if ROUTE_CMD:
            route_result = run_custom_route_command(
                amount_sol=amount_sol,
                total_sales=total_sales,
                delta_sales=delta_sales,
                previous_routed_total_sales=last_routed_total_sales,
                pool_url=KAMIYO_STAKING_POOL_URL,
                pool_id=pool_id,
            )
        else:
            route_result = run_staking_period_deposit(amount_sol=amount_sol)
    except Exception as exc:
        summary = {
            'ok': False,
            'status': 'failed',
            'reason': 'route_execution_failed',
            'error': str(exc)[:500],
            'startedAt': started_at,
            'at': now_iso(),
            'totalSales': total_sales,
            'lastRoutedTotalSales': last_routed_total_sales,
            'deltaSales': delta_sales,
            'computedTransferSol': amount_sol,
            'stakingPoolUrl': KAMIYO_STAKING_POOL_URL,
            'stakingPoolId': pool_id,
        }
        write_json(STATE_PATH, {'lastRunAt': now_iso(), 'lastStatus': summary})
        write_json(OUTPUT_PATH, summary)
        append_json_line(
            LOG_PATH,
            {
                'at': now_iso(),
                'event': 'clawmart_staking_route',
                'ok': False,
                'error': summary['error'],
                'reason': summary['reason'],
            },
        )
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    routed_sol = to_non_negative_float(route_result.get('routedSol'), amount_sol)
    tx_signature = str(route_result.get('txSignature') or '').strip()
    routed_at = now_iso()

    receipt = {
        'source': 'clawmart',
        'channel': 'clawmart',
        'stakingPoolUrl': KAMIYO_STAKING_POOL_URL,
        'stakingPoolId': pool_id,
        'clawMartTotalSales': total_sales,
        'clawMartTotalSalesRouted': total_sales,
        'deltaSalesRouted': delta_sales,
        'routedSol': routed_sol,
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
        'totalSales': total_sales,
        'lastRoutedTotalSales': total_sales,
        'deltaSales': delta_sales,
        'routedSol': routed_sol,
        'txSignature': tx_signature,
        'routeMethod': str(route_result.get('method') or '').strip(),
        'stakingPeriod': str(route_result.get('stakingPeriod') or '').strip(),
        'periodVault': str(route_result.get('periodVault') or '').strip(),
        'periodNumber': str(route_result.get('periodNumber') or '').strip(),
        'stakingPoolUrl': KAMIYO_STAKING_POOL_URL,
        'stakingPoolId': pool_id,
        'receiptsPath': str(RECEIPTS_PATH),
        'routeExecuted': True,
    }
    write_json(STATE_PATH, {'lastRunAt': now_iso(), 'lastStatus': summary})
    write_json(OUTPUT_PATH, summary)
    append_json_line(
        LOG_PATH,
        {
            'at': now_iso(),
            'event': 'clawmart_staking_route',
            'ok': True,
            'totalSales': total_sales,
            'deltaSales': delta_sales,
            'routedSol': routed_sol,
            'txSignature': tx_signature,
            'method': summary['routeMethod'],
        },
    )
    print(json.dumps(summary, ensure_ascii=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(run())
