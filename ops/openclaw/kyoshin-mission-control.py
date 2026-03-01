#!/usr/bin/env python3
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

HOME_DIR = Path(os.environ.get('HOME', '~')).expanduser()
WORKSPACE = HOME_DIR / '.openclaw' / 'workspace'
RUNTIME_DIR = WORKSPACE / 'runtime'
STATE_DIR = RUNTIME_DIR / 'state'
INCIDENTS_DIR = RUNTIME_DIR / 'incidents'
RECEIPTS_DIR = RUNTIME_DIR / 'receipts'
QUEUE_PATH = RUNTIME_DIR / 'queue' / 'assignments.json'
TOOL_HEALTH_PATH = RUNTIME_DIR / 'tools' / 'tool-health.json'
GOVERNOR_PATH = STATE_DIR / 'swarm-governor.json'
KYOSHIN_RUNTIME_PATH = STATE_DIR / 'kyoshin-runtime.json'
SENTRY_TRIAGE_PATH = INCIDENTS_DIR / 'sentry-triage.json'
REVENUE_LEDGER_PATH = Path(
    os.getenv('KYO_REVENUE_LEDGER_PATH', str(RECEIPTS_DIR / 'revenue-ledger.jsonl')).strip()
).expanduser()
CLAWMART_MONITOR_PATH = STATE_DIR / 'clawmart-monitor.json'
CLAWMART_STAKING_ROUTE_PATH = STATE_DIR / 'clawmart-staking-route.json'
DISPATCH_SUMMARY_PATH = STATE_DIR / 'distribution-engine.json'
REVENUE_GUARD_PATH = STATE_DIR / 'revenue-guard.json'
TRADING_EXEC_PATH = STATE_DIR / 'trading-exec.json'
TRADING_ROUTE_PATH = STATE_DIR / 'trading-route.json'
MISSION_PATH = WORKSPACE / 'MISSION_STATEMENT.md'
GOALS_PATH = WORKSPACE / 'GOALS.md'
OUTPUT_DIR = RUNTIME_DIR / 'mission-control'
BOARD_PATH = OUTPUT_DIR / 'board.json'
BACKLOG_PATH = OUTPUT_DIR / 'backlog.json'

MAX_BACKLOG_ITEMS = max(5, min(100, int(os.getenv('KYO_MISSION_CONTROL_MAX_BACKLOG', '40'))))
MAX_SENTRY_BACKLOG_ITEMS = max(0, min(40, int(os.getenv('KYO_MISSION_CONTROL_MAX_SENTRY_BACKLOG', '12'))))


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_dirs() -> None:
    for path in (WORKSPACE, RUNTIME_DIR, STATE_DIR, RECEIPTS_DIR, OUTPUT_DIR):
        path.mkdir(parents=True, exist_ok=True)
        path.chmod(0o700)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + '\n', encoding='utf-8')
    path.chmod(0o600)


def read_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return fallback


def read_mission() -> str:
    if not MISSION_PATH.exists():
        return ''
    for line in MISSION_PATH.read_text(encoding='utf-8').splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith('#'):
            return stripped
    return ''


def read_goal_lines() -> list[str]:
    if not GOALS_PATH.exists():
        return []
    lines: list[str] = []
    for line in GOALS_PATH.read_text(encoding='utf-8').splitlines():
        stripped = line.strip()
        if stripped.startswith('- '):
            goal = stripped[2:].strip()
            if goal:
                lines.append(goal)
        if len(lines) >= 6:
            break
    return lines


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


def parse_float(value: Any, fallback: float = 0.0) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except Exception:
            return fallback
    return fallback


def parse_int(value: Any, fallback: int = 0) -> int:
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        try:
            return int(value.strip())
        except Exception:
            return fallback
    return fallback


