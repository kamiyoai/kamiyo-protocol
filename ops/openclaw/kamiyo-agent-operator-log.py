#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

HOME_DIR = Path(os.environ.get('HOME', '~')).expanduser()
WORKSPACE = HOME_DIR / '.openclaw' / 'workspace'
RUNTIME_DIR = WORKSPACE / 'runtime'
STATE_DIR = RUNTIME_DIR / 'state'
RECEIPTS_DIR = RUNTIME_DIR / 'receipts'
LOG_DIR = RUNTIME_DIR / 'logs'

STATE_PATH = STATE_DIR / 'operator-log-state.json'
OUTPUT_PATH = STATE_DIR / 'operator-log.json'
LOG_PATH = LOG_DIR / 'operator-log.jsonl'
LEDGER_PATH = Path(os.getenv('KYO_REVENUE_LEDGER_PATH', str(RECEIPTS_DIR / 'revenue-ledger.jsonl')).strip()).expanduser()
STAKING_RECEIPTS_PATH = Path(
    os.getenv('KYO_CLAWMART_STAKING_RECEIPTS_PATH', str(RECEIPTS_DIR / 'clawmart-staking-route.jsonl')).strip()
).expanduser()
TRADING_STAKING_RECEIPTS_PATH = Path(
    os.getenv('KYO_TRADING_STAKING_RECEIPTS_PATH', str(RECEIPTS_DIR / 'trading-staking-route.jsonl')).strip()
).expanduser()
REVENUE_GUARD_PATH = STATE_DIR / 'revenue-guard.json'
CLAWMART_MONITOR_PATH = STATE_DIR / 'clawmart-monitor.json'
X402_AGENTCASH_PATH = STATE_DIR / 'x402-agentcash.json'
DISPATCH_SUMMARY_PATH = STATE_DIR / 'distribution-engine.json'
TRADING_EXEC_PATH = STATE_DIR / 'trading-exec.json'
TRADING_ROUTE_PATH = STATE_DIR / 'trading-route.json'
TRADING_POSITIONS_PATH = STATE_DIR / 'trading-positions.json'


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_dirs() -> None:
    for path in (WORKSPACE, RUNTIME_DIR, STATE_DIR, RECEIPTS_DIR, LOG_DIR):
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


def parse_float(value: Any, default: float = 0.0) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except Exception:
            return default
    return default


def parse_int(value: Any, default: int = 0) -> int:
    if isinstance(value, int):
        return value if value >= 0 else default
    if isinstance(value, float):
        parsed = int(value)
        return parsed if parsed >= 0 else default
    if isinstance(value, str):
        try:
            parsed = int(value.strip())
            return parsed if parsed >= 0 else default
        except Exception:
            return default
    return default


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


def summarize_revenue(rows: list[dict[str, Any]], cutoff: datetime) -> dict[str, float | int]:
    gross = 0.0
    cost = 0.0
    net = 0.0
    paid_orders = 0
    x402_paid_calls = 0
    trading_net = 0.0
    polymarket_trades = 0
    limitless_trades = 0
    kalshi_signals = 0
    for row in rows:
        ts = parse_ts(row.get('at') or row.get('timestamp') or row.get('executedAt'))
        if ts is None or ts < cutoff:
            continue
        gross += max(0.0, parse_float(row.get('grossUsd'), 0.0))
        cost += max(0.0, parse_float(row.get('costUsd'), 0.0))
        net += parse_float(row.get('netUsd'), 0.0)
        source = str(row.get('source') or '').strip().lower()
        kind = str(row.get('kind') or '').strip().lower()
        status = str(row.get('status') or '').strip().lower()
        if source == 'clawmart' and kind == 'paid_order' and status == 'success':
            paid_orders += 1
        if source == 'x402' and kind == 'paid_call' and status == 'success':
            x402_paid_calls += 1
        if source == 'trading' and kind == 'trade_close' and status == 'success':
            trading_net += parse_float(row.get('netUsd'), 0.0)
            venue = str(row.get('venue') or '').strip().lower()
            if venue == 'polymarket':
                polymarket_trades += 1
            if venue == 'limitless':
                limitless_trades += 1
        if source == 'trading' and kind == 'signal' and status == 'success':
            venue = str(row.get('venue') or '').strip().lower()
            if venue == 'kalshi':
                kalshi_signals += 1
    return {
        'grossUsd': round(gross, 8),
        'costUsd': round(cost, 8),
        'netUsd': round(net, 8),
        'paidOrders': paid_orders,
        'x402PaidCalls': x402_paid_calls,
        'tradingNetUsd': round(trading_net, 8),
        'polymarketTrades': polymarket_trades,
        'limitlessTrades': limitless_trades,
        'dflowTrades': 0,
        'kalshiSignals': kalshi_signals,
    }


