use crate::scoring::percent;
use crate::types::*;

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn citation_link(repo: &RepoContext, citation: &str) -> Option<String> {
    let web_url = repo.git.web_url.as_deref()?;
    let commit = repo.git.commit.as_deref()?;
    if citation.starts_with("git:") {
        return None;
    }
    Some(format!("{web_url}/blob/{commit}/{citation}"))
}

fn format_md_citation(repo: &RepoContext, citation: &str) -> String {
    match citation_link(repo, citation) {
        Some(link) => format!("[`{citation}`]({link})"),
        None => format!("`{citation}`"),
    }
}

fn format_html_citation(repo: &RepoContext, citation: &str) -> String {
    match citation_link(repo, citation) {
        Some(link) => format!(
            "<a href=\"{}\"><code>{}</code></a>",
            escape_html(&link),
            escape_html(citation)
        ),
        None => format!("<code>{}</code>", escape_html(citation)),
    }
}

pub fn render_decision_markdown(run: &LaunchRun) -> String {
    let branch = &run.branches[0];

    let scoreboard: String = run
        .axes
        .iter()
        .map(|a| format!("| {} | {} | {} |", a.id.label(), percent(a.score), a.summary))
        .collect::<Vec<_>>()
        .join("\n");

    let branch_sections: String = run
        .branches
        .iter()
        .map(|b| {
            format!(
                "### {}\n\nScore: {}\n\n{}\n\nAdvantages:\n- {}\n\nRisks:\n- {}\n\nNext moves:\n- {}",
                b.label,
                percent(b.score),
                b.summary,
                b.advantages.join("\n- "),
                b.risks.join("\n- "),
                b.next_moves.join("\n- ")
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n");

    let signals: String = run
        .signals
        .iter()
        .map(|s| {
            let citations = if !s.citations.is_empty() {
                format!(
                    "\nCitations: {}",
                    s.citations
                        .iter()
                        .map(|c| format_md_citation(&run.repo, c))
                        .collect::<Vec<_>>()
                        .join(", ")
                )
            } else {
                String::new()
            };
            let inference = if s.inferred { " (inference)" } else { "" };
            format!(
                "- **{} / {}** {}{}\n  {}{}",
                s.signal_type.as_str().to_uppercase(),
                s.axis.label(),
                s.statement,
                inference,
                s.detail,
                citations
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        r#"# {title}

Generated: {generated_at}

Repo: {repo_name}
Path: `{display_path}`
Prompt: {prompt}

## Verdict

**{verdict_label}**

{verdict_reason}

Launch readiness: {readiness}

## Scoreboard

| Axis | Score | Read |
| --- | --- | --- |
{scoreboard}

## Branches Compared

{branch_sections}

## Evidence

{signals}

## Next Moves

- {actions}

## Ready X Posts

Announcement:

> {announcement}

Thread:

1. {thread0}
2. {thread1}
3. {thread2}
"#,
        title = run.title,
        generated_at = run.generated_at,
        repo_name = run.repo.name,
        display_path = run.repo.display_path,
        prompt = run.prompt,
        verdict_label = branch.label,
        verdict_reason = run.verdict.reason,
        readiness = percent(run.verdict.readiness),
        actions = run.actions.join("\n- "),
        announcement = run.posts.announcement,
        thread0 = run.posts.thread[0],
        thread1 = run.posts.thread[1],
        thread2 = run.posts.thread[2],
    )
}

pub fn render_report_html(run: &LaunchRun) -> String {
    let winner = &run.branches[0];

    let signals_html: String = run
        .signals
        .iter()
        .map(|s| {
            let citations = if !s.citations.is_empty() {
                format!(
                    "<div class=\"citations\">{}</div>",
                    s.citations
                        .iter()
                        .map(|c| format_html_citation(&run.repo, c))
                        .collect::<Vec<_>>()
                        .join(" ")
                )
            } else {
                String::new()
            };
            let border_class = match s.signal_type {
                SignalType::Supporting => "card-good",
                SignalType::Risk => "card-bad",
                SignalType::Neutral => "",
            };
            format!(
                r#"<article class="card {border_class}">
  <p class="label">{sig_type} · {axis}{inference}</p>
  <h3 class="card-title">{statement}</h3>
  <p class="body">{detail}</p>
  {citations}
</article>"#,
                border_class = border_class,
                sig_type = escape_html(s.signal_type.as_str()),
                axis = escape_html(s.axis.label()),
                inference = if s.inferred { " \u{00b7} inference" } else { "" },
                statement = escape_html(&s.statement),
                detail = escape_html(&s.detail),
                citations = citations,
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    let branches_html: String = run
        .branches
        .iter()
        .map(|b| {
            let is_winner = b.id == winner.id;
            let card_class = if is_winner { " card-accent" } else { "" };
            let label_class = if is_winner { " accent" } else { "" };
            let badge = if is_winner {
                "<span class=\"badge accent\">winner</span>".to_string()
            } else {
                format!("<span class=\"badge\">{}</span>", percent(b.score))
            };
            let advantages_li: String = b.advantages.iter().map(|a| format!("<li>{}</li>", escape_html(a))).collect();
            let risks_li: String = b.risks.iter().map(|r| format!("<li>{}</li>", escape_html(r))).collect();
            let moves_li: String = b.next_moves.iter().map(|m| format!("<li>{}</li>", escape_html(m))).collect();

            format!(
                r#"<article class="card{card_class}">
  <p class="label{label_class}">{stance}</p>
  <h3 class="card-heading">{label}</h3>
  {badge}
  <p class="body">{summary}</p>
  <details>
    <summary>Details</summary>
    <div class="branch-cols">
      <section>
        <p class="label">Advantages</p>
        <ul>{advantages_li}</ul>
      </section>
      <section>
        <p class="label">Risks</p>
        <ul>{risks_li}</ul>
      </section>
    </div>
    <section>
      <p class="label">Next moves</p>
      <ul>{moves_li}</ul>
    </section>
  </details>
</article>"#,
                card_class = card_class,
                label_class = label_class,
                stance = escape_html(&b.stance),
                label = escape_html(&b.label),
                badge = badge,
                summary = escape_html(&b.summary),
                advantages_li = advantages_li,
                risks_li = risks_li,
                moves_li = moves_li,
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    let axes_html: String = run
        .axes
        .iter()
        .map(|a| {
            format!(
                r#"<article class="card">
  <p class="label">{label}</p>
  <p class="score">{score}</p>
  <div class="bar"><span data-width="{width}%" style="width: 0"></span></div>
  <p class="body">{summary}</p>
</article>"#,
                label = escape_html(a.id.label()),
                score = percent(a.score),
                width = (a.score * 100.0).round() as i64,
                summary = escape_html(&a.summary),
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    let mut meta_items = vec![
        run.repo.name.clone(),
        run.repo.display_path.clone(),
        run.generated_at.clone(),
        format!("readiness {}", percent(run.verdict.readiness)),
    ];
    if !run.repo.frameworks.is_empty() {
        meta_items.push(run.repo.frameworks.join(", "));
    }
    let meta_spans: String = meta_items
        .iter()
        .map(|item| format!("<span>{}</span>", escape_html(item)))
        .collect::<Vec<_>>()
        .join("");

    let actions_html: String = run
        .actions
        .iter()
        .map(|a| format!("<article class=\"action-card\">{}</article>", escape_html(a)))
        .collect::<Vec<_>>()
        .join("\n");

    let thread_html: String = run
        .posts
        .thread
        .iter()
        .enumerate()
        .map(|(i, t)| format!("<p class=\"body\">{}. {}</p>", i + 1, escape_html(t)))
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        r##"<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Mono:wght@200..800&display=swap');

      * {{ box-sizing: border-box; margin: 0; padding: 0; }}

      body {{
        background: #000;
        color: #fff;
        font-family: "Atkinson Hyperlegible Mono", "SF Mono", "Fira Code", Consolas, monospace;
        font-weight: 300;
        -webkit-font-smoothing: antialiased;
      }}

      main {{
        width: min(1120px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 48px 0 80px;
      }}

      .hero {{
        border-radius: 32px;
        border: 1px solid rgba(128,128,128,0.25);
        background: rgba(0,0,0,0.75);
        padding: 28px 36px;
        position: relative;
        overflow: hidden;
      }}

      .gradient-text {{
        background: linear-gradient(135deg, #ff44f5, #4fe9ea);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }}

      .kicker {{
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.24em;
        font-weight: 400;
      }}

      h1 {{
        margin-top: 16px;
        font-size: clamp(1.8rem, 5vw, 2.4rem);
        font-weight: 200;
        line-height: 1.15;
        color: #fff;
        max-width: 28ch;
      }}

      .hero-reason {{
        margin-top: 16px;
        font-size: 0.875rem;
        line-height: 1.7;
        color: #999;
      }}

      .meta {{
        margin-top: 20px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px 16px;
        font-size: 0.8rem;
        color: #666;
      }}

      .hero-stats {{
        display: grid;
        grid-template-columns: 1.6fr 1fr;
        gap: 16px;
        margin-top: 24px;
      }}

      .stat-card {{
        border-radius: 16px;
        border: 1px solid rgba(128,128,128,0.15);
        background: rgba(0,0,0,0.7);
        padding: 16px;
      }}

      .stat-card .label {{ margin-bottom: 8px; }}

      .stat-card .value {{
        font-size: 1.25rem;
        font-weight: 200;
        color: #fff;
      }}

      .section {{
        margin-top: 20px;
        border-radius: 32px;
        border: 1px solid rgba(128,128,128,0.25);
        background: rgba(0,0,0,0.75);
        padding: 28px 36px;
        opacity: 0;
        transform: translateY(20px);
        animation: fadeIn 0.5s ease forwards;
      }}
      .section:nth-child(2) {{ animation-delay: 0.08s; }}
      .section:nth-child(3) {{ animation-delay: 0.16s; }}
      .section:nth-child(4) {{ animation-delay: 0.24s; }}
      .section:nth-child(5) {{ animation-delay: 0.32s; }}
      .section:nth-child(6) {{ animation-delay: 0.40s; }}
      .section:nth-child(7) {{ animation-delay: 0.48s; }}

      @keyframes fadeIn {{
        to {{ opacity: 1; transform: translateY(0); }}
      }}

      .section-title {{
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.24em;
        color: #4fe9ea;
        font-weight: 400;
        margin-bottom: 20px;
      }}

      .grid {{ display: grid; gap: 16px; }}
      .grid-2 {{ grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }}
      .grid-3 {{ grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }}

      .card {{
        border-radius: 28px;
        border: 1px solid rgba(128,128,128,0.2);
        background: rgba(0,0,0,0.7);
        padding: 20px;
        transition: border-color 0.3s, background 0.3s;
      }}
      .card:hover {{ border-color: rgba(128,128,128,0.4); background: #000; }}

      .card-accent {{
        border-color: rgba(79,233,234,0.4);
        background: rgba(0,0,0,0.8);
      }}
      .card-accent:hover {{ border-color: rgba(79,233,234,0.6); }}

      .card-good {{ border-color: rgba(79,233,234,0.2); }}
      .card-bad {{ border-color: rgba(255,68,245,0.2); }}

      .label {{
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.24em;
        color: #666;
        font-weight: 400;
      }}

      .accent {{ color: #4fe9ea; }}

      .badge {{
        display: inline-block;
        border-radius: 9999px;
        border: 1px solid rgba(128,128,128,0.2);
        padding: 4px 12px;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.18em;
        color: #999;
        margin-top: 8px;
      }}
      .badge.accent {{ color: #4fe9ea; border-color: rgba(79,233,234,0.3); }}

      .card-title {{
        margin-top: 10px;
        font-size: 1rem;
        font-weight: 300;
        color: #fff;
        line-height: 1.5;
      }}

      .card-heading {{
        margin-top: 8px;
        font-size: 1.2rem;
        font-weight: 200;
        color: #fff;
      }}

      .body {{
        margin-top: 10px;
        font-size: 0.85rem;
        line-height: 1.65;
        color: #999;
      }}

      .score {{
        margin-top: 8px;
        font-size: 1.1rem;
        font-weight: 200;
        color: #fff;
      }}

      .bar {{
        height: 4px;
        border-radius: 9999px;
        background: rgba(128,128,128,0.12);
        overflow: hidden;
        margin: 12px 0;
      }}

      .bar span {{
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #4fe9ea, #ff44f5);
        transition: width 0.8s cubic-bezier(0.22, 1, 0.36, 1);
      }}

      .branch-cols {{
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        margin-top: 16px;
      }}

      details summary {{
        cursor: pointer;
        margin-top: 14px;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.24em;
        color: #666;
        list-style: none;
      }}
      details summary::marker,
      details summary::-webkit-details-marker {{ display: none; }}
      details[open] summary {{ color: #4fe9ea; }}

      ul {{
        margin: 10px 0 0;
        padding-left: 16px;
        color: #999;
        font-size: 0.85rem;
        line-height: 1.65;
      }}

      .citations {{
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 12px;
      }}

      a {{ color: #ff44f5; transition: opacity 0.2s; }}
      a:hover {{ opacity: 0.8; }}

      code {{
        font-family: inherit;
        font-size: 0.85em;
        background: rgba(255,255,255,0.04);
        padding: 2px 6px;
        border-radius: 6px;
      }}

      .posts-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }}

      .post-card {{
        border-radius: 28px;
        border: 1px solid rgba(128,128,128,0.2);
        background: rgba(0,0,0,0.7);
        padding: 20px;
        position: relative;
        transition: border-color 0.3s;
      }}
      .post-card:hover {{ border-color: rgba(128,128,128,0.4); }}
      .post-card .label {{ margin-bottom: 10px; }}
      .post-card .body {{ margin-top: 0; }}

      .copy-btn {{
        position: absolute;
        top: 16px;
        right: 16px;
        cursor: pointer;
        border: 1px solid rgba(128,128,128,0.2);
        border-radius: 9999px;
        background: rgba(0,0,0,0.6);
        color: #666;
        padding: 4px 12px;
        font-family: inherit;
        font-size: 10px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        transition: color 0.2s, border-color 0.2s;
      }}
      .copy-btn:hover {{ color: #4fe9ea; border-color: rgba(79,233,234,0.3); }}

      .action-card {{
        border-radius: 24px;
        border: 1px solid rgba(128,128,128,0.15);
        background: rgba(0,0,0,0.6);
        padding: 16px 20px;
        font-size: 0.85rem;
        color: #ccc;
        line-height: 1.6;
        transition: border-color 0.3s;
      }}
      .action-card:hover {{ border-color: rgba(128,128,128,0.35); }}

      .footer {{
        margin-top: 40px;
        text-align: center;
        font-size: 0.75rem;
        color: #333;
        letter-spacing: 0.08em;
      }}

      @media (max-width: 860px) {{
        .hero-stats, .branch-cols {{ grid-template-columns: 1fr; }}
        main {{ width: min(100vw - 24px, 1120px); padding-top: 24px; }}
        .hero, .section {{ padding: 20px; border-radius: 24px; }}
        .card {{ border-radius: 20px; }}
      }}
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <p class="kicker gradient-text">Reality Fork 分岐現界</p>
        <h1>{winner_label}</h1>
        <p class="hero-reason">{verdict_reason}</p>
        <div class="meta">
          {meta_spans}
        </div>
        <div class="hero-stats">
          <article class="stat-card">
            <p class="label">Readiness</p>
            <p class="value">{readiness}</p>
          </article>
          <article class="stat-card">
            <p class="label">Prompt</p>
            <p class="value">{prompt}</p>
          </article>
          <article class="stat-card">
            <p class="label">Winner score</p>
            <p class="value">{winner_score}</p>
          </article>
        </div>
      </section>

      <section class="section">
        <p class="section-title">Scoreboard</p>
        <div class="grid grid-3">
          {axes_html}
        </div>
      </section>

      <section class="section">
        <p class="section-title">Branches compared</p>
        <div class="grid grid-2">
          {branches_html}
        </div>
      </section>

      <section class="section">
        <p class="section-title">Evidence</p>
        <div class="grid grid-2">
          {signals_html}
        </div>
      </section>

      <section class="section">
        <p class="section-title">Next moves</p>
        <div class="grid">
          {actions_html}
        </div>
      </section>

      <section class="section">
        <p class="section-title">Ready posts</p>
        <div class="posts-grid">
          <article class="post-card">
            <button class="copy-btn" type="button" data-copy="{announcement_escaped}">copy</button>
            <p class="label">Announcement</p>
            <p class="body">{announcement}</p>
          </article>
          <article class="post-card">
            <button class="copy-btn" type="button" data-copy="{thread_escaped}">copy</button>
            <p class="label">Thread</p>
            {thread_html}
          </article>
        </div>
      </section>

      <p class="footer">KAMIYO · Reality Fork</p>
    </main>
    <script>
      (function () {{
        var bars = document.querySelectorAll('.bar span[data-width]');
        requestAnimationFrame(function () {{
          requestAnimationFrame(function () {{
            bars.forEach(function (bar) {{ bar.style.width = bar.dataset.width; }});
          }});
        }});

        document.querySelectorAll('[data-copy]').forEach(function (btn) {{
          btn.addEventListener('click', function () {{
            navigator.clipboard.writeText(btn.dataset.copy).then(function () {{
              var prev = btn.textContent;
              btn.textContent = 'copied';
              setTimeout(function () {{ btn.textContent = prev; }}, 1200);
            }});
          }});
        }});
      }})();
    </script>
  </body>
</html>"##,
        title = escape_html(&run.title),
        winner_label = escape_html(&winner.label),
        verdict_reason = escape_html(&run.verdict.reason),
        meta_spans = meta_spans,
        readiness = percent(run.verdict.readiness),
        prompt = escape_html(&run.prompt),
        winner_score = percent(winner.score),
        axes_html = axes_html,
        branches_html = branches_html,
        signals_html = signals_html,
        actions_html = actions_html,
        announcement_escaped = escape_html(&run.posts.announcement),
        announcement = escape_html(&run.posts.announcement),
        thread_escaped = escape_html(&run.posts.thread.join("\n")),
        thread_html = thread_html,
    )
}
