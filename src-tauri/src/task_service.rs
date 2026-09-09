use crate::config::{AppConfig, DestinationTemplate, UnprojectedDestination};
use crate::db::{index_single_file, query_tasks};
use crate::parser::ParsedTask;
use crate::path_security::resolve_descendant_within;
use crate::project::{filesystem_case_collision, resolve_project_file, ProjectPath};
use crate::task_creation::{
    parse_compact_task, serialize_task_draft, CaptureContext, TaskDraft, TaskDraftPreview,
};
use crate::task_writer::{write_task_block, CreateWarning, TaskFileWriteError};
use crate::template::{render_template, TemplateContext};
use crate::writer::{delete_task_markdown_in_file, WriteError, WriteErrorCode};
use chrono::{DateTime, Datelike, FixedOffset};
use rusqlite::types::Value;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

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

#[derive(Default)]
pub struct TaskCreationService {
    write_lock: Mutex<()>,
    completed_operations: Mutex<HashMap<String, CreateTaskResult>>,
}

impl TaskCreationService {
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
    if let Some(project_name) = &draft.project {
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
}
