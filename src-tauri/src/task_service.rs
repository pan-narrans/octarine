use crate::config::{AppConfig, DestinationTemplate, UnprojectedDestination};
use crate::db::{index_single_file, query_tasks};
use crate::parser::{parse_markdown_content, ParsedTask};
use crate::path_security::resolve_descendant_within;
use crate::project::{filesystem_case_collision, resolve_project_file, ProjectPath};
use crate::project_merge::{
    cancel_project_merge_staging, cleanup_project_merge_recovery, delete_project_merge_recovery,
    execute_prepared_project_merge_with_hook, list_project_merge_recovery, plan_project_merge,
    prepare_project_merge_with_stop, PreparedProjectMerge, ProjectMergeBulkResolution,
    ProjectMergeError, ProjectMergeErrorCode, ProjectMergePathKind, ProjectMergePlan,
    ProjectMergeRecoveryBundle, ProjectMergeRecoveryCleanup, ProjectMergeResolution,
    ProjectMergeResult,
};
use crate::project_rename::{
    execute_project_rename_plan, plan_project_rename, ProjectRenameError, ProjectRenameErrorCode,
    ProjectRenamePlan, ProjectRenameResult,
};
use crate::task_creation::{
    parse_compact_task, serialize_task_draft, CaptureContext, TaskDraft, TaskDraftPreview,
};
use crate::task_writer::{write_task_block, CreateWarning, TaskFileWriteError};
use crate::template::{render_template, TemplateContext};
use crate::writer::{
    delete_task_markdown_in_file, validate_task_markdown_in_file, WriteError, WriteErrorCode,
};
use chrono::{DateTime, Datelike, FixedOffset};
use rusqlite::types::Value;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