def summarize_staking(rows: list[dict[str, Any]], cutoff: datetime) -> dict[str, float | int]:
    routed_sol = 0.0
    routed_count = 0
    checkpoint = 0
    for row in rows:
        checkpoint = max(checkpoint, parse_int(row.get('clawMartTotalSalesRouted') or row.get('totalSalesRouted'), 0))
        ts = parse_ts(row.get('at') or row.get('timestamp') or row.get('routedAt'))
        if ts is None or ts < cutoff:
            continue
        routed_sol += max(0.0, parse_float(row.get('routedSol'), 0.0))
        routed_count += 1
    return {
        'routedSol': round(routed_sol, 9),
        'routedCount': routed_count,
        'checkpoint': checkpoint,
    }


def summarize_trading_staking(rows: list[dict[str, Any]], cutoff: datetime) -> dict[str, float | int]:
    routed_sol = 0.0
    routed_count = 0
    for row in rows:
        ts = parse_ts(row.get('at') or row.get('timestamp') or row.get('routedAt'))
        if ts is None or ts < cutoff:
            continue
        source = str(row.get('source') or row.get('channel') or '').strip().lower()
        if source and source != 'trading':
            continue
        routed_sol += max(0.0, parse_float(row.get('routedSol'), 0.0))
        routed_count += 1
    return {'routedSol': round(routed_sol, 9), 'routedCount': routed_count}


def build_summary_text(summary: dict[str, Any]) -> str:
    blockers = summary.get('blockers') or []
    blocker_text = 'none' if not blockers else ','.join(str(item) for item in blockers)
    return (
        f"status={summary.get('tickStatus')} "
        f"grossUsd7d={summary.get('revenueGrossUsd7d')} "
        f"costUsd7d={summary.get('revenueCostUsd7d')} "
        f"netUsd7d={summary.get('revenueNetUsd7d')} "
        f"paidOrders7d={summary.get('paidOrders7d')} "
        f"x402PaidCalls7d={summary.get('x402PaidCalls7d')} "
        f"tradingNetUsd7d={summary.get('tradingNetUsd7d')} "
        f"polymarketTrades7d={summary.get('polymarketTrades7d')} "
        f"limitlessTrades7d={summary.get('limitlessTrades7d')} "
        f"dflowTrades7d={summary.get('dflowTrades7d')} "
        f"kalshiSignals7d={summary.get('kalshiSignals7d')} "
        f"tradingRoutedSol7d={summary.get('tradingRoutedSol7d')} "
        f"tradingOpenPositions={summary.get('tradingOpenPositions')} "
        f"tradingDrawdownPct={summary.get('tradingDrawdownPct')} "
        f"routedSol7d={summary.get('stakingRoutedSol7d')} "
        f"unroutedSales={summary.get('unroutedSalesCount')} "
        f"tradingUnroutedProfitUsd={summary.get('tradingUnroutedProfitUsd')} "
        f"dispatchSuccessRate={summary.get('distributionDispatchSuccessRate')} "
        f"blockers={blocker_text}"
    )


