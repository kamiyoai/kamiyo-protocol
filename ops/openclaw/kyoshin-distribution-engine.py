#!/usr/bin/env python3
import hashlib
import json
import os
import re
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

HOME_DIR = Path(os.environ.get('HOME', '~')).expanduser()
WORKSPACE = HOME_DIR / '.openclaw' / 'workspace'
RUNTIME_DIR = WORKSPACE / 'runtime'
STATE_DIR = RUNTIME_DIR / 'state'
MISSION_CONTROL_DIR = RUNTIME_DIR / 'mission-control'
RECEIPTS_DIR = RUNTIME_DIR / 'receipts'
LOG_DIR = RUNTIME_DIR / 'logs'

BACKLOG_PATH = MISSION_CONTROL_DIR / 'backlog.json'
STATE_PATH = STATE_DIR / 'distribution-engine-state.json'
OUTPUT_PATH = STATE_DIR / 'distribution-engine.json'
LOG_PATH = LOG_DIR / 'distribution-engine.jsonl'
DISPATCH_RECEIPTS_PATH = RECEIPTS_DIR / 'distribution-dispatch.jsonl'

ENABLE_DISTRIBUTION_ENGINE = os.getenv('KYO_ENABLE_DISTRIBUTION_ENGINE', 'true').strip().lower() in {'1', 'true', 'yes', 'on'}
MAX_DISPATCH_PER_CHANNEL_DAY = max(1, min(100, int(os.getenv('KYO_DISTRIBUTION_MAX_DISPATCH_PER_CHANNEL_DAY', '6').strip() or '6')))
FAILURE_THRESHOLD = max(1, min(20, int(os.getenv('KYO_DISTRIBUTION_FAILURE_THRESHOLD', '3').strip() or '3')))
CHANNEL_COOLDOWN_MINUTES = max(1, min(1440, int(os.getenv('KYO_DISTRIBUTION_CHANNEL_COOLDOWN_MINUTES', '120').strip() or '120')))
CONTENT_COOLDOWN_MINUTES = max(1, min(1440, int(os.getenv('KYO_DISTRIBUTION_CONTENT_COOLDOWN_MINUTES', '180').strip() or '180')))
REQUIRE_SAFE_COPY = os.getenv('KYO_REQUIRE_SAFE_DISTRIBUTION_COPY', 'true').strip().lower() in {'1', 'true', 'yes', 'on'}
HTTP_TIMEOUT_SECONDS = max(3, min(30, int(os.getenv('KYO_DISTRIBUTION_TIMEOUT_SECONDS', '8').strip() or '8')))
FALLBACK_ORDER = [item.strip().lower() for item in os.getenv('KYO_DISTRIBUTION_FALLBACK_ORDER', 'telegram,discord,slack').split(',') if item.strip()]

