#!/usr/bin/env python3
import json
import os
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

HOME_DIR = Path(os.environ.get('HOME', '~')).expanduser()
WORKSPACE = HOME_DIR / '.openclaw' / 'workspace'
RUNTIME_DIR = WORKSPACE / 'runtime'
STATE_DIR = RUNTIME_DIR / 'state'
RECEIPTS_DIR = RUNTIME_DIR / 'receipts'
LOG_DIR = RUNTIME_DIR / 'logs'

STATE_PATH = STATE_DIR / 'trading-route-state.json'
OUTPUT_PATH = STATE_DIR / 'trading-route.json'
LOG_PATH = LOG_DIR / 'trading-route.jsonl'
RECEIPTS_PATH = Path(
    os.getenv('KYO_TRADING_STAKING_RECEIPTS_PATH', str(RECEIPTS_DIR / 'trading-staking-route.jsonl')).strip()
).expanduser()
LEDGER_PATH = Path(
    os.getenv('KYO_REVENUE_LEDGER_PATH', str(RECEIPTS_DIR / 'revenue-ledger.jsonl')).strip()
).expanduser()

ENABLE_TRADING_AGENT = os.getenv('KYO_ENABLE_TRADING_AGENT', 'false').strip().lower() in {'1', 'true', 'yes', 'on'}
DEFAULT_POOL_URL = 'https://fundry.collaterize.com/staking/9mEd5iRcdbNUwaCmkPqYggLfg25B2DsTn1w6gNrgvC9d'
STAKING_POOL_URL = os.getenv('KYO_TRADING_STAKING_POOL_URL', DEFAULT_POOL_URL).strip() or DEFAULT_POOL_URL
ROUTE_BPS = max(1, min(10000, int(float(os.getenv('KYO_TRADING_ROUTE_NET_BPS', '5000')))))
ROUTE_MIN_SOL = max(0.0, float(os.getenv('KYO_TRADING_ROUTE_MIN_SOL', '0.000001')))
SOL_PRICE_USD = max(
    0.000001,
    float(
        os.getenv(
            'KYO_TRADING_SOL_PRICE_USD',
            os.getenv('KYO_RECEIPT_SOL_PRICE_USD', '150'),
        )
    ),
)
ROUTE_CMD = os.getenv('KYO_TRADING_STAKING_ROUTE_CMD', '').strip()
DRY_RUN = os.getenv('KYO_TRADING_STAKING_DRY_RUN', 'false').strip().lower() in {'1', 'true', 'yes', 'on'}
KEYPAIR_PATH = os.getenv('KYO_TRADING_STAKING_KEYPAIR_PATH', '').strip()
RPC_URL = os.getenv('KYO_TRADING_STAKING_RPC_URL', '').strip()
CLI_TIMEOUT_SECONDS = max(15, min(180, int(os.getenv('KYO_TRADING_ROUTE_CLI_TIMEOUT_SECONDS', '90'))))



def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()



def ensure_dirs() -> None:
    for path in (WORKSPACE, RUNTIME_DIR, STATE_DIR, RECEIPTS_DIR, LOG_DIR):
        path.mkdir(parents=True, exist_ok=True)
        path.chmod(0o700)
    RECEIPTS_PATH.parent.mkdir(parents=True, exist_ok=True)
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



def pool_id_from_url(url: str) -> str:
    text = url.strip().rstrip('/')
    if not text:
        return ''
    return text.split('/')[-1]



def format_sol(value: float) -> str:
    text = f'{value:.9f}'.rstrip('0').rstrip('.')
    return text if text else '0'



def parse_signature(stdout: str) -> str:
    text = stdout.strip()
    if not text:
        return ''
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



