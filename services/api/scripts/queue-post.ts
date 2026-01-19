#!/usr/bin/env npx ts-node
// Queue a manual post with optional image

import { queueManualPost, approvePost } from '../src/autonomous';
import * as fs from 'fs';
import * as path from 'path';

const args = process.argv.slice(2);

if (args.length < 1) {
  console.log('Usage: npx ts-node scripts/queue-post.ts "tweet content" [image_path] [--approve]');
  console.log('');
  console.log('Examples:');
  console.log('  npx ts-node scripts/queue-post.ts "gm"');
  console.log('  npx ts-node scripts/queue-post.ts "check this chart" ./images/chart.png');
  console.log('  npx ts-node scripts/queue-post.ts "posting now" ./img.png --approve');
  process.exit(1);
}

const content = args[0];
const autoApprove = args.includes('--approve');
const imagePath = args.find(a => a !== content && a !== '--approve' && fs.existsSync(a));

if (imagePath) {
  const resolved = path.resolve(imagePath);
  if (!fs.existsSync(resolved)) {
    console.error(`Image not found: ${resolved}`);
    process.exit(1);
  }
  console.log(`Image: ${resolved}`);
}

const post = queueManualPost(content, imagePath ? path.resolve(imagePath) : undefined);
console.log(`Queued post #${post.id}: "${content.slice(0, 50)}${content.length > 50 ? '...' : ''}"`);

if (autoApprove) {
  approvePost(post.id);
  console.log('Auto-approved. Will post on next cycle.');
} else {
  console.log('Status: pending (approve via DM or --approve flag)');
}
