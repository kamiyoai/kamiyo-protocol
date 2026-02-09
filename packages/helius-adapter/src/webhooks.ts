import { createHmac, timingSafeEqual } from 'crypto';
import { HeliusWebhookPayload, KamiyoEvent, WebhookHandlerOptions } from './types';
import { KAMIYO_PROGRAM_ID, DEFAULTS, INSTRUCTION_DISCRIMINATORS } from './constants';

export function verifyWebhookSignature(payload: string | Buffer, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(payload).digest();
  const sig = signature.trim().replace(/^sha256=/i, '');

  if (!/^[0-9a-f]{64}$/i.test(sig)) return false;

  const provided = Buffer.from(sig, 'hex');
  try {
    return timingSafeEqual(provided, expected);
  } catch {
    return false;
  }
}

export function parseWebhookPayload(payload: HeliusWebhookPayload[]): KamiyoEvent[] {
  const events: KamiyoEvent[] = [];

  for (const tx of payload) {
    for (const ix of tx.instructions.filter((i) => i.programId === KAMIYO_PROGRAM_ID)) {
      const ev = parseIx(ix, tx);
      if (ev) events.push(ev);
    }
  }

  return events;
}

function parseIx(ix: HeliusWebhookPayload['instructions'][0], tx: HeliusWebhookPayload): KamiyoEvent | null {
  const data = decodeIxData(ix.data);
  if (!data || data.length < 8) return null;

  const type = identifyType(data.slice(0, 8));
  if (!type) return null;

  const accounts = ix.accounts;
  const ev: KamiyoEvent = {
    type,
    escrowPda: accounts[0] ?? '',
    transactionId: null,
    agent: null,
    api: null,
    amount: null,
    qualityScore: null,
    refundPercentage: null,
    refundAmount: null,
    signature: tx.signature,
    timestamp: tx.timestamp,
    slot: tx.slot,
  };

  switch (type) {
    case 'escrow_created': {
      ev.agent = accounts[1] ?? null;
      ev.api = accounts[2] ?? null;
      ev.amount = data.length >= 16 ? data.readBigUInt64LE(8) : null;
      ev.transactionId = extractString(data, 24);
      break;
    }
    case 'dispute_initiated': {
      ev.agent = accounts[2] ?? null;
      break;
    }
    case 'dispute_resolved': {
      ev.agent = accounts[1] ?? null;
      ev.api = accounts[2] ?? null;
      ev.qualityScore = data.length >= 9 ? data.readUInt8(8) : null;
      ev.refundPercentage = data.length >= 10 ? data.readUInt8(9) : null;
      ev.amount = extractTransferAmount(tx, accounts[0], accounts[2]);
      ev.refundAmount = extractTransferAmount(tx, accounts[0], accounts[1]);
      break;
    }
    case 'funds_released': {
      ev.agent = accounts[1] ?? null;
      ev.api = accounts[2] ?? null;
      ev.amount = extractTransferAmount(tx, accounts[0], accounts[2]);
      break;
    }
  }

  return ev;
}

function identifyType(disc: Buffer): KamiyoEvent['type'] | null {
  if (disc.equals(INSTRUCTION_DISCRIMINATORS.INITIALIZE_ESCROW)) return 'escrow_created';
  if (disc.equals(INSTRUCTION_DISCRIMINATORS.MARK_DISPUTED)) return 'dispute_initiated';
  if (disc.equals(INSTRUCTION_DISCRIMINATORS.RESOLVE_DISPUTE)) return 'dispute_resolved';
  if (disc.equals(INSTRUCTION_DISCRIMINATORS.RESOLVE_DISPUTE_SWITCHBOARD)) return 'dispute_resolved';
  if (disc.equals(INSTRUCTION_DISCRIMINATORS.RELEASE_FUNDS)) return 'funds_released';
  return null;
}

function decodeIxData(data: string): Buffer | null {
  try {
    const d = Buffer.from(data, 'base64');
    if (d.length >= 8) return d;
  } catch {}

  try {
    const d = Buffer.from(data, 'hex');
    if (d.length >= 8) return d;
  } catch {}

  return null;
}

function extractString(buf: Buffer, offset: number): string | null {
  if (buf.length < offset + 4) return null;
  const len = buf.readUInt32LE(offset);
  const start = offset + 4;
  const end = start + len;
  if (len > 512 || buf.length < end) return null;
  return buf.slice(start, end).toString('utf8');
}

