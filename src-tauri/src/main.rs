#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::sync::Mutex;
use tauri::State;
use octarine::parser::{ParsedTask, ParsedCustomView};
use octarine::db::{initialize_db, boot_sweep, index_single_file};
use octarine::writer::update_task_status_in_file;
use octarine::query_dsl::compile_filter_to_sql;
use octarine::watcher::start_watcher;
use rusqlite::Connection;

struct AppState {
    db: Mutex<Connection>,
    db_path: String,
    vault_dir: String,
}

#[tauri::command]
fn get_tasks(state: State<'_, AppState>, filter: Option<String>) -> Result<Vec<ParsedTask>, String> {
    let conn = state.db.lock().unwrap();
    let where_clause = match filter {
        Some(f) if !f.trim().is_empty() => compile_filter_to_sql(&f)?,
        _ => "1 = 1".to_string(),
    };

    let query_str = format!(
        "SELECT line_number, raw_markdown, hash, status, type, description, project, due_date, s_start, duration_secs, recurring, when_done, parse_errors FROM tasks WHERE {}",
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

#[cfg(feature = "qa-vision")]
#[tauri::command]
fn capture_app_window() -> Result<String, String> {
    // 1. Get window ID using osascript
    let output = std::process::Command::new("osascript")
        .arg("-e")
        .arg("tell application \"System Events\" to get id of window 1 of (first process whose name is \"octarine-app\" or title is \"Octarine\")")
        .output()
        .map_err(|e| format!("Failed to execute osascript: {}", e))?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!("osascript failed: {}", err_msg));
    }

    let window_id_str = String::from_utf8_lossy(&output.stdout);
    let window_id = window_id_str.trim();
    if window_id.is_empty() {
        return Err("App window not found or not active.".to_string());
    }

    // 2. Run screencapture -l <window_id> ../screenshot.png
    let capture_status = std::process::Command::new("screencapture")
        .arg("-l")
        .arg(window_id)
        .arg("../screenshot.png")
        .status()
        .map_err(|e| format!("Failed to run screencapture: {}", e))?;

    if !capture_status.success() {
        return Err("screencapture command failed.".to_string());
    }

    Ok("Successfully captured app window to screenshot.png at project root.".to_string())
}

fn main() {
    let home_dir = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    let db_path = format!("{}/.octarine_cache.db", home_dir);
    let vault_dir = format!("{}/octarine_vault", home_dir);

    // Ensure vault directory exists
    std::fs::create_dir_all(&vault_dir).expect("failed to create vault directory");

    let conn = initialize_db(&db_path).expect("failed to initialize SQLite Cache database");
    boot_sweep(&conn, &vault_dir).expect("failed to run boot sweep");

    // Start background watcher
    let _watcher = start_watcher(db_path.clone(), vault_dir.clone())
        .expect("failed to start native file watcher");

    let mut builder = tauri::Builder::default()
        .manage(AppState {
            db: Mutex::new(conn),
            db_path,
            vault_dir,
        });

    #[cfg(feature = "qa-vision")]
    {
        builder = builder.invoke_handler(tauri::generate_handler![
            get_tasks,
            get_custom_views,
            update_task_status,
            capture_app_window
        ]);
    }

    #[cfg(not(feature = "qa-vision"))]
    {
        builder = builder.invoke_handler(tauri::generate_handler![
            get_tasks,
            get_custom_views,
            update_task_status
        ]);
    }

    builder.run(tauri::generate_context!())
        .expect("error while running tauri application");
}
