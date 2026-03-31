#!/usr/bin/env python3
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

HOME_DIR = Path(os.environ.get('HOME', '~')).expanduser()
WORKSPACE = HOME_DIR / '.openclaw' / 'workspace'
RUNTIME_DIR = WORKSPACE / 'runtime'
STATE_DIR = RUNTIME_DIR / 'state'
LOG_DIR = RUNTIME_DIR / 'logs'

OUTPUT_PATH = STATE_DIR / 'kamiyo-agent-runtime.json'
METRICS_OUTPUT_PATH = STATE_DIR / 'kamiyo-agent-runtime-metrics.prom'
LOG_PATH = LOG_DIR / 'kamiyo-agent-runtime-bridge.jsonl'

TIMEOUT_SECONDS = float(os.getenv('KYO_RUNTIME_BRIDGE_TIMEOUT_SECONDS', '8'))
ALLOW_INSECURE_HTTP = os.getenv('KYO_ALLOW_INSECURE_HTTP_FEEDS', '').strip().lower() in {'1', 'true', 'yes', 'on'}
SCRAPE_METRICS = os.getenv('KYO_RUNTIME_BRIDGE_SCRAPE_METRICS', '').strip().lower() in {'1', 'true', 'yes', 'on'}

HEALTH_URL = os.getenv('KYO_KAMIYO_AGENT_RUNTIME_HEALTH_URL', 'http://127.0.0.1:4020/health').strip()
STATUS_URL = os.getenv('KYO_KAMIYO_AGENT_RUNTIME_STATUS_URL', 'http://127.0.0.1:4020/status').strip()
METRICS_URL = os.getenv('KYO_KAMIYO_AGENT_RUNTIME_METRICS_URL', 'http://127.0.0.1:4020/metrics').strip()
TOKEN = os.getenv('KYO_KAMIYO_AGENT_RUNTIME_TOKEN', '').strip()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_dirs() -> None:
    for path in (WORKSPACE, RUNTIME_DIR, STATE_DIR, LOG_DIR):
        path.mkdir(parents=True, exist_ok=True)
        path.chmod(0o700)


def is_supported_url(url: str) -> bool:
    parsed = urllib.parse.urlparse(url)
    scheme = parsed.scheme.lower()
    if scheme == 'https':
        return True
    if scheme == 'http':
        return ALLOW_INSECURE_HTTP or parsed.hostname in {'127.0.0.1', 'localhost'}
    return False


def safe_float(value: Any) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except Exception:
            return 0.0
    return 0.0


def safe_int(value: Any) -> int:
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        try:
            return int(float(value.strip()))
        except Exception:
            return 0
    return 0


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + '\n', encoding='utf-8')
    path.chmod(0o600)


def write_text(path: Path, payload: str) -> None:
    path.write_text(payload, encoding='utf-8')
    path.chmod(0o600)


def append_log(payload: dict[str, Any]) -> None:
    with LOG_PATH.open('a', encoding='utf-8') as handle:
        handle.write(json.dumps(payload, ensure_ascii=True) + '\n')
    LOG_PATH.chmod(0o600)


def request_json(url: str) -> Any:
    if not is_supported_url(url):
        raise ValueError(f'unsupported_url:{url}')

    headers = {'accept': 'application/json', 'user-agent': 'kamiyo-agent-runtime-bridge/1.0'}
    if TOKEN:
        headers['authorization'] = f'Bearer {TOKEN}'
        headers['x-kamiyo-agent-token'] = TOKEN

    request = urllib.request.Request(url, headers=headers, method='GET')
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        raw = response.read(1_000_000)
    return json.loads(raw.decode('utf-8'))


def request_text(url: str) -> str:
    if not is_supported_url(url):
        raise ValueError(f'unsupported_url:{url}')
    headers = {'accept': 'text/plain', 'user-agent': 'kamiyo-agent-runtime-bridge/1.0'}
    if TOKEN:
        headers['authorization'] = f'Bearer {TOKEN}'
        headers['x-kamiyo-agent-token'] = TOKEN
    request = urllib.request.Request(url, headers=headers, method='GET')
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        return response.read(1_000_000).decode('utf-8')


