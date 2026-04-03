mod config;
mod diff;
mod render;
mod repo;
mod scoring;
mod types;

use std::fs;
use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::thread;
use std::time::Duration;

use clap::{Parser, Subcommand};
use colored::Colorize;

use crate::config::ConfigStore;
use crate::diff::{diff_launch_runs, render_diff_html, render_diff_markdown, Direction};
use crate::render::{render_decision_markdown, render_report_html};
use crate::repo::collect_repo_context;
use crate::scoring::{create_launch_run_with, percent};
use crate::types::{ArtifactPaths, LaunchRun};

#[derive(Parser)]
#[command(
    name = "reality-fork",
    about = "Native CLI for KAMIYO Reality Fork — repo-aware launch stress tests.",
    version
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,

    /// Output format (table or json)
    #[arg(long, global = true)]
    output: Option<String>,

    /// Suppress non-essential output
    #[arg(long, global = true)]
    quiet: bool,
}

#[derive(Subcommand)]
enum Commands {
    /// Run local repo-aware Reality Fork workflows
    Run {
        #[command(subcommand)]
        command: RunCommands,
    },
    /// Show the config path
    Config {
        #[command(subcommand)]
        command: ConfigCommands,
    },
}

#[derive(Subcommand)]
enum RunCommands {
    /// Stress-test a repo launch and emit shareable artifacts
    Launch {
        /// Repository path
        #[arg(long, default_value = ".")]
        repo: String,
        /// Limit analysis to specific subpaths
        #[arg(long)]
        focus: Vec<String>,
        /// Launch question
        #[arg(long, default_value = "Should we ship this now?")]
        prompt: String,
        /// Report title
        #[arg(long)]
        title: Option<String>,
        /// Directory for decision.md, report.html, and trace.json
        #[arg(long)]
        output_dir: Option<String>,
        /// Open report.html in default browser after run
        #[arg(long)]
        open: bool,
    },
    /// Compare two launch runs and show score deltas
    Diff {
        /// Path to first trace.json or output directory
        before: String,
        /// Path to second trace.json or output directory
        after: String,
        /// Write diff.md and diff.html to this directory
        #[arg(long)]
        output_dir: Option<String>,
    },
    /// Watch a repo and re-run launch analysis on file changes
    Watch {
        /// Repository path
        #[arg(long, default_value = ".")]
        repo: String,
        /// Limit analysis to specific subpaths
        #[arg(long)]
        focus: Vec<String>,
        /// Launch question
        #[arg(long, default_value = "Should we ship this now?")]
        prompt: String,
        /// Report title
        #[arg(long)]
        title: Option<String>,
        /// Directory for artifacts
        #[arg(long)]
        output_dir: Option<String>,
        /// Open report.html after each run
        #[arg(long)]
        open: bool,
    },
    /// Share the latest launch run as a GitHub gist
    Share {
        /// Directory containing run artifacts
        #[arg(long)]
        output_dir: Option<String>,
        /// Repository path (used to find latest run)
        #[arg(long, default_value = ".")]
        repo: String,
    },
}

#[derive(Subcommand)]
enum ConfigCommands {
    /// Print the config path
    Path,
    /// Print the current config
    Show,
}

fn default_output_dir(repo_path: &Path, generated_at: &str) -> PathBuf {
    let stamp = generated_at.replace([':', '.'], "-");
    repo_path
        .join(".reality-fork")
        .join("runs")
        .join(format!("launch-{stamp}"))
}

fn write_artifacts(run: &LaunchRun, output_dir: &Path) -> ArtifactPaths {
    let dir = output_dir.to_path_buf();
    fs::create_dir_all(&dir).expect("failed to create output directory");

    let decision = dir.join("decision.md");
    let report = dir.join("report.html");
    let trace = dir.join("trace.json");

    fs::write(&decision, render_decision_markdown(run)).expect("failed to write decision.md");
    fs::write(&report, render_report_html(run)).expect("failed to write report.html");
    fs::write(
        &trace,
        serde_json::to_string_pretty(run).expect("failed to serialize trace"),
    )
    .expect("failed to write trace.json");

    ArtifactPaths {
        output_dir: dir.to_string_lossy().to_string(),
        decision_path: decision.to_string_lossy().to_string(),
        report_path: report.to_string_lossy().to_string(),
        trace_path: trace.to_string_lossy().to_string(),
    }
}