def summarize_revenue_7d(path: Path) -> dict[str, float | int]:
    if not path.exists():
        return {
            'revenueGrossUsd7d': 0.0,
            'revenueNetUsd7d': 0.0,
            'paidOrders7d': 0,
            'x402PaidCalls7d': 0,
            'tradingGrossUsd7d': 0.0,
            'tradingNetUsd7d': 0.0,
            'tradingRoutedSol7d': 0.0,
            'dflowTrades7d': 0,
            'kalshiSignals7d': 0,
        }

    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    gross = 0.0
    net = 0.0
    paid_orders = 0
    x402_paid_calls = 0
    trading_gross = 0.0
    trading_net = 0.0
    trading_routed_sol = 0.0
    dflow_trades = 0
    kalshi_signals = 0
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
        ts = parse_ts(row.get('at') or row.get('timestamp') or row.get('executedAt'))
        if ts is None or ts < cutoff:
            continue
        gross += max(0.0, parse_float(row.get('grossUsd'), 0.0))
        net += parse_float(row.get('netUsd'), 0.0)
        source = str(row.get('source') or '').strip().lower()
        kind = str(row.get('kind') or '').strip().lower()
        status = str(row.get('status') or '').strip().lower()
        if source == 'clawmart' and kind == 'paid_order' and status == 'success':
            paid_orders += 1
        if source == 'x402' and kind == 'paid_call' and status == 'success':
            x402_paid_calls += 1
        if source == 'trading' and status == 'success':
            venue = str(row.get('venue') or '').strip().lower()
            if kind == 'trade_close':
                trading_gross += max(0.0, parse_float(row.get('grossUsd'), 0.0))
                trading_net += parse_float(row.get('netUsd'), 0.0)
                if venue == 'dflow':
                    dflow_trades += 1
            elif kind == 'route':
                trading_routed_sol += max(0.0, parse_float(row.get('routedSol'), 0.0))
            elif kind == 'signal' and venue == 'kalshi':
                kalshi_signals += 1
    return {
        'revenueGrossUsd7d': round(gross, 8),
        'revenueNetUsd7d': round(net, 8),
        'paidOrders7d': paid_orders,
        'x402PaidCalls7d': x402_paid_calls,
        'tradingGrossUsd7d': round(trading_gross, 8),
        'tradingNetUsd7d': round(trading_net, 8),
        'tradingRoutedSol7d': round(trading_routed_sol, 9),
        'dflowTrades7d': dflow_trades,
        'kalshiSignals7d': kalshi_signals,
    }


