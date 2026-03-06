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
TRADING_POSITIONS_PATH = STATE_DIR / 'trading-positions.json'
TRADING_FEED_PATH = STATE_DIR / 'trading-feed.json'
LEADER_FOLLOW_PATH = STATE_DIR / 'leader-follow.json'
TRADING_ROUTE_RECEIPTS_PATH = Path(
    os.getenv('KYO_TRADING_STAKING_RECEIPTS_PATH', str(RECEIPTS_DIR / 'trading-staking-route.jsonl')).strip()
).expanduser()
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


def row_has_settlement_evidence(row: dict[str, Any]) -> bool:
    if str(row.get('paymentRef') or row.get('txSignature') or '').strip():
        return True
    metadata = row.get('metadata') if isinstance(row.get('metadata'), dict) else {}
    settlement = metadata.get('settlementEvidence') if isinstance(metadata, dict) else {}
    if isinstance(settlement, dict):
        for key in ('settlementRef', 'txSignature', 'fillId', 'paymentRef'):
            if str(settlement.get(key) or '').strip():
                return True
    return False


def row_has_required_realized_fields(row: dict[str, Any]) -> bool:
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


def summarize_revenue_7d(path: Path) -> dict[str, float | int]:
    if not path.exists():
        return {
            'revenueGrossUsd7d': 0.0,
            'revenueNetUsd7d': 0.0,
            'paidOrders7d': 0,
            'x402PaidCalls7d': 0,
            'tradingGrossUsd7d': 0.0,
            'tradingNetUsd7d': 0.0,
            'polymarketTrades7d': 0,
            'limitlessTrades7d': 0,
            'singularityPaperTrades7d': 0,
            'singularityPaperWinRate7d': 0.0,
            'syntheticCloseViolations7d': 0,
            'missingRealizedFieldRows7d': 0,
            'microLiveTrades7d': 0,
            'tradingNetUsd24h': 0.0,
            'profitableDays7d': 0,
            'dflowTrades7d': 0,
            'kalshiSignals7d': 0,
        }

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=7)
    cutoff_24h = now - timedelta(hours=24)
    gross = 0.0
    net = 0.0
    paid_orders = 0
    x402_paid_calls = 0
    trading_gross = 0.0
    trading_net = 0.0
    polymarket_trades = 0
    limitless_trades = 0
    singularity_paper_trades = 0
    singularity_paper_wins = 0
    synthetic_close_violations = 0
    missing_realized_field_rows = 0
    micro_live_trades = 0
    trading_net_24h = 0.0
    profitable_days: dict[str, float] = {}
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
        if source == 'trading' and kind == 'trade_close' and status == 'success':
            realized_flag = row.get('realized')
            if realized_flag is True or str(realized_flag).strip().lower() in {'1', 'true'}:
                if row_has_settlement_evidence(row):
                    if not row_has_required_realized_fields(row):
                        missing_realized_field_rows += 1
                        continue
                    realized_profit = realized_profit_from_close_row(row)
                    trading_gross += max(0.0, parse_float(row.get('grossUsd'), 0.0))
                    trading_net += realized_profit
                    if ts >= cutoff_24h:
                        trading_net_24h += realized_profit
                    day_key = ts.date().isoformat()
                    profitable_days[day_key] = profitable_days.get(day_key, 0.0) + realized_profit
                    venue = str(row.get('venue') or '').strip().lower()
                    if venue == 'polymarket':
                        polymarket_trades += 1
                    if venue == 'limitless':
                        limitless_trades += 1
                    metadata = row.get('metadata') if isinstance(row.get('metadata'), dict) else {}
                    if str(metadata.get('executionMode') or '').strip().lower() == 'live':
                        micro_live_trades += 1
                else:
                    synthetic_close_violations += 1
        if source == 'trading' and kind == 'mark_to_market' and status == 'success':
            venue = str(row.get('venue') or '').strip().lower()
            metadata = row.get('metadata') if isinstance(row.get('metadata'), dict) else {}
            if venue == 'singularity' and str(metadata.get('executionMode') or '').strip().lower() == 'paper':
                singularity_paper_trades += 1
                if parse_float(row.get('netUsd'), 0.0) > 0:
                    singularity_paper_wins += 1
        if source == 'trading' and kind == 'signal' and status == 'success':
            venue = str(row.get('venue') or '').strip().lower()
            if venue == 'kalshi':
                kalshi_signals += 1
    singularity_win_rate = 0.0
    if singularity_paper_trades > 0:
        singularity_win_rate = round(singularity_paper_wins / singularity_paper_trades, 6)
    profitable_days_7d = 0
    for pnl in profitable_days.values():
        if pnl > 0:
            profitable_days_7d += 1
    return {
        'revenueGrossUsd7d': round(gross, 8),
        'revenueNetUsd7d': round(net, 8),
        'paidOrders7d': paid_orders,
        'x402PaidCalls7d': x402_paid_calls,
        'tradingGrossUsd7d': round(trading_gross, 8),
        'tradingNetUsd7d': round(trading_net, 8),
        'polymarketTrades7d': polymarket_trades,
        'limitlessTrades7d': limitless_trades,
        'singularityPaperTrades7d': singularity_paper_trades,
        'singularityPaperWinRate7d': singularity_win_rate,
        'syntheticCloseViolations7d': synthetic_close_violations,
        'missingRealizedFieldRows7d': missing_realized_field_rows,
        'microLiveTrades7d': micro_live_trades,
        'tradingNetUsd24h': round(trading_net_24h, 8),
        'profitableDays7d': profitable_days_7d,
        'dflowTrades7d': 0,
        'kalshiSignals7d': kalshi_signals,
    }


