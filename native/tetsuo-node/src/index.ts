// Node.js FFI bindings for tetsuo-core

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

let libTetsuo: any = null;
let initialized = false;

function findLibrary(): string | null {
  const possiblePaths = [
    // Development path
    path.join(__dirname, '../../tetsuo-core/lib/libtetsuo.so'),
    path.join(__dirname, '../../tetsuo-core/lib/libtetsuo.dylib'),
    // Installed path
    '/usr/local/lib/libtetsuo.so',
    '/usr/local/lib/libtetsuo.dylib',
    // Homebrew path (macOS)
    '/opt/homebrew/lib/libtetsuo.so',
    '/opt/homebrew/lib/libtetsuo.dylib',
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

export function initNative(): boolean {
  if (initialized) return libTetsuo !== null;

  initialized = true;

  if (!ffi || !ref) {
    console.warn('tetsuo-native: ffi-napi not available, using fallback');
    return false;
  }

  const libPath = findLibrary();
  if (!libPath) {
    console.warn('tetsuo-native: libtetsuo not found, using fallback');
    return false;
  }

  try {
    libTetsuo = ffi.Library(libPath, {
      'tetsuo_init': ['bool', []],
      'tetsuo_ctx_create': ['pointer', ['pointer']],
      'tetsuo_ctx_destroy': ['void', ['pointer']],
      'tetsuo_verify': ['int', ['pointer', 'pointer']],
      'pairing_is_initialized': ['bool', []],
    });

    // Initialize the library
    if (!libTetsuo.tetsuo_init()) {
      console.warn('tetsuo-native: tetsuo_init failed');
      libTetsuo = null;
      return false;
    }

    return true;
  } catch (e) {
    console.warn('tetsuo-native: Failed to load library:', e);
    libTetsuo = null;
    return false;
  }
}

export function isPairingAvailable(): boolean {
  if (!libTetsuo) return false;
  try {
    return libTetsuo.pairing_is_initialized();
  } catch {
    return false;
  }
}

// Returns null if native unavailable
export function verifyProofNative(proof: NativeProof): VerifyResult | null {
  if (!libTetsuo) {
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
    const ctx = libTetsuo.tetsuo_ctx_create(configBuf);
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
      const result = libTetsuo.tetsuo_verify(ctx, proofBuf);

      // Result codes: 0 = OK, 1 = INVALID, 2 = BELOW_THRESHOLD, 3 = EXPIRED, 4 = MALFORMED, 5 = BLACKLISTED
      if (result === 0) {
        return { valid: true };
      } else {
        const errors = ['OK', 'Invalid proof', 'Below threshold', 'Expired', 'Malformed', 'Blacklisted'];
        return { valid: false, error: errors[result] || 'Unknown error' };
      }
    } finally {
      libTetsuo.tetsuo_ctx_destroy(ctx);
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
