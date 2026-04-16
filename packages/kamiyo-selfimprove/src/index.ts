export {
  type AgentGenome,
  type GenomeMutation,
  canonicalizeGenome,
  hashGenome,
  mutateGenome,
  validateGenome,
} from './genome';

export { type SampleStats, sampleNormal, sampleStats, welchPTwoSided, welchT } from './stats';

export {
  type Counter,
  type DatabaseAdapter,
  type Histogram,
  type JudgeLLM,
  type JudgeMessage,
  type JudgeResponse,
  type Logger,
  type MetricsAdapter,
  type PreparedStatement,
  type Transaction,
  createNoopLogger,
  createNoopMetrics,
} from './adapters';

export {
  type InitOptions,
  type SelfImproveContext,
  getContext,
  initSelfImprove,
  resetContextForTests,
} from './context';

export {
  type AgentVariant,
  type CreateVariantInput,
  type LeaderboardEntry,
  type PromotionResult,
  type RecordEntryResult,
  type VariantStatus,
  createVariant,
  evaluateAndPromote,
  forkVariant,
  getLeaderboard,
  getVariant,
  getVariantScores,
  listActiveVariants,
  recordTournamentEntry,
  thompsonSample,
} from './service';

export {
  type MarkStatusResult,
  type Tournament,
  type TournamentOptions,
  type TournamentStatus,
  createTournament,
  getTournament,
  markTournamentStatus,
  recordParticipantResult,
  totalTournamentCost,
} from './tournament';

export {
  type RouteDecision,
  type StandingTournament,
  type SweepResult,
  getOrCreateStandingTournament,
  isBanditRoutingEnabled,
  listTaskTypes,
  routeVariant,
  sweepPromotions,
} from './bandit';

export {
  runVariantSweepNow,
  startVariantSweepWorker,
  stopVariantSweepWorker,
} from './sweep-worker';

export {
  type JudgedEntryResult,
  type JudgeResult,
  type ScoreOutputInput,
  type TaskRubric,
  getRubric,
  recordJudgedEntry,
  scoreOutput,
  upsertRubric,
} from './judge';
