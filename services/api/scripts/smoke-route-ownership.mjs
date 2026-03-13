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
  const metadata = JSON.parse(version.body);
  const runtime = metadata.runtime || {};
  const capabilities = metadata.capabilities || {};
  const routeSurface = runtime.routeSurface || (runtime.profile === 'full' ? 'full' : 'kizuna-core');

  const kizunaCore = await fetchJson(`${baseUrl}/api/credits/info`);
  if (kizunaCore.response.status !== 200) {
    throw new Error(`/api/credits/info returned ${kizunaCore.response.status}`);
  }
  assertHeader(kizunaCore.response, 'x-kamiyo-route-ownership', 'kizuna-core');
  const creditsInfo = JSON.parse(kizunaCore.body);
  if (typeof creditsInfo.enabled !== 'boolean') {
    throw new Error('/api/credits/info did not include enabled');
  }
  if (typeof capabilities.credits?.enabled !== 'boolean') {
    throw new Error('/version missing capabilities.credits.enabled');
  }

  const moduleRoute = await fetchJson(`${baseUrl}/api/hive/health`);
  const legacy = await fetchJson(`${baseUrl}/api/fusion/fairscale/health`);

  if (routeSurface === 'full') {
    if (!moduleRoute.response.ok) {
      throw new Error(`/api/hive/health returned ${moduleRoute.response.status}`);
    }
    assertHeader(moduleRoute.response, 'x-kamiyo-route-ownership', 'module');

    if (!legacy.response.ok) {
      throw new Error(`/api/fusion/fairscale/health returned ${legacy.response.status}`);
    }
    assertHeader(legacy.response, 'x-kamiyo-route-ownership', 'kizuna-core');
  } else {
    if (moduleRoute.response.status !== 404) {
      throw new Error(`/api/hive/health expected 404 on kizuna-core route surface, got ${moduleRoute.response.status}`);
    }
    if (!legacy.response.ok) {
      throw new Error(
        `/api/fusion/fairscale/health expected 200 on kizuna-core route surface, got ${legacy.response.status}`
      );
    }
    assertHeader(legacy.response, 'x-kamiyo-route-ownership', 'kizuna-core');
  }

  process.stdout.write('route ownership smoke passed\n');
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`route ownership smoke failed: ${message}\n`);
  process.exit(1);
});
