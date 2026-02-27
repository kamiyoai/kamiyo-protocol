#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const GITHUB_REQUIRED_SECRETS = [
  'KAMIYO_CANARY_SOLANA_RPC_URL',
  'KAMIYO_CANARY_JWT_SECRET',
  'KAMIYO_CANARY_API_SECRET',
  'KAMIYO_CANARY_ANTHROPIC_API_KEY',
  'KAMIYO_CANARY_OPERATOR_PRIVATE_KEY',
  'KAMIYO_CANARY_AGENT_PRIVATE_KEY',
  'KAMIYO_CANARY_CDP_API_KEY_ID',
  'KAMIYO_CANARY_CDP_API_KEY_SECRET',
  'KAMIYO_CANARY_CDP_WALLET_SECRET',
  'KAMIYO_CANARY_PARANET_DKG_ENDPOINT',
  'KAMIYO_CANARY_PARANET_PRIVATE_KEY',
  'KAMIYO_CANARY_PARANET_UAL',
  'KAMIYO_CANARY_PARANET_OPERATOR_GLOBAL_ID',
  'KAMIYO_CANARY_PARANET_ATTESTOR_GLOBAL_ID',
  'KAMIYO_CANARY_ALERT_WEBHOOK',
  'KAMIYO_RENDER_API_KEY',
];

const RENDER_SERVICES = [
  {
    id: 'srv-d5knjad6ubrc738s5d6g',
    name: 'kamiyo-api',
    requiredKeys: [
      'SOLANA_RPC_URL',
      'JWT_SECRET',
      'API_SECRET',
      'ANTHROPIC_API_KEY',
      'CDP_API_KEY_ID',
      'CDP_API_KEY_SECRET',
      'CDP_WALLET_SECRET',
      'PARANET_DKG_ENDPOINT',
      'PARANET_PRIVATE_KEY',
      'PARANET_UAL',
      'PARANET_OPERATOR_GLOBAL_ID',
      'PARANET_ATTESTOR_GLOBAL_ID',
    ],
  },
  {
    id: 'crn-d6bcahur433s73d2c47g',
    name: 'kamiyo-operator-kyoshin-exec',
    requiredKeys: [
      'SOLANA_RPC_URL',
      'ANTHROPIC_API_KEY',
      'KAMIYO_OPERATOR_PRIVATE_KEY',
      'KAMIYO_DKG_ENDPOINT',
      'KAMIYO_DKG_BLOCKCHAIN',
      'KAMIYO_DKG_PRIVATE_KEY',
      'KAMIYO_DKG_PARANET_UAL',
    ],
  },
  {
    id: 'crn-d6bcb956ubrc73cgvhlg',
    name: 'kamiyo-operator-kyoshin-exec-v2',
    requiredKeys: [
      'SOLANA_RPC_URL',
      'ANTHROPIC_API_KEY',
      'KAMIYO_OPERATOR_PRIVATE_KEY',
      'KAMIYO_DKG_ENDPOINT',
      'KAMIYO_DKG_BLOCKCHAIN',
      'KAMIYO_DKG_PRIVATE_KEY',
      'KAMIYO_DKG_PARANET_UAL',
    ],
  },
];

