import { describe, it, expect } from 'vitest';
import {
  OracleAgentError,
  ConfigurationError,
  BlockchainError,
  TransactionError,
  AccountNotFoundError,
  DeserializationError,
  ValidationError,
  RateLimitError,
  EvaluationError,
  VotingError,
  AlreadyVotedError,
  InsufficientStakeError,
  isRetryableError,
  formatError,
} from '../lib/errors';

describe('errors', () => {
  describe('OracleAgentError', () => {
    it('creates error with code and context', () => {
      const error = new OracleAgentError('test message', 'TEST_CODE', { key: 'value' });
      expect(error.message).toBe('test message');
      expect(error.code).toBe('TEST_CODE');
      expect(error.context).toEqual({ key: 'value' });
      expect(error.name).toBe('OracleAgentError');
    });
  });

  describe('ConfigurationError', () => {
    it('has correct code', () => {
      const error = new ConfigurationError('missing config');
      expect(error.code).toBe('CONFIG_ERROR');
      expect(error.name).toBe('ConfigurationError');
    });
  });

  describe('BlockchainError', () => {
    it('has correct code', () => {
      const error = new BlockchainError('rpc failed');
      expect(error.code).toBe('BLOCKCHAIN_ERROR');
      expect(error.name).toBe('BlockchainError');
    });
  });

  describe('TransactionError', () => {
    it('includes signature in context', () => {
      const error = new TransactionError('tx failed', 'abc123');
      expect(error.signature).toBe('abc123');
      expect(error.context?.signature).toBe('abc123');
    });
  });

  describe('AccountNotFoundError', () => {
    it('includes address and type', () => {
      const error = new AccountNotFoundError('abc123', 'Escrow');
      expect(error.address).toBe('abc123');
      expect(error.accountType).toBe('Escrow');
      expect(error.message).toContain('Escrow account not found');
    });
  });

  describe('DeserializationError', () => {
    it('includes all context', () => {
      const error = new DeserializationError('addr', 'Escrow', 'invalid data');
      expect(error.address).toBe('addr');
      expect(error.accountType).toBe('Escrow');
      expect(error.reason).toBe('invalid data');
    });
  });

  describe('RateLimitError', () => {
    it('includes retry delay', () => {
      const error = new RateLimitError(5000);
      expect(error.retryAfterMs).toBe(5000);
      expect(error.code).toBe('RATE_LIMIT');
    });
  });

  describe('AlreadyVotedError', () => {
    it('includes escrow PDA', () => {
      const error = new AlreadyVotedError('escrow123');
      expect(error.escrowPda).toBe('escrow123');
      expect(error.message).toContain('Already voted');
    });
  });

  describe('InsufficientStakeError', () => {
    it('includes required and available amounts', () => {
      const error = new InsufficientStakeError(5, 2);
      expect(error.required).toBe(5);
      expect(error.available).toBe(2);
      expect(error.message).toContain('5 SOL');
      expect(error.message).toContain('2 SOL');
    });
  });

  describe('isRetryableError', () => {
    it('returns true for RateLimitError', () => {
      expect(isRetryableError(new RateLimitError(1000))).toBe(true);
    });

    it('returns true for retryable blockchain errors', () => {
      expect(isRetryableError(new BlockchainError('connection timeout'))).toBe(true);
      expect(isRetryableError(new BlockchainError('blockhash expired'))).toBe(true);
      expect(isRetryableError(new BlockchainError('503 service unavailable'))).toBe(true);
    });

    it('returns false for non-retryable errors', () => {
      expect(isRetryableError(new ValidationError('invalid'))).toBe(false);
      expect(isRetryableError(new BlockchainError('invalid account'))).toBe(false);
      expect(isRetryableError(new Error('random'))).toBe(false);
    });
  });

  describe('formatError', () => {
    it('formats OracleAgentError with context', () => {
      const error = new ValidationError('bad input', { field: 'score' });
      const formatted = formatError(error);
      expect(formatted).toContain('[VALIDATION_ERROR]');
      expect(formatted).toContain('bad input');
      expect(formatted).toContain('score');
    });

    it('formats regular errors', () => {
      const error = new Error('regular error');
      expect(formatError(error)).toBe('regular error');
    });

    it('formats non-errors', () => {
      expect(formatError('string error')).toBe('string error');
      expect(formatError(123)).toBe('123');
    });
  });
});
