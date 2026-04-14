use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AxisId {
    Immediacy,
    Clarity,
    Proof,
    Distribution,
    Shareability,
    Trust,
}

impl AxisId {
    pub fn label(self) -> &'static str {
        match self {
            Self::Immediacy => "Immediacy",
            Self::Clarity => "Clarity",
            Self::Proof => "Proof",
            Self::Distribution => "Distribution",
            Self::Shareability => "Shareability",
            Self::Trust => "Trust",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Axis {
    pub id: AxisId,
    pub label: String,
    pub score: f64,
    pub summary: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SignalType {
    Supporting,
    Risk,
    Neutral,
}

impl SignalType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Supporting => "supporting",
            Self::Risk => "risk",
            Self::Neutral => "neutral",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Signal {
    pub id: String,
    #[serde(rename = "type")]
    pub signal_type: SignalType,
    pub axis: AxisId,
    pub statement: String,
    pub detail: String,
    pub weight: f64,
    pub citations: Vec<String>,
    pub inferred: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BranchId {
    ShipNow,
    NarrowLaunch,
    DelayForProof,
    ParkIt,
}

impl BranchId {
    pub fn order(self) -> u8 {
        match self {
            Self::NarrowLaunch => 0,
            Self::ShipNow => 1,
            Self::DelayForProof => 2,
            Self::ParkIt => 3,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub id: BranchId,
    pub label: String,
    pub stance: String,
    pub score: f64,
    pub summary: String,
    pub advantages: Vec<String>,
    pub risks: Vec<String>,
    pub next_moves: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Posts {
    pub announcement: String,
    pub thread: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Language {
    pub name: String,
    pub file_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitContext {
    pub branch: Option<String>,
    pub commit: Option<String>,
    pub remote_url: Option<String>,
    pub web_url: Option<String>,
    pub changed_files: Vec<String>,
    pub recent_commits: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoContext {
    pub name: String,
    pub display_path: String,
    pub file_count: usize,
    pub focus_paths: Vec<String>,
    pub readme_path: Option<String>,
    pub readme_excerpt: Option<String>,
    pub docs: Vec<String>,
    pub tests: Vec<String>,
    pub examples: Vec<String>,
    pub fixtures: Vec<String>,
    pub manifests: Vec<String>,
    pub locks: Vec<String>,
    pub ci: Vec<String>,
    pub env_examples: Vec<String>,
    pub licenses: Vec<String>,
    pub assets: Vec<String>,
    pub frameworks: Vec<String>,
    pub install_commands: Vec<String>,
    pub local_run_commands: Vec<String>,
    pub remote_dependency_notes: Vec<String>,
    pub runtime_notes: Vec<String>,
    pub artifact_notes: Vec<String>,
    pub languages: Vec<Language>,
    pub git: GitContext,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Verdict {
    pub winner_branch_id: BranchId,
    pub label: String,
    pub reason: String,
    pub score: f64,
    pub readiness: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchRun {
    pub kind: String,
    pub version: u32,
    pub generated_at: String,
    pub title: String,
    pub prompt: String,
    pub repo: RepoContext,
    pub axes: Vec<Axis>,
    pub signals: Vec<Signal>,
    pub branches: Vec<Branch>,
    pub verdict: Verdict,
    pub actions: Vec<String>,
    pub posts: Posts,
}

#[derive(Debug, Clone)]
pub struct ArtifactPaths {
    pub output_dir: String,
    pub decision_path: String,
    pub report_path: String,
    pub trace_path: String,
}

