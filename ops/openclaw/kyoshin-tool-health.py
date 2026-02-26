#!/usr/bin/env python3
import json
import os
import shlex
import shutil
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

HOME_DIR = Path(os.environ.get('HOME', '~')).expanduser()
WORKSPACE = HOME_DIR / '.openclaw' / 'workspace'
RUNTIME_DIR = WORKSPACE / 'runtime'
TOOLS_DIR = RUNTIME_DIR / 'tools'
CONFIG_PATH = TOOLS_DIR / 'tool-registry.json'
OUTPUT_PATH = TOOLS_DIR / 'tool-health.json'
TIMEOUT_SECONDS = float(os.getenv('KYO_TOOL_HEALTH_TIMEOUT_SECONDS', '8'))
ALLOW_INSECURE_HTTP = os.getenv('KYO_ALLOW_INSECURE_HTTP_FEEDS', '').strip().lower() in {'1', 'true', 'yes', 'on'}


def env_flag(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {'1', 'true', 'yes', 'on'}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_dirs() -> None:
    for path in (WORKSPACE, RUNTIME_DIR, TOOLS_DIR):
        path.mkdir(parents=True, exist_ok=True)
        path.chmod(0o700)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + '\n', encoding='utf-8')
    path.chmod(0o600)


def default_registry() -> dict[str, Any]:
    return {
        'version': 1,
        'tools': [
            {'id': 'openclaw_cli', 'kind': 'command', 'target': 'openclaw', 'critical': False},
            {'id': 'jq_cli', 'kind': 'command', 'target': 'jq', 'critical': True},
            {'id': 'python3_cli', 'kind': 'command', 'target': 'python3', 'critical': True},
            {
                'id': 'openclaw_gateway',
                'kind': 'command',
                'target': 'openclaw gateway health --json',
                'critical': False,
            },
            {
                'id': 'kyoshin_runtime_health',
                'kind': 'http',
                'target': 'http://127.0.0.1:4020/health',
                'critical': True,
            },
        ],
    }


def read_registry() -> list[dict[str, Any]]:
    if not CONFIG_PATH.exists():
        write_json(CONFIG_PATH, default_registry())
    try:
        payload = json.loads(CONFIG_PATH.read_text(encoding='utf-8'))
    except Exception:
        payload = default_registry()
        write_json(CONFIG_PATH, payload)

    tools = payload.get('tools') if isinstance(payload, dict) else None
    if not isinstance(tools, list):
        return []
    out: list[dict[str, Any]] = []
    for entry in tools:
        if not isinstance(entry, dict):
            continue
        tool_id = str(entry.get('id', '')).strip()
        kind = str(entry.get('kind', '')).strip().lower()
        target = str(entry.get('target', '')).strip()
        if not tool_id or not kind or not target:
            continue
        out.append(
            {
                'id': tool_id,
                'kind': kind,
                'target': target,
                'critical': bool(entry.get('critical', False)),
                'headers': entry.get('headers') if isinstance(entry.get('headers'), dict) else {},
            }
        )
    do_agent_url = os.getenv('KYO_DO_AGENT_URL', '').strip()
    if do_agent_url:
        out.append(
            {
                'id': 'digitalocean_agent_completion',
                'kind': 'do_agent',
                'target': do_agent_url,
                'critical': env_flag('KYO_DO_AGENT_CHECK_CRITICAL', False),
                'headers': {},
            }
        )
    if env_flag('KYO_DX_TERMINAL_ENABLED', True):
        out.append(
            {
                'id': 'dx_terminal_api_health',
                'kind': 'http',
                'target': 'https://api.terminal.markets/api/v1/leaderboard?limit=1&sortBy=total_pnl_usd',
                'critical': False,
                'headers': {},
            }
        )
    return out


def run_command(target: str) -> tuple[bool, str]:
    try:
        args = shlex.split(target)
    except ValueError as exc:
        return False, f'invalid_command:{str(exc)[:180]}'

    if not args:
        return False, 'empty_command'

    if len(args) == 1:
        resolved = shutil.which(args[0])
        return (resolved is not None, resolved or 'command_not_found')

    resolved = shutil.which(args[0])
    if not resolved:
        return False, 'command_not_found'

    safe_args = [resolved, *args[1:]]
    try:
        proc = subprocess.run(
            safe_args,
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=TIMEOUT_SECONDS,
        )
        if proc.returncode == 0:
            preview = (proc.stdout.strip() or 'ok')[:240]
            return True, preview
        stderr = proc.stderr.strip() or proc.stdout.strip() or f'exit_{proc.returncode}'
        return False, stderr[:240]
    except Exception as exc:
        return False, str(exc)[:240]


