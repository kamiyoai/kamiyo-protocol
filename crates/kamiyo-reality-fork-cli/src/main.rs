macro_rules! regex {
    ($pat:expr) => {{
        static RE: once_cell::sync::Lazy<regex::Regex> =
            once_cell::sync::Lazy::new(|| regex::Regex::new($pat).unwrap());
        &*RE
    }};
}

mod config;
mod diff;
mod render;
mod repo;
mod scoring;
mod solana;
mod types;

use std::fs;
use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::process::{self, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use anyhow::{bail, Context, Result};
use clap::{CommandFactory, Parser, Subcommand};
use clap_complete::{generate, Shell};
use colored::Colorize;

use crate::config::ConfigStore;
use crate::diff::{diff_launch_runs, render_diff_html, render_diff_markdown, Direction};
use crate::render::{render_decision_markdown, render_report_html};
use crate::repo::collect_repo_context;
use crate::scoring::{create_launch_run_with, percent};
use crate::solana::{
    AgentType as SolanaAgentType, SolanaRpc,
};
use crate::types::{ArtifactPaths, LaunchRun};

#[derive(Parser)]
#[command(
    name = "reality-fork",
    about = "Native CLI for KAMIYO Reality Fork \u{2014} repo-aware launch stress tests.",
    version,
    propagate_version = true
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,

    /// Output format
    #[arg(long, global = true, value_parser = ["table", "json"])]
    output: Option<String>,

    /// Suppress non-essential output
    #[arg(long, global = true)]
    quiet: bool,

    /// Show verbose debug output
    #[arg(long, global = true)]
    verbose: bool,

    /// Solana cluster (devnet, mainnet, localnet, or RPC URL)
    #[arg(long, global = true, default_value = "devnet")]
    cluster: String,
}

