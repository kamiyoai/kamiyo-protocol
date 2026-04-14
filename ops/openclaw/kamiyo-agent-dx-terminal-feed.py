#!/usr/bin/env python3
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional, Tuple

HOME_DIR = Path(os.environ.get('HOME', '~')).expanduser()
WORKSPACE = HOME_DIR / '.openclaw' / 'workspace'
RUNTIME_DIR = WORKSPACE / 'runtime'
FEEDS_DIR = RUNTIME_DIR / 'feeds'
STATE_DIR = RUNTIME_DIR / 'state'
LOGS_DIR = RUNTIME_DIR / 'logs'

OUTPUT_PATH = FEEDS_DIR / 'dx-terminal-opportunities.json'
SUMMARY_PATH = STATE_DIR / 'dx-terminal-feed-state.json'
LOG_PATH = LOGS_DIR / 'dx-terminal-feed.jsonl'

API_BASE_URL = os.getenv('KYO_DX_TERMINAL_API_BASE_URL', 'https://api.terminal.markets/api/v1').strip()
USER_AGENT = os.getenv('KYO_DX_TERMINAL_USER_AGENT', 'kamiyo-agent-dx-terminal-feed/1.0').strip()
TIMEFRAME = os.getenv('KYO_DX_TERMINAL_TIMEFRAME', '15m').strip() or '15m'
TIMEOUT_SECONDS = float(os.getenv('KYO_DX_TERMINAL_TIMEOUT_SECONDS', '12'))
MAX_RESPONSE_BYTES = int(os.getenv('KYO_DX_TERMINAL_MAX_RESPONSE_BYTES', '2000000'))
MAX_OPPORTUNITIES = max(1, int(os.getenv('KYO_DX_TERMINAL_MAX_OPPORTUNITIES', '24')))
MAX_LEADERBOARD = max(0, int(os.getenv('KYO_DX_TERMINAL_MAX_LEADERBOARD', '8')))
MAX_TOKENS = max(0, int(os.getenv('KYO_DX_TERMINAL_MAX_TOKENS', '12')))
MIN_TOKEN_VOLUME_USD = max(0.0, float(os.getenv('KYO_DX_TERMINAL_MIN_TOKEN_VOLUME_USD', '5000')))
MIN_TOKEN_HOLDERS = max(0, int(os.getenv('KYO_DX_TERMINAL_MIN_TOKEN_HOLDERS', '50')))


def env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {'1', 'true', 'yes', 'on'}


DX_ENABLED = env_flag('KYO_DX_TERMINAL_ENABLED', True)
INCLUDE_OWNER_VAULT = env_flag('KYO_DX_TERMINAL_INCLUDE_OWNER_VAULT', True)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_dirs() -> None:
    for path in (WORKSPACE, RUNTIME_DIR, FEEDS_DIR, STATE_DIR, LOGS_DIR):
        path.mkdir(parents=True, exist_ok=True)
        path.chmod(0o700)


def normalize_api_base(raw: str) -> str:
    value = raw.strip()
    if not value:
        return 'https://api.terminal.markets/api/v1'
    return value.rstrip('/')


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + '\n', encoding='utf-8')
    path.chmod(0o600)


def append_log(payload: dict[str, Any]) -> None:
    with LOG_PATH.open('a', encoding='utf-8') as handle:
        handle.write(json.dumps(payload, ensure_ascii=True) + '\n')
    LOG_PATH.chmod(0o600)


def safe_float(value: Any) -> Optional[float]:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except Exception:
            return None
    return None


