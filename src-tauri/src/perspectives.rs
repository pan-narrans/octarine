use crate::config::AppConfig;
use crate::path_security::{canonicalize_root, resolve_descendant_within, resolve_existing_within};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use tempfile::NamedTempFile;
use ts_rs::TS;

/// Stable logical roots available to Perspective modules. These values are not filesystem paths.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
pub enum PerspectiveWorkspaceRoot {
    Vault,
    Journal,
    Projects,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct PerspectiveWorkspaceRoots {
    pub vault: String,
    pub journal: Option<String>,
    pub projects: Option<String>,
}

impl PerspectiveWorkspaceRoot {
    pub fn id(self) -> &'static str {
        match self {
            Self::Vault => "vault",
            Self::Journal => "journal",
            Self::Projects => "projects",
        }
    }
}

/// Read raw Perspective configuration text without parsing or normalizing user data.
pub fn read_config_text(path: impl AsRef<std::path::Path>) -> Result<Option<String>, String> {
    match std::fs::read_to_string(path) {
        Ok(contents) => Ok(Some(contents)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("Failed to read Perspective configuration: {error}")),
    }
}

/// Save a complete version 1 envelope only when its original file snapshot still matches.
/// Module option semantics remain owned by the TypeScript registry validator.
pub fn save_config_text(
    path: &Path,
    contents: &str,
    expected_original: Option<&str>,
) -> Result<bool, String> {
    validate_config_envelope(contents)?;
    let parent = path
        .parent()
        .ok_or_else(|| "Perspective configuration path has no parent directory.".to_string())?;
    let initial_metadata = inspect_config_target(path)?;
    let current = match initial_metadata.as_ref() {
        Some(_metadata) => {
            let current = fs::read_to_string(path)
                .map_err(|error| format!("Failed to read Perspective configuration: {error}"))?;
            if expected_original != Some(current.as_str()) {
                return Ok(false);
            }
            Some(current)
        }
        None => {
            if expected_original.is_some() {
                return Ok(false);
            }
            None
        }
    };

    let mut temporary = NamedTempFile::new_in(parent).map_err(|error| {
        format!("Failed to create temporary Perspective configuration: {error}")
    })?;
    temporary
        .write_all(contents.as_bytes())
        .map_err(|error| format!("Failed to write temporary Perspective configuration: {error}"))?;
    if let Some(metadata) = initial_metadata.as_ref() {
        temporary
            .as_file_mut()
            .set_permissions(metadata.permissions())
            .map_err(|error| {
                format!("Failed to preserve Perspective configuration permissions: {error}")
            })?;
    }
    temporary
        .as_file_mut()
        .sync_all()
        .map_err(|error| format!("Failed to sync temporary Perspective configuration: {error}"))?;

    let latest_metadata = inspect_config_target(path)?;
    match (current.as_deref(), latest_metadata.as_ref()) {
        (Some(expected), Some(_)) => {
            let latest = fs::read_to_string(path)
                .map_err(|error| format!("Failed to recheck Perspective configuration: {error}"))?;
            if latest != expected {
                return Ok(false);
            }
            temporary.persist(path).map_err(|error| {
                format!(
                    "Failed to replace Perspective configuration atomically: {}",
                    error.error
                )
            })?;
        }
        (None, None) => match temporary.persist_noclobber(path) {
            Ok(_) => {}
            Err(error) if error.error.kind() == std::io::ErrorKind::AlreadyExists => {
                return Ok(false);
            }
            Err(error) => {
                return Err(format!(
                    "Failed to create Perspective configuration atomically: {}",
                    error.error
                ));
            }
        },
        _ => return Ok(false),
    }
    Ok(true)
}

fn inspect_config_target(path: &Path) -> Result<Option<fs::Metadata>, String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_file() => Ok(Some(metadata)),
        Ok(_) => Err(
            "Perspective configuration target must be a regular file, not a symlink or directory."
                .to_string(),
        ),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!(
            "Failed to inspect Perspective configuration target: {error}"
        )),
    }
}

