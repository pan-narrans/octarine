use crate::CHECKLIST_CHAR_CLASS;
use regex::Regex;
use rusqlite::{params, Connection};
use std::fs;
use std::path::Path;
use std::sync::OnceLock;

static CHECKBOX_SUB_RE: OnceLock<Regex> = OnceLock::new();
static STRIP_CHECKBOX_RE: OnceLock<Regex> = OnceLock::new();

fn get_checkbox_sub_re() -> &'static Regex {
    CHECKBOX_SUB_RE.get_or_init(|| {
        let pattern = format!(r"^(\s*[-*+]\s+\[)([{}])(\])(.*)$", CHECKLIST_CHAR_CLASS);
        Regex::new(&pattern).unwrap()
    })
}

fn get_strip_checkbox_re() -> &'static Regex {
    STRIP_CHECKBOX_RE.get_or_init(|| {
        let pattern = format!(r"^\s*[-*+]\s+\[[{}]\]\s*(.*)$", CHECKLIST_CHAR_CLASS);
        Regex::new(&pattern).unwrap()
    })
}

static RE_S: OnceLock<Regex> = OnceLock::new();
static RE_DUR: OnceLock<Regex> = OnceLock::new();
static RE_DONE: OnceLock<Regex> = OnceLock::new();

fn get_re_s() -> &'static Regex {
    RE_S.get_or_init(|| Regex::new(r"\s+s:\d{4}-\d{2}-\d{2}(\s+\d{2}:\d{2})?").unwrap())
}

fn get_re_dur() -> &'static Regex {
    RE_DUR.get_or_init(|| Regex::new(r"\s+dur:\d+[a-zA-Z\d]*").unwrap())
}

fn get_re_done() -> &'static Regex {
    RE_DONE.get_or_init(|| Regex::new(r"\s+done:\d{4}-\d{2}-\d{2}").unwrap())
}

pub fn update_task_status_in_file(
    db_conn: &Connection,
    file_path: &str,
    original_line_number: usize, // 1-based
    original_content_hash: &str,
    new_status: &str, // "todo", "doing", "done", "cancelled"
) -> Result<(), String> {
    // 1. Retrieve the original raw markdown from the database
    let mut stmt = db_conn
        .prepare("SELECT raw_markdown FROM tasks WHERE hash = ?")
        .map_err(|e| e.to_string())?;
    let original_raw_markdown: String = stmt
        .query_row(params![original_content_hash], |r| r.get(0))
        .map_err(|_| "Task hash not found in database cache. Please reload.".to_string())?;

    // 2. Read the file from disk
    if !Path::new(file_path).exists() {
        return Err(format!("File not found on disk: {}", file_path));
    }
    let content = fs::read_to_string(file_path).map_err(|e| e.to_string())?;
    let lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();

    let original_lines: Vec<&str> = original_raw_markdown.lines().collect();
    if original_lines.is_empty() {
        return Err("Original raw markdown is empty.".to_string());
    }

    let mut found_line: Option<usize> = None;

    // Phase 1: Direct Match
    if original_line_number <= lines.len() {
        let start_idx = original_line_number - 1;
        if is_match_at_line(&lines, start_idx, &original_lines) {
            found_line = Some(start_idx);
        }
    }

    // Phase 2: Nearby Search Fallback (up to 15 lines in both directions)
    if found_line.is_none() {
        let search_radius = 15;
        let start_line = original_line_number as i32 - 1;
        for offset in 1..=search_radius {
            // Check below
            let scan_idx = start_line + offset;
            if scan_idx >= 0
                && (scan_idx as usize) < lines.len()
                && is_match_at_line(&lines, scan_idx as usize, &original_lines)
            {
                found_line = Some(scan_idx as usize);
                break;
            }
            // Check above
            let scan_idx = start_line - offset;
            if scan_idx >= 0
                && (scan_idx as usize) < lines.len()
                && is_match_at_line(&lines, scan_idx as usize, &original_lines)
            {
                found_line = Some(scan_idx as usize);
                break;
            }
        }
    }

    // Phase 3: Conflict Resolution
    let line_idx = match found_line {
        Some(idx) => idx,
        None => {
            return Err("Concurrency Collision: The task could not be located in the file. It may have been edited or moved externally. Please refresh.".to_string());
        }
    };

    // 3. Perform the edit on lines starting at `line_idx`
    let mut edited_lines = lines;
    let target_line = &edited_lines[line_idx];

    // Determine the character to write
    let status_char = match new_status {
        "todo" => " ",
        "doing" => "/",
        "done" => "x",
        "cancelled" => "-",
        _ => " ",
    };

    // Substitute checkbox using regex
    let re = get_checkbox_sub_re();
    if let Some(caps) = re.captures(target_line) {
        let prefix = caps.get(1).unwrap().as_str();
        let suffix = caps.get(3).unwrap().as_str();
        let mut rest = caps.get(4).unwrap().as_str().to_string();

        // Clean out any pre-existing done:YYYY-MM-DD tags first
        let re_done = get_re_done();
        rest = re_done.replace_all(&rest, "").to_string();

        // If newly marked as completed, append local system date
        if new_status == "done" {
            let local_date = chrono::Local::now().format("%Y-%m-%d").to_string();
            rest.push_str(&format!(" done:{}", local_date));
        }

        let new_line = format!("{}{}{}{}", prefix, status_char, suffix, rest);
        edited_lines[line_idx] = new_line;
    } else {
        return Err("Failed to format checkbox on the target line.".to_string());
    }

    // 4. Save file back to disk
    let updated_content = edited_lines.join("\n");
    fs::write(file_path, updated_content).map_err(|e| e.to_string())?;

    Ok(())
}

