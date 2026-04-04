use std::path::Path;

use crate::types::*;

fn clamp(v: f64) -> f64 {
    v.clamp(0.0, 1.0)
}

fn average(vals: &[f64]) -> f64 {
    if vals.is_empty() {
        return 0.0;
    }
    vals.iter().sum::<f64>() / vals.len() as f64
}

pub fn percent(v: f64) -> String {
    format!("{}%", (v * 100.0).round() as i64)
}

fn trim_post(v: &str) -> String {
    if v.len() <= 280 {
        v.to_string()
    } else {
        format!("{}...", &v[..277])
    }
}

fn compact_text(value: &str, max: usize) -> String {
    let normalized: String = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.len() <= max {
        normalized
    } else {
        format!("{}...", &normalized[..max.saturating_sub(3)])
    }
}

fn sample<T: Clone>(vals: &[T], count: usize) -> Vec<T> {
    vals.iter().take(count).cloned().collect()
}

fn summarize_axis(id: AxisId, score: f64) -> String {
    match id {
        AxisId::Immediacy => {
            if score >= 0.78 {
                "A builder can reach first value quickly because the repo exposes concrete commands and local material."
            } else if score >= 0.58 {
                "There is a viable first run, but setup still asks for more context than a breakout launch should."
            } else {
                "First value is still buried behind setup, explanation, or external dependencies."
            }
        }
        AxisId::Clarity => {
            if score >= 0.78 {
                "The docs lead with a concrete outcome instead of making readers reverse-engineer the point."
            } else if score >= 0.58 {
                "The story is understandable, but it still leans too hard on features over a single killer use case."
            } else {
                "The public story is still diffuse enough that strangers will ask what the product actually does."
            }
        }
        AxisId::Proof => {
            if score >= 0.78 {
                "There is enough evidence in the repo to make the product feel like more than a demo."
            } else if score >= 0.58 {
                "The technical proof is real, but the repo still needs sharper public examples or case studies."
            } else {
                "The repo does not yet provide enough proof that the product changes real decisions."
            }
        }
        AxisId::Distribution => {
            if score >= 0.78 {
                "Install and update paths are strong enough that distribution will help instead of hurt the product."
            } else if score >= 0.58 {
                "There is a credible install path, but friction is still visible in packaging or runtime requirements."
            } else {
                "Distribution friction is still high enough to block curiosity before the product can impress anyone."
            }
        }
        AxisId::Shareability => {
            if score >= 0.78 {
                "Runs produce or imply artifacts that a builder can paste into a thread, doc, or PR without extra work."
            } else if score >= 0.58 {
                "The product can be explained publicly, but the repo still lacks enough instantly shareable proof objects."
            } else {
                "There is still too little output a builder would want to show another human."
            }
        }
        AxisId::Trust => {
            if score >= 0.78 {
                "The repo shows enough tests, CI, and release discipline to make strangers less defensive."
            } else if score >= 0.58 {
                "The repo feels serious, but some release or reliability signals are still missing from the first impression."
            } else {
                "A public launch would force builders to trust the product more than the repo currently earns."
            }
        }
    }
    .into()
}

#[derive(Debug)]
#[allow(dead_code)]
pub struct RepoSignals {
    pub has_readme: f64,
    pub docs_score: f64,
    pub command_docs_score: f64,
    pub install_score: f64,
    pub local_mode_score: f64,
    pub outcome_score: f64,
    pub example_score: f64,
    pub artifact_score: f64,
    pub proof_score: f64,
    pub ci_score: f64,
    pub commit_score: f64,
    pub manifest_score: f64,
    pub lock_score: f64,
    pub changelog_score: f64,
    pub clean_score: f64,
    pub license_score: f64,
    pub env_score: f64,
    pub framework_bonus: f64,
    pub solana_bonus: f64,
    pub split_runtime_penalty: f64,
    pub external_dependency_penalty: f64,
}