const PARITY_CHECKS = [
  {
    githubSecret: 'KAMIYO_CANARY_SOLANA_RPC_URL',
    renderTargets: [{ serviceId: 'srv-d5knjad6ubrc738s5d6g', key: 'SOLANA_RPC_URL' }],
  },
  {
    githubSecret: 'KAMIYO_CANARY_JWT_SECRET',
    renderTargets: [{ serviceId: 'srv-d5knjad6ubrc738s5d6g', key: 'JWT_SECRET' }],
  },
  {
    githubSecret: 'KAMIYO_CANARY_API_SECRET',
    renderTargets: [{ serviceId: 'srv-d5knjad6ubrc738s5d6g', key: 'API_SECRET' }],
  },
  {
    githubSecret: 'KAMIYO_CANARY_ANTHROPIC_API_KEY',
    renderTargets: [
      { serviceId: 'srv-d5knjad6ubrc738s5d6g', key: 'ANTHROPIC_API_KEY' },
      { serviceId: 'crn-d6bcahur433s73d2c47g', key: 'ANTHROPIC_API_KEY' },
      { serviceId: 'crn-d6bcb956ubrc73cgvhlg', key: 'ANTHROPIC_API_KEY' },
    ],
  },
  {
    githubSecret: 'KAMIYO_CANARY_CDP_API_KEY_ID',
    renderTargets: [{ serviceId: 'srv-d5knjad6ubrc738s5d6g', key: 'CDP_API_KEY_ID' }],
  },
  {
    githubSecret: 'KAMIYO_CANARY_CDP_API_KEY_SECRET',
    renderTargets: [{ serviceId: 'srv-d5knjad6ubrc738s5d6g', key: 'CDP_API_KEY_SECRET' }],
  },
  {
    githubSecret: 'KAMIYO_CANARY_CDP_WALLET_SECRET',
    renderTargets: [{ serviceId: 'srv-d5knjad6ubrc738s5d6g', key: 'CDP_WALLET_SECRET' }],
  },
  {
    githubSecret: 'KAMIYO_CANARY_PARANET_DKG_ENDPOINT',
    renderTargets: [{ serviceId: 'srv-d5knjad6ubrc738s5d6g', key: 'PARANET_DKG_ENDPOINT' }],
  },
  {
    githubSecret: 'KAMIYO_CANARY_PARANET_PRIVATE_KEY',
    renderTargets: [{ serviceId: 'srv-d5knjad6ubrc738s5d6g', key: 'PARANET_PRIVATE_KEY' }],
  },
  {
    githubSecret: 'KAMIYO_CANARY_PARANET_UAL',
    renderTargets: [{ serviceId: 'srv-d5knjad6ubrc738s5d6g', key: 'PARANET_UAL' }],
  },
  {
    githubSecret: 'KAMIYO_CANARY_PARANET_OPERATOR_GLOBAL_ID',
    renderTargets: [{ serviceId: 'srv-d5knjad6ubrc738s5d6g', key: 'PARANET_OPERATOR_GLOBAL_ID' }],
  },
  {
    githubSecret: 'KAMIYO_CANARY_PARANET_ATTESTOR_GLOBAL_ID',
    renderTargets: [{ serviceId: 'srv-d5knjad6ubrc738s5d6g', key: 'PARANET_ATTESTOR_GLOBAL_ID' }],
  },
];

function listGithubSecrets() {
  const output = execFileSync('gh', ['secret', 'list', '--json', 'name'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GH_TOKEN: process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? '',
    },
  });
  const rows = JSON.parse(output);
  return new Set(rows.map((row) => row.name));
}

function parseRenderEnvKeys(raw) {
  try {
    const parsed = JSON.parse(raw);
    return new Set((Array.isArray(parsed) ? parsed : []).map((row) => row?.envVar?.key).filter(Boolean));
  } catch {
    const keys = new Set();
    const regex = /"key":"([^"]+)"/g;
    let match;
    while ((match = regex.exec(raw)) !== null) {
      keys.add(match[1]);
    }
    return keys;
  }
}

function parseRenderCursors(raw) {
  const cursors = [];
  const regex = /"cursor":"([^"]+)"/g;
  let match;
  while ((match = regex.exec(raw)) !== null) {
    cursors.push(match[1]);
  }
  return cursors;
}

