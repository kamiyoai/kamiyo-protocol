/**
 * KAMIYO Helius Adapter - Webhook Handler
 * Process escrow events in real-time via Helius webhooks
 */

import { createHmac, timingSafeEqual } from 'crypto';
import {
    HeliusWebhookPayload,
    KamiyoEvent,
    WebhookHandlerOptions
} from './types';
import { KAMIYO_PROGRAM_ID, DEFAULTS, INSTRUCTION_DISCRIMINATORS } from './constants';

/**
 * Verify Helius webhook signature
 */
export function verifyWebhookSignature(
    payload: string | Buffer,
    signature: string,
    secret: string
): boolean {
    const payloadString = typeof payload === 'string' ? payload : payload.toString('utf-8');

    const expectedSignature = createHmac('sha256', secret)
        .update(payloadString)
        .digest('hex');

    try {
        return timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignature)
        );
    } catch {
        return false;
    }
}

/**
 * Parse webhook payload into KAMIYO events
 */
export function parseWebhookPayload(payload: HeliusWebhookPayload[]): KamiyoEvent[] {
    const events: KamiyoEvent[] = [];

    for (const tx of payload) {
        const kamiyoInstructions = tx.instructions.filter(
            ix => ix.programId === KAMIYO_PROGRAM_ID
        );

        for (const ix of kamiyoInstructions) {
            const event = parseInstructionToEvent(ix, tx);
            if (event) {
                events.push(event);
            }
        }
    }

    return events;
}

/**
 * Parse single instruction into KAMIYO event
 */
function parseInstructionToEvent(
    instruction: HeliusWebhookPayload['instructions'][0],
    tx: HeliusWebhookPayload
): KamiyoEvent | null {
    const data = decodeInstructionData(instruction.data);
    if (!data || data.length < 8) return null;

    const discriminator = data.slice(0, 8);
    const accounts = instruction.accounts;
    const type = identifyEventType(discriminator);

    if (!type) return null;

    const baseEvent: KamiyoEvent = {
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

    // Extract additional data based on event type
    switch (type) {
        case 'escrow_created':
            baseEvent.agent = accounts[1] ?? null;
            baseEvent.provider = accounts[2] ?? null;
            if (data.length >= 16) {
                baseEvent.amount = readBigUInt64LE(data, 8);
            }
            break;

        case 'escrow_funded':
            const fundTransfer = tx.nativeTransfers.find(
                t => t.toUserAccount === accounts[0]
            );
            baseEvent.amount = fundTransfer ? BigInt(fundTransfer.amount) : null;
            break;

        case 'dispute_resolved':
            if (data.length >= 9) {
                baseEvent.qualityScore = data[8];
            }
            if (data.length >= 17) {
                baseEvent.refundAmount = readBigUInt64LE(data, 9);
            }
            break;

        case 'funds_released':
            const releaseTransfer = tx.nativeTransfers.find(
                t => t.fromUserAccount === accounts[0]
            );
            baseEvent.amount = releaseTransfer ? BigInt(releaseTransfer.amount) : null;
            break;
    }

    return baseEvent;
}

/**
 * Identify event type from discriminator
 */
function identifyEventType(discriminator: Buffer): KamiyoEvent['type'] | null {
    if (discriminator.equals(INSTRUCTION_DISCRIMINATORS.INITIALIZE_ESCROW)) {
        return 'escrow_created';
    }
    if (discriminator.equals(INSTRUCTION_DISCRIMINATORS.FUND_ESCROW)) {
        return 'escrow_funded';
    }
    if (discriminator.equals(INSTRUCTION_DISCRIMINATORS.INITIATE_DISPUTE)) {
        return 'dispute_initiated';
    }
    if (discriminator.equals(INSTRUCTION_DISCRIMINATORS.RESOLVE_DISPUTE)) {
        return 'dispute_resolved';
    }
    if (discriminator.equals(INSTRUCTION_DISCRIMINATORS.RELEASE_FUNDS)) {
        return 'funds_released';
    }
    if (discriminator.equals(INSTRUCTION_DISCRIMINATORS.CLOSE_ESCROW)) {
        return 'escrow_closed';
    }
    return null;
}

/**
 * Decode instruction data from base64 or hex
 */
function decodeInstructionData(data: string): Buffer | null {
    try {
        // Try base64 first
        const decoded = Buffer.from(data, 'base64');
        if (decoded.length >= 8) {
            return decoded;
        }
    } catch {
        // Ignore and try hex
    }

    try {
        const decoded = Buffer.from(data, 'hex');
        if (decoded.length >= 8) {
            return decoded;
        }
    } catch {
        // Ignore
    }

    return null;
}

/**
 * Read BigUInt64LE from buffer
 */
function readBigUInt64LE(buffer: Buffer, offset: number): bigint {
    if (buffer.length < offset + 8) {
        return 0n;
    }
    return buffer.readBigUInt64LE(offset);
}

/**
 * Create a webhook handler function
 */
export function createWebhookHandler(options: WebhookHandlerOptions) {
    return async (
        req: { body: unknown; rawBody?: string | Buffer; headers: Record<string, string | undefined> },
        res: { status: (code: number) => { send: (msg: string) => void; json: (data: unknown) => void } }
    ) => {
        try {
            // Parse payload
            let payload: HeliusWebhookPayload[];

            if (Array.isArray(req.body)) {
                payload = req.body;
            } else if (typeof req.body === 'string') {
                payload = JSON.parse(req.body);
            } else {
                payload = [req.body as HeliusWebhookPayload];
            }

            // Parse events
            const events = parseWebhookPayload(payload);

            // Process each event
            for (const event of events) {
                try {
                    switch (event.type) {
                        case 'escrow_created':
                            await options.onEscrowCreated?.(event);
                            break;
                        case 'escrow_funded':
                            await options.onEscrowFunded?.(event);
                            break;
                        case 'dispute_initiated':
                            await options.onDisputeInitiated?.(event);
                            break;
                        case 'dispute_resolved':
                            await options.onDisputeResolved?.(event);
                            break;
                        case 'funds_released':
                            await options.onFundsReleased?.(event);
                            break;
                        case 'escrow_closed':
                            await options.onEscrowClosed?.(event);
                            break;
                    }
                } catch (error) {
                    if (options.onError) {
                        options.onError(
                            error instanceof Error ? error : new Error(String(error)),
                            payload[0]
                        );
                    }
                }
            }

            res.status(200).json({ success: true, eventsProcessed: events.length });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ success: false, error: errorMessage });
        }
    };
}