fn format_percent(v: f64) -> String {
    percent(v)
}

fn axis_bar(score: f64, width: usize) -> String {
    let filled = (score * width as f64).round() as usize;
    let empty = width.saturating_sub(filled);
    "\u{2588}".repeat(filled) + &"\u{2591}".repeat(empty)
}

fn display_path_from_cwd(file_path: &str) -> String {
    let cwd = std::env::current_dir().unwrap_or_default();
    let abs = PathBuf::from(file_path);
    match abs.strip_prefix(&cwd) {
        Ok(rel) if !rel.to_string_lossy().starts_with("..") => rel.to_string_lossy().to_string(),
        _ => file_path.to_string(),
    }
}

fn render_launch_progress(run: &LaunchRun, artifacts: &ArtifactPaths) {
    let stderr = std::io::stderr();
    let mut w = stderr.lock();

    write!(
        w,
        "\n  {} {}\n\n",
        "reality fork".dimmed(),
        "\u{5206}\u{5c90}\u{73fe}\u{754c}".magenta()
    )
    .ok();
    write!(w, "  {}  {}\n", "repo".dimmed(), run.repo.name.white()).ok();
    write!(w, "  {} {}", "files".dimmed(), run.repo.file_count).ok();

    if !run.repo.languages.is_empty() {
        write!(
            w,
            " {} {}",
            "\u{00b7}".dimmed(),
            run.repo
                .languages
                .iter()
                .take(3)
                .map(|l| l.name.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        )
        .ok();
    }
    if !run.repo.frameworks.is_empty() {
        write!(
            w,
            " {} {}",
            "\u{00b7}".dimmed(),
            run.repo.frameworks.join(", ").cyan()
        )
        .ok();
    }
    writeln!(w).ok();
    writeln!(w).ok();

    let pad_len = run.axes.iter().map(|a| a.label.len()).max().unwrap_or(0);
    for axis in &run.axes {
        let label = format!("{:width$}", axis.label, width = pad_len);
        let bar = axis_bar(axis.score, 20);
        let pct = format!("{:>4}", format_percent(axis.score));

        let (colored_bar, colored_pct) = if axis.score >= 0.7 {
            (bar.cyan().to_string(), pct.cyan().to_string())
        } else if axis.score >= 0.5 {
            (bar.white().to_string(), pct.white().to_string())
        } else {
            (bar.magenta().to_string(), pct.magenta().to_string())
        };

        write!(w, "  {}  {}  {}\n", label.dimmed(), colored_bar, colored_pct).ok();
        w.flush().ok();
        thread::sleep(Duration::from_millis(60));
    }

    writeln!(w).ok();
    let verdict_colored = if run.verdict.winner_branch_id == crate::types::BranchId::ShipNow {
        run.verdict.label.cyan().to_string()
    } else if run.verdict.winner_branch_id == crate::types::BranchId::NarrowLaunch {
        run.verdict.label.white().to_string()
    } else {
        run.verdict.label.magenta().to_string()
    };
    write!(w, "  {verdict_colored}\n").ok();
    write!(w, "  {}\n", run.verdict.reason.dimmed()).ok();
    write!(
        w,
        "  {} {}\n",
        "readiness".dimmed(),
        format_percent(run.verdict.readiness).cyan()
    )
    .ok();

    writeln!(w).ok();
    write!(w, "  {}\n", "artifacts".dimmed()).ok();
    write!(
        w,
        "  {} {}\n",
        "decision".dimmed(),
        display_path_from_cwd(&artifacts.decision_path)
    )
    .ok();
    write!(
        w,
        "  {} {}\n",
        "report  ".dimmed(),
        display_path_from_cwd(&artifacts.report_path)
    )
    .ok();
    write!(
        w,
        "  {} {}\n\n",
        "trace   ".dimmed(),
        display_path_from_cwd(&artifacts.trace_path)
    )
    .ok();
}

fn open_in_browser(file_path: &str) {
    let cmd = if cfg!(target_os = "macos") {
        "open"
    } else if cfg!(target_os = "windows") {
        "start"
    } else {
        "xdg-open"
    };
    Command::new(cmd)
        .arg(file_path)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .ok();
}

fn resolve_trace(arg: &str) -> PathBuf {
    let p = PathBuf::from(arg);
    let p = if p.is_relative() {
        std::env::current_dir().unwrap_or_default().join(p)
    } else {
        p
    };
    if p.extension().map(|e| e == "json").unwrap_or(false) {
        p
    } else {
        p.join("trace.json")
    }
}

fn cmd_launch(
    repo: &str,
    focus: &[String],
    prompt: &str,
    title: Option<&str>,
    output_dir: Option<&str>,
    open: bool,
    output_format: Option<&str>,
    quiet: bool,
) {
    let repo_path = PathBuf::from(repo).canonicalize().unwrap_or_else(|_| PathBuf::from(repo));
    let ctx = collect_repo_context(&repo_path, focus);
    let run = create_launch_run_with(ctx, Some(prompt.to_string()), title.map(String::from));

    let out_dir = match output_dir {
        Some(d) => PathBuf::from(d).canonicalize().unwrap_or_else(|_| PathBuf::from(d)),
        None => default_output_dir(&repo_path, &run.generated_at),
    };
    let artifacts = write_artifacts(&run, &out_dir);

    if output_format == Some("json") {
        let mut top_axes = run.axes.clone();
        top_axes.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap().then(a.id.label().cmp(b.id.label())));
        top_axes.truncate(3);
        let json = serde_json::json!({
            "verdict": run.verdict,
            "topAxes": top_axes,
            "actions": run.actions,
            "posts": run.posts,
            "artifacts": {
                "outputDir": artifacts.output_dir,
                "decisionPath": artifacts.decision_path,
                "reportPath": artifacts.report_path,
                "tracePath": artifacts.trace_path,
            }
        });
        println!("{}", serde_json::to_string_pretty(&json).unwrap());
    } else if !quiet {
        render_launch_progress(&run, &artifacts);
    }

    if open {
        open_in_browser(&artifacts.report_path);
    }
}

