#!/usr/bin/env python3
import json
import os
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Optional

HOME_DIR = Path(os.environ.get('HOME', '~')).expanduser()
STATE_DIR = HOME_DIR / '.openclaw'
RUNTIME_DIR = STATE_DIR / 'workspace' / 'runtime'
SEED_DIR = RUNTIME_DIR / 'seed'
CONFIG_PATH = RUNTIME_DIR / 'marketplace-feeds.json'
ENV_FILE_PATH = STATE_DIR / '.env'


def parse_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}

    parsed: dict[str, str] = {}
    for line in path.read_text(encoding='utf-8').splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith('#') or '=' not in stripped:
            continue
        key, value = stripped.split('=', 1)
        key = key.strip()
        if not key:
            continue
        parsed[key] = value.strip().strip('"').strip("'")
    return parsed


def env_value(key: str, fallback: str = '') -> str:
    direct = os.environ.get(key)
    if direct is not None and direct.strip():
        return direct.strip()
    return fallback.strip()


def parse_bool(raw: Optional[str], default: bool) -> bool:
    if raw is None:
        return default
    value = raw.strip().lower()
    if value in {'1', 'true', 'yes', 'on'}:
        return True
    if value in {'0', 'false', 'no', 'off'}:
        return False
    return default


def ensure_runtime_dirs() -> None:
    for path in (RUNTIME_DIR, SEED_DIR):
        path.mkdir(parents=True, exist_ok=True)
        path.chmod(0o700)


