#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

HOME_DIR = Path(os.environ.get('HOME', '~')).expanduser()
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
ROUTE_BPS = max(1, min(10000, env_int('KYO_TRADING_ROUTE_NET_BPS', 5000)))
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
RPC_URL = os.getenv('KYO_TRADING_STAKING_RPC_URL', '').strip()
ROUTE_TOLERANCE_USD = max(0.0, env_float('KYO_TRADING_ROUTE_LAG_TOLERANCE_USD', 1.0))
CLI_TIMEOUT_SECONDS = max(15, min(180, env_int('KYO_TRADING_ROUTE_CLI_TIMEOUT_SECONDS', 90)))


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


def floor_precision(value: float, precision: int = 8) -> float:
    if value <= 0:
        return 0.0
    factor = float(10**precision)
    return float(int(value * factor) / factor)


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
        raise RuntimeError((proc.stderr or proc.stdout or f'solana_transfer_exit_{proc.returncode}').strip()[:350] or 'solana_transfer_failed')

    signature = parse_signature(proc.stdout or '')
    if not signature:
        raise RuntimeError('missing_tx_signature')
    return {
        'method': 'solana_transfer',
        'txSignature': signature,
        'routedSol': amount_sol,
    }


def trading_realized_snapshot(rows: list[dict[str, Any]]) -> tuple[float, str, int]:
    total_realized_net = 0.0
    latest_id = ''
    latest_ts = datetime.fromtimestamp(0, tz=timezone.utc)
    row_count = 0
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
        net = parse_float(row.get('netUsd'), 0.0)
        if net > 0:
            total_realized_net += net
        row_count += 1
        ts = parse_ts(row.get('at') or row.get('timestamp') or row.get('executedAt'))
        if ts is not None and ts >= latest_ts:
            latest_ts = ts
            latest_id = str(row.get('id') or '').strip() or latest_id
    return round(max(0.0, total_realized_net), 8), latest_id, row_count


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
    total_realized_net_usd, checkpoint_id, realized_rows = trading_realized_snapshot(rows)
    state = read_json(STATE_PATH, {})
    if not isinstance(state, dict):
        state = {}
    processed_realized_net_usd = max(0.0, parse_float(state.get('processedRealizedNetUsd'), 0.0))

    delta_unrouted_usd = round(total_realized_net_usd - processed_realized_net_usd, 8)
    if delta_unrouted_usd <= ROUTE_TOLERANCE_USD:
        summary = {
            'ok': True,
            'status': 'up_to_date',
            'reason': 'within_tolerance' if delta_unrouted_usd > 0 else 'no_unrouted_balance',
            'at': now_iso(),
            'startedAt': started_at,
            'realizedNetUsdTotal': total_realized_net_usd,
            'processedRealizedNetUsd': processed_realized_net_usd,
            'deltaUnroutedUsd': round(max(0.0, delta_unrouted_usd), 8),
            'unroutedRealizedNetUsd': round(max(0.0, delta_unrouted_usd), 8),
            'routeLagToleranceUsd': ROUTE_TOLERANCE_USD,
            'routeBps': ROUTE_BPS,
            'routeMinSol': ROUTE_MIN_SOL,
            'solPriceUsd': SOL_PRICE_USD,
            'checkpointId': checkpoint_id,
            'realizedRows': realized_rows,
            'lastRoutedLedgerCursor': str(state.get('lastRoutedLedgerCursor') or ''),
            'lastRoutedNetUsd': round(parse_float(state.get('lastRoutedNetUsd'), 0.0), 8),
            'stakingPoolUrl': STAKING_POOL_URL,
            'receiptsPath': str(ROUTE_RECEIPTS_PATH),
            'ledgerPath': str(LEDGER_PATH),
        }
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
            },
        )
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    route_usd = floor_precision(max(0.0, delta_unrouted_usd) * (ROUTE_BPS / 10_000.0), 8)
    route_sol = floor_precision(route_usd / SOL_PRICE_USD, 9)
    if route_sol < ROUTE_MIN_SOL:
        summary = {
            'ok': True,
            'status': 'no_route',
            'reason': 'below_min_sol',
            'at': now_iso(),
            'startedAt': started_at,
            'realizedNetUsdTotal': total_realized_net_usd,
            'processedRealizedNetUsd': processed_realized_net_usd,
            'deltaUnroutedUsd': delta_unrouted_usd,
            'unroutedRealizedNetUsd': delta_unrouted_usd,
            'routeUsd': route_usd,
            'routeSol': route_sol,
            'routeMinSol': ROUTE_MIN_SOL,
            'solPriceUsd': SOL_PRICE_USD,
            'routeBps': ROUTE_BPS,
            'checkpointId': checkpoint_id,
            'stakingPoolUrl': STAKING_POOL_URL,
            'receiptsPath': str(ROUTE_RECEIPTS_PATH),
            'ledgerPath': str(LEDGER_PATH),
        }
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
            'at': now_iso(),
            'startedAt': started_at,
            'stakingPoolUrl': STAKING_POOL_URL,
            'deltaUnroutedUsd': delta_unrouted_usd,
            'unroutedRealizedNetUsd': delta_unrouted_usd,
            'routeUsd': route_usd,
            'routeSol': route_sol,
        }
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
            route_result = run_solana_transfer(amount_sol=route_sol, pool_id=pool_id)
    except Exception as exc:
        error_message = str(exc).strip()[:350] or 'route_execution_failed'
        summary = {
            'ok': False,
            'status': 'blocked',
            'reason': error_message,
            'at': now_iso(),
            'startedAt': started_at,
            'realizedNetUsdTotal': total_realized_net_usd,
            'processedRealizedNetUsd': processed_realized_net_usd,
            'deltaUnroutedUsd': delta_unrouted_usd,
            'unroutedRealizedNetUsd': delta_unrouted_usd,
            'routeUsd': route_usd,
            'routeSol': route_sol,
            'routeBps': ROUTE_BPS,
            'solPriceUsd': SOL_PRICE_USD,
            'stakingPoolUrl': STAKING_POOL_URL,
            'checkpointId': checkpoint_id,
        }
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
            },
        )
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    routed_sol = max(0.0, parse_float(route_result.get('routedSol'), route_sol))
    tx_signature = str(route_result.get('txSignature') or '').strip()
    route_method = str(route_result.get('method') or ('dry_run' if DRY_RUN else 'solana_transfer')).strip()
    routed_at = now_iso()

    receipt = {
        'at': routed_at,
        'source': 'trading',
        'channel': 'trading',
        'routeBps': ROUTE_BPS,
        'routeUsd': round(route_usd, 8),
        'routedSol': round(routed_sol, 9),
        'solPriceUsd': round(SOL_PRICE_USD, 8),
        'txSignature': tx_signature,
        'method': route_method,
        'checkpointId': checkpoint_id,
        'realizedNetUsdTotal': total_realized_net_usd,
        'deltaUnroutedUsd': delta_unrouted_usd,
        'stakingPoolUrl': STAKING_POOL_URL,
        'lastRoutedTradingLedgerId': checkpoint_id,
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
        'costUsd': round(route_usd, 8),
        'netUsd': round(-route_usd, 8),
        'paymentRef': tx_signature,
        'txSignature': tx_signature,
        'checkpointId': checkpoint_id,
        'metadata': {
            'routeBps': ROUTE_BPS,
            'routedSol': round(routed_sol, 9),
            'stakingPoolUrl': STAKING_POOL_URL,
            'method': route_method,
        },
    }
    append_json_line(LEDGER_PATH, ledger_row)

    summary = {
        'ok': True,
        'status': 'routed',
        'at': routed_at,
        'startedAt': started_at,
        'realizedNetUsdTotal': total_realized_net_usd,
        'processedRealizedNetUsd': total_realized_net_usd,
        'deltaUnroutedUsd': delta_unrouted_usd,
        'unroutedRealizedNetUsd': 0.0,
        'routeUsd': round(route_usd, 8),
        'routeSol': round(routed_sol, 9),
        'routeBps': ROUTE_BPS,
        'routeMinSol': ROUTE_MIN_SOL,
        'solPriceUsd': round(SOL_PRICE_USD, 8),
        'checkpointId': checkpoint_id,
        'txSignature': tx_signature,
        'method': route_method,
        'stakingPoolUrl': STAKING_POOL_URL,
        'receiptsPath': str(ROUTE_RECEIPTS_PATH),
        'ledgerPath': str(LEDGER_PATH),
        'lastRoutedLedgerCursor': checkpoint_id,
        'lastRoutedNetUsd': round(route_usd, 8),
    }
    write_json(
        STATE_PATH,
        {
            'lastRunAt': summary['at'],
            'processedRealizedNetUsd': total_realized_net_usd,
            'lastRoutedLedgerCursor': checkpoint_id,
            'lastRoutedNetUsd': round(route_usd, 8),
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
        },
    )
    print(json.dumps(summary, ensure_ascii=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(run())