pub fn derive_repo_scores(repo: &RepoContext) -> RepoSignals {
    let has_readme = if repo.readme_path.is_some() { 1.0 } else { 0.0 };
    let docs_score = clamp(repo.docs.len() as f64 / 8.0);
    let command_docs_score = clamp(
        (repo.install_commands.len() + repo.local_run_commands.len()) as f64 / 6.0,
    );
    let install_score = if !repo.install_commands.is_empty() {
        clamp(0.6 + repo.install_commands.len() as f64 / 8.0)
    } else if !repo.manifests.is_empty() {
        0.35
    } else {
        0.0
    };

    let has_local_non_curl = repo
        .local_run_commands
        .iter()
        .any(|c| !regex!(r"(?i)^curl\b").is_match(c));
    let has_fixtures_or_examples = !repo.fixtures.is_empty() || !repo.examples.is_empty();
    let local_mode_score = if has_local_non_curl
        && (has_fixtures_or_examples
            || repo.remote_dependency_notes.len() < repo.local_run_commands.len())
    {
        1.0
    } else if has_fixtures_or_examples {
        0.72
    } else {
        0.22
    };

    let doc_text = [
        repo.readme_excerpt.as_deref().unwrap_or(""),
        &repo.artifact_notes.join(" "),
        &repo.remote_dependency_notes.join(" "),
    ]
    .join(" ");

    let outcome_hits = regex!(r"(?i)\b(launch|ship|deploy|review|simulate|stress-test|decision|workflow|agent|builder|artifact|report|pr|spec)\b").find_iter(&doc_text).count();
    let artifact_text_hits = regex!(r"(?i)\b(report|artifact|decision|trace|html|markdown)\b").find_iter(&doc_text).count();

    let example_score = clamp((repo.examples.len() + repo.fixtures.len()) as f64 / 6.0);

    let artifact_base = if !repo.assets.is_empty() || !repo.artifact_notes.is_empty() {
        clamp(0.55 + (repo.assets.len() + repo.artifact_notes.len()) as f64 / 8.0)
    } else {
        0.0
    };
    let artifact_score = clamp(artifact_base.max(if artifact_text_hits > 0 { 0.58 } else { 0.0 }));

    let proof_score = clamp(repo.tests.len() as f64 / 10.0);
    let ci_score = if !repo.ci.is_empty() { 1.0 } else { 0.0 };
    let commit_score = clamp(repo.git.recent_commits.len() as f64 / 6.0);
    let manifest_score = clamp(repo.manifests.len() as f64 / 4.0);
    let lock_score = clamp(repo.locks.len() as f64 / 4.0);
    let changelog_score = if repo.docs.iter().any(|f| {
        Path::new(f)
            .file_name()
            .map(|n| n.to_string_lossy().to_uppercase().starts_with("CHANGELOG"))
            .unwrap_or(false)
    }) {
        1.0
    } else {
        0.0
    };
    let clean_score = if repo.git.branch.is_none() {
        0.7
    } else if repo.git.changed_files.is_empty() {
        1.0
    } else {
        clamp(1.0 - repo.git.changed_files.len() as f64 / 28.0)
    };
    let license_score = if !repo.licenses.is_empty() { 1.0 } else { 0.0 };
    let env_score = if !repo.env_examples.is_empty() {
        1.0
    } else {
        0.0
    };

    let mentions_cargo = repo
        .install_commands
        .iter()
        .any(|c| regex!(r"(?i)^cargo install\b").is_match(c));
    let mentions_node = repo
        .runtime_notes
        .iter()
        .any(|n| regex!(r"(?i)Node\.js|node 20|nodejs").is_match(n));
    let split_runtime_penalty = if mentions_cargo && mentions_node {
        0.24
    } else {
        0.0
    };
    let external_dependency_penalty = if repo.remote_dependency_notes.is_empty() {
        0.0
    } else if local_mode_score >= 0.7 {
        0.08
    } else {
        0.22
    };

    let has_solana = repo.frameworks.iter().any(|f| f.starts_with("solana"));
    let framework_bonus = clamp(repo.frameworks.len() as f64 / 5.0);
    let solana_bonus = if has_solana { 0.12 } else { 0.0 };

    RepoSignals {
        has_readme,
        docs_score,
        command_docs_score,
        install_score,
        local_mode_score,
        outcome_score: clamp(outcome_hits as f64 / 12.0),
        example_score,
        artifact_score,
        proof_score,
        ci_score,
        commit_score,
        manifest_score,
        lock_score,
        changelog_score,
        clean_score,
        license_score,
        env_score,
        framework_bonus,
        solana_bonus,
        split_runtime_penalty,
        external_dependency_penalty,
    }
}

