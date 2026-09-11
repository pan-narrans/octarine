use crate::parser::{parse_markdown_content, rewrite_project_tokens};
use crate::path_security::{canonicalize_root, resolve_descendant_within};
use crate::project::ProjectPath;
use crate::vault_ignore::VaultPathFilter;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use unicode_normalization::UnicodeNormalization;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "snake_case")]
pub enum ProjectMergeEntryKind {
    Markdown,
    File,
    Ignored,
    TypeMismatch,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "snake_case")]
pub enum ProjectMergePathKind {
    File,
    Directory,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "snake_case")]
pub enum ProjectMergeMoveKind {
    File,
    Directory,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMergeRewrite {
    pub path: String,
    pub destination_path: String,
    pub source_fingerprint: String,
    pub replacement_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMergeMove {
    pub kind: ProjectMergeMoveKind,
    pub source_path: String,
    pub destination_path: String,
    pub source_fingerprint: String,
    pub ignored: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMergeConflict {
    pub id: String,
    pub relative_path: String,
    pub source_path: String,
    pub destination_path: String,
    pub kind: ProjectMergeEntryKind,
    pub source_kind: ProjectMergePathKind,
    pub destination_kind: ProjectMergePathKind,
    pub source_fingerprint: String,
    pub destination_fingerprint: String,
    pub nested_file_count: usize,
    pub byte_size: u64,
    pub source_preview: Option<String>,
    pub destination_preview: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMergeAutoResolution {
    pub source_path: String,
    pub destination_path: String,
    pub source_fingerprint: String,
    pub destination_fingerprint: String,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMergeImpact {
    pub rewritten_files: usize,
    pub rewritten_tokens: usize,
    pub filesystem_moves: usize,
    pub conflicts: usize,
    pub auto_resolved: usize,
    pub collapsed_descendants: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMergePlan {
    pub plan_token: String,
    pub operation_id: String,
    pub source_project: String,
    pub destination_project: String,
    pub project_folder: String,
    pub rewrites: Vec<ProjectMergeRewrite>,
    pub moves: Vec<ProjectMergeMove>,
    pub conflicts: Vec<ProjectMergeConflict>,
    pub auto_resolutions: Vec<ProjectMergeAutoResolution>,
    pub collapsed_descendants: Vec<String>,
    pub impact: ProjectMergeImpact,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "snake_case")]
pub enum ProjectMergeErrorCode {
    InvalidRequest,
    DestinationMissing,
    AncestorConflict,
    SymlinkBlocked,
    UnknownPlan,
    UnresolvedConflict,
    InvalidResolution,
    InvalidResult,
    StalePlan,
    Busy,
    Cancelled,
    OperationFailed,
    PartialFailure,
    RecoveryFailure,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMergeError {
    pub code: ProjectMergeErrorCode,
    pub message: String,
    pub paths: Vec<String>,
    pub recovery: Option<Box<ProjectMergeRecoveryReport>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "snake_case")]
pub enum ProjectMergeResolutionAction {
    UseSource,
    UseDestination,
    Combine,
    KeepBoth,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMergeResolution {
    pub conflict_id: String,
    pub action: ProjectMergeResolutionAction,
    pub result: Option<String>,
    pub source_name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMergeBulkResolution {
    pub conflict_ids: Vec<String>,
    pub action: ProjectMergeResolutionAction,
    pub confirmed_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "snake_case")]
pub enum ProjectMergeStagedEntryKind {
    Markdown,
    File,
    Directory,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMergeStagedEntry {
    pub destination_path: String,
    pub staged_path: String,
    pub fingerprint: String,
    pub kind: ProjectMergeStagedEntryKind,
    pub ignored: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct PreparedProjectMerge {
    pub prepared_token: String,
    pub plan_token: String,
    pub operation_id: String,
    pub staging_path: String,
    pub entries: Vec<ProjectMergeStagedEntry>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectMergeStagingManifest {
    version: u32,
    state: String,
    created_at: String,
    operation_id: String,
    plan_token: String,
    source_project: String,
    destination_project: String,
    resolutions: Vec<ProjectMergeResolutionManifestEntry>,
    entries: Vec<ProjectMergeStagedEntry>,
    completed_operations: Vec<String>,
    pending_operations: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectMergeResolutionManifestEntry {
    conflict_id: String,
    action: ProjectMergeResolutionAction,
    source_name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "snake_case")]
pub enum ProjectMergeRecoveryStatus {
    Committing,
    Successful,
    Stopped,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMergeRecoveryBundle {
    pub operation_id: String,
    pub recovery_path: String,
    pub created_at: String,
    pub completed_at: Option<String>,
    pub expires_at: Option<String>,
    pub source_project: String,
    pub destination_project: String,
    pub status: ProjectMergeRecoveryStatus,
    pub size_bytes: u64,
    pub completed_operations: usize,
    pub pending_operations: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMergeRecoveryCleanup {
    pub deleted_operation_ids: Vec<String>,
    pub retained_operation_ids: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectMergeRecoveryEntry {
    original_path: String,
    recovery_path: String,
    fingerprint: String,
    kind: ProjectMergePathKind,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectMergeRecoveryManifest {
    version: u32,
    status: ProjectMergeRecoveryStatus,
    created_at: String,
    completed_at: Option<String>,
    expires_at: Option<String>,
    operation_id: String,
    source_project: String,
    destination_project: String,
    entries: Vec<ProjectMergeRecoveryEntry>,
    completed_operations: Vec<String>,
    pending_operations: Vec<String>,
}

impl ProjectMergeError {
    pub fn new(code: ProjectMergeErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            paths: Vec::new(),
            recovery: None,
        }
    }

    fn with_paths(
        code: ProjectMergeErrorCode,
        message: impl Into<String>,
        paths: Vec<String>,
    ) -> Self {
        Self {
            code,
            message: message.into(),
            paths,
            recovery: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMergeRecoveryReport {
    pub operation_id: String,
    pub recovery_path: String,
    pub completed_operations: Vec<String>,
    pub pending_operations: Vec<String>,
    pub inspect_paths: Vec<String>,
    pub guidance: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMergeResult {
    pub prepared_token: String,
    pub operation_id: String,
    pub recovery_path: String,
    pub recovery_deletion_date: String,
    pub completed_operations: Vec<String>,
}

struct Planner<'a> {
    vault_root: &'a Path,
    filter: &'a VaultPathFilter,
    source: &'a ProjectPath,
    destination: &'a ProjectPath,
    rewrites: Vec<ProjectMergeRewrite>,
    moves: Vec<ProjectMergeMove>,
    conflicts: Vec<ProjectMergeConflict>,
    auto_resolutions: Vec<ProjectMergeAutoResolution>,
}

pub fn plan_project_merge(
    vault_root: &Path,
    project_folder: &str,
    source_project: &str,
    destination_project: &str,
) -> Result<ProjectMergePlan, ProjectMergeError> {
    let vault_root = canonicalize_root(vault_root).map_err(|_| {
        ProjectMergeError::new(
            ProjectMergeErrorCode::InvalidRequest,
            "Vault could not be resolved for project merge.",
        )
    })?;
    let source = ProjectPath::parse(source_project).map_err(|error| {
        ProjectMergeError::new(ProjectMergeErrorCode::InvalidRequest, error.to_string())
    })?;
    let destination = ProjectPath::parse(destination_project).map_err(|error| {
        ProjectMergeError::new(ProjectMergeErrorCode::InvalidRequest, error.to_string())
    })?;
    if source.identity() == destination.identity() {
        return Err(ProjectMergeError::new(
            ProjectMergeErrorCode::InvalidRequest,
            "Source and destination projects have same identity.",
        ));
    }
    if source.is_ancestor_of(&destination) || destination.is_ancestor_of(&source) {
        return Err(ProjectMergeError::new(
            ProjectMergeErrorCode::AncestorConflict,
            "Projects containing each other cannot be merged. Rename through an unrelated temporary project.",
        ));
    }

    let filter = VaultPathFilter::load(&vault_root).map_err(|_| {
        ProjectMergeError::new(
            ProjectMergeErrorCode::InvalidRequest,
            "Vault ignore rules could not be loaded for project merge.",
        )
    })?;
    let markdown_paths = discover_markdown_files(&vault_root, &filter)?;
    let mut source_seen = false;
    let mut destination_seen = false;
    let mut collapsed = BTreeMap::<String, String>::new();
    let mut rewrites = Vec::new();

    for path in markdown_paths {
        let content = fs::read_to_string(&path).map_err(|_| {
            ProjectMergeError::new(
                ProjectMergeErrorCode::OperationFailed,
                "A Markdown source could not be read during merge planning.",
            )
        })?;
        let relative = relative_display(&vault_root, &path)?;
        let (tasks, _) = parse_markdown_content(&relative, &content);
        for task in tasks {
            let Some(project) = task.project else {
                continue;
            };
            let Ok(project) = ProjectPath::parse(&project) else {
                continue;
            };
            if project.renamed_descendant(&source, &destination).is_some() {
                source_seen = true;
                if project.identity() != source.identity() {
                    collapsed.insert(
                        project.identity().to_string(),
                        project.display().to_string(),
                    );
                }
            }
            if project
                .renamed_descendant(&destination, &destination)
                .is_some()
            {
                destination_seen = true;
            }
        }
        let (_, replacement_count) = rewrite_project_tokens(&content, &source, &destination);
        if replacement_count > 0 {
            rewrites.push(ProjectMergeRewrite {
                destination_path: translated_project_storage_path(
                    &relative,
                    project_folder,
                    &source,
                    &destination,
                ),
                path: relative,
                source_fingerprint: fingerprint(content.as_bytes()),
                replacement_count,
            });
        }
    }

    let source_file = vault_root.join(source.relative_file_path(project_folder));
    let destination_file = vault_root.join(destination.relative_file_path(project_folder));
    let source_directory = vault_root.join(source.relative_directory_path(project_folder));
    let destination_directory =
        vault_root.join(destination.relative_directory_path(project_folder));
    source_seen |= source_file.exists() || source_directory.exists();
    destination_seen |= destination_file.exists() || destination_directory.exists();

    if !source_seen {
        return Err(ProjectMergeError::new(
            ProjectMergeErrorCode::InvalidRequest,
            "Source project was not found in task metadata or project storage.",
        ));
    }
    if !destination_seen {
        return Err(ProjectMergeError::new(
            ProjectMergeErrorCode::DestinationMissing,
            "Destination project does not exist. Use project rename instead.",
        ));
    }

    let symlinks = [
        source_file.as_path(),
        destination_file.as_path(),
        source_directory.as_path(),
        destination_directory.as_path(),
    ]
    .into_iter()
    .filter(|path| path.exists() || fs::symlink_metadata(path).is_ok())
    .map(|path| discover_symlinks(&vault_root, path))
    .collect::<Result<Vec<_>, _>>()?
    .into_iter()
    .flatten()
    .collect::<BTreeSet<_>>();
    if !symlinks.is_empty() {
        return Err(ProjectMergeError::with_paths(
            ProjectMergeErrorCode::SymlinkBlocked,
            "Project merge tree contains symlinks that require manual resolution.",
            symlinks.into_iter().collect(),
        ));
    }

    let mut planner = Planner {
        vault_root: &vault_root,
        filter: &filter,
        source: &source,
        destination: &destination,
        rewrites,
        moves: Vec::new(),
        conflicts: Vec::new(),
        auto_resolutions: Vec::new(),
    };
    planner.compare_entry(&source_file, &destination_file, source.name())?;
    planner.compare_entry(&source_directory, &destination_directory, source.name())?;

    planner
        .rewrites
        .sort_by(|left, right| left.path.cmp(&right.path));
    planner
        .moves
        .sort_by(|left, right| left.source_path.cmp(&right.source_path));
    planner
        .conflicts
        .sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    planner
        .auto_resolutions
        .sort_by(|left, right| left.source_path.cmp(&right.source_path));
    let collapsed_descendants = collapsed.into_values().collect::<Vec<_>>();
    let impact = ProjectMergeImpact {
        rewritten_files: planner.rewrites.len(),
        rewritten_tokens: planner
            .rewrites
            .iter()
            .map(|rewrite| rewrite.replacement_count)
            .sum(),
        filesystem_moves: planner.moves.len(),
        conflicts: planner.conflicts.len(),
        auto_resolved: planner.auto_resolutions.len(),
        collapsed_descendants: collapsed_descendants.len(),
    };
    let operation_seed = format!(
        "{}\0{}\0{}",
        source.display(),
        destination.display(),
        fingerprint(
            serde_json::to_string(&(
                &planner.rewrites,
                &planner.moves,
                &planner.conflicts,
                &planner.auto_resolutions
            ))
            .map_err(|_| {
                ProjectMergeError::new(
                    ProjectMergeErrorCode::OperationFailed,
                    "Project merge plan could not be serialized.",
                )
            })?
            .as_bytes()
        )
    );
    let operation_id = fingerprint(operation_seed.as_bytes())[..24].to_string();
    let mut plan = ProjectMergePlan {
        plan_token: String::new(),
        operation_id,
        source_project: source.display().to_string(),
        destination_project: destination.display().to_string(),
        project_folder: project_folder.to_string(),
        rewrites: planner.rewrites,
        moves: planner.moves,
        conflicts: planner.conflicts,
        auto_resolutions: planner.auto_resolutions,
        collapsed_descendants,
        impact,
        warnings: vec![
            "Markdown links, wiki-links, embeds, and plain paths are not updated.".to_string(),
            "Moved ignored paths may require updated .octarineignore rules.".to_string(),
        ],
    };
    plan.plan_token = fingerprint(
        serde_json::to_string(&plan)
            .map_err(|_| {
                ProjectMergeError::new(
                    ProjectMergeErrorCode::OperationFailed,
                    "Project merge plan could not be serialized.",
                )
            })?
            .as_bytes(),
    );
    Ok(plan)
}

pub fn prepare_project_merge(
    vault_root: &Path,
    plan: &ProjectMergePlan,
    resolutions: &[ProjectMergeResolution],
) -> Result<PreparedProjectMerge, ProjectMergeError> {
    let stop = AtomicBool::new(false);
    prepare_project_merge_with_stop(vault_root, plan, resolutions, &stop)
}

pub(crate) fn prepare_project_merge_with_stop(
    vault_root: &Path,
    plan: &ProjectMergePlan,
    resolutions: &[ProjectMergeResolution],
    stop: &AtomicBool,
) -> Result<PreparedProjectMerge, ProjectMergeError> {
    let vault_root = canonicalize_root(vault_root).map_err(|_| {
        ProjectMergeError::new(
            ProjectMergeErrorCode::InvalidRequest,
            "Vault could not be resolved for project merge preparation.",
        )
    })?;
    validate_plan_token(plan)?;
    validate_plan_fingerprints(&vault_root, plan)?;
    let resolutions = validate_resolutions(&vault_root, plan, resolutions)?;
    let staging_root = merge_workspace_path(&vault_root, "staging", &plan.operation_id)?;
    reset_staging_workspace(&vault_root, &staging_root)?;

    let result = prepare_project_merge_inner(&vault_root, &staging_root, plan, &resolutions, stop);
    if result.is_err() {
        let _ = remove_workspace(&vault_root, &staging_root);
    }
    result
}

pub fn cancel_project_merge_staging(
    vault_root: &Path,
    operation_id: &str,
) -> Result<(), ProjectMergeError> {
    let vault_root = canonicalize_root(vault_root).map_err(|_| {
        ProjectMergeError::new(
            ProjectMergeErrorCode::InvalidRequest,
            "Vault could not be resolved for project merge cancellation.",
        )
    })?;
    let staging_root = merge_workspace_path(&vault_root, "staging", operation_id)?;
    if !staging_root.exists() {
        return Ok(());
    }
    remove_workspace(&vault_root, &staging_root)
}

pub fn list_project_merge_recovery(
    vault_root: &Path,
) -> Result<Vec<ProjectMergeRecoveryBundle>, ProjectMergeError> {
    let vault_root = canonicalize_root(vault_root).map_err(|_| {
        ProjectMergeError::new(
            ProjectMergeErrorCode::InvalidRequest,
            "Vault could not be resolved for project merge recovery.",
        )
    })?;
    let recovery_root = vault_root.join(".octarine/recovery");
    if !recovery_root.exists() {
        return Ok(Vec::new());
    }
    if fs::symlink_metadata(&recovery_root).is_ok_and(|metadata| metadata.file_type().is_symlink())
    {
        return Err(ProjectMergeError::new(
            ProjectMergeErrorCode::SymlinkBlocked,
            "Project merge recovery root is a symlink.",
        ));
    }
    let mut directories = fs::read_dir(&recovery_root)
        .map_err(|_| recovery_read_error())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| recovery_read_error())?;
    directories.sort_by_key(|entry| entry.file_name());
    let mut bundles = Vec::new();
    for directory in directories {
        let operation_id = directory.file_name().to_string_lossy().to_string();
        if !is_valid_operation_id(&operation_id) {
            continue;
        }
        let path = directory.path();
        let metadata = fs::symlink_metadata(&path).map_err(|_| recovery_read_error())?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            continue;
        }
        let manifest = read_recovery_manifest(&path)?;
        if manifest.operation_id != operation_id {
            return Err(recovery_read_error());
        }
        bundles.push(ProjectMergeRecoveryBundle {
            operation_id,
            recovery_path: relative_display(&vault_root, &path)?,
            created_at: manifest.created_at,
            completed_at: manifest.completed_at,
            expires_at: manifest.expires_at,
            source_project: manifest.source_project,
            destination_project: manifest.destination_project,
            status: manifest.status,
            size_bytes: entry_shape(&path)?.1,
            completed_operations: manifest.completed_operations.len(),
            pending_operations: manifest.pending_operations.len(),
        });
    }
    bundles.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    Ok(bundles)
}

pub fn delete_project_merge_recovery(
    vault_root: &Path,
    operation_id: &str,
) -> Result<(), ProjectMergeError> {
    let vault_root = canonicalize_root(vault_root).map_err(|_| {
        ProjectMergeError::new(
            ProjectMergeErrorCode::InvalidRequest,
            "Vault could not be resolved for project merge recovery deletion.",
        )
    })?;
    let bundle = merge_workspace_path(&vault_root, "recovery", operation_id)?;
    if !bundle.exists() {
        return Ok(());
    }
    let manifest = read_recovery_manifest(&bundle)?;
    if manifest.operation_id != operation_id {
        return Err(recovery_read_error());
    }
    remove_recovery_workspace(&vault_root, &bundle)
}

pub fn project_merge_recovery_path(
    vault_root: &Path,
    operation_id: &str,
) -> Result<PathBuf, ProjectMergeError> {
    let vault_root = canonicalize_root(vault_root).map_err(|_| {
        ProjectMergeError::new(
            ProjectMergeErrorCode::InvalidRequest,
            "Vault could not be resolved for project merge recovery.",
        )
    })?;
    let bundle = merge_workspace_path(&vault_root, "recovery", operation_id)?;
    if !bundle.is_dir() {
        return Err(recovery_read_error());
    }
    let manifest = read_recovery_manifest(&bundle)?;
    if manifest.operation_id != operation_id {
        return Err(recovery_read_error());
    }
    Ok(bundle)
}

pub fn cleanup_project_merge_recovery(
    vault_root: &Path,
) -> Result<ProjectMergeRecoveryCleanup, ProjectMergeError> {
    cleanup_project_merge_recovery_at(vault_root, chrono::Utc::now())
}

fn cleanup_project_merge_recovery_at(
    vault_root: &Path,
    now: chrono::DateTime<chrono::Utc>,
) -> Result<ProjectMergeRecoveryCleanup, ProjectMergeError> {
    let vault_root = canonicalize_root(vault_root).map_err(|_| {
        ProjectMergeError::new(
            ProjectMergeErrorCode::InvalidRequest,
            "Vault could not be resolved for project merge recovery cleanup.",
        )
    })?;
    let recovery_root = vault_root.join(".octarine/recovery");
    if !recovery_root.exists() {
        return Ok(ProjectMergeRecoveryCleanup {
            deleted_operation_ids: Vec::new(),
            retained_operation_ids: Vec::new(),
            warnings: Vec::new(),
        });
    }
    if fs::symlink_metadata(&recovery_root).is_ok_and(|metadata| metadata.file_type().is_symlink())
    {
        return Err(ProjectMergeError::new(
            ProjectMergeErrorCode::SymlinkBlocked,
            "Project merge recovery root is a symlink.",
        ));
    }
    let mut directories = fs::read_dir(&recovery_root)
        .map_err(|_| recovery_read_error())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| recovery_read_error())?;
    directories.sort_by_key(|entry| entry.file_name());
    let mut cleanup = ProjectMergeRecoveryCleanup {
        deleted_operation_ids: Vec::new(),
        retained_operation_ids: Vec::new(),
        warnings: Vec::new(),
    };
    for directory in directories {
        let operation_id = directory.file_name().to_string_lossy().to_string();
        if !is_valid_operation_id(&operation_id) {
            continue;
        }
        let path = directory.path();
        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => metadata,
            _ => {
                cleanup.retained_operation_ids.push(operation_id);
                cleanup
                    .warnings
                    .push("Recovery entry with unsupported type was retained.".to_string());
                continue;
            }
        };
        let _ = metadata;
        let manifest = match read_recovery_manifest(&path) {
            Ok(manifest) if manifest.operation_id == operation_id => manifest,
            _ => {
                cleanup.retained_operation_ids.push(operation_id);
                cleanup
                    .warnings
                    .push("Recovery entry with invalid manifest was retained.".to_string());
                continue;
            }
        };
        let expired = manifest.status == ProjectMergeRecoveryStatus::Successful
            && manifest
                .expires_at
                .as_deref()
                .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
                .is_some_and(|expires| expires.with_timezone(&chrono::Utc) <= now);
        if expired && remove_recovery_workspace(&vault_root, &path).is_ok() {
            cleanup.deleted_operation_ids.push(operation_id);
        } else {
            cleanup.retained_operation_ids.push(operation_id);
            if expired {
                cleanup.warnings.push(
                    "Expired recovery bundle could not be removed and was retained.".to_string(),
                );
            }
        }
    }
    Ok(cleanup)
}

pub fn execute_prepared_project_merge(
    vault_root: &Path,
    plan: &ProjectMergePlan,
    prepared: &PreparedProjectMerge,
) -> Result<ProjectMergeResult, ProjectMergeError> {
    execute_prepared_project_merge_with_hook(vault_root, None, plan, prepared, |_| true)
}

pub fn execute_prepared_project_merge_indexed(
    vault_root: &Path,
    connection: &rusqlite::Connection,
    plan: &ProjectMergePlan,
    prepared: &PreparedProjectMerge,
) -> Result<ProjectMergeResult, ProjectMergeError> {
    execute_prepared_project_merge_with_hook(vault_root, Some(connection), plan, prepared, |_| true)
}

pub(crate) fn execute_prepared_project_merge_with_hook<F>(
    vault_root: &Path,
    connection: Option<&rusqlite::Connection>,
    plan: &ProjectMergePlan,
    prepared: &PreparedProjectMerge,
    mut continue_before_operation: F,
) -> Result<ProjectMergeResult, ProjectMergeError>
where
    F: FnMut(usize) -> bool,
{
    let vault_root = canonicalize_root(vault_root).map_err(|_| {
        ProjectMergeError::new(
            ProjectMergeErrorCode::InvalidRequest,
            "Vault could not be resolved for project merge commit.",
        )
    })?;
    validate_plan_token(plan)?;
    validate_prepared_merge(&vault_root, plan, prepared)?;
    validate_plan_fingerprints(&vault_root, plan)?;

    let recovery_root = merge_workspace_path(&vault_root, "recovery", &plan.operation_id)?;
    if recovery_root.exists() || fs::symlink_metadata(&recovery_root).is_ok() {
        return Err(ProjectMergeError::new(
            ProjectMergeErrorCode::RecoveryFailure,
            "Project merge recovery bundle already exists.",
        ));
    }
    fs::create_dir_all(recovery_root.join("originals")).map_err(|_| {
        ProjectMergeError::new(
            ProjectMergeErrorCode::RecoveryFailure,
            "Project merge recovery bundle could not be created.",
        )
    })?;

    let mut pending = prepared
        .entries
        .iter()
        .map(|entry| format!("Install {}", entry.destination_path))
        .chain(
            source_paths_to_recover(plan)
                .into_iter()
                .map(|path| format!("Recover source {path}")),
        )
        .collect::<Vec<_>>();
    pending.push(format!(
        "Remove empty source project {}",
        plan.source_project
    ));
    if connection.is_some() {
        pending.push("Reconcile derived task index".to_string());
    }
    let mut manifest = ProjectMergeRecoveryManifest {
        version: 1,
        status: ProjectMergeRecoveryStatus::Committing,
        created_at: chrono::Utc::now().to_rfc3339(),
        completed_at: None,
        expires_at: None,
        operation_id: plan.operation_id.clone(),
        source_project: plan.source_project.clone(),
        destination_project: plan.destination_project.clone(),
        entries: Vec::new(),
        completed_operations: Vec::new(),
        pending_operations: pending,
    };
    write_recovery_manifest(&recovery_root, &manifest)?;
    let mut operation_index = 0;

    for entry in &prepared.entries {
        if !continue_before_operation(operation_index) {
            return Err(stop_commit(&vault_root, &recovery_root, &mut manifest));
        }
        operation_index += 1;
        let operation = format!("Install {}", entry.destination_path);
        let destination = resolve_plan_path(&vault_root, &entry.destination_path, false)?;
        if destination.exists() || fs::symlink_metadata(&destination).is_ok() {
            if let Err(error) = recover_original(
                &vault_root,
                &recovery_root,
                &destination,
                &entry.destination_path,
                entry.ignored,
                &mut manifest,
            ) {
                return Err(fail_commit(
                    &vault_root,
                    &recovery_root,
                    &mut manifest,
                    error.message,
                ));
            }
        }
        let staged_path = resolve_plan_path(&vault_root, &entry.staged_path, true)?;
        if let Some(parent) = destination.parent() {
            if let Err(error) = fs::create_dir_all(parent) {
                return Err(fail_commit(
                    &vault_root,
                    &recovery_root,
                    &mut manifest,
                    format!("Destination parent could not be created: {error}"),
                ));
            }
        }
        if let Err(error) = fs::rename(&staged_path, &destination) {
            return Err(fail_commit(
                &vault_root,
                &recovery_root,
                &mut manifest,
                format!("Staged merge output could not be installed: {error}"),
            ));
        }
        finish_recovery_operation(&recovery_root, &mut manifest, &operation)?;
    }

    for source_path in source_paths_to_recover(plan) {
        if !continue_before_operation(operation_index) {
            return Err(stop_commit(&vault_root, &recovery_root, &mut manifest));
        }
        operation_index += 1;
        let operation = format!("Recover source {source_path}");
        let source = resolve_plan_path(&vault_root, &source_path, false)?;
        if source.exists() || fs::symlink_metadata(&source).is_ok() {
            if let Err(error) = recover_original(
                &vault_root,
                &recovery_root,
                &source,
                &source_path,
                plan_path_is_ignored(plan, &source_path),
                &mut manifest,
            ) {
                return Err(fail_commit(
                    &vault_root,
                    &recovery_root,
                    &mut manifest,
                    error.message,
                ));
            }
        }
        finish_recovery_operation(&recovery_root, &mut manifest, &operation)?;
    }

    if !continue_before_operation(operation_index) {
        return Err(stop_commit(&vault_root, &recovery_root, &mut manifest));
    }
    let cleanup_operation = format!("Remove empty source project {}", plan.source_project);
    remove_empty_source_project_directories(&vault_root, plan)?;
    finish_recovery_operation(&recovery_root, &mut manifest, &cleanup_operation)?;

    if let Some(connection) = connection {
        operation_index += 1;
        if !continue_before_operation(operation_index) {
            return Err(stop_commit(&vault_root, &recovery_root, &mut manifest));
        }
        if reconcile_project_merge_index(connection, &vault_root, plan, prepared).is_err() {
            return Err(fail_commit(
                &vault_root,
                &recovery_root,
                &mut manifest,
                "Project merge completed on disk, but derived index reconciliation failed."
                    .to_string(),
            ));
        }
        finish_recovery_operation(
            &recovery_root,
            &mut manifest,
            "Reconcile derived task index",
        )?;
    }

    let completed_at = chrono::Utc::now();
    let expires_at = completed_at + chrono::Duration::days(30);
    manifest.status = ProjectMergeRecoveryStatus::Successful;
    manifest.completed_at = Some(completed_at.to_rfc3339());
    manifest.expires_at = Some(expires_at.to_rfc3339());
    write_recovery_manifest(&recovery_root, &manifest)?;
    let staging_root = merge_workspace_path(&vault_root, "staging", &plan.operation_id)?;
    if staging_root.exists() {
        remove_workspace(&vault_root, &staging_root)?;
    }
    Ok(ProjectMergeResult {
        prepared_token: prepared.prepared_token.clone(),
        operation_id: plan.operation_id.clone(),
        recovery_path: relative_display(&vault_root, &recovery_root)?,
        recovery_deletion_date: expires_at.date_naive().to_string(),
        completed_operations: manifest.completed_operations,
    })
}

fn validate_prepared_merge(
    vault_root: &Path,
    plan: &ProjectMergePlan,
    prepared: &PreparedProjectMerge,
) -> Result<(), ProjectMergeError> {
    if prepared.plan_token != plan.plan_token || prepared.operation_id != plan.operation_id {
        return Err(ProjectMergeError::new(
            ProjectMergeErrorCode::UnknownPlan,
            "Prepared project merge does not match preflight plan.",
        ));
    }
    let staging_root = merge_workspace_path(vault_root, "staging", &plan.operation_id)?;
    let expected_staging_path = relative_display(vault_root, &staging_root)?;
    if prepared.staging_path != expected_staging_path {
        return Err(ProjectMergeError::new(
            ProjectMergeErrorCode::UnknownPlan,
            "Prepared project merge staging path is invalid.",
        ));
    }
    let symlinks = discover_symlinks(vault_root, &staging_root)?;
    if !symlinks.is_empty() {
        return Err(ProjectMergeError::with_paths(
            ProjectMergeErrorCode::SymlinkBlocked,
            "Project merge staging contains a symlink.",
            symlinks,
        ));
    }
    let manifest_bytes = fs::read(staging_root.join("manifest.json")).map_err(|_| {
        ProjectMergeError::new(
            ProjectMergeErrorCode::UnknownPlan,
            "Prepared project merge manifest is missing.",
        )
    })?;
    if fingerprint(&manifest_bytes) != prepared.prepared_token {
        return Err(ProjectMergeError::new(
            ProjectMergeErrorCode::StalePlan,
            "Prepared project merge changed. Prepare again.",
        ));
    }
    let manifest: ProjectMergeStagingManifest =
        serde_json::from_slice(&manifest_bytes).map_err(|_| {
            ProjectMergeError::new(
                ProjectMergeErrorCode::UnknownPlan,
                "Prepared project merge manifest is invalid.",
            )
        })?;
    if manifest.operation_id != plan.operation_id
        || manifest.plan_token != plan.plan_token
        || manifest.entries != prepared.entries
        || manifest.state != "prepared"
    {
        return Err(ProjectMergeError::new(
            ProjectMergeErrorCode::UnknownPlan,
            "Prepared project merge manifest does not match plan.",
        ));
    }
    for entry in &prepared.entries {
        let expected_stage_path =
            stage_output_path(&staging_root.join("outputs"), &entry.destination_path)?;
        if relative_display(vault_root, &expected_stage_path)? != entry.staged_path {
            return Err(ProjectMergeError::new(
                ProjectMergeErrorCode::UnknownPlan,
                "Prepared project merge output path is invalid.",
            ));
        }
        if fingerprint_entry(&expected_stage_path, entry.ignored)? != entry.fingerprint {
            return Err(ProjectMergeError::new(
                ProjectMergeErrorCode::StalePlan,
                "Prepared project merge output changed. Prepare again.",
            ));
        }
    }
    Ok(())
}

fn source_paths_to_recover(plan: &ProjectMergePlan) -> Vec<String> {
    let mut paths = plan
        .moves
        .iter()
        .map(|movement| movement.source_path.clone())
        .chain(
            plan.conflicts
                .iter()
                .map(|conflict| conflict.source_path.clone()),
        )
        .chain(
            plan.auto_resolutions
                .iter()
                .map(|resolution| resolution.source_path.clone()),
        )
        .chain(
            plan.rewrites
                .iter()
                .filter(|rewrite| rewrite.path != rewrite.destination_path)
                .map(|rewrite| rewrite.path.clone()),
        )
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    paths.sort_by_key(|path| (Path::new(path).components().count(), path.clone()));
    let mut roots = Vec::<String>::new();
    for path in paths {
        if roots
            .iter()
            .any(|root| path.starts_with(&format!("{root}/")))
        {
            continue;
        }
        roots.push(path);
    }
    roots
}

fn plan_path_is_ignored(plan: &ProjectMergePlan, source_path: &str) -> bool {
    plan.moves
        .iter()
        .any(|movement| movement.source_path == source_path && movement.ignored)
        || plan.conflicts.iter().any(|conflict| {
            conflict.source_path == source_path && conflict.kind == ProjectMergeEntryKind::Ignored
        })
}

fn recover_original(
    vault_root: &Path,
    recovery_root: &Path,
    original: &Path,
    original_path: &str,
    opaque: bool,
    manifest: &mut ProjectMergeRecoveryManifest,
) -> Result<(), ProjectMergeError> {
    let metadata = fs::symlink_metadata(original).map_err(|_| stale_plan_error())?;
    if metadata.file_type().is_symlink() {
        return Err(ProjectMergeError::new(
            ProjectMergeErrorCode::SymlinkBlocked,
            "Project merge path changed to a symlink.",
        ));
    }
    let fingerprint = fingerprint_entry(original, opaque)?;
    let recovered = stage_output_path(&recovery_root.join("originals"), original_path)?;
    if recovered.exists() || fs::symlink_metadata(&recovered).is_ok() {
        return Err(ProjectMergeError::new(
            ProjectMergeErrorCode::RecoveryFailure,
            "Project merge recovery path already exists.",
        ));
    }
    if let Some(parent) = recovered.parent() {
        fs::create_dir_all(parent).map_err(|_| {
            ProjectMergeError::new(
                ProjectMergeErrorCode::RecoveryFailure,
                "Project merge recovery parent could not be created.",
            )
        })?;
    }
    fs::rename(original, &recovered).map_err(|_| {
        ProjectMergeError::new(
            ProjectMergeErrorCode::RecoveryFailure,
            "Original project merge path could not enter recovery.",
        )
    })?;
    manifest.entries.push(ProjectMergeRecoveryEntry {
        original_path: original_path.to_string(),
        recovery_path: relative_display(vault_root, &recovered)?,
        fingerprint,
        kind: path_kind(&metadata),
    });
    write_recovery_manifest(recovery_root, manifest)
}

fn finish_recovery_operation(
    recovery_root: &Path,
    manifest: &mut ProjectMergeRecoveryManifest,
    operation: &str,
) -> Result<(), ProjectMergeError> {
    manifest
        .pending_operations
        .retain(|pending| pending != operation);
    manifest.completed_operations.push(operation.to_string());
    write_recovery_manifest(recovery_root, manifest)
}

fn write_recovery_manifest(
    recovery_root: &Path,
    manifest: &ProjectMergeRecoveryManifest,
) -> Result<(), ProjectMergeError> {
    let bytes = serde_json::to_vec_pretty(manifest).map_err(|_| {
        ProjectMergeError::new(
            ProjectMergeErrorCode::RecoveryFailure,
            "Project merge recovery manifest could not be serialized.",
        )
    })?;
    let temporary = recovery_root.join("manifest.next.json");
    fs::write(&temporary, bytes).map_err(|_| {
        ProjectMergeError::new(
            ProjectMergeErrorCode::RecoveryFailure,
            "Project merge recovery manifest could not be written.",
        )
    })?;
    fs::rename(&temporary, recovery_root.join("manifest.json")).map_err(|_| {
        ProjectMergeError::new(
            ProjectMergeErrorCode::RecoveryFailure,
            "Project merge recovery manifest could not be replaced.",
        )
    })
}

fn stop_commit(
    vault_root: &Path,
    recovery_root: &Path,
    manifest: &mut ProjectMergeRecoveryManifest,
) -> ProjectMergeError {
    manifest.status = ProjectMergeRecoveryStatus::Stopped;
    let _ = write_recovery_manifest(recovery_root, manifest);
    commit_recovery_error(
        vault_root,
        recovery_root,
        manifest,
        ProjectMergeErrorCode::PartialFailure,
        "Project merge stopped safely between filesystem operations.",
    )
}

fn fail_commit(
    vault_root: &Path,
    recovery_root: &Path,
    manifest: &mut ProjectMergeRecoveryManifest,
    message: String,
) -> ProjectMergeError {
    manifest.status = ProjectMergeRecoveryStatus::Failed;
    let manifest_result = write_recovery_manifest(recovery_root, manifest);
    commit_recovery_error(
        vault_root,
        recovery_root,
        manifest,
        if manifest_result.is_ok() {
            ProjectMergeErrorCode::PartialFailure
        } else {
            ProjectMergeErrorCode::RecoveryFailure
        },
        &message,
    )
}

fn commit_recovery_error(
    vault_root: &Path,
    recovery_root: &Path,
    manifest: &ProjectMergeRecoveryManifest,
    code: ProjectMergeErrorCode,
    message: &str,
) -> ProjectMergeError {
    let recovery_path = relative_display(vault_root, recovery_root)
        .unwrap_or_else(|_| ".octarine/recovery".to_string());
    let inspect_paths = manifest
        .entries
        .iter()
        .flat_map(|entry| [entry.original_path.clone(), entry.recovery_path.clone()])
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    ProjectMergeError {
        code,
        message: message.to_string(),
        paths: Vec::new(),
        recovery: Some(Box::new(ProjectMergeRecoveryReport {
            operation_id: manifest.operation_id.clone(),
            recovery_path,
            completed_operations: manifest.completed_operations.clone(),
            pending_operations: manifest.pending_operations.clone(),
            inspect_paths,
            guidance: "Inspect recovery and listed vault paths. Files are never rolled back automatically."
                .to_string(),
        })),
    }
}

fn remove_empty_source_project_directories(
    vault_root: &Path,
    plan: &ProjectMergePlan,
) -> Result<(), ProjectMergeError> {
    let source = ProjectPath::parse(&plan.source_project).map_err(|_| {
        ProjectMergeError::new(
            ProjectMergeErrorCode::InvalidRequest,
            "Source project in merge plan is invalid.",
        )
    })?;
    let root = resolve_descendant_within(
        vault_root,
        source.relative_directory_path(&plan.project_folder),
        false,
    )
    .map_err(|_| {
        ProjectMergeError::new(
            ProjectMergeErrorCode::InvalidRequest,
            "Source project directory is invalid.",
        )
    })?;
    remove_empty_directories(&root)
}

fn remove_empty_directories(path: &Path) -> Result<(), ProjectMergeError> {
    let Ok(metadata) = fs::symlink_metadata(path) else {
        return Ok(());
    };
    if metadata.file_type().is_symlink() {
        return Err(ProjectMergeError::new(
            ProjectMergeErrorCode::SymlinkBlocked,
            "Source project directory changed to a symlink.",
        ));
    }
    if !metadata.is_dir() {
        return Ok(());
    }
    let mut children = fs::read_dir(path)
        .map_err(|_| {
            ProjectMergeError::new(
                ProjectMergeErrorCode::OperationFailed,
                "Source project directory could not be inspected during cleanup.",
            )
        })?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| {
            ProjectMergeError::new(
                ProjectMergeErrorCode::OperationFailed,
                "Source project entry could not be inspected during cleanup.",
            )
        })?;
    children.sort_by_key(|entry| entry.file_name());
    for child in children {
        if child.file_type().is_ok_and(|kind| kind.is_dir()) {
            remove_empty_directories(&child.path())?;
        }
    }
    if fs::read_dir(path)
        .map_err(|_| {
            ProjectMergeError::new(
                ProjectMergeErrorCode::OperationFailed,
                "Source project directory could not be checked during cleanup.",
            )
        })?
        .next()
        .is_none()
    {
        fs::remove_dir(path).map_err(|_| {
            ProjectMergeError::new(
                ProjectMergeErrorCode::OperationFailed,
                "Empty source project directory could not be removed.",
            )
        })?;
    }
    Ok(())
}

fn reconcile_project_merge_index(
    connection: &rusqlite::Connection,
    vault_root: &Path,
    plan: &ProjectMergePlan,
    prepared: &PreparedProjectMerge,
) -> Result<(), ()> {
    for relative in source_paths_to_recover(plan) {
        let absolute = vault_root.join(relative).to_string_lossy().to_string();
        let escaped = absolute
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_");
        connection
            .execute(
                "DELETE FROM files WHERE path = ?1 OR path LIKE ?2 ESCAPE '\\'",
                rusqlite::params![absolute, format!("{escaped}/%")],
            )
            .map_err(|_| ())?;
    }
    let filter = VaultPathFilter::load(vault_root).map_err(|_| ())?;
    let mut index_paths = BTreeSet::new();
    for entry in &prepared.entries {
        let path = vault_root.join(&entry.destination_path);
        collect_indexable_markdown(&path, &filter, &mut index_paths).map_err(|_| ())?;
    }
    crate::db::index_files(
        connection,
        &index_paths
            .into_iter()
            .map(|path| path.to_string_lossy().to_string())
            .collect::<Vec<_>>(),
    )
    .map_err(|_| ())
}

fn collect_indexable_markdown(
    path: &Path,
    filter: &VaultPathFilter,
    files: &mut BTreeSet<PathBuf>,
) -> Result<(), ProjectMergeError> {
    let metadata = fs::symlink_metadata(path).map_err(|_| stale_plan_error())?;
    if metadata.file_type().is_symlink() {
        return Err(ProjectMergeError::new(
            ProjectMergeErrorCode::SymlinkBlocked,
            "Merged project output changed to a symlink.",
        ));
    }
    if metadata.is_file() {
        if filter.is_indexable_markdown(path) {
            files.insert(path.to_path_buf());
        }
        return Ok(());
    }
    let mut entries = fs::read_dir(path)
        .map_err(|_| stale_plan_error())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| stale_plan_error())?;
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        let child = entry.path();
        let child_metadata = fs::symlink_metadata(&child).map_err(|_| stale_plan_error())?;
        if child_metadata.is_dir() && filter.is_ignored(&child, true) {
            continue;
        }
        collect_indexable_markdown(&child, filter, files)?;
    }
    Ok(())
}

pub fn default_markdown_merge_result(
    conflict: &ProjectMergeConflict,
) -> Result<String, ProjectMergeError> {
    if conflict.kind != ProjectMergeEntryKind::Markdown {
        return Err(invalid_resolution_error());
    }
    let destination = conflict.destination_preview.as_deref().ok_or_else(|| {
        ProjectMergeError::new(
            ProjectMergeErrorCode::InvalidResult,
            "Markdown destination preview is unavailable.",
        )
    })?;
    let source = conflict.source_preview.as_deref().ok_or_else(|| {
        ProjectMergeError::new(
            ProjectMergeErrorCode::InvalidResult,
            "Markdown source preview is unavailable.",
        )
    })?;
    Ok(format!(
        "{}\n\n---\n\n{}",
        destination.trim_end_matches(['\r', '\n']),
        source
    ))
}

fn prepare_project_merge_inner(
    vault_root: &Path,
    staging_root: &Path,
    plan: &ProjectMergePlan,
    resolutions: &BTreeMap<String, ProjectMergeResolution>,
    stop: &AtomicBool,
) -> Result<PreparedProjectMerge, ProjectMergeError> {
    let output_root = staging_root.join("outputs");
    fs::create_dir_all(&output_root).map_err(|_| {
        ProjectMergeError::new(
            ProjectMergeErrorCode::OperationFailed,
            "Project merge staging output could not be created.",
        )
    })?;
    let source = ProjectPath::parse(&plan.source_project).map_err(|_| {
        ProjectMergeError::new(
            ProjectMergeErrorCode::InvalidRequest,
            "Source project in merge plan is invalid.",
        )
    })?;
    let destination = ProjectPath::parse(&plan.destination_project).map_err(|_| {
        ProjectMergeError::new(
            ProjectMergeErrorCode::InvalidRequest,
            "Destination project in merge plan is invalid.",
        )
    })?;
    let conflict_sources = plan
        .conflicts
        .iter()
        .map(|conflict| conflict.source_path.as_str())
        .chain(
            plan.auto_resolutions
                .iter()
                .map(|resolution| resolution.source_path.as_str()),
        )
        .collect::<BTreeSet<_>>();
    let mut staged = BTreeMap::<String, ProjectMergeStagedEntry>::new();

    for movement in &plan.moves {
        check_preparation_cancelled(stop)?;
        let source_path = resolve_plan_path(vault_root, &movement.source_path, true)?;
        stage_copy(
            vault_root,
            &output_root,
            &source_path,
            &movement.destination_path,
            movement.ignored,
            &mut staged,
            stop,
        )?;
    }

    for rewrite in &plan.rewrites {
        if conflict_sources.contains(rewrite.path.as_str()) {
            continue;
        }
        check_preparation_cancelled(stop)?;
        let source_path = resolve_plan_path(vault_root, &rewrite.path, true)?;
        let content = fs::read_to_string(&source_path).map_err(|_| stale_plan_error())?;
        let (rewritten, count) = rewrite_project_tokens(&content, &source, &destination);
        if count != rewrite.replacement_count {
            return Err(stale_plan_error());
        }
        validate_final_markdown(&rewrite.destination_path, &rewritten, &source)?;
        stage_markdown(
            vault_root,
            &output_root,
            &source_path,
            &rewrite.destination_path,
            &rewritten,
            &mut staged,
        )?;
    }

    for conflict in &plan.conflicts {
        check_preparation_cancelled(stop)?;
        let resolution = resolutions
            .get(&conflict.id)
            .ok_or_else(unresolved_conflict_error)?;
        stage_conflict_resolution(
            vault_root,
            &output_root,
            &source,
            conflict,
            resolution,
            &mut staged,
            stop,
        )?;
    }

    let entries = finalize_staged_entries(vault_root, staged)?;
    let resolution_manifest = resolutions
        .values()
        .map(|resolution| ProjectMergeResolutionManifestEntry {
            conflict_id: resolution.conflict_id.clone(),
            action: resolution.action,
            source_name: resolution.source_name.clone(),
        })
        .collect::<Vec<_>>();
    let pending_operations = entries
        .iter()
        .map(|entry| format!("Install {}", entry.destination_path))
        .chain(
            plan.auto_resolutions
                .iter()
                .map(|entry| format!("Recover source {}", entry.source_path)),
        )
        .collect::<Vec<_>>();
    let manifest = ProjectMergeStagingManifest {
        version: 1,
        state: "prepared".to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        operation_id: plan.operation_id.clone(),
        plan_token: plan.plan_token.clone(),
        source_project: plan.source_project.clone(),
        destination_project: plan.destination_project.clone(),
        resolutions: resolution_manifest,
        entries: entries.clone(),
        completed_operations: Vec::new(),
        pending_operations,
    };
    check_preparation_cancelled(stop)?;
    let manifest_bytes = serde_json::to_vec_pretty(&manifest).map_err(|_| {
        ProjectMergeError::new(
            ProjectMergeErrorCode::OperationFailed,
            "Project merge staging manifest could not be serialized.",
        )
    })?;
    fs::write(staging_root.join("manifest.json"), &manifest_bytes).map_err(|_| {
        ProjectMergeError::new(
            ProjectMergeErrorCode::OperationFailed,
            "Project merge staging manifest could not be written.",
        )
    })?;
    let prepared_token = fingerprint(&manifest_bytes);
    Ok(PreparedProjectMerge {
        prepared_token,
        plan_token: plan.plan_token.clone(),
        operation_id: plan.operation_id.clone(),
        staging_path: relative_display(vault_root, staging_root)?,
        entries,
        warnings: plan.warnings.clone(),
    })
}

fn finalize_staged_entries(
    vault_root: &Path,
    staged: BTreeMap<String, ProjectMergeStagedEntry>,
) -> Result<Vec<ProjectMergeStagedEntry>, ProjectMergeError> {
    let mut entries = staged.into_values().collect::<Vec<_>>();
    entries.sort_by(|left, right| left.destination_path.cmp(&right.destination_path));
    let directory_roots = entries
        .iter()
        .filter(|entry| entry.kind == ProjectMergeStagedEntryKind::Directory)
        .map(|entry| format!("{}/", entry.destination_path))
        .collect::<Vec<_>>();
    entries.retain(|entry| {
        entry.kind == ProjectMergeStagedEntryKind::Directory
            || !directory_roots
                .iter()
                .any(|root| entry.destination_path.starts_with(root))
    });
    for entry in &mut entries {
        entry.fingerprint = fingerprint_entry(&vault_root.join(&entry.staged_path), entry.ignored)
            .map_err(|_| {
                ProjectMergeError::new(
                    ProjectMergeErrorCode::OperationFailed,
                    "Project merge staged output could not be finalized.",
                )
            })?;
    }
    Ok(entries)
}

fn stage_conflict_resolution(
    vault_root: &Path,
    output_root: &Path,
    source_project: &ProjectPath,
    conflict: &ProjectMergeConflict,
    resolution: &ProjectMergeResolution,
    staged: &mut BTreeMap<String, ProjectMergeStagedEntry>,
    stop: &AtomicBool,
) -> Result<(), ProjectMergeError> {
    let source_path = resolve_plan_path(vault_root, &conflict.source_path, true)?;
    match resolution.action {
        ProjectMergeResolutionAction::UseDestination => Ok(()),
        ProjectMergeResolutionAction::UseSource => {
            if conflict.kind == ProjectMergeEntryKind::Markdown {
                let content = conflict.source_preview.as_deref().ok_or_else(|| {
                    ProjectMergeError::new(
                        ProjectMergeErrorCode::InvalidResult,
                        "Markdown source preview is unavailable.",
                    )
                })?;
                validate_final_markdown(&conflict.destination_path, content, source_project)?;
                stage_markdown(
                    vault_root,
                    output_root,
                    &source_path,
                    &conflict.destination_path,
                    content,
                    staged,
                )
            } else {
                stage_copy(
                    vault_root,
                    output_root,
                    &source_path,
                    &conflict.destination_path,
                    conflict.kind == ProjectMergeEntryKind::Ignored,
                    staged,
                    stop,
                )
            }
        }
        ProjectMergeResolutionAction::Combine => {
            if conflict.kind != ProjectMergeEntryKind::Markdown {
                return Err(invalid_resolution_error());
            }
            let result = resolution.result.as_deref().ok_or_else(|| {
                ProjectMergeError::new(
                    ProjectMergeErrorCode::InvalidResult,
                    "Combined Markdown result is required.",
                )
            })?;
            validate_final_markdown(&conflict.destination_path, result, source_project)?;
            stage_markdown(
                vault_root,
                output_root,
                &source_path,
                &conflict.destination_path,
                result,
                staged,
            )
        }
        ProjectMergeResolutionAction::KeepBoth => {
            if conflict.kind == ProjectMergeEntryKind::Markdown {
                return Err(invalid_resolution_error());
            }
            let source_name = resolution.source_name.as_deref().ok_or_else(|| {
                ProjectMergeError::new(
                    ProjectMergeErrorCode::InvalidResolution,
                    "Keep both requires source filename.",
                )
            })?;
            validate_keep_both_name(source_name)?;
            let destination = Path::new(&conflict.destination_path);
            let parent = destination.parent().unwrap_or_else(|| Path::new(""));
            let alternate = parent
                .join(source_name)
                .to_string_lossy()
                .replace('\\', "/");
            if resolve_plan_path(vault_root, &alternate, false)?.exists() {
                return Err(ProjectMergeError::new(
                    ProjectMergeErrorCode::InvalidResolution,
                    "Keep both filename already exists at destination.",
                ));
            }
            stage_copy(
                vault_root,
                output_root,
                &source_path,
                &alternate,
                conflict.kind == ProjectMergeEntryKind::Ignored,
                staged,
                stop,
            )
        }
    }
}

fn validate_plan_token(plan: &ProjectMergePlan) -> Result<(), ProjectMergeError> {
    let supplied = plan.plan_token.clone();
    let mut unsigned = plan.clone();
    unsigned.plan_token.clear();
    let serialized = serde_json::to_vec(&unsigned).map_err(|_| {
        ProjectMergeError::new(
            ProjectMergeErrorCode::InvalidRequest,
            "Project merge plan token could not be validated.",
        )
    })?;
    if fingerprint(&serialized) != supplied {
        return Err(ProjectMergeError::new(
            ProjectMergeErrorCode::UnknownPlan,
            "Project merge plan token is invalid. Run preflight again.",
        ));
    }
    Ok(())
}

fn validate_plan_fingerprints(
    vault_root: &Path,
    plan: &ProjectMergePlan,
) -> Result<(), ProjectMergeError> {
    for rewrite in &plan.rewrites {
        let path = resolve_plan_path(vault_root, &rewrite.path, true)?;
        let bytes = fs::read(path).map_err(|_| stale_plan_error())?;
        if fingerprint(&bytes) != rewrite.source_fingerprint {
            return Err(stale_plan_error());
        }
    }
    for movement in &plan.moves {
        let path = resolve_plan_path(vault_root, &movement.source_path, true)?;
        if fingerprint_entry(&path, movement.ignored)? != movement.source_fingerprint {
            return Err(stale_plan_error());
        }
        let destination = resolve_plan_path(vault_root, &movement.destination_path, false)?;
        if destination.exists() {
            return Err(stale_plan_error());
        }
    }
    for conflict in &plan.conflicts {
        let source = resolve_plan_path(vault_root, &conflict.source_path, true)?;
        let destination = resolve_plan_path(vault_root, &conflict.destination_path, true)?;
        let opaque = conflict.kind == ProjectMergeEntryKind::Ignored;
        if fingerprint_entry(&source, opaque)? != conflict.source_fingerprint
            || fingerprint_entry(&destination, opaque)? != conflict.destination_fingerprint
        {
            return Err(stale_plan_error());
        }
    }
    for resolution in &plan.auto_resolutions {
        let source = resolve_plan_path(vault_root, &resolution.source_path, true)?;
        let destination = resolve_plan_path(vault_root, &resolution.destination_path, true)?;
        if fingerprint_entry(&source, false)? != resolution.source_fingerprint
            || fingerprint_entry(&destination, false)? != resolution.destination_fingerprint
        {
            return Err(stale_plan_error());
        }
    }
    Ok(())
}

fn validate_resolutions(
    vault_root: &Path,
    plan: &ProjectMergePlan,
    resolutions: &[ProjectMergeResolution],
) -> Result<BTreeMap<String, ProjectMergeResolution>, ProjectMergeError> {
    let conflicts = plan
        .conflicts
        .iter()
        .map(|conflict| (conflict.id.as_str(), conflict))
        .collect::<BTreeMap<_, _>>();
    let mut validated = BTreeMap::new();
    for resolution in resolutions {
        let conflict = conflicts
            .get(resolution.conflict_id.as_str())
            .ok_or_else(invalid_resolution_error)?;
        if validated
            .insert(resolution.conflict_id.clone(), resolution.clone())
            .is_some()
        {
            return Err(invalid_resolution_error());
        }
        match resolution.action {
            ProjectMergeResolutionAction::Combine
                if conflict.kind != ProjectMergeEntryKind::Markdown =>
            {
                return Err(invalid_resolution_error());
            }
            ProjectMergeResolutionAction::KeepBoth
                if conflict.kind == ProjectMergeEntryKind::Markdown =>
            {
                return Err(invalid_resolution_error());
            }
            ProjectMergeResolutionAction::KeepBoth => {
                let name = resolution
                    .source_name
                    .as_deref()
                    .ok_or_else(invalid_resolution_error)?;
                validate_keep_both_name(name)?;
                let parent = Path::new(&conflict.destination_path)
                    .parent()
                    .unwrap_or_else(|| Path::new(""));
                let alternate = parent.join(name).to_string_lossy().replace('\\', "/");
                if resolve_plan_path(vault_root, &alternate, false)?.exists() {
                    return Err(ProjectMergeError::new(
                        ProjectMergeErrorCode::InvalidResolution,
                        "Keep both filename already exists at destination.",
                    ));
                }
            }
            ProjectMergeResolutionAction::Combine => {
                if resolution.result.is_none() {
                    return Err(ProjectMergeError::new(
                        ProjectMergeErrorCode::InvalidResult,
                        "Combined Markdown result is required.",
                    ));
                }
            }
            ProjectMergeResolutionAction::UseSource
            | ProjectMergeResolutionAction::UseDestination => {}
        }
    }
    if validated.len() != conflicts.len() {
        return Err(unresolved_conflict_error());
    }
    Ok(validated)
}

fn validate_final_markdown(
    relative_path: &str,
    content: &str,
    source_project: &ProjectPath,
) -> Result<(), ProjectMergeError> {
    let (tasks, _) = parse_markdown_content(relative_path, content);
    for task in tasks {
        let Some(project_value) = task.project else {
            continue;
        };
        let project = ProjectPath::parse(&project_value).map_err(|_| {
            ProjectMergeError::new(
                ProjectMergeErrorCode::InvalidResult,
                "Merged Markdown contains invalid project metadata.",
            )
        })?;
        if project
            .renamed_descendant(source_project, source_project)
            .is_some()
        {
            return Err(ProjectMergeError::new(
                ProjectMergeErrorCode::InvalidResult,
                "Merged Markdown still contains source project metadata.",
            ));
        }
    }
    Ok(())
}

fn validate_keep_both_name(name: &str) -> Result<(), ProjectMergeError> {
    let mut components = Path::new(name).components();
    let valid = matches!(components.next(), Some(std::path::Component::Normal(_)))
        && components.next().is_none()
        && !name.starts_with('.')
        && name.nfc().collect::<String>() == name;
    if !valid {
        return Err(ProjectMergeError::new(
            ProjectMergeErrorCode::InvalidResolution,
            "Keep both filename must be one visible normalized path component.",
        ));
    }
    Ok(())
}

fn stage_markdown(
    vault_root: &Path,
    output_root: &Path,
    permission_source: &Path,
    destination_path: &str,
    content: &str,
    staged: &mut BTreeMap<String, ProjectMergeStagedEntry>,
) -> Result<(), ProjectMergeError> {
    let stage_path = stage_output_path(output_root, destination_path)?;
    if let Some(parent) = stage_path.parent() {
        fs::create_dir_all(parent).map_err(|_| staging_write_error())?;
    }
    fs::write(&stage_path, content.as_bytes()).map_err(|_| staging_write_error())?;
    let permissions = fs::metadata(permission_source)
        .map_err(|_| stale_plan_error())?
        .permissions();
    fs::set_permissions(&stage_path, permissions).map_err(|_| staging_write_error())?;
    register_staged_entry(
        vault_root,
        destination_path,
        &stage_path,
        ProjectMergeStagedEntryKind::Markdown,
        false,
        staged,
    )
}

fn stage_copy(
    vault_root: &Path,
    output_root: &Path,
    source: &Path,
    destination_path: &str,
    ignored: bool,
    staged: &mut BTreeMap<String, ProjectMergeStagedEntry>,
    stop: &AtomicBool,
) -> Result<(), ProjectMergeError> {
    let stage_path = stage_output_path(output_root, destination_path)?;
    copy_entry(source, &stage_path, stop)?;
    let metadata = fs::symlink_metadata(source).map_err(|_| stale_plan_error())?;
    register_staged_entry(
        vault_root,
        destination_path,
        &stage_path,
        if metadata.is_dir() {
            ProjectMergeStagedEntryKind::Directory
        } else {
            ProjectMergeStagedEntryKind::File
        },
        ignored,
        staged,
    )
}

fn copy_entry(
    source: &Path,
    destination: &Path,
    stop: &AtomicBool,
) -> Result<(), ProjectMergeError> {
    check_preparation_cancelled(stop)?;
    let metadata = fs::symlink_metadata(source).map_err(|_| stale_plan_error())?;
    if metadata.file_type().is_symlink() {
        return Err(ProjectMergeError::new(
            ProjectMergeErrorCode::SymlinkBlocked,
            "Project merge source changed to a symlink.",
        ));
    }
    if metadata.is_file() {
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|_| staging_write_error())?;
        }
        fs::copy(source, destination).map_err(|_| staging_write_error())?;
        return Ok(());
    }
    fs::create_dir_all(destination).map_err(|_| staging_write_error())?;
    fs::set_permissions(destination, metadata.permissions()).map_err(|_| staging_write_error())?;
    let mut entries = fs::read_dir(source)
        .map_err(|_| stale_plan_error())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| stale_plan_error())?;
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        copy_entry(&entry.path(), &destination.join(entry.file_name()), stop)?;
    }
    Ok(())
}

fn register_staged_entry(
    vault_root: &Path,
    destination_path: &str,
    stage_path: &Path,
    kind: ProjectMergeStagedEntryKind,
    ignored: bool,
    staged: &mut BTreeMap<String, ProjectMergeStagedEntry>,
) -> Result<(), ProjectMergeError> {
    let key = destination_path
        .nfc()
        .flat_map(char::to_lowercase)
        .collect::<String>();
    let entry = ProjectMergeStagedEntry {
        destination_path: destination_path.to_string(),
        staged_path: relative_display(vault_root, stage_path)?,
        fingerprint: fingerprint_entry(stage_path, ignored)?,
        kind,
        ignored,
    };
    if let Some(existing) = staged.get(&key) {
        if existing.destination_path != destination_path {
            return Err(ProjectMergeError::new(
                ProjectMergeErrorCode::InvalidResolution,
                "Merge outputs contain case-folding path collision.",
            ));
        }
    }
    staged.insert(key, entry);
    Ok(())
}

fn stage_output_path(
    output_root: &Path,
    destination_path: &str,
) -> Result<PathBuf, ProjectMergeError> {
    let relative = Path::new(destination_path);
    if relative.is_absolute()
        || relative
            .components()
            .any(|component| !matches!(component, std::path::Component::Normal(_)))
    {
        return Err(ProjectMergeError::new(
            ProjectMergeErrorCode::InvalidRequest,
            "Project merge output path is invalid.",
        ));
    }
    Ok(output_root.join(relative))
}

fn merge_workspace_path(
    vault_root: &Path,
    domain: &str,
    operation_id: &str,
) -> Result<PathBuf, ProjectMergeError> {
    if !is_valid_operation_id(operation_id) {
        return Err(ProjectMergeError::new(
            ProjectMergeErrorCode::InvalidRequest,
            "Project merge operation ID is invalid.",
        ));
    }
    let octarine_root = vault_root.join(".octarine");
    let domain_root = octarine_root.join(domain);
    for path in [&octarine_root, &domain_root] {
        if fs::symlink_metadata(path).is_ok_and(|metadata| metadata.file_type().is_symlink()) {
            return Err(ProjectMergeError::new(
                ProjectMergeErrorCode::SymlinkBlocked,
                "Project merge workspace contains a symlink.",
            ));
        }
    }
    Ok(domain_root.join(operation_id))
}

fn is_valid_operation_id(operation_id: &str) -> bool {
    operation_id.len() == 24 && operation_id.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn reset_staging_workspace(
    vault_root: &Path,
    staging_root: &Path,
) -> Result<(), ProjectMergeError> {
    if staging_root.exists() {
        remove_workspace(vault_root, staging_root)?;
    }
    fs::create_dir_all(staging_root).map_err(|_| staging_write_error())
}

fn remove_workspace(vault_root: &Path, workspace: &Path) -> Result<(), ProjectMergeError> {
    let staging_root = vault_root.join(".octarine/staging");
    if workspace.parent() != Some(staging_root.as_path()) {
        return Err(ProjectMergeError::new(
            ProjectMergeErrorCode::InvalidRequest,
            "Project merge staging path is invalid.",
        ));
    }
    let symlinks = discover_symlinks(vault_root, workspace)?;
    if !symlinks.is_empty() {
        return Err(ProjectMergeError::with_paths(
            ProjectMergeErrorCode::SymlinkBlocked,
            "Project merge staging contains a symlink.",
            symlinks,
        ));
    }
    fs::remove_dir_all(workspace).map_err(|_| {
        ProjectMergeError::new(
            ProjectMergeErrorCode::OperationFailed,
            "Project merge staging could not be removed.",
        )
    })
}

fn remove_recovery_workspace(vault_root: &Path, workspace: &Path) -> Result<(), ProjectMergeError> {
    let recovery_root = vault_root.join(".octarine/recovery");
    if workspace.parent() != Some(recovery_root.as_path()) {
        return Err(ProjectMergeError::new(
            ProjectMergeErrorCode::InvalidRequest,
            "Project merge recovery path is invalid.",
        ));
    }
    let symlinks = discover_symlinks(vault_root, workspace)?;
    if !symlinks.is_empty() {
        return Err(ProjectMergeError::with_paths(
            ProjectMergeErrorCode::SymlinkBlocked,
            "Project merge recovery contains a symlink.",
            symlinks,
        ));
    }
    fs::remove_dir_all(workspace).map_err(|_| {
        ProjectMergeError::new(
            ProjectMergeErrorCode::RecoveryFailure,
            "Project merge recovery bundle could not be removed.",
        )
    })
}

fn read_recovery_manifest(
    recovery_root: &Path,
) -> Result<ProjectMergeRecoveryManifest, ProjectMergeError> {
    let bytes = fs::read(recovery_root.join("manifest.json")).map_err(|_| recovery_read_error())?;
    serde_json::from_slice(&bytes).map_err(|_| recovery_read_error())
}

fn recovery_read_error() -> ProjectMergeError {
    ProjectMergeError::new(
        ProjectMergeErrorCode::RecoveryFailure,
        "Project merge recovery metadata could not be read.",
    )
}

fn resolve_plan_path(
    vault_root: &Path,
    relative: &str,
    must_exist: bool,
) -> Result<PathBuf, ProjectMergeError> {
    let path = resolve_descendant_within(vault_root, relative, false).map_err(|_| {
        ProjectMergeError::new(
            ProjectMergeErrorCode::InvalidRequest,
            "Project merge plan contains invalid path.",
        )
    })?;
    if must_exist && !path.exists() {
        return Err(stale_plan_error());
    }
    Ok(path)
}

fn stale_plan_error() -> ProjectMergeError {
    ProjectMergeError::new(
        ProjectMergeErrorCode::StalePlan,
        "Project merge plan is stale. Run preflight again.",
    )
}

fn unresolved_conflict_error() -> ProjectMergeError {
    ProjectMergeError::new(
        ProjectMergeErrorCode::UnresolvedConflict,
        "Resolve every project merge conflict before preparation.",
    )
}

fn invalid_resolution_error() -> ProjectMergeError {
    ProjectMergeError::new(
        ProjectMergeErrorCode::InvalidResolution,
        "Project merge conflict resolution is invalid.",
    )
}

fn staging_write_error() -> ProjectMergeError {
    ProjectMergeError::new(
        ProjectMergeErrorCode::OperationFailed,
        "Project merge staging output could not be written.",
    )
}

fn check_preparation_cancelled(stop: &AtomicBool) -> Result<(), ProjectMergeError> {
    if stop.load(Ordering::Acquire) {
        return Err(ProjectMergeError::new(
            ProjectMergeErrorCode::Cancelled,
            "Project merge preparation was cancelled. No project files changed.",
        ));
    }
    Ok(())
}

impl Planner<'_> {
    fn compare_entry(
        &mut self,
        source: &Path,
        destination: &Path,
        relative_merge_path: &str,
    ) -> Result<(), ProjectMergeError> {
        let Ok(source_metadata) = fs::symlink_metadata(source) else {
            return Ok(());
        };
        let destination_metadata = fs::symlink_metadata(destination).ok();
        if destination_metadata.is_none() {
            let ignored = self.filter.is_ignored(source, source_metadata.is_dir());
            if source_metadata.is_dir() && !ignored {
                let mut entries = fs::read_dir(source)
                    .map_err(|_| {
                        ProjectMergeError::new(
                            ProjectMergeErrorCode::OperationFailed,
                            "Source project directory could not be inspected.",
                        )
                    })?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|_| {
                        ProjectMergeError::new(
                            ProjectMergeErrorCode::OperationFailed,
                            "Source project entry could not be inspected.",
                        )
                    })?;
                entries.sort_by_key(|entry| entry.file_name());
                if entries.is_empty() {
                    self.moves.push(ProjectMergeMove {
                        kind: ProjectMergeMoveKind::Directory,
                        source_path: relative_display(self.vault_root, source)?,
                        destination_path: relative_display(self.vault_root, destination)?,
                        source_fingerprint: fingerprint_entry(source, false)?,
                        ignored: false,
                    });
                    return Ok(());
                }
                for entry in entries {
                    let name = entry.file_name();
                    let name_display = name.to_string_lossy();
                    self.compare_entry(
                        &entry.path(),
                        &destination.join(&name),
                        &format!("{relative_merge_path}/{name_display}"),
                    )?;
                }
                return Ok(());
            }
            self.moves.push(ProjectMergeMove {
                kind: if source_metadata.is_dir() {
                    ProjectMergeMoveKind::Directory
                } else {
                    ProjectMergeMoveKind::File
                },
                source_path: relative_display(self.vault_root, source)?,
                destination_path: relative_display(self.vault_root, destination)?,
                source_fingerprint: fingerprint_entry(source, ignored)?,
                ignored,
            });
            return Ok(());
        }
        let Some(destination_metadata) = destination_metadata else {
            return Err(ProjectMergeError::new(
                ProjectMergeErrorCode::OperationFailed,
                "Destination merge metadata changed during planning.",
            ));
        };

        if source_metadata.is_dir() && destination_metadata.is_dir() {
            let mut entries = fs::read_dir(source)
                .map_err(|_| {
                    ProjectMergeError::new(
                        ProjectMergeErrorCode::OperationFailed,
                        "Source project directory could not be inspected.",
                    )
                })?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|_| {
                    ProjectMergeError::new(
                        ProjectMergeErrorCode::OperationFailed,
                        "Source project entry could not be inspected.",
                    )
                })?;
            entries.sort_by_key(|entry| entry.file_name());
            for entry in entries {
                let name = entry.file_name();
                let name_display = name.to_string_lossy();
                self.compare_entry(
                    &entry.path(),
                    &destination.join(&name),
                    &format!("{relative_merge_path}/{name_display}"),
                )?;
            }
            return Ok(());
        }

        let source_kind = path_kind(&source_metadata);
        let destination_kind = path_kind(&destination_metadata);
        let source_ignored = self.filter.is_ignored(source, source_metadata.is_dir());
        let destination_ignored = self
            .filter
            .is_ignored(destination, destination_metadata.is_dir());
        let ignored = source_ignored || destination_ignored;
        let both_files = source_metadata.is_file() && destination_metadata.is_file();
        let markdown = both_files && is_markdown(source) && is_markdown(destination) && !ignored;

        if both_files && !markdown && !ignored {
            let source_bytes = fs::read(source).map_err(|_| {
                ProjectMergeError::new(
                    ProjectMergeErrorCode::OperationFailed,
                    "Source merge file could not be read.",
                )
            })?;
            let destination_bytes = fs::read(destination).map_err(|_| {
                ProjectMergeError::new(
                    ProjectMergeErrorCode::OperationFailed,
                    "Destination merge file could not be read.",
                )
            })?;
            if source_bytes == destination_bytes {
                self.auto_resolutions.push(ProjectMergeAutoResolution {
                    source_path: relative_display(self.vault_root, source)?,
                    destination_path: relative_display(self.vault_root, destination)?,
                    source_fingerprint: fingerprint(&source_bytes),
                    destination_fingerprint: fingerprint(&destination_bytes),
                    reason:
                        "Identical non-Markdown files keep destination; source enters recovery."
                            .to_string(),
                });
                return Ok(());
            }
        }

        let kind = if ignored {
            ProjectMergeEntryKind::Ignored
        } else if markdown {
            ProjectMergeEntryKind::Markdown
        } else if source_kind != destination_kind {
            ProjectMergeEntryKind::TypeMismatch
        } else {
            ProjectMergeEntryKind::File
        };
        let (nested_file_count, byte_size) = entry_shape(source)?;
        let (source_preview, destination_preview) = if markdown {
            let source_content = fs::read_to_string(source).map_err(|_| {
                ProjectMergeError::new(
                    ProjectMergeErrorCode::OperationFailed,
                    "Source Markdown conflict could not be read.",
                )
            })?;
            let destination_content = fs::read_to_string(destination).map_err(|_| {
                ProjectMergeError::new(
                    ProjectMergeErrorCode::OperationFailed,
                    "Destination Markdown conflict could not be read.",
                )
            })?;
            let (rewritten, _) =
                rewrite_project_tokens(&source_content, self.source, self.destination);
            (Some(rewritten), Some(destination_content))
        } else {
            (None, None)
        };
        let source_path = relative_display(self.vault_root, source)?;
        let destination_path = relative_display(self.vault_root, destination)?;
        let source_fingerprint = fingerprint_entry(source, ignored)?;
        let destination_fingerprint = fingerprint_entry(destination, ignored)?;
        let id = fingerprint(
            format!("{source_path}\0{destination_path}\0{source_fingerprint}\0{destination_fingerprint}")
                .as_bytes(),
        )[..24]
            .to_string();
        self.conflicts.push(ProjectMergeConflict {
            id,
            relative_path: relative_merge_path.to_string(),
            source_path,
            destination_path,
            kind,
            source_kind,
            destination_kind,
            source_fingerprint,
            destination_fingerprint,
            nested_file_count,
            byte_size,
            source_preview,
            destination_preview,
        });
        Ok(())
    }
}

fn discover_markdown_files(
    vault_root: &Path,
    filter: &VaultPathFilter,
) -> Result<Vec<PathBuf>, ProjectMergeError> {
    let mut pending = vec![vault_root.to_path_buf()];
    let mut files = Vec::new();
    while let Some(directory) = pending.pop() {
        let mut entries = fs::read_dir(&directory)
            .map_err(|_| {
                ProjectMergeError::new(
                    ProjectMergeErrorCode::OperationFailed,
                    "Vault could not be inspected for project merge.",
                )
            })?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| {
                ProjectMergeError::new(
                    ProjectMergeErrorCode::OperationFailed,
                    "Vault entry could not be inspected for project merge.",
                )
            })?;
        entries.sort_by_key(|entry| entry.file_name());
        for entry in entries.into_iter().rev() {
            let path = entry.path();
            let metadata = fs::symlink_metadata(&path).map_err(|_| {
                ProjectMergeError::new(
                    ProjectMergeErrorCode::OperationFailed,
                    "Vault metadata could not be inspected for project merge.",
                )
            })?;
            if metadata.file_type().is_symlink() {
                continue;
            }
            if metadata.is_dir() {
                if !filter.is_ignored(&path, true) {
                    pending.push(path);
                }
            } else if metadata.is_file() && filter.is_indexable_markdown(&path) {
                files.push(path);
            }
        }
    }
    files.sort();
    Ok(files)
}

fn discover_symlinks(vault_root: &Path, root: &Path) -> Result<Vec<String>, ProjectMergeError> {
    let metadata = fs::symlink_metadata(root).map_err(|_| {
        ProjectMergeError::new(
            ProjectMergeErrorCode::OperationFailed,
            "Project merge tree metadata could not be inspected.",
        )
    })?;
    if metadata.file_type().is_symlink() {
        return Ok(vec![relative_display(vault_root, root)?]);
    }
    if !metadata.is_dir() {
        return Ok(Vec::new());
    }
    let mut pending = vec![root.to_path_buf()];
    let mut symlinks = Vec::new();
    while let Some(directory) = pending.pop() {
        for entry in fs::read_dir(&directory)
            .map_err(|_| {
                ProjectMergeError::new(
                    ProjectMergeErrorCode::OperationFailed,
                    "Project merge tree could not be inspected.",
                )
            })?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| {
                ProjectMergeError::new(
                    ProjectMergeErrorCode::OperationFailed,
                    "Project merge entry could not be inspected.",
                )
            })?
        {
            let path = entry.path();
            let child = fs::symlink_metadata(&path).map_err(|_| {
                ProjectMergeError::new(
                    ProjectMergeErrorCode::OperationFailed,
                    "Project merge entry metadata could not be inspected.",
                )
            })?;
            if child.file_type().is_symlink() {
                symlinks.push(relative_display(vault_root, &path)?);
            } else if child.is_dir() {
                pending.push(path);
            }
        }
    }
    symlinks.sort();
    Ok(symlinks)
}