def run_file(target: str) -> tuple[bool, str]:
    path = Path(target).expanduser()
    exists = path.exists()
    if exists:
        return True, str(path)
    return False, 'missing'


def run_http(target: str, headers: dict[str, Any]) -> tuple[bool, str]:
    parsed = urllib.parse.urlparse(target)
    scheme = parsed.scheme.lower()
    if scheme not in {'https', 'http'}:
        return False, 'unsupported_scheme'
    if scheme == 'http' and not (ALLOW_INSECURE_HTTP or parsed.hostname in {'127.0.0.1', 'localhost'}):
        return False, 'http_blocked'
    safe_headers = {'user-agent': 'kyoshin-tool-health/1.0'}
    for key, value in headers.items():
        if isinstance(key, str) and isinstance(value, str) and key and value:
            safe_headers[key] = value
    req = urllib.request.Request(target, headers=safe_headers, method='GET')
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as response:
            return True, f'http_{response.status}'
    except urllib.error.HTTPError as exc:
        if 200 <= exc.code < 500:
            return True, f'http_{exc.code}'
        return False, f'http_{exc.code}'
    except Exception as exc:
        return False, str(exc)[:240]


def run_do_agent(target: str) -> tuple[bool, str]:
    parsed = urllib.parse.urlparse(target)
    scheme = parsed.scheme.lower()
    if scheme not in {'https', 'http'}:
        return False, 'unsupported_scheme'
    if scheme == 'http' and not (ALLOW_INSECURE_HTTP or parsed.hostname in {'127.0.0.1', 'localhost'}):
        return False, 'http_blocked'
    api_key = os.getenv('KYO_DO_AGENT_API_KEY', '').strip()
    if not api_key:
        return False, 'missing_api_key'

    prompt = os.getenv(
        'KYO_DO_AGENT_CHECK_PROMPT',
        'Return JSON with key "ok" set to true for health check.',
    ).strip()
    retrieval_method = os.getenv('KYO_DO_AGENT_CHECK_RETRIEVAL_METHOD', 'none').strip().lower()
    if retrieval_method not in {'rewrite', 'step_back', 'sub_queries', 'none'}:
        retrieval_method = 'none'

    endpoint = target.rstrip('/') + '/api/v1/chat/completions'
    payload = {
        'messages': [{'role': 'user', 'content': prompt}],
        'max_tokens': 48,
        'retrieval_method': retrieval_method,
    }
    body = json.dumps(payload, ensure_ascii=True).encode('utf-8')
    req = urllib.request.Request(
        endpoint,
        data=body,
        method='POST',
        headers={
            'authorization': f'Bearer {api_key}',
            'content-type': 'application/json',
            'user-agent': 'kyoshin-tool-health/1.0',
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as response:
            response_text = response.read().decode('utf-8', errors='replace')
        try:
            parsed_response = json.loads(response_text)
        except Exception:
            return False, 'invalid_json_response'
        if isinstance(parsed_response, dict) and isinstance(parsed_response.get('choices'), list):
            return True, 'http_200'
        return False, 'invalid_completion_shape'
    except urllib.error.HTTPError as exc:
        return False, f'http_{exc.code}'
    except Exception as exc:
        return False, str(exc)[:240]


def check(entry: dict[str, Any]) -> dict[str, Any]:
    kind = entry['kind']
    target = entry['target']
    if kind == 'command':
        ok, detail = run_command(target)
    elif kind == 'file':
        ok, detail = run_file(target)
    elif kind == 'http':
        ok, detail = run_http(target, entry.get('headers') or {})
    elif kind == 'do_agent':
        ok, detail = run_do_agent(target)
    else:
        ok, detail = False, 'unsupported_kind'
    return {
        'id': entry['id'],
        'kind': kind,
        'target': target,
        'critical': entry['critical'],
        'ok': ok,
        'detail': detail,
    }


def run() -> int:
    ensure_dirs()
    checks = [check(entry) for entry in read_registry()]
    total = len(checks)
    failed = [row for row in checks if not row['ok']]
    critical_failures = [row['id'] for row in failed if row['critical']]

    out = {
        'ok': len(critical_failures) == 0,
        'at': now_iso(),
        'total': total,
        'healthy': total - len(failed),
        'failed': len(failed),
        'criticalFailures': critical_failures,
        'checks': checks,
    }
    write_json(OUTPUT_PATH, out)
    print(json.dumps(out, ensure_ascii=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(run())
