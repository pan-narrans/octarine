#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use octarine::app_state::AppState;
use octarine::config::{
    expand_home, load_or_migrate_config, save_config, validate_config_for_vault, TaskCreationConfig,
};
use octarine::db::{
    boot_sweep_with_diagnostics, delete_file, index_single_file, initialize_db, query_tasks,
};
use octarine::diagnostics::Diagnostics;
use octarine::file_ops::{
    create_directory_on_disk, create_file_on_disk, delete_path_on_disk, read_file_content_on_disk,
    rename_path_on_disk, scan_dir_tree, write_file_content_on_disk, FileNode,
};
use octarine::parser::{ParsedCustomView, ParsedTask};
use octarine::path_security::{
    canonicalize_root, resolve_child_within, resolve_descendant_within, resolve_existing_within,
    resolve_new_within,
};
use octarine::project_rename::{ProjectRenameError, ProjectRenamePlan, ProjectRenameResult};
use octarine::query_dsl::compile_filter_to_sql;
use octarine::task_creation::{CaptureContext, TaskDraft, TaskDraftPreview};
use octarine::task_service::{
    CreateTaskError, CreateTaskErrorCode, CreateTaskResult, MoveTaskProjectError,
    MoveTaskProjectResult, UndoCreateReceipt,
};
use octarine::watcher_service::build_vault_watcher;
use octarine::writer::{
    delete_task_markdown_in_file, move_task_in_file, update_task_status_in_file, WriteError,
};
use tauri::Manager;
use tauri::State;

fn resolve_vault_path(
    state: &State<'_, AppState>,
    path: &str,
    allow_root: bool,
) -> Result<String, String> {
    let root = state.vault_dir.lock().unwrap();
    resolve_existing_within(&*root, path, allow_root)
        .map(|path| path.to_string_lossy().into_owned())
}

fn resolve_content_path(state: &State<'_, AppState>, path: &str) -> Result<String, String> {
    let vault_root = state.vault_dir.lock().unwrap().clone();
    resolve_existing_within(&vault_root, path, false)
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|_| "Path is outside the configured vault root.".to_string())
}

