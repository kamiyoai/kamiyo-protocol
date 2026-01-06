/**
 * KAMIYO Webhook Handler for Helius
 * Process escrow events in real-time
 */

import { PublicKey } from '@solana/web3.js';

interface HeliusWebhookEvent {
    accountData: Array<{
        account: string;
        nativeBalanceChange: number;
        tokenBalanceChanges: Array<{
            mint: string;
            rawTokenAmount: { tokenAmount: string; decimals: number };
            userAccount: string;
        }>;
    }>;
    description: string;
    events: Record<string, unknown>;
    fee: number;
    feePayer: string;
    instructions: Array<{
        accounts: string[];
        data: string;
        innerInstructions: Array<{
            accounts: string[];
            data: string;
            programId: string;
        }>;
        programId: string;
    }>;
    nativeTransfers: Array<{
        amount: number;
        fromUserAccount: string;
        toUserAccount: string;
    }>;
    signature: string;
    slot: number;
    source: string;
    timestamp: number;
    tokenTransfers: Array<{
        fromTokenAccount: string;
        fromUserAccount: string;
        mint: string;
        toTokenAccount: string;
        toUserAccount: string;
        tokenAmount: number;
        tokenStandard: string;
    }>;
    type: string;
}

interface KamiyoEscrowEvent {
    type: 'escrow_created' | 'escrow_funded' | 'dispute_initiated' | 'oracle_resolved' | 'funds_released';
    escrowId: string;
    escrowPda: string;
    agent?: string;
    provider?: string;
    amount?: number;
    qualityScore?: number;
    refundAmount?: number;
    signature: string;
    timestamp: number;
}

const KAMIYO_PROGRAM_ID = 'E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n';

// Instruction discriminators (first 8 bytes of sha256 hash)
const INSTRUCTION_DISCRIMINATORS = {
    INITIALIZE_ESCROW: 'c3e9e1cc9a7e5f47',
    FUND_ESCROW: 'a1b2c3d4e5f6g7h8',
    INITIATE_DISPUTE: 'b2c3d4e5f6g7h8a1',
    RESOLVE_DISPUTE: 'c3d4e5f6g7h8a1b2',
    RELEASE_FUNDS: 'd4e5f6g7h8a1b2c3'
};

/**
 * Parse Helius webhook payload into KAMIYO events
 */
export function parseWebhookPayload(payload: HeliusWebhookEvent[]): KamiyoEscrowEvent[] {
    const events: KamiyoEscrowEvent[] = [];

    for (const tx of payload) {
        const kamiyoInstructions = tx.instructions.filter(
            ix => ix.programId === KAMIYO_PROGRAM_ID
        );

        for (const ix of kamiyoInstructions) {
            const event = parseInstruction(ix, tx);
            if (event) {
                events.push(event);
            }
        }
    }

    return events;
}

/**
 * Parse single instruction into event
 */
function parseInstruction(
    instruction: HeliusWebhookEvent['instructions'][0],
    tx: HeliusWebhookEvent
): KamiyoEscrowEvent | null {
    const discriminator = instruction.data.slice(0, 16);
    const accounts = instruction.accounts;

    switch (discriminator) {
        case INSTRUCTION_DISCRIMINATORS.INITIALIZE_ESCROW:
            return {
                type: 'escrow_created',
                escrowId: extractEscrowId(instruction.data),
                escrowPda: accounts[0],
                agent: accounts[1],
                provider: accounts[2],
                signature: tx.signature,
                timestamp: tx.timestamp
            };

        case INSTRUCTION_DISCRIMINATORS.FUND_ESCROW:
            const transfer = tx.nativeTransfers.find(
                t => t.toUserAccount === accounts[0]
            );
            return {
                type: 'escrow_funded',
                escrowId: extractEscrowId(instruction.data),
                escrowPda: accounts[0],
                amount: transfer?.amount,
                signature: tx.signature,
                timestamp: tx.timestamp
            };

        case INSTRUCTION_DISCRIMINATORS.INITIATE_DISPUTE:
            return {
                type: 'dispute_initiated',
                escrowId: extractEscrowId(instruction.data),
                escrowPda: accounts[0],
                signature: tx.signature,
                timestamp: tx.timestamp
            };

        case INSTRUCTION_DISCRIMINATORS.RESOLVE_DISPUTE:
            return {
                type: 'oracle_resolved',
                escrowId: extractEscrowId(instruction.data),
                escrowPda: accounts[0],
                qualityScore: extractQualityScore(instruction.data),
                refundAmount: extractRefundAmount(instruction.data),
                signature: tx.signature,
                timestamp: tx.timestamp
            };

        case INSTRUCTION_DISCRIMINATORS.RELEASE_FUNDS:
            return {
                type: 'funds_released',
                escrowId: extractEscrowId(instruction.data),
                escrowPda: accounts[0],
                signature: tx.signature,
                timestamp: tx.timestamp
            };

        default:
            return null;
    }
}

function extractEscrowId(data: string): string {
    // Skip discriminator (16 chars = 8 bytes), read next 32 chars (16 bytes) as escrow ID
    return data.slice(16, 48);
}

function extractQualityScore(data: string): number {
    // Quality score at offset 48, 1 byte
    return parseInt(data.slice(48, 50), 16);
}

function extractRefundAmount(data: string): number {
    // Refund amount at offset 50, 8 bytes (u64)
    const hex = data.slice(50, 66);
    return parseInt(hex, 16);
}

/**
 * Express/Next.js webhook handler
 */
export function createWebhookHandler(options: {
    onEscrowCreated?: (event: KamiyoEscrowEvent) => Promise<void>;
    onEscrowFunded?: (event: KamiyoEscrowEvent) => Promise<void>;
    onDisputeInitiated?: (event: KamiyoEscrowEvent) => Promise<void>;
    onOracleResolved?: (event: KamiyoEscrowEvent) => Promise<void>;
    onFundsReleased?: (event: KamiyoEscrowEvent) => Promise<void>;
}) {
    return async (req: { body: HeliusWebhookEvent[] }, res: { status: (code: number) => { send: (msg: string) => void } }) => {
        try {
            const events = parseWebhookPayload(req.body);

            for (const event of events) {
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
                    case 'oracle_resolved':
                        await options.onOracleResolved?.(event);
                        break;
                    case 'funds_released':
                        await options.onFundsReleased?.(event);
                        break;
                }
            }

            res.status(200).send('OK');
        } catch (error) {
            console.error('Webhook processing error:', error);
            res.status(500).send('Error processing webhook');
        }
    };
}

/**
 * Verify Helius webhook signature
 */
export function verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string
): boolean {
    const crypto = require('crypto');
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
    );
}

export default { parseWebhookPayload, createWebhookHandler, verifyWebhookSignature };
