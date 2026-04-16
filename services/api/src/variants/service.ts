import './bootstrap';

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
} from '@kamiyo/selfimprove';
