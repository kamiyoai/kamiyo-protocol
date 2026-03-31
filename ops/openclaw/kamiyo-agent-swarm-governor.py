#!/usr/bin/env python3
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
REGISTRY_PATH = RUNTIME_DIR / 'swarm-registry.json'
RECEIPTS_PATH = RECEIPTS_DIR / 'execution-receipts.jsonl'
OUTPUT_PATH = STATE_DIR / 'swarm-governor.json'

WINDOW_DAYS = max(1, int(os.getenv('KYO_GOVERNOR_WINDOW_DAYS', '7')))
MIN_ATTEMPTS = max(1, int(os.getenv('KYO_GOVERNOR_MIN_ATTEMPTS', '3')))
MIN_SUCCESS_RATE = max(0.0, min(1.0, float(os.getenv('KYO_GOVERNOR_MIN_SUCCESS_RATE', '0.45'))))
MIN_NET_SOL = float(os.getenv('KYO_GOVERNOR_MIN_NET_SOL', '0'))
MAX_LOSS_STREAK = max(1, int(os.getenv('KYO_GOVERNOR_MAX_LOSS_STREAK', '3')))

DEFAULT_REGISTRY = {
    'version': 1,
    'parent': 'kamiyo-agent',
    'agents': [
        {
            'id': 'signal-hunter',
            'name': 'Kamiyo Agent Signal Hunter',
            'role': 'signal',
            'status': 'active',
            'priority': 90,
            'jobSources': ['agent_ai', 'relevance', 'direct_api'],
            'missionHints': ['Discover high-conviction paid opportunities with machine-pay paths.'],
        },
        {
            'id': 'deal-executor',
            'name': 'Kamiyo Agent Deal Executor',
            'role': 'executor',
            'status': 'active',
            'priority': 100,
            'jobSources': ['x402', 'direct_api', 'relevance', 'agent_ai', 'kore'],
            'missionHints': ['Execute paid opportunities with verifiable receipts and payout evidence.'],
        },
        {
            'id': 'ops-keeper',
            'name': 'Kamiyo Agent Ops Keeper',
            'role': 'ops',
            'status': 'active',
            'priority': 80,
            'jobSources': ['internal', 'direct_api'],
            'missionHints': ['Maintain uptime, failure recovery, and policy compliance.'],
        },
        {
            'id': 'research-prover',
            'name': 'Kamiyo Agent Research Prover',
            'role': 'research',
            'status': 'active',
            'priority': 70,
            'jobSources': ['agent_ai', 'relevance', 'kore', 'direct_api'],
            'missionHints': ['Validate opportunities and produce execution-grade evidence before action.'],
        },
    ],
}


def now() -> datetime:
    return datetime.now(timezone.utc)


def now_iso() -> str:
    return now().isoformat()


def clamp(value: int, low: int, high: int) -> int:
    return max(low, min(high, value))


def ensure_dirs() -> None:
    for path in (WORKSPACE, RUNTIME_DIR, STATE_DIR, RECEIPTS_DIR):
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


def parse_time(value: Any) -> Optional[datetime]:
    if not isinstance(value, str):
        return None
    raw = value.strip()
    if not raw:
        return None
    if raw.endswith('Z'):
        raw = raw[:-1] + '+00:00'
    try:
        ts = datetime.fromisoformat(raw)
    except Exception:
        return None
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(timezone.utc)


def parse_profit_sol(entry: dict[str, Any]) -> float:
    for key in ('profitSol', 'netSol'):
        value = entry.get(key)
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            try:
                return float(value.strip())
            except Exception:
                pass

    revenue = entry.get('revenueSol')
    cost = entry.get('costSol')
    if isinstance(revenue, (int, float)) and isinstance(cost, (int, float)):
        return float(revenue) - float(cost)

    return 0.0


def is_success(entry: dict[str, Any]) -> bool:
    status = str(entry.get('status', '')).strip().lower()
    return status in {'completed', 'success', 'ok', 'paid', 'settled'}


def read_receipts() -> list[dict[str, Any]]:
    if not RECEIPTS_PATH.exists():
        RECEIPTS_PATH.write_text('', encoding='utf-8')
        RECEIPTS_PATH.chmod(0o600)
        return []

    since = now() - timedelta(days=WINDOW_DAYS)
    out: list[dict[str, Any]] = []
    for line in RECEIPTS_PATH.read_text(encoding='utf-8').splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        try:
            payload = json.loads(stripped)
        except Exception:
            continue
        if not isinstance(payload, dict):
            continue
        agent_id = str(payload.get('agentId', '')).strip()
        if not agent_id:
            continue
        ts = parse_time(payload.get('executedAt')) or parse_time(payload.get('at')) or now()
        if ts < since:
            continue
        out.append(
            {
                'agentId': agent_id,
                'at': ts.isoformat(),
                'profitSol': parse_profit_sol(payload),
                'success': is_success(payload),
            }
        )
    return sorted(out, key=lambda item: item['at'])


