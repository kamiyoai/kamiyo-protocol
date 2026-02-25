#!/usr/bin/env node

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const policyPath = path.join(repoRoot, 'config/security-audit-policy.json');

function runJsonCommand(command) {
  try {
    return execSync(command, {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    if (typeof error?.stdout === 'string' && error.stdout.trim().length > 0) {
      return error.stdout;
    }
    throw error;
  }
}

function workspaceFromPath(depPath) {
  return String(depPath).split('>')[0];
}

function parseDate(value) {
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? null : ts;
}

function isExpired(dateStr, nowTs) {
  const expiry = parseDate(dateStr);
  if (expiry === null) return true;
  return nowTs > expiry;
}

function findAllowedJs(policy, ghsaId, workspace) {
  return policy.js.allowlistedHigh.find((entry) => {
    if (entry.id !== ghsaId) return false;
    return entry.workspaces.includes(workspace);
  });
}

function findAllowedRust(policy, rustsecId) {
  return policy.rust.allowlisted.find((entry) => entry.id === rustsecId);
}

function main() {
  if (!fs.existsSync(policyPath)) {
    console.error(`error: missing policy file at ${policyPath}`);
    process.exit(1);
  }

  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  const nowTs = Date.now();

  const pnpmRaw = runJsonCommand('pnpm audit --prod --json');
  const cargoRaw = runJsonCommand('cargo audit --json');
  const pnpmAudit = JSON.parse(pnpmRaw);
  const cargoAudit = JSON.parse(cargoRaw);

  const jsViolations = [];
  const seenHighChecks = new Set();
  const scopePrefixes = policy.js.scopePrefixes;

  const advisories = Object.values(pnpmAudit.advisories || {});
  for (const advisory of advisories) {
    const severity = advisory.severity;
    if (severity !== 'high' && severity !== 'critical') continue;

    const ghsaId = advisory.github_advisory_id || advisory.url || advisory.module_name || 'unknown';
    const findings = advisory.findings || [];

    for (const finding of findings) {
      for (const depPath of finding.paths || []) {
        const workspace = workspaceFromPath(depPath);
        if (!scopePrefixes.some((prefix) => workspace.startsWith(prefix))) {
          continue;
        }

        const key = `${ghsaId}|${workspace}|${severity}`;
        if (seenHighChecks.has(key)) continue;
        seenHighChecks.add(key);

        if (severity === 'critical') {
          jsViolations.push({
            severity,
            ghsaId,
            module: advisory.module_name,
            workspace,
            path: depPath,
            reason: 'critical severity is never allowlisted',
          });
          continue;
        }

        const allowed = findAllowedJs(policy, ghsaId, workspace);
        if (!allowed) {
          jsViolations.push({
            severity,
            ghsaId,
            module: advisory.module_name,
            workspace,
            path: depPath,
            reason: 'missing allowlist entry',
          });
          continue;
        }

        if (isExpired(allowed.expires, nowTs)) {
          jsViolations.push({
            severity,
            ghsaId,
            module: advisory.module_name,
            workspace,
            path: depPath,
            reason: `allowlist expired on ${allowed.expires}`,
          });
        }
      }
    }
  }

  const rustViolations = [];
  const rustVulns = cargoAudit?.vulnerabilities?.list || [];
  for (const vuln of rustVulns) {
    const rustsecId = vuln?.advisory?.id;
    if (!rustsecId) continue;
    const allowed = findAllowedRust(policy, rustsecId);
    if (!allowed) {
      rustViolations.push({
        id: rustsecId,
        package: vuln?.package?.name || 'unknown',
        reason: 'missing allowlist entry',
      });
      continue;
    }
    if (isExpired(allowed.expires, nowTs)) {
      rustViolations.push({
        id: rustsecId,
        package: vuln?.package?.name || 'unknown',
        reason: `allowlist expired on ${allowed.expires}`,
      });
    }
  }

  const jsSummary = pnpmAudit?.metadata?.vulnerabilities || {};
  const rustSummary = {
    vulnerabilities: cargoAudit?.vulnerabilities?.count || 0,
    unmaintained: cargoAudit?.warnings?.unmaintained?.length || 0,
    unsound: cargoAudit?.warnings?.unsound?.length || 0,
  };

  console.log('security audit policy summary');
  console.log(
    `js: critical=${jsSummary.critical || 0} high=${jsSummary.high || 0} moderate=${jsSummary.moderate || 0} low=${jsSummary.low || 0}`
  );
  console.log(
    `rust: vulnerabilities=${rustSummary.vulnerabilities} unmaintained=${rustSummary.unmaintained} unsound=${rustSummary.unsound}`
  );

  if (jsViolations.length > 0) {
    console.error('\njs policy violations:');
    for (const v of jsViolations) {
      console.error(
        `- [${v.severity}] ${v.ghsaId} (${v.module}) workspace=${v.workspace} reason=${v.reason}`
      );
    }
  }

  if (rustViolations.length > 0) {
    console.error('\nrust policy violations:');
    for (const v of rustViolations) {
      console.error(`- ${v.id} (${v.package}) reason=${v.reason}`);
    }
  }

  if (jsViolations.length > 0 || rustViolations.length > 0) {
    process.exit(1);
  }

  console.log('\nsecurity audit policy checks passed.');
}

main();