pub fn build_axes(repo: &RepoContext, s: &RepoSignals) -> Vec<Axis> {
    let immediacy = clamp(
        0.32 * s.command_docs_score + 0.28 * s.local_mode_score + 0.22 * s.example_score
            + 0.18 * s.has_readme
            - s.external_dependency_penalty,
    );
    let clarity = clamp(
        0.34 * s.has_readme + 0.26 * s.command_docs_score + 0.22 * s.outcome_score
            + 0.18 * s.docs_score,
    );
    let proof = clamp(
        0.4 * s.proof_score + 0.25 * s.ci_score + 0.2 * s.example_score + 0.15 * s.commit_score,
    );
    let distribution = clamp(
        0.34 * s.install_score + 0.24 * s.manifest_score + 0.2 * s.lock_score
            + 0.22 * s.changelog_score
            + 0.08 * s.framework_bonus
            - s.split_runtime_penalty,
    );
    let shareability = clamp(
        0.34 * s.artifact_score + 0.24 * s.example_score + 0.2 * s.docs_score
            + 0.22 * s.command_docs_score,
    );
    let trust = clamp(
        0.35 * s.proof_score + 0.25 * s.ci_score + 0.15 * s.license_score
            + 0.15 * s.clean_score
            + 0.1 * s.env_score
            + 0.06 * s.framework_bonus,
    );

    let _ = repo;

    [
        (AxisId::Immediacy, immediacy),
        (AxisId::Clarity, clarity),
        (AxisId::Proof, proof),
        (AxisId::Distribution, distribution),
        (AxisId::Shareability, shareability),
        (AxisId::Trust, trust),
    ]
    .into_iter()
    .map(|(id, score)| Axis {
        label: id.label().into(),
        summary: summarize_axis(id, score),
        id,
        score,
    })
    .collect()
}

pub fn build_actions(axes: &[Axis]) -> Vec<String> {
    let action_for = |id: AxisId| -> &'static str {
        match id {
            AxisId::Immediacy => "Make one zero-config flow the public front door. If it needs a backend, ship a local mode or a public demo endpoint.",
            AxisId::Clarity => "Rewrite the README and launch copy around one user outcome, not the full command inventory.",
            AxisId::Proof => "Publish three real cases where the product changed a ship or no-ship decision.",
            AxisId::Distribution => "Pick one primary install path and demote extra runtime friction to the background.",
            AxisId::Shareability => "Emit HTML, Markdown, and JSON artifacts by default and give people a screenshot-worthy report.",
            AxisId::Trust => "Surface tests, CI, and hard runtime requirements in the first screen of the docs.",
        }
    };

    let mut sorted = axes.to_vec();
    sorted.sort_by(|a, b| a.score.total_cmp(&b.score).then(a.id.label().cmp(b.id.label())));

    let weakest: Vec<String> = sorted
        .iter()
        .filter(|a| a.score < 0.76)
        .map(|a| action_for(a.id).to_string())
        .collect();

    if !weakest.is_empty() {
        let mut seen = std::collections::HashSet::new();
        return weakest
            .into_iter()
            .filter(|s| seen.insert(s.clone()))
            .take(4)
            .collect();
    }

    vec![
        "Record a 90-second repo-to-report demo and pin it next to the install command.".into(),
        "Ship a GitHub Action or PR comment flow so the product lands inside existing builder habits.".into(),
        "Collect five external runs and turn the strongest one into a public case study.".into(),
    ]
}

pub fn build_branches(
    axes: &[Axis],
    actions: &[String],
    repo: &RepoContext,
) -> Vec<Branch> {
    let scores: std::collections::HashMap<AxisId, f64> =
        axes.iter().map(|a| (a.id, a.score)).collect();
    let readiness = average(&axes.iter().map(|a| a.score).collect::<Vec<_>>());
    let strength = average(&[scores[&AxisId::Immediacy], scores[&AxisId::Proof], scores[&AxisId::Trust]]);
    let weakest_gtm = [
        scores[&AxisId::Clarity],
        scores[&AxisId::Distribution],
        scores[&AxisId::Shareability],
    ]
    .iter()
    .copied()
    .fold(f64::INFINITY, f64::min);

    let branch_scores = [
        (BranchId::ShipNow, clamp(0.55 * readiness + 0.25 * weakest_gtm + 0.2 * strength)),
        (
            BranchId::NarrowLaunch,
            clamp(
                0.35 * strength + 0.25 * scores[&AxisId::Immediacy] + 0.2 * scores[&AxisId::Clarity]
                    + 0.2 * (1.0 - weakest_gtm),
            ),
        ),
        (
            BranchId::DelayForProof,
            clamp(
                0.4 * (1.0 - average(&[scores[&AxisId::Proof], scores[&AxisId::Trust]]))
                    + 0.2 * (1.0 - scores[&AxisId::Distribution])
                    + 0.2 * (1.0 - scores[&AxisId::Shareability])
                    + 0.2 * (1.0 - scores[&AxisId::Clarity]),
            ),
        ),
        (
            BranchId::ParkIt,
            clamp(
                0.55 * (1.0 - readiness)
                    + 0.25 * (1.0 - average(&[scores[&AxisId::Clarity], scores[&AxisId::Trust]]))
                    + 0.2 * (1.0 - scores[&AxisId::Proof]),
            ),
        ),
    ];

    let mut branches: Vec<Branch> = branch_scores
        .iter()
        .map(|&(id, score)| {
            build_single_branch(id, score, &scores, readiness, strength, weakest_gtm, actions, repo)
        })
        .collect();

    branches.sort_by(|a, b| {
        b.score
            .total_cmp(&a.score)
            .then(a.id.order().cmp(&b.id.order()))
    });
    branches
}

