export class AgentError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

export class ProviderError extends AgentError {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly cause?: unknown
  ) {
    super(message, 'PROVIDER_ERROR');
    this.name = 'ProviderError';
  }
}

export class ToolError extends AgentError {
  constructor(
    message: string,
    public readonly toolName: string,
    public readonly cause?: unknown
  ) {
    super(message, 'TOOL_ERROR');
    this.name = 'ToolError';
  }
}

export class ToolValidationError extends ToolError {
  constructor(
    toolName: string,
    public readonly issues: string[]
  ) {
    super(`Validation failed for tool "${toolName}": ${issues.join(', ')}`, toolName);
    this.name = 'ToolValidationError';
  }
}

export class MaxTurnsError extends AgentError {
  constructor(public readonly turns: number) {
    super(`Agent reached max turns (${turns}) without completing`, 'MAX_TURNS');
    this.name = 'MaxTurnsError';
  }
}

export class TimeoutError extends AgentError {
  constructor(
    message: string,
    public readonly timeoutMs: number
  ) {
    super(message, 'TIMEOUT');
    this.name = 'TimeoutError';
  }
}

export class NotInitializedError extends AgentError {
  constructor(what: string) {
    super(`${what} not initialized. Call agent.start() first.`, 'NOT_INITIALIZED');
    this.name = 'NotInitializedError';
  }
}