fn entry_shape(path: &Path) -> Result<(usize, u64), ProjectMergeError> {
    let metadata = fs::symlink_metadata(path).map_err(|_| {
        ProjectMergeError::new(
            ProjectMergeErrorCode::OperationFailed,
            "Merge conflict shape could not be inspected.",
        )
    })?;
    if metadata.is_file() {
        return Ok((1, metadata.len()));
    }
    let mut count = 0;
    let mut bytes = 0;
    let mut pending = vec![path.to_path_buf()];
    while let Some(directory) = pending.pop() {
        for entry in fs::read_dir(directory)
            .map_err(|_| {
                ProjectMergeError::new(
                    ProjectMergeErrorCode::OperationFailed,
                    "Merge conflict directory could not be inspected.",
                )
            })?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| {
                ProjectMergeError::new(
                    ProjectMergeErrorCode::OperationFailed,
                    "Merge conflict entry could not be inspected.",
                )
            })?
        {
            let metadata = fs::symlink_metadata(entry.path()).map_err(|_| {
                ProjectMergeError::new(
                    ProjectMergeErrorCode::OperationFailed,
                    "Merge conflict metadata could not be inspected.",
                )
            })?;
            if metadata.is_dir() {
                pending.push(entry.path());
            } else {
                count += 1;
                bytes += metadata.len();
            }
        }
    }
    Ok((count, bytes))
}

