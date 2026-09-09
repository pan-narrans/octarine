use crate::diagnostics::Diagnostics;
use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver};
use std::thread;

fn spawn_event_loop<F>(
    db_path: String,
    vault_dir: PathBuf,
    rx: Receiver<Result<notify::Event, notify::Error>>,
    diagnostics: Option<Diagnostics>,
    on_change: F,
    mut path_filter: crate::vault_ignore::VaultPathFilter,
) where
    F: Fn() + Send + Sync + 'static,
{
    thread::spawn(move || {
        for res in rx {
            match res {
                Ok(event) => {
                    let should_process = matches!(
                        event.kind,
                        EventKind::Modify(_) | EventKind::Create(_) | EventKind::Remove(_)
                    );

                    if should_process {
                        let ignore_changed = event
                            .paths
                            .iter()
                            .any(crate::vault_ignore::VaultPathFilter::is_ignore_file);
                        if ignore_changed {
                            match crate::vault_ignore::VaultPathFilter::load(&vault_dir) {
                                Ok(reloaded) => match Connection::open(&db_path) {
                                    Ok(conn) => {
                                        let _ = conn.execute_batch("PRAGMA foreign_keys = ON;");
                                        if crate::db::boot_sweep_with_diagnostics(
                                            &conn,
                                            &vault_dir,
                                            diagnostics.as_ref(),
                                        )
                                        .is_ok()
                                        {
                                            path_filter = reloaded;
                                            on_change();
                                        } else if let Some(diagnostics) = &diagnostics {
                                            diagnostics.error(
                                                "watcher.ignore_reconcile_failed",
                                                "Ignore rules changed but cache reconciliation failed.",
                                            );
                                        }
                                    }
                                    Err(_) => {
                                        if let Some(diagnostics) = &diagnostics {
                                            diagnostics.error(
                                                "watcher.cache_open_failed",
                                                "The watcher could not open the local cache.",
                                            );
                                        }
                                    }
                                },
                                Err(_) => {
                                    if let Some(diagnostics) = &diagnostics {
                                        diagnostics.error(
                                            "watcher.ignore_invalid",
                                            "The vault ignore file is invalid.",
                                        );
                                    }
                                }
                            }
                            continue;
                        }

                        for path in event.paths {
                            if path.extension().is_some_and(|ext| ext == "md") {
                                if path_filter.is_ignored(&path, path.is_dir()) {
                                    continue;
                                }
                                if let Some(path_str) = path.to_str() {
                                    match Connection::open(&db_path) {
                                        Ok(conn) => {
                                            let _ = conn.execute_batch("PRAGMA foreign_keys = ON;");
                                            let changed = if path.exists() {
                                                crate::db::index_single_file(&conn, path_str)
                                                    .is_ok()
                                            } else {
                                                crate::db::delete_file(&conn, path_str).is_ok()
                                            };

                                            if changed {
                                                on_change();
                                            } else if let Some(diagnostics) = &diagnostics {
                                                diagnostics.error(
                                                    "watcher.index_failed",
                                                    "A watched Markdown change could not be indexed.",
                                                );
                                            }
                                        }
                                        Err(_) => {
                                            if let Some(diagnostics) = &diagnostics {
                                                diagnostics.error(
                                                    "watcher.cache_open_failed",
                                                    "The watcher could not open the local cache.",
                                                );
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                Err(_) => {
                    if let Some(diagnostics) = &diagnostics {
                        diagnostics.error(
                            "watcher.event_failed",
                            "The filesystem watcher reported an error.",
                        );
                    }
                }
            }
        }
    });
}

pub fn start_watcher<P: AsRef<Path> + Send + 'static, F>(
    db_path: String,
    vault_dir: P,
    diagnostics: Option<Diagnostics>,
    on_change: F,
) -> Result<RecommendedWatcher, String>
where
    F: Fn() + Send + Sync + 'static,
{
    let (tx, rx) = channel();
    let vault_dir = vault_dir
        .as_ref()
        .canonicalize()
        .map_err(|e| format!("Failed to resolve watcher root: {e}"))?;
    let path_filter = crate::vault_ignore::VaultPathFilter::load(&vault_dir)?;

    let mut watcher = RecommendedWatcher::new(tx, Config::default()).map_err(|e| e.to_string())?;
    watcher
        .watch(&vault_dir, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    spawn_event_loop(db_path, vault_dir, rx, diagnostics, on_change, path_filter);

    Ok(watcher)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{boot_sweep, initialize_db};
    use notify::PollWatcher;
    use std::fs;
    use std::sync::mpsc;
    use std::time::Duration;
    use tempfile::tempdir;

    fn start_test_watcher<F>(
        db_path: String,
        vault_dir: &Path,
        on_change: F,
    ) -> Result<PollWatcher, String>
    where
        F: Fn() + Send + Sync + 'static,
    {
        let (tx, rx) = channel();
        let vault_dir = vault_dir
            .canonicalize()
            .map_err(|error| error.to_string())?;
        let path_filter = crate::vault_ignore::VaultPathFilter::load(&vault_dir)?;
        let config = Config::default()
            .with_poll_interval(Duration::from_millis(50))
            .with_compare_contents(true);
        let mut watcher = PollWatcher::new(tx, config).map_err(|error| error.to_string())?;
        watcher
            .watch(&vault_dir, RecursiveMode::Recursive)
            .map_err(|error| error.to_string())?;
        spawn_event_loop(db_path, vault_dir, rx, None, on_change, path_filter);
        Ok(watcher)
    }

    #[test]
    fn test_file_watcher_incremental_indexing() {
        let temp_dir = tempdir().unwrap();
        let db_path = temp_dir.path().join("cache.db");
        let vault_dir = temp_dir.path().join("vault");
        fs::create_dir_all(&vault_dir).unwrap();

        let conn = initialize_db(&db_path).unwrap();
        boot_sweep(&conn, &vault_dir).unwrap();

        // Start watcher
        let (change_tx, change_rx) = mpsc::channel();
        let _watcher = start_test_watcher(
            db_path.to_str().unwrap().to_string(),
            &vault_dir,
            move || {
                let _ = change_tx.send(());
            },
        )
        .unwrap();

        // Create a new file inside the vault
        let file_path = vault_dir.join("watch-tasks.md");
        fs::write(&file_path, "- [ ] Live watched task #urgent").unwrap();

        change_rx
            .recv_timeout(Duration::from_secs(10))
            .expect("watcher did not report an indexed file before the timeout");

        let task_exists: i64 = conn
            .query_row(
                "SELECT count(*) FROM tasks WHERE description = 'Live watched task'",
                [],
                |r| r.get(0),
            )
            .unwrap();

        assert_eq!(task_exists, 1);
    }

    #[test]
    fn test_ignore_change_reconciles_index_before_notification() {
        let temp_dir = tempdir().unwrap();
        let db_path = temp_dir.path().join("cache.db");
        let vault_dir = temp_dir.path().join("vault");
        fs::create_dir_all(&vault_dir).unwrap();
        fs::write(vault_dir.join("visible.md"), "- [ ] Visible task\n").unwrap();
        fs::write(vault_dir.join("archive.md"), "- [ ] Archived task\n").unwrap();

        let conn = initialize_db(&db_path).unwrap();
        boot_sweep(&conn, &vault_dir).unwrap();
        let (change_tx, change_rx) = mpsc::channel();
        let _watcher = start_test_watcher(
            db_path.to_string_lossy().into_owned(),
            &vault_dir,
            move || {
                let _ = change_tx.send(());
            },
        )
        .unwrap();

        fs::write(vault_dir.join(".octarineignore"), "archive.md\n").unwrap();
        change_rx
            .recv_timeout(Duration::from_secs(10))
            .expect("watcher did not reconcile ignore rules before timeout");

        let descriptions: Vec<String> = conn
            .prepare("SELECT description FROM tasks ORDER BY description")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(descriptions, vec!["Visible task"]);
    }
}
