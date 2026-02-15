import { PublicKey } from '@solana/web3.js';
import { Wallet, BN } from '@coral-xyz/anchor';
import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '../types';
import { getNetworkConfig, getKeypair, createConnection, generateId, parseAmount, parseAddress, solToLamports, lamportsToSol } from '../utils';
import { getTrustEngine } from '../trust/pluginTrust';

const DEFAULT_MIN_STAKE_LAMPORTS = 100_000_000; // 0.1 SOL
const DEFAULT_MIN_REPUTATION = 60;

export const createTrustedEscrowAction: Action = {
  name: 'CREATE_TRUSTED_ESCROW',
  description: 'Create escrow with trust verification. Checks own stake, counterparty reputation (on-chain + plugin-trust), and records trust evidence on completion.',
  similes: ['trusted payment', 'safe escrow', 'verified escrow', 'trust escrow', 'send with trust check'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Send 0.5 SOL to 8xYz... with trust check' } },
      { user: '{{agent}}', content: { text: 'Trust verified (provider: 82/100, risk: low). Escrow created: 0.5 SOL locked.', action: 'CREATE_TRUSTED_ESCROW' } },
    ],
    [
      { user: '{{user1}}', content: { text: 'Create trusted escrow for 1 SOL to provider ABC123' } },
      { user: '{{agent}}', content: { text: 'Provider reputation 45/100 below minimum (60). Escrow blocked.', action: 'CREATE_TRUSTED_ESCROW' } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      (text.includes('trust') && (text.includes('escrow') || text.includes('payment') || text.includes('send'))) ||
      (text.includes('safe') && text.includes('escrow')) ||
      (text.includes('verified') && text.includes('escrow'))
    );
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{
    success: boolean;
    escrowAddress?: string;
    transactionId?: string;
    signature?: string;
    trustCheck?: { ownStake: number; providerReputation: number; providerRisk: string; trustEngineScore?: number };
    error?: string;
  }> {
    const text = message.content.text || '';
    const keypair = getKeypair(runtime);

    if (!keypair) {
      callback?.({ text: 'Wallet not configured. Set SOLANA_PRIVATE_KEY.' });
      return { success: false, error: 'Wallet not configured' };
    }

    const amount = parseAmount(text);
    if (!amount) {
      callback?.({ text: 'Specify amount in SOL (e.g., "0.5 SOL")' });
      return { success: false, error: 'Amount not specified' };
    }

    const provider = parseAddress(text) || (message.content.provider as string);
    if (!provider) {
      callback?.({ text: 'Specify provider address' });
      return { success: false, error: 'Provider not specified' };
    }

    try {
      const { rpcUrl, programId } = getNetworkConfig(runtime);
      const connection = createConnection(rpcUrl);
      const { KamiyoClient } = await import('@kamiyo/sdk');

      const client = new KamiyoClient({
        connection,
        wallet: new Wallet(keypair),
        programId: new PublicKey(programId),
      });

      // 1. Verify own stake
      const minStakeLamports = parseInt(
        runtime.getSetting('KAMIYO_MIN_STAKE_FOR_TRUST') || String(DEFAULT_MIN_STAKE_LAMPORTS),
        10
      );
      const [ownPda] = client.getAgentPDA(keypair.publicKey);
      const ownAgent = await client.getAgent(ownPda);

      if (!ownAgent || !ownAgent.isActive) {
        callback?.({ text: 'No active KAMIYO agent. Register and stake first.' });
        return { success: false, error: 'No active agent' };
      }

      const ownStakeLamports = ownAgent.stakeAmount?.toNumber() || 0;
      if (ownStakeLamports < minStakeLamports) {
        callback?.({ text: `Insufficient stake: ${lamportsToSol(ownStakeLamports).toFixed(4)} SOL (min: ${lamportsToSol(minStakeLamports).toFixed(4)} SOL).` });
        return { success: false, error: 'Insufficient stake' };
      }

      // 2. Check counterparty — on-chain reputation
      const minRep = parseInt(runtime.getSetting('KAMIYO_MIN_REPUTATION') || String(DEFAULT_MIN_REPUTATION), 10);
      const providerKey = new PublicKey(provider);
      const [providerPda] = client.getAgentPDA(providerKey);
      const providerAgent = await client.getAgent(providerPda);

      let providerReputation = 0;
      let providerRisk = 'unknown';

      if (providerAgent) {
        providerReputation = providerAgent.reputation?.toNumber() || 0;
        const totalEscrows = providerAgent.totalEscrows?.toNumber() || 0;
        const disputed = providerAgent.disputedEscrows?.toNumber() || 0;
        const disputeRate = totalEscrows > 0 ? (disputed / totalEscrows) * 100 : 0;

        if (providerReputation >= 80 && disputeRate < 10) providerRisk = 'low';
        else if (providerReputation >= 50 && disputeRate < 25) providerRisk = 'medium';
        else providerRisk = 'high';

        if (providerReputation < minRep) {
          callback?.({
            text: `Provider reputation ${providerReputation}/100 below minimum (${minRep}). Escrow blocked.`,
            content: { providerReputation, minReputation: minRep, providerRisk },
          });
          return { success: false, error: `Provider reputation ${providerReputation} below threshold ${minRep}` };
        }
      }

      // 3. Check counterparty — plugin-trust TrustEngine (if available)
      let trustEngineScore: number | undefined;
      const engine = getTrustEngine(runtime);
      if (engine?.calculateTrust) {
        const profile = await engine.calculateTrust(provider, {
          evaluatorId: runtime.agentId,
          roomId: message.roomId,
          action: createTrustedEscrowAction.name,
        });
        trustEngineScore = profile?.overallTrust;

        // Block if plugin-trust says very low trust
        if (trustEngineScore != null && trustEngineScore < 20) {
          callback?.({
            text: `TrustEngine score ${trustEngineScore}/100 is critically low. Escrow blocked.`,
            content: { trustEngineScore, providerReputation },
          });
          return { success: false, error: `TrustEngine score ${trustEngineScore} critically low` };
        }
      }

      // 4. Create escrow
      const transactionId = generateId('trusted_tx');
      const hours = Number(message.content.timeLockHours ?? 24);
      const timeLockHours = Number.isFinite(hours) ? Math.min(Math.max(hours, 1), 720) : 24;

      const signature = await client.createAgreement({
        provider: providerKey,
        amount: new BN(solToLamports(amount)),
        timeLockSeconds: new BN(timeLockHours * 3600),
        transactionId,
      });

      const [escrowPda] = client.getAgreementPDA(keypair.publicKey, transactionId);
      const trustCheck = { ownStake: lamportsToSol(ownStakeLamports), providerReputation, providerRisk, trustEngineScore };

      // Store pending escrow for tracking
      await appendStateItem(
        runtime,
        'kamiyoPendingEscrows',
        { transactionId, provider, amount, trustCheck, createdAt: Date.now() },
        200,
        item => {
          const tx = (item as any)?.transactionId;
          return typeof tx === 'string' ? tx : null;
        }
      );

      const trustInfo = trustEngineScore != null ? `, trust engine: ${trustEngineScore}/100` : '';
      callback?.({
        text: `Trust verified (provider: ${providerReputation}/100, risk: ${providerRisk}${trustInfo}). Escrow created: ${amount} SOL locked for ${provider.slice(0, 8)}...`,
        content: { escrowAddress: escrowPda.toBase58(), amount, provider, transactionId, signature, trustCheck },
      });

      return { success: true, escrowAddress: escrowPda.toBase58(), transactionId, signature, trustCheck };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      callback?.({ text: `Trusted escrow failed: ${error}` });
      return { success: false, error };
    }
  },
};

async function appendStateItem(
  runtime: IAgentRuntime,
  key: string,
  item: unknown,
  max: number,
  dedupeKey?: (item: unknown) => string | null
): Promise<void> {
  const existing = ((await runtime.getState?.(key)) as unknown[] | undefined) || [];
  const next = [...existing];

  if (dedupeKey) {
    const id = dedupeKey(item);
    if (id) {
      for (let i = next.length - 1; i >= Math.max(0, next.length - 50); i--) {
        const otherId = dedupeKey(next[i]);
        if (otherId === id) return;
      }
    }
  }

  next.push(item);
  await runtime.setState?.(key, next.slice(Math.max(0, next.length - max)));
}
