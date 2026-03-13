#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def format_sol(value: float) -> str:
    text = f'{value:.9f}'.rstrip('0').rstrip('.')
    return text if text else '0'


def _bridge_script_path() -> Path:
    return Path(__file__).resolve().parent / 'bridges' / 'kyoshin-fundry-staking-deposit.mjs'


def run_fundry_staking_deposit(
    *,
    amount_sol: float,
    pool_url: str,
    keypair_path: str,
    rpc_url: str,
    dry_run: bool,
    timeout_seconds: int,
    admin_keypair_path: str = '',
) -> dict[str, Any]:
    if amount_sol <= 0:
        raise RuntimeError('route_amount_invalid')

    if dry_run:
        return {
            'method': 'staking_period_deposit_dry_run',
            'txSignature': f'dry-run-{int(datetime.now(timezone.utc).timestamp())}',
            'routedSol': amount_sol,
            'dryRun': True,
        }

    bridge_script = _bridge_script_path()
    if not bridge_script.exists():
        raise RuntimeError('missing_fundry_staking_bridge')

    node_bin = shutil.which('node')
    if not node_bin:
        raise RuntimeError('missing_node_runtime')

    if not keypair_path:
        raise RuntimeError('missing_staking_keypair_path')
    keypair = Path(keypair_path).expanduser()
    if not keypair.exists():
        raise RuntimeError('staking_keypair_not_found')

    env = os.environ.copy()
    env.update(
        {
            'KYO_FUNDRY_STAKING_POOL_URL': pool_url,
            'KYO_FUNDRY_DEPOSIT_AMOUNT_SOL': format_sol(amount_sol),
            'KYO_FUNDRY_DEPOSIT_KEYPAIR_PATH': str(keypair),
            'KYO_FUNDRY_DEPOSIT_RPC_URL': rpc_url.strip(),
            'KYO_FUNDRY_DEPOSIT_DRY_RUN': 'false',
        }
    )
    if admin_keypair_path:
        admin_keypair = Path(admin_keypair_path).expanduser()
        if not admin_keypair.exists():
            raise RuntimeError('staking_admin_keypair_not_found')
        env['KYO_FUNDRY_DEPOSIT_ADMIN_KEYPAIR_PATH'] = str(admin_keypair)

    proc = subprocess.run(
        [node_bin, str(bridge_script)],
        capture_output=True,
        text=True,
        timeout=timeout_seconds,
        env=env,
        check=False,
    )
    if proc.returncode != 0:
        message = (proc.stderr or proc.stdout or f'fundry_staking_deposit_exit_{proc.returncode}').strip()
        raise RuntimeError(message[:500] or 'fundry_staking_deposit_failed')

    payload = None
    for line in reversed((proc.stdout or '').splitlines()):
        stripped = line.strip()
        if not stripped:
            continue
        try:
            decoded = json.loads(stripped)
        except Exception:
            continue
        if isinstance(decoded, dict):
            payload = decoded
            break
    if payload is None:
        raise RuntimeError('fundry_staking_deposit_invalid_json')

    signature = str(payload.get('txSignature') or payload.get('signature') or '').strip()
    if not signature:
        raise RuntimeError('fundry_staking_deposit_missing_tx_signature')

    routed_sol_raw = payload.get('routedSol')
    try:
        routed_sol = float(routed_sol_raw) if routed_sol_raw is not None else amount_sol
    except Exception:
        routed_sol = amount_sol
    return {
        'method': str(payload.get('method') or 'staking_period_deposit'),
        'txSignature': signature,
        'routedSol': max(0.0, routed_sol),
        'stakingPeriod': str(payload.get('stakingPeriod') or '').strip(),
        'periodVault': str(payload.get('periodVault') or '').strip(),
        'periodNumber': str(payload.get('periodNumber') or '').strip(),
        'createSignature': str(payload.get('createSignature') or '').strip(),
        'activateSignature': str(payload.get('activateSignature') or '').strip(),
        'at': str(payload.get('at') or now_iso()),
    }