fn fingerprint_entry(path: &Path, opaque: bool) -> Result<String, ProjectMergeError> {
    let root_metadata = fs::symlink_metadata(path).map_err(|_| fingerprint_error())?;
    let opaque = opaque || root_metadata.is_dir();
    let mut hasher = Sha256::new();
    fingerprint_entry_into(path, path, opaque, &mut hasher)?;
    Ok(hex::encode(hasher.finalize()))
}

fn fingerprint_entry_into(
    root: &Path,
    path: &Path,
    opaque: bool,
    hasher: &mut Sha256,
) -> Result<(), ProjectMergeError> {
    let metadata = fs::symlink_metadata(path).map_err(|_| fingerprint_error())?;
    if metadata.file_type().is_symlink() {
        return Err(ProjectMergeError::new(
            ProjectMergeErrorCode::SymlinkBlocked,
            "Project merge tree changed to contain a symlink.",
        ));
    }
    let relative = path.strip_prefix(root).unwrap_or_else(|_| Path::new(""));
    hasher.update(relative.to_string_lossy().replace('\\', "/").as_bytes());
    hasher.update([0]);
    hasher.update(if metadata.is_dir() { b"d" } else { b"f" });
    hasher.update(metadata.len().to_le_bytes());
    hasher.update(format!("{:?}", metadata.modified().ok()).as_bytes());
    hasher.update(if metadata.permissions().readonly() {
        b"r"
    } else {
        b"w"
    });
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        hasher.update(metadata.permissions().mode().to_le_bytes());
    }
    if metadata.is_file() {
        if !opaque {
            hasher.update(fs::read(path).map_err(|_| fingerprint_error())?);
        }
        return Ok(());
    }
    let mut entries = fs::read_dir(path)
        .map_err(|_| fingerprint_error())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| fingerprint_error())?;
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        fingerprint_entry_into(root, &entry.path(), opaque, hasher)?;
    }
    Ok(())
}

