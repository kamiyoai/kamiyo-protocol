import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { updateLatestAgentRunReceipt, type DB } from '@kamiyo-org/agent';

type DocsDatabase = DB & { close(): void };

function resolveDocsDbPath(dbPath: string): string {
  const resolved = path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  return resolved;
}

function openDocsDatabase(dbPath: string): DocsDatabase {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3') as new (filename: string) => DocsDatabase;
  return new Database(resolveDocsDbPath(dbPath));
}

function parsePrNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function main() {
  const [mergeSha, branch, prUrl, prNumberRaw] = process.argv.slice(2);
  if (!mergeSha) {
    console.error('[docs-agent] update-ledger requires merge SHA');
    process.exit(1);
  }

  const dbPath = process.env.DOCS_AGENT_DB_PATH || '.docs-agent/agent.db';
  const db = openDocsDatabase(dbPath);
  try {
    const updated = updateLatestAgentRunReceipt(
      db,
      {
        service: 'kamiyo-docs-agent',
        subjectType: 'merge',
        subjectId: mergeSha,
      },
      {
        receipt: {
          followUpBranch: branch || null,
          followUpPrUrl: prUrl || null,
          followUpPrNumber: parsePrNumber(prNumberRaw),
        },
        reconcileAfter: prUrl ? Math.floor(Date.now() / 1000) + 4 * 60 * 60 : null,
      }
    );

    if (!updated) {
      console.warn(`[docs-agent] no ledger receipt found for merge ${mergeSha}`);
      return;
    }

    console.log(
      `[docs-agent] ledger updated for ${mergeSha}: branch=${branch || 'none'} pr=${prUrl || 'none'}`
    );
  } finally {
    db.close();
  }
}

main();