async function fetchRenderEnvKeys(serviceId, apiKey) {
  const allKeys = new Set();
  const seenCursors = new Set();
  let cursor = null;

  for (let page = 0; page < 64; page += 1) {
    const url = cursor
      ? `https://api.render.com/v1/services/${serviceId}/env-vars?cursor=${encodeURIComponent(cursor)}`
      : `https://api.render.com/v1/services/${serviceId}/env-vars`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Render env fetch failed for ${serviceId}: HTTP ${response.status}`);
    }

    const raw = await response.text();
    const pageKeys = parseRenderEnvKeys(raw);
    for (const key of pageKeys) {
      allKeys.add(key);
    }

    const pageCursors = parseRenderCursors(raw);
    if (pageCursors.length === 0) {
      break;
    }

    const nextCursor = pageCursors[pageCursors.length - 1];
    if (!nextCursor || seenCursors.has(nextCursor)) {
      break;
    }

    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  return allKeys;
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  mkdirSync(dir, { recursive: true });
}

async function main() {
  const report = {
    at: new Date().toISOString(),
    github: {
      required: GITHUB_REQUIRED_SECRETS,
      presentCount: 0,
      missing: [],
    },
    render: {
      services: [],
      errors: [],
    },
    parity: {
      checks: [],
      failures: [],
    },
    ok: true,
  };

  let githubSecrets;
  try {
    githubSecrets = listGithubSecrets();
  } catch (error) {
    report.ok = false;
    report.github.missing = [...GITHUB_REQUIRED_SECRETS];
    report.render.errors.push(`failed_to_list_github_secrets:${error instanceof Error ? error.message : String(error)}`);
    githubSecrets = new Set();
  }

  report.github.presentCount = GITHUB_REQUIRED_SECRETS.filter((name) => githubSecrets.has(name)).length;
  report.github.missing = GITHUB_REQUIRED_SECRETS.filter((name) => !githubSecrets.has(name));
  if (report.github.missing.length > 0) {
    report.ok = false;
  }

  const renderApiKey = process.env.KAMIYO_RENDER_API_KEY ?? process.env.RENDER_API_KEY ?? '';
  const renderByService = new Map();

  if (!renderApiKey) {
    report.ok = false;
    report.render.errors.push('missing_render_api_key');
  } else {
    for (const service of RENDER_SERVICES) {
      try {
        const keys = await fetchRenderEnvKeys(service.id, renderApiKey);
        renderByService.set(service.id, keys);
        const missing = service.requiredKeys.filter((key) => !keys.has(key));
        report.render.services.push({
          id: service.id,
          name: service.name,
          requiredCount: service.requiredKeys.length,
          presentCount: service.requiredKeys.length - missing.length,
          missing,
        });
        if (missing.length > 0) {
          report.ok = false;
        }
      } catch (error) {
        report.ok = false;
        report.render.services.push({
          id: service.id,
          name: service.name,
          requiredCount: service.requiredKeys.length,
          presentCount: 0,
          missing: [...service.requiredKeys],
        });
        report.render.errors.push(
          `${service.id}:${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  for (const check of PARITY_CHECKS) {
    const githubPresent = githubSecrets.has(check.githubSecret);
    const missingTargets = [];
    for (const target of check.renderTargets) {
      const keys = renderByService.get(target.serviceId);
      if (!keys || !keys.has(target.key)) {
        missingTargets.push(target);
      }
    }

    const ok = githubPresent && missingTargets.length === 0;
    report.parity.checks.push({
      githubSecret: check.githubSecret,
      githubPresent,
      renderTargets: check.renderTargets,
      missingTargets,
      ok,
    });
    if (!ok) {
      report.ok = false;
      report.parity.failures.push(check.githubSecret);
    }
  }

  const reportPath =
    process.env.PARITY_REPORT_PATH ||
    `reports/secret-env-parity-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  ensureDir(reportPath);
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(`report_path=${reportPath}`);
  console.log(`github_present=${report.github.presentCount}/${report.github.required.length}`);
  console.log(`render_services_checked=${report.render.services.length}`);
  console.log(`parity_failures=${report.parity.failures.length}`);

  if (!report.ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
