use octarine::db;
use std::fs;

#[test]
fn malformed_cache_is_preserved_and_markdown_rebuilds_tasks_and_views() {
    let temp = tempfile::tempdir().unwrap();
    let vault = temp.path().join("vault");
    fs::create_dir(&vault).unwrap();
    let source = "- [ ] Durable +work @desk\n\n```tasks-query\ntitle: Work\nfilter: +work\n```\n";
    let note = vault.join("note.md");
    fs::write(&note, source).unwrap();
    let cache = temp.path().join("index.sqlite3");
    let invalid = b"Not a SQLite database\x00\xff";
    fs::write(&cache, invalid).unwrap();
    let conn = db::open_rebuildable_cache(&cache).unwrap();
    db::boot_sweep(&conn, &vault).unwrap();
    assert_eq!(
        db::query_tasks(&conn, "1=1", &[]).unwrap()[0].description,
        "Durable"
    );
    let query: String = conn
        .query_row("SELECT query_raw FROM custom_views", [], |row| row.get(0))
        .unwrap();
    assert_eq!(query, "title: Work\nfilter: +work");
    let recovered = fs::read_dir(temp.path())
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .find(|path| {
            path.file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("corrupt-cache-")
        })
        .unwrap();
    assert_eq!(fs::read(recovered.join("index.sqlite3")).unwrap(), invalid);
    assert_eq!(fs::read_to_string(note).unwrap(), source);
    drop(conn);
    let reopened = db::open_rebuildable_cache(&cache).unwrap();
    assert_eq!(db::query_tasks(&reopened, "1=1", &[]).unwrap().len(), 1);
}

#[test]
fn operational_cache_failure_does_not_quarantine_or_replace_files() {
    let temp = tempfile::tempdir().unwrap();
    let cache = temp.path().join("index.sqlite3");
    fs::create_dir(&cache).unwrap();
    fs::write(cache.join("keep.txt"), "Keep").unwrap();
    assert!(db::open_rebuildable_cache(&cache).is_err());
    assert_eq!(fs::read_to_string(cache.join("keep.txt")).unwrap(), "Keep");
    assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 1);
}

#[test]
fn invalidated_stale_rows_and_views_rebuild_from_unchanged_markdown() {
    let temp = tempfile::tempdir().unwrap();
    let vault = temp.path().join("vault");
    fs::create_dir(&vault).unwrap();
    let note = vault.join("note.md");
    let source = "- [ ] Source truth\n\n```tasks-query\n+work\n```\n";
    fs::write(&note, source).unwrap();
    let cache = temp.path().join("index.sqlite3");
    let conn = db::initialize_db(&cache).unwrap();
    db::boot_sweep(&conn, &vault).unwrap();
    // Deliberate derived-state corruption and version invalidation: Markdown stays unchanged.
    conn.execute_batch("UPDATE tasks SET description = 'Wrong'; UPDATE custom_views SET query_raw = 'Wrong'; DELETE FROM cache_metadata;").unwrap();
    drop(conn);
    let conn = db::open_rebuildable_cache(&cache).unwrap();
    db::boot_sweep(&conn, &vault).unwrap();
    assert_eq!(
        db::query_tasks(&conn, "1=1", &[]).unwrap()[0].description,
        "Source truth"
    );
    assert_eq!(
        conn.query_row("SELECT query_raw FROM custom_views", [], |row| row
            .get::<_, String>(0))
            .unwrap(),
        "+work"
    );
    fs::remove_file(&note).unwrap();
    db::boot_sweep(&conn, &vault).unwrap();
    assert!(db::query_tasks(&conn, "1=1", &[]).unwrap().is_empty());
    assert_eq!(
        conn.query_row("SELECT count(*) FROM custom_views", [], |row| row
            .get::<_, i64>(0))
            .unwrap(),
        0
    );
}