const MAX_CACHED_OPERATIONS: usize = 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "snake_case")]
pub enum CreateTaskErrorCode {
    InvalidDraft,
    InvalidDestination,
    ProjectCollision,
    DestinationConflict,
    IndexFailed,
    OperationFailed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
pub struct CreateTaskError {
    pub code: CreateTaskErrorCode,
    pub message: String,
}

impl CreateTaskError {
    fn new(code: CreateTaskErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct UndoCreateReceipt {
    pub file_path: String,
    pub line_number: usize,
    pub raw_markdown: String,
    pub source_fingerprint: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskResult {
    pub task: ParsedTask,
    pub destination_path: String,
    pub warning: Option<CreateWarning>,
    pub undo_receipt: UndoCreateReceipt,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "snake_case")]
pub enum MoveTaskProjectErrorCode {
    InvalidSource,
    InvalidDestination,
    ProjectCollision,
    DestinationConflict,
    SourceRemovalFailed,
    RollbackFailed,
    IndexFailed,
    OperationFailed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct MoveTaskProjectError {
    pub code: MoveTaskProjectErrorCode,
    pub message: String,
    pub recovery_required: bool,
}

impl MoveTaskProjectError {
    fn new(code: MoveTaskProjectErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            recovery_required: false,
        }
    }

    fn recovery(message: impl Into<String>) -> Self {
        Self {
            code: MoveTaskProjectErrorCode::RollbackFailed,
            message: message.into(),
            recovery_required: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct MoveTaskProjectResult {
    pub task: ParsedTask,
    pub source_path: String,
    pub destination_path: String,
    pub warning: Option<CreateWarning>,
}

#[derive(Default)]
pub struct TaskCreationService {
    write_lock: Mutex<()>,
    completed_operations: Mutex<HashMap<String, CreateTaskResult>>,
    project_rename_plans: Mutex<HashMap<String, ProjectRenamePlan>>,
    project_merge_sessions: Mutex<HashMap<String, ProjectMergeSession>>,
    active_project_merges: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

#[derive(Clone)]
struct ProjectMergeSession {
    plan: ProjectMergePlan,
    resolutions: BTreeMap<String, ProjectMergeResolution>,
    prepared: Option<PreparedProjectMerge>,
}

impl TaskCreationService {
    pub fn preflight_project_merge(
        &self,
        vault_root: &Path,
        config: &AppConfig,
        source_project: &str,
        destination_project: &str,
    ) -> Result<ProjectMergePlan, ProjectMergeError> {
        crate::config::validate_config_for_vault(config, vault_root).map_err(|_| {
            ProjectMergeError::new(
                ProjectMergeErrorCode::InvalidRequest,
                "Project merge configuration is invalid.",
            )
        })?;
        let _guard = self.write_lock.try_lock().map_err(|_| merge_busy_error())?;
        let plan = plan_project_merge(
            vault_root,
            &config.project_folder,
            source_project,
            destination_project,
        )?;
        let mut sessions = self
            .project_merge_sessions
            .lock()
            .map_err(|_| merge_state_error())?;
        if sessions.len() >= 32 {
            sessions.clear();
        }
        sessions.insert(
            plan.plan_token.clone(),
            ProjectMergeSession {
                plan: plan.clone(),
                resolutions: BTreeMap::new(),
                prepared: None,
            },
        );
        Ok(plan)
    }

    pub fn resolve_project_merge_conflict(
        &self,
        plan_token: &str,
        resolution: ProjectMergeResolution,
    ) -> Result<(), ProjectMergeError> {
        let mut sessions = self
            .project_merge_sessions
            .lock()
            .map_err(|_| merge_state_error())?;
        let session = sessions
            .get_mut(plan_token)
            .ok_or_else(merge_unknown_error)?;
        if !session
            .plan
            .conflicts
            .iter()
            .any(|conflict| conflict.id == resolution.conflict_id)
        {
            return Err(ProjectMergeError::new(
                ProjectMergeErrorCode::InvalidResolution,
                "Project merge conflict ID is invalid.",
            ));
        }
        session
            .resolutions
            .insert(resolution.conflict_id.clone(), resolution);
        session.prepared = None;
        Ok(())
    }

    pub fn resolve_project_merge_conflicts_bulk(
        &self,
        plan_token: &str,
        bulk: ProjectMergeBulkResolution,
    ) -> Result<(), ProjectMergeError> {
        if !matches!(
            bulk.action,
            crate::project_merge::ProjectMergeResolutionAction::UseSource
                | crate::project_merge::ProjectMergeResolutionAction::UseDestination
        ) || bulk.conflict_ids.is_empty()
            || bulk.confirmed_count != bulk.conflict_ids.len()
        {
            return Err(ProjectMergeError::new(
                ProjectMergeErrorCode::InvalidResolution,
                "Bulk merge resolution confirmation is invalid.",
            ));
        }
        let ids = bulk
            .conflict_ids
            .into_iter()
            .collect::<std::collections::BTreeSet<_>>();
        if ids.len() != bulk.confirmed_count {
            return Err(ProjectMergeError::new(
                ProjectMergeErrorCode::InvalidResolution,
                "Bulk merge resolution contains duplicate conflict IDs.",
            ));
        }
        let mut sessions = self
            .project_merge_sessions
            .lock()
            .map_err(|_| merge_state_error())?;
        let session = sessions
            .get_mut(plan_token)
            .ok_or_else(merge_unknown_error)?;
        for id in &ids {
            let conflict = session
                .plan
                .conflicts
                .iter()
                .find(|conflict| &conflict.id == id)
                .ok_or_else(|| {
                    ProjectMergeError::new(
                        ProjectMergeErrorCode::InvalidResolution,
                        "Bulk merge resolution contains unknown conflict ID.",
                    )
                })?;
            if conflict.kind == crate::project_merge::ProjectMergeEntryKind::TypeMismatch
                || conflict.source_kind == ProjectMergePathKind::Directory
                || conflict.destination_kind == ProjectMergePathKind::Directory
            {
                return Err(ProjectMergeError::new(
                    ProjectMergeErrorCode::InvalidResolution,
                    "Bulk merge resolution cannot include directories or type mismatches.",
                ));
            }
        }
        for conflict_id in ids {
            session.resolutions.insert(
                conflict_id.clone(),
                ProjectMergeResolution {
                    conflict_id,
                    action: bulk.action,
                    result: None,
                    source_name: None,
                },
            );
        }
        session.prepared = None;
        Ok(())
    }

    pub fn prepare_project_merge(
        &self,
        vault_root: &Path,
        config: &AppConfig,
        plan_token: &str,
    ) -> Result<PreparedProjectMerge, ProjectMergeError> {
        let session = self
            .project_merge_sessions
            .lock()
            .map_err(|_| merge_state_error())?
            .get(plan_token)
            .cloned()
            .ok_or_else(merge_unknown_error)?;
        if session.plan.project_folder != config.project_folder {
            return Err(merge_stale_error());
        }
        let _guard = self.write_lock.try_lock().map_err(|_| merge_busy_error())?;
        let current = plan_project_merge(
            vault_root,
            &config.project_folder,
            &session.plan.source_project,
            &session.plan.destination_project,
        )?;
        if current.plan_token != session.plan.plan_token {
            return Err(merge_stale_error());
        }
        let resolutions = session.resolutions.into_values().collect::<Vec<_>>();
        let stop = Arc::new(AtomicBool::new(false));
        self.active_project_merges
            .lock()
            .map_err(|_| merge_state_error())?
            .insert(session.plan.operation_id.clone(), stop.clone());
        let prepared =
            prepare_project_merge_with_stop(vault_root, &session.plan, &resolutions, &stop);
        self.active_project_merges
            .lock()
            .map_err(|_| merge_state_error())?
            .remove(&session.plan.operation_id);
        let prepared = prepared?;
        let mut sessions = self
            .project_merge_sessions
            .lock()
            .map_err(|_| merge_state_error())?;
        let stored = sessions
            .get_mut(plan_token)
            .ok_or_else(merge_unknown_error)?;
        stored.prepared = Some(prepared.clone());
        Ok(prepared)
    }

    pub fn execute_project_merge(
        &self,
        vault_root: &Path,
        config: &AppConfig,
        connection: &Connection,
        plan_token: &str,
    ) -> Result<ProjectMergeResult, ProjectMergeError> {
        let session = self
            .project_merge_sessions
            .lock()
            .map_err(|_| merge_state_error())?
            .get(plan_token)
            .cloned()
            .ok_or_else(merge_unknown_error)?;
        let prepared = session.prepared.clone().ok_or_else(|| {
            ProjectMergeError::new(
                ProjectMergeErrorCode::UnknownPlan,
                "Project merge must be prepared before commit.",
            )
        })?;
        if session.plan.project_folder != config.project_folder {
            return Err(merge_stale_error());
        }
        let _guard = self.write_lock.try_lock().map_err(|_| merge_busy_error())?;
        let current = plan_project_merge(
            vault_root,
            &config.project_folder,
            &session.plan.source_project,
            &session.plan.destination_project,
        )?;
        if current.plan_token != session.plan.plan_token {
            return Err(merge_stale_error());
        }
        let stop = Arc::new(AtomicBool::new(false));
        self.active_project_merges
            .lock()
            .map_err(|_| merge_state_error())?
            .insert(prepared.operation_id.clone(), stop.clone());
        let result = execute_prepared_project_merge_with_hook(
            vault_root,
            Some(connection),
            &session.plan,
            &prepared,
            |_| !stop.load(Ordering::Acquire),
        );
        self.active_project_merges
            .lock()
            .map_err(|_| merge_state_error())?
            .remove(&prepared.operation_id);
        if result.is_ok() {
            self.project_merge_sessions
                .lock()
                .map_err(|_| merge_state_error())?
                .remove(plan_token);
        }
        result
    }

    pub fn cancel_project_merge(
        &self,
        vault_root: &Path,
        operation_id: &str,
    ) -> Result<(), ProjectMergeError> {
        if let Some(stop) = self
            .active_project_merges
            .lock()
            .map_err(|_| merge_state_error())?
            .get(operation_id)
            .cloned()
        {
            stop.store(true, Ordering::Release);
            return Ok(());
        }
        cancel_project_merge_staging(vault_root, operation_id)?;
        self.project_merge_sessions
            .lock()
            .map_err(|_| merge_state_error())?
            .retain(|_, session| session.plan.operation_id != operation_id);
        Ok(())
    }

    pub fn list_project_merge_recovery(
        &self,
        vault_root: &Path,
    ) -> Result<Vec<ProjectMergeRecoveryBundle>, ProjectMergeError> {
        list_project_merge_recovery(vault_root)
    }

    pub fn delete_project_merge_recovery(
        &self,
        vault_root: &Path,
        operation_id: &str,
    ) -> Result<(), ProjectMergeError> {
        let _guard = self.write_lock.try_lock().map_err(|_| merge_busy_error())?;
        delete_project_merge_recovery(vault_root, operation_id)
    }

    pub fn cleanup_project_merge_recovery(
        &self,
        vault_root: &Path,
    ) -> Result<ProjectMergeRecoveryCleanup, ProjectMergeError> {
        let _guard = self.write_lock.try_lock().map_err(|_| merge_busy_error())?;
        cleanup_project_merge_recovery(vault_root)
    }

    pub fn preflight_project_rename(
        &self,
        vault_root: &Path,
        config: &AppConfig,
        source_project: &str,
        destination_project: &str,
    ) -> Result<ProjectRenamePlan, ProjectRenameError> {
        crate::config::validate_config_for_vault(config, vault_root).map_err(|_| {
            ProjectRenameError::new(
                ProjectRenameErrorCode::InvalidRequest,
                "Project rename configuration is invalid.",
            )
        })?;
        let plan = plan_project_rename(
            vault_root,
            &config.project_folder,
            source_project,
            destination_project,
        )
        .map_err(|message| {
            ProjectRenameError::new(ProjectRenameErrorCode::InvalidRequest, message)
        })?;
        let mut plans = self.project_rename_plans.lock().unwrap();
        if plans.len() >= 32 {
            plans.clear();
        }
        plans.insert(plan.plan_token.clone(), plan.clone());
        Ok(plan)
    }

    pub fn execute_project_rename(
        &self,
        vault_root: &Path,
        config: &AppConfig,
        connection: &Connection,
        plan_token: &str,
    ) -> Result<ProjectRenameResult, ProjectRenameError> {
        let plan = self
            .project_rename_plans
            .lock()
            .unwrap()
            .get(plan_token)
            .cloned()
            .ok_or_else(|| {
                ProjectRenameError::new(
                    ProjectRenameErrorCode::UnknownPlan,
                    "Project rename plan is unknown or expired. Run preflight again.",
                )
            })?;
        let _write_guard = self.write_lock.try_lock().map_err(|_| {
            ProjectRenameError::new(
                ProjectRenameErrorCode::Busy,
                "Another task file operation is running. Try again.",
            )
        })?;
        let current = plan_project_rename(
            vault_root,
            &config.project_folder,
            &plan.source_project,
            &plan.destination_project,
        )
        .map_err(|_| {
            ProjectRenameError::new(
                ProjectRenameErrorCode::StalePlan,
                "Project rename plan is stale. Run preflight again.",
            )
        })?;
        if current.plan_token != plan.plan_token {
            self.project_rename_plans.lock().unwrap().remove(plan_token);
            return Err(ProjectRenameError::new(
                ProjectRenameErrorCode::StalePlan,
                "Project rename plan is stale. Run preflight again.",
            ));
        }
        self.project_rename_plans.lock().unwrap().remove(plan_token);
        execute_project_rename_plan(vault_root, connection, &plan)
    }

    pub fn preview_task_draft(
        &self,
        vault_root: &Path,
        config: &AppConfig,
        connection: &Connection,
        input: &str,
        capture_context: &CaptureContext,
        submitted_at: DateTime<FixedOffset>,
    ) -> Result<TaskDraftPreview, CreateTaskError> {
        crate::config::validate_config_for_vault(config, vault_root).map_err(|message| {
            CreateTaskError::new(CreateTaskErrorCode::InvalidDestination, message)
        })?;
        let (draft, task_type) = parse_compact_task(input, capture_context).map_err(|error| {
            CreateTaskError::new(CreateTaskErrorCode::InvalidDraft, error.message)
        })?;
        let destination =
            resolve_destination(vault_root, config, connection, &draft, submitted_at)?;
        let inherited_project = capture_context
            .project
            .as_deref()
            .map(ProjectPath::parse)
            .transpose()
            .map_err(|error| {
                CreateTaskError::new(CreateTaskErrorCode::InvalidDraft, error.to_string())
            })?
            .map(|project| project.display().to_string());
        Ok(TaskDraftPreview {
            draft,
            task_type,
            destination_path: destination.path.to_string_lossy().into_owned(),
            inherited_project,
        })
    }

    pub fn create_task(
        &self,
        vault_root: &Path,
        config: &AppConfig,
        connection: &Connection,
        operation_id: &str,
        draft: &TaskDraft,
        submitted_at: DateTime<FixedOffset>,
    ) -> Result<CreateTaskResult, CreateTaskError> {
        validate_operation_id(operation_id)?;
        let _write_guard = self.write_lock.lock().unwrap();
        if let Some(result) = self
            .completed_operations
            .lock()
            .unwrap()
            .get(operation_id)
            .cloned()
        {
            return Ok(result);
        }
        crate::config::validate_config_for_vault(config, vault_root).map_err(|message| {
            CreateTaskError::new(CreateTaskErrorCode::InvalidDestination, message)
        })?;

        let (task_block, _) = serialize_task_draft(draft).map_err(|error| {
            CreateTaskError::new(CreateTaskErrorCode::InvalidDraft, error.message)
        })?;
        let resolved = resolve_destination(vault_root, config, connection, draft, submitted_at)?;
        let rendered_template = render_template(
            &resolved.template.template,
            TemplateContext {
                project: resolved.project.as_ref(),
                submitted_at,
            },
        )
        .map_err(|error| {
            CreateTaskError::new(CreateTaskErrorCode::InvalidDestination, error.to_string())
        })?;
        let written = write_task_block(
            &resolved.path,
            &rendered_template,
            &task_block,
            &resolved.template.insertion,
        )
        .map_err(map_file_write_error)?;
        let destination_path = resolved.path.to_string_lossy().into_owned();

        index_single_file(connection, &destination_path).map_err(|_| {
            CreateTaskError::new(
                CreateTaskErrorCode::IndexFailed,
                "Task was written, but derived index refresh failed.",
            )
        })?;
        let tasks = query_tasks(
            connection,
            "files.path = ?1 AND tasks.line_number = ?2",
            &[
                Value::Text(destination_path.clone()),
                Value::Integer(written.insertion.line_number as i64),
            ],
        )
        .map_err(|_| {
            CreateTaskError::new(
                CreateTaskErrorCode::IndexFailed,
                "Created task could not be read from derived index.",
            )
        })?;
        let task = tasks
            .into_iter()
            .find(|task| task.parent_hash.is_none())
            .ok_or_else(|| {
                CreateTaskError::new(
                    CreateTaskErrorCode::IndexFailed,
                    "Created root task is missing from derived index.",
                )
            })?;
        let receipt = UndoCreateReceipt {
            file_path: destination_path.clone(),
            line_number: written.insertion.line_number,
            raw_markdown: task_block.clone(),
            source_fingerprint: source_fingerprint(&task_block),
        };
        let result = CreateTaskResult {
            task,
            destination_path,
            warning: written.insertion.warning,
            undo_receipt: receipt,
        };

        let mut completed = self.completed_operations.lock().unwrap();
        if completed.len() >= MAX_CACHED_OPERATIONS {
            completed.clear();
        }
        completed.insert(operation_id.to_string(), result.clone());
        Ok(result)
    }

    pub fn undo_created_task(
        &self,
        vault_root: &Path,
        connection: &Connection,
        receipt: &UndoCreateReceipt,
    ) -> Result<(), WriteError> {
        let _write_guard = self.write_lock.lock().unwrap();
        if source_fingerprint(&receipt.raw_markdown) != receipt.source_fingerprint {
            return Err(WriteError {
                code: WriteErrorCode::InvalidSource,
                message: "Undo receipt is invalid.",
            });
        }
        let path =
            crate::path_security::resolve_existing_within(vault_root, &receipt.file_path, false)
                .map_err(|_| WriteError::source_missing())?;
        let path = path.to_string_lossy().into_owned();
        delete_task_markdown_in_file(&path, receipt.line_number, &receipt.raw_markdown)?;
        index_single_file(connection, &path).map_err(|_| WriteError::operation_failed())?;
        self.completed_operations
            .lock()
            .unwrap()
            .retain(|_, result| result.undo_receipt != *receipt);
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn move_task_project(
        &self,
        vault_root: &Path,
        config: &AppConfig,
        connection: &Connection,
        source_file_path: &str,
        original_line_number: usize,
        original_raw_markdown: &str,
        new_raw_markdown: &str,
        submitted_at: DateTime<FixedOffset>,
    ) -> Result<MoveTaskProjectResult, MoveTaskProjectError> {
        self.move_task_project_with_hook(
            vault_root,
            config,
            connection,
            source_file_path,
            original_line_number,
            original_raw_markdown,
            new_raw_markdown,
            submitted_at,
            |_| {},
        )
    }

    #[allow(clippy::too_many_arguments)]
    fn move_task_project_with_hook<F>(
        &self,
        vault_root: &Path,
        config: &AppConfig,
        connection: &Connection,
        source_file_path: &str,
        original_line_number: usize,
        original_raw_markdown: &str,
        new_raw_markdown: &str,
        submitted_at: DateTime<FixedOffset>,
        after_destination_write: F,
    ) -> Result<MoveTaskProjectResult, MoveTaskProjectError>
    where
        F: FnOnce(&Path),
    {
        let _write_guard = self.write_lock.lock().unwrap();
        crate::config::validate_config_for_vault(config, vault_root).map_err(|message| {
            MoveTaskProjectError::new(MoveTaskProjectErrorCode::InvalidDestination, message)
        })?;
        let source =
            crate::path_security::resolve_existing_within(vault_root, source_file_path, false)
                .map_err(|_| {
                    MoveTaskProjectError::new(
                        MoveTaskProjectErrorCode::InvalidSource,
                        "Source task file is missing or outside the vault.",
                    )
                })?;
        let source_path = source.to_string_lossy().into_owned();
        validate_task_markdown_in_file(&source_path, original_line_number, original_raw_markdown)
            .map_err(map_source_write_error)?;

        let project = validate_moved_subtree(new_raw_markdown)?;
        let resolved = resolve_destination_for_project(
            vault_root,
            config,
            connection,
            project.as_deref(),
            submitted_at,
        )
        .map_err(map_create_to_move_error)?;
        if source == resolved.path {
            return Err(MoveTaskProjectError::new(
                MoveTaskProjectErrorCode::InvalidDestination,
                "Project change resolves to the current file.",
            ));
        }
        let rendered_template = render_template(
            &resolved.template.template,
            TemplateContext {
                project: resolved.project.as_ref(),
                submitted_at,
            },
        )
        .map_err(|error| {
            MoveTaskProjectError::new(
                MoveTaskProjectErrorCode::InvalidDestination,
                error.to_string(),
            )
        })?;
        let written = write_task_block(
            &resolved.path,
            &rendered_template,
            new_raw_markdown,
            &resolved.template.insertion,
        )
        .map_err(map_move_file_write_error)?;
        let destination_path = resolved.path.to_string_lossy().into_owned();
        after_destination_write(&resolved.path);

        if let Err(source_error) =
            delete_task_markdown_in_file(&source_path, original_line_number, original_raw_markdown)
        {
            let rollback = delete_task_markdown_in_file(
                &destination_path,
                written.insertion.line_number,
                new_raw_markdown,
            );
            if rollback.is_err() {
                return Err(MoveTaskProjectError::recovery(format!(
                    "Source task was not removed ({0}). Destination rollback also failed. Task may exist in both files; refresh before editing.",
                    source_error.message
                )));
            }
            return Err(MoveTaskProjectError::new(
                MoveTaskProjectErrorCode::SourceRemovalFailed,
                format!(
                    "Source task was not removed ({}). Destination write was rolled back.",
                    source_error.message
                ),
            ));
        }

        index_single_file(connection, &source_path).map_err(|_| {
            MoveTaskProjectError::new(
                MoveTaskProjectErrorCode::IndexFailed,
                "Task moved, but source index refresh failed.",
            )
        })?;
        index_single_file(connection, &destination_path).map_err(|_| {
            MoveTaskProjectError::new(
                MoveTaskProjectErrorCode::IndexFailed,
                "Task moved, but destination index refresh failed.",
            )
        })?;
        let tasks = query_tasks(
            connection,
            "files.path = ?1 AND tasks.line_number = ?2",
            &[
                Value::Text(destination_path.clone()),
                Value::Integer(written.insertion.line_number as i64),
            ],
        )
        .map_err(|_| {
            MoveTaskProjectError::new(
                MoveTaskProjectErrorCode::IndexFailed,
                "Moved task could not be read from derived index.",
            )
        })?;
        let task = tasks
            .into_iter()
            .find(|task| task.parent_hash.is_none())
            .ok_or_else(|| {
                MoveTaskProjectError::new(
                    MoveTaskProjectErrorCode::IndexFailed,
                    "Moved root task is missing from derived index.",
                )
            })?;

        Ok(MoveTaskProjectResult {
            task,
            source_path,
            destination_path,
            warning: written.insertion.warning,
        })
    }
}

fn merge_busy_error() -> ProjectMergeError {
    ProjectMergeError::new(
        ProjectMergeErrorCode::Busy,
        "Another task file operation is running. Try again.",
    )
}

fn merge_state_error() -> ProjectMergeError {
    ProjectMergeError::new(
        ProjectMergeErrorCode::OperationFailed,
        "Project merge session state is unavailable.",
    )
}

fn merge_unknown_error() -> ProjectMergeError {
    ProjectMergeError::new(
        ProjectMergeErrorCode::UnknownPlan,
        "Project merge plan is unknown or expired. Run preflight again.",
    )
}

fn merge_stale_error() -> ProjectMergeError {
    ProjectMergeError::new(
        ProjectMergeErrorCode::StalePlan,
        "Project merge plan is stale. Run preflight again.",
    )
}

struct ResolvedDestination<'a> {
    path: PathBuf,
    template: &'a DestinationTemplate,
    project: Option<ProjectPath>,
}

fn resolve_destination<'a>(
    vault_root: &Path,
    config: &'a AppConfig,
    connection: &Connection,
    draft: &TaskDraft,
    submitted_at: DateTime<FixedOffset>,
) -> Result<ResolvedDestination<'a>, CreateTaskError> {
    resolve_destination_for_project(
        vault_root,
        config,
        connection,
        draft.project.as_deref(),
        submitted_at,
    )
}

fn resolve_destination_for_project<'a>(
    vault_root: &Path,
    config: &'a AppConfig,
    connection: &Connection,
    project_name: Option<&str>,
    submitted_at: DateTime<FixedOffset>,
) -> Result<ResolvedDestination<'a>, CreateTaskError> {
    if let Some(project_name) = project_name {
        let project = ProjectPath::parse(project_name).map_err(|error| {
            CreateTaskError::new(CreateTaskErrorCode::InvalidDraft, error.to_string())
        })?;
        let existing = existing_projects(connection)?;
        if let Some(conflict) = project
            .case_collision(existing.iter().map(String::as_str))
            .map_err(|error| {
                CreateTaskError::new(CreateTaskErrorCode::InvalidDraft, error.to_string())
            })?
        {
            return Err(CreateTaskError::new(
                CreateTaskErrorCode::ProjectCollision,
                format!("Project conflicts with existing project '{conflict}'."),
            ));
        }
        if let Some(conflict) =
            filesystem_case_collision(vault_root, &config.project_folder, &project).map_err(
                |message| CreateTaskError::new(CreateTaskErrorCode::InvalidDestination, message),
            )?
        {
            return Err(CreateTaskError::new(
                CreateTaskErrorCode::ProjectCollision,
                format!("Project conflicts with existing project '{conflict}'."),
            ));
        }
        let path = resolve_project_file(vault_root, &config.project_folder, &project).map_err(
            |message| CreateTaskError::new(CreateTaskErrorCode::InvalidDestination, message),
        )?;
        return Ok(ResolvedDestination {
            path,
            template: &config.templates.project,
            project: Some(project),
        });
    }

    match config.default_unprojected_destination {
        UnprojectedDestination::Inbox => {
            let path = resolve_descendant_within(vault_root, &config.inbox_file, false).map_err(
                |message| CreateTaskError::new(CreateTaskErrorCode::InvalidDestination, message),
            )?;
            Ok(ResolvedDestination {
                path,
                template: &config.templates.inbox,
                project: None,
            })
        }
        UnprojectedDestination::DailyNote => {
            if config.journal_migration.is_some() {
                return Err(CreateTaskError::new(
                    CreateTaskErrorCode::InvalidDestination,
                    "Daily note destination requires journal folder migration.",
                ));
            }
            let filename = render_daily_filename(&config.daily_filename_pattern, submitted_at);
            let relative = Path::new(&config.journal_folder).join(filename);
            let path =
                resolve_descendant_within(vault_root, relative, false).map_err(|message| {
                    CreateTaskError::new(CreateTaskErrorCode::InvalidDestination, message)
                })?;
            let filter =
                crate::vault_ignore::VaultPathFilter::load(vault_root).map_err(|message| {
                    CreateTaskError::new(CreateTaskErrorCode::InvalidDestination, message)
                })?;
            if filter.is_ignored(&path, false) {
                return Err(CreateTaskError::new(
                    CreateTaskErrorCode::InvalidDestination,
                    "Daily note destination cannot be hidden or ignored.",
                ));
            }
            Ok(ResolvedDestination {
                path,
                template: &config.templates.daily_note,
                project: None,
            })
        }
    }
}

fn validate_moved_subtree(raw_markdown: &str) -> Result<Option<String>, MoveTaskProjectError> {
    if raw_markdown.trim().is_empty() {
        return Err(MoveTaskProjectError::new(
            MoveTaskProjectErrorCode::InvalidSource,
            "Moved task source cannot be empty.",
        ));
    }
    let (tasks, _) = parse_markdown_content("<project-move>", raw_markdown);
    let project_tokens = raw_markdown
        .lines()
        .next()
        .into_iter()
        .flat_map(str::split_whitespace)
        .filter(|token| token.starts_with('+') && token.len() > 1)
        .count();
    if project_tokens > 1 {
        return Err(MoveTaskProjectError::new(
            MoveTaskProjectErrorCode::InvalidSource,
            "Moved task can contain one root project.",
        ));
    }
    let roots: Vec<&ParsedTask> = tasks
        .iter()
        .filter(|task| task.parent_hash.is_none())
        .collect();
    let [root] = roots.as_slice() else {
        return Err(MoveTaskProjectError::new(
            MoveTaskProjectErrorCode::InvalidSource,
            "Moved Markdown must contain exactly one root task.",
        ));
    };
    if tasks.iter().any(|task| task.parse_errors.is_some()) {
        return Err(MoveTaskProjectError::new(
            MoveTaskProjectErrorCode::InvalidSource,
            "Moved task contains invalid metadata.",
        ));
    }
    if tasks.iter().any(|task| {
        task.parent_hash.is_some()
            && task
                .project
                .as_deref()
                .is_some_and(|project| root.project.as_deref() != Some(project))
    }) {
        return Err(MoveTaskProjectError::new(
            MoveTaskProjectErrorCode::InvalidSource,
            "Every subtask must inherit the root project.",
        ));
    }
    root.project
        .as_deref()
        .map(ProjectPath::parse)
        .transpose()
        .map(|project| project.map(|value| value.display().to_string()))
        .map_err(|error| {
            MoveTaskProjectError::new(MoveTaskProjectErrorCode::InvalidSource, error.to_string())
        })
}

fn existing_projects(connection: &Connection) -> Result<Vec<String>, CreateTaskError> {
    let mut statement = connection
        .prepare("SELECT DISTINCT project FROM tasks WHERE project IS NOT NULL")
        .map_err(|_| {
            CreateTaskError::new(
                CreateTaskErrorCode::OperationFailed,
                "Existing projects could not be checked.",
            )
        })?;
    let rows = statement.query_map([], |row| row.get(0)).map_err(|_| {
        CreateTaskError::new(
            CreateTaskErrorCode::OperationFailed,
            "Existing projects could not be checked.",
        )
    })?;
    rows.collect::<Result<Vec<String>, _>>().map_err(|_| {
        CreateTaskError::new(
            CreateTaskErrorCode::OperationFailed,
            "Existing projects could not be checked.",
        )
    })
}

fn render_daily_filename(pattern: &str, submitted_at: DateTime<FixedOffset>) -> String {
    pattern
        .replace("YYYY", &format!("{:04}", submitted_at.year()))
        .replace("MM", &format!("{:02}", submitted_at.month()))
        .replace("DD", &format!("{:02}", submitted_at.day()))
}

fn validate_operation_id(operation_id: &str) -> Result<(), CreateTaskError> {
    if operation_id.trim().is_empty() || operation_id.len() > 128 {
        return Err(CreateTaskError::new(
            CreateTaskErrorCode::InvalidDraft,
            "Operation ID must contain 1 to 128 bytes.",
        ));
    }
    Ok(())
}

fn map_file_write_error(error: TaskFileWriteError) -> CreateTaskError {
    match error {
        TaskFileWriteError::Conflict => {
            CreateTaskError::new(CreateTaskErrorCode::DestinationConflict, error.to_string())
        }
        TaskFileWriteError::OperationFailed => {
            CreateTaskError::new(CreateTaskErrorCode::OperationFailed, error.to_string())
        }
    }
}

fn map_create_to_move_error(error: CreateTaskError) -> MoveTaskProjectError {
    let code = match error.code {
        CreateTaskErrorCode::InvalidDraft => MoveTaskProjectErrorCode::InvalidSource,
        CreateTaskErrorCode::InvalidDestination => MoveTaskProjectErrorCode::InvalidDestination,
        CreateTaskErrorCode::ProjectCollision => MoveTaskProjectErrorCode::ProjectCollision,
        CreateTaskErrorCode::DestinationConflict => MoveTaskProjectErrorCode::DestinationConflict,
        CreateTaskErrorCode::IndexFailed => MoveTaskProjectErrorCode::IndexFailed,
        CreateTaskErrorCode::OperationFailed => MoveTaskProjectErrorCode::OperationFailed,
    };
    MoveTaskProjectError::new(code, error.message)
}

fn map_move_file_write_error(error: TaskFileWriteError) -> MoveTaskProjectError {
    let code = match error {
        TaskFileWriteError::Conflict => MoveTaskProjectErrorCode::DestinationConflict,
        TaskFileWriteError::OperationFailed => MoveTaskProjectErrorCode::OperationFailed,
    };
    MoveTaskProjectError::new(code, error.to_string())
}

fn map_source_write_error(error: WriteError) -> MoveTaskProjectError {
    MoveTaskProjectError::new(MoveTaskProjectErrorCode::InvalidSource, error.message)
}

fn source_fingerprint(source: &str) -> String {
    let mut digest = Sha256::new();
    digest.update(source.as_bytes());
    hex::encode(digest.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::InsertionMode;
    use crate::db::initialize_db;
    use crate::task_creation::{TaskPriority, TaskStatus};
    use chrono::TimeZone;
    use std::fs;
    use tempfile::tempdir;

    fn submitted_at() -> DateTime<FixedOffset> {
        FixedOffset::east_opt(2 * 60 * 60)
            .unwrap()
            .with_ymd_and_hms(2026, 9, 7, 10, 30, 0)
            .unwrap()
    }

    fn draft(title: &str, project: Option<&str>) -> TaskDraft {
        TaskDraft {
            title: title.to_string(),
            notes: "Created note".to_string(),
            status: TaskStatus::Todo,
            priority: Some(TaskPriority::A),
            due_date: None,
            duration: None,
            recurrence: None,
            project: project.map(str::to_string),
            contexts: vec!["home".to_string()],
            tags: vec!["next".to_string()],
            subtasks: Vec::new(),
            raw_markdown: format!("- [ ] {title}"),
        }
    }

    fn setup() -> (tempfile::TempDir, PathBuf, Connection) {
        let temp = tempdir().unwrap();
        let vault = temp.path().join("vault");
        fs::create_dir(&vault).unwrap();
        let connection = initialize_db(temp.path().join("index.sqlite3")).unwrap();
        (temp, vault, connection)
    }

    #[test]
    fn creates_project_task_reindexes_and_deduplicates_operation() {
        let (_temp, vault, connection) = setup();
        let service = TaskCreationService::default();

        let first = service
            .create_task(
                &vault,
                &AppConfig::default(),
                &connection,
                "operation-1",
                &draft("Ship feature", Some("work/project1")),
                submitted_at(),
            )
            .unwrap();
        let second = service
            .create_task(
                &vault,
                &AppConfig::default(),
                &connection,
                "operation-1",
                &draft("Different content", Some("personal")),
                submitted_at(),
            )
            .unwrap();

        assert_eq!(first, second);
        assert_eq!(first.task.project.as_deref(), Some("work/project1"));
        assert_eq!(first.task.description, "Ship feature");
        assert_eq!(
            first.task.file_path.as_deref(),
            Some(first.destination_path.as_str())
        );
        let content = fs::read_to_string(&first.destination_path).unwrap();
        assert_eq!(content.matches("Ship feature").count(), 1);
        assert_eq!(content.matches("+work/project1").count(), 2);
    }

    #[test]
    fn routes_unprojected_task_to_inbox_or_daily_note() {
        let (_temp, vault, connection) = setup();
        let service = TaskCreationService::default();
        let inbox = service
            .create_task(
                &vault,
                &AppConfig::default(),
                &connection,
                "inbox",
                &draft("Inbox task", None),
                submitted_at(),
            )
            .unwrap();
        assert!(inbox.destination_path.ends_with("inbox.md"));

        let daily_config = AppConfig {
            default_unprojected_destination: UnprojectedDestination::DailyNote,
            ..AppConfig::default()
        };
        let daily = service
            .create_task(
                &vault,
                &daily_config,
                &connection,
                "daily",
                &draft("Daily task", None),
                submitted_at(),
            )
            .unwrap();
        assert!(daily.destination_path.ends_with("journals/2026-09-07.md"));
    }

    #[test]
    fn moves_complete_subtree_between_project_files_and_reindexes_both() {
        let (_temp, vault, connection) = setup();
        let service = TaskCreationService::default();
        let source = vault.join("projects/old.md");
        fs::create_dir_all(source.parent().unwrap()).unwrap();
        let original = "- [ ] Parent +old\n    Parent note\n    - [ ] Child\n        Child note";
        fs::write(&source, format!("# old\n\n{original}\n\n- [ ] Keep +old\n")).unwrap();
        index_single_file(&connection, source.to_str().unwrap()).unwrap();

        let moved = service
            .move_task_project(
                &vault,
                &AppConfig::default(),
                &connection,
                source.to_str().unwrap(),
                3,
                original,
                "- [ ] Parent +new\n    Parent note\n    - [ ] Child\n        Child note",
                submitted_at(),
            )
            .unwrap();

        let source_content = fs::read_to_string(&source).unwrap();
        assert!(!source_content.contains("Parent"));
        assert!(source_content.contains("Keep"));
        let destination_content = fs::read_to_string(&moved.destination_path).unwrap();
        assert!(destination_content.contains("Parent +new"));
        assert!(destination_content.contains("Child note"));
        assert_eq!(moved.task.project.as_deref(), Some("new"));
        let indexed = query_tasks(&connection, "1 = 1", &[]).unwrap();
        assert_eq!(indexed.len(), 3);
        assert!(indexed.iter().all(|task| task.description != "Parent"
            || task.file_path.as_deref() == Some(moved.destination_path.as_str())));
    }

    #[test]
    fn removing_project_routes_complete_subtree_to_configured_inbox() {
        let (_temp, vault, connection) = setup();
        let service = TaskCreationService::default();
        let source = vault.join("projects/old.md");
        fs::create_dir_all(source.parent().unwrap()).unwrap();
        let original = "- [ ] Parent +old\n    - [ ] Child";
        fs::write(&source, original).unwrap();
        index_single_file(&connection, source.to_str().unwrap()).unwrap();

        let moved = service
            .move_task_project(
                &vault,
                &AppConfig::default(),
                &connection,
                source.to_str().unwrap(),
                1,
                original,
                "- [ ] Parent\n    - [ ] Child",
                submitted_at(),
            )
            .unwrap();

        assert!(moved.destination_path.ends_with("inbox.md"));
        assert_eq!(moved.task.project, None);
        assert!(!fs::read_to_string(source).unwrap().contains("Parent"));
        assert!(fs::read_to_string(moved.destination_path)
            .unwrap()
            .contains("Child"));
    }

    #[test]
    fn stale_project_move_aborts_before_destination_write() {
        let (_temp, vault, connection) = setup();
        let service = TaskCreationService::default();
        let source = vault.join("projects/old.md");
        fs::create_dir_all(source.parent().unwrap()).unwrap();
        fs::write(&source, "- [ ] Changed +old").unwrap();

        let error = service
            .move_task_project(
                &vault,
                &AppConfig::default(),
                &connection,
                source.to_str().unwrap(),
                1,
                "- [ ] Original +old",
                "- [ ] Original +new",
                submitted_at(),
            )
            .unwrap_err();

        assert_eq!(error.code, MoveTaskProjectErrorCode::InvalidSource);
        assert!(!vault.join("projects/new.md").exists());
        assert_eq!(fs::read_to_string(source).unwrap(), "- [ ] Changed +old");
    }

    #[test]
    fn destination_failure_leaves_source_untouched() {
        let (_temp, vault, connection) = setup();
        let service = TaskCreationService::default();
        let source = vault.join("inbox.md");
        let original = "- [ ] Parent";
        fs::write(&source, original).unwrap();
        fs::create_dir_all(vault.join("projects/new.md")).unwrap();

        let error = service
            .move_task_project(
                &vault,
                &AppConfig::default(),
                &connection,
                source.to_str().unwrap(),
                1,
                original,
                "- [ ] Parent +new",
                submitted_at(),
            )
            .unwrap_err();

        assert_eq!(error.code, MoveTaskProjectErrorCode::InvalidDestination);
        assert_eq!(fs::read_to_string(source).unwrap(), original);
    }

    #[test]
    fn move_inserts_into_existing_destination_without_replacing_content() {
        let (_temp, vault, connection) = setup();
        let service = TaskCreationService::default();
        let source = vault.join("projects/old.md");
        let destination = vault.join("projects/new.md");
        fs::create_dir_all(source.parent().unwrap()).unwrap();
        let original = "- [ ] Parent +old";
        fs::write(&source, original).unwrap();
        fs::write(&destination, "# Existing\n\n## Tasks\n\nKeep this text.\n").unwrap();
        index_single_file(&connection, source.to_str().unwrap()).unwrap();

        service
            .move_task_project(
                &vault,
                &AppConfig::default(),
                &connection,
                source.to_str().unwrap(),
                1,
                original,
                "- [ ] Parent +new",
                submitted_at(),
            )
            .unwrap();

        let content = fs::read_to_string(destination).unwrap();
        assert!(content.contains("# Existing"));
        assert!(content.contains("Keep this text."));
        assert!(content.contains("Parent +new"));
    }

    #[test]
    fn conflicting_subtask_project_aborts_before_destination_write() {
        let (_temp, vault, connection) = setup();
        let service = TaskCreationService::default();
        let source = vault.join("projects/old.md");
        fs::create_dir_all(source.parent().unwrap()).unwrap();
        let original = "- [ ] Parent +old\n    - [ ] Child";
        fs::write(&source, original).unwrap();

        let error = service
            .move_task_project(
                &vault,
                &AppConfig::default(),
                &connection,
                source.to_str().unwrap(),
                1,
                original,
                "- [ ] Parent +new\n    - [ ] Child +other",
                submitted_at(),
            )
            .unwrap_err();

        assert_eq!(error.code, MoveTaskProjectErrorCode::InvalidSource);
        assert!(!vault.join("projects/new.md").exists());
        assert_eq!(fs::read_to_string(source).unwrap(), original);
    }

    #[test]
    fn multiple_root_projects_are_rejected() {
        let error = validate_moved_subtree("- [ ] Parent +one +two").unwrap_err();
        assert_eq!(error.code, MoveTaskProjectErrorCode::InvalidSource);
    }

    #[test]
    fn source_removal_failure_rolls_destination_back() {
        let (_temp, vault, connection) = setup();
        let service = TaskCreationService::default();
        let source = vault.join("projects/old.md");
        fs::create_dir_all(source.parent().unwrap()).unwrap();
        let original = "- [ ] Parent +old";
        fs::write(&source, original).unwrap();
        let source_for_hook = source.clone();

        let error = service
            .move_task_project_with_hook(
                &vault,
                &AppConfig::default(),
                &connection,
                source.to_str().unwrap(),
                1,
                original,
                "- [ ] Parent +new",
                submitted_at(),
                move |_| fs::write(source_for_hook, "- [ ] External change +old").unwrap(),
            )
            .unwrap_err();

        assert_eq!(error.code, MoveTaskProjectErrorCode::SourceRemovalFailed);
        assert!(!error.recovery_required);
        let destination = vault.join("projects/new.md");
        assert!(!fs::read_to_string(destination)
            .unwrap()
            .contains("Parent +new"));
    }

    #[test]
    fn failed_destination_rollback_reports_recovery_state() {
        let (_temp, vault, connection) = setup();
        let service = TaskCreationService::default();
        let source = vault.join("projects/old.md");
        fs::create_dir_all(source.parent().unwrap()).unwrap();
        let original = "- [ ] Parent +old";
        fs::write(&source, original).unwrap();
        let source_for_hook = source.clone();

        let error = service
            .move_task_project_with_hook(
                &vault,
                &AppConfig::default(),
                &connection,
                source.to_str().unwrap(),
                1,
                original,
                "- [ ] Parent +new",
                submitted_at(),
                move |destination| {
                    fs::write(source_for_hook, "- [ ] External source change +old").unwrap();
                    let changed = fs::read_to_string(destination)
                        .unwrap()
                        .replace("Parent +new", "External destination change +new");
                    fs::write(destination, changed).unwrap();
                },
            )
            .unwrap_err();

        assert_eq!(error.code, MoveTaskProjectErrorCode::RollbackFailed);
        assert!(error.recovery_required);
        assert!(fs::read_to_string(vault.join("projects/new.md"))
            .unwrap()
            .contains("External destination change +new"));
    }

    #[test]
    fn project_casefold_collision_blocks_creation() {
        let (_temp, vault, connection) = setup();
        let service = TaskCreationService::default();
        service
            .create_task(
                &vault,
                &AppConfig::default(),
                &connection,
                "first",
                &draft("First", Some("straße")),
                submitted_at(),
            )
            .unwrap();

        let error = service
            .create_task(
                &vault,
                &AppConfig::default(),
                &connection,
                "second",
                &draft("Second", Some("STRASSE")),
                submitted_at(),
            )
            .unwrap_err();
        assert_eq!(error.code, CreateTaskErrorCode::ProjectCollision);
    }

    #[test]
    fn undo_removes_exact_created_subtree_and_reindexes() {
        let (_temp, vault, connection) = setup();
        let service = TaskCreationService::default();
        let mut parent = draft("Parent", Some("work"));
        parent.subtasks.push(draft("Child", Some("WORK")));
        let created = service
            .create_task(
                &vault,
                &AppConfig::default(),
                &connection,
                "undo",
                &parent,
                submitted_at(),
            )
            .unwrap();

        service
            .undo_created_task(&vault, &connection, &created.undo_receipt)
            .unwrap();

        let content = fs::read_to_string(&created.destination_path).unwrap();
        assert!(!content.contains("Parent"));
        assert!(!content.contains("Child"));
        assert!(query_tasks(&connection, "1 = 1", &[]).unwrap().is_empty());
    }

    #[test]
    fn undo_rejects_tampered_receipt() {
        let (_temp, vault, connection) = setup();
        let service = TaskCreationService::default();
        let mut receipt = UndoCreateReceipt {
            file_path: vault.join("inbox.md").to_string_lossy().into_owned(),
            line_number: 1,
            raw_markdown: "- [ ] Task".to_string(),
            source_fingerprint: source_fingerprint("- [ ] Task"),
        };
        receipt.raw_markdown = "- [ ] Other".to_string();

        assert_eq!(
            service
                .undo_created_task(&vault, &connection, &receipt)
                .unwrap_err()
                .code,
            WriteErrorCode::InvalidSource
        );
    }

    #[test]
    fn undo_recovers_after_unambiguous_line_shift() {
        let (_temp, vault, connection) = setup();
        let service = TaskCreationService::default();
        let created = service
            .create_task(
                &vault,
                &AppConfig::default(),
                &connection,
                "shifted-undo",
                &draft("Shifted", None),
                submitted_at(),
            )
            .unwrap();
        let original = fs::read_to_string(&created.destination_path).unwrap();
        fs::write(
            &created.destination_path,
            format!("New heading\n{original}"),
        )
        .unwrap();

        service
            .undo_created_task(&vault, &connection, &created.undo_receipt)
            .unwrap();

        let content = fs::read_to_string(created.destination_path).unwrap();
        assert!(content.starts_with("New heading\n"));
        assert!(!content.contains("Shifted"));
    }

    #[test]
    fn undo_rejects_ambiguous_shift_without_mutation() {
        let (_temp, vault, connection) = setup();
        let service = TaskCreationService::default();
        let created = service
            .create_task(
                &vault,
                &AppConfig::default(),
                &connection,
                "ambiguous-undo",
                &draft("Duplicate", None),
                submitted_at(),
            )
            .unwrap();
        let original = fs::read_to_string(&created.destination_path).unwrap();
        let changed = format!("Shift\n{original}{}\n", created.undo_receipt.raw_markdown);
        fs::write(&created.destination_path, &changed).unwrap();

        let error = service
            .undo_created_task(&vault, &connection, &created.undo_receipt)
            .unwrap_err();

        assert_eq!(error.code, WriteErrorCode::SourceAmbiguous);
        assert_eq!(
            fs::read_to_string(created.destination_path).unwrap(),
            changed
        );
    }

    #[test]
    fn eof_mode_returns_informational_warning() {
        let (_temp, vault, connection) = setup();
        let service = TaskCreationService::default();
        let mut config = AppConfig::default();
        config.templates.inbox.insertion.mode = InsertionMode::Eof;
        config.templates.inbox.insertion.target = None;

        let result = service
            .create_task(
                &vault,
                &config,
                &connection,
                "eof",
                &draft("Task", None),
                submitted_at(),
            )
            .unwrap();

        assert_eq!(
            result.warning.unwrap().code,
            crate::task_writer::CreateWarningCode::AppendedAtEof
        );
    }

    #[test]
    fn preview_resolves_destination_without_creating_file() {
        let (_temp, vault, connection) = setup();
        let service = TaskCreationService::default();
        let preview = service
            .preview_task_draft(
                &vault,
                &AppConfig::default(),
                &connection,
                "Preview +work/project",
                &CaptureContext::default(),
                submitted_at(),
            )
            .unwrap();

        assert!(preview
            .destination_path
            .ends_with("projects/work/project.md"));
        assert!(!Path::new(&preview.destination_path).exists());
    }

    #[test]
    fn project_merge_service_prepares_commits_and_reconciles_index() {
        let (_temp, vault, connection) = setup();
        fs::create_dir_all(vault.join("projects/old")).unwrap();
        fs::create_dir_all(vault.join("projects/new")).unwrap();
        let note = vault.join("tasks.md");
        fs::write(&note, "- [ ] Source +old\n- [ ] Destination +new\n").unwrap();
        fs::write(vault.join("projects/old/file.txt"), "move").unwrap();
        crate::db::index_files(&connection, &[note.to_string_lossy().to_string()]).unwrap();
        let service = TaskCreationService::default();
        let config = AppConfig::default();

        let plan = service
            .preflight_project_merge(&vault, &config, "old", "new")
            .unwrap();
        service
            .prepare_project_merge(&vault, &config, &plan.plan_token)
            .unwrap();
        service
            .execute_project_merge(&vault, &config, &connection, &plan.plan_token)
            .unwrap();

        assert_eq!(
            fs::read_to_string(&note).unwrap(),
            "- [ ] Source +new\n- [ ] Destination +new\n"
        );
        assert_eq!(
            fs::read_to_string(vault.join("projects/new/file.txt")).unwrap(),
            "move"
        );
        assert!(query_tasks(&connection, "tasks.project = 'old'", &[])
            .unwrap()
            .is_empty());
        assert_eq!(
            query_tasks(&connection, "tasks.project = 'new'", &[])
                .unwrap()
                .len(),
            2
        );
    }

    #[test]
    fn project_merge_bulk_resolution_requires_exact_confirmation_count() {
        let (_temp, vault, _connection) = setup();
        fs::create_dir_all(vault.join("projects/old")).unwrap();
        fs::create_dir_all(vault.join("projects/new")).unwrap();
        fs::write(
            vault.join("tasks.md"),
            "- [ ] Source +old\n- [ ] Destination +new\n",
        )
        .unwrap();
        fs::write(vault.join("projects/old/config.json"), "source").unwrap();
        fs::write(vault.join("projects/new/config.json"), "destination").unwrap();
        let service = TaskCreationService::default();
        let config = AppConfig::default();
        let plan = service
            .preflight_project_merge(&vault, &config, "old", "new")
            .unwrap();
        let conflict_id = plan.conflicts[0].id.clone();

        let error = service
            .resolve_project_merge_conflicts_bulk(
                &plan.plan_token,
                ProjectMergeBulkResolution {
                    conflict_ids: vec![conflict_id.clone()],
                    action: crate::project_merge::ProjectMergeResolutionAction::UseSource,
                    confirmed_count: 2,
                },
            )
            .unwrap_err();
        assert_eq!(error.code, ProjectMergeErrorCode::InvalidResolution);

        service
            .resolve_project_merge_conflicts_bulk(
                &plan.plan_token,
                ProjectMergeBulkResolution {
                    conflict_ids: vec![conflict_id],
                    action: crate::project_merge::ProjectMergeResolutionAction::UseSource,
                    confirmed_count: 1,
                },
            )
            .unwrap();
        service
            .prepare_project_merge(&vault, &config, &plan.plan_token)
            .unwrap();
    }
}
