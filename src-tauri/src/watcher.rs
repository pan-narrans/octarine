use std::path::Path;
use std::sync::mpsc::channel;
use std::thread;
use notify::{Watcher, RecursiveMode, RecommendedWatcher, Config, EventKind};
use rusqlite::Connection;

pub fn start_watcher<P: AsRef<Path> + Send + 'static, F>(
    db_path: String,
    vault_dir: P,
    on_change: F,
) -> Result<RecommendedWatcher, notify::Error>
where
    F: Fn() + Send + Sync + 'static,
{
    let (tx, rx) = channel();

    let mut watcher = RecommendedWatcher::new(tx, Config::default())?;
    watcher.watch(vault_dir.as_ref(), RecursiveMode::Recursive)?;

    thread::spawn(move || {
        for res in rx {
            match res {
                Ok(event) => {
                    // Check if it's a modify, create, or delete event
                    let should_process = match event.kind {
                        EventKind::Modify(_) | EventKind::Create(_) | EventKind::Remove(_) => true,
                        _ => false,
                    };

                    if should_process {
                        for path in event.paths {
                            if path.extension().map_or(false, |ext| ext == "md") {
                                if let Some(path_str) = path.to_str() {
                                    // Re-open DB connection in the watcher thread
                                    if let Ok(conn) = Connection::open(&db_path) {
                                        let _ = conn.execute_batch("PRAGMA foreign_keys = ON;");
                                        let mut changed = false;
                                        if path.exists() {
                                            if let Ok(_) = crate::db::index_single_file(&conn, path_str) {
                                                changed = true;
                                            }
                                        } else {
                                            if let Ok(_) = crate::db::delete_file(&conn, path_str) {
                                                changed = true;
                                            }
                                        }
                                        if changed {
                                            on_change();
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                Err(e) => eprintln!("Watcher error: {:?}", e),
            }
        }
    });

    Ok(watcher)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{initialize_db, boot_sweep};
    use tempfile::tempdir;
    use std::fs;

    #[test]
    fn test_file_watcher_incremental_indexing() {
        let temp_dir = tempdir().unwrap();
        let db_path = temp_dir.path().join("cache.db");
        let vault_dir = temp_dir.path().join("vault");
        fs::create_dir_all(&vault_dir).unwrap();

        let conn = initialize_db(&db_path).unwrap();
        boot_sweep(&conn, &vault_dir).unwrap();

        // Start watcher
        let _watcher = start_watcher(
            db_path.to_str().unwrap().to_string(),
            vault_dir.clone(),
            || {},
        )
        .unwrap();

        // Create a new file inside the vault
        let file_path = vault_dir.join("watch-tasks.md");
        fs::write(
            &file_path,
            "- [ ] Live watched task #urgent",
        )
        .unwrap();

        // Sleep to allow notify event to propagate and thread to index
        thread::sleep(std::time::Duration::from_millis(300));

        // Query the database to see if the watcher indexed it
        let task_exists: i64 = conn
            .query_row(
                "SELECT count(*) FROM tasks WHERE description = 'Live watched task'",
                [],
                |r| r.get(0),
            )
            .unwrap();

        assert_eq!(task_exists, 1);
    }
}
