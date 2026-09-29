use crate::diagnostics::Diagnostics;
use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver};
use std::thread;

fn fs_is_symlink(path: &Path) -> bool {
    std::fs::symlink_metadata(path).is_ok_and(|metadata| metadata.file_type().is_symlink())
}

// Keep event reconciliation synchronous so tests can deliver exact event sequences without OS timing.
fn process_event<F: Fn()>(
    db_path: &str,
    vault_dir: &Path,
    event: Result<notify::Event, notify::Error>,
    diagnostics: Option<&Diagnostics>,
    on_change: &F,
    path_filter: &mut crate::vault_ignore::VaultPathFilter,
) {
    match event {
        Ok(mut event) => {
            let should_process = matches!(
                event.kind,
                EventKind::Modify(_) | EventKind::Create(_) | EventKind::Remove(_)
            );

            if should_process {
                // Native events are untrusted path inputs too. Resolve before indexing; never
                // follow a vault symlink into unrelated files or reconcile an outside ignore file.
                event.paths = event
                    .paths
                    .into_iter()
                    .filter_map(|path| {
                        if fs_is_symlink(&path) {
                            return None;
                        }
                        crate::path_security::resolve_descendant_within(vault_dir, &path, true).ok()
                    })
                    .collect();
                let ignore_changed = event
                    .paths
                    .iter()
                    .any(|path| path == &vault_dir.join(crate::vault_ignore::IGNORE_FILE_NAME));
                let directory_changed = event.paths.iter().any(|path| {
                    !path_filter.is_ignored(path, path.is_dir())
                        && (path.is_dir()
                            || matches!(
                                event.kind,
                                EventKind::Create(notify::event::CreateKind::Folder)
                                    | EventKind::Remove(notify::event::RemoveKind::Folder)
                                    | EventKind::Modify(notify::event::ModifyKind::Name(_))
                            )
                            || (matches!(
                                event.kind,
                                EventKind::Remove(notify::event::RemoveKind::Any)
                            ) && path.extension().is_none()))
                });
                if (ignore_changed || directory_changed) && vault_dir.is_dir() {
                    match crate::vault_ignore::VaultPathFilter::load(vault_dir) {
                        Ok(reloaded) => match Connection::open(db_path) {
                            Ok(conn) => {
                                let _ = conn.execute_batch("PRAGMA foreign_keys = ON;");
                                if crate::db::boot_sweep_with_diagnostics(
                                    &conn,
                                    vault_dir,
                                    diagnostics,
                                )
                                .is_ok()
                                {
                                    *path_filter = reloaded;
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
                    return;
                }

                for path in event.paths {
                    if path.extension().is_some_and(|ext| ext == "md") {
                        if path_filter.is_ignored(&path, path.is_dir()) {
                            continue;
                        }
                        if let Some(path_str) = path.to_str() {
                            match Connection::open(db_path) {
                                Ok(conn) => {
                                    let _ = conn.execute_batch("PRAGMA foreign_keys = ON;");
                                    let changed = if path.exists() {
                                        crate::db::index_single_file(&conn, path_str).is_ok()
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

fn spawn_event_loop<F>(
    db_path: String,
    vault_dir: PathBuf,
    rx: Receiver<Result<notify::Event, notify::Error>>,
    diagnostics: Option<Diagnostics>,
    on_change: F,
    mut path_filter: crate::vault_ignore::VaultPathFilter,
) -> thread::JoinHandle<()>
where
    F: Fn() + Send + Sync + 'static,
{
    thread::spawn(move || {
        for res in rx {
            process_event(
                &db_path,
                &vault_dir,
                res,
                diagnostics.as_ref(),
                &on_change,
                &mut path_filter,
            );
        }
    })
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

    // Synchronous delivery shares production reconciliation; callback reads real SQLite state.
    struct EventHarness {
        _temp: tempfile::TempDir,
        root: PathBuf,
        db_path: PathBuf,
        conn: Connection,
        filter: crate::vault_ignore::VaultPathFilter,
        notifications: std::cell::RefCell<Vec<Vec<String>>>,
    }

    impl EventHarness {
        fn new() -> Self {
            let temp = tempdir().unwrap();
            let root = temp.path().join("vault");
            fs::create_dir(&root).unwrap();
            let root = root.canonicalize().unwrap();
            let db_path = temp.path().join("cache.db");
            let conn = initialize_db(&db_path).unwrap();
            let filter = crate::vault_ignore::VaultPathFilter::load(&root).unwrap();
            Self {
                _temp: temp,
                root,
                db_path,
                conn,
                filter,
                notifications: Default::default(),
            }
        }

        fn deliver(&mut self, kind: EventKind, paths: &[PathBuf]) {
            let mut event = notify::Event::new(kind);
            event.paths = paths.to_vec();
            process_event(
                self.db_path.to_str().unwrap(),
                &self.root,
                Ok(event),
                None,
                &|| {
                    let mut descriptions: Vec<_> = crate::db::query_tasks(&self.conn, "1=1", &[])
                        .unwrap()
                        .into_iter()
                        .map(|task| task.description)
                        .collect();
                    descriptions.sort();
                    self.notifications.borrow_mut().push(descriptions);
                },
                &mut self.filter,
            );
        }
    }

    #[test]
    fn deterministic_duplicate_and_delayed_events_reconcile_current_disk_before_notification() {
        use notify::event::{CreateKind, DataChange, ModifyKind, RemoveKind};
        let mut h = EventHarness::new();
        let path = h.root.join("task.md");
        fs::write(&path, "- [ ] First\n").unwrap();
        h.deliver(
            EventKind::Create(CreateKind::File),
            std::slice::from_ref(&path),
        );
        assert_eq!(h.notifications.borrow().last().unwrap(), &["First"]);

        // Coalesced external saves expose only latest content; duplicate paths must not duplicate tasks.
        fs::write(&path, "- [ ] Intermediate\n").unwrap();
        fs::write(&path, "- [ ] Latest\n").unwrap();
        h.deliver(
            EventKind::Modify(ModifyKind::Data(DataChange::Content)),
            &[path.clone(), path.clone()],
        );
        assert_eq!(h.notifications.borrow().last().unwrap(), &["Latest"]);
        assert_eq!(
            crate::db::query_tasks(&h.conn, "1=1", &[]).unwrap().len(),
            1
        );

        // A delayed removal after recreation must index current content instead of deleting it.
        fs::remove_file(&path).unwrap();
        fs::write(&path, "- [ ] Recreated\n").unwrap();
        h.deliver(
            EventKind::Remove(RemoveKind::File),
            std::slice::from_ref(&path),
        );
        assert_eq!(h.notifications.borrow().last().unwrap(), &["Recreated"]);
        fs::remove_file(&path).unwrap();
        h.deliver(EventKind::Modify(ModifyKind::Any), &[path]);
        assert!(h.notifications.borrow().last().unwrap().is_empty());
    }

    #[test]
    fn deterministic_rename_and_own_write_events_leave_one_canonical_task() {
        use notify::event::{CreateKind, ModifyKind, RenameMode};
        let mut h = EventHarness::new();
        let old = h.root.join("old.md");
        let new = h.root.join("new.md");
        fs::write(&old, "- [ ] Move me\n").unwrap();
        h.deliver(
            EventKind::Create(CreateKind::File),
            std::slice::from_ref(&old),
        );
        fs::rename(&old, &new).unwrap();
        h.deliver(
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
            &[old, new.clone()],
        );
        let tasks = crate::db::query_tasks(&h.conn, "1=1", &[]).unwrap();
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].file_path.as_deref(), new.to_str());
        crate::writer::update_task_status_in_file(
            new.to_str().unwrap(),
            1,
            &tasks[0].raw_markdown,
            "doing",
        )
        .unwrap();
        h.deliver(EventKind::Modify(ModifyKind::Any), &[new.clone(), new]);
        let tasks = crate::db::query_tasks(&h.conn, "1=1", &[]).unwrap();
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].status, "doing");
    }

    #[test]
    fn deterministic_ignored_paths_access_events_and_unreadable_content_do_not_notify() {
        use notify::event::{AccessKind, ModifyKind};
        let mut h = EventHarness::new();
        fs::write(h.root.join(".octarineignore"), "ignored.md\n").unwrap();
        h.filter = crate::vault_ignore::VaultPathFilter::load(&h.root).unwrap();
        for path in [
            h.root.join("ignored.md"),
            h.root.join(".hidden.md"),
            h.root.join("note.txt"),
            h.root.parent().unwrap().join("outside.md"),
        ] {
            fs::write(&path, "- [ ] Invisible\n").unwrap();
            h.deliver(EventKind::Modify(ModifyKind::Any), &[path]);
        }
        let visible = h.root.join("visible.md");
        fs::write(&visible, "- [ ] Visible\n").unwrap();
        h.deliver(
            EventKind::Access(AccessKind::Any),
            std::slice::from_ref(&visible),
        );
        assert!(h.notifications.borrow().is_empty());
        h.deliver(
            EventKind::Modify(ModifyKind::Any),
            std::slice::from_ref(&visible),
        );
        h.notifications.borrow_mut().clear();
        // Invalid UTF-8 is deterministic even when running tests with elevated privileges.
        fs::write(&visible, [0xff]).unwrap();
        h.deliver(
            EventKind::Modify(ModifyKind::Any),
            std::slice::from_ref(&visible),
        );
        assert!(h.notifications.borrow().is_empty());
        assert_eq!(
            crate::db::query_tasks(&h.conn, "1=1", &[]).unwrap()[0].description,
            "Visible"
        );
        fs::write(&visible, "- [ ] Available again\n").unwrap();
        h.deliver(EventKind::Modify(ModifyKind::Any), &[visible]);
        assert_eq!(
            h.notifications.borrow().last().unwrap(),
            &["Available again"]
        );
    }

    #[test]
    fn deterministic_ignore_reload_removes_then_restores_derived_rows() {
        use notify::event::{ModifyKind, RemoveKind};
        let mut h = EventHarness::new();
        fs::write(h.root.join("task.md"), "- [ ] Task\n").unwrap();
        boot_sweep(&h.conn, &h.root).unwrap();
        let ignore = h.root.join(".octarineignore");
        fs::write(&ignore, "task.md\n").unwrap();
        h.deliver(
            EventKind::Modify(ModifyKind::Any),
            std::slice::from_ref(&ignore),
        );
        assert!(h.notifications.borrow().last().unwrap().is_empty());
        fs::remove_file(&ignore).unwrap();
        h.deliver(EventKind::Remove(RemoveKind::File), &[ignore]);
        assert_eq!(h.notifications.borrow().last().unwrap(), &["Task"]);
    }

    #[test]
    fn deterministic_directory_rename_and_removal_reconcile_descendant_tasks_and_views() {
        use notify::event::{CreateKind, ModifyKind, RemoveKind, RenameMode};
        let mut h = EventHarness::new();
        let old = h.root.join("old");
        let new = h.root.join("new");
        fs::create_dir_all(old.join("nested")).unwrap();
        fs::write(
            old.join("nested/task.md"),
            "- [ ] Nested\n\n```tasks-query\n+work\n```\n",
        )
        .unwrap();
        h.deliver(
            EventKind::Create(CreateKind::Folder),
            std::slice::from_ref(&old),
        );
        assert_eq!(h.notifications.borrow().last().unwrap(), &["Nested"]);
        fs::rename(&old, &new).unwrap();
        h.deliver(
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
            &[old, new.clone()],
        );
        let tasks = crate::db::query_tasks(&h.conn, "1=1", &[]).unwrap();
        assert_eq!(tasks.len(), 1);
        assert_eq!(
            tasks[0].file_path.as_deref(),
            new.join("nested/task.md").to_str()
        );
        fs::remove_dir_all(&new).unwrap();
        h.deliver(EventKind::Remove(RemoveKind::Folder), &[new]);
        assert!(h.notifications.borrow().last().unwrap().is_empty());
        assert_eq!(
            h.conn
                .query_row("SELECT count(*) FROM custom_views", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }

    #[test]
    fn deterministic_outside_ignore_change_does_not_trigger_vault_reconciliation() {
        use notify::event::ModifyKind;
        let mut h = EventHarness::new();
        let outside = h.root.parent().unwrap().join(".octarineignore");
        fs::write(&outside, "*.md\n").unwrap();
        h.deliver(EventKind::Modify(ModifyKind::Any), &[outside]);
        assert!(h.notifications.borrow().is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn deterministic_symlink_escape_never_indexes_external_markdown() {
        use notify::event::ModifyKind;
        let mut h = EventHarness::new();
        let outside = h.root.parent().unwrap().join("outside.md");
        fs::write(&outside, "- [ ] Private external content\n").unwrap();
        let link = h.root.join("link.md");
        std::os::unix::fs::symlink(&outside, &link).unwrap();
        h.deliver(EventKind::Modify(ModifyKind::Any), &[link]);
        assert!(h.notifications.borrow().is_empty());
        assert!(crate::db::query_tasks(&h.conn, "1=1", &[])
            .unwrap()
            .is_empty());
    }

    #[test]
    fn event_loop_drains_accepted_events_and_exits_when_sender_closes() {
        use notify::event::CreateKind;
        let h = EventHarness::new();
        let path = h.root.join("task.md");
        fs::write(&path, "- [ ] Final event\n").unwrap();
        let (sender, receiver) = channel();
        let (changed, notifications) = channel();
        let filter = crate::vault_ignore::VaultPathFilter::load(&h.root).unwrap();
        let worker = spawn_event_loop(
            h.db_path.to_string_lossy().into_owned(),
            h.root.clone(),
            receiver,
            None,
            move || {
                let _ = changed.send(());
            },
            filter,
        );
        sender
            .send(Ok(
                notify::Event::new(EventKind::Create(CreateKind::File)).add_path(path)
            ))
            .unwrap();
        drop(sender);
        notifications.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(
            crate::db::query_tasks(&h.conn, "1=1", &[]).unwrap()[0].description,
            "Final event"
        );
        assert_eq!(
            notifications.recv_timeout(Duration::from_secs(5)),
            Err(mpsc::RecvTimeoutError::Disconnected)
        );
        worker.join().unwrap();
    }

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
