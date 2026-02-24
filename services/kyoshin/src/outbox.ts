import fs from 'node:fs';
import path from 'node:path';

export function writeOutbox(outboxDir: string, kind: string, payload: unknown): string {
  fs.mkdirSync(outboxDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const filename = `${ts}-${kind}-${id}.json`;
  const filePath = path.join(outboxDir, filename);

  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  return filePath;
}
