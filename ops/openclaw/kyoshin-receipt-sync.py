#!/usr/bin/env python3
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

HOME_DIR = Path(os.environ.get('HOME', '~')).expanduser()
WORKSPACE = HOME_DIR / '.openclaw' / 'workspace'
RUNTIME_DIR = WORKSPACE / 'runtime'
STATE_DIR = RUNTIME_DIR / 'state'
RECEIPTS_DIR = RUNTIME_DIR / 'receipts'
LOG_DIR = RUNTIME_DIR / 'logs'

OUTPUT_PATH = RECEIPTS_DIR / 'execution-receipts.jsonl'
STATE_PATH = STATE_DIR / 'kyoshin-receipt-sync-state.json'
LOG_PATH = LOG_DIR / 'kyoshin-receipt-sync.jsonl'

MAX_BATCH = max(1, int(os.getenv('KYO_RECEIPT_SYNC_MAX_BATCH', '1000')))
SOL_PRICE_USD = max(0.000001, float(os.getenv('KYO_RECEIPT_SOL_PRICE_USD', '150')))
ESTIMATED_FEE_SOL = max(0.0, float(os.getenv('KYO_RECEIPT_ESTIMATED_FEE_SOL', '0.00001')))


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_dirs() -> None:
    for path in (WORKSPACE, RUNTIME_DIR, STATE_DIR, RECEIPTS_DIR, LOG_DIR):
        path.mkdir(parents=True, exist_ok=True)
        path.chmod(0o700)


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + '\n', encoding='utf-8')
    path.chmod(0o600)


def append_json_line(path: Path, payload: dict[str, Any]) -> None:
    with path.open('a', encoding='utf-8') as handle:
        handle.write(json.dumps(payload, ensure_ascii=True) + '\n')
    path.chmod(0o600)


def load_json(path: Path, fallback: dict[str, Any]) -> dict[str, Any]:
    if not path.exists():
        return fallback
    try:
        parsed = json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return fallback
    return parsed if isinstance(parsed, dict) else fallback


def as_float(value: Any) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except Exception:
            return 0.0
    return 0.0


def parse_db_path() -> Path | None:
    configured = os.getenv('KYO_KYOSHIN_DB_PATH', '').strip()
    if configured:
        candidate = Path(configured).expanduser()
        if candidate.is_file():
            return candidate
        return None

    fallback_candidates = [
        Path.cwd() / 'services' / 'kyoshin' / 'output' / 'kyoshin' / 'state.db',
        Path.cwd() / 'output' / 'kyoshin' / 'state.db',
        HOME_DIR / '.openclaw' / 'workspace' / 'runtime' / 'kyoshin' / 'state.db',
    ]
    for candidate in fallback_candidates:
        if candidate.is_file():
            return candidate
    return None


def table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1",
        (table,),
    ).fetchone()
    return row is not None


def read_rows(conn: sqlite3.Connection, cursor: int) -> tuple[list[sqlite3.Row], int]:
    row = conn.execute('SELECT COALESCE(MAX(rowid), 0) FROM swarm_jobs').fetchone()
    max_rowid = int(row[0] or 0) if row else 0
    safe_cursor = cursor if cursor <= max_rowid else 0
    rows = conn.execute(
        """
        SELECT
          rowid,
          id,
          agent_id,
          source,
          status,
          paid,
          payment_network,
          payment_amount_usd,
          revenue_sol,
          revenue_usd,
          error,
          executed_at
        FROM swarm_jobs
        WHERE rowid > ?
        ORDER BY rowid ASC
        LIMIT ?
        """,
        (safe_cursor, MAX_BATCH),
    ).fetchall()
    return rows, max_rowid