fn cmd_diff(before: &str, after: &str, output_dir: Option<&str>, output_format: Option<&str>, quiet: bool) {
    let before_path = resolve_trace(before);
    let after_path = resolve_trace(after);

    let before_run: LaunchRun =
        serde_json::from_str(&fs::read_to_string(&before_path).expect("failed to read before trace"))
            .expect("failed to parse before trace");
    let after_run: LaunchRun =
        serde_json::from_str(&fs::read_to_string(&after_path).expect("failed to read after trace"))
            .expect("failed to parse after trace");

    let diff = diff_launch_runs(&before_run, &after_run);

    if output_format == Some("json") {
        println!(
            "{}",
            serde_json::to_string_pretty(&diff).unwrap()
        );
    } else if !quiet {
        let stderr = std::io::stderr();
        let mut w = stderr.lock();

        write!(
            w,
            "\n  {} {}\n\n",
            "reality fork".dimmed(),
            "\u{5206}\u{5c90}\u{73fe}\u{754c}".magenta()
        )
        .ok();
        write!(
            w,
            "  {} \u{2192} {}\n\n",
            diff.before.generated_at.dimmed(),
            diff.after.generated_at.dimmed()
        )
        .ok();

        let r_sign = if diff.readiness_delta > 0.0 { "+" } else { "" };
        let r_text = format!(
            "{}{r_sign}{}",
            "",
            (diff.readiness_delta * 100.0).round() as i64
        );
        let r_delta = format!("{r_sign}{}%", (diff.readiness_delta * 100.0).round() as i64);
        let r_colored = if diff.readiness_delta > 0.005 {
            r_delta.cyan().to_string()
        } else if diff.readiness_delta < -0.005 {
            r_delta.magenta().to_string()
        } else {
            r_delta.dimmed().to_string()
        };
        let _ = r_text;

        write!(
            w,
            "  {} {} \u{2192} {} {}\n",
            "readiness".dimmed(),
            format_percent(diff.before.readiness),
            format_percent(diff.after.readiness),
            r_colored,
        )
        .ok();

        if diff.verdict_changed {
            write!(
                w,
                "  {}   {} \u{2192} {}\n",
                "verdict".dimmed(),
                diff.before.verdict_label,
                diff.after.verdict_label.cyan(),
            )
            .ok();
        }
        writeln!(w).ok();

        let pad_len = diff.axes.iter().map(|a| a.label.len()).max().unwrap_or(0);
        for axis in &diff.axes {
            let label = format!("{:width$}", axis.label, width = pad_len);
            let d_sign = if axis.delta > 0.0 { "+" } else { "" };
            let d_text = format!("{d_sign}{}%", (axis.delta * 100.0).round() as i64);
            let indicator = match axis.direction {
                Direction::Up => format!("\u{25b2} {d_text}").cyan().to_string(),
                Direction::Down => format!("\u{25bc} {d_text}").magenta().to_string(),
                Direction::Flat => format!("\u{2500} {d_text}").dimmed().to_string(),
            };

            write!(
                w,
                "  {}  {:>4} \u{2192} {:>4}  {}\n",
                label.dimmed(),
                format_percent(axis.before),
                format_percent(axis.after),
                indicator,
            )
            .ok();
        }
        writeln!(w).ok();
    }

    if let Some(dir) = output_dir {
        let out = PathBuf::from(dir);
        fs::create_dir_all(&out).expect("failed to create output dir");
        fs::write(out.join("diff.md"), render_diff_markdown(&diff)).expect("failed to write diff.md");
        fs::write(out.join("diff.html"), render_diff_html(&diff)).expect("failed to write diff.html");
        if !quiet && output_format != Some("json") {
            eprintln!(
                "  diff artifacts written to {}",
                display_path_from_cwd(&out.to_string_lossy())
            );
        }
    }
}

