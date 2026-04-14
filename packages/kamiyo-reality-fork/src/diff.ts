import type { RealityForkLaunchAxisId, RealityForkLaunchRun } from './launch.js';

export type RealityForkLaunchAxisDelta = {
  id: RealityForkLaunchAxisId;
  label: string;
  before: number;
  after: number;
  delta: number;
  direction: 'up' | 'down' | 'flat';
};

export type RealityForkLaunchDiff = {
  before: {
    title: string;
    generatedAt: string;
    readiness: number;
    verdictLabel: string;
  };
  after: {
    title: string;
    generatedAt: string;
    readiness: number;
    verdictLabel: string;
  };
  readinessDelta: number;
  verdictChanged: boolean;
  axes: RealityForkLaunchAxisDelta[];
};

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function signedPercent(value: number): string {
  const p = Math.round(value * 100);
  if (p > 0) return `+${p}%`;
  if (p < 0) return `${p}%`;
  return '0%';
}

function arrow(direction: 'up' | 'down' | 'flat'): string {
  if (direction === 'up') return '\u25b2';
  if (direction === 'down') return '\u25bc';
  return '\u2500';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function diffLaunchRuns(
  before: RealityForkLaunchRun,
  after: RealityForkLaunchRun
): RealityForkLaunchDiff {
  const axisMap = new Map(before.axes.map(a => [a.id, a]));

  const axes: RealityForkLaunchAxisDelta[] = after.axes.map(a => {
    const prev = axisMap.get(a.id);
    const beforeScore = prev?.score ?? 0;
    const delta = a.score - beforeScore;
    const direction = delta > 0.005 ? 'up' : delta < -0.005 ? 'down' : 'flat';
    return {
      id: a.id,
      label: a.label,
      before: beforeScore,
      after: a.score,
      delta,
      direction,
    };
  });

  return {
    before: {
      title: before.title,
      generatedAt: before.generatedAt,
      readiness: before.verdict.readiness,
      verdictLabel: before.verdict.label,
    },
    after: {
      title: after.title,
      generatedAt: after.generatedAt,
      readiness: after.verdict.readiness,
      verdictLabel: after.verdict.label,
    },
    readinessDelta: after.verdict.readiness - before.verdict.readiness,
    verdictChanged: before.verdict.winnerBranchId !== after.verdict.winnerBranchId,
    axes,
  };
}

export function renderDiffMarkdown(diff: RealityForkLaunchDiff): string {
  const rows = diff.axes
    .map(
      a =>
        `| ${a.label} | ${percent(a.before)} | ${percent(a.after)} | ${signedPercent(a.delta)} ${arrow(a.direction)} |`
    )
    .join('\n');

  const verdictLine = diff.verdictChanged
    ? `Verdict changed: **${diff.before.verdictLabel}** \u2192 **${diff.after.verdictLabel}**`
    : `Verdict unchanged: **${diff.after.verdictLabel}**`;

  return `# Launch Diff

Before: ${diff.before.title} (${diff.before.generatedAt})
After: ${diff.after.title} (${diff.after.generatedAt})

## Readiness

${percent(diff.before.readiness)} \u2192 ${percent(diff.after.readiness)} (${signedPercent(diff.readinessDelta)})

${verdictLine}

## Axes

| Axis | Before | After | Delta |
| --- | --- | --- | --- |
${rows}
`;
}

export function renderDiffHtml(diff: RealityForkLaunchDiff): string {
  const rows = diff.axes
    .map(a => {
      const cls =
        a.direction === 'up' ? 'delta-up' : a.direction === 'down' ? 'delta-down' : 'delta-flat';
      return `<tr>
  <td>${escapeHtml(a.label)}</td>
  <td>${percent(a.before)}</td>
  <td>${percent(a.after)}</td>
  <td class="${cls}">${signedPercent(a.delta)} ${arrow(a.direction)}</td>
</tr>`;
    })
    .join('\n');

  const verdictLine = diff.verdictChanged
    ? `<strong>${escapeHtml(diff.before.verdictLabel)}</strong> &rarr; <strong>${escapeHtml(diff.after.verdictLabel)}</strong>`
    : `<strong>${escapeHtml(diff.after.verdictLabel)}</strong> (unchanged)`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Launch Diff</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Mono:wght@200..800&display=swap');
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        background: #000;
        color: #fff;
        font-family: "Atkinson Hyperlegible Mono", "SF Mono", Consolas, monospace;
        font-weight: 300;
        -webkit-font-smoothing: antialiased;
      }
      main {
        width: min(720px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 48px 0 80px;
      }
      .gradient-text {
        background: linear-gradient(135deg, #ff44f5, #4fe9ea);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
      .kicker {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.24em;
        font-weight: 400;
      }
      h1 { font-size: 1.8rem; font-weight: 200; margin-top: 12px; }
      .meta { color: #666; font-size: 0.8rem; margin-top: 8px; }
      .card {
        border-radius: 28px;
        border: 1px solid rgba(128,128,128,0.25);
        background: rgba(0,0,0,0.75);
        padding: 24px;
        margin-top: 20px;
      }
      .section-title {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.24em;
        color: #4fe9ea;
        font-weight: 400;
        margin-bottom: 16px;
      }
      .readiness {
        font-size: 2rem;
        font-weight: 200;
      }
      .readiness-delta { color: #4fe9ea; font-size: 1rem; margin-left: 8px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid rgba(128,128,128,0.12); }
      th { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 0.24em; font-weight: 400; }
      td { font-size: 0.9rem; color: #999; }
      .delta-up { color: #4fe9ea; }
      .delta-down { color: #ff44f5; }
      .delta-flat { color: #666; }
      .footer { margin-top: 40px; text-align: center; font-size: 0.75rem; color: #333; letter-spacing: 0.08em; }
    </style>
  </head>
  <body>
    <main>
      <p class="kicker gradient-text">Reality Fork \u5206\u5c90\u73fe\u754c</p>
      <h1>Launch Diff</h1>
      <p class="meta">${escapeHtml(diff.before.generatedAt)} &rarr; ${escapeHtml(diff.after.generatedAt)}</p>

      <div class="card">
        <p class="section-title">Readiness</p>
        <span class="readiness">${percent(diff.before.readiness)} &rarr; ${percent(diff.after.readiness)}</span>
        <span class="readiness-delta">${signedPercent(diff.readinessDelta)}</span>
        <p class="meta" style="margin-top: 14px">${verdictLine}</p>
      </div>

      <div class="card">
        <p class="section-title">Axes</p>
        <table>
          <thead><tr><th>Axis</th><th>Before</th><th>After</th><th>Delta</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <p class="footer">KAMIYO \u00b7 Reality Fork</p>
    </main>
  </body>
</html>`;
}
