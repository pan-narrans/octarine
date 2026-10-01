use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use tempfile::NamedTempFile;

pub const CONFIG_VERSION: u32 = 3;
const CONFIG_FILE_NAME: &str = "config.json";
const VERSION_1_BACKUP_FILE_NAME: &str = "config.v1.backup.json";
const VERSION_2_BACKUP_FILE_NAME: &str = "config.v2.backup.json";
const LEGACY_CONFIG_FILE_NAME: &str = ".octarine_config.json";

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "snake_case")]
pub enum UpdateChannel {
    #[default]
    Stable,
    Beta,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "snake_case")]
pub enum UnprojectedDestination {
    DailyNote,
    Inbox,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "snake_case")]
pub enum InsertionMode {
    Heading,
    Marker,
    Eof,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(deny_unknown_fields)]
pub struct InsertionConfig {
    pub mode: InsertionMode,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<String>,
}

impl InsertionConfig {
    fn tasks_heading() -> Self {
        Self {
            mode: InsertionMode::Heading,
            target: Some("## Tasks".to_string()),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(deny_unknown_fields)]
pub struct DestinationTemplate {
    pub template: String,
    pub insertion: InsertionConfig,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ts_rs::TS)]
pub struct DestinationTemplates {
    pub inbox: DestinationTemplate,
    pub daily_note: DestinationTemplate,
    pub project: DestinationTemplate,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DestinationTemplatesWire {
    inbox: DestinationTemplate,
    daily_note: Option<DestinationTemplate>,
    #[serde(rename = "dailyNote")]
    camel_daily_note: Option<DestinationTemplate>,
    project: DestinationTemplate,
}

impl<'de> Deserialize<'de> for DestinationTemplates {
    fn deserialize<Deserializer>(deserializer: Deserializer) -> Result<Self, Deserializer::Error>
    where
        Deserializer: serde::Deserializer<'de>,
    {
        let wire = DestinationTemplatesWire::deserialize(deserializer)?;
        let daily_note = match (wire.daily_note, wire.camel_daily_note) {
            (Some(value), None) | (None, Some(value)) => value,
            (Some(_), Some(_)) => {
                return Err(serde::de::Error::custom(
                    "templates cannot define both daily_note and dailyNote",
                ));
            }
            (None, None) => {
                return Err(serde::de::Error::missing_field("daily_note"));
            }
        };
        Ok(Self {
            inbox: wire.inbox,
            daily_note,
            project: wire.project,
        })
    }
}

impl Default for DestinationTemplates {
    fn default() -> Self {
        Self {
            inbox: DestinationTemplate {
                template: "# Inbox\n\n## Tasks\n".to_string(),
                insertion: InsertionConfig::tasks_heading(),
            },
            daily_note: DestinationTemplate {
                template: "# {{date}}\n\n## Tasks\n".to_string(),
                insertion: InsertionConfig::tasks_heading(),
            },
            project: DestinationTemplate {
                template: "# {{project_name}}\n\nProject: +{{project}}\n\n## Tasks\n".to_string(),
                insertion: InsertionConfig::tasks_heading(),
            },
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct JournalMigration {
    pub external_journal_dir: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TaskCreationConfig {
    pub default_destination: UnprojectedDestination,
    pub inbox_file: String,
    pub journal_folder: String,
    pub daily_filename_pattern: String,
    pub project_folder: String,
    pub templates: DestinationTemplates,
    pub migration_source: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AppConfig {
    pub version: u32,
    pub vault_dir: String,
    pub journal_folder: String,
    pub daily_filename_pattern: String,
    pub project_folder: String,
    pub inbox_file: String,
    pub default_unprojected_destination: UnprojectedDestination,
    pub templates: DestinationTemplates,
    pub update_channel: UpdateChannel,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub journal_migration: Option<JournalMigration>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            version: CONFIG_VERSION,
            vault_dir: "~/octarine_vault".to_string(),
            journal_folder: "journals".to_string(),
            daily_filename_pattern: "YYYY-MM-DD.md".to_string(),
            project_folder: "projects".to_string(),
            inbox_file: "inbox.md".to_string(),
            default_unprojected_destination: UnprojectedDestination::Inbox,
            templates: DestinationTemplates::default(),
            update_channel: UpdateChannel::Stable,
            journal_migration: None,
        }
    }
}

impl AppConfig {
    pub fn task_creation_config(&self) -> TaskCreationConfig {
        TaskCreationConfig {
            default_destination: self.default_unprojected_destination,
            inbox_file: self.inbox_file.clone(),
            journal_folder: self.journal_folder.clone(),
            daily_filename_pattern: self.daily_filename_pattern.clone(),
            project_folder: self.project_folder.clone(),
            templates: self.templates.clone(),
            migration_source: self
                .journal_migration
                .as_ref()
                .map(|migration| migration.external_journal_dir.clone()),
        }
    }

    pub fn apply_task_creation_config(&mut self, settings: TaskCreationConfig) {
        self.default_unprojected_destination = settings.default_destination;
        self.inbox_file = settings.inbox_file;
        self.journal_folder = settings.journal_folder;
        self.daily_filename_pattern = settings.daily_filename_pattern;
        self.project_folder = settings.project_folder;
        self.templates = settings.templates;
        self.journal_migration = None;
    }
}

#[derive(Debug, Deserialize)]
struct VersionProbe {
    version: u32,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct AppConfigV1 {
    version: u32,
    vault_dir: String,
    journal_dir: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct AppConfigV2 {
    version: u32,
    vault_dir: String,
    journal_folder: String,
    daily_filename_pattern: String,
    project_folder: String,
    inbox_file: String,
    default_unprojected_destination: UnprojectedDestination,
    templates: DestinationTemplates,
    journal_migration: Option<JournalMigration>,
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
    load_or_migrate_config_from_previous_identifier(home_dir, platform_config_dir, None)
}

pub fn load_or_migrate_config_from_previous_identifier(
    home_dir: &Path,
    platform_config_dir: &Path,
    previous_platform_config_dir: Option<&Path>,
) -> Result<(AppConfig, PathBuf), String> {
    fs::create_dir_all(platform_config_dir)
        .map_err(|e| format!("Failed to create application config directory: {e}"))?;
    let config_path = platform_config_dir.join(CONFIG_FILE_NAME);

    if !config_path.exists() {
        if let Some(previous_config_path) = previous_platform_config_dir
            .map(|directory| directory.join(CONFIG_FILE_NAME))
            .filter(|path| path.is_file())
        {
            fs::copy(&previous_config_path, &config_path).map_err(|e| {
                format!("Failed to migrate config from previous application identifier: {e}")
            })?;
        }
    }

    let config = if config_path.exists() {
        load_current_or_migrate_versioned(home_dir, &config_path)?
    } else {
        let legacy_path = home_dir.join(LEGACY_CONFIG_FILE_NAME);
        let migrated = if legacy_path.exists() {
            let content = fs::read_to_string(&legacy_path)
                .map_err(|e| format!("Failed to read legacy config: {e}"))?;
            let legacy: LegacyConfig = serde_json::from_str(&content)
                .map_err(|e| format!("Failed to parse legacy config: {e}"))?;
            migrate_v1(
                home_dir,
                AppConfigV1 {
                    version: 1,
                    vault_dir: legacy
                        .vault_dir
                        .filter(|value| !value.trim().is_empty())
                        .unwrap_or_else(|| "~/octarine_vault".to_string()),
                    journal_dir: legacy
                        .journal_dir
                        .filter(|value| !value.trim().is_empty())
                        .unwrap_or_else(|| "~/octarine_journal".to_string()),
                },
            )?
        } else {
            AppConfig::default()
        };
        save_config(&config_path, &migrated)?;
        migrated
    };

    Ok((config, config_path))
}

fn load_current_or_migrate_versioned(home_dir: &Path, path: &Path) -> Result<AppConfig, String> {
    let content = fs::read_to_string(path).map_err(|e| format!("Failed to read config: {e}"))?;
    let probe: VersionProbe =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse config: {e}"))?;

    match probe.version {
        CONFIG_VERSION => load_versioned_config(&content),
        2 => {
            let version_two: AppConfigV2 = serde_json::from_str(&content)
                .map_err(|e| format!("Failed to parse version 2 config: {e}"))?;
            back_up_versioned_config(path, VERSION_2_BACKUP_FILE_NAME)?;
            let migrated = migrate_v2(version_two)?;
            save_config(path, &migrated)?;
            Ok(migrated)
        }
        1 => {
            let version_one: AppConfigV1 = serde_json::from_str(&content)
                .map_err(|e| format!("Failed to parse version 1 config: {e}"))?;
            back_up_versioned_config(path, VERSION_1_BACKUP_FILE_NAME)?;
            let migrated = migrate_v1(home_dir, version_one)?;
            save_config(path, &migrated)?;
            Ok(migrated)
        }
        version => Err(format!(
            "Unsupported config version {version} (expected {CONFIG_VERSION})."
        )),
    }
}

fn back_up_versioned_config(path: &Path, backup_file_name: &str) -> Result<(), String> {
    let backup_path = path
        .parent()
        .ok_or_else(|| "Config path has no parent directory.".to_string())?
        .join(backup_file_name);
    if !backup_path.exists() {
        fs::copy(path, &backup_path)
            .map_err(|e| format!("Failed to back up versioned config: {e}"))?;
    }
    Ok(())
}

fn load_versioned_config(content: &str) -> Result<AppConfig, String> {
    let config: AppConfig =
        serde_json::from_str(content).map_err(|e| format!("Failed to parse config: {e}"))?;
    if config.version != CONFIG_VERSION {
        return Err(format!(
            "Unsupported config version {} (expected {}).",
            config.version, CONFIG_VERSION
        ));
    }
    validate_config(&config)?;
    Ok(config)
}

fn migrate_v1(home_dir: &Path, config: AppConfigV1) -> Result<AppConfig, String> {
    if config.version != 1 {
        return Err(format!(
            "Cannot migrate config version {} as version 1.",
            config.version
        ));
    }

    let mut migrated = AppConfig {
        vault_dir: config.vault_dir.clone(),
        ..AppConfig::default()
    };
    let vault_path = absolute_for_comparison(&config.vault_dir, home_dir);
    let journal_path = absolute_for_comparison(&config.journal_dir, home_dir);

    match journal_path.strip_prefix(&vault_path) {
        Ok(relative) if valid_relative_folder(relative) => {
            migrated.journal_folder = relative.to_string_lossy().into_owned();
        }
        _ => {
            migrated.journal_migration = Some(JournalMigration {
                external_journal_dir: config.journal_dir,
            });
        }
    }

    Ok(migrated)
}

fn migrate_v2(config: AppConfigV2) -> Result<AppConfig, String> {
    if config.version != 2 {
        return Err(format!(
            "Cannot migrate config version {} as version 2.",
            config.version
        ));
    }

    Ok(AppConfig {
        version: CONFIG_VERSION,
        vault_dir: config.vault_dir,
        journal_folder: config.journal_folder,
        daily_filename_pattern: config.daily_filename_pattern,
        project_folder: config.project_folder,
        inbox_file: config.inbox_file,
        default_unprojected_destination: config.default_unprojected_destination,
        templates: config.templates,
        update_channel: UpdateChannel::Stable,
        journal_migration: config.journal_migration,
    })
}

fn absolute_for_comparison(configured: &str, home_dir: &Path) -> PathBuf {
    let expanded = expand_home(configured, home_dir);
    let absolute = if expanded.is_absolute() {
        expanded
    } else {
        home_dir.join(expanded)
    };
    normalize_lexically(&absolute)
}

fn normalize_lexically(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            other => normalized.push(other.as_os_str()),
        }
    }
    normalized
}

fn valid_relative_folder(path: &Path) -> bool {
    !path.as_os_str().is_empty()
        && path
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
}

pub fn save_config(path: &Path, config: &AppConfig) -> Result<(), String> {
    if config.version != CONFIG_VERSION {
        return Err("Refusing to save an unsupported config version.".to_string());
    }
    validate_config(config)?;
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

pub fn validate_config(config: &AppConfig) -> Result<(), String> {
    validate_relative_path(&config.journal_folder, "Journal folder")?;
    validate_relative_path(&config.project_folder, "Project folder")?;
    validate_relative_path(&config.inbox_file, "Inbox file")?;
    if !config.inbox_file.ends_with(".md") {
        return Err("Inbox file must use .md extension.".to_string());
    }
    validate_relative_path(&config.daily_filename_pattern, "Daily filename pattern")?;
    if !config.daily_filename_pattern.ends_with(".md") {
        return Err("Daily filename pattern must use .md extension.".to_string());
    }
    validate_destination_template(&config.templates.inbox, "Inbox")?;
    validate_destination_template(&config.templates.daily_note, "Daily note")?;
    validate_destination_template(&config.templates.project, "Project")?;
    if config
        .journal_migration
        .as_ref()
        .is_some_and(|migration| migration.external_journal_dir.trim().is_empty())
    {
        return Err("External journal recovery path cannot be empty.".to_string());
    }
    Ok(())
}

pub fn validate_config_for_vault(config: &AppConfig, vault_root: &Path) -> Result<(), String> {
    validate_config(config)?;
    let filter = crate::vault_ignore::VaultPathFilter::load(vault_root)?;
    validate_vault_destination(
        vault_root,
        &filter,
        &config.journal_folder,
        "Journal folder",
        true,
    )?;
    validate_vault_destination(
        vault_root,
        &filter,
        &config.project_folder,
        "Project folder",
        true,
    )?;
    validate_vault_destination(vault_root, &filter, &config.inbox_file, "Inbox file", false)?;
    Ok(())
}

fn validate_vault_destination(
    vault_root: &Path,
    filter: &crate::vault_ignore::VaultPathFilter,
    relative_path: &str,
    label: &str,
    is_dir: bool,
) -> Result<(), String> {
    let resolved =
        crate::path_security::resolve_descendant_within(vault_root, relative_path, false)?;
    if filter.is_ignored(&resolved, is_dir) {
        return Err(format!("{label} cannot be hidden or ignored."));
    }
    if resolved.exists() && resolved.is_dir() != is_dir {
        let expected = if is_dir { "directory" } else { "file" };
        return Err(format!("{label} must resolve to a {expected}."));
    }
    Ok(())
}

fn validate_relative_path(value: &str, label: &str) -> Result<(), String> {
    let path = Path::new(value);
    if value.trim().is_empty()
        || path.is_absolute()
        || !path
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
    {
        return Err(format!(
            "{label} must be a relative path without traversal."
        ));
    }
    Ok(())
}

fn validate_destination_template(
    destination: &DestinationTemplate,
    label: &str,
) -> Result<(), String> {
    crate::template::validate_template(&destination.template, label == "Project")
        .map_err(|error| format!("{label} {error}"))?;
    match destination.insertion.mode {
        InsertionMode::Heading | InsertionMode::Marker => {
            let target = destination
                .insertion
                .target
                .as_deref()
                .map(str::trim)
                .filter(|target| !target.is_empty())
                .ok_or_else(|| format!("{label} insertion target is required."))?;
            if target.contains('\r') || target.contains('\n') {
                return Err(format!("{label} insertion target must be one line."));
            }
        }
        InsertionMode::Eof if destination.insertion.target.is_some() => {
            return Err(format!("{label} EOF insertion cannot define a target."));
        }
        InsertionMode::Eof => {}
    }
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
        let saved = fs::read_to_string(path).unwrap();
        assert!(saved.contains("\"version\": 3"));
        assert!(saved.contains("\"update_channel\": \"stable\""));
        assert!(saved.contains("\"journal_folder\": \"journals\""));
        assert!(saved.contains("\"daily_note\""));
        assert!(!saved.contains("\"dailyNote\""));
    }

    #[test]
    fn migrates_version_two_with_stable_channel_and_keeps_backup() {
        let temp = tempdir().unwrap();
        let home = temp.path().join("home");
        let app_config = temp.path().join("config/net.auranimnus.octarine");
        fs::create_dir(&home).unwrap();
        fs::create_dir_all(&app_config).unwrap();
        let mut version_two = serde_json::to_value(AppConfig::default()).unwrap();
        version_two["version"] = serde_json::json!(2);
        version_two
            .as_object_mut()
            .unwrap()
            .remove("update_channel");
        let original = serde_json::to_string_pretty(&version_two).unwrap();
        fs::write(app_config.join(CONFIG_FILE_NAME), &original).unwrap();

        let (config, _) = load_or_migrate_config(&home, &app_config).unwrap();

        assert_eq!(config.version, CONFIG_VERSION);
        assert_eq!(config.update_channel, UpdateChannel::Stable);
        assert_eq!(
            fs::read_to_string(app_config.join(VERSION_2_BACKUP_FILE_NAME)).unwrap(),
            original
        );
    }

    #[test]
    fn copies_previous_identifier_config_without_deleting_source() {
        let temp = tempdir().unwrap();
        let home = temp.path().join("home");
        let previous = temp.path().join("config/com.octarine.app");
        let current = temp.path().join("config/net.auranimnus.octarine");
        fs::create_dir(&home).unwrap();
        fs::create_dir_all(&previous).unwrap();
        let source = AppConfig {
            update_channel: UpdateChannel::Beta,
            ..AppConfig::default()
        };
        save_config(&previous.join(CONFIG_FILE_NAME), &source).unwrap();

        let (config, path) =
            load_or_migrate_config_from_previous_identifier(&home, &current, Some(&previous))
                .unwrap();

        assert_eq!(config, source);
        assert_eq!(path, current.join(CONFIG_FILE_NAME));
        assert!(previous.join(CONFIG_FILE_NAME).exists());
        assert_eq!(
            fs::read_to_string(&path).unwrap(),
            fs::read_to_string(previous.join(CONFIG_FILE_NAME)).unwrap()
        );
    }

    #[test]
    fn accepts_temporary_camel_case_daily_note_compatibility_alias() {
        let mut encoded = serde_json::to_value(AppConfig::default()).unwrap();
        let templates = encoded["templates"].as_object_mut().unwrap();
        let daily_note = templates.remove("daily_note").unwrap();
        templates.insert("dailyNote".to_string(), daily_note.clone());

        let decoded: AppConfig = serde_json::from_value(encoded).unwrap();

        assert_eq!(decoded.templates, DestinationTemplates::default());

        let mut duplicate = serde_json::to_value(AppConfig::default()).unwrap();
        duplicate["templates"]["dailyNote"] = daily_note;
        assert!(serde_json::from_value::<AppConfig>(duplicate).is_err());
    }

    #[test]
    fn exposes_and_applies_task_creation_settings_without_moving_migration_source() {
        let mut config = AppConfig {
            journal_migration: Some(JournalMigration {
                external_journal_dir: "~/outside-journal".to_string(),
            }),
            ..AppConfig::default()
        };
        let mut settings = config.task_creation_config();
        assert_eq!(
            settings.migration_source.as_deref(),
            Some("~/outside-journal")
        );

        settings.default_destination = UnprojectedDestination::DailyNote;
        settings.journal_folder = "daily".to_string();
        config.apply_task_creation_config(settings);

        assert_eq!(
            config.default_unprojected_destination,
            UnprojectedDestination::DailyNote
        );
        assert_eq!(config.journal_folder, "daily");
        assert_eq!(config.journal_migration, None);
    }

    #[test]
    fn task_creation_settings_round_trip_through_temporary_config() {
        let temp = tempdir().unwrap();
        let vault = temp.path().join("vault");
        let platform_config = temp.path().join("config/com.octarine.app");
        let external_journal = temp.path().join("external-journal");
        fs::create_dir_all(&vault).unwrap();
        fs::create_dir_all(&platform_config).unwrap();
        fs::create_dir(&external_journal).unwrap();
        fs::write(external_journal.join("2026-09-08.md"), "keep me").unwrap();

        let mut config = AppConfig {
            vault_dir: vault.to_string_lossy().into_owned(),
            journal_migration: Some(JournalMigration {
                external_journal_dir: external_journal.to_string_lossy().into_owned(),
            }),
            ..AppConfig::default()
        };
        let mut settings = config.task_creation_config();
        settings.default_destination = UnprojectedDestination::DailyNote;
        settings.inbox_file = "capture/inbox.md".to_string();
        settings.journal_folder = "daily".to_string();
        settings.templates.daily_note.insertion = InsertionConfig {
            mode: InsertionMode::Eof,
            target: None,
        };
        config.apply_task_creation_config(settings);

        validate_config_for_vault(&config, &vault).unwrap();
        save_config(&platform_config.join(CONFIG_FILE_NAME), &config).unwrap();
        let (reloaded, _) = load_or_migrate_config(temp.path(), &platform_config).unwrap();

        assert_eq!(
            reloaded.task_creation_config(),
            config.task_creation_config()
        );
        assert_eq!(reloaded.journal_migration, None);
        assert_eq!(
            fs::read_to_string(external_journal.join("2026-09-08.md")).unwrap(),
            "keep me"
        );
    }

    #[test]
    fn migrates_version_one_journal_inside_vault_and_keeps_backup() {
        let temp = tempdir().unwrap();
        let home = temp.path().join("home");
        let app_config = temp.path().join("config/com.octarine.app");
        fs::create_dir(&home).unwrap();
        fs::create_dir_all(&app_config).unwrap();
        let original = r#"{
            "version": 1,
            "vault_dir": "~/notes",
            "journal_dir": "~/notes/journals/daily"
        }"#;
        fs::write(app_config.join(CONFIG_FILE_NAME), original).unwrap();

        let (config, _) = load_or_migrate_config(&home, &app_config).unwrap();

        assert_eq!(config.version, CONFIG_VERSION);
        assert_eq!(config.vault_dir, "~/notes");
        assert_eq!(config.journal_folder, "journals/daily");
        assert_eq!(config.journal_migration, None);
        assert_eq!(
            fs::read_to_string(app_config.join(VERSION_1_BACKUP_FILE_NAME)).unwrap(),
            original
        );

        let backup_modified = fs::metadata(app_config.join(VERSION_1_BACKUP_FILE_NAME))
            .unwrap()
            .modified()
            .unwrap();
        let (reloaded, _) = load_or_migrate_config(&home, &app_config).unwrap();
        assert_eq!(reloaded, config);
        assert_eq!(
            fs::metadata(app_config.join(VERSION_1_BACKUP_FILE_NAME))
                .unwrap()
                .modified()
                .unwrap(),
            backup_modified
        );
    }

    #[test]
    fn migrates_external_journal_without_moving_it() {
        let temp = tempdir().unwrap();
        let home = temp.path().join("home");
        let app_config = temp.path().join("config/com.octarine.app");
        let external_journal = home.join("outside-journal");
        fs::create_dir(&home).unwrap();
        fs::create_dir(&external_journal).unwrap();
        fs::write(external_journal.join("2026-09-06.md"), "journal").unwrap();
        fs::create_dir_all(&app_config).unwrap();
        fs::write(
            app_config.join(CONFIG_FILE_NAME),
            r#"{"version":1,"vault_dir":"~/notes","journal_dir":"~/outside-journal"}"#,
        )
        .unwrap();

        let (config, _) = load_or_migrate_config(&home, &app_config).unwrap();

        assert_eq!(
            config.journal_migration,
            Some(JournalMigration {
                external_journal_dir: "~/outside-journal".to_string()
            })
        );
        assert_eq!(
            fs::read_to_string(external_journal.join("2026-09-06.md")).unwrap(),
            "journal"
        );
    }

    #[test]
    fn imports_legacy_config_without_deleting_it() {
        let temp = tempdir().unwrap();
        let home = temp.path().join("home");
        let app_config = temp.path().join("config/com.octarine.app");
        fs::create_dir(&home).unwrap();
        let legacy_path = home.join(LEGACY_CONFIG_FILE_NAME);
        fs::write(
            &legacy_path,
            r#"{"vault_dir":"~/notes","journal_dir":"~/notes/journals"}"#,
        )
        .unwrap();

        let (config, _) = load_or_migrate_config(&home, &app_config).unwrap();

        assert_eq!(config.vault_dir, "~/notes");
        assert_eq!(config.journal_folder, "journals");
        assert_eq!(config.journal_migration, None);
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
            r#"{"version":99,"vault_dir":"vault"}"#,
        )
        .unwrap();

        assert!(load_or_migrate_config(&home, &app_config).is_err());
    }

    #[test]
    fn rejects_unknown_version_two_fields() {
        let temp = tempdir().unwrap();
        let home = temp.path().join("home");
        let app_config = temp.path().join("config/com.octarine.app");
        fs::create_dir(&home).unwrap();
        fs::create_dir_all(&app_config).unwrap();
        let mut encoded = serde_json::to_value(AppConfig::default()).unwrap();
        encoded["unexpected"] = serde_json::Value::Bool(true);
        fs::write(
            app_config.join(CONFIG_FILE_NAME),
            serde_json::to_string(&encoded).unwrap(),
        )
        .unwrap();

        assert!(load_or_migrate_config(&home, &app_config).is_err());
    }

    #[test]
    fn rejects_invalid_relative_paths() {
        let temp = tempdir().unwrap();
        let config_path = temp.path().join("config.json");
        let config = AppConfig {
            project_folder: "../projects".to_string(),
            ..AppConfig::default()
        };

        assert_eq!(
            save_config(&config_path, &config).unwrap_err(),
            "Project folder must be a relative path without traversal."
        );
        assert!(!config_path.exists());
    }

    #[test]
    fn validates_insertion_target_shape() {
        let temp = tempdir().unwrap();
        let config_path = temp.path().join("config.json");
        let mut config = AppConfig::default();
        config.templates.inbox.insertion.target = None;
        assert_eq!(
            save_config(&config_path, &config).unwrap_err(),
            "Inbox insertion target is required."
        );

        config.templates.inbox.insertion = InsertionConfig {
            mode: InsertionMode::Eof,
            target: Some("## Tasks".to_string()),
        };
        assert_eq!(
            save_config(&config_path, &config).unwrap_err(),
            "Inbox EOF insertion cannot define a target."
        );
    }

    #[test]
    fn rejects_invalid_and_context_incompatible_templates() {
        let mut config = AppConfig::default();
        config.templates.inbox.template = "{{unknown}}".to_string();
        assert!(validate_config(&config)
            .unwrap_err()
            .contains("unknown placeholder"));

        config.templates.inbox.template = "{{project}}".to_string();
        assert!(validate_config(&config)
            .unwrap_err()
            .contains("requires a project destination"));

        config.templates.inbox.template = "{{date".to_string();
        assert!(validate_config(&config)
            .unwrap_err()
            .contains("malformed placeholder"));
    }

    #[test]
    fn rejects_hidden_and_ignored_vault_destinations() {
        let temp = tempdir().unwrap();
        let vault = temp.path().join("vault");
        fs::create_dir(&vault).unwrap();
        fs::write(vault.join(".octarineignore"), "archive/\nignored.md\n").unwrap();

        let hidden = AppConfig {
            journal_folder: ".journals".to_string(),
            ..AppConfig::default()
        };
        assert_eq!(
            validate_config_for_vault(&hidden, &vault).unwrap_err(),
            "Journal folder cannot be hidden or ignored."
        );

        let ignored = AppConfig {
            inbox_file: "ignored.md".to_string(),
            ..AppConfig::default()
        };
        assert_eq!(
            validate_config_for_vault(&ignored, &vault).unwrap_err(),
            "Inbox file cannot be hidden or ignored."
        );
    }

    #[test]
    fn rejects_existing_destination_with_wrong_kind() {
        let temp = tempdir().unwrap();
        let vault = temp.path().join("vault");
        fs::create_dir(&vault).unwrap();
        fs::write(vault.join("journals"), "not a directory").unwrap();

        assert_eq!(
            validate_config_for_vault(&AppConfig::default(), &vault).unwrap_err(),
            "Journal folder must resolve to a directory."
        );
    }
}