#[derive(Subcommand)]
enum Commands {
    /// Run local repo-aware Reality Fork workflows
    Run {
        #[command(subcommand)]
        command: RunCommands,
    },
    /// Interact with on-chain KAMIYO agents
    Agent {
        #[command(subcommand)]
        command: AgentCommands,
    },
    /// Inspect and manage CLI configuration
    Config {
        #[command(subcommand)]
        command: ConfigCommands,
    },
    /// Generate shell completions
    Completions {
        /// Shell to generate completions for
        #[arg(value_enum)]
        shell: Shell,
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
enum AgentCommands {
    /// Fetch and display an agent's on-chain identity
    Info {
        /// Agent owner address (base58)
        owner: String,
    },
    /// List escrows for an agent
    Escrows {
        /// Agent owner address (base58)
        owner: String,
    },
    /// Create a new agent on-chain
    Create {
        /// Agent name (1-32 characters)
        #[arg(long)]
        name: String,
        /// Agent type: trading, service, oracle, custom
        #[arg(long, rename_all = "lower", default_value = "service")]
        r#type: String,
        /// Stake amount in SOL (minimum 0.1)
        #[arg(long)]
        stake: f64,
        /// Path to Solana keypair JSON file
        #[arg(long, default_value = "~/.config/solana/id.json")]
        keypair: String,
    },
    /// Deactivate your agent and reclaim stake
    Deactivate {
        /// Path to Solana keypair JSON file
        #[arg(long, default_value = "~/.config/solana/id.json")]
        keypair: String,
    },
    /// Show the agent PDA for an owner address
    Pda {
        /// Owner address (base58)
        owner: String,
    },
}

#[derive(Subcommand)]
enum ConfigCommands {
    /// Print the config file path
    Path,
    /// Print the current config as JSON
    Show,
}

fn default_output_dir(repo_path: &Path, generated_at: &str) -> PathBuf {
    let stamp = generated_at.replace([':', '.'], "-");
    repo_path
        .join(".reality-fork")
        .join("runs")
        .join(format!("launch-{stamp}"))
}

fn write_artifacts(run: &LaunchRun, output_dir: &Path) -> Result<ArtifactPaths> {
    let dir = output_dir.to_path_buf();
    fs::create_dir_all(&dir)
        .with_context(|| format!("failed to create output directory: {}", dir.display()))?;

    let decision = dir.join("decision.md");
    let report = dir.join("report.html");
    let trace = dir.join("trace.json");

    fs::write(&decision, render_decision_markdown(run))
        .with_context(|| format!("failed to write {}", decision.display()))?;
    fs::write(&report, render_report_html(run))
        .with_context(|| format!("failed to write {}", report.display()))?;

    let trace_json = serde_json::to_string_pretty(run).context("failed to serialize trace")?;
    fs::write(&trace, trace_json)
        .with_context(|| format!("failed to write {}", trace.display()))?;

    Ok(ArtifactPaths {
        output_dir: dir.to_string_lossy().to_string(),
        decision_path: decision.to_string_lossy().to_string(),
        report_path: report.to_string_lossy().to_string(),
        trace_path: trace.to_string_lossy().to_string(),
    })
}

fn format_percent(v: f64) -> String {
    percent(v)
}

fn axis_bar(score: f64, width: usize) -> String {
    let clamped = score.clamp(0.0, 1.0);
    let filled = (clamped * width as f64).round() as usize;
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

    let _ = write!(
        w,
        "\n  {} {}\n\n",
        "reality fork".dimmed(),
        "\u{5206}\u{5c90}\u{73fe}\u{754c}".magenta()
    );
    let _ = write!(w, "  {}  {}\n", "repo".dimmed(), run.repo.name.white());
    let _ = write!(w, "  {} {}", "files".dimmed(), run.repo.file_count);

    if !run.repo.languages.is_empty() {
        let _ = write!(
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
        );
    }
    if !run.repo.frameworks.is_empty() {
        let _ = write!(
            w,
            " {} {}",
            "\u{00b7}".dimmed(),
            run.repo.frameworks.join(", ").cyan()
        );
    }
    let _ = writeln!(w);
    let _ = writeln!(w);

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

        let _ = write!(w, "  {}  {}  {}\n", label.dimmed(), colored_bar, colored_pct);
        let _ = w.flush();
        thread::sleep(Duration::from_millis(60));
    }

    let _ = writeln!(w);
    let verdict_colored = match run.verdict.winner_branch_id {
        crate::types::BranchId::ShipNow => run.verdict.label.cyan().to_string(),
        crate::types::BranchId::NarrowLaunch => run.verdict.label.white().to_string(),
        _ => run.verdict.label.magenta().to_string(),
    };
    let _ = writeln!(w, "  {verdict_colored}");
    let _ = writeln!(w, "  {}", run.verdict.reason.dimmed());
    let _ = write!(
        w,
        "  {} {}\n",
        "readiness".dimmed(),
        format_percent(run.verdict.readiness).cyan()
    );

    let _ = writeln!(w);
    let _ = writeln!(w, "  {}", "artifacts".dimmed());
    let _ = writeln!(
        w,
        "  {} {}",
        "decision".dimmed(),
        display_path_from_cwd(&artifacts.decision_path)
    );
    let _ = writeln!(
        w,
        "  {} {}",
        "report  ".dimmed(),
        display_path_from_cwd(&artifacts.report_path)
    );
    let _ = writeln!(
        w,
        "  {} {}\n",
        "trace   ".dimmed(),
        display_path_from_cwd(&artifacts.trace_path)
    );
}

fn open_in_browser(file_path: &str) {
    let cmd = if cfg!(target_os = "macos") {
        "open"
    } else if cfg!(target_os = "windows") {
        "start"
    } else {
        "xdg-open"
    };
    let _ = Command::new(cmd)
        .arg(file_path)
        .stdout(process::Stdio::null())
        .stderr(process::Stdio::null())
        .spawn();
}

fn resolve_trace(arg: &str) -> PathBuf {
    let p = PathBuf::from(arg);
    let p = if p.is_relative() {
        std::env::current_dir().unwrap_or_default().join(p)
    } else {
        p
    };
    if p.extension().is_some_and(|e| e == "json") {
        p
    } else {
        p.join("trace.json")
    }
}

fn validate_repo_path(repo: &str) -> Result<PathBuf> {
    let p = PathBuf::from(repo);
    let resolved = p.canonicalize().unwrap_or(p);
    if !resolved.exists() {
        bail!("repository path does not exist: {}", resolved.display());
    }
    if !resolved.is_dir() {
        bail!(
            "repository path is not a directory: {}",
            resolved.display()
        );
    }
    Ok(resolved)
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
) -> Result<()> {
    let repo_path = validate_repo_path(repo)?;
    let ctx = collect_repo_context(&repo_path, focus);
    let run = create_launch_run_with(ctx, Some(prompt.to_string()), title.map(String::from));

    let out_dir = match output_dir {
        Some(d) => {
            let p = PathBuf::from(d);
            p.canonicalize().unwrap_or(p)
        }
        None => default_output_dir(&repo_path, &run.generated_at),
    };
    let artifacts = write_artifacts(&run, &out_dir)?;

    if output_format == Some("json") {
        let mut top_axes = run.axes.clone();
        top_axes.sort_by(|a, b| b.score.total_cmp(&a.score).then(a.id.label().cmp(b.id.label())));
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
        println!("{}", serde_json::to_string_pretty(&json)?);
    } else if !quiet {
        render_launch_progress(&run, &artifacts);
    }

    if open {
        open_in_browser(&artifacts.report_path);
    }

    Ok(())
}

fn cmd_diff(
    before: &str,
    after: &str,
    output_dir: Option<&str>,
    output_format: Option<&str>,
    quiet: bool,
) -> Result<()> {
    let before_path = resolve_trace(before);
    let after_path = resolve_trace(after);

    let before_text = fs::read_to_string(&before_path)
        .with_context(|| format!("failed to read {}", before_path.display()))?;
    let after_text = fs::read_to_string(&after_path)
        .with_context(|| format!("failed to read {}", after_path.display()))?;

    let before_run: LaunchRun =
        serde_json::from_str(&before_text).context("failed to parse before trace as valid launch run")?;
    let after_run: LaunchRun =
        serde_json::from_str(&after_text).context("failed to parse after trace as valid launch run")?;

    let diff = diff_launch_runs(&before_run, &after_run);

    if output_format == Some("json") {
        println!("{}", serde_json::to_string_pretty(&diff)?);
    } else if !quiet {
        let stderr = std::io::stderr();
        let mut w = stderr.lock();

        let _ = write!(
            w,
            "\n  {} {}\n\n",
            "reality fork".dimmed(),
            "\u{5206}\u{5c90}\u{73fe}\u{754c}".magenta()
        );
        let _ = write!(
            w,
            "  {} \u{2192} {}\n\n",
            diff.before.generated_at.dimmed(),
            diff.after.generated_at.dimmed()
        );

        let r_sign = if diff.readiness_delta > 0.0 { "+" } else { "" };
        let r_delta = format!("{r_sign}{}%", (diff.readiness_delta * 100.0).round() as i64);
        let r_colored = if diff.readiness_delta > 0.005 {
            r_delta.cyan().to_string()
        } else if diff.readiness_delta < -0.005 {
            r_delta.magenta().to_string()
        } else {
            r_delta.dimmed().to_string()
        };

        let _ = write!(
            w,
            "  {} {} \u{2192} {} {}\n",
            "readiness".dimmed(),
            format_percent(diff.before.readiness),
            format_percent(diff.after.readiness),
            r_colored,
        );

        if diff.verdict_changed {
            let _ = write!(
                w,
                "  {}   {} \u{2192} {}\n",
                "verdict".dimmed(),
                diff.before.verdict_label,
                diff.after.verdict_label.cyan(),
            );
        }
        let _ = writeln!(w);

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

            let _ = write!(
                w,
                "  {}  {:>4} \u{2192} {:>4}  {}\n",
                label.dimmed(),
                format_percent(axis.before),
                format_percent(axis.after),
                indicator,
            );
        }
        let _ = writeln!(w);
    }

