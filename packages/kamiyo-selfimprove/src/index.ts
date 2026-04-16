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

export {
  type GenomeOverrides,
  type VariantDecisionMeta,
  applyGenomeOverrides,
  maybeRouteVariant,
  recordVariantEntry,
  toVariantDecisionMeta,
} from './routing';

export { SCHEMA_SQL, applySchema } from './schema';

export {
  type BradleyTerryResult,
  type ComparePairInput,
  type MatchResult,
  type PairwiseResult,
  type PairwiseWinner,
  type RecordMatchInput,
  comparePair,
  fitBradleyTerry,
  recordPairwiseMatch,
  updateElo,
} from './pairwise';

export {
  type AutoMutateResult,
  type JitterOptions,
  type Proposal,
  type ProposeOptions,
  autoMutateTaskType,
  crossoverGenomes,
  jitterGenome,
  proposeMutations,
} from './mutator';

export {
  type ColdStartRankEntry,
  type ColdStartRankInput,
  type EvalCase,
  type OfflineEvalInput,
  type OfflineEvalResult,
  type RunVariantFn,
  type SeedFromPromptsInput,
  coldStartRank,
  offlineEval,
  seedFromPrompts,
} from './coldstart';

export { type DashboardOptions, startDashboard } from './dashboard';

export {
  type ParetoEntry,
  type ParetoObjective,
  type ParetoOptions,
  getAllWithDomination,
  getParetoFrontier,
} from './pareto';

export {
  type VariantRunner,
  type ShadowRunOptions,
  type ShadowRunResult,
  type ShadowRunSummary,
  type ShadowStats,
  getShadowStats,
  shadowRun,
} from './shadow';

export {
  type ReplayOptions,
  type ReplayResult,
  type RescoreOptions,
  type RescoreResult,
  replayVariant,
  rescoreShadowRuns,
} from './replay';

export { anthropicJudge, geminiJudge, genericChatJudge, openaiJudge } from './judge-adapters';

export {
  type CanaryDecision,
  type CanaryPick,
  type CanaryRollout,
  type CanaryStatus,
  type CanaryStepResult,
  type EvaluateCanaryOptions,
  type StartCanaryInput,
  type StepCanaryOptions,
  evaluateCanary,
  getActiveCanary,
  listCanaryRollouts,
  pickCanaryArm,
  promoteCanary,
  rampCanary,
  rollbackCanary,
  startCanary,
  stepCanary,
} from './canary';
