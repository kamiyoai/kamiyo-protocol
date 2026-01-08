import { PublicKey } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import type { Service, IAgentRuntime } from '../types';
import { getNetworkConfig, getKeypair, createConnection } from '../utils';

interface MonitoredEscrow {
  transactionId: string;
  provider: string;
  amount: number;
  expiresAt: number;
  autoDispute: boolean;
}

export const escrowMonitorService: Service = {
  name: 'kamiyo-escrow-monitor',
  description: 'Monitors active escrows and auto-disputes on expiry or quality failure',

  async start(runtime: IAgentRuntime): Promise<void> {
    const interval = parseInt(runtime.getSetting('KAMIYO_MONITOR_INTERVAL') || '60000', 10);
    const autoDispute = runtime.getSetting('KAMIYO_AUTO_DISPUTE') !== 'false';

    if (!autoDispute) return;

    const check = async () => {
      try {
        const escrows = (await runtime.getState?.('kamiyo_active_escrows')) as MonitoredEscrow[] | undefined;
        if (!escrows?.length) return;

        const now = Date.now();
        const expired = escrows.filter(e => e.expiresAt < now && e.autoDispute);

        for (const escrow of expired) {
          await disputeExpired(runtime, escrow);
        }
      } catch {
        // Silent fail on monitoring
      }
    };

    const timer = setInterval(check, interval);
    (this as any)._timer = timer;

    // Initial check
    check();
  },

  async stop(): Promise<void> {
    if ((this as any)._timer) {
      clearInterval((this as any)._timer);
    }
  },
};

async function disputeExpired(runtime: IAgentRuntime, escrow: MonitoredEscrow): Promise<void> {
  const { rpcUrl, programId } = getNetworkConfig(runtime);
  const keypair = getKeypair(runtime);

  if (!keypair) return;

  try {
    const connection = createConnection(rpcUrl);
    const { KamiyoClient } = await import('@kamiyo/sdk');

    const client = new KamiyoClient({
      connection,
      wallet: new Wallet(keypair),
      programId: new PublicKey(programId),
    });

    await client.markDisputed(escrow.transactionId);

    // Remove from monitored list
    const escrows = (await runtime.getState?.('kamiyo_active_escrows')) as MonitoredEscrow[] | undefined;
    if (escrows) {
      const updated = escrows.filter(e => e.transactionId !== escrow.transactionId);
      await runtime.setState?.('kamiyo_active_escrows', updated);
    }
  } catch {
    // Silent fail
  }
}
