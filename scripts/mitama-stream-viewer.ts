#!/usr/bin/env npx ts-node
// Mitama x KAMIYO Companion - Live Stream Viewer
// Connects to the running bot's SSE stream and displays with styled output

import chalk from 'chalk';
import gradient from 'gradient-string';
import { EventSource } from 'eventsource';

const API_BASE = process.env.API_URL || 'https://api.kamiyo.ai';
const STREAM_URL = `${API_BASE}/api/mitama/demo/stream`;

// Neon colors: cyan (#00ffff), purple (#bf00ff), magenta (#ff00ff)
const neonGradient = gradient(['#00ffff', '#bf00ff', '#ff00ff']);
const neonCyan = chalk.hex('#00ffff');
const neonPurple = chalk.hex('#bf00ff');
const neonMagenta = chalk.hex('#ff00ff');

const banner = `
██╗  ██╗ █████╗ ███╗   ███╗██╗██╗   ██╗ ██████╗     ███╗   ███╗██╗████████╗ █████╗ ███╗   ███╗ █████╗
██║ ██╔╝██╔══██╗████╗ ████║██║╚██╗ ██╔╝██╔═══██╗    ████╗ ████║██║╚══██╔══╝██╔══██╗████╗ ████║██╔══██╗
█████╔╝ ███████║██╔████╔██║██║ ╚████╔╝ ██║   ██║    ██╔████╔██║██║   ██║   ███████║██╔████╔██║███████║
██╔═██╗ ██╔══██║██║╚██╔╝██║██║  ╚██╔╝  ██║   ██║    ██║╚██╔╝██║██║   ██║   ██╔══██║██║╚██╔╝██║██╔══██║
██║  ██╗██║  ██║██║ ╚═╝ ██║██║   ██║   ╚██████╔╝    ██║ ╚═╝ ██║██║   ██║   ██║  ██║██║ ╚═╝ ██║██║  ██║
╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝   ╚═╝    ╚═════╝     ╚═╝     ╚═╝╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝
`;

interface DemoLog {
  type: 'info' | 'success' | 'error' | 'zk' | 'proof' | 'tx' | 'signal' | 'tweet' | 'status';
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
  step?: number;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return neonPurple(`[${d.toLocaleTimeString()}]`);
}

function formatBox(title: string, content: string[]): string {
  const width = 60;
  const top = neonCyan('┌' + '─'.repeat(width - 2) + '┐');
  const bottom = neonCyan('└' + '─'.repeat(width - 2) + '┘');
  const titleLine = neonCyan('│') + ' ' + neonMagenta.bold(title.padEnd(width - 4)) + ' ' + neonCyan('│');
  const sep = neonCyan('├' + '─'.repeat(width - 2) + '┤');

  const lines = content.map(line => {
    const truncated = line.slice(0, width - 4);
    return neonCyan('│') + ' ' + truncated.padEnd(width - 4) + ' ' + neonCyan('│');
  });

  return [top, titleLine, sep, ...lines, bottom].join('\n');
}

