use crate::file_ops::write_file_content_on_disk;
use crate::CHECKLIST_CHAR_CLASS;
use regex::Regex;
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
    file_path: &str,
    original_line_number: usize, // 1-based
    original_raw_markdown: &str,
    new_status: &str, // "todo", "doing", "done", "cancelled"
) -> Result<(), String> {
    if !Path::new(file_path).exists() {
        return Err(format!("File not found on disk: {}", file_path));
    }
    let content = fs::read_to_string(file_path).map_err(|e| e.to_string())?;
    let lines: Vec<String> = content.split('\n').map(|s| s.to_string()).collect();

    let original_lines: Vec<&str> = original_raw_markdown.lines().collect();
    if original_lines.is_empty() {
        return Err("Original raw markdown is empty.".to_string());
    }

    let line_idx = locate_source_block(&lines, original_line_number, &original_lines, "task")?;

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

    let updated_content = edited_lines.join("\n");
    write_file_content_on_disk(file_path, &updated_content)?;

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

fn locate_source_block(
    file_lines: &[String],
    original_line_number: usize,
    original_lines: &[&str],
    source_kind: &str,
) -> Result<usize, String> {
    const SEARCH_RADIUS: usize = 15;

    let expected_idx = original_line_number.checked_sub(1);
    if let Some(idx) = expected_idx {
        if idx < file_lines.len() && is_match_at_line(file_lines, idx, original_lines) {
            return Ok(idx);
        }
    }

    let center = expected_idx.unwrap_or(0);
    let search_start = center.saturating_sub(SEARCH_RADIUS);
    let search_end = center
        .saturating_add(SEARCH_RADIUS)
        .min(file_lines.len().saturating_sub(1));
    let matches: Vec<usize> = (search_start..=search_end)
        .filter(|idx| Some(*idx) != expected_idx)
        .filter(|idx| is_match_at_line(file_lines, *idx, original_lines))
        .collect();

    match matches.as_slice() {
        [idx] => Ok(*idx),
        [] => Err(format!(
            "Concurrency Collision: The {source_kind} could not be located in the file. It may have been edited or moved externally. Please refresh."
        )),
        _ => Err(format!(
            "Concurrency Collision: Multiple matching {source_kind} blocks were found near the expected location. No file changes were made. Please refresh."
        )),
    }
}

pub fn update_event_schedule_in_file(
    file_path: &str,
    original_line_number: usize,
    original_raw_markdown: &str,
    new_s_start: Option<String>,
    new_duration_secs: Option<i32>,
) -> Result<(), String> {
    if !Path::new(file_path).exists() {
        return Err(format!("File not found on disk: {}", file_path));
    }
    let content = fs::read_to_string(file_path).map_err(|e| e.to_string())?;
    let lines: Vec<String> = content.split('\n').map(|s| s.to_string()).collect();

    let original_lines: Vec<&str> = original_raw_markdown.lines().collect();
    if original_lines.is_empty() {
        return Err("Original raw markdown is empty.".to_string());
    }

    let line_idx = locate_source_block(&lines, original_line_number, &original_lines, "event")?;

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

    let updated_content = edited_lines.join("\n");
    write_file_content_on_disk(file_path, &updated_content)?;

    Ok(())
}

pub fn update_task_markdown_in_file(
    file_path: &str,
    original_line_number: usize,
    original_raw_markdown: &str,
    new_raw_markdown: &str,
) -> Result<(), String> {
    // 1. Read file content on disk
    let file_content =
        fs::read_to_string(file_path).map_err(|e| format!("Failed to read file: {}", e))?;

    let mut lines: Vec<String> = file_content.split('\n').map(|s| s.to_string()).collect();

    let original_block_lines: Vec<&str> = original_raw_markdown.lines().collect();
    if original_block_lines.is_empty() {
        return Err("Original raw markdown is empty.".to_string());
    }

    let start_idx =
        locate_source_block(&lines, original_line_number, &original_block_lines, "task")?;

    let end_idx = start_idx + original_block_lines.len();

    // 4. Splice the new lines into the vector
    let new_block_lines: Vec<String> = new_raw_markdown
        .split('\n')
        .map(|s| s.to_string())
        .collect();
    lines.splice(start_idx..end_idx, new_block_lines);

    let updated_content = lines.join("\n");
    write_file_content_on_disk(file_path, &updated_content)?;

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

        let original_raw_markdown: String = conn
            .query_row(
                "SELECT raw_markdown FROM tasks WHERE description = 'Implement safe writer'",
                [],
                |r| r.get(0),
            )
            .unwrap();

        // The source block supplied by the caller is sufficient even if the derived cache is stale.
        conn.execute("DELETE FROM tasks", []).unwrap();

        // 1. Test Direct Match: Mark "Implement safe writer" as doing (/)
        update_task_status_in_file(
            file_path.to_str().unwrap(),
            2,
            &original_raw_markdown,
            "doing",
        )
        .unwrap();

        // Verify file updated
        let content_after = fs::read_to_string(&file_path).unwrap();
        assert!(content_after.contains("- [/] Implement safe writer @db"));
        assert!(content_after.ends_with('\n'));

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
        update_task_status_in_file(
            file_path.to_str().unwrap(),
            2,
            &original_raw_markdown,
            "done",
        )
        .unwrap();

        // Verify the file was updated correctly despite the line shift
        let content_after_shift = fs::read_to_string(&file_path).unwrap();
        assert!(content_after_shift.contains("- [x] Implement safe writer @db"));
        assert!(content_after_shift.ends_with('\n'));
    }

    #[test]
    fn test_safe_writer_rejects_ambiguous_nearby_matches() {
        let temp_dir = tempdir().unwrap();
        let file_path = temp_dir.path().join("tasks.md");
        let content = "# Tasks\n- [ ] Duplicate task\n\n- [ ] Duplicate task\n";
        fs::write(&file_path, content).unwrap();

        let error = update_task_status_in_file(
            file_path.to_str().unwrap(),
            3,
            "- [ ] Duplicate task",
            "done",
        )
        .unwrap_err();

        assert!(error.contains("Multiple matching task blocks"));
        assert_eq!(fs::read_to_string(&file_path).unwrap(), content);
    }

    #[test]
    fn test_safe_writer_prefers_exact_location_for_duplicate_content() {
        let temp_dir = tempdir().unwrap();
        let file_path = temp_dir.path().join("tasks.md");
        fs::write(
            &file_path,
            "# Tasks\n- [ ] Duplicate task\n\n- [ ] Duplicate task\n",
        )
        .unwrap();

        update_task_status_in_file(
            file_path.to_str().unwrap(),
            4,
            "- [ ] Duplicate task",
            "doing",
        )
        .unwrap();

        assert_eq!(
            fs::read_to_string(&file_path).unwrap(),
            "# Tasks\n- [ ] Duplicate task\n\n- [/] Duplicate task\n"
        );
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

        let original_raw_markdown: String = conn
            .query_row(
                "SELECT raw_markdown FROM tasks WHERE description = 'Project kickoff meeting'",
                [],
                |r| r.get(0),
            )
            .unwrap();

        // Update schedule metadata to 11:30 and 1.5 hours duration (90 minutes / 5400 secs)
        update_event_schedule_in_file(
            file_path.to_str().unwrap(),
            2,
            &original_raw_markdown,
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

        let original_raw_markdown: String = conn
            .query_row(
                "SELECT raw_markdown FROM tasks WHERE description = 'Implement inline editing'",
                [],
                |r| r.get(0),
            )
            .unwrap();

        // Update full task raw markdown line
        update_task_markdown_in_file(
            file_path.to_str().unwrap(),
            2,
            &original_raw_markdown,
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

        let original_raw_markdown: String = conn
            .query_row(
                "SELECT raw_markdown FROM tasks WHERE description = 'Implement completion date'",
                [],
                |r| r.get(0),
            )
            .unwrap();

        // Mark as done
        update_task_status_in_file(
            file_path.to_str().unwrap(),
            2,
            &original_raw_markdown,
            "done",
        )
        .unwrap();

        // Verify done:YYYY-MM-DD tag is appended
        let content_done = fs::read_to_string(&file_path).unwrap();
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        assert!(content_done.contains(&format!(
            "- [x] Implement completion date @db done:{}",
            today
        )));

        // Re-index file to obtain the source block containing the completion date.
        index_single_file(&conn, file_path.to_str().unwrap()).unwrap();

        let updated_raw_markdown: String = conn
            .query_row(
                "SELECT raw_markdown FROM tasks WHERE description = 'Implement completion date'",
                [],
                |r| r.get(0),
            )
            .unwrap();

        // Revert back to doing
        update_task_status_in_file(
            file_path.to_str().unwrap(),
            2,
            &updated_raw_markdown,
            "doing",
        )
        .unwrap();

        // Verify done:YYYY-MM-DD tag is stripped
        let content_doing = fs::read_to_string(&file_path).unwrap();
        assert!(content_doing.contains("- [/] Implement completion date @db"));
        assert!(!content_doing.contains("done:"));
    }
}