fn is_match_at_line(file_lines: &[String], start_idx: usize, original_lines: &[&str]) -> bool {
    if start_idx + original_lines.len() > file_lines.len() {
        return false;
    }

    for (offset, orig_line) in original_lines.iter().enumerate() {
        let disk_line = &file_lines[start_idx + offset];
        if offset == 0 {
            // For the first line, compare stripped descriptions/contents ignoring the checkbox state,
            // to allow editing even if checkboxes are slightly different.
            // But let's check if the rest of the text matches exactly.
            let re = get_strip_checkbox_re();
            let disk_cap = re.captures(disk_line);
            let orig_cap = re.captures(orig_line);

            match (disk_cap, orig_cap) {
                (Some(dc), Some(oc)) => {
                    if dc.get(1).unwrap().as_str() != oc.get(1).unwrap().as_str() {
                        return false;
                    }
                }
                _ => return false,
            }
        } else {
            // Subsequent note lines must match exactly
            if disk_line != orig_line {
                return false;
            }
        }
    }
    true
}

pub fn update_event_schedule_in_file(
    db_conn: &Connection,
    file_path: &str,
    original_line_number: usize,
    original_content_hash: &str,
    new_s_start: Option<String>,
    new_duration_secs: Option<i32>,
) -> Result<(), String> {
    // 1. Retrieve the original raw markdown from the database
    let mut stmt = db_conn
        .prepare("SELECT raw_markdown FROM tasks WHERE hash = ?")
        .map_err(|e| e.to_string())?;
    let original_raw_markdown: String = stmt
        .query_row(params![original_content_hash], |r| r.get(0))
        .map_err(|_| "Task hash not found in database cache. Please reload.".to_string())?;

    // 2. Read the file from disk
    if !Path::new(file_path).exists() {
        return Err(format!("File not found on disk: {}", file_path));
    }
    let content = fs::read_to_string(file_path).map_err(|e| e.to_string())?;
    let lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();

    let original_lines: Vec<&str> = original_raw_markdown.lines().collect();
    if original_lines.is_empty() {
        return Err("Original raw markdown is empty.".to_string());
    }

    let mut found_line: Option<usize> = None;

    // Direct match check (Phase 1)
    if original_line_number <= lines.len() {
        let start_idx = original_line_number - 1;
        if is_match_at_line(&lines, start_idx, &original_lines) {
            found_line = Some(start_idx);
        }
    }

    // Fallback search check (Phase 2)
    if found_line.is_none() {
        let search_radius = 15;
        let start_line = original_line_number as i32 - 1;
        for offset in 1..=search_radius {
            let scan_idx = start_line + offset;
            if scan_idx >= 0
                && (scan_idx as usize) < lines.len()
                && is_match_at_line(&lines, scan_idx as usize, &original_lines)
            {
                found_line = Some(scan_idx as usize);
                break;
            }
            let scan_idx = start_line - offset;
            if scan_idx >= 0
                && (scan_idx as usize) < lines.len()
                && is_match_at_line(&lines, scan_idx as usize, &original_lines)
            {
                found_line = Some(scan_idx as usize);
                break;
            }
        }
    }

    let line_idx = match found_line {
        Some(idx) => idx,
        None => {
            return Err("Concurrency Collision: The event could not be located in the file. It may have been edited or moved externally. Please refresh.".to_string());
        }
    };

    let mut edited_lines = lines;
    let target_line = &edited_lines[line_idx];

    // Strip out any existing s: and dur: tags from the target line
    let re_s = get_re_s();
    let re_dur = get_re_dur();

    let mut line_clean = re_s.replace(target_line, "").to_string();
    line_clean = re_dur.replace(&line_clean, "").to_string();

    // Construct the new suffix
    let mut suffix = String::new();
    if let Some(s_val) = new_s_start {
        if !s_val.trim().is_empty() {
            suffix.push_str(&format!(" s:{}", s_val.trim()));
        }
    }
    if let Some(dur_val) = new_duration_secs {
        if dur_val > 0 {
            // Format as minutes, e.g. dur:90m
            let minutes = dur_val / 60;
            suffix.push_str(&format!(" dur:{}m", minutes));
        }
    }

    let new_line = format!("{}{}", line_clean, suffix);
    edited_lines[line_idx] = new_line;

    // Save back to disk
    let updated_content = edited_lines.join("\n");
    fs::write(file_path, updated_content).map_err(|e| e.to_string())?;

    Ok(())
}