def summarize_leader_follow_7d(path: Path) -> dict[str, float | int]:
    if not path.exists():
        return {
            'leaderFollowInfluencedCandidates7d': 0,
            'leaderFollowAvgBias7d': 0.0,
            'leaderFollowTopWeight': 0.0,
        }
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    influenced = 0
    bias_total = 0.0
    top_weight = 0.0
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
        if str(row.get('source') or '').strip().lower() != 'trading':
            continue
        if str(row.get('kind') or '').strip().lower() != 'trade_open':
            continue
        ts = parse_ts(row.get('at') or row.get('timestamp') or row.get('executedAt'))
        if ts is None or ts < cutoff:
            continue
        metadata = row.get('metadata') if isinstance(row.get('metadata'), dict) else {}
        snapshot = (
            metadata.get('leaderFollowSnapshot')
            if isinstance(metadata.get('leaderFollowSnapshot'), dict)
            else {}
        )
        matched = snapshot.get('matchedLeaders') if isinstance(snapshot.get('matchedLeaders'), list) else []
        if not matched:
            continue
        influenced += 1
        bias_total += parse_float(snapshot.get('leaderBias'), 0.0)
        for item in matched:
            if not isinstance(item, dict):
                continue
            top_weight = max(top_weight, parse_float(item.get('weight'), 0.0))
    avg_bias = round((bias_total / influenced) if influenced > 0 else 0.0, 8)
    return {
        'leaderFollowInfluencedCandidates7d': influenced,
        'leaderFollowAvgBias7d': avg_bias,
        'leaderFollowTopWeight': round(top_weight, 8),
    }


def summarize_trading_routed_sol_window(path: Path, cutoff: datetime) -> float:
    if not path.exists():
        return 0.0
    total = 0.0
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
        ts = parse_ts(row.get('at') or row.get('timestamp') or row.get('routedAt'))
        if ts is None or ts < cutoff:
            continue
        source = str(row.get('source') or row.get('channel') or '').strip().lower()
        if source and source != 'trading':
            continue
        total += max(0.0, parse_float(row.get('routedSol'), 0.0))
    return round(total, 9)


