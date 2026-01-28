import { describe, it, expect } from 'vitest';
import {
  KamiyoError,
  ValidationError,
  UalError,
  StakeError,
  StakeNotFoundError,
  StakeAlreadyExistsError,
  StakeAlreadyResolvedError,
  OracleError,
  OracleNotFoundError,
  OracleNotRegisteredError,
  InsufficientStakeError,
  CommitmentError,
  RevealError,
  CommitWindowExpiredError,
  RevealWindowExpiredError,
  InvalidCommitmentError,
  DisputeError,
  DisputeNotFoundError,
  DisputeAlreadyExistsError,
  DisputeAlreadyResolvedError,
  DisputeWindowExpiredError,
  CannotDisputePendingError,
  InferenceError,
  InferenceNotFoundError,
  QueryError,
  SparqlError,
  DkgConnectionError,
} from '../errors.js';

describe('Error Classes', () => {
  describe('KamiyoError', () => {
    it('creates error with message and code', () => {
      const error = new KamiyoError('Test error', 'TEST_ERROR');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.name).toBe('KamiyoError');
    });

    it('includes cause in stack trace', () => {
      const cause = new Error('Root cause');
      const error = new KamiyoError('Wrapper error', 'WRAPPED', cause);
      expect(error.cause).toBe(cause);
      expect(error.stack).toContain('Caused by');
    });

    it('is instanceof Error', () => {
      const error = new KamiyoError('Test', 'TEST');
      expect(error instanceof Error).toBe(true);
      expect(error instanceof KamiyoError).toBe(true);
    });
  });

  describe('ValidationError', () => {
    it('creates error with field name', () => {
      const error = new ValidationError('Invalid value', 'fieldName');
      expect(error.message).toBe('Invalid value');
      expect(error.field).toBe('fieldName');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.name).toBe('ValidationError');
    });

    it('works without field name', () => {
      const error = new ValidationError('Generic validation error');
      expect(error.field).toBeUndefined();
    });

    it('is instanceof KamiyoError', () => {
      const error = new ValidationError('Test');
      expect(error instanceof KamiyoError).toBe(true);
      expect(error instanceof ValidationError).toBe(true);
    });
  });

  describe('UalError', () => {
    it('creates error with UAL', () => {
      const error = new UalError('Invalid UAL format', 'did:invalid:ual');
      expect(error.message).toBe('Invalid UAL format');
      expect(error.ual).toBe('did:invalid:ual');
      expect(error.code).toBe('UAL_ERROR');
      expect(error.name).toBe('UalError');
    });
  });

  describe('Stake Errors', () => {
    it('StakeError has correct code', () => {
      const error = new StakeError('Generic stake error');
      expect(error.code).toBe('STAKE_ERROR');
      expect(error.name).toBe('StakeError');
    });

    it('StakeNotFoundError includes UAL in message', () => {
      const error = new StakeNotFoundError('did:dkg:otp/0x123/1');
      expect(error.message).toContain('did:dkg:otp/0x123/1');
      expect(error.assetUal).toBe('did:dkg:otp/0x123/1');
      expect(error.name).toBe('StakeNotFoundError');
    });

    it('StakeAlreadyExistsError includes UAL in message', () => {
      const error = new StakeAlreadyExistsError('did:dkg:otp/0x123/1');
      expect(error.message).toContain('did:dkg:otp/0x123/1');
      expect(error.name).toBe('StakeAlreadyExistsError');
    });

    it('StakeAlreadyResolvedError includes status', () => {
      const error = new StakeAlreadyResolvedError('did:dkg:otp/0x123/1', 'verified');
      expect(error.message).toContain('verified');
      expect(error.status).toBe('verified');
      expect(error.name).toBe('StakeAlreadyResolvedError');
    });

    it('StakeErrors extend StakeError', () => {
      expect(new StakeNotFoundError('x') instanceof StakeError).toBe(true);
      expect(new StakeAlreadyExistsError('x') instanceof StakeError).toBe(true);
      expect(new StakeAlreadyResolvedError('x', 'y') instanceof StakeError).toBe(true);
    });
  });

  describe('Oracle Errors', () => {
    it('OracleError has correct code', () => {
      const error = new OracleError('Generic oracle error');
      expect(error.code).toBe('ORACLE_ERROR');
      expect(error.name).toBe('OracleError');
    });

    it('OracleNotFoundError includes oracle ID', () => {
      const error = new OracleNotFoundError('oracle123');
      expect(error.message).toContain('oracle123');
      expect(error.name).toBe('OracleNotFoundError');
    });

    it('OracleNotRegisteredError includes oracle ID', () => {
      const error = new OracleNotRegisteredError('oracle456');
      expect(error.message).toContain('oracle456');
      expect(error.name).toBe('OracleNotRegisteredError');
    });

    it('InsufficientStakeError includes amounts', () => {
      const error = new InsufficientStakeError('1000000', '500');
      expect(error.message).toContain('1000000');
      expect(error.message).toContain('500');
      expect(error.name).toBe('InsufficientStakeError');
    });

    it('CommitmentError and subclasses', () => {
      const error = new CommitmentError('Commitment failed');
      expect(error.name).toBe('CommitmentError');
      expect(error instanceof OracleError).toBe(true);

      const windowError = new CommitWindowExpiredError('did:dkg:otp/0x123/1');
      expect(windowError.message).toContain('Commit window expired');
      expect(windowError.name).toBe('CommitWindowExpiredError');
      expect(windowError instanceof CommitmentError).toBe(true);
    });

    it('RevealError and subclasses', () => {
      const error = new RevealError('Reveal failed');
      expect(error.name).toBe('RevealError');
      expect(error instanceof OracleError).toBe(true);

      const windowError = new RevealWindowExpiredError('did:dkg:otp/0x123/1');
      expect(windowError.name).toBe('RevealWindowExpiredError');
      expect(windowError instanceof RevealError).toBe(true);

      const invalidError = new InvalidCommitmentError();
      expect(invalidError.message).toContain('does not match');
      expect(invalidError.name).toBe('InvalidCommitmentError');
      expect(invalidError instanceof RevealError).toBe(true);
    });
  });

  describe('Dispute Errors', () => {
    it('DisputeError has correct code', () => {
      const error = new DisputeError('Generic dispute error');
      expect(error.code).toBe('DISPUTE_ERROR');
      expect(error.name).toBe('DisputeError');
    });

    it('DisputeNotFoundError includes dispute ID', () => {
      const error = new DisputeNotFoundError('dispute123');
      expect(error.message).toContain('dispute123');
      expect(error.name).toBe('DisputeNotFoundError');
    });

    it('DisputeAlreadyExistsError includes IDs', () => {
      const error = new DisputeAlreadyExistsError('did:dkg:otp/0x123/1', 'existing456');
      expect(error.message).toContain('existing456');
      expect(error.name).toBe('DisputeAlreadyExistsError');
    });

    it('DisputeAlreadyResolvedError includes status', () => {
      const error = new DisputeAlreadyResolvedError('dispute123', 'resolved');
      expect(error.message).toContain('resolved');
      expect(error.name).toBe('DisputeAlreadyResolvedError');
    });

    it('DisputeWindowExpiredError', () => {
      const error = new DisputeWindowExpiredError('did:dkg:otp/0x123/1');
      expect(error.message).toContain('expired');
      expect(error.name).toBe('DisputeWindowExpiredError');
    });

    it('CannotDisputePendingError', () => {
      const error = new CannotDisputePendingError();
      expect(error.message).toContain('pending');
      expect(error.name).toBe('CannotDisputePendingError');
    });

    it('Dispute errors extend DisputeError', () => {
      expect(new DisputeNotFoundError('x') instanceof DisputeError).toBe(true);
      expect(new DisputeAlreadyExistsError('x', 'y') instanceof DisputeError).toBe(true);
      expect(new DisputeAlreadyResolvedError('x', 'y') instanceof DisputeError).toBe(true);
      expect(new DisputeWindowExpiredError('x') instanceof DisputeError).toBe(true);
      expect(new CannotDisputePendingError() instanceof DisputeError).toBe(true);
    });
  });

  describe('Inference Errors', () => {
    it('InferenceError has correct code', () => {
      const error = new InferenceError('Generic inference error');
      expect(error.code).toBe('INFERENCE_ERROR');
      expect(error.name).toBe('InferenceError');
    });

    it('InferenceNotFoundError includes inference ID', () => {
      const error = new InferenceNotFoundError('inference123');
      expect(error.message).toContain('inference123');
      expect(error.name).toBe('InferenceNotFoundError');
      expect(error instanceof InferenceError).toBe(true);
    });
  });

  describe('Query Errors', () => {
    it('QueryError has correct code', () => {
      const error = new QueryError('Query failed');
      expect(error.code).toBe('QUERY_ERROR');
      expect(error.name).toBe('QueryError');
    });

    it('QueryError can include cause', () => {
      const cause = new Error('Underlying error');
      const error = new QueryError('Query failed', cause);
      expect(error.cause).toBe(cause);
    });

    it('SparqlError extends QueryError', () => {
      const error = new SparqlError('Invalid SPARQL');
      expect(error.name).toBe('SparqlError');
      expect(error instanceof QueryError).toBe(true);
    });

    it('DkgConnectionError extends QueryError', () => {
      const error = new DkgConnectionError('Connection failed');
      expect(error.name).toBe('DkgConnectionError');
      expect(error instanceof QueryError).toBe(true);
    });
  });

  describe('Error Hierarchy', () => {
    it('all errors extend KamiyoError and Error', () => {
      const errors = [
        new ValidationError('test'),
        new UalError('test', 'ual'),
        new StakeError('test'),
        new OracleError('test'),
        new DisputeError('test'),
        new InferenceError('test'),
        new QueryError('test'),
      ];

      for (const error of errors) {
        expect(error instanceof Error).toBe(true);
        expect(error instanceof KamiyoError).toBe(true);
      }
    });

    it('errors can be caught by parent type', () => {
      const stakeError = new StakeNotFoundError('ual');
      const oracleError = new InvalidCommitmentError();
      const disputeError = new CannotDisputePendingError();

      expect(() => {
        throw stakeError;
      }).toThrow(StakeError);

      expect(() => {
        throw oracleError;
      }).toThrow(OracleError);

      expect(() => {
        throw disputeError;
      }).toThrow(DisputeError);
    });
  });
});
