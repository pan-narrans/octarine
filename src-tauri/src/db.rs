use crate::parser;
use rusqlite::{params, Connection, Result};
use sha2::Digest;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

pub fn initialize_db<P: AsRef<Path>>(db_path: P) -> Result<Connection> {
    let conn = Connection::open(db_path)?;

    // Enable WAL mode and foreign key constraints
    conn.execute_batch(
        "
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
    ",
    )?;

    // Create Tables
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL UNIQUE,
            mtime INTEGER NOT NULL,
            hash TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);

        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER NOT NULL,
            line_number INTEGER NOT NULL,
            raw_markdown TEXT NOT NULL,
            hash TEXT NOT NULL,
            status TEXT NOT NULL,
            type TEXT NOT NULL,
            description TEXT NOT NULL,
            project TEXT,
            due_date TEXT,
            s_start TEXT,
            duration_secs INTEGER,
            recurring TEXT,
            when_done TEXT,
            parse_errors TEXT,
            priority INTEGER,
            parent_hash TEXT,
            FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_tasks_hash ON tasks(hash);
        CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
        CREATE INDEX IF NOT EXISTS idx_tasks_scheduled ON tasks(s_start);
        CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project);

        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        );
        CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);

        CREATE TABLE IF NOT EXISTS task_tags (
            task_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (task_id, tag_id),
            FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS contexts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        );
        CREATE INDEX IF NOT EXISTS idx_contexts_name ON contexts(name);

        CREATE TABLE IF NOT EXISTS task_contexts (
            task_id INTEGER NOT NULL,
            context_id INTEGER NOT NULL,
            PRIMARY KEY (task_id, context_id),
            FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            FOREIGN KEY(context_id) REFERENCES contexts(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS custom_views (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER NOT NULL,
            line_number INTEGER NOT NULL,
            title TEXT NOT NULL,
            query_raw TEXT NOT NULL,
            FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS merge_reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER NOT NULL,
            line_number INTEGER NOT NULL,
            my_state TEXT NOT NULL,
            peer_state TEXT NOT NULL,
            merged_state TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_merge_reviews_timestamp ON merge_reviews(timestamp);
    ",
    )?;

    // Runtime table schema migration for priority and parent_hash columns
    {
        let mut stmt = conn.prepare("PRAGMA table_info(tasks)")?;
        let columns: Vec<String> = stmt
            .query_map([], |row| row.get(1))?
            .filter_map(|r| r.ok())
            .collect();
        if !columns.contains(&"priority".to_string()) {
            conn.execute("ALTER TABLE tasks ADD COLUMN priority INTEGER", [])?;
        }
        if !columns.contains(&"parent_hash".to_string()) {
            conn.execute("ALTER TABLE tasks ADD COLUMN parent_hash TEXT", [])?;
        }
    }

    // Ensure index on parent_hash is created after column migration is complete
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_tasks_parent_hash ON tasks(parent_hash);",
        [],
    )?;

    Ok(conn)
}

pub fn get_file_mtime_and_hash(conn: &Connection, path: &str) -> Result<Option<(i64, String)>> {
    let mut stmt = conn.prepare("SELECT mtime, hash FROM files WHERE path = ?")?;
    let mut rows = stmt.query(params![path])?;
    if let Some(row) = rows.next()? {
        let mtime: i64 = row.get(0)?;
        let hash: String = row.get(1)?;
        Ok(Some((mtime, hash)))
    } else {
        Ok(None)
    }
}

pub fn insert_or_update_file(conn: &Connection, path: &str, mtime: i64, hash: &str) -> Result<i64> {
    conn.execute(
        "INSERT INTO files (path, mtime, hash) VALUES (?1, ?2, ?3)
         ON CONFLICT(path) DO UPDATE SET mtime = ?2, hash = ?3",
        params![path, mtime, hash],
    )?;
    let id: i64 = conn.query_row("SELECT id FROM files WHERE path = ?", params![path], |r| {
        r.get(0)
    })?;
    Ok(id)
}

pub fn delete_file(conn: &Connection, path: &str) -> Result<()> {
    conn.execute("DELETE FROM files WHERE path = ?", params![path])?;
    Ok(())
}

