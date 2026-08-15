#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use octarine::db::{boot_sweep, delete_file, index_single_file, initialize_db, query_tasks};
use octarine::file_ops::{
    create_directory_on_disk, create_file_on_disk, delete_path_on_disk, read_file_content_on_disk,
    rename_path_on_disk, scan_dir_tree, write_file_content_on_disk, FileNode,
};
use octarine::parser::{ParsedCustomView, ParsedTask};
use octarine::query_dsl::compile_filter_to_sql;
use octarine::watcher::start_watcher;
use octarine::writer::update_task_status_in_file;
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::Manager;
use tauri::State;

struct AppState {
    db: Mutex<Connection>,
    _db_path: String,
    vault_dir: Mutex<String>,
    journal_dir: Mutex<String>,
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
    let mut config_json = if std::path::Path::new(&config_path).exists() {
        let content = std::fs::read_to_string(&config_path).unwrap_or_default();
        serde_json::from_str::<serde_json::Value>(&content)
            .unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    config_json["vault_dir"] = serde_json::Value::String(new_dir.clone());

    let config_str = serde_json::to_string_pretty(&config_json).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, config_str)
        .map_err(|e| format!("Failed to write config file: {}", e))?;

    // Update active vault_dir inside AppState under lock
    {
        let mut vault_lock = state.vault_dir.lock().unwrap();
        *vault_lock = resolved_dir.clone();
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
    boot_sweep(&conn, &resolved_dir).map_err(|e| e.to_string())?;

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
    let config_path = format!("{}/.octarine_config.json", home_dir);

    let mut resolved_dir = new_dir.clone();
    if resolved_dir.starts_with("~/") {
        resolved_dir = resolved_dir.replace("~", &home_dir);
    }

    // Ensure directory exists
    std::fs::create_dir_all(&resolved_dir)
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    // Save to configuration file
    let mut config_json = if std::path::Path::new(&config_path).exists() {
        let content = std::fs::read_to_string(&config_path).unwrap_or_default();
        serde_json::from_str::<serde_json::Value>(&content)
            .unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    config_json["journal_dir"] = serde_json::Value::String(new_dir.clone());

    let config_str = serde_json::to_string_pretty(&config_json).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, config_str)
        .map_err(|e| format!("Failed to write config file: {}", e))?;

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
fn rename_path(
    state: State<'_, AppState>,
    old_path: String,
    new_path: String,
) -> Result<(), String> {
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
fn write_file_content(
    state: State<'_, AppState>,
    path: String,
    content: String,
) -> Result<(), String> {
    write_file_content_on_disk(&path, &content)?;
    let conn = state.db.lock().unwrap();
    index_single_file(&conn, &path).map_err(|e| e.to_string())?;
    Ok(())
}

fn main() {
    let home_dir = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    let db_path = format!("{}/.octarine_cache.db", home_dir);
    let config_path = format!("{}/.octarine_config.json", home_dir);

    // 1. Resolve configurable directories
    let mut vault_dir = format!("{}/octarine_vault", home_dir);
    let mut journal_dir = format!("{}/octarine_journal", home_dir);

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
                if let Some(cfg_journal) = config_json.get("journal_dir").and_then(|v| v.as_str()) {
                    if !cfg_journal.trim().is_empty() {
                        journal_dir = cfg_journal.to_string();
                    }
                } else {
                    // Update existing config file with default journal path if missing
                    let mut updated_config = config_json.clone();
                    updated_config["journal_dir"] =
                        serde_json::Value::String("~/octarine_journal".to_string());
                    if let Ok(config_str) = serde_json::to_string_pretty(&updated_config) {
                        let _ = std::fs::write(&config_path, config_str);
                    }
                }
            }
        }
    } else {
        // Automatically scaffold default config file on first run
        let default_config = serde_json::json!({
            "vault_dir": "~/octarine_vault",
            "journal_dir": "~/octarine_journal"
        });
        if let Ok(config_str) = serde_json::to_string_pretty(&default_config) {
            let _ = std::fs::write(&config_path, config_str);
        }
    }

    // Expand tilde (~/) if present in the configured paths
    if vault_dir.starts_with("~/") {
        vault_dir = vault_dir.replace("~", &home_dir);
    }
    if journal_dir.starts_with("~/") {
        journal_dir = journal_dir.replace("~", &home_dir);
    }

    // Ensure the resolved directories physically exist on disk
    std::fs::create_dir_all(&vault_dir).expect("failed to create vault directory");
    std::fs::create_dir_all(&journal_dir).expect("failed to create journal directory");

    let conn = initialize_db(&db_path).expect("failed to initialize SQLite Cache database");

    boot_sweep(&conn, &vault_dir).expect("failed to run boot sweep");

    let mut builder = tauri::Builder::default().manage(AppState {
        db: Mutex::new(conn),
        _db_path: db_path.clone(),
        vault_dir: Mutex::new(vault_dir.clone()),
        journal_dir: Mutex::new(journal_dir.clone()),
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