def safe_int(value: Any) -> Optional[int]:
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str):
        try:
            return int(value.strip())
        except Exception:
            return None
    return None


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def as_list(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    if isinstance(payload, dict):
        if isinstance(payload.get('items'), list):
            return [row for row in payload['items'] if isinstance(row, dict)]
        if isinstance(payload.get('data'), list):
            return [row for row in payload['data'] if isinstance(row, dict)]
    return []


def compact(value: dict[str, Any], max_bytes: int = 4500) -> dict[str, Any]:
    try:
        raw = json.dumps(value, ensure_ascii=True, separators=(',', ':'))
    except Exception:
        return {'truncated': True, 'reason': 'unserializable'}

    if len(raw) <= max_bytes:
        return value
    return {
        'truncated': True,
        'bytes': len(raw),
        'preview': raw[: max_bytes - 3] + '...',
    }


def fetch_json(path: str, params: Optional[dict[str, Any]] = None) -> Any:
    base = normalize_api_base(API_BASE_URL)
    query = ''
    if params:
        clean = {k: v for k, v in params.items() if v not in (None, '')}
        query = urllib.parse.urlencode(clean)
    url = f'{base}{path}'
    if query:
        url = f'{url}?{query}'

    req = urllib.request.Request(
        url,
        headers={
            'accept': 'application/json',
            'user-agent': USER_AGENT,
        },
        method='GET',
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as response:
        raw = response.read(MAX_RESPONSE_BYTES + 1)
    if len(raw) > MAX_RESPONSE_BYTES:
        raise ValueError('response_too_large')
    return json.loads(raw.decode('utf-8'))


def vault_web_url(vault_address: str) -> Optional[str]:
    clean = vault_address.strip()
    if not clean:
        return None
    return f'https://terminal.markets/vault/{clean}'


def build_leaderboard_opportunities(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    created_at = now_iso()

    for row in rows[:MAX_LEADERBOARD]:
        rank = safe_int(row.get('rank')) or (len(out) + 1)
        nft_name = str(row.get('nftName') or f'vault-{rank}').strip()
        vault_address = str(row.get('vaultAddress') or '').strip()
        owner_address = str(row.get('ownerAddress') or '').strip()
        total_pnl_usd = safe_float(row.get('totalPnlUsd')) or 0.0
        total_pnl_eth_wei = safe_float(row.get('totalPnlEth')) or 0.0
        total_pnl_eth = total_pnl_eth_wei / 1e18

        confidence = clamp(0.82 - (rank * 0.03), 0.5, 0.82)
        title = f'DX top vault signal: #{rank} {nft_name}'
        summary = (
            f'Watch DX leaderboard vault {nft_name} (rank {rank}) with total PnL '
            f'~${total_pnl_usd:,.2f} ({total_pnl_eth:.4f} ETH). '
            f'Use this as a directional signal, not blind copy-trading.'
        )

        out.append(
            {
                'id': f'dx-leaderboard-{rank}-{vault_address.lower()[:12] if vault_address else rank}',
                'source': 'dx_terminal',
                'title': title,
                'summary': summary,
                'url': vault_web_url(vault_address),
                'confidence': confidence,
                'tags': ['dx_terminal', 'leaderboard', 'signal'],
                'roleHints': ['trading', 'research'],
                'payoutUsd': None,
                'payoutSol': None,
                'createdAt': created_at,
                'expiresAt': None,
                'metadata': {
                    'source': 'dx_terminal_leaderboard',
                    'rank': rank,
                    'vaultAddress': vault_address or None,
                    'ownerAddress': owner_address or None,
                    'totalPnlUsd': total_pnl_usd,
                    'totalPnlEthWei': row.get('totalPnlEth'),
                    'marketplaceRecord': compact(row),
                },
            }
        )
    return out


def token_timeframe_record(token: dict[str, Any]) -> dict[str, Any]:
    market_data = token.get('marketData')
    if not isinstance(market_data, dict):
        return {}
    record = market_data.get(TIMEFRAME)
    if isinstance(record, dict):
        return record
    return {}


def build_token_opportunities(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ranked: list[tuple[float, dict[str, Any], dict[str, Any], float, float, int]] = []

    for row in rows:
        if not isinstance(row, dict):
            continue
        market_data = row.get('marketData')
        if not isinstance(market_data, dict):
            continue

        timeframe = token_timeframe_record(row)
        volume_usd = safe_float(timeframe.get('volumeUsd'))
        if volume_usd is None:
            volume_usd = safe_float(timeframe.get('volumeUSD'))
        if volume_usd is None or volume_usd < MIN_TOKEN_VOLUME_USD:
            continue

        holder_count = safe_int(market_data.get('holderCount')) or 0
        if holder_count < MIN_TOKEN_HOLDERS:
            continue

        price_change = safe_float(timeframe.get('priceChangePercent')) or 0.0
        momentum = abs(price_change)
        score = volume_usd + (momentum * 200.0)
        ranked.append((score, row, timeframe, volume_usd, price_change, holder_count))

    ranked.sort(key=lambda item: item[0], reverse=True)
    created_at = now_iso()
    out: list[dict[str, Any]] = []

    for score, row, timeframe, volume_usd, price_change, holder_count in ranked[:MAX_TOKENS]:
        symbol = str(row.get('symbol') or row.get('name') or 'token').strip()
        name = str(row.get('name') or symbol).strip()
        token_address = str(row.get('tokenAddress') or '').strip()
        price_usd = safe_float((row.get('marketData') or {}).get('priceUsd')) or 0.0
        buy_count = safe_int(timeframe.get('buyCount')) or 0
        sell_count = safe_int(timeframe.get('sellCount')) or 0
        confidence = clamp(0.42 + min(volume_usd / 250000.0, 0.28) + min(abs(price_change) / 120.0, 0.16), 0.42, 0.86)
        direction = 'up' if price_change >= 0 else 'down'

        out.append(
            {
                'id': f'dx-token-{token_address.lower()[:14] if token_address else symbol.lower()}',
                'source': 'dx_terminal',
                'title': f'DX token flow: {symbol}',
                'summary': (
                    f'{name} moved {direction} {price_change:.2f}% on {TIMEFRAME} with '
                    f'~${volume_usd:,.2f} volume, holders={holder_count}, and '
                    f'buy/sell={buy_count}/{sell_count}.'
                ),
                'url': f'https://api.terminal.markets/api/v1/candles/{token_address}?timeframe={TIMEFRAME}' if token_address else None,
                'confidence': confidence,
                'tags': ['dx_terminal', 'token', 'momentum', 'flow'],
                'roleHints': ['trading', 'research'],
                'payoutUsd': None,
                'payoutSol': None,
                'createdAt': created_at,
                'expiresAt': None,
                'metadata': {
                    'source': 'dx_terminal_tokens',
                    'tokenAddress': token_address or None,
                    'symbol': symbol,
                    'priceUsd': price_usd,
                    'timeframe': TIMEFRAME,
                    'volumeUsd': volume_usd,
                    'priceChangePercent': price_change,
                    'holderCount': holder_count,
                    'score': score,
                    'marketplaceRecord': compact(row),
                },
            }
        )

    return out


def build_owner_vault_opportunity(owner_address: str) -> Tuple[Optional[dict[str, Any]], Optional[str]]:
    owner = owner_address.strip()
    if not owner:
        return None, None

    try:
        vault = fetch_json('/vault', {'ownerAddress': owner})
        if not isinstance(vault, dict):
            return None, 'invalid_vault_payload'
        vault_address = str(vault.get('vaultAddress') or '').strip()
        if not vault_address:
            return None, 'missing_vault_address'

        positions = fetch_json(f'/positions/{vault_address}')
        if not isinstance(positions, dict):
            return None, 'invalid_positions_payload'

        total_pnl_usd = safe_float(positions.get('overallPnlUsd')) or 0.0
        total_value_usd = safe_float(positions.get('overallValueUsd')) or 0.0
        pnl_percent = safe_float(positions.get('overallPnlPercent')) or 0.0
        position_rows = positions.get('positions') if isinstance(positions.get('positions'), list) else []
        top_position = position_rows[0] if position_rows else {}
        top_symbol = str(top_position.get('tokenSymbol') or top_position.get('tokenName') or '').strip()
        paused = bool(vault.get('paused'))

        summary = (
            f'Owner vault snapshot value=${total_value_usd:,.2f}, pnl=${total_pnl_usd:,.2f} '
            f'({pnl_percent:.2f}%), paused={str(paused).lower()}.'
        )
        if top_symbol:
            summary += f' Largest visible position: {top_symbol}.'

        opportunity = {
            'id': f'dx-owner-vault-{vault_address.lower()[:16]}',
            'source': 'dx_terminal',
            'title': 'DX owner vault risk check',
            'summary': summary,
            'url': vault_web_url(vault_address),
            'confidence': 0.74,
            'tags': ['dx_terminal', 'vault', 'risk'],
            'roleHints': ['ops', 'trading'],
            'payoutUsd': None,
            'payoutSol': None,
            'createdAt': now_iso(),
            'expiresAt': None,
            'metadata': {
                'source': 'dx_terminal_owner_vault',
                'ownerAddress': owner,
                'vaultAddress': vault_address,
                'paused': paused,
                'maxTradeAmount': safe_int(vault.get('maxTradeAmount')),
                'slippageBps': safe_int(vault.get('slippageBps')),
                'tradingActivity': safe_int(vault.get('tradingActivity')),
                'assetRiskPreference': safe_int(vault.get('assetRiskPreference')),
                'tradeSize': safe_int(vault.get('tradeSize')),
                'holdingStyle': safe_int(vault.get('holdingStyle')),
                'diversification': safe_int(vault.get('diversification')),
                'overallValueUsd': total_value_usd,
                'overallPnlUsd': total_pnl_usd,
                'overallPnlPercent': pnl_percent,
                'marketplaceRecord': {
                    'vault': compact(vault),
                    'positions': compact(positions),
                },
            },
        }
        return opportunity, None
    except urllib.error.HTTPError as exc:
        return None, f'http_{exc.code}'
    except urllib.error.URLError as exc:
        return None, f'url_error:{exc.reason}'
    except Exception as exc:
        return None, str(exc)


def dedupe_ranked(opportunities: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ranked = sorted(
        opportunities,
        key=lambda row: float(row.get('confidence') or 0.0),
        reverse=True,
    )
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in ranked:
        key = str(row.get('id') or '').strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(row)
        if len(out) >= MAX_OPPORTUNITIES:
            break
    return out


def run() -> int:
    ensure_dirs()
    started_at = now_iso()

    if not DX_ENABLED:
        payload = {
            'ok': True,
            'disabled': True,
            'at': now_iso(),
            'startedAt': started_at,
            'discovered': 0,
            'accepted': 0,
            'opportunities': [],
            'sourceStats': [],
            'errors': [],
            'outputPath': str(OUTPUT_PATH),
        }
        write_json(OUTPUT_PATH, payload)
        write_json(SUMMARY_PATH, {k: v for k, v in payload.items() if k != 'opportunities'})
        append_log({'at': payload['at'], 'event': 'dx_terminal_feed', 'ok': True, 'disabled': True, 'accepted': 0})
        print(json.dumps({'ok': True, 'disabled': True, 'accepted': 0, 'outputPath': str(OUTPUT_PATH)}, ensure_ascii=True))
        return 0

    all_opportunities: list[dict[str, Any]] = []
    source_stats: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    source_ok = 0

    try:
        leaderboard_payload = fetch_json('/leaderboard', {'limit': MAX_LEADERBOARD, 'sortBy': 'total_pnl_usd'})
        leaderboard_rows = as_list(leaderboard_payload)
        leaderboard_opps = build_leaderboard_opportunities(leaderboard_rows)
        all_opportunities.extend(leaderboard_opps)
        source_ok += 1
        source_stats.append({'source': 'leaderboard', 'fetched': len(leaderboard_rows), 'discovered': len(leaderboard_opps), 'error': None})
    except urllib.error.HTTPError as exc:
        source_stats.append({'source': 'leaderboard', 'fetched': 0, 'discovered': 0, 'error': f'http_{exc.code}'})
        errors.append({'source': 'leaderboard', 'error': f'http_{exc.code}'})
    except urllib.error.URLError as exc:
        source_stats.append({'source': 'leaderboard', 'fetched': 0, 'discovered': 0, 'error': f'url_error:{exc.reason}'})
        errors.append({'source': 'leaderboard', 'error': f'url_error:{exc.reason}'})
    except Exception as exc:
        source_stats.append({'source': 'leaderboard', 'fetched': 0, 'discovered': 0, 'error': str(exc)})
        errors.append({'source': 'leaderboard', 'error': str(exc)})

    try:
        tokens_payload = fetch_json('/tokens', {'includeMarketData': 'true'})
        token_rows = as_list(tokens_payload)
        token_opps = build_token_opportunities(token_rows)
        all_opportunities.extend(token_opps)
        source_ok += 1
        source_stats.append({'source': 'tokens', 'fetched': len(token_rows), 'discovered': len(token_opps), 'error': None})
    except urllib.error.HTTPError as exc:
        source_stats.append({'source': 'tokens', 'fetched': 0, 'discovered': 0, 'error': f'http_{exc.code}'})
        errors.append({'source': 'tokens', 'error': f'http_{exc.code}'})
    except urllib.error.URLError as exc:
        source_stats.append({'source': 'tokens', 'fetched': 0, 'discovered': 0, 'error': f'url_error:{exc.reason}'})
        errors.append({'source': 'tokens', 'error': f'url_error:{exc.reason}'})
    except Exception as exc:
        source_stats.append({'source': 'tokens', 'fetched': 0, 'discovered': 0, 'error': str(exc)})
        errors.append({'source': 'tokens', 'error': str(exc)})

    owner_address = os.getenv('KYO_DX_TERMINAL_OWNER_ADDRESS', '').strip()
    if INCLUDE_OWNER_VAULT and owner_address:
        owner_opp, owner_error = build_owner_vault_opportunity(owner_address)
        if owner_opp:
            source_ok += 1
            all_opportunities.append(owner_opp)
            source_stats.append({'source': 'owner_vault', 'ownerAddress': owner_address, 'fetched': 1, 'discovered': 1, 'error': None})
        else:
            source_stats.append({'source': 'owner_vault', 'ownerAddress': owner_address, 'fetched': 0, 'discovered': 0, 'error': owner_error or 'unknown_error'})
            errors.append({'source': 'owner_vault', 'error': owner_error or 'unknown_error'})

    opportunities = dedupe_ranked(all_opportunities)
    ok = source_ok > 0

    output = {
        'ok': ok,
        'at': now_iso(),
        'startedAt': started_at,
        'discovered': len(all_opportunities),
        'accepted': len(opportunities),
        'opportunities': opportunities,
        'sourceStats': source_stats,
        'errors': errors,
        'outputPath': str(OUTPUT_PATH),
    }
    write_json(OUTPUT_PATH, output)
    write_json(SUMMARY_PATH, {k: v for k, v in output.items() if k != 'opportunities'})
    append_log(
        {
            'at': output['at'],
            'event': 'dx_terminal_feed',
            'ok': ok,
            'accepted': len(opportunities),
            'discovered': len(all_opportunities),
            'sources': len(source_stats),
            'errors': len(errors),
        }
    )

    print(
        json.dumps(
            {
                'ok': ok,
                'accepted': len(opportunities),
                'discovered': len(all_opportunities),
                'outputPath': str(OUTPUT_PATH),
                'sourceStats': source_stats,
                'errors': errors,
            },
            ensure_ascii=True,
        )
    )
    return 0


if __name__ == '__main__':
    raise SystemExit(run())
