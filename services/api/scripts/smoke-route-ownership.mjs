#!/usr/bin/env node

import process from 'node:process';

const DEFAULT_BASE_URL = process.env.API_BASE_URL || 'https://api.kamiyo.ai';

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

function normalizeBaseUrl(url) {
  return url.replace(/\/+$/, '');
}

async function fetchJson(url) {
  const response = await fetch(url);
  const body = await response.text();
  return { response, body };
}

function assertHeader(response, name, expectedValue) {
  const actual = response.headers.get(name);
  if (actual !== expectedValue) {
    throw new Error(`${response.url} expected ${name}=${expectedValue}, got ${actual ?? 'null'}`);
  }
}

async function main() {
  const baseUrl = normalizeBaseUrl(getArgValue('--base-url') || DEFAULT_BASE_URL);
  process.stdout.write(`checking route ownership headers on ${baseUrl}\n`);

  const version = await fetchJson(`${baseUrl}/version`);
  if (!version.response.ok) {
    throw new Error(`/version returned ${version.response.status}`);
  }

  process.stdout.write(`version: ${version.body}\n`);
  const runtime = JSON.parse(version.body).runtime || {};

  const kizunaCore = await fetchJson(`${baseUrl}/api/credits/info`);
  if (![200, 503].includes(kizunaCore.response.status)) {
    throw new Error(`/api/credits/info returned ${kizunaCore.response.status}`);
  }
  assertHeader(kizunaCore.response, 'x-kamiyo-route-ownership', 'kizuna-core');

  const moduleRoute = await fetchJson(`${baseUrl}/api/hive/health`);
  const legacy = await fetchJson(`${baseUrl}/api/fusion/fairscale/health`);

  if (runtime.profile === 'full') {
    if (!moduleRoute.response.ok) {
      throw new Error(`/api/hive/health returned ${moduleRoute.response.status}`);
    }
    assertHeader(moduleRoute.response, 'x-kamiyo-route-ownership', 'module');

    if (!legacy.response.ok) {
      throw new Error(`/api/fusion/fairscale/health returned ${legacy.response.status}`);
    }
    assertHeader(legacy.response, 'x-kamiyo-route-ownership', 'legacy');
    assertHeader(legacy.response, 'x-kamiyo-route-status', 'legacy');
  } else {
    if (moduleRoute.response.status !== 404) {
      throw new Error(`/api/hive/health expected 404 in kizuna-core profile, got ${moduleRoute.response.status}`);
    }
    if (legacy.response.status !== 404) {
      throw new Error(`/api/fusion/fairscale/health expected 404 in kizuna-core profile, got ${legacy.response.status}`);
    }
  }

  process.stdout.write('route ownership smoke passed\n');
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`route ownership smoke failed: ${message}\n`);
  process.exit(1);
});