fn build_single_branch(
    id: BranchId,
    score: f64,
    scores: &std::collections::HashMap<AxisId, f64>,
    _readiness: f64,
    strength: f64,
    weakest_gtm: f64,
    actions: &[String],
    repo: &RepoContext,
) -> Branch {
    match id {
        BranchId::ShipNow => Branch {
            id,
            label: "Launch the current product now".into(),
            stance: "Broad launch".into(),
            score,
            summary: "Launch the full current surface now and learn in public without another major packaging pass.".into(),
            advantages: vec![
                format!("Immediacy is already at {}.", percent(scores[&AxisId::Immediacy])),
                format!("Trust and proof together average {}.", percent(average(&[scores[&AxisId::Trust], scores[&AxisId::Proof]]))),
                "You get real external signal immediately instead of optimizing in a vacuum.".into(),
            ],
            risks: vec![
                format!("The weakest go-to-market axis is still only {}.", percent(weakest_gtm)),
                "You will spend launch energy explaining the product instead of showing one impossible-to-miss use case.".into(),
            ],
            next_moves: vec![
                "Lead with the generated report artifact, not the command list.".into(),
                "Record one repo-to-report walkthrough before the announcement thread.".into(),
                "Treat the first five external runs as message refinement, not validation theater.".into(),
            ],
        },
        BranchId::NarrowLaunch => Branch {
            id,
            label: "Launch one impossible-to-miss workflow".into(),
            stance: "Flagship launch".into(),
            score,
            summary: "Make one repo-native workflow the product, and demote everything else to supporting machinery.".into(),
            advantages: vec![
                format!("Core strength is already {} across immediacy, proof, and trust.", percent(strength)),
                "You can force the public story to match the strongest technical surface.".into(),
                "The HTML, Markdown, and JSON artifact path becomes the thing people remember and share.".into(),
            ],
            risks: vec![
                "You have to cut or hide commands that do not reinforce the flagship path.".into(),
                "Breadth will look smaller at launch, even if the product is stronger.".into(),
            ],
            next_moves: vec![
                format!("Make `reality-fork run launch --repo .` the front door for {}.", repo.name),
                "Move secondary commands below the flagship workflow in docs and posts.".into(),
                actions.first().cloned().unwrap_or_else(|| "Ship one public case study built from a real run artifact.".into()),
            ],
        },
        BranchId::DelayForProof => Branch {
            id,
            label: "Delay and harden".into(),
            stance: "Proof-first".into(),
            score,
            summary: "Hold the broad public launch until the product has stronger external proof, packaging, and trust signals.".into(),
            advantages: vec![
                "You avoid burning audience attention on a message that still needs another pass.".into(),
                "You buy time to turn strong internals into undeniable public proof.".into(),
            ],
            risks: vec![
                "Momentum cools off if the hardening phase drifts without a deadline.".into(),
                "The team may hide behind polish work instead of confronting the product wedge.".into(),
            ],
            next_moves: vec![
                actions.first().cloned().unwrap_or_else(|| "Close the weakest public axis first.".into()),
                actions.get(1).cloned().unwrap_or_else(|| "Publish a real case study before reopening launch planning.".into()),
                "Set a brutal ship gate: if a builder is not impressed in three minutes, the launch is still early.".into(),
            ],
        },
        BranchId::ParkIt => Branch {
            id,
            label: "Park the product".into(),
            stance: "No launch".into(),
            score,
            summary: "Stop spending launch calories until the wedge is sharper and the product earns attention on first contact.".into(),
            advantages: vec![
                "You avoid a weak public story calcifying around the project.".into(),
                "The team can extract the strongest primitives without pretending they are already a product.".into(),
            ],
            risks: vec![
                "You lose external learning entirely for this cycle.".into(),
                "The product can become a permanent internal tool if there is no return date.".into(),
            ],
            next_moves: vec![
                "Freeze launch work and write down the one future use case worth reviving.".into(),
                "Keep only the primitives that support that wedge.".into(),
                "Reopen launch planning only when the first-run artifact is strong enough to post without apology.".into(),
            ],
        },
    }
}