    if let Some(dir) = output_dir {
        let out = PathBuf::from(dir);
        fs::create_dir_all(&out)
            .with_context(|| format!("failed to create {}", out.display()))?;
        fs::write(out.join("diff.md"), render_diff_markdown(&diff))
            .context("failed to write diff.md")?;
        fs::write(out.join("diff.html"), render_diff_html(&diff))
            .context("failed to write diff.html")?;
        if !quiet && output_format != Some("json") {
            eprintln!(
                "  diff artifacts written to {}",
                display_path_from_cwd(&out.to_string_lossy())
            );
        }
    }

    Ok(())
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
) -> Result<()> {
    use notify::Watcher;
    use std::sync::mpsc;

    let repo_path = validate_repo_path(repo)?;
    let (tx, rx) = mpsc::channel();

    let shutdown = Arc::new(AtomicBool::new(false));
    let shutdown_flag = shutdown.clone();
    ctrlc::set_handler(move || {
        shutdown_flag.store(true, Ordering::SeqCst);
    })
    .context("failed to set signal handler")?;

    let ignore_dirs: std::collections::HashSet<&str> =
        [".git", ".reality-fork", "node_modules", "dist", "target"]
            .into_iter()
            .collect();

    let run_once = |rp: &Path| {
        eprint!("\x1b[2J\x1b[H");
        if let Err(e) = cmd_launch(
            &rp.to_string_lossy(),
            focus,
            prompt,
            title,
            output_dir,
            open,
            output_format,
            quiet,
        ) {
            eprintln!("  {}", format!("error: {e:#}").red());
        }
        eprintln!("  {}", "watching for changes... (ctrl-c to stop)".dimmed());
    };

    run_once(&repo_path);

    let mut watcher =
        notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
            if let Ok(event) = res {
                let all_ignored = event.paths.iter().all(|p| {
                    p.components().any(|c| {
                        ignore_dirs.contains(c.as_os_str().to_string_lossy().as_ref())
                    })
                });
                if !all_ignored {
                    let _ = tx.send(());
                }
            }
        })
        .context("failed to create file watcher")?;

    watcher
        .watch(&repo_path, notify::RecursiveMode::Recursive)
        .with_context(|| format!("failed to watch {}", repo_path.display()))?;

    loop {
        if shutdown.load(Ordering::SeqCst) {
            break;
        }
        match rx.recv_timeout(Duration::from_millis(250)) {
            Ok(()) => {
                thread::sleep(Duration::from_millis(500));
                while rx.try_recv().is_ok() {}
                run_once(&repo_path);
            }
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }

    Ok(())
}