fn fingerprint_error() -> ProjectMergeError {
    ProjectMergeError::new(
        ProjectMergeErrorCode::OperationFailed,
        "Merge source fingerprint could not be created.",
    )
}

fn path_kind(metadata: &fs::Metadata) -> ProjectMergePathKind {
    if metadata.is_dir() {
        ProjectMergePathKind::Directory
    } else {
        ProjectMergePathKind::File
    }
}

fn is_markdown(path: &Path) -> bool {
    path.extension().is_some_and(|extension| extension == "md")
}

fn translated_project_storage_path(
    relative: &str,
    project_folder: &str,
    source: &ProjectPath,
    destination: &ProjectPath,
) -> String {
    let source_file = source
        .relative_file_path(project_folder)
        .to_string_lossy()
        .replace('\\', "/");
    let destination_file = destination
        .relative_file_path(project_folder)
        .to_string_lossy()
        .replace('\\', "/");
    if relative == source_file {
        return destination_file;
    }
    let source_directory = source
        .relative_directory_path(project_folder)
        .to_string_lossy()
        .replace('\\', "/");
    let destination_directory = destination
        .relative_directory_path(project_folder)
        .to_string_lossy()
        .replace('\\', "/");
    let prefix = format!("{source_directory}/");
    relative
        .strip_prefix(&prefix)
        .map(|suffix| format!("{destination_directory}/{suffix}"))
        .unwrap_or_else(|| relative.to_string())
}

