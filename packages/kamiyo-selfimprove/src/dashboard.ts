import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'http';
import { getContext } from './context';
import { getLeaderboard, getVariant, listActiveVariants } from './service';
import { listTaskTypes } from './bandit';
import { getActiveCanary, evaluateCanary, listCanaryRollouts } from './canary';

export type DashboardOptions = {
  port?: number;
  host?: string;
};

type LineageEntry = {
  id: string;
  parentId: string | null;
  status: string;
  createdAt: number;
  notes: string | null;
};

function escape(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layout(title: string, tasks: string[], body: string): string {
  const links = tasks
    .map(t => `<a href="/tasks/${encodeURIComponent(t)}">${escape(t)}</a>`)
    .join('');
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escape(title)} — kamiyo-si</title>
<style>
  body { font: 14px/1.5 -apple-system, system-ui, sans-serif; margin: 0; background: #0a0a0a; color: #e5e5e5; }
  header { padding: 12px 20px; border-bottom: 1px solid #262626; display: flex; justify-content: space-between; align-items: center; }
  header h1 { font-size: 14px; font-weight: 600; margin: 0; }
  header a { color: #a3a3a3; margin-right: 16px; text-decoration: none; font-size: 13px; }
  header a:hover { color: #fafafa; }
  main { padding: 20px 24px; max-width: 1200px; }
  h2 { font-size: 18px; margin: 24px 0 12px; font-weight: 600; }
  h3 { font-size: 14px; margin: 20px 0 8px; color: #a3a3a3; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #262626; }
  th { color: #737373; font-weight: 500; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
  td.mono, th.mono { font-family: ui-monospace, Menlo, monospace; font-size: 12px; }
  a { color: #60a5fa; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: 500; }
  .pill-active { background: #1e3a8a; color: #bfdbfe; }
  .pill-promoted { background: #065f46; color: #a7f3d0; }
  .pill-archived { background: #404040; color: #a3a3a3; }
  .pill-rolled_back { background: #7f1d1d; color: #fca5a5; }
  .empty { color: #737373; font-style: italic; padding: 24px 0; }
  .score { font-family: ui-monospace, Menlo, monospace; font-weight: 500; }
</style></head>
<body>
<header>
  <h1>kamiyo-si</h1>
  <nav>${links || '<span style="color:#737373">no task types yet</span>'}</nav>
</header>
<main>${body}</main>
</body></html>`;
}

function statusPill(status: string): string {
  return `<span class="pill pill-${escape(status)}">${escape(status)}</span>`;
}

function renderHome(tasks: string[]): string {
  if (tasks.length === 0) {
    return layout(
      'home',
      tasks,
      `<h2>No task types yet</h2>
       <p class="empty">Create a rubric and variant via <code>kamiyo-si</code> or the library API, then refresh.</p>`
    );
  }
  const rows = tasks
    .map(t => {
      const variants = listActiveVariants(t);
      const top = getLeaderboard(t, 1)[0];
      return `<tr>
        <td><a href="/tasks/${encodeURIComponent(t)}">${escape(t)}</a></td>
        <td>${variants.length}</td>
        <td class="score">${top ? top.mean.toFixed(3) : '—'}</td>
        <td class="score">${top ? top.sampleCount : '—'}</td>
      </tr>`;
    })
    .join('');
  return layout(
    'home',
    tasks,
    `<h2>Task types</h2>
     <table>
       <thead><tr><th>Task</th><th>Active variants</th><th>Top mean</th><th>Top samples</th></tr></thead>
       <tbody>${rows}</tbody>
     </table>`
  );
}

function renderCanarySection(taskType: string): string {
  const active = getActiveCanary(taskType);
  const history = listCanaryRollouts(taskType, 5);

  if (!active && history.length === 0) return '';

  let html = '<h3>Canary rollout</h3>';

  if (active) {
    const decision = evaluateCanary({ taskType });
    html += `<table><tbody>
      <tr><td>Status</td><td>${statusPill('active')}</td></tr>
      <tr><td>Canary</td><td class="mono"><a href="/variants/${encodeURIComponent(active.canaryVariantId)}">${escape(active.canaryVariantId.slice(0, 8))}</a></td></tr>
      <tr><td>Baseline</td><td class="mono"><a href="/variants/${encodeURIComponent(active.baselineVariantId)}">${escape(active.baselineVariantId.slice(0, 8))}</a></td></tr>
      <tr><td>Traffic</td><td>${(active.trafficPct * 100).toFixed(0)}%</td></tr>
      <tr><td>Decision</td><td>${escape(decision.kind)}${decision.kind === 'hold' ? ` — ${escape(decision.reason)}` : ''}${decision.kind === 'promote' ? ` — uplift=${decision.uplift.toFixed(3)} p=${decision.pValue.toExponential(2)}` : ''}${decision.kind === 'rollback' ? ` — delta=${decision.delta.toFixed(3)}` : ''}</td></tr>
    </tbody></table>`;
  }

  if (history.length > 0) {
    const rows = history
      .map(
        r => `<tr>
      <td class="mono">${escape(r.id.slice(0, 8))}</td>
      <td>${statusPill(r.status)}</td>
      <td class="mono"><a href="/variants/${encodeURIComponent(r.canaryVariantId)}">${escape(r.canaryVariantId.slice(0, 8))}</a></td>
      <td>${escape(r.decision ?? '-')}</td>
      <td>${new Date(r.startedAt * 1000).toISOString()}</td>
    </tr>`
      )
      .join('');
    html += `<table><thead><tr><th>Rollout</th><th>Status</th><th>Canary</th><th>Decision</th><th>Started</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  return html;
}

function renderTask(taskType: string, tasks: string[]): string {
  const { db } = getContext();
  const leaderboard = getLeaderboard(taskType, 20);
  const events = db
    .prepare(
      `SELECT e.id, e.variant_id, e.kind, e.payload_json, e.created_at
       FROM variant_events e
       JOIN agent_variants v ON v.id = e.variant_id
       WHERE v.task_type = ?
       ORDER BY e.created_at DESC LIMIT 20`
    )
    .all(taskType) as Array<{
    id: string;
    variant_id: string;
    kind: string;
    payload_json: string | null;
    created_at: number;
  }>;

  const proposals = db
    .prepare(
      `SELECT id, parent_variant_id, proposed_variant_id, kind, rationale, cost_usd, created_at
       FROM genome_proposals WHERE task_type = ? ORDER BY created_at DESC LIMIT 20`
    )
    .all(taskType) as Array<{
    id: string;
    parent_variant_id: string;
    proposed_variant_id: string;
    kind: string;
    rationale: string | null;
    cost_usd: number;
    created_at: number;
  }>;

  const boardRows = leaderboard.length
    ? leaderboard
        .map(
          e => `<tr>
            <td class="mono"><a href="/variants/${encodeURIComponent(e.variantId)}">${escape(e.variantId.slice(0, 8))}</a></td>
            <td>${statusPill(e.status)}</td>
            <td class="score">${e.mean.toFixed(3)}</td>
            <td class="score">[${e.ci95[0].toFixed(3)}, ${e.ci95[1].toFixed(3)}]</td>
            <td class="score">${e.sampleCount}</td>
            <td class="mono">${escape((e.notes ?? '').slice(0, 60))}</td>
          </tr>`
        )
        .join('')
    : '';

  const eventRows = events
    .map(e => {
      const payload = e.payload_json ? JSON.parse(e.payload_json) : {};
      const summary =
        e.kind === 'promoted'
          ? `uplift=${typeof payload.uplift === 'number' ? payload.uplift.toFixed(3) : '?'} p=${typeof payload.pValue === 'number' ? payload.pValue.toExponential(2) : '?'} n=${payload.sampleCount ?? '?'}`
          : JSON.stringify(payload).slice(0, 80);
      return `<tr>
        <td>${new Date(e.created_at * 1000).toISOString()}</td>
        <td>${escape(e.kind)}</td>
        <td class="mono"><a href="/variants/${encodeURIComponent(e.variant_id)}">${escape(e.variant_id.slice(0, 8))}</a></td>
        <td class="mono">${escape(summary)}</td>
      </tr>`;
    })
    .join('');

  const propRows = proposals
    .map(
      p => `<tr>
        <td>${new Date(p.created_at * 1000).toISOString()}</td>
        <td>${escape(p.kind)}</td>
        <td class="mono"><a href="/variants/${encodeURIComponent(p.parent_variant_id)}">${escape(p.parent_variant_id.slice(0, 8))}</a></td>
        <td class="mono"><a href="/variants/${encodeURIComponent(p.proposed_variant_id)}">${escape(p.proposed_variant_id.slice(0, 8))}</a></td>
        <td class="score">$${p.cost_usd.toFixed(4)}</td>
        <td>${escape((p.rationale ?? '').slice(0, 80))}</td>
      </tr>`
    )
    .join('');

  const body = `
    <h2>${escape(taskType)}</h2>

    <h3>Leaderboard</h3>
    ${
      boardRows
        ? `<table><thead><tr><th>ID</th><th>Status</th><th>Mean</th><th>CI95</th><th>n</th><th>Notes</th></tr></thead><tbody>${boardRows}</tbody></table>`
        : '<p class="empty">No variants yet</p>'
    }

    <h3>Promotion events</h3>
    ${
      eventRows
        ? `<table><thead><tr><th>When</th><th>Kind</th><th>Variant</th><th>Detail</th></tr></thead><tbody>${eventRows}</tbody></table>`
        : '<p class="empty">No events</p>'
    }

    <h3>Genome proposals</h3>
    ${
      propRows
        ? `<table><thead><tr><th>When</th><th>Kind</th><th>Parent</th><th>Proposed</th><th>Cost</th><th>Rationale</th></tr></thead><tbody>${propRows}</tbody></table>`
        : '<p class="empty">No proposals</p>'
    }

    ${renderCanarySection(taskType)}
  `;

  return layout(taskType, tasks, body);
}

function buildLineage(variantId: string): LineageEntry[] {
  const chain: LineageEntry[] = [];
  let current = getVariant(variantId);
  while (current) {
    chain.push({
      id: current.id,
      parentId: current.parentId,
      status: current.status,
      createdAt: current.createdAt,
      notes: current.notes,
    });
    current = current.parentId ? getVariant(current.parentId) : null;
  }
  return chain;
}

function renderVariant(id: string, tasks: string[]): string {
  const variant = getVariant(id);
  if (!variant) {
    return layout('not found', tasks, `<h2>Variant not found</h2>`);
  }

  const { db } = getContext();
  const lineage = buildLineage(id);

  const children = db
    .prepare(`SELECT id, status, created_at FROM agent_variants WHERE parent_id = ?`)
    .all(id) as Array<{ id: string; status: string; created_at: number }>;

  const scores = db
    .prepare(
      `SELECT quality_score, cost, latency_ms, created_at
       FROM variant_tournament_entries
       WHERE variant_id = ? AND quality_score IS NOT NULL
       ORDER BY created_at DESC LIMIT 50`
    )
    .all(id) as Array<{
    quality_score: number;
    cost: number | null;
    latency_ms: number | null;
    created_at: number;
  }>;

  const lineageRows = lineage
    .map(
      l =>
        `<tr>
          <td class="mono">${l.id === id ? '<strong>' : ''}<a href="/variants/${encodeURIComponent(l.id)}">${escape(l.id.slice(0, 8))}</a>${l.id === id ? '</strong>' : ''}</td>
          <td>${statusPill(l.status)}</td>
          <td>${new Date(l.createdAt * 1000).toISOString()}</td>
          <td class="mono">${escape((l.notes ?? '').slice(0, 80))}</td>
        </tr>`
    )
    .join('');

  const childRows = children
    .map(
      c =>
        `<tr>
          <td class="mono"><a href="/variants/${encodeURIComponent(c.id)}">${escape(c.id.slice(0, 8))}</a></td>
          <td>${statusPill(c.status)}</td>
          <td>${new Date(c.created_at * 1000).toISOString()}</td>
        </tr>`
    )
    .join('');

  const scoreRows = scores
    .map(
      s => `<tr>
        <td class="score">${s.quality_score.toFixed(3)}</td>
        <td class="score">${s.cost != null ? '$' + s.cost.toFixed(4) : '—'}</td>
        <td class="score">${s.latency_ms != null ? s.latency_ms + 'ms' : '—'}</td>
        <td>${new Date(s.created_at * 1000).toISOString()}</td>
      </tr>`
    )
    .join('');

  const genomeJson = escape(JSON.stringify(variant.genome, null, 2));

  const body = `
    <h2>Variant <span class="mono">${escape(variant.id.slice(0, 8))}</span> ${statusPill(variant.status)}</h2>
    <p>Task: <a href="/tasks/${encodeURIComponent(variant.taskType)}">${escape(variant.taskType)}</a> · Agent: ${escape(variant.agentId)}
       · Samples: ${variant.sampleCount} · Rep: <span class="score">${variant.repScore.toFixed(3)}</span>
       · Created ${new Date(variant.createdAt * 1000).toISOString()}</p>

    <h3>Genome</h3>
    <pre style="background:#171717;padding:12px;border-radius:4px;overflow-x:auto;font-size:12px">${genomeJson}</pre>

    <h3>Lineage (ancestors)</h3>
    ${
      lineageRows
        ? `<table><thead><tr><th>ID</th><th>Status</th><th>Created</th><th>Notes</th></tr></thead><tbody>${lineageRows}</tbody></table>`
        : '<p class="empty">Root variant</p>'
    }

    <h3>Descendants</h3>
    ${
      childRows
        ? `<table><thead><tr><th>ID</th><th>Status</th><th>Created</th></tr></thead><tbody>${childRows}</tbody></table>`
        : '<p class="empty">No forks</p>'
    }

    <h3>Recent scores</h3>
    ${
      scoreRows
        ? `<table><thead><tr><th>Score</th><th>Cost</th><th>Latency</th><th>When</th></tr></thead><tbody>${scoreRows}</tbody></table>`
        : '<p class="empty">No scored entries yet</p>'
    }
  `;

  return layout(variant.id.slice(0, 8), tasks, body);
}

export function startDashboard(opts: DashboardOptions = {}): Server {
  const port = opts.port ?? 4100;
  const host = opts.host ?? '127.0.0.1';

  const handler = (req: IncomingMessage, res: ServerResponse): void => {
    try {
      const url = new URL(req.url ?? '/', `http://${host}`);
      const path = url.pathname;

      if (path === '/health') {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('ok');
        return;
      }

      const tasks = listTaskTypes();

      if (path === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(renderHome(tasks));
        return;
      }

      const taskMatch = path.match(/^\/tasks\/(.+)$/);
      if (taskMatch) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(renderTask(decodeURIComponent(taskMatch[1]), tasks));
        return;
      }

      const variantMatch = path.match(/^\/variants\/(.+)$/);
      if (variantMatch) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(renderVariant(decodeURIComponent(variantMatch[1]), tasks));
        return;
      }

      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    } catch (err) {
      const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end(msg);
    }
  };

  const server = createServer(handler);
  server.listen(port, host, () => {
    console.log(`kamiyo-si dashboard → http://${host}:${port}`);
  });
  return server;
}