def normalize_receipt(row: sqlite3.Row) -> dict[str, Any] | None:
    status_raw = str(row['status'] or '').strip().lower()
    if status_raw not in {'executed', 'failed'}:
        return None

    payment_usd = as_float(row['payment_amount_usd'])
    payment_cost_sol = payment_usd / SOL_PRICE_USD if payment_usd > 0 else 0.0
    fee_cost_sol = ESTIMATED_FEE_SOL
    revenue_sol = as_float(row['revenue_sol'])
    revenue_usd = as_float(row['revenue_usd'])
    total_cost_sol = fee_cost_sol + payment_cost_sol
    profit_sol = revenue_sol - total_cost_sol

    return {
        'id': str(row['id'] or ''),
        'agentId': str(row['agent_id'] or ''),
        'source': str(row['source'] or ''),
        'status': 'success' if status_raw == 'executed' else 'failed',
        'executedAt': str(row['executed_at'] or now_iso()),
        'profitSol': round(profit_sol, 8),
        'revenueSol': round(revenue_sol, 8),
        'revenueUsd': round(revenue_usd, 8),
        'costSol': round(total_cost_sol, 8),
        'costBreakdown': {
            'feeSol': round(fee_cost_sol, 8),
            'x402PaymentSol': round(payment_cost_sol, 8),
            'x402PaymentUsd': round(payment_usd, 8),
        },
        'payment': {
            'paid': bool(row['paid']),
            'network': str(row['payment_network'] or ''),
            'amountUsd': round(payment_usd, 8),
        },
        'error': str(row['error'] or ''),
    }


def run() -> int:
    ensure_dirs()
    started_at = now_iso()
    state = load_json(STATE_PATH, {'lastRowId': 0, 'synced': 0})

    db_path = parse_db_path()
    if db_path is None:
        summary = {
            'ok': True,
            'status': 'skipped',
            'reason': 'db_path_missing',
            'startedAt': started_at,
        }
        write_json(STATE_PATH, {**state, 'lastRunAt': now_iso(), 'lastStatus': summary})
        print(json.dumps(summary, ensure_ascii=True))
        return 0

    conn: sqlite3.Connection | None = None
    try:
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        if not table_exists(conn, 'swarm_jobs'):
            summary = {
                'ok': True,
                'status': 'skipped',
                'reason': 'missing_swarm_jobs_table',
                'dbPath': str(db_path),
                'startedAt': started_at,
            }
            write_json(STATE_PATH, {**state, 'lastRunAt': now_iso(), 'lastStatus': summary})
            print(json.dumps(summary, ensure_ascii=True))
            return 0

        last_row_id = int(state.get('lastRowId') or 0)
        rows, max_rowid = read_rows(conn, last_row_id)
        appended = 0
        new_cursor = last_row_id

        if not OUTPUT_PATH.exists():
            OUTPUT_PATH.write_text('', encoding='utf-8')
            OUTPUT_PATH.chmod(0o600)

        for row in rows:
            new_cursor = int(row['rowid'])
            receipt = normalize_receipt(row)
            if not receipt:
                continue
            append_json_line(OUTPUT_PATH, receipt)
            appended += 1

        synced_total = int(state.get('synced') or 0) + appended
        summary = {
            'ok': True,
            'status': 'ok',
            'dbPath': str(db_path),
            'startedAt': started_at,
            'syncedRows': len(rows),
            'appendedReceipts': appended,
            'lastRowId': new_cursor,
            'maxRowId': max_rowid,
            'syncedTotal': synced_total,
            'outputPath': str(OUTPUT_PATH),
        }

        write_json(
            STATE_PATH,
            {
                'lastRowId': new_cursor,
                'maxRowId': max_rowid,
                'synced': synced_total,
                'lastRunAt': now_iso(),
                'lastStatus': summary,
            },
        )
        append_json_line(
            LOG_PATH,
            {
                'at': now_iso(),
                'event': 'kyoshin_receipt_sync',
                'ok': True,
                'syncedRows': len(rows),
                'appendedReceipts': appended,
                'lastRowId': new_cursor,
            },
        )
        print(json.dumps(summary, ensure_ascii=True))
        return 0
    except Exception as exc:
        summary = {
            'ok': False,
            'status': 'error',
            'error': str(exc)[:240],
            'startedAt': started_at,
            'dbPath': str(db_path),
        }
        write_json(STATE_PATH, {**state, 'lastRunAt': now_iso(), 'lastStatus': summary})
        append_json_line(
            LOG_PATH,
            {
                'at': now_iso(),
                'event': 'kyoshin_receipt_sync',
                'ok': False,
                'error': summary['error'],
            },
        )
        print(json.dumps(summary, ensure_ascii=True))
        return 1
    finally:
        try:
            if conn is not None:
                conn.close()
        except Exception:
            pass


if __name__ == '__main__':
    raise SystemExit(run())