fn validate_config_envelope(contents: &str) -> Result<(), String> {
    let value: serde_json::Value = serde_json::from_str(contents)
        .map_err(|error| format!("Perspective configuration is malformed JSON: {error}"))?;
    let object = value
        .as_object()
        .ok_or_else(|| "Perspective configuration must be an object.".to_string())?;
    if object.len() != 2 || !object.contains_key("version") || !object.contains_key("perspectives")
    {
        return Err(
            "Perspective configuration may contain only 'version' and 'perspectives'.".to_string(),
        );
    }
    if object.get("version").and_then(serde_json::Value::as_u64) != Some(1) {
        return Err("Unsupported Perspective schema version. Expected 1.".to_string());
    }
    let perspectives = object
        .get("perspectives")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| {
            "Perspective configuration must include an ordered 'perspectives' array.".to_string()
        })?;
    let mut perspective_ids = std::collections::HashSet::new();
    for (index, perspective) in perspectives.iter().enumerate() {
        let label = format!("perspectives[{index}]");
        let perspective = perspective
            .as_object()
            .ok_or_else(|| format!("{label} must be an object."))?;
        if perspective.len() != 3
            || !perspective.contains_key("id")
            || !perspective.contains_key("title")
            || !perspective.contains_key("sidebar")
        {
            return Err(format!(
                "{label} must contain only 'id', 'title', and 'sidebar'."
            ));
        }
        let id = perspective
            .get("id")
            .and_then(serde_json::Value::as_str)
            .filter(|id| is_stable_config_id(id))
            .ok_or_else(|| format!("{label}.id must be a stable lowercase ID."))?;
        if !perspective_ids.insert(id) {
            return Err(format!("Duplicate Perspective ID '{id}'."));
        }
        if !perspective
            .get("title")
            .and_then(serde_json::Value::as_str)
            .is_some_and(|title| !title.trim().is_empty())
        {
            return Err(format!("Perspective '{id}' needs a user-facing title."));
        }
        let sidebar = perspective
            .get("sidebar")
            .and_then(serde_json::Value::as_array)
            .ok_or_else(|| format!("Perspective '{id}' needs an ordered 'sidebar' array."))?;
        let mut instance_ids = std::collections::HashSet::new();
        for (module_index, instance) in sidebar.iter().enumerate() {
            let module_label = format!("Perspective '{id}' sidebar[{module_index}]");
            let instance = instance
                .as_object()
                .ok_or_else(|| format!("{module_label} must be an object."))?;
            let instance_id = instance
                .get("id")
                .and_then(serde_json::Value::as_str)
                .filter(|id| is_stable_config_id(id))
                .ok_or_else(|| {
                    format!("{module_label}.id must be a stable lowercase module instance ID.")
                })?;
            if !instance_ids.insert(instance_id) {
                return Err(format!(
                    "Duplicate module instance ID '{instance_id}' in Perspective '{id}'."
                ));
            }
            if !instance
                .get("type")
                .and_then(serde_json::Value::as_str)
                .is_some_and(is_stable_config_id)
            {
                return Err(format!(
                    "{module_label}.type must name a registered semantic module type."
                ));
            }
        }
    }
    Ok(())
}

fn is_stable_config_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
        && value
            .as_bytes()
            .first()
            .is_some_and(|first| first.is_ascii_lowercase() || first.is_ascii_digit())
}

