#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const docsToCheck = ['README.md', 'BUILD.md', 'DEPLOYMENT.md'];
const scriptPathPattern = /\bscripts\/[A-Za-z0-9._/-]+\.(?:ts|js|cjs|mjs|sh|py)\b/g;

const missing = [];

for (const doc of docsToCheck) {
  const docPath = path.join(repoRoot, doc);
  if (!fs.existsSync(docPath)) {
    missing.push(`${doc}: file missing`);
    continue;
  }

  const content = fs.readFileSync(docPath, 'utf8');
  const matches = [...new Set(content.match(scriptPathPattern) || [])];
  for (const rel of matches) {
    const abs = path.join(repoRoot, rel);
    if (!fs.existsSync(abs)) {
      missing.push(`${doc}: missing ${rel}`);
    }
  }
}

if (missing.length > 0) {
  console.error('Documentation command drift detected:');
  for (const entry of missing) {
    console.error(`- ${entry}`);
  }
  process.exit(1);
}

console.log('Documentation command checks passed.');
