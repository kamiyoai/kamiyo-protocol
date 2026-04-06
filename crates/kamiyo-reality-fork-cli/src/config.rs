use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

pub const DEFAULT_PROFILE: &str = "default";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cluster: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keypair: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_url: Option<String>,
}

impl Default for Profile {
    fn default() -> Self {
        Self {
            cluster: None,
            output: None,
            keypair: None,
            api_url: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliConfig {
    pub active_profile: String,
    pub profiles: HashMap<String, Profile>,
    #[serde(default)]
    pub aliases: HashMap<String, String>,
}

impl Default for CliConfig {
    fn default() -> Self {
        let mut profiles = HashMap::new();
        profiles.insert(DEFAULT_PROFILE.to_string(), Profile::default());
        Self {
            active_profile: DEFAULT_PROFILE.to_string(),
            profiles,
            aliases: HashMap::new(),
        }
    }
}

pub struct ConfigStore {
    dir_path: PathBuf,
    file_path: PathBuf,
    pub config: CliConfig,
}

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
        let Ok(json) = serde_json::to_string_pretty(&self.config) else {
            return;
        };
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
            .cloned()
            .unwrap_or_default()
    }

    pub fn set_profile_field(&mut self, key: &str, value: &str) -> Result<(), String> {
        let profile = self
            .config
            .profiles
            .entry(self.config.active_profile.clone())
            .or_insert_with(Profile::default);

        match key {
            "cluster" => profile.cluster = Some(value.to_string()),
            "output" => {
                if value != "table" && value != "json" {
                    return Err(format!("invalid output format: {value} (expected: table, json)"));
                }
                profile.output = Some(value.to_string());
            }
            "keypair" => profile.keypair = Some(value.to_string()),
            "api_url" | "api-url" => profile.api_url = Some(value.to_string()),
            _ => return Err(format!("unknown config key: {key} (valid: cluster, output, keypair, api_url)")),
        }
        Ok(())
    }

    pub fn unset_profile_field(&mut self, key: &str) -> Result<(), String> {
        let profile = self
            .config
            .profiles
            .entry(self.config.active_profile.clone())
            .or_insert_with(Profile::default);

        match key {
            "cluster" => profile.cluster = None,
            "output" => profile.output = None,
            "keypair" => profile.keypair = None,
            "api_url" | "api-url" => profile.api_url = None,
            _ => return Err(format!("unknown config key: {key} (valid: cluster, output, keypair, api_url)")),
        }
        Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config() {
        let cfg = CliConfig::default();
        assert_eq!(cfg.active_profile, "default");
        assert!(cfg.profiles.contains_key("default"));
    }

    #[test]
    fn set_and_read_field() {
        let mut store = ConfigStore {
            dir_path: PathBuf::from("/tmp"),
            file_path: PathBuf::from("/tmp/config.json"),
            config: CliConfig::default(),
        };
        store.set_profile_field("cluster", "mainnet").unwrap();
        assert_eq!(store.active_profile().cluster.as_deref(), Some("mainnet"));
    }

    #[test]
    fn unset_field() {
        let mut store = ConfigStore {
            dir_path: PathBuf::from("/tmp"),
            file_path: PathBuf::from("/tmp/config.json"),
            config: CliConfig::default(),
        };
        store.set_profile_field("cluster", "mainnet").unwrap();
        store.unset_profile_field("cluster").unwrap();
        assert_eq!(store.active_profile().cluster, None);
    }

    #[test]
    fn reject_invalid_output() {
        let mut store = ConfigStore {
            dir_path: PathBuf::from("/tmp"),
            file_path: PathBuf::from("/tmp/config.json"),
            config: CliConfig::default(),
        };
        assert!(store.set_profile_field("output", "xml").is_err());
    }

    #[test]
    fn reject_unknown_key() {
        let mut store = ConfigStore {
            dir_path: PathBuf::from("/tmp"),
            file_path: PathBuf::from("/tmp/config.json"),
            config: CliConfig::default(),
        };
        assert!(store.set_profile_field("foo", "bar").is_err());
    }
}
