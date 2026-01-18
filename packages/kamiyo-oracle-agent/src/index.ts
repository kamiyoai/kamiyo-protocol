import type { Plugin } from './types';

import {
  evaluateDisputeAction,
  submitVoteAction,
  checkPerformanceAction,
  claimRewardsAction,
} from './actions';

import {
  oracleStatusProvider,
  pendingDisputesProvider,
  performanceProvider,
} from './providers';

import {
  voteQualityEvaluator,
  riskAssessmentEvaluator,
} from './evaluators';

import {
  disputeListenerService,
  autoVoterService,
  rewardClaimerService,
} from './services';

export const kamiyoOraclePlugin: Plugin = {
  name: 'kamiyo-oracle',
  description: 'Oracle agent for KAMIYO dispute resolution',

  actions: [
    evaluateDisputeAction,
    submitVoteAction,
    checkPerformanceAction,
    claimRewardsAction,
  ],

  providers: [
    oracleStatusProvider,
    pendingDisputesProvider,
    performanceProvider,
  ],

  evaluators: [
    voteQualityEvaluator,
    riskAssessmentEvaluator,
  ],

  services: [
    disputeListenerService,
    autoVoterService,
    rewardClaimerService,
  ],
};

export default kamiyoOraclePlugin;

export * from './types';
export * from './config';
export * from './lib';
export * from './actions';
export * from './providers';
export * from './evaluators';
export * from './services';
export * from './deliberation';
export * from './evidence';
export * from './learning';
export * from './verification';
export * from './prediction';
