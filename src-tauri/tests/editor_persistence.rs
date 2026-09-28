use octarine::{db, task_service::TaskCreationService, writer::WriteErrorCode};
use std::fs;

#[test]
fn saves_exact_snapshot_and_rejects_stale_or_deleted_source() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("vault");
    fs::create_dir(&root).unwrap();
    let root = root.canonicalize().unwrap();
    let db = db::initialize_db(temp.path().join("cache.sqlite3")).unwrap();
    let service = TaskCreationService::default();
    let path = root.join("note.md");
    fs::write(&path, "# Café\r\n- [ ] Original\r\n").unwrap();
    assert!(service
        .save_file_content(
            &root,
            &db,
            &path,
            Some("# Café\r\n- [ ] Original\r\n"),
            "- [ ] Saved\n"
        )
        .unwrap());
    assert_eq!(
        db::query_tasks(&db, "1=1", &[]).unwrap()[0].description,
        "Saved"
    );
    fs::write(&path, "- [ ] External\n").unwrap();
    let error = service
        .save_file_content(&root, &db, &path, Some("- [ ] Saved\n"), "Old edit")
        .unwrap_err();
    assert_eq!(error.code, WriteErrorCode::SourceChanged);
    assert_eq!(fs::read_to_string(&path).unwrap(), "- [ ] External\n");
    fs::remove_file(&path).unwrap();
    assert_eq!(
        service
            .save_file_content(&root, &db, &path, Some("- [ ] Saved\n"), "Old edit")
            .unwrap_err()
            .code,
        WriteErrorCode::SourceMissing
    );
    assert!(!path.exists());
}

#[test]
fn create_only_scaffolding_and_path_boundary_never_overwrite_existing_data() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("vault");
    fs::create_dir(&root).unwrap();
    let root = root.canonicalize().unwrap();
    let db = db::initialize_db(temp.path().join("cache.sqlite3")).unwrap();
    let service = TaskCreationService::default();
    let path = root.join("journal.md");
    assert!(service
        .save_file_content(&root, &db, &path, None, "# Journal\n")
        .unwrap());
    assert_eq!(
        service
            .save_file_content(&root, &db, &path, None, "Replacement")
            .unwrap_err()
            .code,
        WriteErrorCode::SourceChanged
    );
    assert_eq!(fs::read_to_string(&path).unwrap(), "# Journal\n");
    let outside = temp.path().join("outside.md");
    fs::write(&outside, "Outside").unwrap();
    for invalid in [&outside, &root, &root.join("../outside.md")] {
        assert!(service
            .save_file_content(&root, &db, invalid, Some("Outside"), "Overwrite")
            .is_err());
    }
    assert_eq!(fs::read_to_string(outside).unwrap(), "Outside");
}

#[test]
fn index_failure_reports_durable_save_and_allows_guarded_retry() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("vault");
    fs::create_dir(&root).unwrap();
    let root = root.canonicalize().unwrap();
    let db = db::initialize_db(temp.path().join("cache.sqlite3")).unwrap();
    let service = TaskCreationService::default();
    let path = root.join("note.md");
    fs::write(&path, "Original").unwrap();
    db.execute_batch("PRAGMA query_only = ON").unwrap();
    assert!(!service
        .save_file_content(&root, &db, &path, Some("Original"), "- [ ] Saved\n")
        .unwrap());
    assert_eq!(fs::read_to_string(&path).unwrap(), "- [ ] Saved\n");
    db.execute_batch("PRAGMA query_only = OFF").unwrap();
    assert!(service
        .save_file_content(&root, &db, &path, Some("- [ ] Saved\n"), "- [ ] Next\n")
        .unwrap());
    assert_eq!(
        db::query_tasks(&db, "1=1", &[]).unwrap()[0].description,
        "Next"
    );
}
