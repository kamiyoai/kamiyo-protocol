/**
 * KAMIYO + Helius Integration
 * Enhanced escrow operations using Helius RPCs
 */

import { Connection, PublicKey, Transaction, Keypair } from '@solana/web3.js';

const KAMIYO_PROGRAM_ID = 'E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n';

interface HeliusConfig {
    apiKey: string;
    cluster?: 'mainnet-beta' | 'devnet';
}

interface EscrowParams {
    provider: PublicKey;
    amount: number;
    timeLockSeconds?: number;
    priorityFee?: number;
}

interface EscrowState {
    id: string;
    pda: PublicKey;
    agent: PublicKey;
    provider: PublicKey;
    amount: number;
    status: 'active' | 'disputed' | 'resolved' | 'released';
    qualityScore?: number;
    createdAt: number;
}

export class KamiyoHeliusClient {
    private connection: Connection;
    private programId: PublicKey;
    private heliusApiKey: string;

    constructor(config: HeliusConfig) {
        const cluster = config.cluster || 'mainnet-beta';
        const rpcUrl = `https://${cluster}.helius-rpc.com/?api-key=${config.apiKey}`;

        this.connection = new Connection(rpcUrl, 'confirmed');
        this.programId = new PublicKey(KAMIYO_PROGRAM_ID);
        this.heliusApiKey = config.apiKey;
    }

    /**
     * Get priority fee estimate from Helius
     */
    async getPriorityFee(accounts: PublicKey[]): Promise<number> {
        const response = await fetch(
            `https://mainnet.helius-rpc.com/?api-key=${this.heliusApiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 'priority-fee',
                    method: 'getPriorityFeeEstimate',
                    params: [{
                        accountKeys: accounts.map(a => a.toBase58()),
                        options: { recommended: true }
                    }]
                })
            }
        );

        const data = await response.json();
        return data.result?.priorityFeeEstimate || 1000;
    }

    /**
     * Derive escrow PDA
     */
    deriveEscrowPDA(transactionId: string): [PublicKey, number] {
        return PublicKey.findProgramAddressSync(
            [Buffer.from('escrow'), Buffer.from(transactionId)],
            this.programId
        );
    }

    /**
     * Fetch escrow state using Helius enhanced API
     */
    async getEscrowState(escrowPda: PublicKey): Promise<EscrowState | null> {
        const accountInfo = await this.connection.getAccountInfo(escrowPda);
        if (!accountInfo) return null;

        // Parse account data (simplified - actual parsing depends on program layout)
        const data = accountInfo.data;

        return {
            id: escrowPda.toBase58().slice(0, 8),
            pda: escrowPda,
            agent: new PublicKey(data.slice(8, 40)),
            provider: new PublicKey(data.slice(40, 72)),
            amount: Number(data.readBigUInt64LE(72)),
            status: this.parseStatus(data[80]),
            qualityScore: data[81] || undefined,
            createdAt: Number(data.readBigInt64LE(82))
        };
    }

    private parseStatus(statusByte: number): EscrowState['status'] {
        switch (statusByte) {
            case 0: return 'active';
            case 1: return 'disputed';
            case 2: return 'resolved';
            case 3: return 'released';
            default: return 'active';
        }
    }

    /**
     * Fetch recent escrow transactions using Helius
     */
    async getRecentEscrows(limit = 10): Promise<EscrowState[]> {
        const signatures = await this.connection.getSignaturesForAddress(
            this.programId,
            { limit }
        );

        const escrows: EscrowState[] = [];

        for (const sig of signatures) {
            try {
                const tx = await this.connection.getParsedTransaction(
                    sig.signature,
                    { maxSupportedTransactionVersion: 0 }
                );

                if (tx?.meta?.logMessages) {
                    const escrowLog = tx.meta.logMessages.find(
                        log => log.includes('Escrow created') || log.includes('InitializeEscrow')
                    );

                    if (escrowLog) {
                        // Extract escrow PDA from transaction accounts
                        const accounts = tx.transaction.message.accountKeys;
                        const escrowAccount = accounts.find(
                            acc => acc.pubkey.toBase58() !== this.programId.toBase58()
                        );

                        if (escrowAccount) {
                            const state = await this.getEscrowState(escrowAccount.pubkey);
                            if (state) escrows.push(state);
                        }
                    }
                }
            } catch (e) {
                continue;
            }
        }

        return escrows;
    }

    /**
     * Monitor escrow with Helius websocket
     */
    subscribeToEscrow(
        escrowPda: PublicKey,
        callback: (state: EscrowState) => void
    ): number {
        return this.connection.onAccountChange(
            escrowPda,
            async (accountInfo) => {
                const state = await this.getEscrowState(escrowPda);
                if (state) callback(state);
            },
            'confirmed'
        );
    }

    /**
     * Unsubscribe from escrow updates
     */
    unsubscribe(subscriptionId: number): Promise<void> {
        return this.connection.removeAccountChangeListener(subscriptionId);
    }
}

// Example usage
async function main() {
    const client = new KamiyoHeliusClient({
        apiKey: process.env.HELIUS_API_KEY || 'your-api-key'
    });

    // Get recent escrows
    const escrows = await client.getRecentEscrows(5);
    console.log('Recent escrows:', escrows);

    // Get priority fee for escrow operations
    const [escrowPda] = client.deriveEscrowPDA('test-tx-001');
    const priorityFee = await client.getPriorityFee([escrowPda]);
    console.log('Recommended priority fee:', priorityFee);
}

if (require.main === module) {
    main().catch(console.error);
}

export default KamiyoHeliusClient;
