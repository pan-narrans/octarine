#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::sync::Mutex;
use tauri::State;
use tauri::Manager;
use octarine::parser::{ParsedTask, ParsedCustomView};
use octarine::file_ops::{FileNode, scan_dir_tree, create_file_on_disk, create_directory_on_disk, delete_path_on_disk, rename_path_on_disk, read_file_content_on_disk, write_file_content_on_disk};
use octarine::db::{initialize_db, boot_sweep, index_single_file, delete_file};
use octarine::writer::update_task_status_in_file;
use octarine::query_dsl::compile_filter_to_sql;
use octarine::watcher::start_watcher;
use rusqlite::Connection;

struct AppState {
    db: Mutex<Connection>,
    db_path: String,
    vault_dir: Mutex<String>,
}

#[tauri::command]
fn get_tasks(state: State<'_, AppState>, filter: Option<String>) -> Result<Vec<ParsedTask>, String> {
    let conn = state.db.lock().unwrap();
    let where_clause = match filter {
        Some(f) if !f.trim().is_empty() => compile_filter_to_sql(&f)?,
        _ => "1 = 1".to_string(),
    };

    let query_str = format!(
        "SELECT tasks.line_number, tasks.raw_markdown, tasks.hash, tasks.status, tasks.type, tasks.description, tasks.project, tasks.due_date, tasks.s_start, tasks.duration_secs, tasks.recurring, tasks.when_done, tasks.parse_errors, files.path FROM tasks JOIN files ON files.id = tasks.file_id WHERE {}",
        where_clause
    );

    let mut stmt = conn.prepare(&query_str).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        let line_number: usize = row.get(0)?;
        let raw_markdown: String = row.get(1)?;
        let hash: String = row.get(2)?;
        let status: String = row.get(3)?;
        let task_type: String = row.get(4)?;
        let description: String = row.get(5)?;
        let project: Option<String> = row.get(6)?;
        let due_date: Option<String> = row.get(7)?;
        let s_start: Option<String> = row.get(8)?;
        let duration_secs: Option<i32> = row.get(9)?;
        let recurring: Option<String> = row.get(10)?;
        let when_done: Option<String> = row.get(11)?;
        let parse_errors: Option<String> = row.get(12)?;
        let file_path: String = row.get(13)?;

        Ok(ParsedTask {
            line_number,
            raw_markdown,
            hash,
            status,
            task_type,
            description,
            project,
            due_date,
            s_start,
            duration_secs,
            recurring,
            when_done,
            tags: vec![],
            contexts: vec![],
            parse_errors,
            file_path: Some(file_path),
        })
    }).map_err(|e| e.to_string())?;

    let mut tasks = Vec::new();
    for row in rows {
        tasks.push(row.map_err(|e| e.to_string())?);
    }
    Ok(tasks)
}