def summarize_payload(health: dict[str, Any], status: dict[str, Any]) -> dict[str, Any]:
    treasury = status.get('treasury') if isinstance(status, dict) else {}
    swarm = status.get('swarm') if isinstance(status, dict) else {}

    spent_today = safe_float(treasury.get('spentTodaySol'))
    daily_cap = max(0.0, safe_float(treasury.get('dailyCapSol')))
    tx_today = safe_int(treasury.get('txToday'))
    tx_cap = max(0, safe_int(treasury.get('maxTxPerDay')))

    cap_ratio = spent_today / daily_cap if daily_cap > 0 else 0.0
    tx_ratio = tx_today / tx_cap if tx_cap > 0 else 0.0

    last_tick_status = str(status.get('lastTickStatus') or '').lower() or None
    health_ok = bool(health.get('ok'))
    runtime_ok = health_ok and last_tick_status != 'error'

    return {
        'ok': runtime_ok,
        'healthOk': health_ok,
        'mode': status.get('mode'),
        'running': bool(status.get('running')),
        'lastTickId': status.get('lastTickId'),
        'lastTickStatus': last_tick_status,
        'lastError': status.get('lastError'),
        'opportunitiesLastTick': safe_int(swarm.get('opportunitiesLastTick')),
        'assignmentsLastTick': safe_int(swarm.get('assignmentsLastTick')),
        'executedLastTick': safe_int(swarm.get('executedLastTick')),
        'skippedLastTick': safe_int(swarm.get('skippedLastTick')),
        'failedLastTick': safe_int(swarm.get('failedLastTick')),
        'treasurySpentTodaySol': spent_today,
        'treasuryDailyCapSol': daily_cap,
        'treasuryCapUsedRatio': round(cap_ratio, 6),
        'treasuryTxToday': tx_today,
        'treasuryTxCap': tx_cap,
        'treasuryTxUsedRatio': round(tx_ratio, 6),
        'treasuryNearCap': cap_ratio >= 0.9 or tx_ratio >= 0.9,
    }


def run() -> int:
    ensure_dirs()
    started_at = now_iso()

    try:
        health_payload = request_json(HEALTH_URL)
        if not isinstance(health_payload, dict):
            raise ValueError('invalid_health_payload')

        status_payload = request_json(STATUS_URL)
        if not isinstance(status_payload, dict):
            raise ValueError('invalid_status_payload')

        summary = summarize_payload(health_payload, status_payload)

        out = {
            'ok': bool(summary.get('ok')),
            'at': now_iso(),
            'startedAt': started_at,
            'healthUrl': HEALTH_URL,
            'statusUrl': STATUS_URL,
            'health': health_payload,
            'status': status_payload,
            'summary': summary,
        }

        write_json(OUTPUT_PATH, out)
        log_payload: dict[str, Any] = {
            'at': out['at'],
            'event': 'kamiyo_agent_runtime_bridge',
            'ok': out['ok'],
            'mode': summary.get('mode'),
            'lastTickStatus': summary.get('lastTickStatus'),
            'treasuryCapUsedRatio': summary.get('treasuryCapUsedRatio'),
            'treasuryTxUsedRatio': summary.get('treasuryTxUsedRatio'),
        }

        metrics_written = False
        if SCRAPE_METRICS:
            try:
                metrics_text = request_text(METRICS_URL)
                if metrics_text:
                    write_text(METRICS_OUTPUT_PATH, metrics_text)
                    metrics_written = True
            except Exception as exc:
                log_payload['metricsError'] = str(exc)[:240]

        log_payload['metricsWritten'] = metrics_written
        append_log(log_payload)
        print(
            json.dumps(
                {
                    'ok': out['ok'],
                    'statusPath': str(OUTPUT_PATH),
                    'mode': summary.get('mode'),
                    'lastTickStatus': summary.get('lastTickStatus'),
                    'treasuryCapUsedRatio': summary.get('treasuryCapUsedRatio'),
                    'treasuryTxUsedRatio': summary.get('treasuryTxUsedRatio'),
                    'metricsWritten': metrics_written,
                },
                ensure_ascii=True,
            )
        )
        return 0 if out['ok'] else 1
    except urllib.error.HTTPError as exc:
        error = f'http_{exc.code}'
    except urllib.error.URLError as exc:
        error = f'url_error:{str(exc.reason)[:180]}'
    except Exception as exc:
        error = str(exc)[:240]

    failed = {
        'ok': False,
        'at': now_iso(),
        'startedAt': started_at,
        'healthUrl': HEALTH_URL,
        'statusUrl': STATUS_URL,
        'error': error,
    }
    write_json(OUTPUT_PATH, failed)
    append_log({'at': failed['at'], 'event': 'kamiyo_agent_runtime_bridge', 'ok': False, 'error': error})
    print(json.dumps({'ok': False, 'error': error, 'statusPath': str(OUTPUT_PATH)}, ensure_ascii=True))
    return 1


if __name__ == '__main__':
    raise SystemExit(run())
