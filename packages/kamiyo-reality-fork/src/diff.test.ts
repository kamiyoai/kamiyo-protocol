import { describe, it, expect } from 'vitest';
import { diffLaunchRuns, renderDiffMarkdown, renderDiffHtml } from './diff.js';
import type { RealityForkLaunchRun } from './launch.js';

function stubRun(overrides: Partial<RealityForkLaunchRun> = {}): RealityForkLaunchRun {
  return {
    kind: 'launch',
    version: 1,
    generatedAt: '2026-04-01T00:00:00.000Z',
    title: 'test run',
    prompt: 'Should we ship?',
    repo: {
      name: 'test',
      displayPath: '$HOME/test',
      fileCount: 10,
      focusPaths: [],
      readmePath: null,
      readmeExcerpt: null,
      docs: [],
      tests: [],
      examples: [],
      fixtures: [],
      manifests: [],
      locks: [],
      ci: [],
      envExamples: [],
      licenses: [],
      assets: [],
      frameworks: [],
      installCommands: [],
      localRunCommands: [],
      remoteDependencyNotes: [],
      runtimeNotes: [],
      artifactNotes: [],
      languages: [],
      git: {
        branch: null,
        commit: null,
        remoteUrl: null,
        webUrl: null,
        changedFiles: [],
        recentCommits: [],
      },
    },
    axes: [
      { id: 'immediacy', label: 'Immediacy', score: 0.5, summary: '' },
      { id: 'clarity', label: 'Clarity', score: 0.6, summary: '' },
      { id: 'proof', label: 'Proof', score: 0.4, summary: '' },
      { id: 'distribution', label: 'Distribution', score: 0.3, summary: '' },
      { id: 'shareability', label: 'Shareability', score: 0.45, summary: '' },
      { id: 'trust', label: 'Trust', score: 0.55, summary: '' },
    ],
    signals: [],
    branches: [
      {
        id: 'narrow_launch',
        label: 'Narrow launch',
        stance: 'Flagship',
        score: 0.6,
        summary: '',
        advantages: [],
        risks: [],
        nextMoves: [],
      },
    ],
    verdict: {
      winnerBranchId: 'narrow_launch',
      label: 'Narrow launch',
      reason: 'test',
      score: 0.6,
      readiness: 0.47,
    },
    actions: [],
    posts: { announcement: '', thread: ['', '', ''] },
    ...overrides,
  };
}

describe('diffLaunchRuns', () => {
  it('computes axis deltas and detects verdict changes', () => {
    const before = stubRun();
    const after = stubRun({
      generatedAt: '2026-04-02T00:00:00.000Z',
      axes: [
        { id: 'immediacy', label: 'Immediacy', score: 0.7, summary: '' },
        { id: 'clarity', label: 'Clarity', score: 0.6, summary: '' },
        { id: 'proof', label: 'Proof', score: 0.5, summary: '' },
        { id: 'distribution', label: 'Distribution', score: 0.3, summary: '' },
        { id: 'shareability', label: 'Shareability', score: 0.45, summary: '' },
        { id: 'trust', label: 'Trust', score: 0.55, summary: '' },
      ],
      verdict: {
        winnerBranchId: 'ship_now',
        label: 'Ship now',
        reason: 'ready',
        score: 0.72,
        readiness: 0.55,
      },
    });

    const diff = diffLaunchRuns(before, after);

    expect(diff.verdictChanged).toBe(true);
    expect(diff.readinessDelta).toBeCloseTo(0.08, 2);

    const immediacy = diff.axes.find(a => a.id === 'immediacy')!;
    expect(immediacy.direction).toBe('up');
    expect(immediacy.delta).toBeCloseTo(0.2, 2);

    const clarity = diff.axes.find(a => a.id === 'clarity')!;
    expect(clarity.direction).toBe('flat');
  });

  it('renders markdown with arrow indicators', () => {
    const before = stubRun();
    const after = stubRun({
      axes: [
        { id: 'immediacy', label: 'Immediacy', score: 0.7, summary: '' },
        { id: 'clarity', label: 'Clarity', score: 0.5, summary: '' },
        { id: 'proof', label: 'Proof', score: 0.4, summary: '' },
        { id: 'distribution', label: 'Distribution', score: 0.3, summary: '' },
        { id: 'shareability', label: 'Shareability', score: 0.45, summary: '' },
        { id: 'trust', label: 'Trust', score: 0.55, summary: '' },
      ],
    });

    const diff = diffLaunchRuns(before, after);
    const md = renderDiffMarkdown(diff);

    expect(md).toContain('# Launch Diff');
    expect(md).toContain('\u25b2'); // up arrow
    expect(md).toContain('\u25bc'); // down arrow
    expect(md).toContain('+20%');
    expect(md).toContain('-10%');
  });

  it('renders valid HTML', () => {
    const diff = diffLaunchRuns(stubRun(), stubRun());
    const html = renderDiffHtml(diff);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('Launch Diff');
  });
});