pub fn verdict_reason(branch: &Branch, axes: &[Axis], actions: &[String]) -> String {
    let mut by_score_desc = axes.to_vec();
    by_score_desc.sort_by(|a, b| b.score.total_cmp(&a.score).then(a.id.label().cmp(b.id.label())));
    let strengths: Vec<String> = by_score_desc
        .iter()
        .take(2)
        .map(|a| a.id.label().to_lowercase())
        .collect();

    let mut by_score_asc = axes.to_vec();
    by_score_asc.sort_by(|a, b| a.score.total_cmp(&b.score).then(a.id.label().cmp(b.id.label())));
    let weakest: Vec<String> = by_score_asc
        .iter()
        .take(2)
        .map(|a| a.id.label().to_lowercase())
        .collect();

    let s0 = strengths.first().map(|s| s.as_str()).unwrap_or("immediacy");
    let s1 = strengths.get(1).map(|s| s.as_str()).unwrap_or("proof");
    let w0 = weakest.first().map(|s| s.as_str()).unwrap_or("clarity");
    let w1 = weakest.get(1).map(|s| s.as_str()).unwrap_or("distribution");

    match branch.id {
        BranchId::ShipNow => format!(
            "The weakest outward-facing axis is strong enough to support a broad launch, and the repo already shows real {} and {}.",
            s0, s1
        ),
        BranchId::NarrowLaunch => format!(
            "The core engine is credible, but the strongest external story is still one flagship workflow. {}",
            actions.first().map(|s| s.as_str()).unwrap_or("Lead with one impossible-to-miss path.")
        ),
        BranchId::DelayForProof => format!(
            "The current repo is still too weak on {} and {} for a broad public push. Shipping now would create more confusion than pull.",
            w0, w1
        ),
        BranchId::ParkIt => format!(
            "The wedge is not sharp enough yet. The repo is still weakest on {} and {}, so launch work would mostly be noise.",
            w0, w1
        ),
    }
}

