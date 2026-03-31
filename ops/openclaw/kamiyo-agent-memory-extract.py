#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

HOME_DIR = Path(os.environ.get('HOME', '~')).expanduser()
WORKSPACE = HOME_DIR / '.openclaw' / 'workspace'
RUNTIME_DIR = WORKSPACE / 'runtime'
STATE_DIR = RUNTIME_DIR / 'state'
MEMORY_DIR = WORKSPACE / 'memory'
MEMORY_PATH = WORKSPACE / 'MEMORY.md'
STATE_PATH = STATE_DIR / 'memory-extract-state.json'

MAX_FACTS = max(20, min(500, int(os.getenv('KYO_MEMORY_EXTRACT_MAX_FACTS', '200'))))

MANAGED_HEADING = '## Daily Extracted Facts'
MANAGED_START = '<!-- KYO_MEMORY_EXTRACT_START -->'
MANAGED_END = '<!-- KYO_MEMORY_EXTRACT_END -->'
MARKERS = (
    'memory:',
    'preference:',
    'policy:',
    'trust:',
)
PLACEHOLDER_MARKERS = (
    'todo',
    'tbd',
    'replace me',
    '<fill',
    '[fill',
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_dirs() -> None:
    for path in (WORKSPACE, RUNTIME_DIR, STATE_DIR, MEMORY_DIR):
        path.mkdir(parents=True, exist_ok=True)
        path.chmod(0o700)


def write_text(path: Path, value: str) -> None:
    path.write_text(value, encoding='utf-8')
    path.chmod(0o600)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + '\n', encoding='utf-8')
    path.chmod(0o600)


def read_json(path: Path, fallback: dict[str, Any]) -> dict[str, Any]:
    if not path.exists():
        return fallback
    try:
        payload = json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return fallback
    if not isinstance(payload, dict):
        return fallback
    return payload


def ensure_memory_file() -> None:
    if MEMORY_PATH.exists():
        MEMORY_PATH.chmod(0o600)
        return
    seed = """# MEMORY.md

## Communication Preferences

- direct and factual updates

## Working Style

- execute first, report with receipts

## Key Context

- persistent autonomous revenue execution

## Trust Levels

- explicit approval required for irreversible external actions
"""
    write_text(MEMORY_PATH, seed)


def sanitize_fact(raw: str) -> str:
    text = re.sub(r'\s+', ' ', raw.strip())
    text = re.sub(r'^[-*]+\s*', '', text)
    if not text:
        return ''
    lowered = text.lower()
    for marker in PLACEHOLDER_MARKERS:
        if marker in lowered:
            return ''
    if len(text) < 12:
        return ''
    if text.startswith('(') and text.endswith(')'):
        return ''
    return text


def signature(value: str) -> str:
    lowered = value.strip().lower()
    lowered = re.sub(r'\s+', ' ', lowered)
    return hashlib.sha256(lowered.encode('utf-8')).hexdigest()[:24]


def strip_prefix(line: str) -> str:
    out = line.strip()
    out = re.sub(r'^[0-9]+\.\s*', '', out)
    out = re.sub(r'^[-*]+\s*', '', out)
    return out.strip()


def extract_candidates(source_path: Path) -> list[str]:
    if not source_path.exists():
        return []

    results: list[str] = []
    for raw in source_path.read_text(encoding='utf-8').splitlines():
        line = strip_prefix(raw)
        if not line or line.startswith('#'):
            continue
        normalized = line.lower()

        if '#memory' in normalized:
            candidate = sanitize_fact(line.replace('#memory', '').replace('#MEMORY', ''))
            if candidate:
                results.append(candidate)
            continue

        for marker in MARKERS:
            if normalized.startswith(marker):
                candidate = sanitize_fact(line[len(marker):])
                if candidate:
                    results.append(candidate)
                break

    seen: set[str] = set()
    deduped: list[str] = []
    for item in results:
        key = signature(item)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def parse_managed_block(memory_text: str) -> tuple[list[dict[str, str]], bool]:
    start_idx = memory_text.find(MANAGED_START)
    end_idx = memory_text.find(MANAGED_END)
    if start_idx == -1 or end_idx == -1 or end_idx < start_idx:
        return [], False

    block = memory_text[start_idx + len(MANAGED_START):end_idx]
    facts: list[dict[str, str]] = []
    for raw in block.splitlines():
        line = raw.strip()
        if not line.startswith('- '):
            continue
        body = line[2:].strip()
        if not body or body == '(none yet)':
            continue
        match = re.match(r'^\[([0-9]{4}-[0-9]{2}-[0-9]{2})\]\s+(.+)$', body)
        if match:
            facts.append({'date': match.group(1), 'fact': match.group(2).strip()})
        else:
            facts.append({'date': '', 'fact': body})
    return facts, True


