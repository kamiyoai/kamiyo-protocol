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

  // Hot neon synthwave colors matching the gradient
  const neonCyan = chalk.hex('#00FFFF');
  const neonPurple = chalk.hex('#8A2BE2');
  const neonMagenta = chalk.hex('#FF00FF');
  const neonPink = chalk.hex('#FF1493');
  const neonRed = chalk.hex('#FF0044');

  switch (log.type) {
    case 'success':
      prefix = neonCyan('✓');
      messageColor = neonCyan;
      break;
    case 'error':
      prefix = neonRed('✗');
      messageColor = neonRed;
      break;
    case 'tx':
      prefix = neonMagenta('⟠');
      messageColor = neonMagenta;
      break;
    case 'proof':
      prefix = neonPurple('◈');
      messageColor = neonPurple;
      break;
    case 'tweet':
      prefix = neonPink('𝕏');
      messageColor = neonPink;
      break;
    default:
      prefix = chalk.hex('#666666')('•');
      messageColor = chalk.hex('#AAAAAA');
  }

  console.log(
    chalk.hex('#666666')(time) + ' ' +
    chalk.hex('#00FFFF')(step) + ' ' +
    prefix + ' ' +
    messageColor(log.message)
  );

  if (log.data) {
    for (const [key, value] of Object.entries(log.data)) {
      const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
      console.log(chalk.hex('#666666')(`      ${key}: `) + chalk.hex('#8A2BE2')(valueStr));
    }
  }
}

// Smooth gradient: cyan -> purple -> magenta
function interpolateColor(color1: [number, number, number], color2: [number, number, number], t: number): string {
  const r = Math.round(color1[0] + (color2[0] - color1[0]) * t);
  const g = Math.round(color1[1] + (color2[1] - color1[1]) * t);
  const b = Math.round(color1[2] + (color2[2] - color1[2]) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function gradientText(text: string): string {
  const chars = text.split('');
  const cyan: [number, number, number] = [0, 255, 255];
  const purple: [number, number, number] = [138, 43, 226];
  const magenta: [number, number, number] = [255, 0, 255];

  return chars.map((char, i) => {
    const t = i / (chars.length - 1 || 1);
    let color: string;
    if (t < 0.5) {
      // cyan -> purple
      color = interpolateColor(cyan, purple, t * 2);
    } else {
      // purple -> magenta
      color = interpolateColor(purple, magenta, (t - 0.5) * 2);
    }
    return chalk.hex(color)(char);
  }).join('');
}

function printBanner(): void {
  console.clear();
  // Set terminal title to hide path
  process.stdout.write('\x1b]0;Mitama Demo\x07');

  const lines = [
    '  ██╗  ██╗ █████╗ ███╗   ███╗██╗██╗   ██╗ ██████╗     ███╗   ███╗██╗████████╗ █████╗ ███╗   ███╗ █████╗ ',
    '  ██║ ██╔╝██╔══██╗████╗ ████║██║╚██╗ ██╔╝██╔═══██╗    ████╗ ████║██║╚══██╔══╝██╔══██╗████╗ ████║██╔══██╗',
    '  █████╔╝ ███████║██╔████╔██║██║ ╚████╔╝ ██║   ██║    ██╔████╔██║██║   ██║   ███████║██╔████╔██║███████║',
    '  ██╔═██╗ ██╔══██║██║╚██╔╝██║██║  ╚██╔╝  ██║   ██║    ██║╚██╔╝██║██║   ██║   ██╔══██║██║╚██╔╝██║██╔══██║',
    '  ██║  ██╗██║  ██║██║ ╚═╝ ██║██║   ██║   ╚██████╔╝    ██║ ╚═╝ ██║██║   ██║   ██║  ██║██║ ╚═╝ ██║██║  ██║',
    '  ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝   ╚═╝    ╚═════╝     ╚═╝     ╚═╝╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝',
  ];

  console.log();
  lines.forEach(line => console.log(gradientText(line)));
  console.log();
  console.log(chalk.gray('  御魂 - Live @KAMIYOCompanion stream'));
  console.log(chalk.gray('  Connecting to stream...'));
  console.log(chalk.gray('  ─────────────────────────────────────────────────\n'));
}

printBanner();

const es = new EventSource(STREAM_URL);

es.addEventListener('status', (event: MessageEvent) => {
  const data = JSON.parse(event.data);
  console.log(chalk.hex('#666666')('  Status: ') + chalk.hex('#00FFFF')(data.status));
  if (data.status === 'idle') {
    console.log(chalk.hex('#666666')('  Waiting for stream...\n'));
  }
});

es.addEventListener('log', (event: MessageEvent) => {
  const log: DemoLog = JSON.parse(event.data);
  formatLog(log);
});

es.addEventListener('ping', () => {
  // Silent keep-alive
});

es.onerror = () => {
  console.log(chalk.hex('#FF0044')('\n  Connection error. Reconnecting...'));
};

es.onopen = () => {
  console.log(chalk.hex('#00FFFF')('  Connected to stream\n'));
};

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log(chalk.hex('#666666')('\n\n  Disconnecting...'));
  es.close();
  process.exit(0);
});