pub fn build_signals(
    repo: &RepoContext,
    scores: &RepoSignals,
    axes: &[Axis],
) -> Vec<Signal> {
    let mut signals = Vec::new();

    if !repo.install_commands.is_empty() || !repo.local_run_commands.is_empty() {
        let mut citations: Vec<String> = Vec::new();
        if let Some(rp) = &repo.readme_path {
            citations.push(rp.clone());
        }
        citations.extend(repo.docs.iter().take(3).cloned());
        signals.push(Signal {
            id: "doc-commands".into(),
            signal_type: SignalType::Supporting,
            axis: AxisId::Immediacy,
            statement: "Docs expose concrete commands instead of forcing builders to start from source.".into(),
            detail: format!(
                "Found {} install commands and {} run commands in the docs.",
                repo.install_commands.len(),
                repo.local_run_commands.len()
            ),
            weight: 0.88,
            citations: sample(&citations, 3),
            inferred: false,
        });
    }

    if !repo.examples.is_empty() || !repo.fixtures.is_empty() {
        let mut cites: Vec<String> = repo.examples.iter().chain(repo.fixtures.iter()).cloned().collect();
        cites.truncate(4);
        signals.push(Signal {
            id: "local-material".into(),
            signal_type: SignalType::Supporting,
            axis: AxisId::Shareability,
            statement: "The repo already contains local material a builder can touch on the first run.".into(),
            detail: format!(
                "Found {} example paths and {} fixture paths.",
                repo.examples.len(),
                repo.fixtures.len()
            ),
            weight: 0.81,
            citations: cites,
            inferred: false,
        });
    }

    if !repo.tests.is_empty() {
        signals.push(Signal {
            id: "tests-present".into(),
            signal_type: SignalType::Supporting,
            axis: AxisId::Proof,
            statement: "The repo carries technical proof instead of pure positioning.".into(),
            detail: format!("Found {} test files in the scanned tree.", repo.tests.len()),
            weight: 0.86,
            citations: sample(&repo.tests, 4),
            inferred: false,
        });
    }

    if !repo.ci.is_empty() {
        signals.push(Signal {
            id: "ci-present".into(),
            signal_type: SignalType::Supporting,
            axis: AxisId::Trust,
            statement: "Release discipline is visible from the repo surface.".into(),
            detail: format!("Found {} CI configuration files.", repo.ci.len()),
            weight: 0.73,
            citations: sample(&repo.ci, 3),
            inferred: false,
        });
    }

    if repo.git.changed_files.is_empty() && repo.git.commit.is_some() {
        signals.push(Signal {
            id: "clean-tree".into(),
            signal_type: SignalType::Supporting,
            axis: AxisId::Trust,
            statement: "The working tree is clean at the time of analysis.".into(),
            detail: format!(
                "No uncommitted changes were detected on {}.",
                repo.git.branch.as_deref().unwrap_or("the current branch")
            ),
            weight: 0.62,
            citations: vec!["git:status".into()],
            inferred: false,
        });
    }

    if !repo.licenses.is_empty() {
        signals.push(Signal {
            id: "license-present".into(),
            signal_type: SignalType::Supporting,
            axis: AxisId::Trust,
            statement: "The repo includes an explicit license surface.".into(),
            detail: format!(
                "Found {} license file{}.",
                repo.licenses.len(),
                if repo.licenses.len() == 1 { "" } else { "s" }
            ),
            weight: 0.58,
            citations: sample(&repo.licenses, 2),
            inferred: false,
        });
    }

    if !repo.frameworks.is_empty() {
        let solana: Vec<&String> = repo.frameworks.iter().filter(|f| f.starts_with("solana")).collect();
        let label = if !solana.is_empty() {
            format!(
                "Solana ecosystem detected ({})",
                solana.iter().map(|s| s.as_str()).collect::<Vec<_>>().join(", ")
            )
        } else {
            format!("Recognized frameworks: {}", repo.frameworks.join(", "))
        };
        signals.push(Signal {
            id: "framework-detected".into(),
            signal_type: SignalType::Supporting,
            axis: AxisId::Distribution,
            statement: label,
            detail: format!(
                "Detected {} framework{} from project markers.",
                repo.frameworks.len(),
                if repo.frameworks.len() == 1 { "" } else { "s" }
            ),
            weight: if !solana.is_empty() { 0.85 } else { 0.78 },
            citations: vec![],
            inferred: false,
        });
    }

    if !repo.remote_dependency_notes.is_empty() {
        signals.push(Signal {
            id: "remote-dependency".into(),
            signal_type: SignalType::Risk,
            axis: AxisId::Immediacy,
            statement: "Advanced flows still depend on a separate API surface.".into(),
            detail: compact_text(repo.remote_dependency_notes.first().unwrap_or(&String::new()), 180),
            weight: 0.93,
            citations: sample(
                &repo
                    .remote_dependency_notes
                    .iter()
                    .filter_map(|n| n.split(": ").next().map(String::from))
                    .collect::<Vec<_>>(),
                3,
            ),
            inferred: false,
        });
    }

    if scores.split_runtime_penalty > 0.0 {
        signals.push(Signal {
            id: "split-runtime".into(),
            signal_type: SignalType::Risk,
            axis: AxisId::Distribution,
            statement: "The public install path still exposes multi-runtime friction.".into(),
            detail: "The docs mention Cargo install and a Node runtime requirement together.".into(),
            weight: 0.89,
            citations: sample(
                &repo
                    .runtime_notes
                    .iter()
                    .filter_map(|n| n.split(": ").next().map(String::from))
                    .collect::<Vec<_>>(),
                3,
            ),
            inferred: false,
        });
    }

    if !repo.git.changed_files.is_empty() {
        signals.push(Signal {
            id: "dirty-tree".into(),
            signal_type: SignalType::Risk,
            axis: AxisId::Trust,
            statement: "The repo is not launch-clean right now.".into(),
            detail: format!(
                "{} changed file{} were detected in git status.",
                repo.git.changed_files.len(),
                if repo.git.changed_files.len() == 1 { "" } else { "s" }
            ),
            weight: 0.77,
            citations: vec!["git:status".into()],
            inferred: false,
        });
    }

    let shareability_score = axes
        .iter()
        .find(|a| a.id == AxisId::Shareability)
        .map(|a| a.score)
        .unwrap_or(0.0);
    if shareability_score < 0.66 {
        let mut cites = Vec::new();
        if let Some(rp) = &repo.readme_path {
            cites.push(rp.clone());
        }
        cites.extend(repo.assets.iter().take(3).cloned());
        signals.push(Signal {
            id: "artifact-gap".into(),
            signal_type: SignalType::Risk,
            axis: AxisId::Shareability,
            statement: "The repo still lacks enough instantly shareable proof objects.".into(),
            detail: "There are not yet enough visible report, screenshot, or public artifact cues in the repo surface.".into(),
            weight: 0.84,
            citations: sample(&cites, 3),
            inferred: true,
        });
    }

    let clarity_score = axes
        .iter()
        .find(|a| a.id == AxisId::Clarity)
        .map(|a| a.score)
        .unwrap_or(0.0);
    if clarity_score < 0.68 {
        let mut cites = Vec::new();
        if let Some(rp) = &repo.readme_path {
            cites.push(rp.clone());
        }
        cites.extend(repo.docs.iter().take(3).cloned());
        signals.push(Signal {
            id: "story-gap".into(),
            signal_type: SignalType::Risk,
            axis: AxisId::Clarity,
            statement: "The public story still reads weaker than the underlying engineering.".into(),
            detail: "The docs expose commands and features, but the breakout user outcome is still not obvious enough.".into(),
            weight: 0.82,
            citations: sample(&cites, 3),
            inferred: true,
        });
    }

    let proof_score_val = axes
        .iter()
        .find(|a| a.id == AxisId::Proof)
        .map(|a| a.score)
        .unwrap_or(0.0);
    if proof_score_val < 0.62 {
        signals.push(Signal {
            id: "proof-gap".into(),
            signal_type: SignalType::Risk,
            axis: AxisId::Proof,
            statement: "The repo still needs more public proof that the product changes decisions.".into(),
            detail: "Tests alone do not create external demand; case studies and concrete caught-failures are still missing.".into(),
            weight: 0.78,
            citations: sample(&repo.tests, 3),
            inferred: true,
        });
    }

    signals.sort_by(|a, b| {
        b.weight
            .total_cmp(&a.weight)
            .then(a.id.cmp(&b.id))
    });
    signals
}