def format_managed_block(facts: list[dict[str, str]]) -> str:
    rows = [MANAGED_HEADING, MANAGED_START]
    if not facts:
        rows.append('- (none yet)')
    else:
        for item in facts:
            fact_date = item.get('date', '').strip()
            fact_text = item.get('fact', '').strip()
            if not fact_text:
                continue
            if fact_date:
                rows.append(f'- [{fact_date}] {fact_text}')
            else:
                rows.append(f'- {fact_text}')
    rows.append(MANAGED_END)
    return '\n'.join(rows) + '\n'


def replace_or_append_block(memory_text: str, block: str) -> str:
    start_idx = memory_text.find(MANAGED_START)
    end_idx = memory_text.find(MANAGED_END)
    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
        start_line_idx = memory_text.rfind('\n', 0, start_idx)
        if start_line_idx == -1:
            start_line_idx = 0
        else:
            start_line_idx += 1
        end_line_idx = memory_text.find('\n', end_idx)
        if end_line_idx == -1:
            end_line_idx = len(memory_text)
        else:
            end_line_idx += 1
        prefix = memory_text[:start_line_idx]
        suffix = memory_text[end_line_idx:]
        combined = prefix.rstrip() + '\n\n' + block.rstrip() + '\n\n' + suffix.lstrip()
        return combined.rstrip() + '\n'

    base = memory_text.rstrip()
    if base:
        return base + '\n\n' + block
    return block


def run() -> int:
    parser = argparse.ArgumentParser(description='Extract durable memory facts from daily runtime notes.')
    parser.add_argument('--date', default='', help='UTC date (YYYY-MM-DD). Defaults to today.')
    args = parser.parse_args()

    ensure_dirs()
    ensure_memory_file()

    date_value = args.date.strip() or datetime.now(timezone.utc).strftime('%Y-%m-%d')
    source_path = MEMORY_DIR / f'{date_value}.md'

    memory_text = MEMORY_PATH.read_text(encoding='utf-8')
    managed_facts, had_block = parse_managed_block(memory_text)

    state = read_json(
        STATE_PATH,
        {'lastRunDate': None, 'knownFactHashes': [], 'totalFacts': 0},
    )
    known_hashes = state.get('knownFactHashes')
    if not isinstance(known_hashes, list):
        known_hashes = []
    known_set = {str(item) for item in known_hashes if isinstance(item, str)}

    existing_items: list[dict[str, str]] = []
    existing_hashes: set[str] = set()
    for item in managed_facts:
        fact_text = sanitize_fact(item.get('fact', ''))
        if not fact_text:
            continue
        fact_hash = signature(fact_text)
        if fact_hash in existing_hashes:
            continue
        existing_hashes.add(fact_hash)
        existing_items.append({'date': item.get('date', '').strip(), 'fact': fact_text})
    known_set.update(existing_hashes)

    candidates = extract_candidates(source_path)
    appended = 0
    for fact_text in candidates:
        fact_hash = signature(fact_text)
        if fact_hash in known_set:
            continue
        known_set.add(fact_hash)
        existing_items.append({'date': date_value, 'fact': fact_text})
        appended += 1

    trimmed_items = existing_items[-MAX_FACTS:]
    trimmed_hashes = [signature(item['fact']) for item in trimmed_items]
    managed_block = format_managed_block(trimmed_items)
    next_memory = replace_or_append_block(memory_text, managed_block)
    write_text(MEMORY_PATH, next_memory)

    next_state = {
        'lastRunDate': date_value,
        'lastRunAt': now_iso(),
        'sourcePath': str(source_path),
        'memoryPath': str(MEMORY_PATH),
        'totalFacts': len(trimmed_items),
        'knownFactHashes': trimmed_hashes,
        'hadManagedBlock': had_block,
    }
    write_json(STATE_PATH, next_state)

    output = {
        'ok': True,
        'date': date_value,
        'sourcePath': str(source_path),
        'memoryPath': str(MEMORY_PATH),
        'statePath': str(STATE_PATH),
        'extractedCount': len(candidates),
        'appendedCount': appended,
        'totalFacts': len(trimmed_items),
    }
    print(json.dumps(output, ensure_ascii=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(run())
