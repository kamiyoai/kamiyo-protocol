#!/usr/bin/env npx tsx
/**
 * Mitama Demo Watcher - Connects to the live demo stream and displays logs
 *
 * Usage:
 *   npx tsx scripts/mitama-watch.ts                    # Watch production
 *   npx tsx scripts/mitama-watch.ts http://localhost:3001  # Watch local
 */

import chalk from 'chalk';
import { EventSource } from 'eventsource';

const API_URL = process.argv[2] || 'https://api.kamiyo.ai';
const STREAM_URL = `${API_URL}/api/mitama/demo/stream`;

interface DemoLog {
  timestamp: number;
  step: number;
  type: 'info' | 'success' | 'error' | 'tx' | 'proof' | 'tweet';
  message: string;
  data?: Record<string, unknown>;
}

function formatLog(log: DemoLog): void {
  const time = new Date(log.timestamp).toLocaleTimeString();
  const step = log.step >= 0 ? `[${log.step}/5]` : '[ERR]';

  let prefix: string;
  let messageColor: (s: string) => string;

  switch (log.type) {
    case 'success':
      prefix = chalk.green('✓');
      messageColor = chalk.green;
      break;
    case 'error':
      prefix = chalk.red('✗');
      messageColor = chalk.red;
      break;
    case 'tx':
      prefix = chalk.cyan('⟠');
      messageColor = chalk.cyan;
      break;
    case 'proof':
      prefix = chalk.magenta('◈');
      messageColor = chalk.magenta;
      break;
    case 'tweet':
      prefix = chalk.blue('𝕏');
      messageColor = chalk.blue;
      break;
    default:
      prefix = chalk.gray('•');
      messageColor = chalk.white;
  }

  console.log(
    chalk.gray(time) + ' ' +
    chalk.yellow(step) + ' ' +
    prefix + ' ' +
    messageColor(log.message)
  );

  if (log.data) {
    for (const [key, value] of Object.entries(log.data)) {
      const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
      console.log(chalk.gray(`      ${key}: `) + chalk.white(valueStr));
    }
  }
}

function printBanner(): void {
  console.clear();
  // Set terminal title to hide path
  process.stdout.write('\x1b]0;Mitama Demo\x07');
  console.log(chalk.magenta(`
  ███╗   ███╗██╗████████╗ █████╗ ███╗   ███╗ █████╗
  ████╗ ████║██║╚══██╔══╝██╔══██╗████╗ ████║██╔══██╗
  ██╔████╔██║██║   ██║   ███████║██╔████╔██║███████║
  ██║╚██╔╝██║██║   ██║   ██╔══██║██║╚██╔╝██║██╔══██║
  ██║ ╚═╝ ██║██║   ██║   ██║  ██║██║ ╚═╝ ██║██║  ██║
  ╚═╝     ╚═╝╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝
`));
  console.log(chalk.gray('  御魂 - Live Demo Stream'));
  console.log(chalk.gray('  Connecting to stream...'));
  console.log(chalk.gray('  ─────────────────────────────────────────────────\n'));
}

printBanner();

const es = new EventSource(STREAM_URL);

es.addEventListener('status', (event: MessageEvent) => {
  const data = JSON.parse(event.data);
  console.log(chalk.gray('  Status: ') + chalk.yellow(data.status));
  if (data.status === 'idle') {
    console.log(chalk.gray('  Waiting for demo to start...'));
    console.log(chalk.gray('  Trigger with !mitama-demo on X\n'));
  }
});

es.addEventListener('log', (event: MessageEvent) => {
  const log: DemoLog = JSON.parse(event.data);
  formatLog(log);
});

es.addEventListener('ping', () => {
  // Silent keep-alive
});

es.onerror = (err) => {
  console.log(chalk.red('\n  Connection error. Reconnecting...'));
};

es.onopen = () => {
  console.log(chalk.green('  Connected to stream\n'));
};

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log(chalk.gray('\n\n  Disconnecting...'));
  es.close();
  process.exit(0);
});