pub fn build_posts(
    repo: &RepoContext,
    branch: &Branch,
    verdict: &Verdict,
    axes: &[Axis],
) -> Posts {
    let mut by_score_desc = axes.to_vec();
    by_score_desc.sort_by(|a, b| b.score.total_cmp(&a.score).then(a.id.label().cmp(b.id.label())));
    let top_axes: Vec<String> = by_score_desc
        .iter()
        .take(2)
        .map(|a| format!("{} {}", a.id.label(), percent(a.score)))
        .collect();

    let mut by_score_asc = axes.to_vec();
    by_score_asc.sort_by(|a, b| a.score.total_cmp(&b.score).then(a.id.label().cmp(b.id.label())));
    let weak_axes: Vec<String> = by_score_asc
        .iter()
        .take(2)
        .map(|a| format!("{} {}", a.id.label(), percent(a.score)))
        .collect();

    let announcement = trim_post(&format!(
        "Reality Fork launch verdict for {}: {}. {} Top signals: {}.",
        repo.name,
        branch.label,
        verdict.reason,
        top_axes.join(" | ")
    ));

    let thread = vec![
        trim_post(&format!(
            "Reality Fork scored {} at {} launch readiness. Verdict: {}.",
            repo.name,
            percent(verdict.readiness),
            branch.label
        )),
        trim_post(&format!(
            "Strongest signals: {}. Weakest: {}.",
            top_axes.join(" | "),
            weak_axes.join(" | ")
        )),
        trim_post(&format!("Next move: {}", branch.next_moves.first().map(|s| s.as_str()).unwrap_or("Ship the strongest artifact path first."))),
    ];

    Posts {
        announcement,
        thread,
    }
}

