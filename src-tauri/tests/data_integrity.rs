mod support;

use octarine::{db, parser, project_merge::*, project_rename::*, writer};
use std::fs;
use support::{Vault, EDGE, NOTES};

#[test]
fn parser_fixtures_preserve_source_and_exclude_examples_for_lf_and_crlf() {
    for ending in ["\n", "\r\n"] {
        let source = NOTES.replace('\n', ending);
        let (tasks, views) = parser::parse_markdown_content("notes.md", &source);
        assert_eq!(tasks.len(), 3);
        assert_eq!(tasks[0].project.as_deref(), Some("work"));
        assert_eq!(tasks[0].contexts, ["desk", "calls"]);
        assert_eq!(tasks[0].tags, ["重要"]);
        assert_eq!(tasks[1].parent_hash.as_ref(), Some(&tasks[0].hash));
        assert_eq!(tasks[1].status, "deferred");
        assert_eq!(tasks[2].project.as_deref(), Some("workshop"));
        assert_eq!(views.len(), 1);
        assert_eq!(views[0].query_raw, "title: \"Work\"\nfilter: \"+work\"");
        for task in tasks {
            let lines: Vec<_> = source
                .lines()
                .skip(task.line_number - 1)
                .take(task.raw_markdown.lines().count())
                .collect();
            assert_eq!(lines.join("\n"), task.raw_markdown);
        }
    }
    let (tasks, _) = parser::parse_markdown_content("edge.md", EDGE);
    assert_eq!(tasks.len(), 2);
    assert!(tasks[0].parse_errors.is_some());
    assert_eq!(tasks[1].project.as_deref(), Some("personal"));
    assert!(tasks[1].contexts.is_empty());
    assert!(tasks[1].tags.is_empty());
}

#[test]
fn status_round_trip_changes_only_checkbox_and_preserves_surrounding_bytes() {
    for ending in ["\n", "\r\n"] {
        for final_newline in [false, true] {
            let vault = Vault::new();
            let content = if final_newline {
                NOTES
            } else {
                NOTES.trim_end_matches('\n')
            }
            .replace('\n', ending);
            let path = vault.write("notes.md", &content);
            let (tasks, _) = parser::parse_markdown_content(path.to_str().unwrap(), &content);
            let task = &tasks[0];
            writer::update_task_status_in_file(
                path.to_str().unwrap(),
                task.line_number,
                &task.raw_markdown,
                "doing",
            )
            .unwrap();
            let expected = content.replacen("- [ ] Review", "- [/] Review", 1);
            assert_eq!(fs::read_to_string(&path).unwrap(), expected);
            db::index_single_file(&vault.db, path.to_str().unwrap()).unwrap();
            let indexed = vault.tasks();
            let changed = indexed
                .iter()
                .find(|task| task.line_number == tasks[0].line_number)
                .unwrap();
            assert_eq!(changed.status, "doing");
            assert_eq!(changed.contexts, tasks[0].contexts);
        }
    }
}

#[test]
fn stale_and_ambiguous_deletion_leave_all_markdown_untouched() {
    for (source, line, expected) in [
        (
            "- [ ] Externally edited\n",
            1,
            writer::WriteErrorCode::SourceChanged,
        ),
        (
            "# Shift\n- [ ] Original\n\n- [ ] Original\n",
            1,
            writer::WriteErrorCode::SourceAmbiguous,
        ),
    ] {
        let vault = Vault::representative();
        let path = vault.write("delete.md", source);
        let before = vault.files();
        let error =
            writer::delete_task_markdown_in_file(path.to_str().unwrap(), line, "- [ ] Original")
                .unwrap_err();
        assert_eq!(error.code, expected);
        assert_eq!(vault.files(), before);
    }
}

#[test]
fn deletion_removes_subtree_and_reindex_retains_unrelated_tasks() {
    let vault = Vault::representative();
    let path = vault.write(
        "delete.md",
        "# Before\n- [ ] Parent\n  note\n  - [ ] Child\n- [ ] Keep\n",
    );
    db::index_single_file(&vault.db, path.to_str().unwrap()).unwrap();
    writer::delete_task_markdown_in_file(
        path.to_str().unwrap(),
        2,
        "- [ ] Parent\n  note\n  - [ ] Child",
    )
    .unwrap();
    assert_eq!(fs::read_to_string(&path).unwrap(), "# Before\n- [ ] Keep\n");
    db::index_single_file(&vault.db, path.to_str().unwrap()).unwrap();
    assert!(!vault
        .tasks()
        .iter()
        .any(|task| ["Parent", "Child"].contains(&task.description.as_str())));
    assert!(vault.tasks().iter().any(|task| task.description == "Keep"));
}