function renderLog(log: DemoLog): void {
  const ts = formatTimestamp(log.timestamp);

  switch (log.type) {
    case 'info':
      console.log(`${ts} ${neonCyan('ℹ')} ${log.message}`);
      break;

    case 'success':
      console.log(`${ts} ${neonCyan('✓')} ${neonCyan(log.message)}`);
      break;

    case 'error':
      console.log(`${ts} ${neonMagenta('✗')} ${neonMagenta(log.message)}`);
      break;

    case 'zk':
    case 'proof':
      console.log();
      console.log(neonGradient('  ══════════════════════════════════════════════════════'));
      console.log(neonGradient('  ║') + neonCyan.bold('          ZK PROOF GENERATED          ') + neonGradient('║'));
      console.log(neonGradient('  ══════════════════════════════════════════════════════'));
      if (log.data) {
        if (log.data.commitment) {
          console.log(neonCyan('  Commitment: ') + neonPurple(String(log.data.commitment).slice(0, 32) + '...'));
        }
        if (log.data.nullifier) {
          console.log(neonCyan('  Nullifier:  ') + neonPurple(String(log.data.nullifier).slice(0, 32) + '...'));
        }
        if (log.data.proofTime) {
          console.log(neonCyan('  Proof Time: ') + neonMagenta(`${log.data.proofTime}ms`));
        }
      }
      console.log(`${ts} ${neonCyan('ZK')} ${log.message}`);
      console.log();
      break;

    case 'tx':
      console.log();
      console.log(neonGradient('  ══════════════════════════════════════════════════════'));
      console.log(neonGradient('  ║') + neonPurple.bold('         SOLANA TRANSACTION           ') + neonGradient('║'));
      console.log(neonGradient('  ══════════════════════════════════════════════════════'));
      if (log.data) {
        if (log.data.signature) {
          const sig = String(log.data.signature);
          console.log(neonPurple('  Signature: ') + neonCyan(sig.slice(0, 44) + '...'));
          console.log(neonPurple(`  https://solscan.io/tx/${sig}?cluster=devnet`));
        }
        if (log.data.type) {
          console.log(neonPurple('  Type:      ') + neonCyan(String(log.data.type)));
        }
      }
      console.log(`${ts} ${neonPurple('TX')} ${log.message}`);
      console.log();
      break;

    case 'signal':
      console.log();
      const direction = log.data?.direction as string || 'UNKNOWN';
      const dirColor = direction === 'LONG' ? neonCyan : direction === 'SHORT' ? neonMagenta : neonPurple;
      const signalLines = [
        `Direction:  ${dirColor(direction)}`,
        `Type:       ${neonPurple(String(log.data?.signalType || 'N/A'))}`,
        `Confidence: ${neonCyan(String(log.data?.confidence || 0) + '%')}`,
        `Magnitude:  ${neonMagenta(String(log.data?.magnitude || 0))}`,
      ];
      console.log(formatBox('SIGNAL SUBMITTED', signalLines));
      console.log();
      break;

    case 'tweet':
      console.log();
      console.log(neonGradient('  ══════════════════════════════════════════════════════'));
      console.log(neonGradient('  ║') + neonMagenta.bold('            TWEET POSTED              ') + neonGradient('║'));
      console.log(neonGradient('  ══════════════════════════════════════════════════════'));
      if (log.data?.tweetId) {
        console.log(neonMagenta('  Tweet ID: ') + neonCyan(String(log.data.tweetId)));
      }
      console.log(`${ts} ${neonMagenta('TWEET')} ${log.message}`);
      console.log();
      break;

    case 'status':
      const statusColor = log.message.includes('running') ? neonCyan :
                         log.message.includes('error') ? neonMagenta : neonPurple;
      console.log(`${ts} ${neonPurple.bold('STATUS:')} ${statusColor(log.message)}`);
      break;

    default:
      console.log(`${ts} ${log.message}`);
  }
}

function showConnectionStatus(status: string): void {
  console.log();
  if (status === 'running') {
    console.log(neonCyan.bold('  ● LIVE') + neonPurple(' - Connected to Mitama stream'));
  } else {
    console.log(neonMagenta.bold('  ○ IDLE') + neonPurple(' - Waiting for activity...'));
  }
  console.log();
}

async function main(): Promise<void> {
  console.clear();
  console.log(neonGradient(banner));
  console.log(neonPurple('  Live Stream Viewer'));
  console.log(neonPurple(`  Connecting to ${STREAM_URL}...`));
  console.log();

  const es = new EventSource(STREAM_URL);

  es.onopen = () => {
    console.log(neonCyan('  Connected to stream'));
    console.log(neonPurple('  Waiting for events...'));
    console.log();
  };

  es.onerror = (err) => {
    console.log(neonMagenta('  Stream error:'), err);
    console.log(neonPurple('  Reconnecting...'));
  };

  es.addEventListener('status', (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      showConnectionStatus(data.status);
    } catch {
      console.log(neonPurple('  Status update received'));
    }
  });

  es.addEventListener('log', (event: MessageEvent) => {
    try {
      const log: DemoLog = JSON.parse(event.data);
      renderLog(log);
    } catch (err) {
      console.log(neonPurple('  Log received:'), event.data);
    }
  });

  es.addEventListener('ping', () => {
    // Silent keep-alive
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log();
    console.log(neonMagenta('  Disconnecting...'));
    es.close();
    process.exit(0);
  });

  console.log(neonPurple('  Press Ctrl+C to exit'));
  console.log();
}

main().catch(err => {
  console.error(neonMagenta('Failed to start viewer:'), err);
  process.exit(1);
});