pub fn create_launch_run_with(
    repo: RepoContext,
    prompt: Option<String>,
    title: Option<String>,
) -> LaunchRun {
    let scores = derive_repo_scores(&repo);
    let axes = build_axes(&repo, &scores);
    let actions = build_actions(&axes);
    let branches = build_branches(&axes, &actions, &repo);
    let winner = &branches[0]; // always 4 branches from build_branches
    let readiness = average(&axes.iter().map(|a| a.score).collect::<Vec<_>>());
    let reason = verdict_reason(winner, &axes, &actions);

    let verdict = Verdict {
        winner_branch_id: winner.id,
        label: winner.label.clone(),
        reason,
        score: winner.score,
        readiness,
    };

    let posts = build_posts(&repo, winner, &verdict, &axes);
    let signals = build_signals(&repo, &scores, &axes);

    let prompt_text = prompt
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "Should we ship this now?".into());
    let title_text = title
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| format!("{} launch reality fork", repo.name));

    LaunchRun {
        kind: "launch".into(),
        version: 1,
        generated_at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        title: title_text,
        prompt: prompt_text,
        repo,
        axes,
        signals,
        branches,
        verdict,
        actions,
        posts,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn empty_repo() -> RepoContext {
        RepoContext {
            name: "test-repo".into(),
            display_path: "/tmp/test".into(),
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
        }
    }

    #[test]
    fn percent_formatting() {
        assert_eq!(percent(0.0), "0%");
        assert_eq!(percent(0.5), "50%");
        assert_eq!(percent(1.0), "100%");
        assert_eq!(percent(0.786), "79%");
    }

    #[test]
    fn percent_edge_cases() {
        assert_eq!(percent(0.004), "0%");
        assert_eq!(percent(0.005), "1%");
        assert_eq!(percent(0.999), "100%");
    }

    #[test]
    fn scores_empty_repo() {
        let repo = empty_repo();
        let scores = derive_repo_scores(&repo);
        assert_eq!(scores.has_readme, 0.0);
        assert_eq!(scores.docs_score, 0.0);
    }

    #[test]
    fn scores_with_readme() {
        let mut repo = empty_repo();
        repo.readme_path = Some("README.md".into());
        repo.readme_excerpt = Some("# My Project\nSome description".into());
        let scores = derive_repo_scores(&repo);
        assert!(scores.has_readme > 0.0);
    }

    #[test]
    fn axes_always_six() {
        let repo = empty_repo();
        let scores = derive_repo_scores(&repo);
        let axes = build_axes(&repo, &scores);
        assert_eq!(axes.len(), 6);
    }

    #[test]
    fn axes_scores_bounded() {
        let repo = empty_repo();
        let scores = derive_repo_scores(&repo);
        let axes = build_axes(&repo, &scores);
        for axis in &axes {
            assert!(axis.score >= 0.0, "{} score {} < 0", axis.label, axis.score);
            assert!(axis.score <= 1.0, "{} score {} > 1", axis.label, axis.score);
        }
    }

    #[test]
    fn axes_all_ids_present() {
        let repo = empty_repo();
        let scores = derive_repo_scores(&repo);
        let axes = build_axes(&repo, &scores);
        let ids: Vec<AxisId> = axes.iter().map(|a| a.id).collect();
        assert!(ids.contains(&AxisId::Immediacy));
        assert!(ids.contains(&AxisId::Clarity));
        assert!(ids.contains(&AxisId::Proof));
        assert!(ids.contains(&AxisId::Distribution));
        assert!(ids.contains(&AxisId::Shareability));
        assert!(ids.contains(&AxisId::Trust));
    }

    #[test]
    fn branches_always_four() {
        let repo = empty_repo();
        let scores = derive_repo_scores(&repo);
        let axes = build_axes(&repo, &scores);
        let actions = build_actions(&axes);
        let branches = build_branches(&axes, &actions, &repo);
        assert_eq!(branches.len(), 4);
    }

    #[test]
    fn branches_sorted_by_score_descending() {
        let repo = empty_repo();
        let scores = derive_repo_scores(&repo);
        let axes = build_axes(&repo, &scores);
        let actions = build_actions(&axes);
        let branches = build_branches(&axes, &actions, &repo);
        for w in branches.windows(2) {
            assert!(w[0].score >= w[1].score, "branches not sorted");
        }
    }

    #[test]
    fn full_run_produces_valid_output() {
        let repo = empty_repo();
        let run = create_launch_run_with(repo, None, None);
        assert_eq!(run.kind, "launch");
        assert_eq!(run.version, 1);
        assert!(!run.title.is_empty());
        assert!(!run.prompt.is_empty());
        assert_eq!(run.axes.len(), 6);
        assert_eq!(run.branches.len(), 4);
        assert!(run.verdict.readiness >= 0.0 && run.verdict.readiness <= 1.0);
    }

    #[test]
    fn full_run_with_rich_repo() {
        let mut repo = empty_repo();
        repo.readme_path = Some("README.md".into());
        repo.readme_excerpt = Some("# Foo\nInstall with `npm install`\nRun `npm start`".into());
        repo.file_count = 50;
        repo.docs = vec!["docs/guide.md".into()];
        repo.tests = vec!["tests/main.test.ts".into()];
        repo.manifests = vec!["package.json".into()];
        repo.locks = vec!["package-lock.json".into()];
        repo.ci = vec![".github/workflows/ci.yml".into()];
        repo.install_commands = vec!["npm install".into()];
        repo.local_run_commands = vec!["npm start".into()];
        repo.frameworks = vec!["nextjs".into()];
        repo.languages = vec![Language { name: "TypeScript".into(), file_count: 40 }];

        let run = create_launch_run_with(repo, Some("Should we launch?".into()), Some("Test Run".into()));
        assert_eq!(run.prompt, "Should we launch?");
        assert_eq!(run.title, "Test Run");
        assert!(run.verdict.readiness > 0.0);
    }

    #[test]
    fn signals_empty_repo() {
        let repo = empty_repo();
        let scores = derive_repo_scores(&repo);
        let axes = build_axes(&repo, &scores);
        let signals = build_signals(&repo, &scores, &axes);
        assert!(!signals.is_empty());
        for s in &signals {
            assert!(s.weight > 0.0 && s.weight <= 1.0);
        }
    }

    #[test]
    fn actions_not_empty() {
        let repo = empty_repo();
        let scores = derive_repo_scores(&repo);
        let axes = build_axes(&repo, &scores);
        let actions = build_actions(&axes);
        assert!(!actions.is_empty());
    }
}