def metric_snapshot(agent_id: str, receipts: list[dict[str, Any]]) -> dict[str, Any]:
    attempts = len(receipts)
    successes = sum(1 for item in receipts if item['success'])
    success_rate = (successes / attempts) if attempts else 0.0
    net_sol = round(sum(float(item['profitSol']) for item in receipts), 8)

    loss_streak = 0
    for item in reversed(receipts):
        if item['success'] and item['profitSol'] > 0:
            break
        loss_streak += 1

    return {
        'agentId': agent_id,
        'attempts': attempts,
        'successes': successes,
        'successRate': round(success_rate, 4),
        'netSol': net_sol,
        'lossStreak': loss_streak,
    }


def recommend_priority(base_priority: int, metrics: dict[str, Any]) -> int:
    attempts = int(metrics['attempts'])
    if attempts < MIN_ATTEMPTS:
        return base_priority
    signal = ((metrics['successRate'] - 0.5) * 35.0) + max(-20.0, min(20.0, metrics['netSol'] * 80.0))
    return clamp(int(round(base_priority + signal)), 10, 100)


def decide(metrics: dict[str, Any]) -> tuple[str, str]:
    attempts = int(metrics['attempts'])
    if attempts < MIN_ATTEMPTS:
        return 'active', 'insufficient_samples'
    if metrics['lossStreak'] >= MAX_LOSS_STREAK:
        return 'paused', 'loss_streak'
    if metrics['successRate'] < MIN_SUCCESS_RATE:
        return 'paused', 'low_success_rate'
    if metrics['netSol'] < MIN_NET_SOL:
        return 'paused', 'negative_net'
    return 'active', 'pass'


def run() -> int:
    ensure_dirs()

    registry = read_json(REGISTRY_PATH, DEFAULT_REGISTRY)
    agents = registry.get('agents') if isinstance(registry, dict) else None
    if not isinstance(agents, list):
        agents = []
    if not agents:
        agents = [dict(agent) for agent in DEFAULT_REGISTRY['agents']]

    receipts = read_receipts()
    by_agent: dict[str, list[dict[str, Any]]] = {}
    for entry in receipts:
        by_agent.setdefault(entry['agentId'], []).append(entry)

    decisions: list[dict[str, Any]] = []
    updated_agents: list[dict[str, Any]] = []

    for raw in agents:
        if not isinstance(raw, dict):
            continue
        agent_id = str(raw.get('id', '')).strip()
        if not agent_id:
            continue

        original_priority = int(raw.get('priority', 50) or 50)
        base_priority = int(raw.get('basePriority', original_priority) or original_priority)
        metrics = metric_snapshot(agent_id, by_agent.get(agent_id, []))
        status, reason = decide(metrics)
        next_priority = recommend_priority(base_priority, metrics)

        next_agent = dict(raw)
        next_agent['basePriority'] = base_priority
        next_agent['priority'] = next_priority if status == 'active' else min(next_priority, 25)
        next_agent['status'] = status
        next_agent['governor'] = {
            'mode': 'work_or_die',
            'reason': reason,
            'updatedAt': now_iso(),
            'windowDays': WINDOW_DAYS,
            'metrics': metrics,
        }

        updated_agents.append(next_agent)
        decisions.append(
            {
                'agentId': agent_id,
                'status': status,
                'reason': reason,
                'priority': next_agent['priority'],
                'metrics': metrics,
            }
        )

    active = [agent for agent in updated_agents if str(agent.get('status', '')).lower() == 'active']
    if updated_agents and not active:
        fallback = max(updated_agents, key=lambda item: int(item.get('basePriority', item.get('priority', 0)) or 0))
        fallback['status'] = 'active'
        governor = fallback.get('governor')
        if isinstance(governor, dict):
            governor['reason'] = 'forced_fallback_active'
            governor['forced'] = True

    registry_out = dict(registry) if isinstance(registry, dict) else {'version': 1, 'parent': 'kamiyo-agent'}
    registry_out['agents'] = updated_agents
    write_json(REGISTRY_PATH, registry_out)

    summary = {
        'ok': True,
        'at': now_iso(),
        'windowDays': WINDOW_DAYS,
        'receipts': len(receipts),
        'agents': len(updated_agents),
        'activeAgents': len([agent for agent in updated_agents if str(agent.get('status', '')).lower() == 'active']),
        'pausedAgents': len([agent for agent in updated_agents if str(agent.get('status', '')).lower() == 'paused']),
        'decisions': decisions,
    }
    write_json(OUTPUT_PATH, summary)
    print(json.dumps(summary, ensure_ascii=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(run())
