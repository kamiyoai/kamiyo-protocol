import { ValidationError } from './errors';

// Solana base58 alphabet (no 0, I, O, l)
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const BASE58_SEARCH_REGEX = /[1-9A-HJ-NP-Za-km-z]{32,44}/;

export function isValidSolanaAddress(address: string): boolean {
  if (!address || typeof address !== 'string') return false;
  if (!BASE58_REGEX.test(address)) return false;

  // Additional check: all characters in base58 alphabet
  for (const char of address) {
    if (!BASE58_ALPHABET.includes(char)) return false;
  }

  return true;
}

export function validateSolanaAddress(address: string, fieldName: string): void {
  if (!isValidSolanaAddress(address)) {
    throw new ValidationError(`Invalid Solana address for ${fieldName}: ${address}`, {
      field: fieldName,
      value: address,
    });
  }
}

export function isValidQualityScore(score: unknown): score is number {
  if (typeof score !== 'number') return false;
  if (!Number.isInteger(score)) return false;
  return score >= 0 && score <= 100;
}

export function validateQualityScore(score: unknown): number {
  if (!isValidQualityScore(score)) {
    throw new ValidationError(`Invalid quality score: ${score}. Must be integer 0-100`, {
      value: score,
    });
  }
  return score;
}

export function parseEscrowIdFromText(text: string): string | null {
  if (!text || typeof text !== 'string') return null;

  const match = text.match(BASE58_SEARCH_REGEX);
  if (!match) return null;

  const candidate = match[0];
  return isValidSolanaAddress(candidate) ? candidate : null;
}

export function parseScoreFromText(text: string): number | null {
  if (!text || typeof text !== 'string') return null;

  // Match patterns like "vote 75", "score: 80", "submit 65"
  const match = text.match(/(?:vote|score|submit)[\s:]+(\d+)/i);
  if (!match) return null;

  const score = parseInt(match[1], 10);
  return isValidQualityScore(score) ? score : null;
}

export function sanitizeForLLM(input: string): string {
  if (!input || typeof input !== 'string') return '';

  // Remove potential prompt injection patterns
  const sanitized = input
    // Remove markdown code blocks that could contain instructions
    .replace(/```[\s\S]*?```/g, '[code block removed]')
    // Remove HTML-like tags
    .replace(/<[^>]*>/g, '')
    // Remove common prompt injection prefixes
    .replace(/^(ignore|disregard|forget)[\s:]*(previous|all|above)[\s:]*(instructions?)?/gi, '')
    // Truncate to reasonable length
    .slice(0, 1000);

  return sanitized.trim();
}

export function validateRequired<T>(
  value: T | null | undefined,
  fieldName: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw new ValidationError(`Missing required field: ${fieldName}`, { field: fieldName });
  }
}

export function validatePositive(value: number, fieldName: string): void {
  if (typeof value !== 'number' || value <= 0) {
    throw new ValidationError(`${fieldName} must be a positive number`, {
      field: fieldName,
      value,
    });
  }
}

export function validateRange(
  value: number,
  min: number,
  max: number,
  fieldName: string
): void {
  if (typeof value !== 'number' || value < min || value > max) {
    throw new ValidationError(`${fieldName} must be between ${min} and ${max}`, {
      field: fieldName,
      value,
      min,
      max,
    });
  }
}