def summarize_trading_net_48h(path: Path) -> float:
    if not path.exists():
        return 0.0
    cutoff = datetime.now(timezone.utc) - timedelta(hours=48)
    total = 0.0
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
        if str(row.get('source') or '').strip().lower() != 'trading':
            continue
        if str(row.get('kind') or '').strip().lower() != 'trade_close':
            continue
        if str(row.get('status') or '').strip().lower() != 'success':
            continue
        realized_flag = row.get('realized')
        if realized_flag is not True and str(realized_flag).strip().lower() not in {'1', 'true'}:
            continue
        if not row_has_settlement_evidence(row):
            continue
        if not row_has_required_realized_fields(row):
            continue
        ts = parse_ts(row.get('at') or row.get('timestamp') or row.get('executedAt'))
        if ts is None or ts < cutoff:
            continue
        total += realized_profit_from_close_row(row)
    return round(total, 8)


def summarize_venue_starvation(path: Path) -> dict[str, bool]:
    payload = read_json(path, {})
    if not isinstance(payload, dict):
        payload = {}
    warnings = payload.get('warnings') if isinstance(payload.get('warnings'), list) else []
    warning_set = {str(item).strip().lower() for item in warnings if str(item).strip()}
    return {
        'polymarket': 'venue_candidate_starvation_polymarket' in warning_set,
        'limitless': 'venue_candidate_starvation_limitless' in warning_set,
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
    leader_follow_metrics = summarize_leader_follow_7d(REVENUE_LEDGER_PATH)
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
    trading_feed_summary = read_json(TRADING_FEED_PATH, {})
    if not isinstance(trading_feed_summary, dict):
        trading_feed_summary = {}
    trading_route_summary = read_json(TRADING_ROUTE_PATH, {})
    if not isinstance(trading_route_summary, dict):
        trading_route_summary = {}
    leader_follow_summary = read_json(LEADER_FOLLOW_PATH, {})
    if not isinstance(leader_follow_summary, dict):
        leader_follow_summary = {}
    trading_positions_summary = read_json(TRADING_POSITIONS_PATH, {})
    if not isinstance(trading_positions_summary, dict):
        trading_positions_summary = {}
    cutoff_7d = datetime.now(timezone.utc) - timedelta(days=7)
    cutoff_48h = datetime.now(timezone.utc) - timedelta(hours=48)
    trading_routed_sol_7d = summarize_trading_routed_sol_window(TRADING_ROUTE_RECEIPTS_PATH, cutoff_7d)
    trading_routed_sol_48h = summarize_trading_routed_sol_window(TRADING_ROUTE_RECEIPTS_PATH, cutoff_48h)
    trading_net_48h = summarize_trading_net_48h(REVENUE_LEDGER_PATH)
    trading_route_parity_lag_usd = round(parse_float(trading_route_summary.get('unroutedRealizedNetUsd'), 0.0), 8)
    venue_starvation_flags = summarize_venue_starvation(TRADING_FEED_PATH)

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
        'tradingNetUsd48h': trading_net_48h,
        'tradingRoutedSol7d': trading_routed_sol_7d,
        'tradingRoutedSol48h': trading_routed_sol_48h,
        'polymarketTrades7d': revenue_metrics['polymarketTrades7d'],
        'limitlessTrades7d': revenue_metrics['limitlessTrades7d'],
        'singularityPaperTrades7d': revenue_metrics['singularityPaperTrades7d'],
        'singularityPaperWinRate7d': revenue_metrics['singularityPaperWinRate7d'],
        'syntheticCloseViolations7d': revenue_metrics['syntheticCloseViolations7d'],
        'missingRealizedFieldRows7d': revenue_metrics['missingRealizedFieldRows7d'],
        'microLiveTrades7d': revenue_metrics['microLiveTrades7d'],
        'tradingNetUsd24h': revenue_metrics['tradingNetUsd24h'],
        'profitableDays7d': revenue_metrics['profitableDays7d'],
        'dflowTrades7d': revenue_metrics['dflowTrades7d'],
        'kalshiSignals7d': revenue_metrics['kalshiSignals7d'],
        'tradingOpenPositions': parse_int(
            trading_positions_summary.get('openPositions', len(trading_positions_summary.get('positions', [])))
            if isinstance(trading_positions_summary.get('positions'), list)
            else trading_positions_summary.get('openPositions'),
            0,
        ),
        'tradingDrawdownPct': round(parse_float(trading_exec_summary.get('drawdownPct'), 0.0), 8),
        'tradingUnroutedProfitUsd': trading_route_parity_lag_usd,
        'tradingRouteParityLagUsd': trading_route_parity_lag_usd,
        'venueCandidateStarvation': venue_starvation_flags,
        'venueCandidateStarvationPolymarket': bool(venue_starvation_flags.get('polymarket')),
        'venueCandidateStarvationLimitless': bool(venue_starvation_flags.get('limitless')),
        'tradingFeedWarnings': trading_feed_summary.get('warnings') if isinstance(trading_feed_summary.get('warnings'), list) else [],
        'leaderFollowMode': str(leader_follow_summary.get('mode') or 'shadow'),
        'leaderFollowStatus': str(leader_follow_summary.get('status') or 'ok'),
        'leaderFollowInfluencedCandidates7d': leader_follow_metrics['leaderFollowInfluencedCandidates7d'],
        'leaderFollowAvgBias7d': leader_follow_metrics['leaderFollowAvgBias7d'],
        'leaderFollowTopWeight': leader_follow_metrics['leaderFollowTopWeight'],
        'leaderFollowPromotedAt': str(leader_follow_summary.get('promotedAt') or ''),
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
                'tradingNetUsd48h': trading_net_48h,
                'tradingRoutedSol7d': trading_routed_sol_7d,
                'tradingRoutedSol48h': trading_routed_sol_48h,
                'polymarketTrades7d': revenue_metrics['polymarketTrades7d'],
                'limitlessTrades7d': revenue_metrics['limitlessTrades7d'],
                'singularityPaperTrades7d': revenue_metrics['singularityPaperTrades7d'],
                'singularityPaperWinRate7d': revenue_metrics['singularityPaperWinRate7d'],
                'syntheticCloseViolations7d': revenue_metrics['syntheticCloseViolations7d'],
                'missingRealizedFieldRows7d': revenue_metrics['missingRealizedFieldRows7d'],
                'microLiveTrades7d': revenue_metrics['microLiveTrades7d'],
                'tradingNetUsd24h': revenue_metrics['tradingNetUsd24h'],
                'profitableDays7d': revenue_metrics['profitableDays7d'],
                'dflowTrades7d': revenue_metrics['dflowTrades7d'],
                'kalshiSignals7d': revenue_metrics['kalshiSignals7d'],
                'tradingOpenPositions': board['tradingOpenPositions'],
                'tradingDrawdownPct': board['tradingDrawdownPct'],
                'tradingUnroutedProfitUsd': board['tradingUnroutedProfitUsd'],
                'tradingRouteParityLagUsd': board['tradingRouteParityLagUsd'],
                'venueCandidateStarvation': board['venueCandidateStarvation'],
                'venueCandidateStarvationPolymarket': board['venueCandidateStarvationPolymarket'],
                'venueCandidateStarvationLimitless': board['venueCandidateStarvationLimitless'],
                'leaderFollowMode': board['leaderFollowMode'],
                'leaderFollowStatus': board['leaderFollowStatus'],
                'leaderFollowInfluencedCandidates7d': board['leaderFollowInfluencedCandidates7d'],
                'leaderFollowAvgBias7d': board['leaderFollowAvgBias7d'],
                'leaderFollowTopWeight': board['leaderFollowTopWeight'],
                'leaderFollowPromotedAt': board['leaderFollowPromotedAt'],
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
