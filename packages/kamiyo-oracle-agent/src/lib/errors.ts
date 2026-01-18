export class OracleAgentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'OracleAgentError';
  }
}

export class ConfigurationError extends OracleAgentError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONFIG_ERROR', context);
    this.name = 'ConfigurationError';
  }
}

export class BlockchainError extends OracleAgentError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'BLOCKCHAIN_ERROR', context);
    this.name = 'BlockchainError';
  }
}

export class TransactionError extends BlockchainError {
  constructor(
    message: string,
    public readonly signature?: string,
    context?: Record<string, unknown>
  ) {
    super(message, { ...context, signature });
    this.name = 'TransactionError';
  }
}

export class AccountNotFoundError extends BlockchainError {
  constructor(
    public readonly address: string,
    public readonly accountType: string
  ) {
    super(`${accountType} account not found: ${address}`, { address, accountType });
    this.name = 'AccountNotFoundError';
  }
}

export class DeserializationError extends BlockchainError {
  constructor(
    public readonly address: string,
    public readonly accountType: string,
    public readonly reason: string
  ) {
    super(`Failed to deserialize ${accountType} at ${address}: ${reason}`, {
      address,
      accountType,
      reason,
    });
    this.name = 'DeserializationError';
  }
}

export class ValidationError extends OracleAgentError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', context);
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends OracleAgentError {
  constructor(
    public readonly retryAfterMs: number,
    context?: Record<string, unknown>
  ) {
    super(`Rate limited, retry after ${retryAfterMs}ms`, 'RATE_LIMIT', {
      ...context,
      retryAfterMs,
    });
    this.name = 'RateLimitError';
  }
}

export class EvaluationError extends OracleAgentError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'EVALUATION_ERROR', context);
    this.name = 'EvaluationError';
  }
}

export class VotingError extends OracleAgentError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'VOTING_ERROR', context);
    this.name = 'VotingError';
  }
}

export class AlreadyVotedError extends VotingError {
  constructor(public readonly escrowPda: string) {
    super(`Already voted on escrow: ${escrowPda}`, { escrowPda });
    this.name = 'AlreadyVotedError';
  }
}

export class InsufficientStakeError extends VotingError {
  constructor(
    public readonly required: number,
    public readonly available: number
  ) {
    super(`Insufficient stake: required ${required} SOL, have ${available} SOL`, {
      required,
      available,
    });
    this.name = 'InsufficientStakeError';
  }
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof RateLimitError) return true;
  if (error instanceof BlockchainError) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('timeout') ||
      msg.includes('connection') ||
      msg.includes('blockhash') ||
      msg.includes('429') ||
      msg.includes('503')
    );
  }
  return false;
}

export function formatError(error: unknown): string {
  if (error instanceof OracleAgentError) {
    const ctx = error.context ? ` (${JSON.stringify(error.context)})` : '';
    return `[${error.code}] ${error.message}${ctx}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
