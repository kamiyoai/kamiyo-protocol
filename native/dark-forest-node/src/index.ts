// Node.js FFI bindings for dark-forest-core

import * as path from 'path';
import * as fs from 'fs';

// Try to load ffi-napi, gracefully handle if not available
let ffi: typeof import('ffi-napi') | null = null;
let ref: typeof import('ref-napi') | null = null;

try {
  ffi = require('ffi-napi');
  ref = require('ref-napi');
} catch {
  // FFI not available - will use fallback
}

export interface VerifyResult {
  valid: boolean;
  error?: string;
}

export interface NativeProof {
  type: number;
  timestamp: number;
  threshold: number;
  agentPk: Buffer;
  commitment: Buffer;
  proofData: Buffer;
}

let libDarkForest: any = null;
let initialized = false;

function findLibrary(): string | null {
  const possiblePaths = [
    // Development path
    path.join(__dirname, '../../dark-forest-core/lib/libdark-forest.so'),
    path.join(__dirname, '../../dark-forest-core/lib/libdark-forest.dylib'),
    // Installed path
    '/usr/local/lib/libdark-forest.so',
    '/usr/local/lib/libdark-forest.dylib',
    // Homebrew path (macOS)
    '/opt/homebrew/lib/libdark-forest.so',
    '/opt/homebrew/lib/libdark-forest.dylib',
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

export function initNative(): boolean {
  if (initialized) return libDarkForest !== null;

  initialized = true;

  if (!ffi || !ref) {
    console.warn('dark-forest-native: ffi-napi not available, using fallback');
    return false;
  }

  const libPath = findLibrary();
  if (!libPath) {
    console.warn('dark-forest-native: libdark-forest not found, using fallback');
    return false;
  }

  try {
    libDarkForest = ffi.Library(libPath, {
      'dark_forest_init': ['bool', []],
      'dark_forest_ctx_create': ['pointer', ['pointer']],
      'dark_forest_ctx_destroy': ['void', ['pointer']],
      'dark_forest_verify': ['int', ['pointer', 'pointer']],
      'pairing_is_initialized': ['bool', []],
    });

    // Initialize the library
    if (!libDarkForest.dark_forest_init()) {
      console.warn('dark-forest-native: dark_forest_init failed');
      libDarkForest = null;
      return false;
    }

    return true;
  } catch (e) {
    console.warn('dark-forest-native: Failed to load library:', e);
    libDarkForest = null;
    return false;
  }
}

export function isPairingAvailable(): boolean {
  if (!libDarkForest) return false;
  try {
    return libDarkForest.pairing_is_initialized();
  } catch {
    return false;
  }
}

// Returns null if native unavailable
export function verifyProofNative(proof: NativeProof): VerifyResult | null {
  if (!libDarkForest) {
    return null; // Signal to use fallback
  }

  if (!ref) {
    return null;
  }

  try {
    // Create config struct
    const configBuf = Buffer.alloc(16);
    configBuf.writeUInt8(proof.threshold, 0);
    configBuf.writeUInt32LE(3600, 4); // max_proof_age

    // Create context
    const ctx = libDarkForest.dark_forest_ctx_create(configBuf);
    if (ctx.isNull()) {
      return { valid: false, error: 'Failed to create context' };
    }

    try {
      // Create proof struct (matches proof_wire_t)
      const proofBuf = Buffer.alloc(196); // sizeof(proof_wire_t)
      proofBuf.writeUInt8(proof.type, 0);
      proofBuf.writeUInt8(1, 1); // version
      proofBuf.writeUInt16LE(0, 2); // flags
      proofBuf.writeUInt32LE(proof.timestamp, 4);
      proof.agentPk.copy(proofBuf, 8, 0, 32);
      proof.commitment.copy(proofBuf, 40, 0, 32);
      proof.proofData.copy(proofBuf, 72, 0, Math.min(proof.proofData.length, 128));

      // Verify
      const result = libDarkForest.dark_forest_verify(ctx, proofBuf);

      // Result codes: 0 = OK, 1 = INVALID, 2 = BELOW_THRESHOLD, 3 = EXPIRED, 4 = MALFORMED, 5 = BLACKLISTED
      if (result === 0) {
        return { valid: true };
      } else {
        const errors = ['OK', 'Invalid proof', 'Below threshold', 'Expired', 'Malformed', 'Blacklisted'];
        return { valid: false, error: errors[result] || 'Unknown error' };
      }
    } finally {
      libDarkForest.dark_forest_ctx_destroy(ctx);
    }
  } catch (e) {
    return { valid: false, error: String(e) };
  }
}

export function verifyProof(
  proof: NativeProof,
  fallbackValidator?: (proof: NativeProof) => VerifyResult
): VerifyResult {
  // Try native verification first
  const nativeResult = verifyProofNative(proof);
  if (nativeResult !== null) {
    return nativeResult;
  }

  // Fall back to provided validator or basic checks
  if (fallbackValidator) {
    return fallbackValidator(proof);
  }

  // Basic structural validation
  if (!proof.agentPk || proof.agentPk.length !== 32) {
    return { valid: false, error: 'Invalid agent public key' };
  }
  if (!proof.commitment || proof.commitment.length !== 32) {
    return { valid: false, error: 'Invalid commitment' };
  }
  if (!proof.proofData || proof.proofData.length < 64) {
    return { valid: false, error: 'Invalid proof data' };
  }

  // Timestamp check
  const now = Math.floor(Date.now() / 1000);
  if (now - proof.timestamp > 3600) {
    return { valid: false, error: 'Proof expired' };
  }

  // Without native pairing, we cannot verify cryptographically.
  // Return invalid to prevent bypassing ZK security.
  return {
    valid: false,
    error: 'Native verification unavailable - cannot verify proof cryptographically',
  };
}

// Auto-initialize on import
initNative();
