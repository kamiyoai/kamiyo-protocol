#!/usr/bin/env python3
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

HOME_DIR = Path(os.environ.get('HOME', '~')).expanduser()
WORKSPACE = HOME_DIR / '.openclaw' / 'workspace'
RUNTIME_DIR = WORKSPACE / 'runtime'
FEEDS_PATH = RUNTIME_DIR / 'feeds' / 'opportunities.json'
QUEUE_DIR = RUNTIME_DIR / 'queue'
ASSIGNMENTS_PATH = QUEUE_DIR / 'assignments.json'
SUMMARY_PATH = QUEUE_DIR / 'assignments-summary.json'
LOG_PATH = RUNTIME_DIR / 'logs' / 'swarm-planner.jsonl'
REGISTRY_PATH = RUNTIME_DIR / 'swarm-registry.json'
MAX_ASSIGNMENTS = max(1, min(50, int(os.getenv('KYO_SWARM_MAX_ASSIGNMENTS', '12'))))


DEFAULT_REGISTRY = {
    'version': 1,
    'parent': 'kyoshin',
    'agents': [
        {
            'id': 'signal-hunter',
            'name': 'Kyoshin Signal Hunter',
            'role': 'signal',
            'status': 'active',
            'priority': 90,
            'jobSources': ['agent_ai', 'relevance', 'direct_api'],
            'missionHints': ['Discover high-conviction paid opportunities with machine-pay paths.'],
        },
        {
            'id': 'deal-executor',
            'name': 'Kyoshin Deal Executor',
            'role': 'executor',
            'status': 'active',
            'priority': 100,
            'jobSources': ['x402', 'direct_api', 'relevance', 'agent_ai', 'kore'],
            'missionHints': ['Execute paid opportunities with verifiable receipts and payout evidence.'],
        },
        {
            'id': 'ops-keeper',
            'name': 'Kyoshin Ops Keeper',
            'role': 'ops',
            'status': 'active',
            'priority': 80,
            'jobSources': ['internal', 'direct_api'],
            'missionHints': ['Maintain uptime, failure recovery, and policy compliance.'],
        },
        {
            'id': 'research-prover',
            'name': 'Kyoshin Research Prover',
            'role': 'research',
            'status': 'active',
            'priority': 70,
            'jobSources': ['agent_ai', 'relevance', 'kore', 'direct_api'],
            'missionHints': ['Validate opportunities and produce execution-grade evidence before action.'],
        },
    ],
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return fallback


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + '\n', encoding='utf-8')
    path.chmod(0o600)


def append_log(payload: dict[str, Any]) -> None:
    with LOG_PATH.open('a', encoding='utf-8') as handle:
        handle.write(json.dumps(payload, ensure_ascii=True) + '\n')
    LOG_PATH.chmod(0o600)


def source_matches(agent: dict[str, Any], opportunity: dict[str, Any]) -> float:
    source = str(opportunity.get('source', '')).lower()
    job_sources = {str(v).lower() for v in agent.get('jobSources', []) if isinstance(v, str)}
    if not source:
        return 0.0
    if source in job_sources:
        return 1.0
    if source in {'agent_ai', 'relevance', 'kore'} and 'direct_api' in job_sources:
        return 0.65
    if source == 'direct' and 'direct_api' in job_sources:
        return 0.8
    if source == 'x402' and 'direct_api' in job_sources:
        return 0.6
    return 0.1


def role_matches(agent: dict[str, Any], opportunity: dict[str, Any]) -> float:
    role = str(agent.get('role', '')).lower()
    hints = {str(v).lower() for v in opportunity.get('roleHints', []) if isinstance(v, str)}
    tags = {str(v).lower() for v in opportunity.get('tags', []) if isinstance(v, str)}
    if not hints and not tags:
        return 0.45

    if role in hints or role in tags:
        return 1.0

    if role == 'executor' and ({'execution', 'deal', 'close'} & (hints | tags)):
        return 0.95
    if role == 'signal' and ({'signal', 'trend', 'lead'} & (hints | tags)):
        return 0.9
    if role == 'research' and ({'research', 'analysis', 'due_diligence'} & (hints | tags)):
        return 0.9
    if role == 'ops' and ({'ops', 'infrastructure', 'monitoring'} & (hints | tags)):
        return 0.9

    return 0.35


def opportunity_value(opportunity: dict[str, Any]) -> float:
    payout_usd = opportunity.get('payoutUsd')
    payout_sol = opportunity.get('payoutSol')
    confidence = opportunity.get('confidence')

    usd = float(payout_usd) if isinstance(payout_usd, (int, float)) else 0.0
    sol = float(payout_sol) if isinstance(payout_sol, (int, float)) else 0.0
    conf = float(confidence) if isinstance(confidence, (int, float)) else 0.6
    conf = max(0.0, min(1.0, conf))

    value = (usd / 500.0) + (sol / 2.0) + conf
    return max(0.05, min(3.5, value))