UNSAFE_PATTERNS = [
    re.compile(r'\bguaranteed\b', re.IGNORECASE),
    re.compile(r'\brisk[- ]?free\b', re.IGNORECASE),
    re.compile(r'\binstant returns?\b', re.IGNORECASE),
    re.compile(r'\bdouble your money\b', re.IGNORECASE),
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def today_utc() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def ensure_dirs() -> None:
    for path in (WORKSPACE, RUNTIME_DIR, STATE_DIR, MISSION_CONTROL_DIR, RECEIPTS_DIR, LOG_DIR):
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


def extract_ts(value: Any) -> Optional[datetime]:
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


def normalize_state(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        payload = {}
    day = str(payload.get('day') or today_utc()).strip()
    if not day:
        day = today_utc()
    if day != today_utc():
        return {
            'day': today_utc(),
            'channelDispatchCounts': {},
            'channelFailureStreaks': payload.get('channelFailureStreaks') if isinstance(payload.get('channelFailureStreaks'), dict) else {},
            'channelCooldownUntil': payload.get('channelCooldownUntil') if isinstance(payload.get('channelCooldownUntil'), dict) else {},
            'recentContentHashes': {},
        }
    return {
        'day': day,
        'channelDispatchCounts': payload.get('channelDispatchCounts') if isinstance(payload.get('channelDispatchCounts'), dict) else {},
        'channelFailureStreaks': payload.get('channelFailureStreaks') if isinstance(payload.get('channelFailureStreaks'), dict) else {},
        'channelCooldownUntil': payload.get('channelCooldownUntil') if isinstance(payload.get('channelCooldownUntil'), dict) else {},
        'recentContentHashes': payload.get('recentContentHashes') if isinstance(payload.get('recentContentHashes'), dict) else {},
    }


def is_safe_copy(text: str) -> bool:
    return not any(pattern.search(text) for pattern in UNSAFE_PATTERNS)


def channel_config() -> dict[str, dict[str, Any]]:
    telegram_token = os.getenv('TELEGRAM_XPOST_BOT_TOKEN', '').strip() or os.getenv('TELEGRAM_BOT_TOKEN', '').strip()
    telegram_chat_id = os.getenv('KYO_TELEGRAM_CHAT_ID', '').strip()
    return {
        'discord': {
            'enabled': bool(os.getenv('DISCORD_WEBHOOK_URL', '').strip()),
            'webhook': os.getenv('DISCORD_WEBHOOK_URL', '').strip(),
        },
        'slack': {
            'enabled': bool(os.getenv('SLACK_WEBHOOK_URL', '').strip()),
            'webhook': os.getenv('SLACK_WEBHOOK_URL', '').strip(),
        },
        'telegram': {
            'enabled': bool(telegram_token and telegram_chat_id),
            'token': telegram_token,
            'chatId': telegram_chat_id,
        },
        'x': {
            'enabled': False,
            'reason': 'x_dispatch_adapter_missing',
        },
    }


def send_webhook(url: str, payload: dict[str, Any]) -> tuple[bool, str]:
    data = json.dumps(payload, ensure_ascii=True).encode('utf-8')
    req = urllib.request.Request(
        url=url,
        data=data,
        headers={'content-type': 'application/json', 'accept': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_SECONDS) as response:
            status = int(response.status)
        if 200 <= status < 300:
            return True, ''
        return False, f'http_{status}'
    except urllib.error.HTTPError as exc:
        return False, f'http_{exc.code}'
    except Exception as exc:
        return False, str(exc)[:240]


def send_telegram(token: str, chat_id: str, text: str) -> tuple[bool, str]:
    url = f'https://api.telegram.org/bot{token}/sendMessage'
    payload = {'chat_id': chat_id, 'text': text, 'disable_web_page_preview': True}
    return send_webhook(url, payload)


def dispatch(channel: str, message: str, channels: dict[str, dict[str, Any]]) -> tuple[bool, str]:
    config = channels.get(channel, {})
    if not config.get('enabled'):
        return False, str(config.get('reason') or 'channel_unavailable')
    if channel == 'discord':
        return send_webhook(str(config.get('webhook')), {'content': message})
    if channel == 'slack':
        return send_webhook(str(config.get('webhook')), {'text': message})
    if channel == 'telegram':
        return send_telegram(str(config.get('token')), str(config.get('chatId')), message)
    return False, 'unsupported_channel'


def message_candidates(backlog_items: list[dict[str, Any]]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for row in backlog_items:
        if not isinstance(row, dict):
            continue
        task_type = str(row.get('type') or '').strip().lower()
        if task_type == 'clawmart_promo_blast':
            posts = row.get('posts')
            if not isinstance(posts, list):
                continue
            for post in posts:
                if not isinstance(post, dict):
                    continue
                text = str(post.get('text') or '').strip()
                if not text:
                    continue
                out.append(
                    {
                        'id': str(post.get('id') or row.get('id') or '').strip(),
                        'channel': str(post.get('channel') or 'x').strip().lower(),
                        'message': text,
                    }
                )
        if task_type == 'clawmart_outreach_sprint':
            targets = row.get('targets')
            if not isinstance(targets, list):
                continue
            for target in targets:
                if not isinstance(target, dict):
                    continue
                dm = str(target.get('dm') or '').strip()
                if not dm:
                    continue
                out.append(
                    {
                        'id': str(target.get('id') or row.get('id') or '').strip(),
                        'channel': 'telegram',
                        'message': dm,
                    }
                )
    return out


def is_cooldown(channel: str, state: dict[str, Any], now: datetime) -> bool:
    raw = state['channelCooldownUntil'].get(channel)
    ts = extract_ts(raw)
    if ts is None:
        return False
    return ts > now


def content_recent(channel: str, message: str, state: dict[str, Any], now: datetime) -> bool:
    digest = hashlib.sha1(message.encode('utf-8')).hexdigest()
    channel_map = state['recentContentHashes'].get(channel)
    if not isinstance(channel_map, dict):
        return False
    ts = extract_ts(channel_map.get(digest))
    if ts is None:
        return False
    return now - ts < timedelta(minutes=CONTENT_COOLDOWN_MINUTES)


def remember_content(channel: str, message: str, state: dict[str, Any], timestamp: str) -> None:
    digest = hashlib.sha1(message.encode('utf-8')).hexdigest()
    channel_map = state['recentContentHashes'].setdefault(channel, {})
    if not isinstance(channel_map, dict):
        channel_map = {}
        state['recentContentHashes'][channel] = channel_map
    channel_map[digest] = timestamp

    # keep only recent hashes
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=CONTENT_COOLDOWN_MINUTES * 2)
    for key, raw in list(channel_map.items()):
        ts = extract_ts(raw)
        if ts is None or ts < cutoff:
            del channel_map[key]


def run() -> int:
    ensure_dirs()
    started_at = now_iso()

    if not ENABLE_DISTRIBUTION_ENGINE:
        summary = {
            'ok': True,
            'status': 'disabled',
            'startedAt': started_at,
        }
        write_json(STATE_PATH, {'lastRunAt': now_iso(), 'lastStatus': summary})
        write_json(OUTPUT_PATH, summary)
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    backlog_payload = read_json(BACKLOG_PATH, {'items': []})
    backlog_items = backlog_payload.get('items') if isinstance(backlog_payload, dict) else []
    if not isinstance(backlog_items, list):
        backlog_items = []

    state = normalize_state(read_json(STATE_PATH, {}))
    now = datetime.now(timezone.utc)
    channels = channel_config()

    candidates = message_candidates(backlog_items)
    attempted = 0
    successful = 0
    failed = 0
    skipped = 0
    receipts_added = 0
    channel_stats: dict[str, dict[str, int]] = {}

    for item in candidates:
        raw_message = item['message'].strip()
        if not raw_message:
            skipped += 1
            continue

        if REQUIRE_SAFE_COPY and not is_safe_copy(raw_message):
            skipped += 1
            continue

        preferred = item['channel']
        route = [preferred] + [ch for ch in FALLBACK_ORDER if ch != preferred]
        dispatched = False
        last_error = 'no_channel_available'

        for channel in route:
            channel_state = channels.get(channel, {})
            if not channel_state or not channel_state.get('enabled'):
                last_error = str(channel_state.get('reason') or 'channel_unavailable')
                continue
            if is_cooldown(channel, state, now):
                last_error = 'channel_cooldown'
                continue

            current_count = int(state['channelDispatchCounts'].get(channel) or 0)
            if current_count >= MAX_DISPATCH_PER_CHANNEL_DAY:
                last_error = 'channel_daily_cap_reached'
                continue
            if content_recent(channel, raw_message, state, now):
                last_error = 'content_cooldown'
                continue

            attempted += 1
            ok, error = dispatch(channel, raw_message, channels)
            channel_stats.setdefault(channel, {'attempted': 0, 'successful': 0, 'failed': 0})
            channel_stats[channel]['attempted'] += 1

            receipt = {
                'at': now_iso(),
                'source': 'distribution',
                'taskId': item.get('id', ''),
                'channel': channel,
                'preferredChannel': preferred,
                'status': 'success' if ok else 'failed',
                'messageHash': hashlib.sha1(raw_message.encode('utf-8')).hexdigest(),
                'error': '' if ok else error,
            }
            append_json_line(DISPATCH_RECEIPTS_PATH, receipt)
            receipts_added += 1

            if ok:
                successful += 1
                channel_stats[channel]['successful'] += 1
                state['channelDispatchCounts'][channel] = current_count + 1
                state['channelFailureStreaks'][channel] = 0
                remember_content(channel, raw_message, state, receipt['at'])
                dispatched = True
                break

            failed += 1
            channel_stats[channel]['failed'] += 1
            streak = int(state['channelFailureStreaks'].get(channel) or 0) + 1
            state['channelFailureStreaks'][channel] = streak
            if streak >= FAILURE_THRESHOLD:
                cooldown_until = (now + timedelta(minutes=CHANNEL_COOLDOWN_MINUTES)).isoformat()
                state['channelCooldownUntil'][channel] = cooldown_until
                state['channelFailureStreaks'][channel] = 0
            last_error = error or 'dispatch_failed'

        if not dispatched:
            skipped += 1
            append_json_line(
                DISPATCH_RECEIPTS_PATH,
                {
                    'at': now_iso(),
                    'source': 'distribution',
                    'taskId': item.get('id', ''),
                    'channel': preferred,
                    'status': 'skipped',
                    'reason': last_error,
                    'messageHash': hashlib.sha1(raw_message.encode('utf-8')).hexdigest(),
                },
            )
            receipts_added += 1

    success_rate = (successful / attempted) if attempted > 0 else 0.0
    summary = {
        'ok': True,
        'status': 'ok',
        'startedAt': started_at,
        'at': now_iso(),
        'candidateMessages': len(candidates),
        'attempted': attempted,
        'successful': successful,
        'failed': failed,
        'skipped': skipped,
        'dispatchSuccessRate': round(success_rate, 6),
        'maxDispatchPerChannelDay': MAX_DISPATCH_PER_CHANNEL_DAY,
        'failureThreshold': FAILURE_THRESHOLD,
        'channelCooldownMinutes': CHANNEL_COOLDOWN_MINUTES,
        'contentCooldownMinutes': CONTENT_COOLDOWN_MINUTES,
        'channelStats': channel_stats,
        'receiptsAdded': receipts_added,
        'dispatchReceiptsPath': str(DISPATCH_RECEIPTS_PATH),
    }
    write_json(STATE_PATH, {**state, 'lastRunAt': now_iso(), 'lastStatus': summary})
    write_json(OUTPUT_PATH, summary)
    append_json_line(
        LOG_PATH,
        {
            'at': now_iso(),
            'event': 'distribution_engine',
            'attempted': attempted,
            'successful': successful,
            'failed': failed,
            'skipped': skipped,
            'successRate': round(success_rate, 6),
        },
    )
    print(json.dumps(summary, ensure_ascii=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(run())
