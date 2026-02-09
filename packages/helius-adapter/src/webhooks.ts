import { createHmac, timingSafeEqual } from 'crypto';
import { HeliusWebhookPayload, KamiyoEvent, WebhookHandlerOptions, TransactionType } from './types';
import { KAMIYO_PROGRAM_ID, DEFAULTS, INSTRUCTION_DISCRIMINATORS } from './constants';
import bs58 from 'bs58';

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

export function parseWebhookPayload(payload: HeliusWebhookPayload[], programId: string = KAMIYO_PROGRAM_ID): KamiyoEvent[] {
  const events: KamiyoEvent[] = [];

  for (const tx of payload) {
    for (const ix of tx.instructions.filter((i) => i.programId === programId)) {
      const ev = parseIx(ix, tx);
      if (ev) events.push(ev);
    }
  }

  return events;
}

function parseIx(ix: HeliusWebhookPayload['instructions'][0], tx: HeliusWebhookPayload): KamiyoEvent | null {
  const decoded = decodeIxDataCandidates(ix.data);

  let data: Buffer | null = null;
  let ixType: TransactionType = 'unknown';

  for (const cand of decoded) {
    const t = inferType(cand);
    if (t !== 'unknown') {
      data = cand;
      ixType = t;
      break;
    }
  }

  if (!data) return null;

  const accounts = ix.accounts;
  const ev: KamiyoEvent = {
    type: 'escrow_created',
    escrowPda: escrowForType(ixType, accounts) ?? '',
    sessionId: null,
    user: null,
    treasury: null,
    amount: null,
    rating: null,
    qualityScore: null,
    refundPercentage: null,
    paymentAmount: null,
    refundAmount: null,
    signature: tx.signature,
    timestamp: tx.timestamp,
    slot: tx.slot,
  };

  switch (ixType) {
    case 'create_escrow': {
      ev.type = 'escrow_created';
      ev.user = accounts[0] ?? null;
      ev.treasury = accounts[1] ?? null;
      ev.escrowPda = accounts[2] ?? ev.escrowPda;
      ev.sessionId = data.length >= 40 ? data.subarray(8, 40).toString('hex') : null;
      ev.amount = data.length >= 48 ? data.readBigUInt64LE(40) : null;
      break;
    }
    case 'mark_disputed': {
      ev.type = 'dispute_initiated';
      ev.user = accounts[0] ?? null;
      ev.escrowPda = accounts[1] ?? ev.escrowPda;
      break;
    }
    case 'finalize_dispute': {
      ev.type = 'dispute_resolved';
      ev.user = accounts[0] ?? null;
      ev.treasury = accounts[1] ?? null;
      ev.escrowPda = accounts[2] ?? ev.escrowPda;
      ev.paymentAmount = extractTransferAmount(tx, ev.escrowPda, ev.treasury ?? undefined);
      ev.refundAmount = extractTransferAmount(tx, ev.escrowPda, ev.user ?? undefined);
      ev.amount = ev.paymentAmount ?? null;
      break;
    }
    case 'rate_and_release': {
      ev.user = accounts[0] ?? null;
      ev.treasury = accounts[1] ?? null;
      ev.escrowPda = accounts[2] ?? ev.escrowPda;
      ev.rating = data.length >= 9 ? data.readUInt8(8) : null;

      if (ev.rating !== null && ev.rating >= 3) {
        ev.type = 'funds_released';
        ev.paymentAmount = extractTransferAmount(tx, ev.escrowPda, ev.treasury ?? undefined);
        ev.amount = ev.paymentAmount ?? null;
      } else {
        ev.type = 'funds_refunded';
        ev.refundAmount = extractTransferAmount(tx, ev.escrowPda, ev.user ?? undefined);
        ev.amount = ev.refundAmount ?? null;
      }
      break;
    }
    case 'timeout_release': {
      ev.type = 'funds_released';
      ev.treasury = accounts[0] ?? null;
      ev.escrowPda = accounts[1] ?? ev.escrowPda;
      ev.paymentAmount = extractTransferAmount(tx, ev.escrowPda, ev.treasury ?? undefined);
      ev.amount = ev.paymentAmount ?? null;
      break;
    }
    case 'disputed_timeout_release': {
      ev.type = 'funds_refunded';
      ev.user = accounts[0] ?? null;
      ev.escrowPda = accounts[1] ?? ev.escrowPda;
      ev.refundAmount = extractTransferAmount(tx, ev.escrowPda, ev.user ?? undefined);
      ev.amount = ev.refundAmount ?? null;
      break;
    }
    default:
      return null;
  }

  return ev;
}

function inferType(data: Buffer): TransactionType {
  if (data.length < 8) return 'unknown';
  const disc = data.subarray(0, 8);
  for (const [name, expected] of Object.entries(INSTRUCTION_DISCRIMINATORS)) {
    if (disc.equals(expected)) return name.toLowerCase() as TransactionType;
  }
  return 'unknown';
}

function decodeIxDataCandidates(data: string): Buffer[] {
  const out: Buffer[] = [];

  try {
    const buf = Buffer.from(bs58.decode(data));
    if (bs58.encode(buf) === data && buf.length >= 8) out.push(buf);
  } catch {
    // ignore decode errors
  }

  try {
    const buf = Buffer.from(data, 'base64');
    const normalized = data.replace(/=+$/, '');
    const roundtrip = buf.toString('base64').replace(/=+$/, '');
    if (buf.length >= 8 && roundtrip === normalized) out.push(buf);
  } catch {
    // ignore decode errors
  }

  if (/^[0-9a-f]{16,}$/i.test(data) && data.length % 2 === 0) {
    try {
      const buf = Buffer.from(data, 'hex');
      if (buf.length >= 8 && buf.toString('hex') === data.toLowerCase()) out.push(buf);
    } catch {
      // ignore decode errors
    }
  }

  return out;
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

function escrowForType(type: TransactionType, accounts: string[]): string | null {
  switch (type) {
    case 'create_escrow':
    case 'rate_and_release':
    case 'finalize_dispute':
      return accounts[2] ?? null;
    case 'mark_disputed':
    case 'commit_vote':
    case 'reveal_vote':
    case 'timeout_release':
    case 'disputed_timeout_release':
      return accounts[1] ?? null;
    default:
      return accounts[0] ?? null;
  }
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

export function createWebhookHandler(opts: WebhookHandlerOptions, cfg?: { programId?: string }) {
  return async (req: Req, res: Res) => {
    try {
      let payload: HeliusWebhookPayload[];
      if (Array.isArray(req.body)) payload = req.body;
      else if (typeof req.body === 'string') payload = JSON.parse(req.body);
      else payload = [req.body as HeliusWebhookPayload];

      const events = parseWebhookPayload(payload, cfg?.programId);

      for (const ev of events) {
        try {
          switch (ev.type) {
            case 'escrow_created': await opts.onEscrowCreated?.(ev); break;
            case 'dispute_initiated': await opts.onDisputeInitiated?.(ev); break;
            case 'dispute_resolved': await opts.onDisputeResolved?.(ev); break;
            case 'funds_released': await opts.onFundsReleased?.(ev); break;
            case 'funds_refunded': await opts.onFundsRefunded?.(ev); break;
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

export function createVerifiedWebhookHandler(secret: string, opts: WebhookHandlerOptions, cfg?: { programId?: string }) {
  const handler = createWebhookHandler(opts, cfg);

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
    funds_refunded: 0,
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
