import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test, { type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';

const GUARDED_PROMOTE_PATH = resolve(
  fileURLToPath(new URL('../../../../ops/kyoshin-exec/guarded-promote.sh', import.meta.url))
);

function writeExecutable(path: string, contents: string): void {
  writeFileSync(path, contents);
  chmodSync(path, 0o755);
}

function setupHarness(
  t: TestContext,
  economicsJson: string,
  envOverrides: Record<string, string> = {},
  commandArgs: string[] = ['canary_1', 'false']
): {
  callsFile: string;
  run: () => ReturnType<typeof spawnSync>;
} {
  const tempDir = mkdtempSync(join(tmpdir(), 'kyoshin-guarded-promote-'));
  t.after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const envFile = join(tempDir, 'kyoshin-exec.env');
  const callsFile = join(tempDir, 'promote.calls');
  const binDir = join(tempDir, 'bin');
  mkdirSync(binDir, { recursive: true });

  writeFileSync(
    envFile,
    [
      'KAMIYO_EXECUTION_STAGE=canary_0',
      'KAMIYO_EXECUTION_HARD_STOP=true',
      'KYOSHIN_HTTP_HOST=127.0.0.1',
      'KYOSHIN_HTTP_PORT=4020',
      '',
    ].join('\n')
  );

  const promoteBin = join(tempDir, 'promote.sh');
  writeExecutable(
    promoteBin,
    '#!/usr/bin/env bash\nset -euo pipefail\necho "$1,$2" >> "${PROMOTE_CALLS_FILE}"\n'
  );

  const preflightBin = join(tempDir, 'preflight.sh');
  writeExecutable(preflightBin, '#!/usr/bin/env bash\nset -euo pipefail\nexit 0\n');

  const curlBin = join(binDir, 'curl');
  writeExecutable(
    curlBin,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'if [[ "${MOCK_CURL_EXIT_CODE:-0}" != "0" ]]; then',
      '  exit "${MOCK_CURL_EXIT_CODE}"',
      'fi',
      'printf "%s" "${MOCK_ECONOMICS_JSON:-}"',
      '',
    ].join('\n')
  );

  const env = {
    ...process.env,
    ENV_FILE: envFile,
    PREFLIGHT_BIN: preflightBin,
    PROMOTE_BIN: promoteBin,
    PROMOTE_CALLS_FILE: callsFile,
    MOCK_ECONOMICS_JSON: economicsJson,
    KAMIYO_CANARY_GATE_GRACE_SECONDS: '0',
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    ...envOverrides,
  };

  return {
    callsFile,
    run: () =>
      spawnSync(GUARDED_PROMOTE_PATH, commandArgs, {
        env,
        encoding: 'utf8',
      }),
  };
}

test('guarded promote passes gates and promotes stage with valid economics payload', t => {
  const harness = setupHarness(
    t,
    JSON.stringify(
      {
        laneSummary: {
          byLaneAndKind: [{ lane: 'marketplace_direct', kind: 'job', events: 2, amountSol: 0.021, amountUsd: 2.1 }],
        },
        jobs: { executed: 2 },
        revenue: { netSol: 0.019 },
        intake: { pending: 12 },
      },
      null,
      2
    )
  );

  const result = harness.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"ok": true/);
  assert.equal(readFileSync(harness.callsFile, 'utf8').trim(), 'canary_1,false');
});

test('guarded promote blocks promotion when settled jobs gate is not met', t => {
  const harness = setupHarness(
    t,
    JSON.stringify({
      laneSummary: {
        byLaneAndKind: [{ lane: 'marketplace_direct', kind: 'job', events: 0, amountSol: 0, amountUsd: 0 }],
      },
      revenue: { netSol: 0.02 },
      intake: { pending: 5 },
    })
  );

  const result = harness.run();
  assert.equal(result.status, 2);
  assert.match(result.stderr, /blocked: canary gate check failed before promotion/);
  assert.equal(result.stdout.includes('"min_settled_jobs": false'), true);
  assert.equal(existsSync(harness.callsFile), false);
});

test('guarded promote can enforce executed jobs threshold when configured', t => {
  const harness = setupHarness(
    t,
    JSON.stringify({
      laneSummary: {
        byLaneAndKind: [{ lane: 'marketplace_direct', kind: 'job', events: 0, amountSol: 0, amountUsd: 0 }],
      },
      jobs: { executed: 1 },
      revenue: { netSol: 0.02 },
      intake: { pending: 5 },
    }),
    {
      KAMIYO_CANARY_GATE_MIN_SETTLED_JOBS: '0',
      KAMIYO_CANARY_GATE_MIN_EXECUTED_JOBS: '2',
    }
  );

  const result = harness.run();
  assert.equal(result.status, 2);
  assert.match(result.stderr, /blocked: canary gate check failed before promotion/);
  assert.equal(result.stdout.includes('"min_executed_jobs": false'), true);
  assert.equal(existsSync(harness.callsFile), false);
});

test('guarded promote blocks promotion when economics payload is empty', t => {
  const harness = setupHarness(t, '');

  const result = harness.run();
  assert.equal(result.status, 2);
  assert.match(result.stderr, /blocked: canary gate check failed before promotion/);
  assert.equal(existsSync(harness.callsFile), false);
});

test('gate-check mode reports pass without promotion side effects', t => {
  const harness = setupHarness(
    t,
    JSON.stringify({
      laneSummary: {
        byLaneAndKind: [{ lane: 'marketplace_direct', kind: 'job', events: 2, amountSol: 0.02, amountUsd: 2 }],
      },
      jobs: { executed: 5 },
      revenue: { netSol: 0.01 },
      intake: { pending: 10 },
    }),
    {},
    ['--gate-check']
  );

  const result = harness.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"ok": true/);
  assert.equal(existsSync(harness.callsFile), false);
});

test('gate-check mode exits non-zero when thresholds fail', t => {
  const harness = setupHarness(
    t,
    JSON.stringify({
      laneSummary: {
        byLaneAndKind: [{ lane: 'marketplace_direct', kind: 'job', events: 0, amountSol: 0, amountUsd: 0 }],
      },
      jobs: { executed: 0 },
      revenue: { netSol: -1 },
      intake: { pending: 1000 },
    }),
    {},
    ['--gate-check']
  );

  const result = harness.run();
  assert.equal(result.status, 2);
  assert.match(result.stdout, /"ok": false/);
  assert.equal(existsSync(harness.callsFile), false);
});
