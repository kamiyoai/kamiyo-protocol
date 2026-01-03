/**
 * Mitama Protocol Monitor
 *
 * Monitors protocol events and sends alerts for critical conditions.
 * Run with: npx ts-node scripts/monitor.ts
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { Keypair } from '@solana/web3.js';

// Configuration from environment
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const PROGRAM_ID = new PublicKey(process.env.MITAMA_PROGRAM_ID || '8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');
const WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL;

// Alert thresholds
const DISPUTE_RATE_THRESHOLD = 0.1; // Alert if >10% disputes
const HIGH_VALUE_ESCROW_THRESHOLD = 100 * LAMPORTS_PER_SOL; // Alert for escrows >100 SOL
const ORACLE_TIMEOUT_MS = 300000; // 5 minutes

interface MonitorStats {
  totalEscrows: number;
  activeEscrows: number;
  disputedEscrows: number;
  releasedEscrows: number;
  totalVolumeLocked: number;
  lastEventTime: number;
  oracleResponses: Map<string, number>;
}

const stats: MonitorStats = {
  totalEscrows: 0,
  activeEscrows: 0,
  disputedEscrows: 0,
  releasedEscrows: 0,
  totalVolumeLocked: 0,
  lastEventTime: Date.now(),
  oracleResponses: new Map(),
};

/**
 * Send alert to webhook (Slack, Discord, etc.)
 */
async function sendAlert(title: string, message: string, severity: 'info' | 'warning' | 'critical'): Promise<void> {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${severity.toUpperCase()}] ${title}: ${message}`);

  if (WEBHOOK_URL) {
    try {
      const color = severity === 'critical' ? '#ff0000' : severity === 'warning' ? '#ffaa00' : '#00ff00';

      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: `[Mitama] ${title}`,
            description: message,
            color: parseInt(color.replace('#', ''), 16),
            timestamp,
            footer: { text: 'Mitama Protocol Monitor' },
          }],
        }),
      });
    } catch (err) {
      console.error('Failed to send webhook alert:', err);
    }
  }
}

/**
 * Check dispute rate and alert if too high
 */
function checkDisputeRate(): void {
  if (stats.totalEscrows < 10) return; // Need minimum sample size

  const disputeRate = stats.disputedEscrows / stats.totalEscrows;
  if (disputeRate > DISPUTE_RATE_THRESHOLD) {
    sendAlert(
      'High Dispute Rate',
      `Dispute rate is ${(disputeRate * 100).toFixed(1)}% (${stats.disputedEscrows}/${stats.totalEscrows} escrows)`,
      'warning'
    );
  }
}

/**
 * Print current stats
 */
function printStats(): void {
  const disputeRate = stats.totalEscrows > 0
    ? ((stats.disputedEscrows / stats.totalEscrows) * 100).toFixed(1)
    : '0.0';

  console.log('\n=== Mitama Protocol Stats ===');
  console.log(`Total Escrows: ${stats.totalEscrows}`);
  console.log(`Active: ${stats.activeEscrows} | Disputed: ${stats.disputedEscrows} | Released: ${stats.releasedEscrows}`);
  console.log(`Dispute Rate: ${disputeRate}%`);
  console.log(`Total Volume Locked: ${(stats.totalVolumeLocked / LAMPORTS_PER_SOL).toFixed(2)} SOL`);
  console.log(`Last Event: ${new Date(stats.lastEventTime).toISOString()}`);
  console.log('=============================\n');
}

/**
 * Main monitoring loop
 */
async function main(): Promise<void> {
  console.log('Starting Mitama Protocol Monitor...');
  console.log(`RPC: ${RPC_URL}`);
  console.log(`Program ID: ${PROGRAM_ID.toBase58()}`);
  console.log(`Webhook: ${WEBHOOK_URL ? 'Configured' : 'Not configured'}`);
  console.log('');

  const connection = new Connection(RPC_URL, 'confirmed');

  // Create a dummy wallet for read-only operations
  const dummyKeypair = Keypair.generate();
  const wallet = new Wallet(dummyKeypair);
  const provider = new AnchorProvider(connection, wallet, {});

  // Derive PDAs
  const [protocolConfigPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('protocol_config')],
    PROGRAM_ID
  );

  const [oracleRegistryPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('oracle_registry')],
    PROGRAM_ID
  );

  // Check protocol status on startup
  try {
    const protocolConfigInfo = await connection.getAccountInfo(protocolConfigPDA);
    if (protocolConfigInfo) {
      console.log('Protocol Config found - Protocol is deployed');
    } else {
      console.log('Warning: Protocol Config not found - Protocol may not be initialized');
    }
  } catch (err) {
    console.error('Error checking protocol config:', err);
  }

  // Subscribe to program logs
  const subscriptionId = connection.onLogs(
    PROGRAM_ID,
    (logs, ctx) => {
      stats.lastEventTime = Date.now();

      // Parse events from logs
      for (const log of logs.logs) {
        if (log.includes('Program log: Instruction: InitializeEscrow')) {
          stats.totalEscrows++;
          stats.activeEscrows++;
          console.log(`[EVENT] New escrow created (slot: ${ctx.slot})`);
        }

        if (log.includes('Program log: Instruction: MarkDisputed')) {
          stats.disputedEscrows++;
          stats.activeEscrows--;
          console.log(`[EVENT] Escrow disputed (slot: ${ctx.slot})`);
          checkDisputeRate();
        }

        if (log.includes('Program log: Instruction: ReleaseFunds')) {
          stats.releasedEscrows++;
          stats.activeEscrows--;
          console.log(`[EVENT] Funds released (slot: ${ctx.slot})`);
        }

        if (log.includes('Program log: Instruction: PauseProtocol')) {
          sendAlert(
            'Protocol Paused',
            'The Mitama protocol has been paused by multi-sig authority',
            'critical'
          );
        }

        if (log.includes('Program log: Instruction: UnpauseProtocol')) {
          sendAlert(
            'Protocol Unpaused',
            'The Mitama protocol has been unpaused by multi-sig authority',
            'info'
          );
        }

        if (log.includes('Program log: Instruction: SubmitOracleScore')) {
          console.log(`[EVENT] Oracle score submitted (slot: ${ctx.slot})`);
        }

        if (log.includes('Program log: Instruction: FinalizeMultiOracleDispute')) {
          console.log(`[EVENT] Multi-oracle dispute finalized (slot: ${ctx.slot})`);
        }
      }

      // Check for errors
      if (logs.err) {
        console.log(`[ERROR] Transaction failed: ${JSON.stringify(logs.err)}`);
      }
    },
    'confirmed'
  );

  console.log(`Subscribed to program logs (subscription ID: ${subscriptionId})`);
  sendAlert('Monitor Started', `Mitama Protocol Monitor is now running on ${RPC_URL}`, 'info');

  // Print stats every minute
  setInterval(printStats, 60000);

  // Health check every 5 minutes
  setInterval(async () => {
    try {
      const slot = await connection.getSlot();
      console.log(`[HEALTH] Connected to slot ${slot}`);
    } catch (err) {
      sendAlert(
        'Connection Lost',
        `Failed to connect to RPC: ${err}`,
        'critical'
      );
    }
  }, 300000);

  // Keep process alive
  console.log('Monitor running. Press Ctrl+C to stop.');
  await new Promise(() => {}); // Run forever
}

// Handle shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down monitor...');
  printStats();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down monitor...');
  printStats();
  process.exit(0);
});

main().catch((err) => {
  console.error('Monitor failed:', err);
  process.exit(1);
});