fn cmd_watch(
    repo: &str,
    focus: &[String],
    prompt: &str,
    title: Option<&str>,
    output_dir: Option<&str>,
    open: bool,
    output_format: Option<&str>,
    quiet: bool,
) {
    use notify::Watcher;
    use std::sync::mpsc;

    let (tx, rx) = mpsc::channel();
    let repo_path = PathBuf::from(repo)
        .canonicalize()
        .unwrap_or_else(|_| PathBuf::from(repo));

    let ignore_dirs: std::collections::HashSet<&str> =
        [".git", ".reality-fork", "node_modules", "dist", "target"]
            .into_iter()
            .collect();

    let run_once = |rp: &Path| {
        eprint!("\x1b[2J\x1b[H");
        cmd_launch(
            &rp.to_string_lossy(),
            focus,
            prompt,
            title,
            output_dir,
            open,
            output_format,
            quiet,
        );
        eprintln!("  {}", "watching for changes...".dimmed());
    };

    run_once(&repo_path);

    let mut watcher =
        notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
            if let Ok(event) = res {
                let dominated_by_ignored = event.paths.iter().all(|p| {
                    p.components().any(|c| {
                        ignore_dirs.contains(c.as_os_str().to_string_lossy().as_ref())
                    })
                });
                if !dominated_by_ignored {
                    tx.send(()).ok();
                }
            }
        })
        .expect("failed to create file watcher");

    watcher
        .watch(&repo_path, notify::RecursiveMode::Recursive)
        .expect("failed to watch repo");

    loop {
        if rx.recv().is_err() {
            break;
        }
        // debounce
        thread::sleep(Duration::from_millis(500));
        while rx.try_recv().is_ok() {}
        run_once(&repo_path);
    }
}

