import { createHash } from 'node:crypto';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

export interface EventHorizonArtifactInput {
  file: string;
  bytes: Uint8Array;
}

export interface EventHorizonAttestedArtifact {
  file: string;
  sha256: string;
  bytes: number;
  signature: string;
}

export interface EventHorizonAttestation {
  version: 1;
  scheme: 'solana-ed25519-sha256';
  runId: string;
  createdAt: string;
  signerPublicKey: string;
  artifacts: EventHorizonAttestedArtifact[];
}

export interface EventHorizonAttestationCheck {
  file: string;
  found: boolean;
  hashMatches: boolean;
  signatureValid: boolean;
  verified: boolean;
}

export interface EventHorizonAttestationVerification {
  success: boolean;
  runId: string;
  signerPublicKey: string;
  checks: EventHorizonAttestationCheck[];
  error?: string;
}

function sha256HexBytes(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function toKeypair(secretKey: Uint8Array): Keypair {
  if (secretKey.length === 64) {
    return Keypair.fromSecretKey(secretKey);
  }
  if (secretKey.length === 32) {
    return Keypair.fromSeed(secretKey);
  }
  throw new Error('signerSecretKey must be 32-byte seed or 64-byte secret key');
}

function buildSigningPayload(runId: string, file: string, sha256: string): Uint8Array {
  return new TextEncoder().encode(
    `event-horizon-attestation:v1:${runId}:${file}:${sha256}`
  );
}

export function decodeEd25519SecretKey(value: string): Uint8Array {
  const decoded = bs58.decode(value.trim());
  if (decoded.length !== 32 && decoded.length !== 64) {
    throw new Error('secret key must decode to 32 or 64 bytes');
  }
  return decoded;
}

export function createEventHorizonAttestation(params: {
  runId: string;
  signerSecretKey: Uint8Array;
  artifacts: EventHorizonArtifactInput[];
  createdAt?: string;
}): EventHorizonAttestation {
  if (!params.runId) {
    throw new Error('runId is required');
  }
  if (!params.artifacts.length) {
    throw new Error('at least one artifact is required');
  }

  const duplicateFile = new Set<string>();
  const normalizedArtifacts = params.artifacts.map((artifact) => {
    const file = artifact.file.trim();
    if (!file) {
      throw new Error('artifact file cannot be empty');
    }
    if (duplicateFile.has(file)) {
      throw new Error(`duplicate artifact file: ${file}`);
    }
    duplicateFile.add(file);
    return { file, bytes: artifact.bytes };
  });

  const signer = toKeypair(params.signerSecretKey);
  const artifacts = normalizedArtifacts
    .map((artifact) => {
      const sha256 = sha256HexBytes(artifact.bytes);
      const payload = buildSigningPayload(params.runId, artifact.file, sha256);
      const signature = bs58.encode(nacl.sign.detached(payload, signer.secretKey));
      return {
        file: artifact.file,
        sha256,
        bytes: artifact.bytes.length,
        signature,
      };
    })
    .sort((left, right) => left.file.localeCompare(right.file));

  return {
    version: 1,
    scheme: 'solana-ed25519-sha256',
    runId: params.runId,
    createdAt: params.createdAt ?? new Date().toISOString(),
    signerPublicKey: signer.publicKey.toBase58(),
    artifacts,
  };
}

export function verifyEventHorizonAttestation(params: {
  attestation: EventHorizonAttestation;
  artifacts: EventHorizonArtifactInput[];
}): EventHorizonAttestationVerification {
  const { attestation } = params;

  const fail = (
    error: string,
    checks: EventHorizonAttestationCheck[] = []
  ): EventHorizonAttestationVerification => ({
    success: false,
    runId: attestation?.runId ?? '',
    signerPublicKey: attestation?.signerPublicKey ?? '',
    checks,
    error,
  });

  if (!attestation || typeof attestation !== 'object') {
    return fail('attestation is required');
  }
  if (attestation.version !== 1) {
    return fail('unsupported attestation version');
  }
  if (attestation.scheme !== 'solana-ed25519-sha256') {
    return fail('unsupported attestation scheme');
  }
  if (!attestation.runId) {
    return fail('attestation runId is required');
  }
  if (!attestation.signerPublicKey) {
    return fail('attestation signerPublicKey is required');
  }
  if (!Array.isArray(attestation.artifacts) || attestation.artifacts.length === 0) {
    return fail('attestation artifacts are required');
  }

  let signerPublicKeyBytes: Uint8Array;
  try {
    signerPublicKeyBytes = bs58.decode(attestation.signerPublicKey);
  } catch {
    return fail('invalid signerPublicKey encoding');
  }
  if (signerPublicKeyBytes.length !== 32) {
    return fail('signerPublicKey must decode to 32 bytes');
  }

  const artifactByFile = new Map<string, Uint8Array>();
  for (const artifact of params.artifacts) {
    if (!artifact.file) {
      return fail('artifact file cannot be empty');
    }
    if (artifactByFile.has(artifact.file)) {
      return fail(`duplicate artifact input: ${artifact.file}`);
    }
    artifactByFile.set(artifact.file, artifact.bytes);
  }

  const seen = new Set<string>();
  const checks: EventHorizonAttestationCheck[] = [];
  for (const attestedArtifact of attestation.artifacts) {
    if (!attestedArtifact.file) {
      return fail('attestation artifact file cannot be empty', checks);
    }
    if (seen.has(attestedArtifact.file)) {
      return fail(`duplicate attestation artifact: ${attestedArtifact.file}`, checks);
    }
    seen.add(attestedArtifact.file);

    const bytes = artifactByFile.get(attestedArtifact.file);
    if (!bytes) {
      checks.push({
        file: attestedArtifact.file,
        found: false,
        hashMatches: false,
        signatureValid: false,
        verified: false,
      });
      continue;
    }

    const observedHash = sha256HexBytes(bytes);
    const hashMatches = observedHash === attestedArtifact.sha256;
    const payload = buildSigningPayload(
      attestation.runId,
      attestedArtifact.file,
      attestedArtifact.sha256
    );

    let signatureValid = false;
    try {
      signatureValid = nacl.sign.detached.verify(
        payload,
        bs58.decode(attestedArtifact.signature),
        signerPublicKeyBytes
      );
    } catch {
      signatureValid = false;
    }

    checks.push({
      file: attestedArtifact.file,
      found: true,
      hashMatches,
      signatureValid,
      verified: hashMatches && signatureValid,
    });
  }

  return {
    success: checks.every((check) => check.verified),
    runId: attestation.runId,
    signerPublicKey: attestation.signerPublicKey,
    checks,
  };
}