def is_path_under(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def is_allowed_file_url(parsed: urllib.parse.ParseResult, allow_file_feeds_anywhere: bool) -> bool:
    if parsed.netloc not in {'', 'localhost'}:
        return False

    if allow_file_feeds_anywhere:
        return True

    raw_path = urllib.request.url2pathname(parsed.path)
    candidate = Path(raw_path).expanduser().resolve()
    return is_path_under(candidate, RUNTIME_DIR.resolve())


def normalize_live_url(raw: str, allow_insecure_http: bool, allow_file_feeds_anywhere: bool) -> tuple[str, bool]:
    candidate = raw.strip()
    if not candidate:
        return '', False

    parsed = urllib.parse.urlparse(candidate)
    scheme = parsed.scheme.lower()
    if scheme == 'https':
        return candidate, True
    if scheme == 'http' and allow_insecure_http:
        return candidate, True
    if scheme == 'file' and is_allowed_file_url(parsed, allow_file_feeds_anywhere):
        return candidate, True
    return '', False


def source_definition() -> list[dict[str, str]]:
    return [
        {
            'source': 'agent_ai',
            'live_url_key': 'KYO_AGENT_AI_FEED_URL',
            'api_key_env': 'KYO_AGENT_AI_API_KEY',
            'auth_header_key': 'KYO_AGENT_AI_AUTH_HEADER',
            'auth_prefix_key': 'KYO_AGENT_AI_AUTH_PREFIX',
            'seed_file': 'agent_ai.json',
        },
        {
            'source': 'relevance',
            'live_url_key': 'KYO_RELEVANCE_FEED_URL',
            'api_key_env': 'KYO_RELEVANCE_API_KEY',
            'auth_header_key': 'KYO_RELEVANCE_AUTH_HEADER',
            'auth_prefix_key': 'KYO_RELEVANCE_AUTH_PREFIX',
            'seed_file': 'relevance.json',
        },
        {
            'source': 'kore',
            'live_url_key': 'KYO_KORE_FEED_URL',
            'api_key_env': 'KYO_KORE_API_KEY',
            'auth_header_key': 'KYO_KORE_AUTH_HEADER',
            'auth_prefix_key': 'KYO_KORE_AUTH_PREFIX',
            'seed_file': 'kore.json',
        },
        {
            'source': 'x402',
            'live_url_key': 'KYO_X402_FEED_URL',
            'api_key_env': 'KYO_X402_API_KEY',
            'auth_header_key': 'KYO_X402_AUTH_HEADER',
            'auth_prefix_key': 'KYO_X402_AUTH_PREFIX',
            'seed_file': 'x402.json',
            'generated_file': str((RUNTIME_DIR / 'feeds' / 'x402-opportunities.json').resolve()),
            'generated_enabled_key': 'KYO_X402_GENERATED_FEED_ENABLED',
        },
        {
            'source': 'direct_api',
            'live_url_key': 'KYO_DIRECT_API_FEED_URL',
            'api_key_env': 'KYO_DIRECT_API_KEY',
            'auth_header_key': 'KYO_DIRECT_API_AUTH_HEADER',
            'auth_prefix_key': 'KYO_DIRECT_API_AUTH_PREFIX',
            'seed_file': 'direct_api.json',
        },
    ]


def build_config() -> tuple[dict[str, Any], dict[str, Any]]:
    file_env = parse_env_file(ENV_FILE_PATH)
    fallback_enabled = parse_bool(
        env_value('KYO_BOOTSTRAP_FEED_FALLBACK', file_env.get('KYO_BOOTSTRAP_FEED_FALLBACK', 'true')),
        True,
    )
    allow_insecure_http = parse_bool(
        env_value('KYO_ALLOW_INSECURE_HTTP_FEEDS', file_env.get('KYO_ALLOW_INSECURE_HTTP_FEEDS', 'false')),
        False,
    )
    allow_file_feeds_anywhere = parse_bool(
        env_value('KYO_ALLOW_FILE_FEEDS_ANYWHERE', file_env.get('KYO_ALLOW_FILE_FEEDS_ANYWHERE', 'false')),
        False,
    )

    feeds: list[dict[str, Any]] = []
    summary_items: list[dict[str, Any]] = []

    for source in source_definition():
        live_url_raw = env_value(source['live_url_key'], file_env.get(source['live_url_key'], ''))
        live_url, live_url_valid = normalize_live_url(live_url_raw, allow_insecure_http, allow_file_feeds_anywhere)
        auth_header = env_value(source['auth_header_key'], file_env.get(source['auth_header_key'], 'Authorization'))
        auth_prefix = env_value(source['auth_prefix_key'], file_env.get(source['auth_prefix_key'], 'Bearer'))
        seed_path = (SEED_DIR / source['seed_file']).resolve()
        has_seed = seed_path.exists()
        generated_enabled = parse_bool(
            env_value(source.get('generated_enabled_key', ''), file_env.get(source.get('generated_enabled_key', ''), 'true')),
            True,
        )
        generated_path_raw = source.get('generated_file', '').strip()
        generated_path = Path(generated_path_raw).resolve() if generated_path_raw else None
        has_generated = bool(generated_path and generated_path.exists())

        if live_url:
            entry = {
                'id': f"{source['source']}_live",
                'source': source['source'],
                'enabled': True,
                'url': live_url,
                'authHeader': auth_header,
                'authEnv': source['api_key_env'],
                'authPrefix': auth_prefix,
            }
            mode = 'live'
        elif has_generated and generated_enabled and generated_path is not None:
            entry = {
                'id': f"{source['source']}_generated",
                'source': source['source'],
                'enabled': True,
                'url': f'file://{generated_path}',
                'authHeader': auth_header,
                'authEnv': source['api_key_env'],
                'authPrefix': auth_prefix,
            }
            mode = 'generated'
        elif fallback_enabled and has_seed:
            entry = {
                'id': f"{source['source']}_bootstrap",
                'source': source['source'],
                'enabled': True,
                'url': f'file://{seed_path}',
                'authHeader': auth_header,
                'authEnv': source['api_key_env'],
                'authPrefix': auth_prefix,
            }
            mode = 'bootstrap'
        else:
            entry = {
                'id': f"{source['source']}_disabled",
                'source': source['source'],
                'enabled': False,
                'url': '',
                'authHeader': auth_header,
                'authEnv': source['api_key_env'],
                'authPrefix': auth_prefix,
            }
            mode = 'disabled'

        feeds.append(entry)
        summary_items.append(
            {
                'source': source['source'],
                'mode': mode,
                'enabled': entry['enabled'],
                'url': entry['url'],
                'hasSeed': has_seed,
                'hasGenerated': has_generated,
                'generatedEnabled': generated_enabled,
                'liveUrlSet': bool(live_url_raw),
                'liveUrlValid': live_url_valid,
            }
        )

    return {
        'feeds': feeds
    }, {
        'fallbackEnabled': fallback_enabled,
        'allowInsecureHttpFeeds': allow_insecure_http,
        'allowFileFeedsAnywhere': allow_file_feeds_anywhere,
        'sources': summary_items,
    }


def write_config(payload: dict[str, Any]) -> None:
    CONFIG_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + '\n', encoding='utf-8')
    os.chmod(CONFIG_PATH, 0o600)


def main() -> int:
    ensure_runtime_dirs()
    config, summary = build_config()
    write_config(config)
    print(json.dumps({'ok': True, 'configPath': str(CONFIG_PATH), **summary}, ensure_ascii=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