/// Resolve a logical Perspective root only from the capabilities already configured by Octarine.
pub fn resolve_workspace_root(
    root: PerspectiveWorkspaceRoot,
    vault_dir: &str,
    journal_dir: Option<&str>,
    config: &AppConfig,
) -> Result<PathBuf, String> {
    let vault = canonicalize_root(vault_dir)?;
    let candidate = match root {
        PerspectiveWorkspaceRoot::Vault => vault.clone(),
        PerspectiveWorkspaceRoot::Journal => {
            let journal = journal_dir.ok_or_else(|| {
                "Workspace root 'journal' is not available. Configure a journal folder in Task settings."
                    .to_string()
            })?;
            resolve_existing_within(&vault, journal, false).map_err(|_| {
                "Workspace root 'journal' is not available inside the configured vault.".to_string()
            })?
        }
        PerspectiveWorkspaceRoot::Projects => {
            let projects = resolve_descendant_within(&vault, &config.project_folder, false)
                .map_err(|_| "Workspace root 'projects' is not available.".to_string())?;
            canonicalize_root(projects).map_err(|_| {
                "Workspace root 'projects' is not available as a directory.".to_string()
            })?
        }
    };

    if candidate == vault || candidate.starts_with(&vault) {
        Ok(candidate)
    } else {
        Err(format!(
            "Workspace root '{}' is not available inside the configured vault.",
            root.id()
        ))
    }
}