function extractTransferAmount(
  tx: HeliusWebhookPayload,
  from: string | undefined,
  to: string | undefined
): bigint | null {
  if (!from || !to) return null;
  const match = tx.nativeTransfers.find((t) => t.fromUserAccount === from && t.toUserAccount === to);
  return match ? BigInt(match.amount) : null;
}

type Req = { body: unknown; rawBody?: string | Buffer; headers: Record<string, string | undefined> };
type Res = { status: (code: number) => { send: (msg: string) => void; json: (data: unknown) => void } };

function getHeader(headers: Record<string, string | undefined>, name: string): string | undefined {
  const direct = headers[name];
  if (direct) return direct;

  const lower = headers[name.toLowerCase()];
  if (lower) return lower;

  const wanted = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === wanted) return v;
  }

  return undefined;
}

export function createWebhookHandler(opts: WebhookHandlerOptions) {
  return async (req: Req, res: Res) => {
    try {
      let payload: HeliusWebhookPayload[];
      if (Array.isArray(req.body)) payload = req.body;
      else if (typeof req.body === 'string') payload = JSON.parse(req.body);
      else payload = [req.body as HeliusWebhookPayload];

      const events = parseWebhookPayload(payload);

      for (const ev of events) {
        try {
          switch (ev.type) {
            case 'escrow_created': await opts.onEscrowCreated?.(ev); break;
            case 'dispute_initiated': await opts.onDisputeInitiated?.(ev); break;
            case 'dispute_resolved': await opts.onDisputeResolved?.(ev); break;
            case 'funds_released': await opts.onFundsReleased?.(ev); break;
          }
        } catch (e) {
          opts.onError?.(e instanceof Error ? e : new Error(String(e)), payload[0]);
        }
      }

      res.status(200).json({ success: true, eventsProcessed: events.length });
    } catch (e) {
      res.status(500).json({ success: false, error: e instanceof Error ? e.message : 'Unknown' });
    }
  };
}

export function createVerifiedWebhookHandler(secret: string, opts: WebhookHandlerOptions) {
  const handler = createWebhookHandler(opts);

  return async (req: Req, res: Res) => {
    const sig = getHeader(req.headers, DEFAULTS.WEBHOOK_SIGNATURE_HEADER);
    if (!sig) return res.status(401).json({ success: false, error: 'Missing signature' });

    const payload = req.rawBody ?? (typeof req.body === 'string' ? req.body : undefined);
    if (!payload) {
      return res.status(400).json({
        success: false,
        error: 'Missing rawBody. Provide the raw request body for webhook signature verification.',
      });
    }

    if (!verifyWebhookSignature(payload, sig, secret)) {
      return res.status(401).json({ success: false, error: 'Invalid signature' });
    }

    return handler(req, res);
  };
}

export function filterEventsByType(events: KamiyoEvent[], types: KamiyoEvent['type'][]): KamiyoEvent[] {
  return events.filter((e) => types.includes(e.type));
}

export function groupEventsByEscrow(events: KamiyoEvent[]): Map<string, KamiyoEvent[]> {
  const grouped = new Map<string, KamiyoEvent[]>();
  for (const ev of events) {
    const list = grouped.get(ev.escrowPda) || [];
    list.push(ev);
    grouped.set(ev.escrowPda, list);
  }
  return grouped;
}

export function getEventStats(events: KamiyoEvent[]): {
  total: number;
  byType: Record<KamiyoEvent['type'], number>;
  uniqueEscrows: number;
  totalVolume: bigint;
  averageQualityScore: number | null;
} {
  const byType: Record<KamiyoEvent['type'], number> = {
    escrow_created: 0,
    dispute_initiated: 0,
    dispute_resolved: 0,
    funds_released: 0,
  };

  let vol = 0n;
  const scores: number[] = [];
  const escrows = new Set<string>();

  for (const ev of events) {
    byType[ev.type]++;
    escrows.add(ev.escrowPda);
    if (ev.amount) vol += ev.amount;
    if (ev.qualityScore !== null) scores.push(ev.qualityScore);
  }

  return {
    total: events.length,
    byType,
    uniqueEscrows: escrows.size,
    totalVolume: vol,
    averageQualityScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
  };
}