fn cmd_share(
    output_dir: Option<&str>,
    repo: &str,
    output_format: Option<&str>,
    quiet: bool,
) -> Result<()> {
    let out_dir = if let Some(d) = output_dir {
        PathBuf::from(d)
    } else {
        let repo_path = validate_repo_path(repo)?;
        let runs_dir = repo_path.join(".reality-fork").join("runs");
        let mut entries: Vec<String> = fs::read_dir(&runs_dir)
            .with_context(|| format!("no runs found in {}", runs_dir.display()))?
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|e| e.starts_with("launch-"))
            .collect();
        entries.sort();
        entries.reverse();
        if entries.is_empty() {
            bail!("no launch runs found in {}", runs_dir.display());
        }
        runs_dir.join(&entries[0])
    };

    let decision = out_dir.join("decision.md");
    let trace = out_dir.join("trace.json");

    if !decision.exists() {
        bail!("missing artifact: {}", decision.display());
    }
    if !trace.exists() {
        bail!("missing artifact: {}", trace.display());
    }

    let result = Command::new("gh")
        .args(["gist", "create", "--public", "--desc", "Reality Fork launch run"])
        .arg(&decision)
        .arg(&trace)
        .stdout(process::Stdio::piped())
        .stderr(process::Stdio::piped())
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
            let content = fs::read_to_string(&decision)
                .with_context(|| format!("failed to read {}", decision.display()))?;
            let clip_cmd = if cfg!(target_os = "macos") {
                "pbcopy"
            } else if cfg!(target_os = "windows") {
                "clip"
            } else {
                "xclip"
            };
            let clip_result = Command::new(clip_cmd)
                .stdin(process::Stdio::piped())
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
                    bail!("gh cli not found and clipboard copy failed. install gh: https://cli.github.com");
                }
            }
        }
    }

    Ok(())
}