pub fn resolve_workspace_roots(
    vault_dir: &str,
    journal_dir: Option<&str>,
    config: &AppConfig,
) -> Result<PerspectiveWorkspaceRoots, String> {
    let vault = resolve_workspace_root(
        PerspectiveWorkspaceRoot::Vault,
        vault_dir,
        journal_dir,
        config,
    )?;
    let journal = resolve_workspace_root(
        PerspectiveWorkspaceRoot::Journal,
        vault_dir,
        journal_dir,
        config,
    )
    .ok()
    .map(|path| path.to_string_lossy().into_owned());
    let projects = resolve_workspace_root(
        PerspectiveWorkspaceRoot::Projects,
        vault_dir,
        journal_dir,
        config,
    )
    .ok()
    .map(|path| path.to_string_lossy().into_owned());
    Ok(PerspectiveWorkspaceRoots {
        vault: vault.to_string_lossy().into_owned(),
        journal,
        projects,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn resolves_only_configured_logical_roots() {
        let temp = tempdir().unwrap();
        let vault = temp.path().join("vault");
        let journal = vault.join("journals");
        let projects = vault.join("projects");
        fs::create_dir_all(&journal).unwrap();
        fs::create_dir_all(&projects).unwrap();
        let config = AppConfig {
            project_folder: "projects".to_string(),
            ..AppConfig::default()
        };
        let vault = vault.to_string_lossy().into_owned();
        let journal = journal.to_string_lossy().into_owned();

        assert_eq!(
            resolve_workspace_root(
                PerspectiveWorkspaceRoot::Vault,
                &vault,
                Some(&journal),
                &config
            )
            .unwrap(),
            PathBuf::from(&vault).canonicalize().unwrap()
        );
        assert!(resolve_workspace_root(
            PerspectiveWorkspaceRoot::Journal,
            &vault,
            Some(&journal),
            &config
        )
        .unwrap()
        .starts_with(PathBuf::from(&vault).canonicalize().unwrap()));
        assert!(resolve_workspace_root(
            PerspectiveWorkspaceRoot::Projects,
            &vault,
            Some(&journal),
            &config
        )
        .unwrap()
        .ends_with("projects"));
    }

    #[test]
    fn rejects_unavailable_roots_and_project_traversal() {
        let temp = tempdir().unwrap();
        let vault = temp.path().join("vault");
        fs::create_dir_all(&vault).unwrap();
        let vault = vault.to_string_lossy().into_owned();

        assert!(resolve_workspace_root(
            PerspectiveWorkspaceRoot::Journal,
            &vault,
            None,
            &AppConfig::default()
        )
        .unwrap_err()
        .contains("journal"));

        let config = AppConfig {
            project_folder: "../outside".to_string(),
            ..AppConfig::default()
        };
        assert!(
            resolve_workspace_root(PerspectiveWorkspaceRoot::Projects, &vault, None, &config)
                .is_err()
        );
    }

    #[cfg(unix)]
    #[test]
    fn rejects_project_root_symlink_escape() {
        use std::os::unix::fs::symlink;

        let temp = tempdir().unwrap();
        let vault = temp.path().join("vault");
        let outside = temp.path().join("outside");
        fs::create_dir_all(&vault).unwrap();
        fs::create_dir_all(&outside).unwrap();
        symlink(&outside, vault.join("projects")).unwrap();
        let vault = vault.to_string_lossy().into_owned();

        assert!(resolve_workspace_root(
            PerspectiveWorkspaceRoot::Projects,
            &vault,
            None,
            &AppConfig::default()
        )
        .is_err());
    }

    #[test]
    fn raw_configuration_loading_preserves_malformed_text_and_missing_files() {
        let temp = tempdir().unwrap();
        let path = temp.path().join("perspectives.json");
        let malformed = "{ broken user data\n";
        fs::write(&path, malformed).unwrap();

        assert_eq!(read_config_text(&path).unwrap().as_deref(), Some(malformed));
        assert_eq!(fs::read_to_string(&path).unwrap(), malformed);
        assert_eq!(
            read_config_text(temp.path().join("missing.json")).unwrap(),
            None
        );
    }

    #[test]
    fn guarded_save_rejects_stale_snapshot_and_replaces_matching_snapshot() {
        let temp = tempdir().unwrap();
        let path = temp.path().join("perspectives.json");
        let original = r#"{"version":1,"perspectives":[]}"#;
        let updated =
            r#"{"version":1,"perspectives":[{"id":"writing","title":"Writing","sidebar":[]}]}"#;
        fs::write(&path, original).unwrap();

        assert!(!save_config_text(&path, updated, Some("external edit")).unwrap());
        assert_eq!(fs::read_to_string(&path).unwrap(), original);
        assert!(save_config_text(&path, updated, Some(original)).unwrap());
        assert_eq!(fs::read_to_string(&path).unwrap(), updated);
    }

    #[test]
    fn guarded_save_preserves_file_when_json_version_or_ids_are_invalid() {
        let temp = tempdir().unwrap();
        let path = temp.path().join("perspectives.json");
        let original = r#"{"version":1,"perspectives":[]}"#;
        fs::write(&path, original).unwrap();
        let invalid = [
            "{ malformed",
            r#"{"version":2,"perspectives":[]}"#,
            r#"{"version":1,"perspectives":[{"id":"same","title":"One","sidebar":[]},{"id":"same","title":"Two","sidebar":[]}] }"#,
            r#"{"version":1,"perspectives":[{"id":"writing","title":"Writing","sidebar":[{"id":"files","type":"file-tree"},{"id":"files","type":"tags"}]}]}"#,
        ];

        for contents in invalid {
            assert!(save_config_text(&path, contents, Some(original)).is_err());
            assert_eq!(fs::read_to_string(&path).unwrap(), original);
        }
    }

    #[test]
    fn guarded_save_creates_only_when_file_is_absent() {
        let temp = tempdir().unwrap();
        let path = temp.path().join("perspectives.json");
        let first = r#"{"version":1,"perspectives":[]}"#;
        let second =
            r#"{"version":1,"perspectives":[{"id":"writing","title":"Writing","sidebar":[]}] }"#;

        assert!(save_config_text(&path, first, None).unwrap());
        assert!(!save_config_text(&path, second, None).unwrap());
        assert_eq!(fs::read_to_string(&path).unwrap(), first);
    }

    #[cfg(unix)]
    #[test]
    fn guarded_save_rejects_symlink_configuration_target() {
        use std::os::unix::fs::symlink;

        let temp = tempdir().unwrap();
        let target = temp.path().join("real-config.json");
        let link = temp.path().join("perspectives.json");
        let original = r#"{"version":1,"perspectives":[]}"#;
        fs::write(&target, original).unwrap();
        symlink(&target, &link).unwrap();

        assert!(save_config_text(&link, original, Some(original)).is_err());
        assert_eq!(fs::read_to_string(&target).unwrap(), original);
        assert!(fs::symlink_metadata(&link)
            .unwrap()
            .file_type()
            .is_symlink());
    }
}
