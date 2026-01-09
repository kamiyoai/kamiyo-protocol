import { PublicKey } from '@solana/web3.js';
import { HeliusAdapterError } from './types';
import { LIMITS } from './constants';

export class ValidationError extends HeliusAdapterError {
  constructor(msg: string) {
    super(msg, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export function validateApiKey(key: string): void {
  if (!key || typeof key !== 'string') throw new ValidationError('API key required');
  if (key.length > LIMITS.MAX_API_KEY_LENGTH) throw new ValidationError(`API key too long (max ${LIMITS.MAX_API_KEY_LENGTH})`);
  if (!/^[a-zA-Z0-9-_]+$/.test(key)) throw new ValidationError('API key has invalid characters');
}

export function validateTransactionId(txId: string): void {
  if (!txId || typeof txId !== 'string') throw new ValidationError('Transaction ID required');
  if (txId.length > LIMITS.MAX_TRANSACTION_ID_LENGTH) throw new ValidationError(`Transaction ID too long (max ${LIMITS.MAX_TRANSACTION_ID_LENGTH})`);
  if (txId.length === 0) throw new ValidationError('Transaction ID empty');
}

export function validateSignature(sig: string): void {
  if (!sig || typeof sig !== 'string') throw new ValidationError('Signature required');
  if (sig.length < 80 || sig.length > 90) throw new ValidationError('Invalid signature length');
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(sig)) throw new ValidationError('Invalid signature characters');
}

export function validateSignatures(sigs: string[]): void {
  if (!Array.isArray(sigs)) throw new ValidationError('Signatures must be array');
  if (sigs.length === 0) throw new ValidationError('At least one signature required');
  if (sigs.length > LIMITS.MAX_SIGNATURES_BATCH) throw new ValidationError(`Too many signatures (max ${LIMITS.MAX_SIGNATURES_BATCH})`);
  sigs.forEach((s, i) => {
    try { validateSignature(s); }
    catch (e) { throw new ValidationError(`Invalid signature[${i}]: ${e instanceof Error ? e.message : String(e)}`); }
  });
}

export function validatePublicKey(key: PublicKey | string, name = 'Public key'): PublicKey {
  try {
    const pk = typeof key === 'string' ? new PublicKey(key) : key;
    pk.toBase58();
    return pk;
  } catch {
    throw new ValidationError(`${name} is not valid`);
  }
}

export function validatePublicKeys(keys: PublicKey[], name = 'Public keys'): void {
  if (!Array.isArray(keys)) throw new ValidationError(`${name} must be array`);
  if (keys.length > LIMITS.MAX_ACCOUNTS_BATCH) throw new ValidationError(`${name} too many (max ${LIMITS.MAX_ACCOUNTS_BATCH})`);
  keys.forEach((k, i) => validatePublicKey(k, `${name}[${i}]`));
}

export function validateNumber(val: number, name: string, min: number, max: number): void {
  if (typeof val !== 'number' || isNaN(val)) throw new ValidationError(`${name} must be number`);
  if (val < min || val > max) throw new ValidationError(`${name} must be ${min}-${max}`);
}

export function validatePositiveInteger(val: number, name: string): void {
  if (typeof val !== 'number' || isNaN(val)) throw new ValidationError(`${name} must be number`);
  if (!Number.isInteger(val) || val <= 0) throw new ValidationError(`${name} must be positive integer`);
}

export function validateConfig(cfg: {
  apiKey: string;
  maxRetries?: number;
  retryDelayMs?: number;
  rateLimitRps?: number;
}): void {
  validateApiKey(cfg.apiKey);
  if (cfg.maxRetries !== undefined) validateNumber(cfg.maxRetries, 'maxRetries', LIMITS.MIN_RETRIES, LIMITS.MAX_RETRIES);
  if (cfg.retryDelayMs !== undefined) validateNumber(cfg.retryDelayMs, 'retryDelayMs', 100, 30000);
  if (cfg.rateLimitRps !== undefined) validateNumber(cfg.rateLimitRps, 'rateLimitRps', LIMITS.MIN_RATE_LIMIT, LIMITS.MAX_RATE_LIMIT);
}