def run_route_cmd(*, amount_sol: float, delta_profit_usd: float, route_usd: float, checkpoint_id: str) -> dict[str, Any]:
    env = os.environ.copy()
    env.update(
        {
            'KYO_ROUTE_AMOUNT_SOL': format_sol(amount_sol),
            'KYO_ROUTE_DELTA_PROFIT_USD': f'{delta_profit_usd:.8f}',
            'KYO_ROUTE_AMOUNT_USD': f'{route_usd:.8f}',
            'KYO_ROUTE_CHECKPOINT_ID': checkpoint_id,
            'KYO_ROUTE_STAKING_POOL_URL': STAKING_POOL_URL,
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
        raise RuntimeError((proc.stderr or proc.stdout or f'route_cmd_exit_{proc.returncode}').strip()[:400])

    payload = None
    for line in reversed((proc.stdout or '').splitlines()):
        line = line.strip()
        if not line:
            continue
        try:
            decoded = json.loads(line)
        except Exception:
            continue
        if isinstance(decoded, dict):
            payload = decoded
            break
    if payload is None:
        raise RuntimeError('route_cmd_invalid_json')

    tx_signature = str(payload.get('txSignature') or payload.get('signature') or '').strip()
    if not tx_signature:
        raise RuntimeError('route_cmd_missing_tx_signature')

    return {
        'method': 'custom_cmd',
        'txSignature': tx_signature,
        'routedSol': max(0.0, parse_float(payload.get('routedSol') or payload.get('amountSol'), amount_sol)),
    }



def run_solana_transfer(*, amount_sol: float, pool_id: str) -> dict[str, Any]:
    if DRY_RUN:
        return {
            'method': 'dry_run',
            'txSignature': f'dry-run-{int(datetime.now(timezone.utc).timestamp())}',
            'routedSol': amount_sol,
        }

    solana_bin = shutil.which('solana')
    if not solana_bin:
        raise RuntimeError('missing_solana_cli')
    if not KEYPAIR_PATH:
        raise RuntimeError('missing_trading_staking_keypair_path')

    keypair = Path(KEYPAIR_PATH).expanduser()
    if not keypair.exists():
        raise RuntimeError('trading_staking_keypair_not_found')

    cmd = [
        solana_bin,
        'transfer',
        pool_id,
        format_sol(amount_sol),
        '--keypair',
        str(keypair),
        '--allow-unfunded-recipient',
        '--output',
        'json',
    ]
    if RPC_URL:
        cmd.extend(['--url', RPC_URL])

    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=CLI_TIMEOUT_SECONDS, check=False)
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout or f'solana_transfer_exit_{proc.returncode}').strip()[:400])

    signature = parse_signature(proc.stdout or '')
    if not signature:
        raise RuntimeError('missing_tx_signature')

    return {
        'method': 'solana_transfer',
        'txSignature': signature,
        'routedSol': amount_sol,
    }



def trading_profit_snapshot(rows: list[dict[str, Any]]) -> tuple[float, str, int]:
    total_net = 0.0
    latest_trade_id = ''
    latest_ts = datetime.fromtimestamp(0, tz=timezone.utc)
    closes = 0

    for row in rows:
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

        total_net += parse_float(row.get('netUsd'), 0.0)
        closes += 1
        ts = parse_ts(row.get('at') or row.get('timestamp') or row.get('executedAt'))
        if ts is not None and ts >= latest_ts:
            latest_ts = ts
            latest_trade_id = str(row.get('id') or '').strip() or latest_trade_id

    profit_basis = max(0.0, total_net)
    return round(profit_basis, 8), latest_trade_id, closes



