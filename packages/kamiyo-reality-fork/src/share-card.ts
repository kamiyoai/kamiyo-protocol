import type { RealityForkScenario, RealityForkShareCard } from './types';

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function trimTweet(text: string): string {
  if (text.length <= 280) return text;
  return `${text.slice(0, 277)}...`;
}

export function buildRealityForkShareCard(scenario: RealityForkScenario): RealityForkShareCard {
  const winner =
    scenario.branches.find(
      (branch: RealityForkScenario['branches'][number]) =>
        branch.branchId === scenario.decision.winnerBranchId
    ) ?? null;
  const runnerUp =
    scenario.branches.find(
      (branch: RealityForkScenario['branches'][number]) => branch.verdict === 'runner_up'
    ) ?? null;
  const headline = winner
    ? `${scenario.title}: ${winner.label} wins`
    : `${scenario.title}: no winner selected`;
  const kicker = 'Fork reality. Let futures compete. Promote the strongest path.';
  const body = winner
    ? `${winner.label} won ${scenario.branches.length} readonly branches on evidence, risk, latency, and cost.`
    : `Reality Fork compared ${scenario.branches.length} readonly branches against one immutable snapshot.`;
  const scoreline = winner
    ? `${winner.label} ${percent(winner.score)} | ${runnerUp?.label ?? 'Runner-up'} ${percent(runnerUp?.score ?? 0)}`
    : `No promoted branch`;
  const bullets = winner
    ? [
        `Winner: ${winner.label}`,
        `Evidence coverage: ${percent(winner.evidenceCoverage)}`,
        `Risk penalty: ${percent(winner.riskPenalty)}`,
      ]
    : ['Readonly branch competition completed', 'Decision stayed unresolved'];

  const xPost = trimTweet(
    winner
      ? [
          `Reality Fork: ${scenario.title}`,
          '',
          `${winner.label} beat ${runnerUp?.label ?? 'the field'} across ${scenario.branches.length} readonly futures.`,
          `Evidence ${percent(winner.evidenceCoverage)} | Risk ${percent(winner.riskPenalty)} | Score ${percent(winner.score)}`,
          '',
          'Fork reality, let futures compete, promote the strongest path.',
        ].join('\n')
      : [
          `Reality Fork: ${scenario.title}`,
          '',
          `Compared ${scenario.branches.length} readonly futures against one immutable snapshot.`,
          '',
          'Fork reality, let futures compete, promote the strongest path.',
        ].join('\n')
  );

  return {
    headline,
    kicker,
    body,
    scoreline,
    bullets,
    xPost,
  };
}