#[tauri::command]
fn get_custom_views(state: State<'_, AppState>) -> Result<Vec<ParsedCustomView>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn.prepare("SELECT line_number, title, query_raw FROM custom_views").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(ParsedCustomView {
            line_number: row.get(0)?,
            title: row.get(1)?,
            query_raw: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?;

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
    hash: String,
    new_status: String,
) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    update_task_status_in_file(&conn, &file_path, line_number, &hash, &new_status)?;
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
    hash: String,
    new_s_start: Option<String>,
    new_duration_secs: Option<i32>,
) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    octarine::writer::update_event_schedule_in_file(
        &conn,
        &file_path,
        line_number,
        &hash,
        new_s_start,
        new_duration_secs,
    )?;
    index_single_file(&conn, &file_path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn set_vault_config(state: State<'_, AppState>, new_dir: String) -> Result<(), String> {
    let home_dir = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    let config_path = format!("{}/.octarine_config.json", home_dir);

    let mut resolved_dir = new_dir.clone();
    if resolved_dir.starts_with("~/") {
        resolved_dir = resolved_dir.replace("~", &home_dir);
    }

    // Ensure directory exists
    std::fs::create_dir_all(&resolved_dir)
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    // Save to configuration file
    let config_data = serde_json::json!({
        "vault_dir": new_dir
    });
    let config_str = serde_json::to_string_pretty(&config_data)
        .map_err(|e| e.to_string())?;
    std::fs::write(&config_path, config_str)
        .map_err(|e| format!("Failed to write config file: {}", e))?;

    // Update active vault_dir inside AppState under lock
    {
        let mut vault_lock = state.vault_dir.lock().unwrap();
        *vault_lock = resolved_dir.clone();
    }

    // Clear old tables inside the SQLite cache
    let conn = state.db.lock().unwrap();
    conn.execute("DELETE FROM tasks", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM custom_views", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM files", []).map_err(|e| e.to_string())?;

    // Perform an immediate fresh boot sweep indexing the newly configured vault
    boot_sweep(&conn, &resolved_dir).map_err(|e| e.to_string())?;

    Ok(())
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
fn create_file(parent_dir: String, name: String) -> Result<String, String> {
    create_file_on_disk(&parent_dir, &name)
}

#[tauri::command]
fn create_directory(parent_dir: String, name: String) -> Result<String, String> {
    create_directory_on_disk(&parent_dir, &name)
}

#[tauri::command]
fn delete_path(state: State<'_, AppState>, path: String) -> Result<(), String> {
    delete_path_on_disk(&path)?;
    let conn = state.db.lock().unwrap();
    delete_file(&conn, &path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn rename_path(state: State<'_, AppState>, old_path: String, new_path: String) -> Result<(), String> {
    rename_path_on_disk(&old_path, &new_path)?;
    let conn = state.db.lock().unwrap();

    // Clear old indexed references in SQLite
    delete_file(&conn, &old_path).map_err(|e| e.to_string())?;

    // Perform immediate re-indexing of the moved path
    if new_path.ends_with(".md") {
        index_single_file(&conn, &new_path).map_err(|e| e.to_string())?;
    } else if std::path::Path::new(&new_path).is_dir() {
        boot_sweep(&conn, &new_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn read_file_content(path: String) -> Result<String, String> {
    read_file_content_on_disk(&path)
}

#[tauri::command]
fn write_file_content(state: State<'_, AppState>, path: String, content: String) -> Result<(), String> {
    write_file_content_on_disk(&path, &content)?;
    let conn = state.db.lock().unwrap();
    index_single_file(&conn, &path).map_err(|e| e.to_string())?;
    Ok(())
}

fn main() {
    let home_dir = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    let db_path = format!("{}/.octarine_cache.db", home_dir);
    let config_path = format!("{}/.octarine_config.json", home_dir);

    // 1. Resolve configurable vault directory
    let mut vault_dir = format!("{}/octarine_vault", home_dir);

    // Read GITHUB/OS environment variables first
    if let Ok(env_vault) = std::env::var("OCTARINE_VAULT_DIR") {
        if !env_vault.trim().is_empty() {
            vault_dir = env_vault;
        }
    } else if std::path::Path::new(&config_path).exists() {
        // Read JSON configuration file
        if let Ok(config_content) = std::fs::read_to_string(&config_path) {
            if let Ok(config_json) = serde_json::from_str::<serde_json::Value>(&config_content) {
                if let Some(cfg_vault) = config_json.get("vault_dir").and_then(|v| v.as_str()) {
                    if !cfg_vault.trim().is_empty() {
                        vault_dir = cfg_vault.to_string();
                    }
                }
            }
        }
    } else {
        // Automatically scaffold default config file on first run
        let default_config = serde_json::json!({
            "vault_dir": vault_dir
        });
        if let Ok(config_str) = serde_json::to_string_pretty(&default_config) {
            let _ = std::fs::write(&config_path, config_str);
        }
    }

    // Expand tilde (~/) if present in the configured path
    if vault_dir.starts_with("~/") {
        vault_dir = vault_dir.replace("~", &home_dir);
    }

    // Ensure the resolved directory physically exists on disk
    std::fs::create_dir_all(&vault_dir).expect("failed to create vault directory");

    let conn = initialize_db(&db_path).expect("failed to initialize SQLite Cache database");
    boot_sweep(&conn, &vault_dir).expect("failed to run boot sweep");

    let mut builder = tauri::Builder::default()
        .manage(AppState {
            db: Mutex::new(conn),
            db_path: db_path.clone(),
            vault_dir: Mutex::new(vault_dir.clone()),
        });

    builder = builder.invoke_handler(tauri::generate_handler![
        get_tasks,
        get_custom_views,
        get_vault_config,
        set_vault_config,
        update_event_schedule,
        update_task_status,
        read_dir_tree,
        create_file,
        create_directory,
        delete_path,
        rename_path,
        read_file_content,
        write_file_content
    ]);

    builder
        .setup(move |app| {
            let handle = app.handle();
            // Start background watcher and emit "vault-changed" event on updates
            let _watcher = start_watcher(db_path, vault_dir, move || {
                let _ = handle.emit_all("vault-changed", ());
            })
            .expect("failed to start native file watcher");
            
            // Keep the watcher alive by leaking it
            Box::leak(Box::new(_watcher));
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