fn cmd_agent_info(
    owner_str: &str,
    cluster: &str,
    output_format: Option<&str>,
) -> Result<()> {
    let owner: crate::solana::Pubkey = owner_str
        .parse()
        .context("invalid owner address")?;
    let rpc = SolanaRpc::new(cluster);
    let agent = rpc.get_agent(&owner)?;

    if output_format == Some("json") {
        println!("{}", serde_json::to_string_pretty(&agent)?);
        return Ok(());
    }

    let stderr = std::io::stderr();
    let mut w = stderr.lock();

    let status = if agent.is_active {
        "active".cyan().to_string()
    } else {
        "inactive".magenta().to_string()
    };

    let rep_pct = format!("{} / 1000", agent.reputation);
    let rep_colored = if agent.reputation >= 700 {
        rep_pct.cyan().to_string()
    } else if agent.reputation >= 400 {
        rep_pct.white().to_string()
    } else {
        rep_pct.magenta().to_string()
    };

    let _ = write!(w, "\n  {} {}\n\n", "agent".dimmed(), "\u{9b42}".magenta());
    let _ = writeln!(w, "  {}       {}", "name".dimmed(), agent.name.white());
    let _ = writeln!(w, "  {}       {}", "type".dimmed(), agent.agent_type.label());
    let _ = writeln!(w, "  {}     {}", "status".dimmed(), status);
    let _ = writeln!(w);
    let _ = writeln!(w, "  {} {}", "reputation".dimmed(), rep_colored);
    let _ = writeln!(w, "  {}      {}", "stake".dimmed(), solana::format_sol(agent.stake_amount).cyan());
    let _ = writeln!(w);
    let _ = writeln!(
        w,
        "  {}    {} total \u{00b7} {} successful \u{00b7} {} disputed",
        "escrows".dimmed(),
        agent.total_escrows,
        agent.successful_escrows,
        agent.disputed_escrows,
    );
    let _ = writeln!(w);
    let _ = writeln!(w, "  {}    {}", "created".dimmed(), solana::format_timestamp(agent.created_at));
    let _ = writeln!(w, "  {}     {}", "active".dimmed(), solana::format_timestamp(agent.last_active));
    let _ = writeln!(w);
    let _ = writeln!(w, "  {}      {}", "owner".dimmed(), agent.owner);
    let _ = writeln!(w, "  {}        {}", "pda".dimmed(), agent.pda);
    let _ = writeln!(w, "  {}    {}\n", "cluster".dimmed(), solana::cluster_label(cluster).dimmed());

    Ok(())
}

fn cmd_agent_escrows(
    owner_str: &str,
    cluster: &str,
    output_format: Option<&str>,
) -> Result<()> {
    let owner: crate::solana::Pubkey = owner_str
        .parse()
        .context("invalid owner address")?;
    let rpc = SolanaRpc::new(cluster);
    let (pda, _) = solana::agent_pda(&owner)?;
    let escrows = rpc.get_escrows_for_agent(&pda)?;

    if output_format == Some("json") {
        println!("{}", serde_json::to_string_pretty(&escrows)?);
        return Ok(());
    }

    let stderr = std::io::stderr();
    let mut w = stderr.lock();

    let _ = write!(w, "\n  {} {}\n\n", "agent".dimmed(), "\u{9b42} escrows".magenta());

    if escrows.is_empty() {
        let _ = writeln!(w, "  {}\n", "no escrows found".dimmed());
        return Ok(());
    }

    for e in &escrows {
        let status_colored = match e.status {
            solana::EscrowStatus::Active => e.status.label().cyan().to_string(),
            solana::EscrowStatus::Released => e.status.label().green().to_string(),
            solana::EscrowStatus::Disputed => e.status.label().magenta().to_string(),
            solana::EscrowStatus::Resolved => e.status.label().white().to_string(),
        };

        let quality = e
            .quality_score
            .map(|q| format!("quality: {q}"))
            .unwrap_or_default();

        let _ = writeln!(
            w,
            "  {}  {:>10}  {}  {}  {}",
            e.transaction_id.dimmed(),
            status_colored,
            solana::format_sol(e.amount),
            solana::format_timestamp(e.created_at).dimmed(),
            quality.dimmed(),
        );
    }
    let _ = writeln!(w);

    Ok(())
}

fn cmd_agent_create(
    name: &str,
    agent_type_str: &str,
    stake_sol: f64,
    keypair_path: &str,
    cluster: &str,
    quiet: bool,
) -> Result<()> {
    let agent_type: SolanaAgentType = agent_type_str.parse()?;
    if !stake_sol.is_finite() || stake_sol < 0.0 {
        bail!("invalid stake amount: {stake_sol}");
    }
    let stake_lamports = (stake_sol * 1e9) as u64;

    let (signing_key, owner) = solana::load_keypair(keypair_path)?;
    let rpc = SolanaRpc::new(cluster);
    let (pda, _) = solana::agent_pda(&owner)?;

    if !quiet {
        let stderr = std::io::stderr();
        let mut w = stderr.lock();
        let _ = write!(w, "\n  {} {}\n\n", "agent".dimmed(), "\u{9b42} creating...".magenta());
        let _ = writeln!(w, "  {}       {}", "name".dimmed(), name);
        let _ = writeln!(w, "  {}       {}", "type".dimmed(), agent_type.label());
        let _ = writeln!(w, "  {}      {}", "stake".dimmed(), solana::format_sol(stake_lamports));
        let _ = writeln!(w, "  {}      {}", "owner".dimmed(), owner);
        let _ = writeln!(w, "  {}        {}", "pda".dimmed(), pda);
        let _ = writeln!(w, "  {}    {}", "cluster".dimmed(), solana::cluster_label(cluster));
        let _ = writeln!(w);
    }

    let sig = solana::create_agent_tx(&rpc, &signing_key, &owner, name, agent_type, stake_lamports)?;

    if !quiet {
        eprintln!("  {}  {}\n", "tx".green(), sig);
    } else {
        println!("{sig}");
    }

    Ok(())
}