pub fn index_single_file(conn: &Connection, path: &str) -> Result<(), Box<dyn std::error::Error>> {
    let path_buf = fs::canonicalize(path)?;
    let canonical_path = path_buf.to_string_lossy().to_string();

    let metadata = fs::metadata(&canonical_path)?;
    let mtime = metadata.modified()?.duration_since(UNIX_EPOCH)?.as_secs() as i64;
    let content = fs::read_to_string(&canonical_path)?;

    // Compute checksum
    let mut hasher = sha2::Sha256::new();
    hasher.update(content.as_bytes());
    let file_hash = hex::encode(hasher.finalize());

    // Check if cached
    if let Some((cached_mtime, cached_hash)) = get_file_mtime_and_hash(conn, &canonical_path)? {
        if cached_mtime == mtime && cached_hash == file_hash {
            return Ok(()); // Match, skip parsing
        }
    }

    // Parse
    let (tasks, views) = parser::parse_markdown_content(&canonical_path, &content);

    // Save to DB in transaction
    let mut tx_conn = Connection::open_with_flags(
        conn.path().unwrap_or(""),
        rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE,
    )?;
    tx_conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    let tx = tx_conn.transaction()?;

    // Insert file
    tx.execute(
        "INSERT INTO files (path, mtime, hash) VALUES (?1, ?2, ?3)
         ON CONFLICT(path) DO UPDATE SET mtime = ?2, hash = ?3",
        params![&canonical_path, mtime, file_hash],
    )?;
    let file_id: i64 = tx.query_row(
        "SELECT id FROM files WHERE path = ?",
        params![&canonical_path],
        |r| r.get(0),
    )?;

    // Delete existing tasks & views for file
    tx.execute("DELETE FROM tasks WHERE file_id = ?", params![file_id])?;
    tx.execute(
        "DELETE FROM custom_views WHERE file_id = ?",
        params![file_id],
    )?;

    // Insert newly parsed tasks
    for task in tasks {
        tx.execute(
            "INSERT INTO tasks (
                file_id, line_number, raw_markdown, hash, status, type, description,
                project, due_date, s_start, duration_secs, recurring, when_done, parse_errors, priority, parent_hash
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
            params![
                file_id,
                task.line_number,
                task.raw_markdown,
                task.hash,
                task.status,
                task.task_type,
                task.description,
                task.project,
                task.due_date,
                task.s_start,
                task.duration_secs,
                task.recurring,
                task.when_done,
                task.parse_errors,
                task.priority,
                task.parent_hash
            ],
        )?;
        let task_id: i64 = tx.last_insert_rowid();

        // Handle Tags
        for tag in task.tags {
            tx.execute("INSERT OR IGNORE INTO tags (name) VALUES (?)", params![tag])?;
            let tag_id: i64 =
                tx.query_row("SELECT id FROM tags WHERE name = ?", params![tag], |r| {
                    r.get(0)
                })?;
            tx.execute(
                "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)",
                params![task_id, tag_id],
            )?;
        }

        // Handle Contexts
        for context in task.contexts {
            tx.execute(
                "INSERT OR IGNORE INTO contexts (name) VALUES (?)",
                params![context],
            )?;
            let context_id: i64 = tx.query_row(
                "SELECT id FROM contexts WHERE name = ?",
                params![context],
                |r| r.get(0),
            )?;
            tx.execute(
                "INSERT OR IGNORE INTO task_contexts (task_id, context_id) VALUES (?, ?)",
                params![task_id, context_id],
            )?;
        }
    }

    // Insert custom views
    for view in views {
        tx.execute(
            "INSERT INTO custom_views (file_id, line_number, title, query_raw) VALUES (?, ?, ?, ?)",
            params![file_id, view.line_number, view.title, view.query_raw],
        )?;
    }

    tx.commit()?;
    Ok(())
}

fn scan_directory_recursive(dir: &Path, files: &mut Vec<String>) -> std::io::Result<()> {
    if dir.is_dir() {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                scan_directory_recursive(&path, files)?;
            } else if let Some(ext) = path.extension() {
                if ext == "md" {
                    if let Ok(canonical) = fs::canonicalize(&path) {
                        files.push(canonical.to_string_lossy().to_string());
                    }
                }
            }
        }
    }
    Ok(())
}

