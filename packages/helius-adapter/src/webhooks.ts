import { createHmac, timingSafeEqual } from 'crypto';
import { HeliusWebhookPayload, KamiyoEvent, WebhookHandlerOptions } from './types';
import { KAMIYO_PROGRAM_ID, DEFAULTS, INSTRUCTION_DISCRIMINATORS } from './constants';

export function verifyWebhookSignature(payload: string | Buffer, signature: string, secret: string): boolean {
  const str = typeof payload === 'string' ? payload : payload.toString('utf-8');
  const expected = createHmac('sha256', secret).update(str).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch { return false; }
}

export function parseWebhookPayload(payload: HeliusWebhookPayload[]): KamiyoEvent[] {
  const events: KamiyoEvent[] = [];

  for (const tx of payload) {
    for (const ix of tx.instructions.filter(i => i.programId === KAMIYO_PROGRAM_ID)) {
      const ev = parseIx(ix, tx);
      if (ev) events.push(ev);
    }
  }

  return events;
}

function parseIx(ix: HeliusWebhookPayload['instructions'][0], tx: HeliusWebhookPayload): KamiyoEvent | null {
  const data = decode(ix.data);
  if (!data || data.length < 8) return null;

  const type = identifyType(data.slice(0, 8));
  if (!type) return null;

  const accounts = ix.accounts;
  const ev: KamiyoEvent = {
    type,
    escrowId: accounts[0]?.slice(0, 8) ?? '',
    escrowPda: accounts[0] ?? '',
    agent: null,
    provider: null,
    amount: null,
    qualityScore: null,
    refundAmount: null,
    signature: tx.signature,
    timestamp: tx.timestamp,
    slot: tx.slot
  };

  switch (type) {
    case 'escrow_created':
      ev.agent = accounts[1] ?? null;
      ev.provider = accounts[2] ?? null;
      if (data.length >= 16) ev.amount = data.readBigUInt64LE(8);
      break;
    case 'escrow_funded':
      ev.amount = tx.nativeTransfers.find(t => t.toUserAccount === accounts[0])?.amount
        ? BigInt(tx.nativeTransfers.find(t => t.toUserAccount === accounts[0])!.amount) : null;
      break;
    case 'dispute_resolved':
      if (data.length >= 9) ev.qualityScore = data[8];
      if (data.length >= 17) ev.refundAmount = data.readBigUInt64LE(9);
      break;
    case 'funds_released':
      ev.amount = tx.nativeTransfers.find(t => t.fromUserAccount === accounts[0])?.amount
        ? BigInt(tx.nativeTransfers.find(t => t.fromUserAccount === accounts[0])!.amount) : null;
      break;
  }

  return ev;
}

function identifyType(disc: Buffer): KamiyoEvent['type'] | null {
  if (disc.equals(INSTRUCTION_DISCRIMINATORS.INITIALIZE_ESCROW)) return 'escrow_created';
  if (disc.equals(INSTRUCTION_DISCRIMINATORS.FUND_ESCROW)) return 'escrow_funded';
  if (disc.equals(INSTRUCTION_DISCRIMINATORS.INITIATE_DISPUTE)) return 'dispute_initiated';
  if (disc.equals(INSTRUCTION_DISCRIMINATORS.RESOLVE_DISPUTE)) return 'dispute_resolved';
  if (disc.equals(INSTRUCTION_DISCRIMINATORS.RELEASE_FUNDS)) return 'funds_released';
  if (disc.equals(INSTRUCTION_DISCRIMINATORS.CLOSE_ESCROW)) return 'escrow_closed';
  return null;
}

function decode(data: string): Buffer | null {
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

type Req = { body: unknown; rawBody?: string | Buffer; headers: Record<string, string | undefined> };
type Res = { status: (code: number) => { send: (msg: string) => void; json: (data: unknown) => void } };

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
            case 'escrow_funded': await opts.onEscrowFunded?.(ev); break;
            case 'dispute_initiated': await opts.onDisputeInitiated?.(ev); break;
            case 'dispute_resolved': await opts.onDisputeResolved?.(ev); break;
            case 'funds_released': await opts.onFundsReleased?.(ev); break;
            case 'escrow_closed': await opts.onEscrowClosed?.(ev); break;
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
    const sig = req.headers[DEFAULTS.WEBHOOK_SIGNATURE_HEADER] || req.headers['x-helius-signature'];
    if (!sig) return res.status(401).json({ success: false, error: 'Missing signature' });

    const payload = req.rawBody || JSON.stringify(req.body);
    if (!verifyWebhookSignature(payload, sig, secret)) {
      return res.status(401).json({ success: false, error: 'Invalid signature' });
    }

    return handler(req, res);
  };
}

export function filterEventsByType(events: KamiyoEvent[], types: KamiyoEvent['type'][]): KamiyoEvent[] {
  return events.filter(e => types.includes(e.type));
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
    escrow_created: 0, escrow_funded: 0, dispute_initiated: 0,
    dispute_resolved: 0, funds_released: 0, escrow_closed: 0
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
    averageQualityScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null
  };
}