def run() -> int:
    ensure_dirs()

    mission = read_mission()
    goals = read_goal_lines()
    kyoshin_runtime = read_json(KYOSHIN_RUNTIME_PATH, {'ok': False})
    if not isinstance(kyoshin_runtime, dict):
        kyoshin_runtime = {'ok': False}
    runtime_summary = kyoshin_runtime.get('summary') if isinstance(kyoshin_runtime.get('summary'), dict) else {}
    assignments_payload = read_json(QUEUE_PATH, {'assignments': []})
    assignments = assignments_payload.get('assignments') if isinstance(assignments_payload, dict) else []
    if not isinstance(assignments, list):
        assignments = []
    queued = [row for row in assignments if isinstance(row, dict) and str(row.get('status', 'queued')).lower() == 'queued']

    tool_health = read_json(TOOL_HEALTH_PATH, {'checks': []})
    checks = tool_health.get('checks') if isinstance(tool_health, dict) else []
    if not isinstance(checks, list):
        checks = []
    critical_failures = [row for row in checks if isinstance(row, dict) and row.get('critical') and not row.get('ok')]

    sentry_triage = read_json(SENTRY_TRIAGE_PATH, {'incidents': [], 'totals': {}})
    sentry_incidents = sentry_triage.get('incidents') if isinstance(sentry_triage, dict) else []
    sentry_totals = sentry_triage.get('totals') if isinstance(sentry_triage, dict) else {}
    if not isinstance(sentry_incidents, list):
        sentry_incidents = []
    if not isinstance(sentry_totals, dict):
        sentry_totals = {}

    governor = read_json(GOVERNOR_PATH, {'decisions': []})
    decisions = governor.get('decisions') if isinstance(governor, dict) else []
    if not isinstance(decisions, list):
        decisions = []
    paused_agents = [row for row in decisions if isinstance(row, dict) and str(row.get('status', '')).lower() == 'paused']

    revenue_metrics = summarize_revenue_7d(REVENUE_LEDGER_PATH)
    clawmart_monitor = read_json(CLAWMART_MONITOR_PATH, {})
    if not isinstance(clawmart_monitor, dict):
        clawmart_monitor = {}
    clawmart_staking_route = read_json(CLAWMART_STAKING_ROUTE_PATH, {})
    if not isinstance(clawmart_staking_route, dict):
        clawmart_staking_route = {}
    distribution_summary = read_json(DISPATCH_SUMMARY_PATH, {})
    if not isinstance(distribution_summary, dict):
        distribution_summary = {}
    revenue_guard_summary = read_json(REVENUE_GUARD_PATH, {})
    if not isinstance(revenue_guard_summary, dict):
        revenue_guard_summary = {}
    trading_exec_summary = read_json(TRADING_EXEC_PATH, {})
    if not isinstance(trading_exec_summary, dict):
        trading_exec_summary = {}
    trading_route_summary = read_json(TRADING_ROUTE_PATH, {})
    if not isinstance(trading_route_summary, dict):
        trading_route_summary = {}

    staking_checkpoint = max(
        parse_int(clawmart_monitor.get('lastRoutedTotalSales'), 0),
        parse_int(clawmart_staking_route.get('lastRoutedTotalSales'), 0),
        parse_int(clawmart_staking_route.get('totalSales'), 0),
    )
    unrouted_sales_count = max(0, parse_int(clawmart_monitor.get('unroutedSalesCount'), 0))
    distribution_dispatch_success_rate = round(
        parse_float(distribution_summary.get('dispatchSuccessRate'), 0.0),
        6,
    )

    backlog: list[dict[str, Any]] = []
    runtime_ok = bool(kyoshin_runtime.get('ok'))
    runtime_last_tick_status = runtime_summary.get('lastTickStatus')
    runtime_mode = runtime_summary.get('mode')
    runtime_last_error = str(runtime_summary.get('lastError') or '').strip()
    treasury_near_cap = bool(runtime_summary.get('treasuryNearCap'))

    if not runtime_ok:
        backlog.append(
            {
                'id': 'runtime-stabilize',
                'type': 'stabilize_runtime',
                'priority': 'high',
                'title': 'Recover Kyoshin runtime health',
                'objective': 'Restore runtime status/health endpoint and clear last tick errors before high-risk execution.',
                'status': 'todo',
            }
        )

    for row in critical_failures:
        if len(backlog) >= MAX_BACKLOG_ITEMS:
            break
        backlog.append(
            {
                'id': f"tool-{row.get('id', 'unknown')}",
                'type': 'build_tool_adapter',
                'priority': 'high',
                'title': f"Restore tool: {row.get('id', 'unknown')}",
                'objective': f"Repair or replace failing tool check: {row.get('target', '')}",
                'status': 'todo',
            }
        )

    sentry_backlog_items = 0
    for row in sentry_incidents:
        if len(backlog) >= MAX_BACKLOG_ITEMS or sentry_backlog_items >= MAX_SENTRY_BACKLOG_ITEMS:
            break
        if not isinstance(row, dict):
            continue
        issue_id = str(row.get('issueId', '')).strip()
        if not issue_id:
            continue
        short_id = str(row.get('shortId', '')).strip() or issue_id
        triage = row.get('triage') if isinstance(row.get('triage'), dict) else {}
        policy = row.get('policy') if isinstance(row.get('policy'), dict) else {}
        route = str(triage.get('route', 'escalate')).strip().lower()
        environment_class = str(row.get('environmentClass', 'unknown')).strip().lower()
        level = str(row.get('level', 'error')).strip().lower()
        priority = 'high' if environment_class == 'production' or level in {'fatal', 'error'} else 'medium'
        backlog.append(
            {
                'id': f'sentry-{issue_id}',
                'type': 'sentry_auto_fix' if route == 'auto_fix' else 'sentry_escalation',
                'priority': priority,
                'title': f"[Sentry] {short_id} {str(row.get('title', 'incident')).strip()[:140]}",
                'objective': str(row.get('nextAction', '')).strip()[:280],
                'status': 'todo',
                'environment': environment_class,
                'route': route,
                'targetBranch': str(policy.get('targetBranch', '')).strip(),
                'issueUrl': str(row.get('permalink', '')).strip(),
            }
        )
        sentry_backlog_items += 1

    for row in queued:
        if len(backlog) >= MAX_BACKLOG_ITEMS:
            break
        mission_id = str(row.get('missionId', '')).strip() or str(row.get('opportunityId', '')).strip() or 'unknown'
        backlog.append(
            {
                'id': mission_id,
                'type': 'execute_assignment',
                'priority': 'high',
                'title': str(row.get('opportunityTitle', 'Queued opportunity')),
                'objective': str(row.get('objective', '')).strip()[:240],
                'status': 'todo',
                'agentId': row.get('agentId'),
            }
        )

    if treasury_near_cap and len(backlog) < MAX_BACKLOG_ITEMS:
        backlog.append(
            {
                'id': 'treasury-near-cap',
                'type': 'treasury_safety',
                'priority': 'high',
                'title': 'Treasury near policy cap',
                'objective': 'Reduce spend pressure and focus only on highest-margin opportunities until utilization falls below 90%.',
                'status': 'todo',
            }
        )

    board = {
        'ok': True,
        'at': now_iso(),
        'missionStatement': mission,
        'goals': goals,
        'runtimeOk': runtime_ok,
        'runtimeMode': runtime_mode,
        'runtimeLastTickStatus': runtime_last_tick_status,
        'runtimeLastError': runtime_last_error,
        'treasuryCapUsedRatio': runtime_summary.get('treasuryCapUsedRatio'),
        'treasuryTxUsedRatio': runtime_summary.get('treasuryTxUsedRatio'),
        'treasuryNearCap': treasury_near_cap,
        'assignmentQueue': len(queued),
        'criticalToolFailures': len(critical_failures),
        'sentryIncidents': len(sentry_incidents),
        'sentryAutoFixCandidates': int(sentry_totals.get('autoFixCandidates') or 0),
        'sentryEscalations': int(sentry_totals.get('escalations') or 0),
        'pausedAgents': len(paused_agents),
        'revenueGrossUsd7d': revenue_metrics['revenueGrossUsd7d'],
        'revenueNetUsd7d': revenue_metrics['revenueNetUsd7d'],
        'paidOrders7d': revenue_metrics['paidOrders7d'],
        'x402PaidCalls7d': revenue_metrics['x402PaidCalls7d'],
        'tradingGrossUsd7d': revenue_metrics['tradingGrossUsd7d'],
        'tradingNetUsd7d': revenue_metrics['tradingNetUsd7d'],
        'tradingRoutedSol7d': revenue_metrics['tradingRoutedSol7d'],
        'dflowTrades7d': revenue_metrics['dflowTrades7d'],
        'kalshiSignals7d': revenue_metrics['kalshiSignals7d'],
        'tradingOpenPositions': parse_int(trading_exec_summary.get('openPositions'), 0),
        'tradingDrawdownPct': round(parse_float(trading_exec_summary.get('drawdownPct'), 0.0), 8),
        'tradingRouteUnroutedProfitUsd': round(parse_float(trading_route_summary.get('unroutedProfitUsd'), 0.0), 8),
        'stakingRoutedSalesCheckpoint': staking_checkpoint,
        'unroutedSalesCount': unrouted_sales_count,
        'distributionDispatchSuccessRate': distribution_dispatch_success_rate,
        'revenueGuardOk': bool(revenue_guard_summary.get('ok', True)),
        'revenueGuardReasons': revenue_guard_summary.get('reasons') if isinstance(revenue_guard_summary.get('reasons'), list) else [],
        'backlogCount': len(backlog),
        'focus': [
            'Protect mission continuity.',
            'Prioritize paid opportunities with verifiable receipts.',
            'Build missing tools when blocked.',
        ],
    }
    write_json(BOARD_PATH, board)
    write_json(BACKLOG_PATH, {'ok': True, 'at': board['at'], 'items': backlog})
    print(
        json.dumps(
            {
                'ok': True,
                'boardPath': str(BOARD_PATH),
                'backlogPath': str(BACKLOG_PATH),
                'backlogCount': len(backlog),
                'criticalToolFailures': len(critical_failures),
                'sentryIncidents': len(sentry_incidents),
                'sentryBacklogItems': sentry_backlog_items,
                'pausedAgents': len(paused_agents),
                'runtimeOk': runtime_ok,
                'treasuryNearCap': treasury_near_cap,
                'revenueGrossUsd7d': revenue_metrics['revenueGrossUsd7d'],
                'revenueNetUsd7d': revenue_metrics['revenueNetUsd7d'],
                'paidOrders7d': revenue_metrics['paidOrders7d'],
                'x402PaidCalls7d': revenue_metrics['x402PaidCalls7d'],
                'tradingGrossUsd7d': revenue_metrics['tradingGrossUsd7d'],
                'tradingNetUsd7d': revenue_metrics['tradingNetUsd7d'],
                'tradingRoutedSol7d': revenue_metrics['tradingRoutedSol7d'],
                'dflowTrades7d': revenue_metrics['dflowTrades7d'],
                'kalshiSignals7d': revenue_metrics['kalshiSignals7d'],
                'tradingOpenPositions': parse_int(trading_exec_summary.get('openPositions'), 0),
                'tradingDrawdownPct': round(parse_float(trading_exec_summary.get('drawdownPct'), 0.0), 8),
                'tradingRouteUnroutedProfitUsd': round(parse_float(trading_route_summary.get('unroutedProfitUsd'), 0.0), 8),
                'stakingRoutedSalesCheckpoint': staking_checkpoint,
                'unroutedSalesCount': unrouted_sales_count,
                'distributionDispatchSuccessRate': distribution_dispatch_success_rate,
            },
            ensure_ascii=True,
        )
    )
    return 0


if __name__ == '__main__':
    raise SystemExit(run())