#[test]
fn rename_rejects_late_destination_collision_without_rewriting_other_files() {
    for destination in ["projects/job.md", "projects/JOB.md", "projects/job/new.md"] {
        let vault = Vault::representative();
        let plan = plan_project_rename(&vault.root, "projects", "work", "job").unwrap();
        vault.write(destination, "# External destination\n");
        let before = vault.files();
        assert!(execute_project_rename_plan(&vault.root, &vault.db, &plan).is_err());
        assert_eq!(vault.files(), before);
    }
}

#[test]
fn rename_revalidates_every_source_before_first_write() {
    let vault = Vault::representative();
    let plan = plan_project_rename(&vault.root, "projects", "work", "job").unwrap();
    vault.write(
        "projects/work/client.md",
        "- [ ] New external work +work/client\n",
    );
    let before = vault.files();
    let error = execute_project_rename_plan(&vault.root, &vault.db, &plan).unwrap_err();
    assert_eq!(error.code, ProjectRenameErrorCode::StalePlan);
    assert_eq!(vault.files(), before);
}

#[test]
fn merge_rejects_changed_destination_and_preserves_staging_and_all_sources() {
    let vault = Vault::representative();
    vault.write("projects/job.md", "- [ ] Destination +job\n");
    let plan = plan_project_merge(&vault.root, "projects", "work", "job").unwrap();
    let resolutions: Vec<_> = plan
        .conflicts
        .iter()
        .map(|conflict| ProjectMergeResolution {
            conflict_id: conflict.id.clone(),
            action: ProjectMergeResolutionAction::UseDestination,
            result: None,
            source_name: None,
        })
        .collect();
    let prepared = prepare_project_merge(&vault.root, &plan, &resolutions).unwrap();
    vault.write("projects/job.md", "- [ ] New destination work +job\n");
    let before = vault.files();
    let error = execute_prepared_project_merge_indexed(&vault.root, &vault.db, &plan, &prepared)
        .unwrap_err();
    assert_eq!(error.code, ProjectMergeErrorCode::StalePlan);
    assert_eq!(vault.files(), before);
}

#[test]
fn fresh_cache_rebuild_matches_incremental_state_after_external_edits_and_deletion() {
    let vault = Vault::representative();
    let path = vault.write(
        "projects/work.md",
        "- [>] External replacement +work @outside #new\n",
    );
    fs::remove_file(vault.root.join("projects/work/client.md")).unwrap();
    db::boot_sweep(&vault.db, &vault.root).unwrap();
    let before = vault.files();
    let rebuilt = db::initialize_db(vault.temp.path().join("rebuilt.sqlite3")).unwrap();
    db::boot_sweep(&rebuilt, &vault.root).unwrap();
    let sorted = |tasks: Vec<parser::ParsedTask>| {
        let mut rows: Vec<_> = tasks
            .into_iter()
            .map(|task| serde_json::to_string(&task).unwrap())
            .collect();
        rows.sort();
        rows
    };
    assert_eq!(
        sorted(vault.tasks()),
        sorted(db::query_tasks(&rebuilt, "1=1", &[]).unwrap())
    );
    assert!(vault
        .tasks()
        .iter()
        .any(|task| task.file_path.as_deref() == path.to_str()
            && task.status == "deferred"
            && task.contexts == ["outside"]));
    assert!(!vault
        .tasks()
        .iter()
        .any(|task| task.description == "Call José" || task.description == "Ship release"));
    assert_eq!(vault.files(), before);
}