fn relative_display(vault_root: &Path, path: &Path) -> Result<String, ProjectMergeError> {
    path.strip_prefix(vault_root)
        .map(|relative| relative.to_string_lossy().replace('\\', "/"))
        .map_err(|_| {
            ProjectMergeError::new(
                ProjectMergeErrorCode::InvalidRequest,
                "Project merge path escaped vault.",
            )
        })
}

fn fingerprint(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn vault() -> (tempfile::TempDir, PathBuf) {
        let temp = tempdir().unwrap();
        let vault = temp.path().join("vault");
        fs::create_dir_all(vault.join("projects/old/api")).unwrap();
        fs::create_dir_all(vault.join("projects/new/api")).unwrap();
        (temp, vault)
    }

    #[test]
    fn plans_recursive_merge_with_markdown_and_file_conflicts() {
        let (_temp, vault) = vault();
        fs::write(vault.join("projects/old.md"), "- [ ] Source +old\n").unwrap();
        fs::write(vault.join("projects/new.md"), "- [ ] Destination +new\n").unwrap();
        fs::write(
            vault.join("projects/old/api.md"),
            "- [ ] Source API +old/api\n",
        )
        .unwrap();
        fs::write(
            vault.join("projects/new/api.md"),
            "- [ ] Destination API +new/api\n",
        )
        .unwrap();
        fs::write(vault.join("projects/old/api/config.json"), "source").unwrap();
        fs::write(vault.join("projects/new/api/config.json"), "destination").unwrap();

        let plan = plan_project_merge(&vault, "projects", "old", "new").unwrap();

        assert_eq!(plan.source_project, "old");
        assert_eq!(plan.destination_project, "new");
        assert_eq!(plan.conflicts.len(), 3);
        assert_eq!(
            plan.conflicts
                .iter()
                .filter(|conflict| conflict.kind == ProjectMergeEntryKind::Markdown)
                .count(),
            2
        );
        assert!(plan.conflicts.iter().any(|conflict| {
            conflict.source_preview.as_deref() == Some("- [ ] Source API +new/api\n")
        }));
        assert_eq!(plan.impact.rewritten_tokens, 2);
        assert_eq!(plan.collapsed_descendants, vec!["old/api"]);
    }

    #[test]
    fn moves_non_conflicting_entries_and_auto_resolves_identical_files() {
        let (_temp, vault) = vault();
        fs::write(
            vault.join("note.md"),
            "- [ ] Source +old\n- [ ] Destination +new\n",
        )
        .unwrap();
        fs::write(vault.join("projects/old/api/new.txt"), "move").unwrap();
        fs::write(vault.join("projects/old/api/same.bin"), b"same").unwrap();
        fs::write(vault.join("projects/new/api/same.bin"), b"same").unwrap();

        let first = plan_project_merge(&vault, "projects", "old", "new").unwrap();
        let second = plan_project_merge(&vault, "projects", "old", "new").unwrap();

        assert_eq!(first, second);
        assert_eq!(first.moves.len(), 1);
        assert_eq!(first.auto_resolutions.len(), 1);
        assert!(first.conflicts.is_empty());
    }

    #[test]
    fn keeps_ignored_conflicts_opaque() {
        let (_temp, vault) = vault();
        fs::write(
            vault.join("note.md"),
            "- [ ] Source +old\n- [ ] Destination +new\n",
        )
        .unwrap();
        fs::write(vault.join(".octarineignore"), "projects/*/api/secret.md\n").unwrap();
        fs::write(vault.join("projects/old/api/secret.md"), "source secret").unwrap();
        fs::write(
            vault.join("projects/new/api/secret.md"),
            "destination secret",
        )
        .unwrap();

        let plan = plan_project_merge(&vault, "projects", "old", "new").unwrap();
        let conflict = plan.conflicts.first().unwrap();

        assert_eq!(conflict.kind, ProjectMergeEntryKind::Ignored);
        assert!(conflict.source_preview.is_none());
        assert!(conflict.destination_preview.is_none());
    }

    #[cfg(unix)]
    #[test]
    fn plans_non_conflicting_ignored_file_without_reading_content() {
        use std::os::unix::fs::PermissionsExt;

        let (_temp, vault) = vault();
        fs::write(
            vault.join("note.md"),
            "- [ ] Source +old\n- [ ] Destination +new\n",
        )
        .unwrap();
        fs::write(
            vault.join(".octarineignore"),
            "projects/old/api/secret.bin\n",
        )
        .unwrap();
        let secret = vault.join("projects/old/api/secret.bin");
        fs::write(&secret, "secret bytes").unwrap();
        fs::set_permissions(&secret, fs::Permissions::from_mode(0o000)).unwrap();

        let plan = plan_project_merge(&vault, "projects", "old", "new").unwrap();

        assert!(plan.moves.iter().any(|movement| movement.source_path
            == "projects/old/api/secret.bin"
            && movement.ignored));
        fs::set_permissions(&secret, fs::Permissions::from_mode(0o600)).unwrap();
    }

    #[test]
    fn blocks_ancestor_and_descendant_merges() {
        let (_temp, vault) = vault();

        let error = plan_project_merge(&vault, "projects", "old", "old/api").unwrap_err();

        assert_eq!(error.code, ProjectMergeErrorCode::AncestorConflict);
    }

    #[cfg(unix)]
    #[test]
    fn blocks_symlinks_anywhere_in_merge_tree() {
        use std::os::unix::fs::symlink;

        let (temp, vault) = vault();
        fs::write(
            vault.join("note.md"),
            "- [ ] Source +old\n- [ ] Destination +new\n",
        )
        .unwrap();
        let outside = temp.path().join("outside.txt");
        fs::write(&outside, "outside").unwrap();
        symlink(&outside, vault.join("projects/old/api/link")).unwrap();

        let error = plan_project_merge(&vault, "projects", "old", "new").unwrap_err();

        assert_eq!(error.code, ProjectMergeErrorCode::SymlinkBlocked);
        assert_eq!(error.paths, vec!["projects/old/api/link"]);
    }

    #[test]
    fn classifies_file_directory_type_mismatch() {
        let (_temp, vault) = vault();
        fs::write(
            vault.join("note.md"),
            "- [ ] Source +old\n- [ ] Destination +new\n",
        )
        .unwrap();
        fs::write(vault.join("projects/old/api/logo"), "source").unwrap();
        fs::create_dir(vault.join("projects/new/api/logo")).unwrap();
        fs::write(vault.join("projects/new/api/logo/file.txt"), "destination").unwrap();

        let plan = plan_project_merge(&vault, "projects", "old", "new").unwrap();

        assert_eq!(plan.conflicts.len(), 1);
        assert_eq!(plan.conflicts[0].kind, ProjectMergeEntryKind::TypeMismatch);
        assert_eq!(
            plan.conflicts[0].destination_kind,
            ProjectMergePathKind::Directory
        );
    }

    #[test]
    fn prepares_non_conflicting_outputs_without_mutating_vault_and_cancels_cleanly() {
        let (_temp, vault) = vault();
        fs::write(
            vault.join("note.md"),
            "- [ ] Source +old\n- [ ] Destination +new\n",
        )
        .unwrap();
        fs::write(vault.join("projects/old/api/new.txt"), "move me").unwrap();

        let plan = plan_project_merge(&vault, "projects", "old", "new").unwrap();
        let source_before = fs::read(vault.join("projects/old/api/new.txt")).unwrap();
        let prepared = prepare_project_merge(&vault, &plan, &[]).unwrap();

        assert_eq!(
            fs::read(vault.join("projects/old/api/new.txt")).unwrap(),
            source_before
        );
        assert!(!vault.join("projects/new/api/new.txt").exists());
        assert_eq!(
            fs::read(
                vault
                    .join(".octarine/staging")
                    .join(&plan.operation_id)
                    .join("outputs/projects/new/api/new.txt")
            )
            .unwrap(),
            b"move me"
        );
        assert_eq!(prepared.entries.len(), 2);

        cancel_project_merge_staging(&vault, &plan.operation_id).unwrap();

        assert!(!vault
            .join(".octarine/staging")
            .join(&plan.operation_id)
            .exists());
        assert_eq!(
            fs::read(vault.join("projects/old/api/new.txt")).unwrap(),
            source_before
        );
    }

    #[test]
    fn cancelled_preparation_removes_staging_and_changes_no_project_data() {
        let (_temp, vault) = vault();
        fs::write(
            vault.join("note.md"),
            "- [ ] Source +old\n- [ ] Destination +new\n",
        )
        .unwrap();
        let source = vault.join("projects/old/api/new.txt");
        fs::write(&source, "move me").unwrap();
        let plan = plan_project_merge(&vault, "projects", "old", "new").unwrap();
        let stop = AtomicBool::new(true);

        let error = prepare_project_merge_with_stop(&vault, &plan, &[], &stop).unwrap_err();

        assert_eq!(error.code, ProjectMergeErrorCode::Cancelled);
        assert_eq!(fs::read_to_string(source).unwrap(), "move me");
        assert!(!vault
            .join(".octarine/staging")
            .join(plan.operation_id)
            .exists());
    }

    #[test]
    fn prepares_edited_markdown_and_redacts_result_from_manifest() {
        let (_temp, vault) = vault();
        fs::write(vault.join("projects/old.md"), "- [ ] Secret source +old\n").unwrap();
        fs::write(vault.join("projects/new.md"), "- [ ] Destination +new\n").unwrap();
        let plan = plan_project_merge(&vault, "projects", "old", "new").unwrap();
        let conflict = plan
            .conflicts
            .iter()
            .find(|conflict| conflict.kind == ProjectMergeEntryKind::Markdown)
            .unwrap();
        let result = default_markdown_merge_result(conflict).unwrap();
        let resolution = ProjectMergeResolution {
            conflict_id: conflict.id.clone(),
            action: ProjectMergeResolutionAction::Combine,
            result: Some(result.clone()),
            source_name: None,
        };

        let prepared = prepare_project_merge(&vault, &plan, &[resolution]).unwrap();
        let staged = fs::read_to_string(
            vault
                .join(&prepared.staging_path)
                .join("outputs/projects/new.md"),
        )
        .unwrap();
        let manifest =
            fs::read_to_string(vault.join(&prepared.staging_path).join("manifest.json")).unwrap();

        assert_eq!(staged, result);
        assert!(!manifest.contains("Secret source"));
        assert!(!manifest.contains("Destination +new"));
        assert_eq!(
            fs::read_to_string(vault.join("projects/old.md")).unwrap(),
            "- [ ] Secret source +old\n"
        );
    }

    #[test]
    fn blocks_unresolved_and_source_residue_in_markdown() {
        let (_temp, vault) = vault();
        fs::write(vault.join("projects/old.md"), "- [ ] Source +old\n").unwrap();
        fs::write(vault.join("projects/new.md"), "- [ ] Destination +new\n").unwrap();
        let plan = plan_project_merge(&vault, "projects", "old", "new").unwrap();
        let conflict = plan.conflicts.first().unwrap();

        let unresolved = prepare_project_merge(&vault, &plan, &[]).unwrap_err();
        assert_eq!(unresolved.code, ProjectMergeErrorCode::UnresolvedConflict);

        let invalid = prepare_project_merge(
            &vault,
            &plan,
            &[ProjectMergeResolution {
                conflict_id: conflict.id.clone(),
                action: ProjectMergeResolutionAction::Combine,
                result: Some("- [ ] Residue +old\n".to_string()),
                source_name: None,
            }],
        )
        .unwrap_err();
        assert_eq!(invalid.code, ProjectMergeErrorCode::InvalidResult);
    }

    #[test]
    fn rejects_unsafe_keep_both_filename() {
        let (_temp, vault) = vault();
        fs::write(
            vault.join("note.md"),
            "- [ ] Source +old\n- [ ] Destination +new\n",
        )
        .unwrap();
        fs::write(vault.join("projects/old/api/config.json"), "source").unwrap();
        fs::write(vault.join("projects/new/api/config.json"), "destination").unwrap();
        let plan = plan_project_merge(&vault, "projects", "old", "new").unwrap();
        let conflict = plan.conflicts.first().unwrap();

        let error = prepare_project_merge(
            &vault,
            &plan,
            &[ProjectMergeResolution {
                conflict_id: conflict.id.clone(),
                action: ProjectMergeResolutionAction::KeepBoth,
                result: None,
                source_name: Some("../escape.json".to_string()),
            }],
        )
        .unwrap_err();

        assert_eq!(error.code, ProjectMergeErrorCode::InvalidResolution);
        assert!(!vault.join("escape.json").exists());
    }

    #[cfg(unix)]
    #[test]
    fn staging_preserves_file_permissions() {
        use std::os::unix::fs::PermissionsExt;

        let (_temp, vault) = vault();
        fs::write(
            vault.join("note.md"),
            "- [ ] Source +old\n- [ ] Destination +new\n",
        )
        .unwrap();
        let source = vault.join("projects/old/api/tool.sh");
        fs::write(&source, "run").unwrap();
        fs::set_permissions(&source, fs::Permissions::from_mode(0o740)).unwrap();
        let plan = plan_project_merge(&vault, "projects", "old", "new").unwrap();
        let prepared = prepare_project_merge(&vault, &plan, &[]).unwrap();
        let staged = vault
            .join(prepared.staging_path)
            .join("outputs/projects/new/api/tool.sh");

        assert_eq!(
            fs::metadata(staged).unwrap().permissions().mode() & 0o777,
            0o740
        );
    }

    #[test]
    fn commits_destination_first_and_recovers_originals_before_source_removal() {
        let (_temp, vault) = vault();
        fs::write(
            vault.join("note.md"),
            "- [ ] Source +old\n- [ ] Destination +new\n",
        )
        .unwrap();
        fs::write(vault.join("projects/old/api/new.txt"), "move me").unwrap();
        let plan = plan_project_merge(&vault, "projects", "old", "new").unwrap();
        let prepared = prepare_project_merge(&vault, &plan, &[]).unwrap();

        let result = execute_prepared_project_merge(&vault, &plan, &prepared).unwrap();

        assert_eq!(
            fs::read_to_string(vault.join("note.md")).unwrap(),
            "- [ ] Source +new\n- [ ] Destination +new\n"
        );
        assert_eq!(
            fs::read_to_string(vault.join("projects/new/api/new.txt")).unwrap(),
            "move me"
        );
        assert!(!vault.join("projects/old/api/new.txt").exists());
        assert!(!vault.join("projects/old").exists());
        assert_eq!(
            fs::read_to_string(vault.join(&result.recovery_path).join("originals/note.md"))
                .unwrap(),
            "- [ ] Source +old\n- [ ] Destination +new\n"
        );
        assert_eq!(
            fs::read_to_string(
                vault
                    .join(&result.recovery_path)
                    .join("originals/projects/old/api/new.txt")
            )
            .unwrap(),
            "move me"
        );
        assert!(!vault.join(&prepared.staging_path).exists());
        let manifest =
            fs::read_to_string(vault.join(&result.recovery_path).join("manifest.json")).unwrap();
        assert!(manifest.contains("\"status\": \"successful\""));
    }

    #[test]
    fn use_destination_keeps_destination_and_recovers_source() {
        let (_temp, vault) = vault();
        fs::write(vault.join("projects/old.md"), "- [ ] Source +old\n").unwrap();
        fs::write(vault.join("projects/new.md"), "- [ ] Destination +new\n").unwrap();
        let plan = plan_project_merge(&vault, "projects", "old", "new").unwrap();
        let conflict = plan.conflicts.first().unwrap();
        let prepared = prepare_project_merge(
            &vault,
            &plan,
            &[ProjectMergeResolution {
                conflict_id: conflict.id.clone(),
                action: ProjectMergeResolutionAction::UseDestination,
                result: None,
                source_name: None,
            }],
        )
        .unwrap();

        let result = execute_prepared_project_merge(&vault, &plan, &prepared).unwrap();

        assert_eq!(
            fs::read_to_string(vault.join("projects/new.md")).unwrap(),
            "- [ ] Destination +new\n"
        );
        assert!(!vault.join("projects/old.md").exists());
        assert_eq!(
            fs::read_to_string(
                vault
                    .join(result.recovery_path)
                    .join("originals/projects/old.md")
            )
            .unwrap(),
            "- [ ] Source +old\n"
        );
    }

    #[test]
    fn stale_commit_changes_no_project_data_and_retains_staging() {
        let (_temp, vault) = vault();
        fs::write(
            vault.join("note.md"),
            "- [ ] Source +old\n- [ ] Destination +new\n",
        )
        .unwrap();
        fs::write(vault.join("projects/old/api/new.txt"), "move me").unwrap();
        let plan = plan_project_merge(&vault, "projects", "old", "new").unwrap();
        let prepared = prepare_project_merge(&vault, &plan, &[]).unwrap();
        fs::write(vault.join("note.md"), "external edit\n").unwrap();

        let error = execute_prepared_project_merge(&vault, &plan, &prepared).unwrap_err();

        assert_eq!(error.code, ProjectMergeErrorCode::StalePlan);
        assert_eq!(
            fs::read_to_string(vault.join("note.md")).unwrap(),
            "external edit\n"
        );
        assert_eq!(
            fs::read_to_string(vault.join("projects/old/api/new.txt")).unwrap(),
            "move me"
        );
        assert!(vault.join(&prepared.staging_path).exists());
        assert!(!vault
            .join(".octarine/recovery")
            .join(&plan.operation_id)
            .exists());
    }

    #[test]
    fn safe_stop_occurs_between_atomic_operations_and_keeps_recovery() {
        let (_temp, vault) = vault();
        fs::write(
            vault.join("note.md"),
            "- [ ] Source +old\n- [ ] Destination +new\n",
        )
        .unwrap();
        fs::write(vault.join("projects/old/api/new.txt"), "move me").unwrap();
        let plan = plan_project_merge(&vault, "projects", "old", "new").unwrap();
        let prepared = prepare_project_merge(&vault, &plan, &[]).unwrap();

        let error =
            execute_prepared_project_merge_with_hook(&vault, None, &plan, &prepared, |operation| {
                operation < 1
            })
            .unwrap_err();

        assert_eq!(error.code, ProjectMergeErrorCode::PartialFailure);
        let recovery = error.recovery.unwrap();
        assert_eq!(recovery.completed_operations.len(), 1);
        assert!(!recovery.pending_operations.is_empty());
        assert!(vault.join(recovery.recovery_path).exists());
        assert!(vault.join(&prepared.staging_path).exists());
        assert_eq!(
            fs::read_to_string(vault.join("projects/old/api/new.txt")).unwrap(),
            "move me"
        );
    }

    #[test]
    fn lists_and_expires_only_successful_recovery_after_thirty_days() {
        let (_temp, vault) = vault();
        fs::write(
            vault.join("note.md"),
            "- [ ] Source +old\n- [ ] Destination +new\n",
        )
        .unwrap();
        let source = vault.join("projects/old/api/new.txt");
        fs::write(&source, "move me").unwrap();
        let plan = plan_project_merge(&vault, "projects", "old", "new").unwrap();
        let prepared = prepare_project_merge(&vault, &plan, &[]).unwrap();
        let result = execute_prepared_project_merge(&vault, &plan, &prepared).unwrap();
        let recovery = vault.join(&result.recovery_path);

        let bundles = list_project_merge_recovery(&vault).unwrap();
        assert_eq!(bundles.len(), 1);
        assert_eq!(bundles[0].status, ProjectMergeRecoveryStatus::Successful);
        assert!(bundles[0].size_bytes > 0);

        let mut manifest = read_recovery_manifest(&recovery).unwrap();
        let now = chrono::Utc::now();
        manifest.expires_at = Some((now - chrono::Duration::seconds(1)).to_rfc3339());
        write_recovery_manifest(&recovery, &manifest).unwrap();
        let cleanup = cleanup_project_merge_recovery_at(&vault, now).unwrap();

        assert_eq!(cleanup.deleted_operation_ids, vec![plan.operation_id]);
        assert!(!recovery.exists());
    }

    #[test]
    fn cleanup_retains_stopped_and_malformed_recovery_bundles() {
        let (_temp, vault) = vault();
        fs::write(
            vault.join("note.md"),
            "- [ ] Source +old\n- [ ] Destination +new\n",
        )
        .unwrap();
        fs::write(vault.join("projects/old/api/new.txt"), "move me").unwrap();
        let plan = plan_project_merge(&vault, "projects", "old", "new").unwrap();
        let prepared = prepare_project_merge(&vault, &plan, &[]).unwrap();
        let stopped =
            execute_prepared_project_merge_with_hook(&vault, None, &plan, &prepared, |operation| {
                operation < 1
            })
            .unwrap_err();
        let stopped_recovery = stopped.recovery.unwrap();
        let malformed_id = "0123456789abcdef01234567";
        let malformed = vault.join(".octarine/recovery").join(malformed_id);
        fs::create_dir_all(&malformed).unwrap();
        fs::write(malformed.join("manifest.json"), "not json").unwrap();

        let cleanup = cleanup_project_merge_recovery_at(
            &vault,
            chrono::Utc::now() + chrono::Duration::days(365),
        )
        .unwrap();

        assert!(cleanup.retained_operation_ids.contains(&plan.operation_id));
        assert!(cleanup
            .retained_operation_ids
            .contains(&malformed_id.to_string()));
        assert!(vault.join(stopped_recovery.recovery_path).exists());
        assert!(malformed.exists());
    }

    #[test]
    fn recovery_delete_rejects_path_escape() {
        let (_temp, vault) = vault();
        let outside = vault.parent().unwrap().join("outside");
        fs::create_dir(&outside).unwrap();

        let error = delete_project_merge_recovery(&vault, "../../outside").unwrap_err();

        assert_eq!(error.code, ProjectMergeErrorCode::InvalidRequest);
        assert!(outside.exists());

        let open_error = project_merge_recovery_path(&vault, "../../outside").unwrap_err();
        assert_eq!(open_error.code, ProjectMergeErrorCode::InvalidRequest);
    }
}