def run() -> int:
    ensure_dirs()
    started_at = now_iso()

    if not ENABLE_TRADING_AGENT:
        summary = {
            'ok': True,
            'status': 'disabled',
            'at': now_iso(),
            'startedAt': started_at,
        }
        write_json(STATE_PATH, {'lastRunAt': summary['at'], 'lastStatus': summary})
        write_json(OUTPUT_PATH, summary)
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    ledger_rows = jsonl_rows(LEDGER_PATH)
    total_profit_basis_usd, checkpoint_id, close_count = trading_profit_snapshot(ledger_rows)

    state = read_json(STATE_PATH, {})
    if not isinstance(state, dict):
        state = {}
    processed_profit_usd = max(0.0, parse_float(state.get('processedProfitUsd'), 0.0))

    delta_profit_usd = round(total_profit_basis_usd - processed_profit_usd, 8)
    if delta_profit_usd <= 0:
        summary = {
            'ok': True,
            'status': 'up_to_date',
            'at': now_iso(),
            'startedAt': started_at,
            'totalProfitBasisUsd': total_profit_basis_usd,
            'processedProfitUsd': processed_profit_usd,
            'deltaProfitUsd': 0.0,
            'unroutedProfitUsd': 0.0,
            'closeTradesSeen': close_count,
            'lastRoutedTradingLedgerId': str(state.get('lastRoutedTradingLedgerId') or ''),
            'checkpointId': checkpoint_id,
            'stakingPoolUrl': STAKING_POOL_URL,
            'receiptsPath': str(RECEIPTS_PATH),
            'ledgerPath': str(LEDGER_PATH),
        }
        write_json(STATE_PATH, {'lastRunAt': summary['at'], 'processedProfitUsd': processed_profit_usd, 'lastStatus': summary})
        write_json(OUTPUT_PATH, summary)
        append_json_line(
            LOG_PATH,
            {
                'at': summary['at'],
                'event': 'trading_route',
                'ok': True,
                'status': 'up_to_date',
                'deltaProfitUsd': 0.0,
            },
        )
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    route_usd = round(delta_profit_usd * (ROUTE_BPS / 10_000.0), 8)
    route_sol = round(route_usd / SOL_PRICE_USD, 9)

    if route_sol < ROUTE_MIN_SOL:
        summary = {
            'ok': False,
            'status': 'blocked',
            'reason': 'route_amount_below_min_sol',
            'at': now_iso(),
            'startedAt': started_at,
            'totalProfitBasisUsd': total_profit_basis_usd,
            'processedProfitUsd': processed_profit_usd,
            'deltaProfitUsd': delta_profit_usd,
            'routeUsd': route_usd,
            'routeSol': route_sol,
            'routeMinSol': ROUTE_MIN_SOL,
            'unroutedProfitUsd': delta_profit_usd,
            'closeTradesSeen': close_count,
            'checkpointId': checkpoint_id,
            'stakingPoolUrl': STAKING_POOL_URL,
            'receiptsPath': str(RECEIPTS_PATH),
            'ledgerPath': str(LEDGER_PATH),
        }
        write_json(STATE_PATH, {'lastRunAt': summary['at'], 'processedProfitUsd': processed_profit_usd, 'lastStatus': summary})
        write_json(OUTPUT_PATH, summary)
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    pool_id = pool_id_from_url(STAKING_POOL_URL)
    if not pool_id:
        summary = {
            'ok': False,
            'status': 'blocked',
            'reason': 'missing_staking_pool_url',
            'at': now_iso(),
            'startedAt': started_at,
            'deltaProfitUsd': delta_profit_usd,
            'routeUsd': route_usd,
            'routeSol': route_sol,
            'unroutedProfitUsd': delta_profit_usd,
        }
        write_json(STATE_PATH, {'lastRunAt': summary['at'], 'processedProfitUsd': processed_profit_usd, 'lastStatus': summary})
        write_json(OUTPUT_PATH, summary)
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    try:
        if ROUTE_CMD:
            route_result = run_route_cmd(
                amount_sol=route_sol,
                delta_profit_usd=delta_profit_usd,
                route_usd=route_usd,
                checkpoint_id=checkpoint_id,
            )
        else:
            route_result = run_solana_transfer(amount_sol=route_sol, pool_id=pool_id)
    except Exception as exc:
        summary = {
            'ok': False,
            'status': 'failed',
            'reason': str(exc)[:300] or 'route_execution_failed',
            'at': now_iso(),
            'startedAt': started_at,
            'totalProfitBasisUsd': total_profit_basis_usd,
            'processedProfitUsd': processed_profit_usd,
            'deltaProfitUsd': delta_profit_usd,
            'routeUsd': route_usd,
            'routeSol': route_sol,
            'unroutedProfitUsd': delta_profit_usd,
            'closeTradesSeen': close_count,
            'checkpointId': checkpoint_id,
            'stakingPoolUrl': STAKING_POOL_URL,
        }
        write_json(STATE_PATH, {'lastRunAt': summary['at'], 'processedProfitUsd': processed_profit_usd, 'lastStatus': summary})
        write_json(OUTPUT_PATH, summary)
        append_json_line(
            LOG_PATH,
            {
                'at': summary['at'],
                'event': 'trading_route',
                'ok': False,
                'status': 'failed',
                'reason': summary['reason'],
                'deltaProfitUsd': delta_profit_usd,
            },
        )
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    actual_routed_sol = round(max(0.0, parse_float(route_result.get('routedSol'), route_sol)), 9)
    actual_routed_usd = round(actual_routed_sol * SOL_PRICE_USD, 8)

    receipt = {
        'id': f'trading-route-{int(datetime.now(timezone.utc).timestamp())}',
        'source': 'trading',
        'venue': 'dflow',
        'at': now_iso(),
        'status': 'success',
        'stakingPoolUrl': STAKING_POOL_URL,
        'txSignature': str(route_result.get('txSignature') or '').strip(),
        'method': str(route_result.get('method') or '').strip(),
        'routeBps': ROUTE_BPS,
        'deltaProfitUsd': delta_profit_usd,
        'routedUsd': actual_routed_usd,
        'routedSol': actual_routed_sol,
        'totalProfitBasisUsd': total_profit_basis_usd,
        'processedProfitUsdBefore': processed_profit_usd,
        'processedProfitUsdAfter': total_profit_basis_usd,
        'closeTradesSeen': close_count,
        'checkpointId': checkpoint_id,
        'lastRoutedTradingLedgerId': checkpoint_id,
    }
    append_json_line(RECEIPTS_PATH, receipt)

    append_json_line(
        LEDGER_PATH,
        {
            'id': f"trading-route-ledger-{int(datetime.now(timezone.utc).timestamp())}",
            'source': 'trading',
            'venue': 'dflow',
            'kind': 'route',
            'status': 'success',
            'realized': True,
            'at': receipt['at'],
            'marketId': '',
            'positionId': '',
            'orderId': '',
            'txSignature': receipt['txSignature'],
            'checkpointId': checkpoint_id,
            'grossUsd': 0.0,
            'costUsd': actual_routed_usd,
            'netUsd': -actual_routed_usd,
            'routedSol': actual_routed_sol,
            'error': '',
        },
    )

    summary = {
        'ok': True,
        'status': 'routed',
        'at': now_iso(),
        'startedAt': started_at,
        'totalProfitBasisUsd': total_profit_basis_usd,
        'processedProfitUsdBefore': processed_profit_usd,
        'processedProfitUsdAfter': total_profit_basis_usd,
        'deltaProfitUsd': delta_profit_usd,
        'routeUsd': actual_routed_usd,
        'routeSol': actual_routed_sol,
        'unroutedProfitUsd': 0.0,
        'closeTradesSeen': close_count,
        'checkpointId': checkpoint_id,
        'lastRoutedTradingLedgerId': checkpoint_id,
        'stakingPoolUrl': STAKING_POOL_URL,
        'txSignature': receipt['txSignature'],
        'receiptsPath': str(RECEIPTS_PATH),
        'ledgerPath': str(LEDGER_PATH),
    }

    write_json(
        STATE_PATH,
        {
            'lastRunAt': summary['at'],
            'processedProfitUsd': total_profit_basis_usd,
            'lastRoutedTradingLedgerId': checkpoint_id,
            'lastStatus': summary,
        },
    )
    write_json(OUTPUT_PATH, summary)
    append_json_line(
        LOG_PATH,
        {
            'at': summary['at'],
            'event': 'trading_route',
            'ok': True,
            'status': 'routed',
            'deltaProfitUsd': delta_profit_usd,
            'routeUsd': actual_routed_usd,
            'routeSol': actual_routed_sol,
            'txSignature': receipt['txSignature'],
        },
    )
    print(json.dumps(summary, ensure_ascii=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(run())