pub fn update_task_markdown_in_file(
    db_conn: &Connection,
    file_path: &str,
    original_line_number: usize,
    original_content_hash: &str,
    new_raw_markdown: &str,
) -> Result<(), String> {
    // 1. Read file content on disk
    let file_content =
        fs::read_to_string(file_path).map_err(|e| format!("Failed to read file: {}", e))?;

    let mut lines: Vec<String> = file_content.split('\n').map(|s| s.to_string()).collect();

    // 2. Resolve original raw markdown from hash
    let mut stmt = db_conn
        .prepare("SELECT raw_markdown FROM tasks WHERE hash = ?")
        .map_err(|e| e.to_string())?;
    let original_raw_markdown: String = stmt
        .query_row(params![original_content_hash], |r| r.get(0))
        .map_err(|_| "Task hash not found in database cache. Please reload.".to_string())?;

    let original_block_lines: Vec<&str> = original_raw_markdown.lines().collect();
    if original_block_lines.is_empty() {
        return Err("Original raw markdown is empty.".to_string());
    }

    // 3. Locate the original block
    let mut found_start_idx: Option<usize> = None;
    let index_0 = original_line_number.saturating_sub(1);

    // Direct match check (Phase 1)
    if is_match_at_line(&lines, index_0, &original_block_lines) {
        found_start_idx = Some(index_0);
    }

    // Fallback search check (Phase 2)
    if found_start_idx.is_none() {
        let search_radius = 15;
        let start_line = original_line_number as i32 - 1;
        for offset in 1..=search_radius {
            let scan_idx = start_line + offset;
            if scan_idx >= 0
                && (scan_idx as usize) < lines.len()
                && is_match_at_line(&lines, scan_idx as usize, &original_block_lines)
            {
                found_start_idx = Some(scan_idx as usize);
                break;
            }
            let scan_idx = start_line - offset;
            if scan_idx >= 0
                && (scan_idx as usize) < lines.len()
                && is_match_at_line(&lines, scan_idx as usize, &original_block_lines)
            {
                found_start_idx = Some(scan_idx as usize);
                break;
            }
        }
    }

    let start_idx = match found_start_idx {
        Some(idx) => idx,
        None => return Err("Concurrency Collision: The task block could not be located in the file. It may have been edited or moved externally. Please refresh.".to_string()),
    };

    let end_idx = start_idx + original_block_lines.len();

    // 4. Splice the new lines into the vector
    let new_block_lines: Vec<String> = new_raw_markdown
        .split('\n')
        .map(|s| s.to_string())
        .collect();
    lines.splice(start_idx..end_idx, new_block_lines);

    // 5. Write back to disk
    let updated_content = lines.join("\n");
    fs::write(file_path, updated_content).map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{index_single_file, initialize_db};
    use tempfile::tempdir;

    #[test]
    fn test_safe_writer_direct_match_and_line_shift() {
        let temp_dir = tempdir().unwrap();
        let db_path = temp_dir.path().join("cache.db");
        let file_path = temp_dir.path().join("tasks.md");

        // Write initial file
        fs::write(
            &file_path,
            r#"# My Tasks
- [ ] Implement safe writer @db
- [ ] Write query dsl +work
"#,
        )
        .unwrap();

        let conn = initialize_db(&db_path).unwrap();
        index_single_file(&conn, file_path.to_str().unwrap()).unwrap();

        // Get the task's hash from DB
        let hash: String = conn
            .query_row(
                "SELECT hash FROM tasks WHERE description = 'Implement safe writer'",
                [],
                |r| r.get(0),
            )
            .unwrap();

        // 1. Test Direct Match: Mark "Implement safe writer" as doing (/)
        update_task_status_in_file(&conn, file_path.to_str().unwrap(), 2, &hash, "doing").unwrap();

        // Verify file updated
        let content_after = fs::read_to_string(&file_path).unwrap();
        assert!(content_after.contains("- [/] Implement safe writer @db"));

        // 2. Test Line Shift: Pretend an external editor inserts 3 empty lines at the top
        fs::write(
            &file_path,
            r#"


# My Tasks
- [/] Implement safe writer @db
- [ ] Write query dsl +work
"#,
        )
        .unwrap();

        // The task was originally at line 2. Now it is at line 5.
        // We will call the update_task_status_in_file specifying the original line 2 and original hash.
        update_task_status_in_file(&conn, file_path.to_str().unwrap(), 2, &hash, "done").unwrap();

        // Verify the file was updated correctly despite the line shift
        let content_after_shift = fs::read_to_string(&file_path).unwrap();
        assert!(content_after_shift.contains("- [x] Implement safe writer @db"));
    }

    #[test]
    fn test_update_event_schedule_in_file() {
        let temp_dir = tempdir().unwrap();
        let db_path = temp_dir.path().join("cache.db");
        let file_path = temp_dir.path().join("events.md");

        // Write initial event file
        fs::write(
            &file_path,
            r#"# Calendar Events
- [<] Project kickoff meeting s:2026-07-23 10:00 dur:60m
"#,
        )
        .unwrap();

        let conn = initialize_db(&db_path).unwrap();
        index_single_file(&conn, file_path.to_str().unwrap()).unwrap();

        // Get event's hash from DB
        let hash: String = conn
            .query_row(
                "SELECT hash FROM tasks WHERE description = 'Project kickoff meeting'",
                [],
                |r| r.get(0),
            )
            .unwrap();

        // Update schedule metadata to 11:30 and 1.5 hours duration (90 minutes / 5400 secs)
        update_event_schedule_in_file(
            &conn,
            file_path.to_str().unwrap(),
            2,
            &hash,
            Some("2026-07-23 11:30".to_string()),
            Some(5400),
        )
        .unwrap();

        // Verify the file updated correctly on disk
        let content_after = fs::read_to_string(&file_path).unwrap();
        assert!(content_after.contains("- [<] Project kickoff meeting s:2026-07-23 11:30 dur:90m"));
    }

    #[test]
    fn test_update_task_markdown_in_file() {
        let temp_dir = tempdir().unwrap();
        let db_path = temp_dir.path().join("cache.db");
        let file_path = temp_dir.path().join("tasks.md");

        // Write initial file
        fs::write(
            &file_path,
            r#"# My Tasks
- [ ] Implement inline editing @db
"#,
        )
        .unwrap();

        let conn = initialize_db(&db_path).unwrap();
        index_single_file(&conn, file_path.to_str().unwrap()).unwrap();

        let hash: String = conn
            .query_row(
                "SELECT hash FROM tasks WHERE description = 'Implement inline editing'",
                [],
                |r| r.get(0),
            )
            .unwrap();

        // Update full task raw markdown line
        update_task_markdown_in_file(
            &conn,
            file_path.to_str().unwrap(),
            2,
            &hash,
            "- [ ] (A) Implement inline editing @db due:2026-07-24",
        )
        .unwrap();

        let content_after = fs::read_to_string(&file_path).unwrap();
        assert!(content_after.contains("- [ ] (A) Implement inline editing @db due:2026-07-24"));
    }

    #[test]
    fn test_update_task_completion_date() {
        let temp_dir = tempdir().unwrap();
        let db_path = temp_dir.path().join("cache.db");
        let file_path = temp_dir.path().join("tasks.md");

        fs::write(
            &file_path,
            r#"# My Tasks
- [ ] Implement completion date @db
"#,
        )
        .unwrap();

        let conn = initialize_db(&db_path).unwrap();
        index_single_file(&conn, file_path.to_str().unwrap()).unwrap();

        let hash: String = conn
            .query_row(
                "SELECT hash FROM tasks WHERE description = 'Implement completion date'",
                [],
                |r| r.get(0),
            )
            .unwrap();

        // Mark as done
        update_task_status_in_file(&conn, file_path.to_str().unwrap(), 2, &hash, "done").unwrap();

        // Verify done:YYYY-MM-DD tag is appended
        let content_done = fs::read_to_string(&file_path).unwrap();
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        assert!(content_done.contains(&format!(
            "- [x] Implement completion date @db done:{}",
            today
        )));

        // Re-index file to update SQLite cache with the new hash
        index_single_file(&conn, file_path.to_str().unwrap()).unwrap();

        let new_hash: String = conn
            .query_row(
                "SELECT hash FROM tasks WHERE description = 'Implement completion date'",
                [],
                |r| r.get(0),
            )
            .unwrap();

        // Revert back to doing
        update_task_status_in_file(&conn, file_path.to_str().unwrap(), 2, &new_hash, "doing")
            .unwrap();

        // Verify done:YYYY-MM-DD tag is stripped
        let content_doing = fs::read_to_string(&file_path).unwrap();
        assert!(content_doing.contains("- [/] Implement completion date @db"));
        assert!(!content_doing.contains("done:"));
    }
}