#[test]
fn crlf_schedule_context_and_raw_edits_preserve_unrelated_source() {
    let vault = Vault::new();
    let source = "# Notes\r\n- [ ] Plan +work @desk\r\n  Keep note\r\n- [ ] Neighbor\r\n";
    let path = vault.write("schedule.md", source);
    let file = path.to_str().unwrap();
    writer::move_task_in_file(
        file,
        2,
        "- [ ] Plan +work @desk\n  Keep note",
        "deferred",
        Some("calls"),
    )
    .unwrap();
    let moved = source.replace("- [ ] Plan +work @desk", "- [>] Plan +work @calls");
    assert_eq!(fs::read_to_string(&path).unwrap(), moved);
    writer::update_event_schedule_in_file(
        file,
        2,
        "- [>] Plan +work @calls\n  Keep note",
        Some("2026-10-01 09:00".into()),
        Some(1800),
    )
    .unwrap();
    let scheduled = moved.replace("@calls\r", "@calls s:2026-10-01 09:00 dur:30m\r");
    assert_eq!(fs::read_to_string(&path).unwrap(), scheduled);
    let (tasks, _) = parser::parse_markdown_content(file, &scheduled);
    writer::update_task_markdown_in_file(
        file,
        2,
        &tasks[0].raw_markdown,
        "- [ ] Edited +work\n  New note",
    )
    .unwrap();
    assert_eq!(
        fs::read_to_string(path).unwrap(),
        "# Notes\r\n- [ ] Edited +work\r\n  New note\r\n- [ ] Neighbor\r\n"
    );
}

#[test]
fn merge_index_failure_keeps_markdown_and_recovery_rebuildable() {
    let vault = Vault::representative();
    vault.write("projects/job/keep.md", "- [ ] Destination +job\n");
    let plan = plan_project_merge(&vault.root, "projects", "work", "job").unwrap();
    assert!(plan.conflicts.is_empty());
    let prepared = prepare_project_merge(&vault.root, &plan, &[]).unwrap();
    // Inject a real SQLite write failure without relying on platform permissions or SQL table layout.
    vault.db.execute_batch("PRAGMA query_only = ON;").unwrap();
    let error = execute_prepared_project_merge_indexed(&vault.root, &vault.db, &plan, &prepared)
        .unwrap_err();
    assert_eq!(error.code, ProjectMergeErrorCode::PartialFailure);
    let recovery = error.recovery.unwrap();
    assert!(recovery
        .pending_operations
        .iter()
        .any(|operation| operation == "Reconcile derived task index"));
    assert!(!recovery.completed_operations.is_empty());
    assert_eq!(
        fs::read_to_string(
            vault
                .root
                .join(&recovery.recovery_path)
                .join("originals/notes.md")
        )
        .unwrap(),
        NOTES
    );
    assert!(!vault.root.join("projects/work.md").exists());
    assert!(vault.root.join("projects/job.md").exists());
    assert!(vault.root.join(&prepared.staging_path).exists());
    let rebuilt = db::initialize_db(vault.temp.path().join("recovered.sqlite3")).unwrap();
    db::boot_sweep(&rebuilt, &vault.root).unwrap();
    let tasks = db::query_tasks(&rebuilt, "1=1", &[]).unwrap();
    assert!(tasks
        .iter()
        .any(|task| task.project.as_deref() == Some("job/client")));
    assert!(!tasks
        .iter()
        .any(|task| task.project.as_deref() == Some("work")));
    assert!(tasks
        .iter()
        .all(|task| !task.file_path.as_ref().unwrap().contains(".octarine/")));
}

#[test]
fn task_replacement_and_deletion_reject_unseen_descendants_and_changed_headers() {
    for content in [
        "- [ ] Parent\n  - [ ] New child\n",
        "- [ ] Parent\n\n  External note\n",
        "- [x] Parent\n",
    ] {
        let vault = Vault::new();
        let path = vault.write("task.md", content);
        let file = path.to_str().unwrap();
        for result in [
            writer::validate_task_markdown_in_file(file, 1, "- [ ] Parent"),
            writer::update_task_markdown_in_file(file, 1, "- [ ] Parent", "- [ ] Replacement"),
            writer::delete_task_markdown_in_file(file, 1, "- [ ] Parent"),
        ] {
            assert_eq!(
                result.unwrap_err().code,
                writer::WriteErrorCode::SourceChanged
            );
            assert_eq!(fs::read_to_string(&path).unwrap(), content);
        }
    }
}
