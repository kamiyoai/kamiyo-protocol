#!/usr/bin/env python3
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

HOME_DIR = Path(os.environ.get('HOME', '~')).expanduser()
WORKSPACE = HOME_DIR / '.openclaw' / 'workspace'
RUNTIME_DIR = WORKSPACE / 'runtime'
STATE_DIR = RUNTIME_DIR / 'state'
OUTPUT_PATH = STATE_DIR / 'context-guard.json'


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_dirs() -> None:
    for path in (WORKSPACE, RUNTIME_DIR, STATE_DIR):
        path.mkdir(parents=True, exist_ok=True)
        path.chmod(0o700)


def write_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.parent.chmod(0o700)
    path.write_text(value, encoding='utf-8')
    path.chmod(0o600)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + '\n', encoding='utf-8')
    path.chmod(0o600)


def mission_template() -> str:
    mission = os.getenv('KYO_MISSION_STATEMENT', '').strip()
    if not mission:
        mission = 'One autonomous AI organization that compounds value 24/7 and routes net SOL to the KAMIYO staking path.'
    return f"""# Mission Statement

{mission}
"""


TEMPLATES: list[dict[str, Any]] = [
    {
        'name': 'soul',
        'path': 'soul.md',
        'required': True,
        'content': """# soul.md

You are Kyoshin, a persistent operator identity.

Core priorities:
1. Safety and compliance before speed.
2. Truthful execution evidence over narrative.
3. Continuous revenue execution (trading + jobs) with measurable outcomes.
4. Route net SOL to the KAMIYO staking path.
""",
    },
    {
        'name': 'identity',
        'path': 'identity.md',
        'required': True,
        'content': """# identity.md

Name: Kyoshin
Role: Parent operator for swarm subagents
Mode: 24/7 autonomous runtime
Prime directive: generate net SOL from execution and route to KAMIYO staking.
""",
    },
    {
        'name': 'heartbeat',
        'path': 'heartbeat.md',
        'required': True,
        'content': """# heartbeat.md

Every loop tick:
1. Read mission, goals, working memory, and .learnings/LEARNINGS.md.
2. Execute one safe high-leverage action.
3. Record evidence and blockers.
4. Convert failures into durable rules.
""",
    },
    {
        'name': 'mission_statement',
        'path': 'MISSION_STATEMENT.md',
        'required': True,
        'builder': mission_template,
    },
    {
        'name': 'user_profile',
        'path': 'USER_PROFILE.md',
        'required': True,
        'content': """# User Profile

- Name: Mizuki Hayashi
- Role: founder/operator
- Interests: autonomous agents, on-chain systems, measurable execution
- Career Focus: building Kamiyo into a real autonomous operator network
- Non-Negotiables: truthfulness, receipts-first reporting, no fake autonomy claims
""",
    },
    {
        'name': 'goals',
        'path': 'GOALS.md',
        'required': True,
        'content': """# Goals

## 90-Day

- sustain >=95% successful autonomy ticks over trailing 7 days
- keep at least one revenue lane active every day
- route net SOL outcomes to KAMIYO staking with receipts

## 12-Month

- run a multi-agent operator stack with daily paid execution and minimal human intervention
- maintain continuous learning with explicit mistake->rule conversion in .learnings/LEARNINGS.md
""",
    },
    {
        'name': 'ambitions',
        'path': 'AMBITIONS.md',
        'required': True,
        'content': """# Ambitions

- become a persistent operator identity that compounds capability and trust over time
- operate a swarm that can source, execute, and settle paid work end-to-end
""",
    },
    {
        'name': 'tools',
        'path': 'TOOLS.md',
        'required': True,
        'content': """# Tools

- OpenClaw Gateway
- Kyoshin Swarm Runtime
- Solana RPC
- Marketplace Feeds
- Mission Control Backlog
- Learnings Flywheel (.learnings/LEARNINGS.md)
""",
    },
    {
        'name': 'working_memory',
        'path': 'WORKING-MEMORY.md',
        'required': True,
        'content': """# Working Memory

## Current Focus

- keep runtime healthy and producing verifiable outputs

## Active Blockers

- fill in live marketplace credentials and keep tool-health green

## Next Tick Priorities

- execute highest-confidence safe assignment
- record evidence and update .learnings/LEARNINGS.md if degraded
""",
    },
    {
        'name': 'learnings',
        'path': '.learnings/LEARNINGS.md',
        'required': True,
        'content': """# LEARNINGS

This file is the runtime flywheel. Every repeated mistake must become an explicit rule.

Format:
## <timestamp> | cycle <n> | <status>
- Mistake: <what failed>
- Correction: <what changed immediately>
- Rule: <durable rule to prevent recurrence>
- Evidence: <error signature or artifact path>
""",
    },
]

PLACEHOLDER_MARKERS = (
    '- ',
    '-',
    'todo',
    '<fill',
    '[fill',
    'replace me',
)


def normalize_line(line: str) -> str:
    return line.strip().lower()


def evaluate_content(name: str, content: str) -> tuple[bool, str]:
    lines = [line.strip() for line in content.splitlines() if line.strip() and not line.strip().startswith('#')]
    if not lines:
        return False, 'empty'

    if name == 'mission_statement':
        mission = lines[0]
        if len(mission) < 18:
            return False, 'too_short'
        return True, 'ok'

    if name == 'learnings':
        normalized_text = content.lower()
        if 'mistake:' not in normalized_text or 'correction:' not in normalized_text or 'rule:' not in normalized_text:
            return False, 'missing_learning_fields'
        return True, 'ok'

    for line in lines:
        normalized = normalize_line(line)
        if normalized in PLACEHOLDER_MARKERS:
            return False, 'placeholder'
        if normalized.startswith('- ') and len(normalized) <= 2:
            return False, 'placeholder'

    return True, 'ok'


def run() -> int:
    ensure_dirs()

    checks: list[dict[str, Any]] = []
    required_total = 0
    required_complete = 0

    for entry in TEMPLATES:
        rel = entry['path']
        abs_path = WORKSPACE / rel
        if not abs_path.exists():
            content = entry.get('content')
            if callable(entry.get('builder')):
                content = entry['builder']()
            if isinstance(content, str):
                write_text(abs_path, content)
        else:
            abs_path.chmod(0o600)

        text = abs_path.read_text(encoding='utf-8') if abs_path.exists() else ''
        complete, reason = evaluate_content(entry['name'], text)
        required = bool(entry.get('required'))

        if required:
            required_total += 1
            if complete:
                required_complete += 1

        checks.append(
            {
                'name': entry['name'],
                'path': str(abs_path),
                'required': required,
                'complete': complete,
                'reason': reason,
                'sizeBytes': len(text.encode('utf-8')),
            }
        )

    required_missing = [c['name'] for c in checks if c['required'] and not c['complete']]
    score = (required_complete / required_total) if required_total else 0.0
    out = {
        'ok': len(required_missing) == 0,
        'at': now_iso(),
        'score': round(score, 4),
        'requiredTotal': required_total,
        'requiredComplete': required_complete,
        'requiredMissing': required_missing,
        'checks': checks,
    }
    write_json(OUTPUT_PATH, out)
    print(json.dumps(out, ensure_ascii=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(run())
