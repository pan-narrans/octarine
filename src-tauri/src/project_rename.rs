use crate::db::{delete_file, index_files};
use crate::file_ops::write_file_content_on_disk;
use crate::parser::{parse_markdown_content, rewrite_project_tokens};
use crate::path_security::resolve_descendant_within;
use crate::project::ProjectPath;
use crate::vault_ignore::VaultPathFilter;
use rusqlite::Connection;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use unicase::UniCase;
use unicode_normalization::UnicodeNormalization;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ts_rs::TS)]
#[serde(rename_all = "snake_case")]
pub enum ProjectRenameMoveKind {
    ProjectFile,
    DescendantDirectory,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRenameMove {
    pub kind: ProjectRenameMoveKind,
    pub source_path: String,
    pub destination_path: String,
    pub source_fingerprint: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRenameRewrite {
    pub path: String,
    pub source_fingerprint: String,
    pub replacement_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRenameIndexUpdate {
    pub source_path: String,
    pub destination_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ts_rs::TS)]
#[serde(rename_all = "snake_case")]
pub enum ProjectRenameCollisionCode {
    DestinationExists,
    ProjectIdentity,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRenameCollision {
    pub code: ProjectRenameCollisionCode,
    pub path: Option<String>,
    pub project: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRenameImpact {
    pub rewritten_files: usize,
    pub rewritten_tokens: usize,
    pub filesystem_moves: usize,
    pub descendant_projects: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRenamePlan {
    pub plan_token: String,
    pub source_project: String,
    pub destination_project: String,
    pub case_only: bool,
    pub rewrites: Vec<ProjectRenameRewrite>,
    pub moves: Vec<ProjectRenameMove>,
    pub index_updates: Vec<ProjectRenameIndexUpdate>,
    pub collisions: Vec<ProjectRenameCollision>,
    pub impact: ProjectRenameImpact,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ts_rs::TS)]
#[serde(rename_all = "snake_case")]
pub enum ProjectRenameErrorCode {
    InvalidRequest,
    Collision,
    UnknownPlan,
    StalePlan,
    Busy,
    OperationFailed,
    PartialFailure,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRenameRecoveryReport {
    pub completed_operations: Vec<String>,
    pub pending_operations: Vec<String>,
    pub inspect_paths: Vec<String>,
    pub guidance: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRenameError {
    pub code: ProjectRenameErrorCode,
    pub message: String,
    pub recovery: Option<Box<ProjectRenameRecoveryReport>>,
}

impl ProjectRenameError {
    pub fn new(code: ProjectRenameErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            recovery: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRenameResult {
    pub plan_token: String,
    pub completed_operations: Vec<String>,
    pub rewritten_files: usize,
    pub rewritten_tokens: usize,
    pub moved_paths: usize,
}

pub fn plan_project_rename(
    vault_root: &Path,
    project_folder: &str,
    source_project: &str,
    destination_project: &str,
) -> Result<ProjectRenamePlan, String> {
    let vault_root = vault_root
        .canonicalize()
        .map_err(|error| format!("Failed to resolve vault: {error}"))?;
    let source = ProjectPath::parse(source_project).map_err(|error| error.to_string())?;
    let destination = ProjectPath::parse(destination_project).map_err(|error| error.to_string())?;
    if source.display() == destination.display() {
        return Err("Source and destination projects are identical.".to_string());
    }

    let filter = VaultPathFilter::load(&vault_root)?;
    let markdown_paths = discover_markdown_files(&vault_root, &filter)?;
    let mut rewrites = Vec::new();
    let mut unaffected_projects = BTreeMap::<String, String>::new();
    let mut renamed_projects = BTreeMap::<String, String>::new();

    for path in &markdown_paths {
        let content = fs::read_to_string(path)
            .map_err(|error| format!("Failed to read rename source: {error}"))?;
        let relative = relative_display(&vault_root, path)?;
        let (tasks, _) = parse_markdown_content(&relative, &content);
        for task in tasks {
            let Some(value) = task.project else {
                continue;
            };
            let Ok(project) = ProjectPath::parse(&value) else {
                continue;
            };
            if let Some(renamed) = project.renamed_descendant(&source, &destination) {
                let parsed = ProjectPath::parse(&renamed).map_err(|error| error.to_string())?;
                renamed_projects
                    .insert(parsed.identity().to_string(), parsed.display().to_string());
            } else {
                unaffected_projects
                    .entry(project.identity().to_string())
                    .or_insert_with(|| project.display().to_string());
            }
        }

        let (_, replacement_count) = rewrite_project_tokens(&content, &source, &destination);
        if replacement_count > 0 {
            rewrites.push(ProjectRenameRewrite {
                path: relative,
                source_fingerprint: fingerprint(content.as_bytes()),
                replacement_count,
            });
        }
    }

    let mut collisions = Vec::new();
    for (identity, renamed) in &renamed_projects {
        if let Some(existing) = unaffected_projects.get(identity) {
            collisions.push(ProjectRenameCollision {
                code: ProjectRenameCollisionCode::ProjectIdentity,
                path: None,
                project: Some(existing.clone()),
                message: format!(
                    "Renamed project '{renamed}' conflicts with existing project '{existing}'."
                ),
            });
        }
    }

    let source_file = resolve_descendant_within(
        &vault_root,
        source.relative_file_path(project_folder),
        false,
    )?;
    let destination_file = resolve_descendant_within(
        &vault_root,
        destination.relative_file_path(project_folder),
        false,
    )?;
    let source_directory = resolve_descendant_within(
        &vault_root,
        source.relative_directory_path(project_folder),
        false,
    )?;
    let destination_directory = resolve_descendant_within(
        &vault_root,
        destination.relative_directory_path(project_folder),
        false,
    )?;

    let mut moves = Vec::new();
    add_move_if_present(
        &vault_root,
        &source_file,
        &destination_file,
        ProjectRenameMoveKind::ProjectFile,
        &mut moves,
        &mut collisions,
    )?;
    add_move_if_present(
        &vault_root,
        &source_directory,
        &destination_directory,
        ProjectRenameMoveKind::DescendantDirectory,
        &mut moves,
        &mut collisions,
    )?;

    rewrites.sort_by(|left, right| left.path.cmp(&right.path));
    moves.sort_by(|left, right| left.source_path.cmp(&right.source_path));
    collisions.sort_by(|left, right| {
        (&left.path, &left.project, &left.message).cmp(&(
            &right.path,
            &right.project,
            &right.message,
        ))
    });
    collisions.dedup();

    if rewrites.is_empty() && moves.is_empty() {
        return Err(
            "Source project was not found in task metadata or project storage.".to_string(),
        );
    }

    let descendant_projects = renamed_projects
        .values()
        .filter(|project| project.as_str() != destination.display())
        .collect::<BTreeSet<_>>()
        .len();
    let index_updates = markdown_paths
        .iter()
        .map(|path| relative_display(&vault_root, path))
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .filter_map(|source_path| {
            translated_path(&source_path, &moves).map(|destination_path| ProjectRenameIndexUpdate {
                source_path,
                destination_path,
            })
        })
        .collect();
    let impact = ProjectRenameImpact {
        rewritten_files: rewrites.len(),
        rewritten_tokens: rewrites
            .iter()
            .map(|rewrite| rewrite.replacement_count)
            .sum(),
        filesystem_moves: moves.len(),
        descendant_projects,
    };
    let mut plan = ProjectRenamePlan {
        plan_token: String::new(),
        source_project: source.display().to_string(),
        destination_project: destination.display().to_string(),
        case_only: source.identity() == destination.identity(),
        rewrites,
        moves,
        index_updates,
        collisions,
        impact,
        warnings: vec![
            "Markdown links are not updated by project rename.".to_string(),
            "Ignored paths moved with a project directory may require updated .octarineignore rules."
                .to_string(),
        ],
    };
    let serialized = serde_json::to_vec(&plan)
        .map_err(|error| format!("Failed to serialize rename plan: {error}"))?;
    plan.plan_token = fingerprint(&serialized);
    Ok(plan)
}

pub fn execute_project_rename_plan(
    vault_root: &Path,
    connection: &Connection,
    plan: &ProjectRenamePlan,
) -> Result<ProjectRenameResult, ProjectRenameError> {
    execute_project_rename_plan_with_hook(vault_root, connection, plan, |_| Ok(()))
}

fn execute_project_rename_plan_with_hook<F>(
    vault_root: &Path,
    connection: &Connection,
    plan: &ProjectRenamePlan,
    mut before_mutation: F,
) -> Result<ProjectRenameResult, ProjectRenameError>
where
    F: FnMut(usize) -> Result<(), ()>,
{
    if !plan.collisions.is_empty() {
        return Err(ProjectRenameError::new(
            ProjectRenameErrorCode::Collision,
            "Project rename has unresolved collisions.",
        ));
    }
    let vault_root = vault_root.canonicalize().map_err(|_| {
        ProjectRenameError::new(
            ProjectRenameErrorCode::OperationFailed,
            "Vault could not be resolved for project rename.",
        )
    })?;
    let old = ProjectPath::parse(&plan.source_project).map_err(|_| {
        ProjectRenameError::new(
            ProjectRenameErrorCode::InvalidRequest,
            "Source project is invalid.",
        )
    })?;
    let new = ProjectPath::parse(&plan.destination_project).map_err(|_| {
        ProjectRenameError::new(
            ProjectRenameErrorCode::InvalidRequest,
            "Destination project is invalid.",
        )
    })?;

    validate_plan_sources(&vault_root, plan)?;
    let pending = planned_operation_descriptions(plan);
    let mut completed = Vec::new();
    let mut mutation_index = 0;

    for operation in &plan.moves {
        let destination =
            resolve_descendant_within(&vault_root, Path::new(&operation.destination_path), false)
                .map_err(|_| {
                execution_error(plan, &completed, &pending, "Destination path is invalid.")
            })?;
        let Some(parent) = destination.parent() else {
            return Err(execution_error(
                plan,
                &completed,
                &pending,
                "Destination parent is invalid.",
            ));
        };
        if !parent.exists() {
            before_mutation(mutation_index).map_err(|_| {
                execution_error(
                    plan,
                    &completed,
                    &pending,
                    "Project rename was interrupted.",
                )
            })?;
            mutation_index += 1;
            fs::create_dir_all(parent).map_err(|_| {
                execution_error(
                    plan,
                    &completed,
                    &pending,
                    "Destination folder could not be created.",
                )
            })?;
            completed.push(format!(
                "Created destination folder {}",
                relative_display(&vault_root, parent)
                    .unwrap_or_else(|_| parent.display().to_string())
            ));
        }
    }

    for rewrite in &plan.rewrites {
        let path = resolve_descendant_within(&vault_root, Path::new(&rewrite.path), true).map_err(
            |_| execution_error(plan, &completed, &pending, "Rewrite source is missing."),
        )?;
        let content = fs::read_to_string(&path).map_err(|_| {
            execution_error(
                plan,
                &completed,
                &pending,
                "Rewrite source could not be read.",
            )
        })?;
        let (updated, count) = rewrite_project_tokens(&content, &old, &new);
        if count != rewrite.replacement_count {
            return Err(execution_error(
                plan,
                &completed,
                &pending,
                "Project rename plan became stale.",
            ));
        }
        before_mutation(mutation_index).map_err(|_| {
            execution_error(
                plan,
                &completed,
                &pending,
                "Project rename was interrupted.",
            )
        })?;
        mutation_index += 1;
        write_file_content_on_disk(&path.to_string_lossy(), &updated).map_err(|_| {
            execution_error(
                plan,
                &completed,
                &pending,
                "Task source could not be rewritten.",
            )
        })?;
        completed.push(format!("Rewrite task metadata in {}", rewrite.path));
    }

    for operation in &plan.moves {
        let source =
            resolve_descendant_within(&vault_root, Path::new(&operation.source_path), true)
                .map_err(|_| {
                    execution_error(plan, &completed, &pending, "Move source is missing.")
                })?;
        let destination =
            resolve_descendant_within(&vault_root, Path::new(&operation.destination_path), false)
                .map_err(|_| {
                execution_error(plan, &completed, &pending, "Move destination is invalid.")
            })?;
        before_mutation(mutation_index).map_err(|_| {
            execution_error(
                plan,
                &completed,
                &pending,
                "Project rename was interrupted.",
            )
        })?;
        mutation_index += 1;
        rename_path_safely(&source, &destination, plan.case_only, &plan.plan_token).map_err(
            |_| {
                execution_error(
                    plan,
                    &completed,
                    &pending,
                    "Project path could not be renamed.",
                )
            },
        )?;
        completed.push(format!(
            "Move {} to {}",
            operation.source_path, operation.destination_path
        ));
    }

    let mut final_index_paths = BTreeSet::new();
    for rewrite in &plan.rewrites {
        final_index_paths.insert(
            translated_path(&rewrite.path, &plan.moves).unwrap_or_else(|| rewrite.path.clone()),
        );
    }
    for update in &plan.index_updates {
        delete_file(
            connection,
            &vault_root.join(&update.source_path).to_string_lossy(),
        )
        .map_err(|_| {
            execution_error(
                plan,
                &completed,
                &pending,
                "Old index entry could not be removed.",
            )
        })?;
        final_index_paths.insert(update.destination_path.clone());
    }
    let final_index_paths = final_index_paths.into_iter().collect::<Vec<_>>();
    let absolute_index_paths = final_index_paths
        .iter()
        .map(|relative| vault_root.join(relative).to_string_lossy().to_string())
        .collect::<Vec<_>>();
    index_files(connection, &absolute_index_paths).map_err(|_| {
        execution_error(
            plan,
            &completed,
            &pending,
            "Renamed files could not be reindexed.",
        )
    })?;
    for relative in final_index_paths {
        completed.push(format!("Reindexed {relative}"));
    }

    Ok(ProjectRenameResult {
        plan_token: plan.plan_token.clone(),
        completed_operations: completed,
        rewritten_files: plan.impact.rewritten_files,
        rewritten_tokens: plan.impact.rewritten_tokens,
        moved_paths: plan.impact.filesystem_moves,
    })
}

fn validate_plan_sources(
    vault_root: &Path,
    plan: &ProjectRenamePlan,
) -> Result<(), ProjectRenameError> {
    for rewrite in &plan.rewrites {
        let path = resolve_descendant_within(vault_root, Path::new(&rewrite.path), true).map_err(
            |_| {
                ProjectRenameError::new(
                    ProjectRenameErrorCode::StalePlan,
                    "Project rename plan is stale. Run preflight again.",
                )
            },
        )?;
        let content = fs::read(&path).map_err(|_| {
            ProjectRenameError::new(
                ProjectRenameErrorCode::StalePlan,
                "Project rename plan is stale. Run preflight again.",
            )
        })?;
        if fingerprint(&content) != rewrite.source_fingerprint {
            return Err(ProjectRenameError::new(
                ProjectRenameErrorCode::StalePlan,
                "Project rename plan is stale. Run preflight again.",
            ));
        }
    }
    for operation in &plan.moves {
        let source = resolve_descendant_within(vault_root, Path::new(&operation.source_path), true)
            .map_err(|_| {
                ProjectRenameError::new(
                    ProjectRenameErrorCode::StalePlan,
                    "Project rename plan is stale. Run preflight again.",
                )
            })?;
        if fingerprint_path(&source).map_err(|_| {
            ProjectRenameError::new(
                ProjectRenameErrorCode::StalePlan,
                "Project rename plan is stale. Run preflight again.",
            )
        })? != operation.source_fingerprint
        {
            return Err(ProjectRenameError::new(
                ProjectRenameErrorCode::StalePlan,
                "Project rename plan is stale. Run preflight again.",
            ));
        }
    }
    Ok(())
}

fn rename_path_safely(
    source: &Path,
    destination: &Path,
    case_only: bool,
    plan_token: &str,
) -> Result<(), String> {
    if !case_only && destination.exists() {
        return Err("Destination exists.".to_string());
    }
    if !case_only {
        return fs::rename(source, destination).map_err(|error| error.to_string());
    }

    let parent = source
        .parent()
        .ok_or_else(|| "Rename source has no parent.".to_string())?;
    let mut temporary = parent.join(format!(".octarine-rename-{}", &plan_token[..12]));
    let mut suffix = 0;
    while temporary.exists() {
        suffix += 1;
        temporary = parent.join(format!(".octarine-rename-{}-{suffix}", &plan_token[..12]));
    }
    fs::rename(source, &temporary).map_err(|error| error.to_string())?;
    if let Err(error) = fs::rename(&temporary, destination) {
        let _ = fs::rename(&temporary, source);
        return Err(error.to_string());
    }
    Ok(())
}

fn planned_operation_descriptions(plan: &ProjectRenamePlan) -> Vec<String> {
    plan.rewrites
        .iter()
        .map(|rewrite| format!("Rewrite task metadata in {}", rewrite.path))
        .chain(plan.moves.iter().map(|operation| {
            format!(
                "Move {} to {}",
                operation.source_path, operation.destination_path
            )
        }))
        .collect()
}

fn execution_error(
    plan: &ProjectRenamePlan,
    completed: &[String],
    pending: &[String],
    message: &str,
) -> ProjectRenameError {
    if completed.is_empty() {
        return ProjectRenameError::new(ProjectRenameErrorCode::OperationFailed, message);
    }
    let completed_set = completed.iter().cloned().collect::<BTreeSet<_>>();
    let pending_operations = pending
        .iter()
        .filter(|operation| !completed_set.contains(*operation))
        .cloned()
        .collect();
    let inspect_paths = plan
        .rewrites
        .iter()
        .map(|rewrite| rewrite.path.clone())
        .chain(plan.moves.iter().flat_map(|operation| {
            [
                operation.source_path.clone(),
                operation.destination_path.clone(),
            ]
        }))
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    ProjectRenameError {
        code: ProjectRenameErrorCode::PartialFailure,
        message: "Project rename stopped after changing some files.".to_string(),
        recovery: Some(Box::new(ProjectRenameRecoveryReport {
            completed_operations: completed.to_vec(),
            pending_operations,
            inspect_paths,
            guidance: "Refresh vault, inspect listed paths, then run rename preflight again. Files are not moved back automatically.".to_string(),
        })),
    }
}

fn translated_path(source_path: &str, moves: &[ProjectRenameMove]) -> Option<String> {
    for operation in moves {
        match operation.kind {
            ProjectRenameMoveKind::ProjectFile if source_path == operation.source_path => {
                return Some(operation.destination_path.clone());
            }
            ProjectRenameMoveKind::DescendantDirectory => {
                let prefix = format!("{}/", operation.source_path);
                if let Some(suffix) = source_path.strip_prefix(&prefix) {
                    return Some(format!("{}/{suffix}", operation.destination_path));
                }
            }
            ProjectRenameMoveKind::ProjectFile => {}
        }
    }
    None
}

fn discover_markdown_files(
    vault_root: &Path,
    filter: &VaultPathFilter,
) -> Result<Vec<PathBuf>, String> {
    let mut pending = vec![vault_root.to_path_buf()];
    let mut files = Vec::new();
    while let Some(directory) = pending.pop() {
        let mut entries = fs::read_dir(&directory)
            .map_err(|error| format!("Failed to inspect vault for project rename: {error}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("Failed to inspect vault for project rename: {error}"))?;
        entries.sort_by_key(|entry| entry.file_name());
        for entry in entries.into_iter().rev() {
            let path = entry.path();
            let metadata = fs::symlink_metadata(&path)
                .map_err(|error| format!("Failed to inspect vault entry: {error}"))?;
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

fn add_move_if_present(
    vault_root: &Path,
    source: &Path,
    destination: &Path,
    kind: ProjectRenameMoveKind,
    moves: &mut Vec<ProjectRenameMove>,
    collisions: &mut Vec<ProjectRenameCollision>,
) -> Result<(), String> {
    let Ok(source_metadata) = fs::symlink_metadata(source) else {
        return Ok(());
    };
    if source_metadata.file_type().is_symlink()
        || matches!(kind, ProjectRenameMoveKind::ProjectFile) && !source_metadata.is_file()
        || matches!(kind, ProjectRenameMoveKind::DescendantDirectory) && !source_metadata.is_dir()
    {
        return Err("Project rename source has unsupported filesystem type.".to_string());
    }

    let same_casefold_path = folded_path(source) == folded_path(destination);
    if !same_casefold_path && destination.exists() {
        collisions.push(destination_collision(vault_root, destination)?);
    } else if let Some(existing) = casefold_sibling(destination)? {
        if folded_path(&existing) != folded_path(source) {
            collisions.push(destination_collision(vault_root, &existing)?);
        }
    }

    moves.push(ProjectRenameMove {
        kind,
        source_path: relative_display(vault_root, source)?,
        destination_path: relative_display(vault_root, destination)?,
        source_fingerprint: fingerprint_path(source)?,
    });
    Ok(())
}

fn destination_collision(
    vault_root: &Path,
    destination: &Path,
) -> Result<ProjectRenameCollision, String> {
    let path = relative_display(vault_root, destination)?;
    Ok(ProjectRenameCollision {
        code: ProjectRenameCollisionCode::DestinationExists,
        path: Some(path.clone()),
        project: None,
        message: format!("Destination '{path}' already exists."),
    })
}

fn casefold_sibling(path: &Path) -> Result<Option<PathBuf>, String> {
    let Some(parent) = path.parent() else {
        return Ok(None);
    };
    if !parent.is_dir() {
        return Ok(None);
    }
    let Some(desired_name) = path.file_name() else {
        return Ok(None);
    };
    let desired = folded_component(&desired_name.to_string_lossy());
    for entry in fs::read_dir(parent)
        .map_err(|error| format!("Failed to inspect rename destination: {error}"))?
    {
        let entry =
            entry.map_err(|error| format!("Failed to inspect rename destination: {error}"))?;
        if folded_component(&entry.file_name().to_string_lossy()) == desired {
            return Ok(Some(entry.path()));
        }
    }
    Ok(None)
}

fn relative_display(vault_root: &Path, path: &Path) -> Result<String, String> {
    path.strip_prefix(vault_root)
        .map(|relative| relative.to_string_lossy().replace('\\', "/"))
        .map_err(|_| "Project rename path escaped vault.".to_string())
}

fn fingerprint(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

fn fingerprint_path(path: &Path) -> Result<String, String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("Failed to fingerprint rename source: {error}"))?;
    if metadata.is_file() {
        return fs::read(path)
            .map(|bytes| fingerprint(&bytes))
            .map_err(|error| format!("Failed to fingerprint rename source: {error}"));
    }

    let mut entries = Vec::new();
    let mut pending = vec![path.to_path_buf()];
    while let Some(directory) = pending.pop() {
        let mut children = fs::read_dir(&directory)
            .map_err(|error| format!("Failed to fingerprint rename directory: {error}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("Failed to fingerprint rename directory: {error}"))?;
        children.sort_by_key(|entry| entry.file_name());
        for child in children.into_iter().rev() {
            let child_path = child.path();
            let child_metadata = fs::symlink_metadata(&child_path)
                .map_err(|error| format!("Failed to fingerprint rename entry: {error}"))?;
            let relative = child_path
                .strip_prefix(path)
                .map_err(|_| "Rename directory fingerprint escaped source.".to_string())?;
            let kind = if child_metadata.file_type().is_symlink() {
                "symlink"
            } else if child_metadata.is_dir() {
                "directory"
            } else {
                "file"
            };
            entries.push(format!(
                "{}\0{}\0{}\0{:?}",
                relative.to_string_lossy(),
                kind,
                child_metadata.len(),
                child_metadata.modified().ok()
            ));
            if child_metadata.is_dir() && !child_metadata.file_type().is_symlink() {
                pending.push(child_path);
            }
        }
    }
    entries.sort();
    Ok(fingerprint(entries.join("\n").as_bytes()))
}

fn folded_component(value: &str) -> String {
    let normalized: String = value.nfc().collect();
    UniCase::unicode(normalized)
        .to_folded_case()
        .nfc()
        .collect()
}

fn folded_path(path: &Path) -> String {
    folded_component(&path.to_string_lossy())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn vault() -> (tempfile::TempDir, PathBuf) {
        let temp = tempdir().unwrap();
        let vault = temp.path().join("vault");
        fs::create_dir_all(vault.join("projects/work")).unwrap();
        (temp, vault)
    }

    #[test]
    fn plans_exact_descendant_file_and_directory_deterministically() {
        let (_temp, vault) = vault();
        fs::write(vault.join("projects/work.md"), "- [ ] Root +work\n").unwrap();
        fs::write(
            vault.join("projects/work/client.md"),
            "- [ ] Client +work/client\n- [ ] Lookalike +workshop\n",
        )
        .unwrap();
        fs::write(vault.join("projects/work/readme.txt"), "opaque").unwrap();

        let first = plan_project_rename(&vault, "projects", "work", "job").unwrap();
        let second = plan_project_rename(&vault, "projects", "work", "job").unwrap();

        assert_eq!(first, second);
        assert_eq!(first.impact.rewritten_files, 2);
        assert_eq!(first.impact.rewritten_tokens, 2);
        assert_eq!(first.impact.descendant_projects, 1);
        assert_eq!(first.moves.len(), 2);
        assert_eq!(first.index_updates.len(), 2);
        assert!(first.collisions.is_empty());
    }

    #[test]
    fn excludes_ignored_content_but_keeps_opaque_directory_move() {
        let (_temp, vault) = vault();
        fs::write(vault.join(".octarineignore"), "projects/work/ignored.md\n").unwrap();
        fs::write(
            vault.join("projects/work/ignored.md"),
            "- [ ] Hidden +work\n",
        )
        .unwrap();

        let plan = plan_project_rename(&vault, "projects", "work", "job").unwrap();

        assert!(plan.rewrites.is_empty());
        assert_eq!(plan.moves.len(), 1);
        assert_eq!(
            plan.moves[0].kind,
            ProjectRenameMoveKind::DescendantDirectory
        );
    }

    #[test]
    fn reports_filesystem_and_project_identity_collisions() {
        let (_temp, vault) = vault();
        fs::write(vault.join("projects/work.md"), "- [ ] Root +work\n").unwrap();
        fs::write(vault.join("projects/job.md"), "- [ ] Existing +job\n").unwrap();

        let plan = plan_project_rename(&vault, "projects", "work", "job").unwrap();

        assert!(plan
            .collisions
            .iter()
            .any(|collision| collision.code == ProjectRenameCollisionCode::DestinationExists));
        assert!(plan
            .collisions
            .iter()
            .any(|collision| collision.code == ProjectRenameCollisionCode::ProjectIdentity));
    }

    #[test]
    fn allows_case_only_rename_of_same_sources() {
        let (_temp, vault) = vault();
        fs::write(vault.join("projects/work.md"), "- [ ] Root +work\n").unwrap();

        let plan = plan_project_rename(&vault, "projects", "work", "Work").unwrap();

        assert!(plan.case_only);
        assert!(plan.collisions.is_empty());
        assert_eq!(plan.moves.len(), 2);
    }

    #[test]
    fn rejects_missing_source_project() {
        let (_temp, vault) = vault();

        assert_eq!(
            plan_project_rename(&vault, "projects", "missing", "new").unwrap_err(),
            "Source project was not found in task metadata or project storage."
        );
    }

    fn database(temp: &tempfile::TempDir) -> Connection {
        crate::db::initialize_db(temp.path().join("cache.sqlite3")).unwrap()
    }

    #[test]
    fn executes_rewrites_moves_and_index_reconciliation() {
        let (temp, vault) = vault();
        fs::write(vault.join(".octarineignore"), "projects/work/ignored.md\n").unwrap();
        fs::write(
            vault.join("projects/work.md"),
            "- [ ] Root +work [old link](projects/work.md)\n",
        )
        .unwrap();
        fs::write(
            vault.join("projects/work/client.md"),
            "- [ ] Client +work/client\n",
        )
        .unwrap();
        fs::write(
            vault.join("projects/work/ignored.md"),
            "- [ ] Hidden +work\n",
        )
        .unwrap();
        fs::write(vault.join("projects/work/ordinary.txt"), "unchanged\n").unwrap();
        let connection = database(&temp);
        let plan = plan_project_rename(&vault, "projects", "work", "job").unwrap();

        let result = execute_project_rename_plan(&vault, &connection, &plan).unwrap();

        assert_eq!(result.moved_paths, 2);
        assert!(!vault.join("projects/work.md").exists());
        assert!(!vault.join("projects/work").exists());
        assert_eq!(
            fs::read_to_string(vault.join("projects/job.md")).unwrap(),
            "- [ ] Root +job [old link](projects/work.md)\n"
        );
        assert_eq!(
            fs::read_to_string(vault.join("projects/job/client.md")).unwrap(),
            "- [ ] Client +job/client\n"
        );
        assert_eq!(
            fs::read_to_string(vault.join("projects/job/ignored.md")).unwrap(),
            "- [ ] Hidden +work\n"
        );
        assert_eq!(
            fs::read_to_string(vault.join("projects/job/ordinary.txt")).unwrap(),
            "unchanged\n"
        );

        drop(connection);
        let reopened = database(&temp);
        crate::db::boot_sweep(&reopened, &vault).unwrap();
        let old_count: i64 = reopened
            .query_row(
                "SELECT COUNT(*) FROM tasks WHERE project = 'work'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let renamed_count: i64 = reopened
            .query_row(
                "SELECT COUNT(*) FROM tasks WHERE project = 'job'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(old_count, 1);
        assert_eq!(renamed_count, 1);

        fs::write(vault.join(".octarineignore"), "projects/job/ignored.md\n").unwrap();
        crate::db::boot_sweep(&reopened, &vault).unwrap();
        let old_count_after_ignore_update: i64 = reopened
            .query_row(
                "SELECT COUNT(*) FROM tasks WHERE project = 'work'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(old_count_after_ignore_update, 0);
    }

    #[test]
    fn rejects_stale_plan_before_mutation() {
        let (temp, vault) = vault();
        let note = vault.join("note.md");
        fs::write(&note, "- [ ] Root +work\n").unwrap();
        let connection = database(&temp);
        let plan = plan_project_rename(&vault, "projects", "work", "job").unwrap();
        fs::write(&note, "- [ ] Externally changed +work\n").unwrap();

        let error = execute_project_rename_plan(&vault, &connection, &plan).unwrap_err();

        assert_eq!(error.code, ProjectRenameErrorCode::StalePlan);
        assert_eq!(
            fs::read_to_string(note).unwrap(),
            "- [ ] Externally changed +work\n"
        );
    }

    #[test]
    fn executes_case_only_file_and_directory_rename() {
        let (temp, vault) = vault();
        fs::write(vault.join("projects/work.md"), "- [ ] Root +work\n").unwrap();
        fs::write(
            vault.join("projects/work/child.md"),
            "- [ ] Child +work/child\n",
        )
        .unwrap();
        let connection = database(&temp);
        let plan = plan_project_rename(&vault, "projects", "work", "Work").unwrap();

        execute_project_rename_plan(&vault, &connection, &plan).unwrap();

        assert_eq!(
            fs::read_to_string(vault.join("projects/Work.md")).unwrap(),
            "- [ ] Root +Work\n"
        );
        assert_eq!(
            fs::read_to_string(vault.join("projects/Work/child.md")).unwrap(),
            "- [ ] Child +Work/child\n"
        );
    }

    #[test]
    fn reports_completed_and_pending_work_after_injected_failure() {
        let temp = tempdir().unwrap();
        let vault = temp.path().join("vault");
        fs::create_dir(&vault).unwrap();
        fs::write(vault.join("a.md"), "- [ ] A +work\n").unwrap();
        fs::write(vault.join("b.md"), "- [ ] B +work\n").unwrap();
        let connection = database(&temp);
        let plan = plan_project_rename(&vault, "projects", "work", "job").unwrap();

        let error = execute_project_rename_plan_with_hook(&vault, &connection, &plan, |mutation| {
            if mutation == 1 {
                Err(())
            } else {
                Ok(())
            }
        })
        .unwrap_err();

        assert_eq!(error.code, ProjectRenameErrorCode::PartialFailure);
        let recovery = error.recovery.unwrap();
        assert_eq!(recovery.completed_operations.len(), 1);
        assert_eq!(recovery.pending_operations.len(), 1);
        assert_eq!(
            fs::read_to_string(vault.join("a.md")).unwrap(),
            "- [ ] A +job\n"
        );
        assert_eq!(
            fs::read_to_string(vault.join("b.md")).unwrap(),
            "- [ ] B +work\n"
        );
    }

    #[test]
    #[ignore = "20,000-file/200,000-task release benchmark"]
    fn benchmark_large_vault_project_rename() {
        let temp = tempdir().unwrap();
        let vault = temp.path().join("vault");
        fs::create_dir(&vault).unwrap();
        let content = (0..10)
            .map(|task| format!("- [ ] Task {task} +work/client @benchmark\n"))
            .collect::<String>();

        for directory in 0..200 {
            let path = vault.join(format!("notes-{directory:03}"));
            fs::create_dir(&path).unwrap();
            for file in 0..100 {
                fs::write(path.join(format!("note-{file:03}.md")), &content).unwrap();
            }
        }

        let connection = database(&temp);
        let preflight_started = std::time::Instant::now();
        let plan = plan_project_rename(&vault, "projects", "work", "job").unwrap();
        let preflight_elapsed = preflight_started.elapsed();
        assert_eq!(plan.impact.rewritten_files, 20_000);
        assert_eq!(plan.impact.rewritten_tokens, 200_000);

        let execute_started = std::time::Instant::now();
        let result = execute_project_rename_plan(&vault, &connection, &plan).unwrap();
        let execute_elapsed = execute_started.elapsed();
        assert_eq!(result.rewritten_files, 20_000);
        assert_eq!(result.rewritten_tokens, 200_000);

        eprintln!(
            "project_rename_benchmark files=20000 tasks=200000 affected_files=20000 \
             affected_tokens=200000 profile={} preflight_ms={} execute_ms={}",
            if cfg!(debug_assertions) {
                "debug"
            } else {
                "release"
            },
            preflight_elapsed.as_millis(),
            execute_elapsed.as_millis()
        );
    }
}
