export const UAL_PATTERN = /^did:dkg:[a-z]+\/0x[a-fA-F0-9]+\/\d+$/;
export const MIN_STAKE_SOL = 0.01;
export const MAX_STAKE_SOL = 1000;
export const MAX_SPARQL_LENGTH = 10000;
export const SPARQL_DANGEROUS_PATTERNS = [
  /DROP\s+/i,
  /DELETE\s+/i,
  /INSERT\s+/i,
  /CLEAR\s+/i,
  /LOAD\s+/i,
  /CREATE\s+/i,
];

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function validateUal(ual: unknown, fieldName = 'assetUAL'): string {
  if (typeof ual !== 'string') {
    throw new ValidationError(`${fieldName} must be a string`);
  }
  if (!ual.trim()) {
    throw new ValidationError(`${fieldName} is required`);
  }
  if (!UAL_PATTERN.test(ual)) {
    throw new ValidationError(`${fieldName} must be a valid UAL format (did:dkg:<network>/0x<address>/<id>)`);
  }
  return ual;
}

export function validateStakeAmount(amount: unknown): number {
  if (typeof amount !== 'number' || isNaN(amount)) {
    throw new ValidationError('stakeAmount must be a number');
  }
  if (amount < MIN_STAKE_SOL) {
    throw new ValidationError(`stakeAmount must be at least ${MIN_STAKE_SOL} SOL`);
  }
  if (amount > MAX_STAKE_SOL) {
    throw new ValidationError(`stakeAmount cannot exceed ${MAX_STAKE_SOL} SOL`);
  }
  return amount;
}

export function validateScore(score: unknown, fieldName: string): number {
  if (typeof score !== 'number' || isNaN(score)) {
    throw new ValidationError(`${fieldName} must be a number`);
  }
  if (score < 0 || score > 100) {
    throw new ValidationError(`${fieldName} must be between 0 and 100`);
  }
  return Math.round(score);
}

export function validateSparql(sparql: unknown): string {
  if (typeof sparql !== 'string') {
    throw new ValidationError('sparql must be a string');
  }
  if (!sparql.trim()) {
    throw new ValidationError('sparql query is required');
  }
  if (sparql.length > MAX_SPARQL_LENGTH) {
    throw new ValidationError(`sparql query exceeds maximum length of ${MAX_SPARQL_LENGTH}`);
  }
  for (const pattern of SPARQL_DANGEROUS_PATTERNS) {
    if (pattern.test(sparql)) {
      throw new ValidationError('sparql query contains prohibited operations');
    }
  }
  return sparql;
}

export function validateReason(reason: unknown): string {
  if (typeof reason !== 'string') {
    throw new ValidationError('reason must be a string');
  }
  if (!reason.trim()) {
    throw new ValidationError('reason is required');
  }
  if (reason.length > 1000) {
    throw new ValidationError('reason cannot exceed 1000 characters');
  }
  return reason.trim();
}

export function validateOptionalScore(score: unknown, fieldName: string, defaultValue: number): number {
  if (score === undefined || score === null) {
    return defaultValue;
  }
  return validateScore(score, fieldName);
}