fn cmd_agent_deactivate(
    keypair_path: &str,
    cluster: &str,
    quiet: bool,
) -> Result<()> {
    let (signing_key, owner) = solana::load_keypair(keypair_path)?;
    let rpc = SolanaRpc::new(cluster);

    if !quiet {
        let (pda, _) = solana::agent_pda(&owner)?;
        let stderr = std::io::stderr();
        let mut w = stderr.lock();
        let _ = write!(w, "\n  {} {}\n\n", "agent".dimmed(), "\u{9b42} deactivating...".magenta());
        let _ = writeln!(w, "  {}      {}", "owner".dimmed(), owner);
        let _ = writeln!(w, "  {}        {}", "pda".dimmed(), pda);
        let _ = writeln!(w, "  {}    {}", "cluster".dimmed(), solana::cluster_label(cluster));
        let _ = writeln!(w);
    }

    let sig = solana::deactivate_agent_tx(&rpc, &signing_key, &owner)?;

    if !quiet {
        eprintln!("  {}  {}\n", "tx".green(), sig);
    } else {
        println!("{sig}");
    }

    Ok(())
}

fn cmd_agent_pda(owner_str: &str) -> Result<()> {
    let owner: crate::solana::Pubkey = owner_str
        .parse()
        .context("invalid owner address")?;
    let (pda, bump) = solana::agent_pda(&owner)?;
    println!("{pda} (bump: {bump})");
    Ok(())
}

fn run() -> Result<()> {
    let cli = Cli::parse();
    let output_format = cli.output.as_deref();
    let quiet = cli.quiet;
    let cluster = &cli.cluster;

    match cli.command {
        Commands::Agent { command } => match command {
            AgentCommands::Info { owner } => cmd_agent_info(&owner, cluster, output_format),
            AgentCommands::Escrows { owner } => cmd_agent_escrows(&owner, cluster, output_format),
            AgentCommands::Create { name, r#type, stake, keypair } => {
                cmd_agent_create(&name, &r#type, stake, &keypair, cluster, quiet)
            }
            AgentCommands::Deactivate { keypair } => {
                cmd_agent_deactivate(&keypair, cluster, quiet)
            }
            AgentCommands::Pda { owner } => cmd_agent_pda(&owner),
        },
        Commands::Run { command } => match command {
            RunCommands::Launch {
                repo,
                focus,
                prompt,
                title,
                output_dir,
                open,
            } => cmd_launch(
                &repo,
                &focus,
                &prompt,
                title.as_deref(),
                output_dir.as_deref(),
                open,
                output_format,
                quiet,
            ),
            RunCommands::Diff {
                before,
                after,
                output_dir,
            } => cmd_diff(&before, &after, output_dir.as_deref(), output_format, quiet),
            RunCommands::Watch {
                repo,
                focus,
                prompt,
                title,
                output_dir,
                open,
            } => cmd_watch(
                &repo,
                &focus,
                &prompt,
                title.as_deref(),
                output_dir.as_deref(),
                open,
                output_format,
                quiet,
            ),
            RunCommands::Share { output_dir, repo } => {
                cmd_share(output_dir.as_deref(), &repo, output_format, quiet)
            }
        },
        Commands::Config { command } => match command {
            ConfigCommands::Path => {
                let store = ConfigStore::load();
                println!("{}", store.config_path().display());
                Ok(())
            }
            ConfigCommands::Show => {
                let store = ConfigStore::load();
                println!("{}", serde_json::to_string_pretty(&store.config)?);
                Ok(())
            }
        },
        Commands::Completions { shell } => {
            generate(shell, &mut Cli::command(), "reality-fork", &mut std::io::stdout());
            Ok(())
        }
    }
}

fn main() {
    if let Err(err) = run() {
        eprintln!("{} {err:#}", "error:".red().bold());
        process::exit(1);
    }
}
