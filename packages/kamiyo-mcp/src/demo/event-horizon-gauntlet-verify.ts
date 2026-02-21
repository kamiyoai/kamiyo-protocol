#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  EventHorizonArtifactInput,
  EventHorizonAttestation,
} from '../truth-court/index.js';
import { verifyEventHorizonAttestation } from '../truth-court/index.js';

interface CliOptions {
  attestationPath: string;
}

function printUsage(): void {
  console.log(
    'Usage: npm run demo:event-horizon:gauntlet:verify -- --attestation <path-to-attestation.json>'
  );
}

function parseCli(argv: string[]): CliOptions {
  let attestationPath = '';
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      continue;
    }
    switch (arg) {
      case '--attestation':
        if (!argv[index + 1]) {
          throw new Error('--attestation requires a value');
        }
        attestationPath = argv[index + 1];
        index += 1;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (!attestationPath) {
    throw new Error('--attestation is required');
  }

  return { attestationPath };
}

async function toArtifactInputs(
  attestation: EventHorizonAttestation,
  baseDir: string
): Promise<EventHorizonArtifactInput[]> {
  const artifacts: EventHorizonArtifactInput[] = [];
  for (const artifact of attestation.artifacts) {
    const filePath = path.resolve(baseDir, artifact.file);
    try {
      const bytes = await readFile(filePath);
      artifacts.push({ file: artifact.file, bytes: new Uint8Array(bytes) });
    } catch {
      continue;
    }
  }
  return artifacts;
}

async function main(): Promise<void> {
  const cli = parseCli(process.argv.slice(2));
  const absolutePath = path.resolve(process.cwd(), cli.attestationPath);
  const raw = JSON.parse(await readFile(absolutePath, 'utf8')) as EventHorizonAttestation;
  const baseDir = path.dirname(absolutePath);
  const artifacts = await toArtifactInputs(raw, baseDir);
  const verification = verifyEventHorizonAttestation({
    attestation: raw,
    artifacts,
  });

  console.log(
    JSON.stringify(
      {
        attestationPath: absolutePath,
        verification,
      },
      null,
      2
    )
  );

  if (!verification.success) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('gauntlet attestation verification failed:', error);
  process.exit(1);
});
