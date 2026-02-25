#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const servicesDir = path.join(repoRoot, 'services');

if (!fs.existsSync(servicesDir)) {
  console.error('error: services directory not found');
  process.exit(1);
}

const serviceNames = fs
  .readdirSync(servicesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b));

const failures = [];

for (const service of serviceNames) {
  const servicePath = path.join(servicesDir, service);
  const packagePath = path.join(servicePath, 'package.json');
  if (!fs.existsSync(packagePath)) {
    continue;
  }

  const readmePath = path.join(servicePath, 'README.md');
  const envExamplePath = path.join(servicePath, '.env.example');

  if (!fs.existsSync(readmePath)) {
    failures.push(`${service}: missing README.md`);
  }
  if (!fs.existsSync(envExamplePath)) {
    failures.push(`${service}: missing .env.example`);
  }
}

if (failures.length > 0) {
  console.error('Service onboarding checks failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Service onboarding checks passed for ${serviceNames.length} services.`);
