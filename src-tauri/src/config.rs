use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use tempfile::NamedTempFile;

pub const CONFIG_VERSION: u32 = 1;
const CONFIG_FILE_NAME: &str = "config.json";
const LEGACY_CONFIG_FILE_NAME: &str = ".octarine_config.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AppConfig {
    pub version: u32,
    pub vault_dir: String,
    pub journal_dir: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            version: CONFIG_VERSION,
            vault_dir: "~/octarine_vault".to_string(),
            journal_dir: "~/octarine_journal".to_string(),
        }
    }
}

#[derive(Debug, Default, Deserialize)]
struct LegacyConfig {
    vault_dir: Option<String>,
    journal_dir: Option<String>,
}

pub fn load_or_migrate_config(
    home_dir: &Path,
    platform_config_dir: &Path,
) -> Result<(AppConfig, PathBuf), String> {
    fs::create_dir_all(platform_config_dir)
        .map_err(|e| format!("Failed to create application config directory: {e}"))?;
    let config_path = platform_config_dir.join(CONFIG_FILE_NAME);

    let config = if config_path.exists() {
        load_versioned_config(&config_path)?
    } else {
        let legacy_path = home_dir.join(LEGACY_CONFIG_FILE_NAME);
        let migrated = if legacy_path.exists() {
            let content = fs::read_to_string(&legacy_path)
                .map_err(|e| format!("Failed to read legacy config: {e}"))?;
            let legacy: LegacyConfig = serde_json::from_str(&content)
                .map_err(|e| format!("Failed to parse legacy config: {e}"))?;
            AppConfig {
                version: CONFIG_VERSION,
                vault_dir: legacy
                    .vault_dir
                    .filter(|value| !value.trim().is_empty())
                    .unwrap_or_else(|| AppConfig::default().vault_dir),
                journal_dir: legacy
                    .journal_dir
                    .filter(|value| !value.trim().is_empty())
                    .unwrap_or_else(|| AppConfig::default().journal_dir),
            }
        } else {
            AppConfig::default()
        };
        save_config(&config_path, &migrated)?;
        migrated
    };

    Ok((config, config_path))
}

fn load_versioned_config(path: &Path) -> Result<AppConfig, String> {
    let content = fs::read_to_string(path).map_err(|e| format!("Failed to read config: {e}"))?;
    let config: AppConfig =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse config: {e}"))?;
    if config.version != CONFIG_VERSION {
        return Err(format!(
            "Unsupported config version {} (expected {}).",
            config.version, CONFIG_VERSION
        ));
    }
    Ok(config)
}

pub fn save_config(path: &Path, config: &AppConfig) -> Result<(), String> {
    if config.version != CONFIG_VERSION {
        return Err("Refusing to save an unsupported config version.".to_string());
    }
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to encode config: {e}"))?;
    let parent = path
        .parent()
        .ok_or_else(|| "Config path has no parent directory.".to_string())?;
    let mut temporary = NamedTempFile::new_in(parent)
        .map_err(|e| format!("Failed to create temporary config: {e}"))?;
    temporary
        .write_all(format!("{content}\n").as_bytes())
        .map_err(|e| format!("Failed to write temporary config: {e}"))?;
    temporary
        .as_file_mut()
        .sync_all()
        .map_err(|e| format!("Failed to sync temporary config: {e}"))?;
    temporary
        .persist(path)
        .map_err(|e| format!("Failed to replace config atomically: {}", e.error))?;
    Ok(())
}

pub fn expand_home(path: &str, home_dir: &Path) -> PathBuf {
    path.strip_prefix("~/")
        .map(|relative| home_dir.join(relative))
        .unwrap_or_else(|| PathBuf::from(path))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn creates_versioned_defaults_in_platform_directory() {
        let temp = tempdir().unwrap();
        let home = temp.path().join("home");
        let app_config = temp.path().join("config/com.octarine.app");
        fs::create_dir(&home).unwrap();

        let (config, path) = load_or_migrate_config(&home, &app_config).unwrap();

        assert_eq!(config, AppConfig::default());
        assert_eq!(path, app_config.join(CONFIG_FILE_NAME));
        assert!(fs::read_to_string(path).unwrap().contains("\"version\": 1"));
    }

    #[test]
    fn imports_legacy_config_without_deleting_it() {
        let temp = tempdir().unwrap();
        let home = temp.path().join("home");
        let app_config = temp.path().join("config/com.octarine.app");
        fs::create_dir(&home).unwrap();
        let legacy_path = home.join(LEGACY_CONFIG_FILE_NAME);
        fs::write(&legacy_path, r#"{"vault_dir":"~/notes"}"#).unwrap();

        let (config, _) = load_or_migrate_config(&home, &app_config).unwrap();

        assert_eq!(config.vault_dir, "~/notes");
        assert_eq!(config.journal_dir, "~/octarine_journal");
        assert!(legacy_path.exists());
    }

    #[test]
    fn rejects_unknown_config_versions() {
        let temp = tempdir().unwrap();
        let home = temp.path().join("home");
        let app_config = temp.path().join("config/com.octarine.app");
        fs::create_dir(&home).unwrap();
        fs::create_dir_all(&app_config).unwrap();
        fs::write(
            app_config.join(CONFIG_FILE_NAME),
            r#"{"version":99,"vault_dir":"vault","journal_dir":"journal"}"#,
        )
        .unwrap();

        assert!(load_or_migrate_config(&home, &app_config).is_err());
    }
}
