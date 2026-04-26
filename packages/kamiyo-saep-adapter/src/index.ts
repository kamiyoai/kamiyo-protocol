// Public surface for @kamiyo/saep-adapter.
// Importable as: `import { SaepReader, normalizeSnapshot, ... } from '@kamiyo/saep-adapter';`

export {
  PLACEHOLDER_TASK_CONTRACT_DISCRIMINATOR,
  decodeTaskContract,
  type DecoderConfig,
} from './decoder.js';

export { SaepAdapterError, type SaepAdapterErrorCode } from './errors.js';

export { normalizeSnapshot, statusString } from './normalize.js';

export {
  DEFAULT_SAEP_TASK_MARKET_PROGRAM_ID_MAINNET,
  deriveMarketGlobalPda,
  deriveTaskEscrowPda,
  deriveTaskPda,
  type SaepProgramIds,
} from './pda.js';

export { SaepReader, type ReaderConfig } from './reader.js';

export { RISK_HASH_FIELDS, computeRiskHash, risksMatch } from './risk-hash.js';

export {
  ACTIVE_STATUSES,
  SaepTaskStatus,
  TERMINAL_STATUSES,
  isActive,
  isTerminal,
  parseSaepTaskStatus,
} from './status.js';

export type {
  ExternalWorkRef,
  SaepFundingMode,
  SaepTaskSnapshot,
  SaepTaskStatusString,
  SaepWorkRef,
  SolanaCluster,
} from './types.js';

export {
  validateForUnderwriting,
  validatedWorkRef,
  type UnderwritingContext,
  type UnderwritingPolicy,
} from './validate.js';