fn cmd_share(output_dir: Option<&str>, repo: &str, output_format: Option<&str>, quiet: bool) {
    let out_dir = if let Some(d) = output_dir {
        PathBuf::from(d)
    } else {
        let repo_path = PathBuf::from(repo)
            .canonicalize()
            .unwrap_or_else(|_| PathBuf::from(repo));
        let runs_dir = repo_path.join(".reality-fork").join("runs");
        let mut entries: Vec<String> = fs::read_dir(&runs_dir)
            .expect(&format!("no runs found in {}", runs_dir.display()))
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|e| e.starts_with("launch-"))
            .collect();
        entries.sort();
        entries.reverse();
        if entries.is_empty() {
            eprintln!("{}", "no launch runs found".red());
            std::process::exit(1);
        }
        runs_dir.join(&entries[0])
    };

    let decision = out_dir.join("decision.md");
    let trace = out_dir.join("trace.json");

    for f in [&decision, &trace] {
        if !f.exists() {
            eprintln!("{}", format!("missing artifact: {}", f.display()).red());
            std::process::exit(1);
        }
    }

    let result = Command::new("gh")
        .args([
            "gist",
            "create",
            "--public",
            "--desc",
            "Reality Fork launch run",
        ])
        .arg(&decision)
        .arg(&trace)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output();

    match result {
        Ok(output) if output.status.success() => {
            let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if output_format == Some("json") {
                println!(
                    "{}",
                    serde_json::json!({"gistUrl": url, "outputDir": out_dir.to_string_lossy()})
                );
            } else if !quiet {
                eprintln!("  {} {}", "gist created:".green(), url);
            }
        }
        _ => {
            // fallback: copy to clipboard
            let content = fs::read_to_string(&decision).unwrap_or_default();
            let clip_cmd = if cfg!(target_os = "macos") {
                "pbcopy"
            } else if cfg!(target_os = "windows") {
                "clip"
            } else {
                "xclip"
            };
            let clip_result = Command::new(clip_cmd)
                .stdin(std::process::Stdio::piped())
                .spawn()
                .and_then(|mut child| {
                    if let Some(stdin) = child.stdin.as_mut() {
                        stdin.write_all(content.as_bytes())?;
                    }
                    child.wait()
                });

            match clip_result {
                Ok(status) if status.success() => {
                    if !quiet {
                        eprintln!(
                            "  {}",
                            "decision.md copied to clipboard (install gh cli to create gists)"
                                .green()
                        );
                    }
                }
                _ => {
                    eprintln!(
                        "  {}",
                        "gh cli not found and clipboard copy failed. install gh: https://cli.github.com"
                            .red()
                    );
                }
            }
        }
    }
}

fn main() {
    let cli = Cli::parse();
    let output_format = cli.output.as_deref();
    let quiet = cli.quiet;

    match cli.command {
        Commands::Run { command } => match command {
            RunCommands::Launch {
                repo,
                focus,
                prompt,
                title,
                output_dir,
                open,
            } => {
                cmd_launch(
                    &repo,
                    &focus,
                    &prompt,
                    title.as_deref(),
                    output_dir.as_deref(),
                    open,
                    output_format,
                    quiet,
                );
            }
            RunCommands::Diff {
                before,
                after,
                output_dir,
            } => {
                cmd_diff(&before, &after, output_dir.as_deref(), output_format, quiet);
            }
            RunCommands::Watch {
                repo,
                focus,
                prompt,
                title,
                output_dir,
                open,
            } => {
                cmd_watch(
                    &repo,
                    &focus,
                    &prompt,
                    title.as_deref(),
                    output_dir.as_deref(),
                    open,
                    output_format,
                    quiet,
                );
            }
            RunCommands::Share { output_dir, repo } => {
                cmd_share(output_dir.as_deref(), &repo, output_format, quiet);
            }
        },
        Commands::Config { command } => match command {
            ConfigCommands::Path => {
                let store = ConfigStore::load();
                println!("{}", store.config_path().display());
            }
            ConfigCommands::Show => {
                let store = ConfigStore::load();
                println!(
                    "{}",
                    serde_json::to_string_pretty(&store.config).unwrap()
                );
            }
        },
    }
}
