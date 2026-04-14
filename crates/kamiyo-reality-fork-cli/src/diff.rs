use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::scoring::percent;
use crate::types::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Direction {
    Up,
    Down,
    Flat,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AxisDelta {
    pub id: AxisId,
    pub label: String,
    pub before: f64,
    pub after: f64,
    pub delta: f64,
    pub direction: Direction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchDiffSummary {
    pub title: String,
    pub generated_at: String,
    pub readiness: f64,
    pub verdict_label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchDiff {
    pub before: LaunchDiffSummary,
    pub after: LaunchDiffSummary,
    pub readiness_delta: f64,
    pub verdict_changed: bool,
    pub axes: Vec<AxisDelta>,
}

pub fn diff_launch_runs(before: &LaunchRun, after: &LaunchRun) -> LaunchDiff {
    let axis_map: HashMap<AxisId, f64> = before.axes.iter().map(|a| (a.id, a.score)).collect();

    let axes: Vec<AxisDelta> = after
        .axes
        .iter()
        .map(|a| {
            let before_score = axis_map.get(&a.id).copied().unwrap_or(0.0);
            let delta = a.score - before_score;
            let direction = if delta > 0.005 {
                Direction::Up
            } else if delta < -0.005 {
                Direction::Down
            } else {
                Direction::Flat
            };
            AxisDelta {
                id: a.id,
                label: a.label.clone(),
                before: before_score,
                after: a.score,
                delta,
                direction,
            }
        })
        .collect();

    LaunchDiff {
        before: LaunchDiffSummary {
            title: before.title.clone(),
            generated_at: before.generated_at.clone(),
            readiness: before.verdict.readiness,
            verdict_label: before.verdict.label.clone(),
        },
        after: LaunchDiffSummary {
            title: after.title.clone(),
            generated_at: after.generated_at.clone(),
            readiness: after.verdict.readiness,
            verdict_label: after.verdict.label.clone(),
        },
        readiness_delta: after.verdict.readiness - before.verdict.readiness,
        verdict_changed: before.verdict.winner_branch_id != after.verdict.winner_branch_id,
        axes,
    }
}

fn signed_percent(v: f64) -> String {
    let p = (v * 100.0).round() as i64;
    if p > 0 {
        format!("+{p}%")
    } else if p < 0 {
        format!("{p}%")
    } else {
        "0%".into()
    }
}

fn arrow(d: Direction) -> &'static str {
    match d {
        Direction::Up => "\u{25b2}",
        Direction::Down => "\u{25bc}",
        Direction::Flat => "\u{2500}",
    }
}

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

pub fn render_diff_markdown(diff: &LaunchDiff) -> String {
    let rows: String = diff
        .axes
        .iter()
        .map(|a| {
            format!(
                "| {} | {} | {} | {} {} |",
                a.label,
                percent(a.before),
                percent(a.after),
                signed_percent(a.delta),
                arrow(a.direction)
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    let verdict_line = if diff.verdict_changed {
        format!(
            "Verdict changed: **{}** \u{2192} **{}**",
            diff.before.verdict_label, diff.after.verdict_label
        )
    } else {
        format!("Verdict unchanged: **{}**", diff.after.verdict_label)
    };

    format!(
        r#"# Launch Diff

Before: {before_title} ({before_at})
After: {after_title} ({after_at})

## Readiness

{before_readiness} → {after_readiness} ({readiness_delta})

{verdict_line}

## Axes

| Axis | Before | After | Delta |
| --- | --- | --- | --- |
{rows}
"#,
        before_title = diff.before.title,
        before_at = diff.before.generated_at,
        after_title = diff.after.title,
        after_at = diff.after.generated_at,
        before_readiness = percent(diff.before.readiness),
        after_readiness = percent(diff.after.readiness),
        readiness_delta = signed_percent(diff.readiness_delta),
        verdict_line = verdict_line,
        rows = rows,
    )
}

pub fn render_diff_html(diff: &LaunchDiff) -> String {
    let rows: String = diff
        .axes
        .iter()
        .map(|a| {
            let cls = match a.direction {
                Direction::Up => "delta-up",
                Direction::Down => "delta-down",
                Direction::Flat => "delta-flat",
            };
            format!(
                r#"<tr>
  <td>{}</td>
  <td>{}</td>
  <td>{}</td>
  <td class="{}">{} {}</td>
</tr>"#,
                escape_html(&a.label),
                percent(a.before),
                percent(a.after),
                cls,
                signed_percent(a.delta),
                arrow(a.direction),
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    let verdict_line = if diff.verdict_changed {
        format!(
            "<strong>{}</strong> &rarr; <strong>{}</strong>",
            escape_html(&diff.before.verdict_label),
            escape_html(&diff.after.verdict_label)
        )
    } else {
        format!(
            "<strong>{}</strong> (unchanged)",
            escape_html(&diff.after.verdict_label)
        )
    };

    format!(
        r##"<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Launch Diff</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Mono:wght@200..800&display=swap');
      * {{ box-sizing: border-box; margin: 0; padding: 0; }}
      body {{
        background: #000;
        color: #fff;
        font-family: "Atkinson Hyperlegible Mono", "SF Mono", Consolas, monospace;
        font-weight: 300;
        -webkit-font-smoothing: antialiased;
      }}
      main {{
        width: min(720px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 48px 0 80px;
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
      h1 {{ font-size: 1.8rem; font-weight: 200; margin-top: 12px; }}
      .meta {{ color: #666; font-size: 0.8rem; margin-top: 8px; }}
      .card {{
        border-radius: 28px;
        border: 1px solid rgba(128,128,128,0.25);
        background: rgba(0,0,0,0.75);
        padding: 24px;
        margin-top: 20px;
      }}
      .section-title {{
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.24em;
        color: #4fe9ea;
        font-weight: 400;
        margin-bottom: 16px;
      }}
      .readiness {{
        font-size: 2rem;
        font-weight: 200;
      }}
      .readiness-delta {{ color: #4fe9ea; font-size: 1rem; margin-left: 8px; }}
      table {{ width: 100%; border-collapse: collapse; margin-top: 12px; }}
      th, td {{ text-align: left; padding: 10px 12px; border-bottom: 1px solid rgba(128,128,128,0.12); }}
      th {{ font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 0.24em; font-weight: 400; }}
      td {{ font-size: 0.9rem; color: #999; }}
      .delta-up {{ color: #4fe9ea; }}
      .delta-down {{ color: #ff44f5; }}
      .delta-flat {{ color: #666; }}
      .footer {{ margin-top: 40px; text-align: center; font-size: 0.75rem; color: #333; letter-spacing: 0.08em; }}
    </style>
  </head>
  <body>
    <main>
      <p class="kicker gradient-text">Reality Fork 分岐現界</p>
      <h1>Launch Diff</h1>
      <p class="meta">{before_at} &rarr; {after_at}</p>

      <div class="card">
        <p class="section-title">Readiness</p>
        <span class="readiness">{before_readiness} &rarr; {after_readiness}</span>
        <span class="readiness-delta">{readiness_delta}</span>
        <p class="meta" style="margin-top: 14px">{verdict_line}</p>
      </div>

      <div class="card">
        <p class="section-title">Axes</p>
        <table>
          <thead><tr><th>Axis</th><th>Before</th><th>After</th><th>Delta</th></tr></thead>
          <tbody>{rows}</tbody>
        </table>
      </div>

      <p class="footer">KAMIYO · Reality Fork</p>
    </main>
  </body>
</html>"##,
        before_at = escape_html(&diff.before.generated_at),
        after_at = escape_html(&diff.after.generated_at),
        before_readiness = percent(diff.before.readiness),
        after_readiness = percent(diff.after.readiness),
        readiness_delta = signed_percent(diff.readiness_delta),
        verdict_line = verdict_line,
        rows = rows,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_run(readiness: f64, branch_id: BranchId, label: &str, scores: &[(AxisId, f64)]) -> LaunchRun {
        let axes: Vec<Axis> = scores
            .iter()
            .map(|(id, score)| Axis {
                id: *id,
                label: id.label().into(),
                score: *score,
                summary: String::new(),
            })
            .collect();

        LaunchRun {
            kind: "launch".into(),
            version: 1,
            generated_at: "2025-01-01T00:00:00Z".into(),
            title: "test".into(),
            prompt: "test".into(),
            repo: RepoContext {
                name: "test".into(),
                display_path: ".".into(),
                file_count: 0,
                focus_paths: vec![],
                readme_path: None,
                readme_excerpt: None,
                docs: vec![],
                tests: vec![],
                examples: vec![],
                fixtures: vec![],
                manifests: vec![],
                locks: vec![],
                ci: vec![],
                env_examples: vec![],
                licenses: vec![],
                assets: vec![],
                frameworks: vec![],
                install_commands: vec![],
                local_run_commands: vec![],
                remote_dependency_notes: vec![],
                runtime_notes: vec![],
                artifact_notes: vec![],
                languages: vec![],
                git: GitContext {
                    branch: None,
                    commit: None,
                    remote_url: None,
                    web_url: None,
                    changed_files: vec![],
                    recent_commits: vec![],
                },
            },
            axes,
            signals: vec![],
            branches: vec![],
            verdict: Verdict {
                winner_branch_id: branch_id,
                label: label.into(),
                reason: String::new(),
                score: 0.0,
                readiness,
            },
            actions: vec![],
            posts: Posts {
                announcement: String::new(),
                thread: vec![],
            },
        }
    }

    fn default_scores() -> Vec<(AxisId, f64)> {
        vec![
            (AxisId::Immediacy, 0.5),
            (AxisId::Clarity, 0.6),
            (AxisId::Proof, 0.7),
            (AxisId::Distribution, 0.4),
            (AxisId::Shareability, 0.3),
            (AxisId::Trust, 0.8),
        ]
    }

    #[test]
    fn diff_identical_runs() {
        let scores = default_scores();
        let run = make_run(0.55, BranchId::NarrowLaunch, "Narrow", &scores);
        let diff = diff_launch_runs(&run, &run);
        assert!(!diff.verdict_changed);
        assert!((diff.readiness_delta).abs() < 1e-10);
        for axis in &diff.axes {
            assert_eq!(axis.direction, Direction::Flat);
        }
    }

    #[test]
    fn diff_improved_scores() {
        let before_scores = default_scores();
        let after_scores: Vec<(AxisId, f64)> = before_scores
            .iter()
            .map(|(id, s)| (*id, (s + 0.1).min(1.0)))
            .collect();
        let before = make_run(0.55, BranchId::DelayForProof, "Delay", &before_scores);
        let after = make_run(0.65, BranchId::NarrowLaunch, "Narrow", &after_scores);
        let diff = diff_launch_runs(&before, &after);
        assert!(diff.verdict_changed);
        assert!(diff.readiness_delta > 0.0);
        for axis in &diff.axes {
            assert_eq!(axis.direction, Direction::Up);
            assert!(axis.delta > 0.0);
        }
    }

    #[test]
    fn diff_decreased_scores() {
        let before_scores = default_scores();
        let after_scores: Vec<(AxisId, f64)> = before_scores
            .iter()
            .map(|(id, s)| (*id, (s - 0.1).max(0.0)))
            .collect();
        let before = make_run(0.55, BranchId::NarrowLaunch, "Narrow", &before_scores);
        let after = make_run(0.45, BranchId::NarrowLaunch, "Narrow", &after_scores);
        let diff = diff_launch_runs(&before, &after);
        assert!(!diff.verdict_changed);
        assert!(diff.readiness_delta < 0.0);
        for axis in &diff.axes {
            assert_eq!(axis.direction, Direction::Down);
        }
    }

    #[test]
    fn diff_flat_threshold() {
        let scores = default_scores();
        let near_scores: Vec<(AxisId, f64)> = scores
            .iter()
            .map(|(id, s)| (*id, s + 0.004))
            .collect();
        let before = make_run(0.55, BranchId::NarrowLaunch, "Narrow", &scores);
        let after = make_run(0.554, BranchId::NarrowLaunch, "Narrow", &near_scores);
        let diff = diff_launch_runs(&before, &after);
        for axis in &diff.axes {
            assert_eq!(axis.direction, Direction::Flat);
        }
    }

    #[test]
    fn render_markdown_contains_table() {
        let scores = default_scores();
        let run = make_run(0.55, BranchId::NarrowLaunch, "Narrow", &scores);
        let diff = diff_launch_runs(&run, &run);
        let md = render_diff_markdown(&diff);
        assert!(md.contains("# Launch Diff"));
        assert!(md.contains("| Axis | Before | After | Delta |"));
        assert!(md.contains("Immediacy"));
    }

    #[test]
    fn render_html_valid_structure() {
        let scores = default_scores();
        let run = make_run(0.55, BranchId::NarrowLaunch, "Narrow", &scores);
        let diff = diff_launch_runs(&run, &run);
        let html = render_diff_html(&diff);
        assert!(html.contains("<!doctype html>"));
        assert!(html.contains("Reality Fork"));
        assert!(html.contains("</html>"));
    }
}