def run() -> int:
    parser = argparse.ArgumentParser(description='Kamiyo Agent daily operator log writer')
    parser.add_argument('--status', default='', help='autonomy tick status')
    parser.add_argument('--cycle', default='0', help='autonomy cycle')
    parser.add_argument('--error', default='', help='autonomy combined error')
    parser.add_argument('--at', default='', help='autonomy tick timestamp')
    parser.add_argument('--force', action='store_true', help='force publish even if already published today')
    args = parser.parse_args()

    ensure_dirs()

    now = datetime.now(timezone.utc)
    today = now.date().isoformat()
    day_cutoff = now - timedelta(days=1)
    week_cutoff = now - timedelta(days=7)
    state = read_json(STATE_PATH, {})
    if not isinstance(state, dict):
        state = {}

    force_publish = args.force or os.getenv('KYO_OPERATOR_LOG_FORCE', '').strip().lower() in {'1', 'true', 'yes', 'on'}
    last_published_date = str(state.get('lastPublishedDate') or '').strip()

    revenue_rows = jsonl_rows(LEDGER_PATH)
    staking_rows = jsonl_rows(STAKING_RECEIPTS_PATH)
    trading_staking_rows = jsonl_rows(TRADING_STAKING_RECEIPTS_PATH)

    revenue_24h = summarize_revenue(revenue_rows, day_cutoff)
    revenue_7d = summarize_revenue(revenue_rows, week_cutoff)
    staking_24h = summarize_staking(staking_rows, day_cutoff)
    staking_7d = summarize_staking(staking_rows, week_cutoff)
    trading_staking_24h = summarize_trading_staking(trading_staking_rows, day_cutoff)
    trading_staking_7d = summarize_trading_staking(trading_staking_rows, week_cutoff)

    guard_summary = read_json(REVENUE_GUARD_PATH, {})
    clawmart_summary = read_json(CLAWMART_MONITOR_PATH, {})
    x402_summary = read_json(X402_AGENTCASH_PATH, {})
    distribution_summary = read_json(DISPATCH_SUMMARY_PATH, {})
    trading_exec_summary = read_json(TRADING_EXEC_PATH, {})
    trading_route_summary = read_json(TRADING_ROUTE_PATH, {})
    trading_positions_summary = read_json(TRADING_POSITIONS_PATH, {})

    blockers: list[str] = []
    if isinstance(guard_summary, dict):
        for reason in guard_summary.get('reasons') or []:
            if isinstance(reason, str) and reason not in blockers:
                blockers.append(reason)
    if isinstance(clawmart_summary, dict) and not bool(clawmart_summary.get('stakingRouteCompliant', True)):
        if 'staking_route_non_compliant' not in blockers:
            blockers.append('staking_route_non_compliant')
    if isinstance(x402_summary, dict) and str(x402_summary.get('status') or '').strip().lower() in {'blocked', 'failed'}:
        reason = str(x402_summary.get('reason') or 'x402_execution_blocked').strip()
        if reason and reason not in blockers:
            blockers.append(reason)
    if isinstance(trading_exec_summary, dict):
        status = str(trading_exec_summary.get('status') or '').strip().lower()
        if status in {'blocked', 'degraded'}:
            for reason in trading_exec_summary.get('reasons') or []:
                if isinstance(reason, str) and reason and reason not in blockers:
                    blockers.append(reason)
    if isinstance(trading_route_summary, dict):
        route_status = str(trading_route_summary.get('status') or '').strip().lower()
        if route_status in {'blocked', 'degraded'}:
            reason = str(trading_route_summary.get('reason') or 'trading_route_blocked').strip()
            if reason and reason not in blockers:
                blockers.append(reason)

    summary: dict[str, Any] = {
        'ok': True,
        'status': 'ok',
        'at': now_iso(),
        'day': today,
        'tickStatus': args.status.strip(),
        'cycle': parse_int(args.cycle, 0),
        'tickAt': args.at.strip(),
        'tickError': args.error.strip(),
        'revenueGrossUsd24h': revenue_24h['grossUsd'],
        'revenueCostUsd24h': revenue_24h['costUsd'],
        'revenueNetUsd24h': revenue_24h['netUsd'],
        'revenueGrossUsd7d': revenue_7d['grossUsd'],
        'revenueCostUsd7d': revenue_7d['costUsd'],
        'revenueNetUsd7d': revenue_7d['netUsd'],
        'paidOrders24h': revenue_24h['paidOrders'],
        'paidOrders7d': revenue_7d['paidOrders'],
        'x402PaidCalls24h': revenue_24h['x402PaidCalls'],
        'x402PaidCalls7d': revenue_7d['x402PaidCalls'],
        'tradingNetUsd24h': revenue_24h['tradingNetUsd'],
        'tradingNetUsd7d': revenue_7d['tradingNetUsd'],
        'polymarketTrades24h': revenue_24h['polymarketTrades'],
        'polymarketTrades7d': revenue_7d['polymarketTrades'],
        'limitlessTrades24h': revenue_24h['limitlessTrades'],
        'limitlessTrades7d': revenue_7d['limitlessTrades'],
        'dflowTrades24h': revenue_24h['dflowTrades'],
        'dflowTrades7d': revenue_7d['dflowTrades'],
        'kalshiSignals24h': revenue_24h['kalshiSignals'],
        'kalshiSignals7d': revenue_7d['kalshiSignals'],
        'stakingRoutedSol24h': staking_24h['routedSol'],
        'stakingRoutedSol7d': staking_7d['routedSol'],
        'stakingRoutedSalesCheckpoint': staking_7d['checkpoint'],
        'tradingRoutedSol24h': trading_staking_24h['routedSol'],
        'tradingRoutedSol7d': trading_staking_7d['routedSol'],
        'tradingOpenPositions': parse_int(
            trading_positions_summary.get('openPositions', len(trading_positions_summary.get('positions', [])))
            if isinstance(trading_positions_summary.get('positions'), list)
            else trading_positions_summary.get('openPositions'),
            0,
        ),
        'tradingDrawdownPct': round(parse_float(trading_exec_summary.get('drawdownPct') if isinstance(trading_exec_summary, dict) else 0.0, 0.0), 8),
        'tradingUnroutedProfitUsd': round(parse_float(trading_route_summary.get('unroutedRealizedNetUsd') if isinstance(trading_route_summary, dict) else 0.0, 0.0), 8),
        'unroutedSalesCount': parse_int(clawmart_summary.get('unroutedSalesCount') if isinstance(clawmart_summary, dict) else 0, 0),
        'distributionDispatchSuccessRate': round(
            parse_float(distribution_summary.get('dispatchSuccessRate') if isinstance(distribution_summary, dict) else 0.0, 0.0),
            6,
        ),
        'blockers': blockers,
        'revenueLedgerPath': str(LEDGER_PATH),
        'stakingReceiptsPath': str(STAKING_RECEIPTS_PATH),
    }
    summary['summaryText'] = build_summary_text(summary)

    publish = force_publish or last_published_date != today
    summary['published'] = publish
    summary['publishReason'] = 'forced' if force_publish else ('new_day' if publish else 'already_published_today')

    if publish:
        append_json_line(
            LOG_PATH,
            {
                'at': summary['at'],
                'event': 'operator_log',
                'day': today,
                'cycle': summary['cycle'],
                'tickStatus': summary['tickStatus'],
                'summary': summary['summaryText'],
                'metrics': {
                    'revenueGrossUsd7d': summary['revenueGrossUsd7d'],
                    'revenueCostUsd7d': summary['revenueCostUsd7d'],
                    'revenueNetUsd7d': summary['revenueNetUsd7d'],
                    'paidOrders7d': summary['paidOrders7d'],
                    'x402PaidCalls7d': summary['x402PaidCalls7d'],
                    'tradingNetUsd7d': summary['tradingNetUsd7d'],
                    'polymarketTrades7d': summary['polymarketTrades7d'],
                    'dflowTrades7d': summary['dflowTrades7d'],
                    'kalshiSignals7d': summary['kalshiSignals7d'],
                    'tradingRoutedSol7d': summary['tradingRoutedSol7d'],
                    'tradingOpenPositions': summary['tradingOpenPositions'],
                    'tradingDrawdownPct': summary['tradingDrawdownPct'],
                    'tradingUnroutedProfitUsd': summary['tradingUnroutedProfitUsd'],
                    'stakingRoutedSol7d': summary['stakingRoutedSol7d'],
                    'unroutedSalesCount': summary['unroutedSalesCount'],
                    'distributionDispatchSuccessRate': summary['distributionDispatchSuccessRate'],
                },
                'blockers': blockers,
            },
        )

    write_json(
        STATE_PATH,
        {
            'lastRunAt': summary['at'],
            'lastPublishedDate': today if publish else last_published_date,
            'lastStatus': summary,
        },
    )
    write_json(OUTPUT_PATH, summary)
    print(json.dumps(summary, ensure_ascii=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(run())
