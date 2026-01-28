export class KamiyoError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'KamiyoError';
    if (cause) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}

export class ValidationError extends KamiyoError {
  constructor(message: string, public readonly field?: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class UalError extends KamiyoError {
  constructor(
    message: string,
    public readonly ual: string
  ) {
    super(message, 'UAL_ERROR');
    this.name = 'UalError';
  }
}

export class StakeError extends KamiyoError {
  constructor(
    message: string,
    public readonly assetUal?: string,
    public readonly status?: string
  ) {
    super(message, 'STAKE_ERROR');
    this.name = 'StakeError';
  }
}

export class StakeNotFoundError extends StakeError {
  constructor(assetUal: string) {
    super(`No quality stake found for asset: ${assetUal}`, assetUal);
    this.name = 'StakeNotFoundError';
  }
}

export class StakeAlreadyExistsError extends StakeError {
  constructor(assetUal: string) {
    super(`Quality stake already exists for asset: ${assetUal}`, assetUal);
    this.name = 'StakeAlreadyExistsError';
  }
}

export class StakeAlreadyResolvedError extends StakeError {
  constructor(assetUal: string, status: string) {
    super(`Stake already resolved with status: ${status}`, assetUal, status);
    this.name = 'StakeAlreadyResolvedError';
  }
}

export class OracleError extends KamiyoError {
  constructor(message: string) {
    super(message, 'ORACLE_ERROR');
    this.name = 'OracleError';
  }
}

export class OracleNotFoundError extends OracleError {
  constructor(oracleId: string) {
    super(`Oracle not found: ${oracleId}`);
    this.name = 'OracleNotFoundError';
  }
}

export class OracleNotRegisteredError extends OracleError {
  constructor(oracleId: string) {
    super(`Oracle not registered: ${oracleId}`);
    this.name = 'OracleNotRegisteredError';
  }
}

export class InsufficientStakeError extends OracleError {
  constructor(required: string, actual: string) {
    super(`Insufficient oracle stake: required ${required}, got ${actual}`);
    this.name = 'InsufficientStakeError';
  }
}

export class CommitmentError extends OracleError {
  constructor(message: string) {
    super(message);
    this.name = 'CommitmentError';
  }
}

export class RevealError extends OracleError {
  constructor(message: string) {
    super(message);
    this.name = 'RevealError';
  }
}

export class CommitWindowExpiredError extends CommitmentError {
  constructor(assetUal: string) {
    super(`Commit window expired for asset: ${assetUal}`);
    this.name = 'CommitWindowExpiredError';
  }
}

export class RevealWindowExpiredError extends RevealError {
  constructor(assetUal: string) {
    super(`Reveal window expired for asset: ${assetUal}`);
    this.name = 'RevealWindowExpiredError';
  }
}

export class InvalidCommitmentError extends RevealError {
  constructor() {
    super('Revealed data does not match commitment');
    this.name = 'InvalidCommitmentError';
  }
}

export class DisputeError extends KamiyoError {
  constructor(message: string) {
    super(message, 'DISPUTE_ERROR');
    this.name = 'DisputeError';
  }
}

export class DisputeNotFoundError extends DisputeError {
  constructor(disputeId: string) {
    super(`Dispute not found: ${disputeId}`);
    this.name = 'DisputeNotFoundError';
  }
}

export class DisputeAlreadyExistsError extends DisputeError {
  constructor(assetUal: string, existingId: string) {
    super(`Active dispute already exists: ${existingId}`);
    this.name = 'DisputeAlreadyExistsError';
  }
}

export class DisputeAlreadyResolvedError extends DisputeError {
  constructor(disputeId: string, status: string) {
    super(`Dispute already resolved: ${status}`);
    this.name = 'DisputeAlreadyResolvedError';
  }
}

export class DisputeWindowExpiredError extends DisputeError {
  constructor(assetUal: string) {
    super('Dispute window has expired');
    this.name = 'DisputeWindowExpiredError';
  }
}

export class CannotDisputePendingError extends DisputeError {
  constructor() {
    super('Cannot dispute pending assessment');
    this.name = 'CannotDisputePendingError';
  }
}

export class InferenceError extends KamiyoError {
  constructor(message: string) {
    super(message, 'INFERENCE_ERROR');
    this.name = 'InferenceError';
  }
}

export class InferenceNotFoundError extends InferenceError {
  constructor(inferenceId: string) {
    super(`Inference not found: ${inferenceId}`);
    this.name = 'InferenceNotFoundError';
  }
}

export class QueryError extends KamiyoError {
  constructor(message: string, cause?: Error) {
    super(message, 'QUERY_ERROR', cause);
    this.name = 'QueryError';
  }
}

export class SparqlError extends QueryError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'SparqlError';
  }
}

export class DkgConnectionError extends QueryError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'DkgConnectionError';
  }
}