#[tauri::command]
fn get_tasks(
    state: State<'_, AppState>,
    filter: Option<String>,
) -> Result<Vec<ParsedTask>, String> {
    let conn = state.db.lock().unwrap();
    let compiled = match filter {
        Some(f) if !f.trim().is_empty() => compile_filter_to_sql(&f)?,
        _ => compile_filter_to_sql("")?,
    };

    query_tasks(&conn, &compiled.sql, &compiled.params).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_custom_views(state: State<'_, AppState>) -> Result<Vec<ParsedCustomView>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT line_number, title, query_raw FROM custom_views")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ParsedCustomView {
                line_number: row.get(0)?,
                title: row.get(1)?,
                query_raw: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut views = Vec::new();
    for row in rows {
        views.push(row.map_err(|e| e.to_string())?);
    }
    Ok(views)
}

#[tauri::command]
fn preview_task_draft(
    state: State<'_, AppState>,
    input: String,
    capture_context: CaptureContext,
) -> Result<TaskDraftPreview, CreateTaskError> {
    let vault = state.vault_dir.lock().unwrap().clone();
    let config = state.config.lock().unwrap().clone();
    let connection = state.db.lock().unwrap();
    state.task_creation.preview_task_draft(
        std::path::Path::new(&vault),
        &config,
        &connection,
        &input,
        &capture_context,
        chrono::Local::now().fixed_offset(),
    )
}

#[tauri::command]
fn create_task(
    state: State<'_, AppState>,
    operation_id: String,
    draft: TaskDraft,
) -> Result<CreateTaskResult, CreateTaskError> {
    let vault = state.vault_dir.lock().unwrap().clone();
    let config = state.config.lock().unwrap().clone();
    let connection = state.db.lock().unwrap();
    let result = state.task_creation.create_task(
        std::path::Path::new(&vault),
        &config,
        &connection,
        &operation_id,
        &draft,
        chrono::Local::now().fixed_offset(),
    );
    if let Err(error) = &result {
        record_create_failure(&state.diagnostics, error.code);
    }
    result
}

#[tauri::command]
fn undo_created_task(
    state: State<'_, AppState>,
    receipt: UndoCreateReceipt,
) -> Result<(), WriteError> {
    let vault = state.vault_dir.lock().unwrap().clone();
    let connection = state.db.lock().unwrap();
    let result =
        state
            .task_creation
            .undo_created_task(std::path::Path::new(&vault), &connection, &receipt);
    if result.is_err() {
        state.diagnostics.error(
            "task_create.undo_failed",
            "Created task could not be undone safely.",
        );
    }
    result
}

#[tauri::command]
fn move_task_project(
    state: State<'_, AppState>,
    source_file_path: String,
    original_line_number: usize,
    original_raw_markdown: String,
    new_raw_markdown: String,
) -> Result<MoveTaskProjectResult, MoveTaskProjectError> {
    let vault = state.vault_dir.lock().unwrap().clone();
    let config = state.config.lock().unwrap().clone();
    let connection = state.db.lock().unwrap();
    state.task_creation.move_task_project(
        std::path::Path::new(&vault),
        &config,
        &connection,
        &source_file_path,
        original_line_number,
        &original_raw_markdown,
        &new_raw_markdown,
        chrono::Local::now().fixed_offset(),
    )
}

#[tauri::command]
fn preflight_project_rename(
    state: State<'_, AppState>,
    source_project: String,
    destination_project: String,
) -> Result<ProjectRenamePlan, ProjectRenameError> {
    let vault = state.vault_dir.lock().unwrap().clone();
    let config = state.config.lock().unwrap().clone();
    state.task_creation.preflight_project_rename(
        std::path::Path::new(&vault),
        &config,
        &source_project,
        &destination_project,
    )
}

#[tauri::command]
fn execute_project_rename(
    state: State<'_, AppState>,
    plan_token: String,
) -> Result<ProjectRenameResult, ProjectRenameError> {
    let vault = state.vault_dir.lock().unwrap().clone();
    let config = state.config.lock().unwrap().clone();
    let connection = state.db.lock().unwrap();
    state.task_creation.execute_project_rename(
        std::path::Path::new(&vault),
        &config,
        &connection,
        &plan_token,
    )
}

fn record_create_failure(diagnostics: &Diagnostics, code: CreateTaskErrorCode) {
    let (event, message) = match code {
        CreateTaskErrorCode::InvalidDraft => (
            "task_create.invalid_draft",
            "Task creation draft validation failed.",
        ),
        CreateTaskErrorCode::InvalidDestination => (
            "task_create.invalid_destination",
            "Task creation destination validation failed.",
        ),
        CreateTaskErrorCode::ProjectCollision => (
            "task_create.project_collision",
            "Task creation found a project identity collision.",
        ),
        CreateTaskErrorCode::DestinationConflict => (
            "task_create.destination_conflict",
            "Task creation stopped after repeated destination changes.",
        ),
        CreateTaskErrorCode::IndexFailed => (
            "task_create.index_failed",
            "Task creation derived index refresh failed.",
        ),
        CreateTaskErrorCode::OperationFailed => (
            "task_create.operation_failed",
            "Task creation filesystem operation failed.",
        ),
    };
    diagnostics.error(event, message);
}

#[tauri::command]
fn update_task_status(
    state: State<'_, AppState>,
    file_path: String,
    line_number: usize,
    original_raw_markdown: String,
    new_status: String,
) -> Result<(), WriteError> {
    let file_path = resolve_vault_path(&state, &file_path, false)
        .map_err(|_| WriteError::operation_failed())?;
    update_task_status_in_file(&file_path, line_number, &original_raw_markdown, &new_status)?;
    let conn = state.db.lock().unwrap();
    index_single_file(&conn, &file_path).map_err(|_| WriteError::operation_failed())?;
    Ok(())
}

#[tauri::command]
fn move_task(
    state: State<'_, AppState>,
    file_path: String,
    line_number: usize,
    original_raw_markdown: String,
    new_status: String,
    new_primary_context: Option<String>,
) -> Result<(), WriteError> {
    let file_path = resolve_vault_path(&state, &file_path, false)
        .map_err(|_| WriteError::operation_failed())?;
    move_task_in_file(
        &file_path,
        line_number,
        &original_raw_markdown,
        &new_status,
        new_primary_context.as_deref(),
    )?;
    let conn = state.db.lock().unwrap();
    index_single_file(&conn, &file_path).map_err(|_| WriteError::operation_failed())?;
    Ok(())
}

#[tauri::command]
fn update_task_markdown(
    state: State<'_, AppState>,
    file_path: String,
    line_number: usize,
    original_raw_markdown: String,
    new_raw_markdown: String,
) -> Result<(), WriteError> {
    let file_path = resolve_vault_path(&state, &file_path, false)
        .map_err(|_| WriteError::operation_failed())?;
    octarine::writer::update_task_markdown_in_file(
        &file_path,
        line_number,
        &original_raw_markdown,
        &new_raw_markdown,
    )?;
    let conn = state.db.lock().unwrap();
    index_single_file(&conn, &file_path).map_err(|_| WriteError::operation_failed())?;
    Ok(())
}

#[tauri::command]
fn delete_task_markdown(
    state: State<'_, AppState>,
    file_path: String,
    line_number: usize,
    original_raw_markdown: String,
) -> Result<(), WriteError> {
    let file_path = resolve_vault_path(&state, &file_path, false)
        .map_err(|_| WriteError::operation_failed())?;
    delete_task_markdown_in_file(&file_path, line_number, &original_raw_markdown)?;
    let conn = state.db.lock().unwrap();
    index_single_file(&conn, &file_path).map_err(|_| WriteError::operation_failed())?;
    Ok(())
}

#[tauri::command]
fn get_vault_config(state: State<'_, AppState>) -> Result<String, String> {
    let vault_dir = state.vault_dir.lock().unwrap();
    Ok(vault_dir.clone())
}

#[tauri::command]
fn get_task_creation_config(state: State<'_, AppState>) -> Result<TaskCreationConfig, String> {
    Ok(state.config.lock().unwrap().task_creation_config())
}

#[tauri::command]
fn set_task_creation_config(
    state: State<'_, AppState>,
    settings: TaskCreationConfig,
) -> Result<TaskCreationConfig, String> {
    let vault_dir = state.vault_dir.lock().unwrap().clone();
    let mut updated = state.config.lock().unwrap().clone();
    updated.apply_task_creation_config(settings);
    validate_config_for_vault(&updated, std::path::Path::new(&vault_dir))?;

    let journal_dir = resolve_descendant_within(&vault_dir, &updated.journal_folder, false)?;
    std::fs::create_dir_all(&journal_dir)
        .map_err(|error| format!("Failed to create journal directory: {error}"))?;
    let journal_dir = canonicalize_root(&journal_dir)?;

    {
        let mut config = state.config.lock().unwrap();
        save_config(&state.config_path, &updated)?;
        *config = updated.clone();
    }
    *state.journal_dir.lock().unwrap() = Some(journal_dir.to_string_lossy().into_owned());

    Ok(updated.task_creation_config())
}

#[tauri::command]
fn update_event_schedule(
    state: State<'_, AppState>,
    file_path: String,
    line_number: usize,
    original_raw_markdown: String,
    new_s_start: Option<String>,
    new_duration_secs: Option<i32>,
) -> Result<(), WriteError> {
    let file_path = resolve_vault_path(&state, &file_path, false)
        .map_err(|_| WriteError::operation_failed())?;
    octarine::writer::update_event_schedule_in_file(
        &file_path,
        line_number,
        &original_raw_markdown,
        new_s_start,
        new_duration_secs,
    )?;
    let conn = state.db.lock().unwrap();
    index_single_file(&conn, &file_path).map_err(|_| WriteError::operation_failed())?;
    Ok(())
}

#[tauri::command]
fn set_vault_config(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    new_dir: String,
) -> Result<(), String> {
    let home_dir = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    let mut resolved_dir = expand_home(&new_dir, std::path::Path::new(&home_dir))
        .to_string_lossy()
        .into_owned();

    // Ensure directory exists
    std::fs::create_dir_all(&resolved_dir)
        .map_err(|e| format!("Failed to create directory: {}", e))?;
    resolved_dir = canonicalize_root(&resolved_dir)?
        .to_string_lossy()
        .into_owned();
    let current_config = state.config.lock().unwrap().clone();
    validate_config_for_vault(&current_config, std::path::Path::new(&resolved_dir))?;
    let replacement_journal = if current_config.journal_migration.is_none() {
        let path = resolve_descendant_within(&resolved_dir, &current_config.journal_folder, false)?;
        std::fs::create_dir_all(&path)
            .map_err(|e| format!("Failed to create journal directory: {e}"))?;
        Some(canonicalize_root(&path)?.to_string_lossy().into_owned())
    } else {
        None
    };
    let replacement_watcher = build_vault_watcher(
        &state.db_path,
        &resolved_dir,
        app,
        state.diagnostics.clone(),
    )?;

    {
        let mut config = state.config.lock().unwrap();
        let mut updated = current_config;
        updated.vault_dir = new_dir;
        save_config(&state.config_path, &updated)?;
        *config = updated;
    }

    // Clear old tables inside the SQLite cache
    let conn = state.db.lock().unwrap();
    conn.execute("DELETE FROM tasks", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM custom_views", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM files", [])
        .map_err(|e| e.to_string())?;

    // Perform an immediate fresh boot sweep indexing the newly configured vault
    boot_sweep_with_diagnostics(&conn, &resolved_dir, Some(&state.diagnostics))
        .map_err(|e| e.to_string())?;
    drop(conn);

    {
        let mut vault_lock = state.vault_dir.lock().unwrap();
        *vault_lock = resolved_dir.clone();
    }
    {
        *state.journal_dir.lock().unwrap() = replacement_journal;
    }
    *state.watcher.lock().unwrap() = Some(replacement_watcher);

    Ok(())
}

#[tauri::command]
fn get_journal_config(state: State<'_, AppState>) -> Result<String, String> {
    let journal_dir = state.journal_dir.lock().unwrap();
    journal_dir.clone().ok_or_else(|| {
        "Journal setup requires a folder inside the configured vault; no files were moved."
            .to_string()
    })
}

#[tauri::command]
fn set_journal_config(state: State<'_, AppState>, new_dir: String) -> Result<(), String> {
    let vault_dir = state.vault_dir.lock().unwrap().clone();
    let home_dir = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    let requested_dir = expand_home(&new_dir, std::path::Path::new(&home_dir));
    let resolved_dir = resolve_descendant_within(&vault_dir, &requested_dir, false)?;
    let canonical_vault = canonicalize_root(&vault_dir)?;
    let relative_dir = resolved_dir
        .strip_prefix(&canonical_vault)
        .map_err(|_| "Journal folder must be inside the configured vault.".to_string())?
        .to_string_lossy()
        .into_owned();
    let mut updated = state.config.lock().unwrap().clone();
    updated.journal_folder = relative_dir;
    updated.journal_migration = None;
    validate_config_for_vault(&updated, &canonical_vault)?;
    std::fs::create_dir_all(&resolved_dir)
        .map_err(|e| format!("Failed to create directory: {e}"))?;
    let resolved_dir = canonicalize_root(&resolved_dir)?;

    {
        let mut config = state.config.lock().unwrap();
        save_config(&state.config_path, &updated)?;
        *config = updated;
    }

    // Update active journal_dir inside AppState under lock
    {
        let mut journal_lock = state.journal_dir.lock().unwrap();
        *journal_lock = Some(resolved_dir.to_string_lossy().into_owned());
    }

    Ok(())
}

#[tauri::command]
fn read_journal_tree(state: State<'_, AppState>) -> Result<FileNode, String> {
    let journal_dir = state.journal_dir.lock().unwrap();
    let journal_dir = journal_dir.as_ref().ok_or_else(|| {
        "Journal setup requires a folder inside the configured vault; no files were moved."
            .to_string()
    })?;
    let path = std::path::Path::new(journal_dir);
    octarine::file_ops::build_journal_tree(path)
}

// -----------------------------------------------------------------
// NEW FILE OPERATIONS TAURI IPC COMMANDS
// -----------------------------------------------------------------

#[tauri::command]
fn read_dir_tree(state: State<'_, AppState>) -> Result<FileNode, String> {
    let vault_dir = state.vault_dir.lock().unwrap();
    let path = std::path::Path::new(&*vault_dir);
    scan_dir_tree(path)
}

#[tauri::command]
fn create_file(
    state: State<'_, AppState>,
    parent_dir: String,
    name: String,
) -> Result<String, String> {
    let root = state.vault_dir.lock().unwrap();
    let path = resolve_child_within(&*root, &parent_dir, &name)?;
    let parent = path.parent().unwrap().to_string_lossy();
    create_file_on_disk(&parent, &name)
}

#[tauri::command]
fn create_directory(
    state: State<'_, AppState>,
    parent_dir: String,
    name: String,
) -> Result<String, String> {
    let root = state.vault_dir.lock().unwrap();
    let path = resolve_child_within(&*root, &parent_dir, &name)?;
    let parent = path.parent().unwrap().to_string_lossy();
    create_directory_on_disk(&parent, &name)
}

#[tauri::command]
fn delete_path(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let path = resolve_vault_path(&state, &path, false)?;
    delete_path_on_disk(&path)?;
    let conn = state.db.lock().unwrap();
    delete_file(&conn, &path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn rename_path(
    state: State<'_, AppState>,
    old_path: String,
    new_path: String,
) -> Result<(), String> {
    let old_path = resolve_vault_path(&state, &old_path, false)?;
    let new_path = {
        let root = state.vault_dir.lock().unwrap();
        resolve_new_within(&*root, &new_path)?
            .to_string_lossy()
            .into_owned()
    };
    rename_path_on_disk(&old_path, &new_path)?;
    let conn = state.db.lock().unwrap();

    // Clear old indexed references in SQLite
    delete_file(&conn, &old_path).map_err(|e| e.to_string())?;

    // Perform immediate re-indexing of the moved path
    if new_path.ends_with(".md") {
        index_single_file(&conn, &new_path).map_err(|e| e.to_string())?;
    } else if std::path::Path::new(&new_path).is_dir() {
        boot_sweep_with_diagnostics(&conn, &new_path, Some(&state.diagnostics))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn read_file_content(state: State<'_, AppState>, path: String) -> Result<String, String> {
    let path = resolve_content_path(&state, &path)?;
    read_file_content_on_disk(&path)
}

#[tauri::command]
fn write_file_content(
    state: State<'_, AppState>,
    path: String,
    content: String,
) -> Result<(), String> {
    let path = resolve_content_path(&state, &path)?;
    write_file_content_on_disk(&path, &content)?;
    let conn = state.db.lock().unwrap();
    index_single_file(&conn, &path).map_err(|e| e.to_string())?;
    Ok(())
}

fn main() {
    let home_dir = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    let home_path = std::path::Path::new(&home_dir);
    let platform_config_dir = tauri::api::path::config_dir()
        .expect("platform config directory is unavailable")
        .join("com.octarine.app");
    let platform_cache_dir = tauri::api::path::cache_dir()
        .expect("platform cache directory is unavailable")
        .join("com.octarine.app");
    std::fs::create_dir_all(&platform_cache_dir)
        .expect("failed to create application cache directory");
    let db_path = platform_cache_dir
        .join("index.sqlite3")
        .to_string_lossy()
        .into_owned();
    let diagnostics =
        Diagnostics::new(&platform_config_dir).expect("failed to initialize local diagnostics");
    let (config, config_path) = load_or_migrate_config(home_path, &platform_config_dir)
        .expect("failed to load application configuration");

    let vault_setting = std::env::var("OCTARINE_VAULT_DIR")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| config.vault_dir.clone());
    let mut vault_dir = expand_home(&vault_setting, home_path)
        .to_string_lossy()
        .into_owned();

    // Ensure the resolved vault physically exists on disk.
    std::fs::create_dir_all(&vault_dir).expect("failed to create vault directory");
    vault_dir = canonicalize_root(&vault_dir)
        .expect("failed to resolve vault directory")
        .to_string_lossy()
        .into_owned();
    validate_config_for_vault(&config, std::path::Path::new(&vault_dir))
        .expect("application configuration contains an invalid vault destination");
    let journal_override = std::env::var("OCTARINE_JOURNAL_FOLDER")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            std::env::var("OCTARINE_JOURNAL_DIR")
                .ok()
                .filter(|value| !value.trim().is_empty())
        });
    let journal_dir = if config.journal_migration.is_none() || journal_override.is_some() {
        let journal_setting = journal_override
            .as_deref()
            .unwrap_or(&config.journal_folder);
        let requested_journal = expand_home(journal_setting, home_path);
        let journal_path = resolve_descendant_within(&vault_dir, requested_journal, false)
            .expect("journal folder must resolve inside vault");
        std::fs::create_dir_all(&journal_path).expect("failed to create journal directory");
        Some(
            canonicalize_root(&journal_path)
                .expect("failed to resolve journal directory")
                .to_string_lossy()
                .into_owned(),
        )
    } else {
        None
    };

    let conn = initialize_db(&db_path).expect("failed to initialize SQLite Cache database");

    boot_sweep_with_diagnostics(&conn, &vault_dir, Some(&diagnostics))
        .expect("failed to run boot sweep");
    diagnostics.info("app.started", "Octarine started.");

    let mut builder = tauri::Builder::default().manage(AppState::new(
        conn,
        db_path.clone(),
        vault_dir.clone(),
        journal_dir.clone(),
        config,
        config_path,
        diagnostics,
    ));

    builder = builder.invoke_handler(tauri::generate_handler![
        get_tasks,
        get_custom_views,
        preview_task_draft,
        create_task,
        undo_created_task,
        move_task_project,
        preflight_project_rename,
        execute_project_rename,
        get_vault_config,
        set_vault_config,
        get_journal_config,
        set_journal_config,
        get_task_creation_config,
        set_task_creation_config,
        read_journal_tree,
        update_event_schedule,
        update_task_status,
        move_task,
        update_task_markdown,
        delete_task_markdown,
        read_dir_tree,
        create_file,
        create_directory,
        delete_path,
        rename_path,
        read_file_content,
        write_file_content
    ]);

    builder
        .setup(|app| {
            let state = app.state::<AppState>();
            let vault_dir = state.vault_dir.lock().unwrap().clone();
            let watcher = build_vault_watcher(
                &state.db_path,
                &vault_dir,
                app.handle(),
                state.diagnostics.clone(),
            )
            .map_err(std::io::Error::other)?;
            *state.watcher.lock().unwrap() = Some(watcher);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