/**
 * Create a webhook handler with signature verification
 */
export function createVerifiedWebhookHandler(
    secret: string,
    options: WebhookHandlerOptions
) {
    const handler = createWebhookHandler(options);

    return async (
        req: { body: unknown; rawBody?: string | Buffer; headers: Record<string, string | undefined> },
        res: { status: (code: number) => { send: (msg: string) => void; json: (data: unknown) => void } }
    ) => {
        const signature = req.headers[DEFAULTS.WEBHOOK_SIGNATURE_HEADER] ||
                          req.headers['x-helius-signature'];

        if (!signature) {
            res.status(401).json({ success: false, error: 'Missing signature header' });
            return;
        }

        const payload = req.rawBody || JSON.stringify(req.body);

        if (!verifyWebhookSignature(payload, signature, secret)) {
            res.status(401).json({ success: false, error: 'Invalid signature' });
            return;
        }

        return handler(req, res);
    };
}

/**
 * Filter events by type
 */
export function filterEventsByType(
    events: KamiyoEvent[],
    types: KamiyoEvent['type'][]
): KamiyoEvent[] {
    return events.filter(e => types.includes(e.type));
}

/**
 * Group events by escrow
 */
export function groupEventsByEscrow(events: KamiyoEvent[]): Map<string, KamiyoEvent[]> {
    const grouped = new Map<string, KamiyoEvent[]>();

    for (const event of events) {
        const existing = grouped.get(event.escrowPda) || [];
        existing.push(event);
        grouped.set(event.escrowPda, existing);
    }

    return grouped;
}

/**
 * Get event statistics
 */
export function getEventStats(events: KamiyoEvent[]): {
    total: number;
    byType: Record<KamiyoEvent['type'], number>;
    uniqueEscrows: number;
    totalVolume: bigint;
    averageQualityScore: number | null;
} {
    const byType: Record<KamiyoEvent['type'], number> = {
        escrow_created: 0,
        escrow_funded: 0,
        dispute_initiated: 0,
        dispute_resolved: 0,
        funds_released: 0,
        escrow_closed: 0
    };

    let totalVolume = 0n;
    const qualityScores: number[] = [];
    const uniqueEscrows = new Set<string>();

    for (const event of events) {
        byType[event.type]++;
        uniqueEscrows.add(event.escrowPda);

        if (event.amount) {
            totalVolume += event.amount;
        }

        if (event.qualityScore !== null) {
            qualityScores.push(event.qualityScore);
        }
    }

    const averageQualityScore = qualityScores.length > 0
        ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
        : null;

    return {
        total: events.length,
        byType,
        uniqueEscrows: uniqueEscrows.size,
        totalVolume,
        averageQualityScore
    };
}
