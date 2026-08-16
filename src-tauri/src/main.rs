#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use notify::RecommendedWatcher;
use octarine::config::{expand_home, load_or_migrate_config, save_config, AppConfig};
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
    canonicalize_root, resolve_child_within, resolve_existing_within, resolve_new_within,
};
use octarine::query_dsl::compile_filter_to_sql;
use octarine::watcher::start_watcher;
use octarine::writer::update_task_status_in_file;
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;
use tauri::State;

struct AppState {
    db: Mutex<Connection>,
    db_path: String,
    vault_dir: Mutex<String>,
    journal_dir: Mutex<String>,
    config: Mutex<AppConfig>,
    config_path: PathBuf,
    watcher: Mutex<Option<RecommendedWatcher>>,
    diagnostics: Diagnostics,
}

fn build_vault_watcher(
    db_path: &str,
    vault_dir: &str,
    app: tauri::AppHandle,
    diagnostics: Diagnostics,
) -> Result<RecommendedWatcher, String> {
    start_watcher(
        db_path.to_string(),
        vault_dir.to_string(),
        Some(diagnostics),
        move || {
            let _ = app.emit_all("vault-changed", ());
        },
    )
    .map_err(|e| format!("Failed to watch configured vault: {e}"))
}

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
    let journal_root = state.journal_dir.lock().unwrap().clone();
    resolve_existing_within(&vault_root, path, false)
        .or_else(|_| resolve_existing_within(&journal_root, path, false))
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|_| "Path is outside the configured vault and journal roots.".to_string())
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
fn update_task_status(
    state: State<'_, AppState>,
    file_path: String,
    line_number: usize,
    original_raw_markdown: String,
    new_status: String,
) -> Result<(), String> {
    let file_path = resolve_vault_path(&state, &file_path, false)?;
    update_task_status_in_file(&file_path, line_number, &original_raw_markdown, &new_status)?;
    let conn = state.db.lock().unwrap();
    index_single_file(&conn, &file_path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn update_task_markdown(
    state: State<'_, AppState>,
    file_path: String,
    line_number: usize,
    original_raw_markdown: String,
    new_raw_markdown: String,
) -> Result<(), String> {
    let file_path = resolve_vault_path(&state, &file_path, false)?;
    octarine::writer::update_task_markdown_in_file(
        &file_path,
        line_number,
        &original_raw_markdown,
        &new_raw_markdown,
    )?;
    let conn = state.db.lock().unwrap();
    index_single_file(&conn, &file_path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_vault_config(state: State<'_, AppState>) -> Result<String, String> {
    let vault_dir = state.vault_dir.lock().unwrap();
    Ok(vault_dir.clone())
}

#[tauri::command]
fn update_event_schedule(
    state: State<'_, AppState>,
    file_path: String,
    line_number: usize,
    original_raw_markdown: String,
    new_s_start: Option<String>,
    new_duration_secs: Option<i32>,
) -> Result<(), String> {
    let file_path = resolve_vault_path(&state, &file_path, false)?;
    octarine::writer::update_event_schedule_in_file(
        &file_path,
        line_number,
        &original_raw_markdown,
        new_s_start,
        new_duration_secs,
    )?;
    let conn = state.db.lock().unwrap();
    index_single_file(&conn, &file_path).map_err(|e| e.to_string())?;
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
    let replacement_watcher = build_vault_watcher(
        &state.db_path,
        &resolved_dir,
        app,
        state.diagnostics.clone(),
    )?;

    {
        let mut config = state.config.lock().unwrap();
        let mut updated = config.clone();
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
        *vault_lock = resolved_dir;
    }
    *state.watcher.lock().unwrap() = Some(replacement_watcher);

    Ok(())
}

#[tauri::command]
fn get_journal_config(state: State<'_, AppState>) -> Result<String, String> {
    let journal_dir = state.journal_dir.lock().unwrap();
    Ok(journal_dir.clone())
}

#[tauri::command]
fn set_journal_config(state: State<'_, AppState>, new_dir: String) -> Result<(), String> {
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

    {
        let mut config = state.config.lock().unwrap();
        let mut updated = config.clone();
        updated.journal_dir = new_dir;
        save_config(&state.config_path, &updated)?;
        *config = updated;
    }

    // Update active journal_dir inside AppState under lock
    {
        let mut journal_lock = state.journal_dir.lock().unwrap();
        *journal_lock = resolved_dir;
    }

    Ok(())
}

#[tauri::command]
fn read_journal_tree(state: State<'_, AppState>) -> Result<FileNode, String> {
    let journal_dir = state.journal_dir.lock().unwrap();
    let path = std::path::Path::new(&*journal_dir);
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
    let db_path = format!("{}/.octarine_cache.db", home_dir);
    let home_path = std::path::Path::new(&home_dir);
    let platform_config_dir = tauri::api::path::config_dir()
        .expect("platform config directory is unavailable")
        .join("com.octarine.app");
    let diagnostics =
        Diagnostics::new(&platform_config_dir).expect("failed to initialize local diagnostics");
    let (config, config_path) = load_or_migrate_config(home_path, &platform_config_dir)
        .expect("failed to load application configuration");

    let vault_setting = std::env::var("OCTARINE_VAULT_DIR")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| config.vault_dir.clone());
    let journal_setting = std::env::var("OCTARINE_JOURNAL_DIR")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| config.journal_dir.clone());
    let mut vault_dir = expand_home(&vault_setting, home_path)
        .to_string_lossy()
        .into_owned();
    let mut journal_dir = expand_home(&journal_setting, home_path)
        .to_string_lossy()
        .into_owned();

    // Ensure the resolved directories physically exist on disk
    std::fs::create_dir_all(&vault_dir).expect("failed to create vault directory");
    std::fs::create_dir_all(&journal_dir).expect("failed to create journal directory");
    vault_dir = canonicalize_root(&vault_dir)
        .expect("failed to resolve vault directory")
        .to_string_lossy()
        .into_owned();
    journal_dir = canonicalize_root(&journal_dir)
        .expect("failed to resolve journal directory")
        .to_string_lossy()
        .into_owned();

    let conn = initialize_db(&db_path).expect("failed to initialize SQLite Cache database");

    boot_sweep_with_diagnostics(&conn, &vault_dir, Some(&diagnostics))
        .expect("failed to run boot sweep");
    diagnostics.info("app.started", "Octarine started.");

    let mut builder = tauri::Builder::default().manage(AppState {
        db: Mutex::new(conn),
        db_path: db_path.clone(),
        vault_dir: Mutex::new(vault_dir.clone()),
        journal_dir: Mutex::new(journal_dir.clone()),
        config: Mutex::new(config),
        config_path,
        watcher: Mutex::new(None),
        diagnostics,
    });

    builder = builder.invoke_handler(tauri::generate_handler![
        get_tasks,
        get_custom_views,
        get_vault_config,
        set_vault_config,
        get_journal_config,
        set_journal_config,
        read_journal_tree,
        update_event_schedule,
        update_task_status,
        update_task_markdown,
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