def score(agent: dict[str, Any], opportunity: dict[str, Any]) -> float:
    priority = float(agent.get('priority', 50)) / 100.0
    role_score = role_matches(agent, opportunity)
    source_score = source_matches(agent, opportunity)
    value = opportunity_value(opportunity)
    return priority * 0.30 + role_score * 0.35 + source_score * 0.20 + value * 0.15


def best_agent(agents: list[dict[str, Any]], opportunity: dict[str, Any], counters: dict[str, int]) -> dict[str, Any]:
    ranked = sorted(
        agents,
        key=lambda agent: score(agent, opportunity) - (counters.get(agent['id'], 0) * 0.12),
        reverse=True,
    )
    return ranked[0]


def mission_objective(opportunity: dict[str, Any]) -> str:
    title = str(opportunity.get('title', 'untitled')).strip()
    summary = str(opportunity.get('summary', '')).strip()
    source = str(opportunity.get('source', 'direct')).strip()
    payout = opportunity.get('payoutSol')
    payout_line = f'Expected payout ~{payout:.4f} SOL.' if isinstance(payout, (int, float)) and payout > 0 else ''
    return (
        f'Process opportunity "{title}" from {source}. '
        f'{summary} '
        f'{payout_line} '
        'Only perform compliant, reversible, and auditable steps. Produce receipt evidence for every external action.'
    ).strip()


def run() -> int:
    for path in (RUNTIME_DIR, QUEUE_DIR, RUNTIME_DIR / 'logs'):
        path.mkdir(parents=True, exist_ok=True)
        path.chmod(0o700)

    if not REGISTRY_PATH.exists():
        write_json(REGISTRY_PATH, DEFAULT_REGISTRY)

    feed_payload = load_json(FEEDS_PATH, {'opportunities': []})
    opportunities = feed_payload.get('opportunities') if isinstance(feed_payload, dict) else []
    if not isinstance(opportunities, list):
        opportunities = []

    registry = load_json(REGISTRY_PATH, DEFAULT_REGISTRY)
    agents = registry.get('agents') if isinstance(registry, dict) else []
    if not isinstance(agents, list):
        agents = []

    active_agents = [
        a
        for a in agents
        if isinstance(a, dict)
        and isinstance(a.get('id'), str)
        and a.get('id', '').strip()
        and str(a.get('status', 'active')).lower() == 'active'
    ]

    ranked_opps = sorted(
        [o for o in opportunities if isinstance(o, dict)],
        key=lambda o: (
            float(o.get('confidence') or 0.0),
            float(o.get('payoutUsd') or 0.0),
            float(o.get('payoutSol') or 0.0),
        ),
        reverse=True,
    )

    assignments: list[dict[str, Any]] = []
    counters: dict[str, int] = {}
    tick = now_iso()

    for idx, opportunity in enumerate(ranked_opps):
        if len(assignments) >= MAX_ASSIGNMENTS:
            break
        if not active_agents:
            break

        agent = best_agent(active_agents, opportunity, counters)
        counters[agent['id']] = counters.get(agent['id'], 0) + 1

        tick_token = ''.join(ch for ch in tick if ch.isdigit())
        mission_id = f"swarm-{tick_token}-{idx + 1:02d}-{agent['id']}"
        assignments.append(
            {
                'missionId': mission_id,
                'agentId': agent['id'],
                'agentName': agent.get('name'),
                'role': agent.get('role'),
                'opportunityId': opportunity.get('id'),
                'opportunitySource': opportunity.get('source'),
                'opportunityTitle': opportunity.get('title'),
                'score': round(score(agent, opportunity), 4),
                'objective': mission_objective(opportunity),
                'constraints': [
                    'No unauthorized fund movement.',
                    'Log all decisions and outcomes in workspace memory.',
                    'Escalate blockers instead of improvising around missing credentials.',
                ],
                'createdAt': tick,
                'status': 'queued',
            }
        )

    out = {
        'at': tick,
        'registryVersion': registry.get('version') if isinstance(registry, dict) else 1,
        'opportunities': len(ranked_opps),
        'activeAgents': len(active_agents),
        'assignments': assignments,
    }

    write_json(ASSIGNMENTS_PATH, out)
    write_json(
        SUMMARY_PATH,
        {
            'at': tick,
            'opportunities': out['opportunities'],
            'activeAgents': out['activeAgents'],
            'assignmentCount': len(assignments),
            'perAgent': counters,
        },
    )
    append_log(
        {
            'at': tick,
            'event': 'swarm_planner',
            'opportunities': out['opportunities'],
            'activeAgents': out['activeAgents'],
            'assignmentCount': len(assignments),
            'perAgent': counters,
        }
    )

    print(json.dumps({'ok': True, 'assignmentCount': len(assignments), 'perAgent': counters}, ensure_ascii=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(run())
