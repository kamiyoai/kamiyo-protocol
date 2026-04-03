use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

pub const DEFAULT_PROFILE: &str = "default";
pub const DEFAULT_API_URL: &str = "http://127.0.0.1:3000";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub api_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionLogConfig {
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliConfig {
    pub active_profile: String,
    pub profiles: HashMap<String, Profile>,
    #[serde(default)]
    pub aliases: HashMap<String, String>,
    #[serde(default)]
    pub session_log: Option<SessionLogConfig>,
}

impl Default for CliConfig {
    fn default() -> Self {
        let mut profiles = HashMap::new();
        profiles.insert(
            DEFAULT_PROFILE.to_string(),
            Profile {
                api_url: DEFAULT_API_URL.to_string(),
                output: None,
            },
        );
        Self {
            active_profile: DEFAULT_PROFILE.to_string(),
            profiles,
            aliases: HashMap::new(),
            session_log: Some(SessionLogConfig {
                enabled: true,
                path: None,
            }),
        }
    }
}

#[allow(dead_code)]
pub struct ConfigStore {
    dir_path: PathBuf,
    file_path: PathBuf,
    pub config: CliConfig,
}

#[allow(dead_code)]
impl ConfigStore {
    pub fn load() -> Self {
        let dir = config_dir();
        ensure_private_dir(&dir);
        let file_path = dir.join("config.json");

        let config = if file_path.exists() {
            match fs::read_to_string(&file_path) {
                Ok(text) => serde_json::from_str::<CliConfig>(&text).unwrap_or_default(),
                Err(_) => CliConfig::default(),
            }
        } else {
            CliConfig::default()
        };

        Self {
            dir_path: dir,
            file_path,
            config,
        }
    }

    pub fn save(&self) {
        ensure_private_dir(&self.dir_path);
        let json = serde_json::to_string_pretty(&self.config).unwrap();
        fs::write(&self.file_path, json).ok();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Ok(meta) = fs::metadata(&self.file_path) {
                let mut perms = meta.permissions();
                perms.set_mode(0o600);
                fs::set_permissions(&self.file_path, perms).ok();
            }
        }
    }

    pub fn config_path(&self) -> &Path {
        &self.file_path
    }

    pub fn active_profile(&self) -> Profile {
        self.config
            .profiles
            .get(&self.config.active_profile)
            .or_else(|| self.config.profiles.values().next())
            .cloned()
            .unwrap_or(Profile {
                api_url: DEFAULT_API_URL.to_string(),
                output: None,
            })
    }

    pub fn session_log_path(&self) -> PathBuf {
        if let Some(cfg) = &self.config.session_log {
            if let Some(p) = &cfg.path {
                return PathBuf::from(p);
            }
        }
        self.dir_path.join("sessions.jsonl")
    }
}

fn config_dir() -> PathBuf {
    if let Ok(xdg) = std::env::var("XDG_CONFIG_HOME") {
        PathBuf::from(xdg)
            .join("kamiyo")
            .join("reality-fork-cli")
    } else {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".config")
            .join("kamiyo")
            .join("reality-fork-cli")
    }
}

fn ensure_private_dir(dir: &Path) {
    fs::create_dir_all(dir).ok();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = fs::metadata(dir) {
            let mut perms = meta.permissions();
            perms.set_mode(0o700);
            fs::set_permissions(dir, perms).ok();
        }
    }
}
