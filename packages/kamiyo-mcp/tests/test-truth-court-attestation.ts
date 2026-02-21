#!/usr/bin/env ts-node

import { Keypair } from '@solana/web3.js';
import {
  createEventHorizonAttestation,
  verifyEventHorizonAttestation,
} from '../src/truth-court/index.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passed += 1;
  } else {
    console.log(`[FAIL] ${message}`);
    failed += 1;
  }
}

function buildArtifacts(): Array<{ file: string; bytes: Uint8Array }> {
  return [
    { file: 'run.json', bytes: Buffer.from('{"run":"ok"}\n', 'utf8') },
    { file: 'headline.txt', bytes: Buffer.from('headline\n', 'utf8') },
    { file: 'thread.md', bytes: Buffer.from('thread\n', 'utf8') },
    { file: 'metrics.prom', bytes: Buffer.from('metric 1\n', 'utf8') },
  ];
}

async function testRoundTripVerification(): Promise<void> {
  console.log('\n=== round trip ===');
  const signer = Keypair.generate();
  const artifacts = buildArtifacts();
  const attestation = createEventHorizonAttestation({
    runId: 'gauntlet-seed-1',
    signerSecretKey: signer.secretKey,
    artifacts,
    createdAt: '2025-01-01T00:00:00.000Z',
  });
  const verification = verifyEventHorizonAttestation({ attestation, artifacts });

  assert(verification.success, 'attestation verifies with original artifacts');
  assert(
    verification.checks.every((check) => check.verified),
    'every artifact check is verified'
  );
}

async function testTamperDetection(): Promise<void> {
  console.log('\n=== tamper detection ===');
  const signer = Keypair.generate();
  const artifacts = buildArtifacts();
  const attestation = createEventHorizonAttestation({
    runId: 'gauntlet-seed-2',
    signerSecretKey: signer.secretKey,
    artifacts,
  });

  const tamperedArtifacts = artifacts.map((artifact) =>
    artifact.file === 'run.json'
      ? { ...artifact, bytes: Buffer.from('{"run":"tampered"}\n', 'utf8') }
      : artifact
  );
  const verification = verifyEventHorizonAttestation({
    attestation,
    artifacts: tamperedArtifacts,
  });

  assert(!verification.success, 'tampered artifact fails verification');
  const runCheck = verification.checks.find((check) => check.file === 'run.json');
  assert(Boolean(runCheck) && !runCheck!.hashMatches, 'tampered artifact hash mismatch is reported');
}

async function testMissingArtifactDetection(): Promise<void> {
  console.log('\n=== missing artifact detection ===');
  const signer = Keypair.generate();
  const artifacts = buildArtifacts();
  const attestation = createEventHorizonAttestation({
    runId: 'gauntlet-seed-3',
    signerSecretKey: signer.secretKey,
    artifacts,
  });
  const verification = verifyEventHorizonAttestation({
    attestation,
    artifacts: artifacts.filter((artifact) => artifact.file !== 'metrics.prom'),
  });

  assert(!verification.success, 'missing artifact fails verification');
  const metricsCheck = verification.checks.find((check) => check.file === 'metrics.prom');
  assert(Boolean(metricsCheck) && !metricsCheck!.found, 'missing artifact is reported');
}

async function main(): Promise<void> {
  await testRoundTripVerification();
  await testTamperDetection();
  await testMissingArtifactDetection();

  console.log('\n=== summary ===');
  console.log(`passed=${passed}`);
  console.log(`failed=${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('attestation test suite crashed:', error);
  process.exit(1);
});