pub fn boot_sweep<P: AsRef<Path>>(
    conn: &Connection,
    vault_dir: P,
) -> Result<(), Box<dyn std::error::Error>> {
    let vault_path = vault_dir.as_ref();
    if !vault_path.exists() {
        fs::create_dir_all(vault_path)?;
    }

    // 1. Scan filesystem for all .md files
    let mut fs_files = Vec::new();
    scan_directory_recursive(vault_path, &mut fs_files)?;

    // 2. Fetch all cached file paths from DB
    let mut stmt = conn.prepare("SELECT path FROM files")?;
    let db_paths: Vec<String> = stmt
        .query_map([], |row| row.get(0))?
        .filter_map(|r| r.ok())
        .collect();

    // 3. Index new or modified files
    for file_path in &fs_files {
        if let Err(e) = index_single_file(conn, file_path) {
            eprintln!("Error indexing file {}: {}", file_path, e);
        }
    }

    // 4. Remove files that exist in DB but no longer on disk
    for db_path in db_paths {
        if !fs_files.contains(&db_path) {
            delete_file(conn, &db_path)?;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    type IndexedTaskRow = (
        String,
        String,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<i32>,
    );

    #[test]
    fn test_db_initialization_and_sweep() {
        let temp_dir = tempdir().unwrap();
        let db_path = temp_dir.path().join("cache.db");
        let vault_dir = temp_dir.path().join("vault");
        fs::create_dir_all(&vault_dir).unwrap();

        let conn = initialize_db(&db_path).unwrap();

        // Create a test file
        let file_path = vault_dir.join("work-tasks.md");
        fs::write(
            &file_path,
            r#"- [ ] Design SQLite schema @db +work/database due:2026-07-22 #high-priority
- [<] Attend scrum s:2026-07-22 09:30 dur:30m +work
"#,
        )
        .unwrap();

        // Perform boot sweep
        boot_sweep(&conn, &vault_dir).unwrap();

        // Verify file indexed
        let mut stmt = conn.prepare("SELECT count(*) FROM files").unwrap();
        let file_count: i64 = stmt.query_row([], |r| r.get(0)).unwrap();
        assert_eq!(file_count, 1);

        // Verify tasks indexed
        let mut stmt = conn
            .prepare(
                "SELECT description, type, project, due_date, s_start, duration_secs FROM tasks",
            )
            .unwrap();
        let tasks: Vec<IndexedTaskRow> = stmt
            .query_map([], |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                ))
            })
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        assert_eq!(tasks.len(), 2);
        assert_eq!(tasks[0].0, "Design SQLite schema");
        assert_eq!(tasks[0].1, "task");
        assert_eq!(tasks[0].2.as_deref(), Some("work/database"));
        assert_eq!(tasks[0].3.as_deref(), Some("2026-07-22"));

        assert_eq!(tasks[1].0, "Attend scrum");
        assert_eq!(tasks[1].1, "event");
        assert_eq!(tasks[1].2.as_deref(), Some("work"));
        assert_eq!(tasks[1].4.as_deref(), Some("2026-07-22 09:30"));
        assert_eq!(tasks[1].5, Some(1800));

        // Verify tags & contexts
        let mut stmt = conn.prepare("SELECT name FROM tags").unwrap();
        let tags: Vec<String> = stmt
            .query_map([], |r| r.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        assert!(tags.contains(&"high-priority".to_string()));

        let mut stmt = conn.prepare("SELECT name FROM contexts").unwrap();
        let contexts: Vec<String> = stmt
            .query_map([], |r| r.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        assert!(contexts.contains(&"db".to_string()));

        // Delete the file and re-sweep
        fs::remove_file(&file_path).unwrap();
        boot_sweep(&conn, &vault_dir).unwrap();

        // Verify DB is clean
        let file_count_after: i64 = conn
            .query_row("SELECT count(*) FROM files", [], |r| r.get(0))
            .unwrap();
        assert_eq!(file_count_after, 0);

        let task_count_after: i64 = conn
            .query_row("SELECT count(*) FROM tasks", [], |r| r.get(0))
            .unwrap();
        assert_eq!(task_count_after, 0);
    }

    #[test]
    fn test_external_edit_duplication_bug() {
        let temp_dir = tempdir().unwrap();
        let db_path = temp_dir.path().join("cache.db");
        let vault_dir = temp_dir.path().join("vault");
        fs::create_dir_all(&vault_dir).unwrap();

        let conn = initialize_db(&db_path).unwrap();

        // 1. Initial creation and sweep index
        let file_path = vault_dir.join("tasks.md");
        fs::write(&file_path, r#"- [<] Fisio s:2026-08-11 due:2026-08-11"#).unwrap();

        // Simulating non-canonical path indexing (standard in relative sweeps)
        let relative_path_str = format!("{}/./tasks.md", vault_dir.to_string_lossy());
        index_single_file(&conn, &relative_path_str).unwrap();

        // Verify exactly 1 task exists initially
        let initial_count: i64 = conn
            .query_row("SELECT count(*) FROM tasks", [], |r| r.get(0))
            .unwrap();
        assert_eq!(initial_count, 1);

        // 2. Simulating external modification returned as absolute canonical path by watchers
        let canonical_path = file_path.canonicalize().unwrap();
        let canonical_path_str = canonical_path.to_string_lossy().to_string();

        fs::write(
            &file_path,
            r#"- [<] Fisio s:2026-08-11 due:2026-08-11 (edited)"#,
        )
        .unwrap();

        // Index edited path returned by file-watcher
        index_single_file(&conn, &canonical_path_str).unwrap();

        // Verify that we DO NOT have duplicates in database.
        // Under the current buggy behavior, final_count will be 2 because the two paths don't match!
        let final_count: i64 = conn
            .query_row("SELECT count(*) FROM tasks", [], |r| r.get(0))
            .unwrap();
        assert_eq!(final_count, 1);
    }

    #[test]
    fn test_hierarchical_project_queries() {
        let temp_dir = tempdir().unwrap();
        let db_path = temp_dir.path().join("cache.db");
        let vault_dir = temp_dir.path().join("vault");
        fs::create_dir_all(&vault_dir).unwrap();

        let conn = initialize_db(&db_path).unwrap();

        // Write file with parent task (+work) and nested task (+work/client/project)
        let file_path = vault_dir.join("tasks.md");
        fs::write(
            &file_path,
            r#"# Project Tasks
- [ ] Parent task +work
- [ ] Child task +work/client/project
"#,
        )
        .unwrap();

        index_single_file(&conn, file_path.to_str().unwrap()).unwrap();

        // Compile query "+work" which translates to hierarchical SQL
        let sql_filter = crate::query_dsl::compile_filter_to_sql("+work").unwrap();

        let query_str = format!("SELECT count(*) FROM tasks WHERE {}", sql_filter);

        // Execute query and assert that BOTH parent and nested child task are returned!
        let matched_tasks: i64 = conn.query_row(&query_str, [], |r| r.get(0)).unwrap();
        assert_eq!(matched_tasks, 2);
    }

    #[test]
    fn test_priority_parsing_and_indexing() {
        let temp_dir = tempdir().unwrap();
        let db_path = temp_dir.path().join("cache.db");
        let vault_dir = temp_dir.path().join("vault");
        fs::create_dir_all(&vault_dir).unwrap();

        let conn = initialize_db(&db_path).unwrap();

        // Write file with multiple task priority profiles ((A), (B), no priority)
        let file_path = vault_dir.join("tasks.md");
        fs::write(
            &file_path,
            r#"- [ ] (A) High priority task
- [ ] (B) Medium priority task
- [ ] Default task without priority
"#,
        )
        .unwrap();

        index_single_file(&conn, file_path.to_str().unwrap()).unwrap();

        // Query the database to assert that priority was indexed correctly
        let mut stmt = conn.prepare("SELECT description, priority FROM tasks ORDER BY CASE WHEN priority IS NULL THEN 9999 ELSE priority END ASC").unwrap();
        let results: Vec<(String, Option<i32>)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        assert_eq!(results.len(), 3);
        assert_eq!(results[0].0, "High priority task");
        assert_eq!(results[0].1, Some(1));

        assert_eq!(results[1].0, "Medium priority task");
        assert_eq!(results[1].1, Some(2));

        assert_eq!(results[2].0, "Default task without priority");
        assert_eq!(results[2].1, None);
    }
}
