import http from 'http';
import fs from 'fs';
import path from 'path';
import { parseWebhookPayload, verifyWebhookSignature } from '../packages/helius-adapter/src/webhooks';

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

function readRawBody(req: http.IncomingMessage, limitBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on('data', (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buf.length;
      if (size > limitBytes) {
        reject(new Error(`Body too large (max ${limitBytes} bytes)`));
        req.destroy();
        return;
      }
      chunks.push(buf);
    });

    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function writeJson(res: http.ServerResponse, code: number, body: Json): void {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function getHeader(req: http.IncomingMessage, name: string): string | undefined {
  const key = name.toLowerCase();
  const val = req.headers[key];
  if (Array.isArray(val)) return val[0];
  return val;
}

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

function loadSeenIds(p: string): Set<string> {
  try {
    const txt = fs.readFileSync(p, 'utf8');
    return new Set(txt.split('\n').map((s) => s.trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

function appendLine(p: string, line: string): void {
  fs.appendFileSync(p, `${line}\n`);
}

function eventId(ev: { signature: string; type: string; escrowPda: string; transactionId: string | null }): string {
  return `${ev.signature}:${ev.type}:${ev.escrowPda}:${ev.transactionId ?? ''}`;
}

const PORT = Number.parseInt(process.env.PORT ?? '8787', 10);
const SECRET = process.env.HELIUS_WEBHOOK_SECRET ?? '';
const PROGRAM_ID = process.env.OBS_PROGRAM_ID ?? process.env.ESCROW_PROGRAM_ID;
const STORE_DIR = process.env.OBS_STORE_DIR ?? path.join('data', 'observatory');
const MAX_BODY_BYTES = Number.parseInt(process.env.MAX_BODY_BYTES ?? '5000000', 10);

ensureDir(STORE_DIR);
const eventsPath = path.join(STORE_DIR, 'events.ndjson');
const seenPath = path.join(STORE_DIR, 'seen.txt');
const seen = loadSeenIds(seenPath);

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      writeJson(res, 200, { ok: true });
      return;
    }

    if (req.method !== 'POST' || req.url !== '/webhooks/kamiyo') {
      writeJson(res, 404, { error: 'not found' });
      return;
    }

    const raw = await readRawBody(req, MAX_BODY_BYTES);

    if (SECRET) {
      const sig = getHeader(req, 'x-helius-signature') ?? getHeader(req, 'X-Helius-Signature');
      if (!sig) {
        writeJson(res, 401, { error: 'missing signature' });
        return;
      }

      if (!verifyWebhookSignature(raw, sig, SECRET)) {
        writeJson(res, 401, { error: 'invalid signature' });
        return;
      }
    }

    const body = JSON.parse(raw.toString('utf8'));
    const payload = Array.isArray(body) ? body : [body];
    const events = parseWebhookPayload(payload as any, PROGRAM_ID);

    let inserted = 0;
    for (const ev of events) {
      const id = eventId(ev);
      if (seen.has(id)) continue;
      seen.add(id);
      appendLine(seenPath, id);
      appendLine(eventsPath, JSON.stringify(ev));
      inserted++;
    }

    writeJson(res, 200, { ok: true, received: events.length, inserted });
  } catch (e) {
    writeJson(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`helius observatory listening on :${PORT}`);
});
