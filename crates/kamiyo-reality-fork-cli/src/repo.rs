use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::process::Command;

use regex::Regex;
use walkdir::WalkDir;

use crate::types::{GitContext, Language, RepoContext};

const MAX_DOC_BYTES: u64 = 24_000;
const MAX_DOC_FILES: usize = 10;

static WALK_SKIP_DIRS: &[&str] = &[
    ".git",
    ".next",
    ".turbo",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "out",
    "target",
];

fn git_exec(root: &Path, args: &[&str]) -> Option<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .stdin(std::process::Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn keep_repo_path(relative: &str) -> bool {
    !relative
        .split('/')
        .filter(|s| !s.is_empty())
        .any(|seg| WALK_SKIP_DIRS.contains(&seg))
}

fn walk_files(root: &Path) -> Vec<String> {
    let mut files = Vec::new();
    for entry in WalkDir::new(root).into_iter().filter_entry(|e| {
        let name = e.file_name().to_string_lossy();
        !WALK_SKIP_DIRS.contains(&name.as_ref())
    }) {
        let Ok(entry) = entry else { continue };
        if !entry.file_type().is_file() {
            continue;
        }
        let Some(rel) = pathdiff(root, entry.path()) else {
            continue;
        };
        if keep_repo_path(&rel) {
            files.push(rel);
        }
    }
    files.sort();
    files
}

fn pathdiff(base: &Path, path: &Path) -> Option<String> {
    path.strip_prefix(base)
        .ok()
        .map(|p| p.to_string_lossy().replace('\\', "/"))
}

fn list_repo_files(root: &Path) -> Vec<String> {
    let real_root = std::fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    let git_root = git_exec(root, &["rev-parse", "--show-toplevel"]);

    let Some(git_root_str) = &git_root else {
        return walk_files(&real_root);
    };

    let real_git_root =
        std::fs::canonicalize(git_root_str).unwrap_or_else(|_| PathBuf::from(git_root_str));

    let tracked = git_exec(root, &["ls-files"]).unwrap_or_default();
    let others = git_exec(
        root,
        &["ls-files", "--others", "--exclude-standard"],
    )
    .unwrap_or_default();

    let git_prefix = pathdiff(&real_git_root, &real_root).unwrap_or_default();

    let mut seen = HashSet::new();
    let mut files: Vec<String> = tracked
        .lines()
        .chain(others.lines())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .filter(|item| {
            if git_prefix.is_empty() {
                return true;
            }
            item == &git_prefix || item.starts_with(&format!("{git_prefix}/"))
        })
        .map(|item| {
            if git_prefix.is_empty() {
                item
            } else {
                item[git_prefix.len() + 1..].to_string()
            }
        })
        .filter(|s| !s.is_empty() && keep_repo_path(s))
        .filter(|s| seen.insert(s.clone()))
        .collect();

    files.sort();
    files
}

fn is_doc_path(p: &str) -> bool {
    regex!(r"(?i)(^|/)(README|CHANGELOG)(\.[^.]+)?\.md$").is_match(p)
        || regex!(r"(?i)^docs/.+\.md$").is_match(p)
}

fn is_test_path(p: &str) -> bool {
    regex!(r"(^|/)__tests__/").is_match(p)
        || regex!(r"(?i)\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs|rs|py|go|java|kt)$").is_match(p)
}

fn is_example_path(p: &str) -> bool {
    regex!(r"(?i)(^|/)(examples?|samples?|demos?)/").is_match(p)
}

fn is_fixture_path(p: &str) -> bool {
    regex!(r"(?i)(^|/)fixtures/").is_match(p)
}

fn is_manifest_path(p: &str) -> bool {
    regex!(r"(?i)(^|/)(package\.json|Cargo\.toml|pyproject\.toml|go\.mod)$").is_match(p)
}

fn is_lock_path(p: &str) -> bool {
    regex!(
        r"(?i)(^|/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|Cargo\.lock|poetry\.lock|uv\.lock|go\.sum)$"
    )
    .is_match(p)
}

fn is_ci_path(p: &str) -> bool {
    regex!(r"(?i)^\.github/workflows/.+\.(yml|yaml)$").is_match(p)
        || regex!(r"(?i)^\.gitlab-ci\.yml$").is_match(p)
        || regex!(r"(?i)^\.circleci/").is_match(p)
}

fn is_env_example_path(p: &str) -> bool {
    regex!(r"(?i)(^|/)\.env(\.[^.]+)?\.example$").is_match(p)
        || regex!(r"(?i)\.env\.example$").is_match(p)
}

fn is_license_path(p: &str) -> bool {
    regex!(r"(?i)(^|/)LICENSE(\.[^.]+)?$").is_match(p)
}

fn is_asset_path(p: &str) -> bool {
    regex!(
        r"(?i)(^|/)(assets?|screenshots?|static|public|reports?)/\S+\.(png|jpe?g|gif|svg|webp|html)$"
    )
    .is_match(p)
        || regex!(r"(?i)(report|decision|trace)\.(html|md|json)$").is_match(p)
}

fn is_root_support_path(p: &str) -> bool {
    is_ci_path(p)
        || (!p.contains('/')
            && (is_doc_path(p)
                || is_manifest_path(p)
                || is_lock_path(p)
                || is_env_example_path(p)
                || is_license_path(p)))
}

pub fn detect_frameworks(files: &[String]) -> Vec<String> {
    let mut found = Vec::new();
    let has = |re: &Regex| files.iter().any(|f| re.is_match(f));

    if has(regex!(r"(?i)(^|/)Anchor\.toml$")) {
        found.push("solana-anchor".into());
    } else if has(regex!(r"(^|/)programs/.*/src/lib\.rs$")) {
        found.push("solana-native".into());
    }
    if has(regex!(r"(?i)(^|/)foundry\.toml$")) {
        found.push("foundry".into());
    }
    if has(regex!(r"(?i)(^|/)hardhat\.config\.(ts|js|cjs|mjs)$")) {
        found.push("hardhat".into());
    }
    if has(regex!(r"(?i)(^|/)next\.config\.(ts|js|cjs|mjs)$")) {
        found.push("nextjs".into());
    }
    if has(regex!(r"(?i)(^|/)Dockerfile$")) {
        found.push("docker".into());
    }
    if has(regex!(r"(?i)(^|/)turbo\.json$")) {
        found.push("turborepo".into());
    }
    if has(regex!(r"(?i)(^|/)nx\.json$")) {
        found.push("nx".into());
    }
    if has(regex!(r"(?i)(^|/)\.github/workflows/.+\.ya?ml$")) {
        found.push("github-actions".into());
    }

    found
}

fn rank_doc_path(p: &str) -> u8 {
    if regex!(r"(?i)^README(\.[^.]+)?\.md$").is_match(p) {
        0
    } else if regex!(r"(?i)^CHANGELOG(\.[^.]+)?\.md$").is_match(p) {
        1
    } else if regex!(r"(?i)/README(\.[^.]+)?\.md$").is_match(p) {
        2
    } else if regex!(r"(?i)^docs/").is_match(p) {
        3
    } else {
        4
    }
}

fn read_text_if_small(root: &Path, relative: &str) -> Option<String> {
    let abs = root.join(relative);
    let meta = std::fs::metadata(&abs).ok()?;
    if !meta.is_file() || meta.len() > MAX_DOC_BYTES {
        return None;
    }
    std::fs::read_to_string(&abs).ok()
}

struct DocSource {
    path: String,
    text: String,
}

fn compact_text(value: &str, max: usize) -> String {
    let normalized: String = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.len() <= max {
        normalized
    } else {
        format!("{}...", &normalized[..max.saturating_sub(3)])
    }
}

fn first_paragraph(text: &str) -> Option<String> {
    text.split("\n\n")
        .map(|block| compact_text(block.trim(), 240))
        .find(|block| !block.is_empty() && !block.starts_with('#') && !block.starts_with("```"))
}

fn extract_code_blocks(text: &str) -> Vec<String> {
    let re = regex!(r"```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```");
    re.captures_iter(text)
        .filter_map(|cap| cap.get(1).map(|m| m.as_str().to_string()))
        .collect()
}

struct CommandSignals {
    install_commands: Vec<String>,
    local_run_commands: Vec<String>,
    remote_dependency_notes: Vec<String>,
    runtime_notes: Vec<String>,
    artifact_notes: Vec<String>,
}

fn extract_commands(docs: &[DocSource]) -> CommandSignals {
    let mut install = Vec::new();
    let mut local_run = Vec::new();
    let mut remote_dep = Vec::new();
    let mut runtime = Vec::new();
    let mut artifact = Vec::new();

    let install_re = regex!(r"(?i)^(cargo install|brew install|go install|pip install|uv tool install|npm install -g|pnpm add -g|pnpm dlx|npx)\b");
    let run_re = regex!(r"(?i)(^| )(reality-fork|kamiyo-reality-fork-cli)\b");
    let cargo_run_re = regex!(r"(?i)^(cargo run|npm run|pnpm run)\b");

    for doc in docs {
        for block in extract_code_blocks(&doc.text) {
            for raw_line in block.lines() {
                let line = raw_line.trim();
                if line.is_empty() || line.starts_with('#') {
                    continue;
                }
                if install_re.is_match(line) {
                    install.push(line.to_string());
                }
                if run_re.is_match(line) || cargo_run_re.is_match(line) {
                    local_run.push(line.to_string());
                }
            }
        }

        for raw_line in doc.text.lines() {
            let line = compact_text(raw_line.trim(), 220);
            if line.is_empty() {
                continue;
            }
            if regex!(r"(?i)/api/|remote api|expects a reality fork api|base-url")
                .is_match(&line)
            {
                remote_dep.push(format!("{}: {}", doc.path, line));
            }
            if regex!(r"(?i)(Node\.js|node 20|nodejs|cargo install|brew install)")
                .is_match(&line)
            {
                runtime.push(format!("{}: {}", doc.path, line));
            }
            if regex!(
                r"(?i)(report\.html|decision\.md|trace\.json|artifact|html report|markdown)"
            )
            .is_match(&line)
            {
                artifact.push(format!("{}: {}", doc.path, line));
            }
        }
    }

    dedup(&mut install);
    dedup(&mut local_run);
    dedup(&mut remote_dep);
    dedup(&mut runtime);
    dedup(&mut artifact);

    CommandSignals {
        install_commands: install,
        local_run_commands: local_run,
        remote_dependency_notes: remote_dep,
        runtime_notes: runtime,
        artifact_notes: artifact,
    }
}

fn dedup(v: &mut Vec<String>) {
    let mut seen = HashSet::new();
    v.retain(|s| seen.insert(s.clone()));
}

fn detect_languages(files: &[String]) -> Vec<Language> {
    let ext_map: HashMap<&str, &str> = [
        (".cjs", "JavaScript"),
        (".go", "Go"),
        (".html", "HTML"),
        (".js", "JavaScript"),
        (".json", "JSON"),
        (".md", "Markdown"),
        (".mjs", "JavaScript"),
        (".py", "Python"),
        (".rs", "Rust"),
        (".sh", "Shell"),
        (".toml", "TOML"),
        (".ts", "TypeScript"),
        (".tsx", "TypeScript"),
        (".yaml", "YAML"),
        (".yml", "YAML"),
    ]
    .into_iter()
    .collect();

    let mut counts: HashMap<&str, usize> = HashMap::new();
    for file in files {
        if let Some(ext) = Path::new(file).extension().and_then(|e| e.to_str()) {
            let dotted = format!(".{}", ext.to_lowercase());
            if let Some(&lang) = ext_map.get(dotted.as_str()) {
                *counts.entry(lang).or_default() += 1;
            }
        }
    }

    let mut langs: Vec<Language> = counts
        .into_iter()
        .map(|(name, file_count)| Language {
            name: name.to_string(),
            file_count,
        })
        .collect();
    langs.sort_by(|a, b| b.file_count.cmp(&a.file_count).then(a.name.cmp(&b.name)));
    langs.truncate(6);
    langs
}

fn derive_web_url(remote_url: &str) -> Option<String> {
    let clean = remote_url.trim().trim_end_matches(".git");
    if clean.starts_with("https://") || clean.starts_with("http://") {
        return Some(clean.trim_end_matches(".git").to_string());
    }
    let caps = regex!(r"^(?:ssh://)?git@([^:/]+)[:/]([^/]+/[^/]+)$").captures(clean)?;
    let host = caps.get(1)?.as_str();
    let repo = caps.get(2)?.as_str();
    if host == "github.com" || host.starts_with("github") {
        Some(format!("https://github.com/{repo}"))
    } else {
        Some(format!("https://{host}/{repo}"))
    }
}

fn repo_name_from_signals(
    root: &Path,
    remote_url: &Option<String>,
    docs: &[DocSource],
) -> String {
    if let Some(url) = remote_url {
        if let Some(web) = derive_web_url(url) {
            if let Some(tail) = web.split('/').filter(|s| !s.is_empty()).last() {
                return tail.to_string();
            }
        }
    }
    for doc in docs {
        if let Some(cap) = regex!(r"(?m)^#\s+(.+)$").captures(&doc.text) {
            return cap[1].trim().replace('`', "");
        }
    }
    root.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".into())
}

fn sanitize_path(value: &str) -> String {
    if let Some(home) = dirs::home_dir() {
        let home_str = home.to_string_lossy();
        if value.starts_with(home_str.as_ref()) {
            return value.replacen(home_str.as_ref(), "$HOME", 1);
        }
    }
    value.to_string()
}

fn non_generic_command_names(commands: &[String]) -> Vec<String> {
    let generics: HashSet<&str> =
        ["npm", "pnpm", "yarn", "cargo", "python", "uv", "go", "make"]
            .into_iter()
            .collect();
    let mut seen = HashSet::new();
    commands
        .iter()
        .filter_map(|cmd| cmd.trim().split_whitespace().next())
        .map(|s| s.to_lowercase())
        .filter(|s| !s.is_empty() && !generics.contains(s.as_str()))
        .filter(|s| seen.insert(s.clone()))
        .collect()
}

fn find_focus_paths(docs: &[DocSource]) -> Vec<String> {
    let anchors: Vec<(&DocSource, CommandSignals)> = docs
        .iter()
        .filter(|d| d.path.contains('/'))
        .map(|d| (d, extract_commands(std::slice::from_ref(d))))
        .filter(|(_, cmds)| {
            let branded = non_generic_command_names(&cmds.local_run_commands);
            !cmds.install_commands.is_empty() && !branded.is_empty()
        })
        .collect();

    if anchors.is_empty() {
        return Vec::new();
    }

    let mut needles = HashSet::new();
    for (doc, cmds) in &anchors {
        let base = Path::new(&doc.path)
            .parent()
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        let parts: Vec<&str> = base.split('-').filter(|p| p.len() >= 3).collect();
        needles.insert(base.clone());
        for i in 0..parts.len().saturating_sub(1) {
            needles.insert(format!("{}-{}", parts[i], parts[i + 1]));
        }
        for name in non_generic_command_names(&cmds.local_run_commands) {
            needles.insert(name);
        }
    }

    let mut seen = HashSet::new();
    let mut result: Vec<String> = docs
        .iter()
        .filter(|d| {
            let lower = d.path.to_lowercase();
            needles.iter().any(|n| lower.contains(n.as_str()))
        })
        .filter_map(|d| {
            Path::new(&d.path)
                .parent()
                .map(|p| p.to_string_lossy().replace('\\', "/"))
        })
        .filter(|s| seen.insert(s.clone()))
        .collect();
    result.sort();
    result
}

pub fn collect_repo_context(root: &Path, requested_focus: &[String]) -> RepoContext {
    let root = std::fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    let all_files = list_repo_files(&root);

    let mut discovery_docs: Vec<&String> = all_files.iter().filter(|f| is_doc_path(f)).collect();
    discovery_docs.sort_by(|a, b| rank_doc_path(a).cmp(&rank_doc_path(b)).then(a.cmp(b)));
    discovery_docs.truncate(MAX_DOC_FILES.max(80));

    let discovery_sources: Vec<DocSource> = discovery_docs
        .iter()
        .filter_map(|&p| {
            read_text_if_small(&root, p).map(|text| DocSource {
                path: p.clone(),
                text,
            })
        })
        .collect();

    let focus_paths = if !requested_focus.is_empty() {
        let mut seen = HashSet::new();
        requested_focus
            .iter()
            .map(|item| {
                let abs = root.join(item);
                let rel = abs
                    .strip_prefix(&root)
                    .map(|p| p.to_string_lossy().replace('\\', "/"))
                    .unwrap_or_else(|_| item.replace('\\', "/"));
                rel.trim_start_matches("./").to_string()
            })
            .filter(|s| !s.is_empty() && seen.insert(s.clone()))
            .collect()
    } else {
        find_focus_paths(&discovery_sources)
    };

    let files: Vec<String> = if focus_paths.is_empty() {
        all_files.clone()
    } else {
        all_files
            .iter()
            .filter(|f| {
                is_root_support_path(f)
                    || focus_paths
                        .iter()
                        .any(|prefix| *f == prefix || f.starts_with(&format!("{prefix}/")))
            })
            .cloned()
            .collect()
    };

    let docs: Vec<String> = files.iter().filter(|f| is_doc_path(f)).cloned().collect();
    let tests: Vec<String> = files.iter().filter(|f| is_test_path(f)).cloned().collect();
    let examples: Vec<String> = files.iter().filter(|f| is_example_path(f)).cloned().collect();
    let fixtures: Vec<String> = files.iter().filter(|f| is_fixture_path(f)).cloned().collect();
    let manifests: Vec<String> = files.iter().filter(|f| is_manifest_path(f)).cloned().collect();
    let locks: Vec<String> = files.iter().filter(|f| is_lock_path(f)).cloned().collect();
    let ci: Vec<String> = files.iter().filter(|f| is_ci_path(f)).cloned().collect();
    let env_examples: Vec<String> = files
        .iter()
        .filter(|f| is_env_example_path(f))
        .cloned()
        .collect();
    let licenses: Vec<String> = files.iter().filter(|f| is_license_path(f)).cloned().collect();
    let assets: Vec<String> = files.iter().filter(|f| is_asset_path(f)).cloned().collect();

    let mut docs_to_read: Vec<&String> = docs.iter().collect();
    docs_to_read.sort_by(|a, b| rank_doc_path(a).cmp(&rank_doc_path(b)).then(a.cmp(b)));
    docs_to_read.truncate(MAX_DOC_FILES);

    let doc_sources: Vec<DocSource> = docs_to_read
        .iter()
        .filter_map(|&p| {
            read_text_if_small(&root, p).map(|text| DocSource {
                path: p.clone(),
                text,
            })
        })
        .collect();

    let cmd_signals = extract_commands(&doc_sources);

    let branch = git_exec(&root, &["rev-parse", "--abbrev-ref", "HEAD"]);
    let commit = git_exec(&root, &["rev-parse", "--short", "HEAD"]);
    let raw_remote = git_exec(&root, &["remote", "get-url", "origin"]);
    let web_url = raw_remote.as_deref().and_then(derive_web_url);
    let recent_commits = git_exec(&root, &["log", "--pretty=%s", "-n", "6"])
        .unwrap_or_default()
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    let changed_files = git_exec(
        &root,
        &["status", "--short", "--untracked-files=normal"],
    )
    .unwrap_or_default()
    .lines()
    .map(|l| l.trim().to_string())
    .filter(|s| !s.is_empty())
    .collect();

    let readme_path = docs
        .iter()
        .find(|f| regex!(r"(?i)^README(\.[^.]+)?\.md$").is_match(f))
        .cloned();
    let readme_text = readme_path.as_ref().and_then(|rp| {
        doc_sources
            .iter()
            .find(|s| s.path == *rp)
            .map(|s| s.text.clone())
    });

    let name = repo_name_from_signals(&root, &raw_remote, &doc_sources);
    let frameworks = detect_frameworks(&all_files);
    let root_str = root.to_string_lossy().to_string();

    RepoContext {
        name,
        display_path: sanitize_path(&root_str),
        file_count: files.len(),
        focus_paths,
        readme_excerpt: readme_text.as_deref().and_then(first_paragraph),
        readme_path,
        docs,
        tests,
        examples,
        fixtures,
        manifests,
        locks,
        ci,
        env_examples,
        licenses,
        assets,
        frameworks,
        install_commands: cmd_signals.install_commands,
        local_run_commands: cmd_signals.local_run_commands,
        remote_dependency_notes: cmd_signals.remote_dependency_notes,
        runtime_notes: cmd_signals.runtime_notes,
        artifact_notes: cmd_signals.artifact_notes,
        languages: detect_languages(&files),
        git: GitContext {
            branch,
            commit,
            remote_url: raw_remote,
            web_url,
            changed_files,
            recent_commits,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_no_frameworks() {
        let files: Vec<String> = vec!["src/main.rs".into(), "Cargo.toml".into()];
        assert!(detect_frameworks(&files).is_empty());
    }

    #[test]
    fn detect_anchor() {
        let files = vec!["Anchor.toml".into(), "programs/foo/src/lib.rs".into()];
        let fw = detect_frameworks(&files);
        assert!(fw.contains(&"solana-anchor".to_string()));
        assert!(!fw.contains(&"solana-native".to_string()));
    }

    #[test]
    fn detect_solana_native_without_anchor() {
        let files = vec!["programs/foo/src/lib.rs".into()];
        let fw = detect_frameworks(&files);
        assert!(fw.contains(&"solana-native".to_string()));
    }

    #[test]
    fn detect_foundry() {
        let files = vec!["foundry.toml".into()];
        assert!(detect_frameworks(&files).contains(&"foundry".to_string()));
    }

    #[test]
    fn detect_hardhat() {
        let files = vec!["hardhat.config.ts".into()];
        assert!(detect_frameworks(&files).contains(&"hardhat".to_string()));
    }

    #[test]
    fn detect_nextjs() {
        let files = vec!["next.config.js".into()];
        assert!(detect_frameworks(&files).contains(&"nextjs".to_string()));
    }

    #[test]
    fn detect_docker() {
        let files = vec!["Dockerfile".into()];
        assert!(detect_frameworks(&files).contains(&"docker".to_string()));
    }

    #[test]
    fn detect_turborepo() {
        let files = vec!["turbo.json".into()];
        assert!(detect_frameworks(&files).contains(&"turborepo".to_string()));
    }

    #[test]
    fn detect_nx() {
        let files = vec!["nx.json".into()];
        assert!(detect_frameworks(&files).contains(&"nx".to_string()));
    }

    #[test]
    fn detect_github_actions() {
        let files = vec![".github/workflows/ci.yml".into()];
        assert!(detect_frameworks(&files).contains(&"github-actions".to_string()));
    }

    #[test]
    fn detect_multiple_frameworks() {
        let files = vec![
            "Anchor.toml".into(),
            "next.config.mjs".into(),
            "Dockerfile".into(),
            "turbo.json".into(),
            ".github/workflows/deploy.yaml".into(),
        ];
        let fw = detect_frameworks(&files);
        assert_eq!(fw.len(), 5);
        assert!(fw.contains(&"solana-anchor".to_string()));
        assert!(fw.contains(&"nextjs".to_string()));
        assert!(fw.contains(&"docker".to_string()));
        assert!(fw.contains(&"turborepo".to_string()));
        assert!(fw.contains(&"github-actions".to_string()));
    }

    #[test]
    fn detect_nested_paths() {
        let files = vec![
            "apps/web/next.config.ts".into(),
            "deploy/Dockerfile".into(),
        ];
        let fw = detect_frameworks(&files);
        assert!(fw.contains(&"nextjs".to_string()));
        assert!(fw.contains(&"docker".to_string()));
    }

    #[test]
    fn collect_context_crate_root() {
        let crate_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let ctx = collect_repo_context(crate_root, &[]);
        assert!(!ctx.name.is_empty());
    }
}

