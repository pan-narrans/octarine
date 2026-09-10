use crate::file_ops::write_file_content_on_disk;
use crate::CHECKLIST_CHAR_CLASS;
use regex::Regex;
use serde::Serialize;
use std::fs;
use std::path::Path;
use std::sync::OnceLock;

static CHECKBOX_SUB_RE: OnceLock<Regex> = OnceLock::new();
static STRIP_CHECKBOX_RE: OnceLock<Regex> = OnceLock::new();
static CONTEXT_RE: OnceLock<Regex> = OnceLock::new();
static VALID_CONTEXT_RE: OnceLock<Regex> = OnceLock::new();
static LINK_RE: OnceLock<Regex> = OnceLock::new();
static URL_RE: OnceLock<Regex> = OnceLock::new();
static CODE_RE: OnceLock<Regex> = OnceLock::new();

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ts_rs::TS)]
#[serde(rename_all = "snake_case")]
pub enum WriteErrorCode {
    SourceMissing,
    SourceChanged,
    SourceAmbiguous,
    InvalidSource,
    OperationFailed,
}

#[derive(Debug, Serialize, ts_rs::TS)]
pub struct WriteError {
    pub code: WriteErrorCode,
    pub message: &'static str,
}

impl WriteError {
    pub fn operation_failed() -> Self {
        Self {
            code: WriteErrorCode::OperationFailed,
            message: "The source file could not be updated.",
        }
    }

    pub fn source_missing() -> Self {
        Self {
            code: WriteErrorCode::SourceMissing,
            message: "The source file no longer exists. Please refresh.",
        }
    }
}

impl From<String> for WriteError {
    fn from(_: String) -> Self {
        Self::operation_failed()
    }
}

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

fn get_context_re() -> &'static Regex {
    CONTEXT_RE.get_or_init(|| Regex::new(r"@[\w\-/]+").unwrap())
}

fn get_valid_context_re() -> &'static Regex {
    VALID_CONTEXT_RE.get_or_init(|| Regex::new(r"^[\w\-/]+$").unwrap())
}

fn get_link_re() -> &'static Regex {
    LINK_RE.get_or_init(|| Regex::new(r"\[[^\]]*\]\([^)]*\)").unwrap())
}

fn get_url_re() -> &'static Regex {
    URL_RE.get_or_init(|| Regex::new(r"https?://[^\s]+").unwrap())
}

fn get_code_re() -> &'static Regex {
    CODE_RE.get_or_init(|| Regex::new(r"``[^`]+``|`[^`]+`").unwrap())
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

fn mask_range(masked: &mut [u8], start: usize, end: usize) {
    for byte in &mut masked[start..end] {
        *byte = b' ';
    }
}

fn primary_context_range(line: &str) -> Option<std::ops::Range<usize>> {
    let mut masked = line.as_bytes().to_vec();
    for expression in [get_link_re(), get_url_re(), get_code_re()] {
        for matched in expression.find_iter(line) {
            mask_range(&mut masked, matched.start(), matched.end());
        }
    }

    let mut search_start = 0;
    let mut comment_start = None;
    while let Some(offset) = line[search_start..].find("%%") {
        let delimiter = search_start + offset;
        if let Some(start) = comment_start.take() {
            mask_range(&mut masked, start, delimiter + 2);
        } else {
            comment_start = Some(delimiter);
        }
        search_start = delimiter + 2;
    }
    if let Some(start) = comment_start {
        mask_range(&mut masked, start, line.len());
    }

    let searchable = std::str::from_utf8(&masked).ok()?;
    get_context_re()
        .find(searchable)
        .map(|matched| matched.start()..matched.end())
}

fn replace_or_insert_primary_context(
    line: &str,
    new_primary_context: &str,
) -> Result<String, WriteError> {
    if !get_valid_context_re().is_match(new_primary_context) {
        return Err(WriteError {
            code: WriteErrorCode::InvalidSource,
            message: "The requested primary context is not valid.",
        });
    }

    let replacement = format!("@{new_primary_context}");
    if let Some(range) = primary_context_range(line) {
        let mut updated = line.to_string();
        updated.replace_range(range, &replacement);
        Ok(updated)
    } else {
        let content_end = line.trim_end().len();
        Ok(format!(
            "{} {}{}",
            &line[..content_end],
            replacement,
            &line[content_end..]
        ))
    }
}

pub fn move_task_in_file(
    file_path: &str,
    original_line_number: usize, // 1-based
    original_raw_markdown: &str,
    new_status: &str, // "todo", "doing", "deferred", "done", "cancelled"
    new_primary_context: Option<&str>,
) -> Result<(), WriteError> {
    if !Path::new(file_path).exists() {
        return Err(WriteError::source_missing());
    }
    let content = fs::read_to_string(file_path).map_err(|_| WriteError::operation_failed())?;
    let lines: Vec<String> = content.split('\n').map(|s| s.to_string()).collect();

    let original_lines: Vec<&str> = original_raw_markdown.lines().collect();
    if original_lines.is_empty() {
        return Err(WriteError {
            code: WriteErrorCode::InvalidSource,
            message: "The original task source is empty.",
        });
    }

    let line_idx = locate_source_block(&lines, original_line_number, &original_lines)?;

    let mut edited_lines = lines;
    let target_line = &edited_lines[line_idx];

    // Determine the character to write
    let status_char = match new_status {
        "todo" => " ",
        "doing" => "/",
        "deferred" => ">",
        "done" => "x",
        "cancelled" => "-",
        _ => {
            return Err(WriteError {
                code: WriteErrorCode::InvalidSource,
                message: "The requested task status is not supported.",
            });
        }
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

        let mut new_line = format!("{}{}{}{}", prefix, status_char, suffix, rest);
        if let Some(context) = new_primary_context {
            new_line = replace_or_insert_primary_context(&new_line, context)?;
        }
        edited_lines[line_idx] = new_line;
    } else {
        return Err(WriteError {
            code: WriteErrorCode::InvalidSource,
            message: "The target source is not a supported task checkbox.",
        });
    }

    let updated_content = edited_lines.join("\n");
    write_file_content_on_disk(file_path, &updated_content)?;

    Ok(())
}

pub fn update_task_status_in_file(
    file_path: &str,
    original_line_number: usize,
    original_raw_markdown: &str,
    new_status: &str,
) -> Result<(), WriteError> {
    move_task_in_file(
        file_path,
        original_line_number,
        original_raw_markdown,
        new_status,
        None,
    )
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
) -> Result<usize, WriteError> {
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
        [] => Err(WriteError {
            code: WriteErrorCode::SourceChanged,
            message: "The source changed or moved and could not be matched. Please refresh.",
        }),
        _ => Err(WriteError {
            code: WriteErrorCode::SourceAmbiguous,
            message: "Multiple matching source blocks were found. Please refresh.",
        }),
    }
}

pub fn validate_task_markdown_in_file(
    file_path: &str,
    original_line_number: usize,
    original_raw_markdown: &str,
) -> Result<(), WriteError> {
    let content = fs::read_to_string(file_path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            WriteError::source_missing()
        } else {
            WriteError::operation_failed()
        }
    })?;
    let lines: Vec<String> = content.split('\n').map(str::to_string).collect();
    let original_lines: Vec<&str> = original_raw_markdown.lines().collect();
    if original_lines.is_empty() {
        return Err(WriteError {
            code: WriteErrorCode::InvalidSource,
            message: "The original task source is empty.",
        });
    }
    locate_source_block(&lines, original_line_number, &original_lines)?;
    Ok(())
}

pub fn update_event_schedule_in_file(
    file_path: &str,
    original_line_number: usize,
    original_raw_markdown: &str,
    new_s_start: Option<String>,
    new_duration_secs: Option<i32>,
) -> Result<(), WriteError> {
    if !Path::new(file_path).exists() {
        return Err(WriteError::source_missing());
    }
    let content = fs::read_to_string(file_path).map_err(|_| WriteError::operation_failed())?;
    let lines: Vec<String> = content.split('\n').map(|s| s.to_string()).collect();

    let original_lines: Vec<&str> = original_raw_markdown.lines().collect();
    if original_lines.is_empty() {
        return Err(WriteError {
            code: WriteErrorCode::InvalidSource,
            message: "The original event source is empty.",
        });
    }

    let line_idx = locate_source_block(&lines, original_line_number, &original_lines)?;

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
) -> Result<(), WriteError> {
    // 1. Read file content on disk
    let file_content = fs::read_to_string(file_path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            WriteError::source_missing()
        } else {
            WriteError::operation_failed()
        }
    })?;

    let mut lines: Vec<String> = file_content.split('\n').map(|s| s.to_string()).collect();

    let original_block_lines: Vec<&str> = original_raw_markdown.lines().collect();
    if original_block_lines.is_empty() {
        return Err(WriteError {
            code: WriteErrorCode::InvalidSource,
            message: "The original task source is empty.",
        });
    }

    let start_idx = locate_source_block(&lines, original_line_number, &original_block_lines)?;

    let parent_indent = lines[start_idx]
        .chars()
        .take_while(|c| c.is_whitespace())
        .count();
    let mut end_idx = start_idx + original_block_lines.len();
    while end_idx < lines.len() {
        let line = &lines[end_idx];
        if line.trim().is_empty()
            || line.chars().take_while(|c| c.is_whitespace()).count() > parent_indent
        {
            end_idx += 1;
        } else {
            break;
        }
    }

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

pub fn delete_task_markdown_in_file(
    file_path: &str,
    original_line_number: usize,
    original_raw_markdown: &str,
) -> Result<(), WriteError> {
    let content = fs::read_to_string(file_path).map_err(|_| WriteError::source_missing())?;
    let mut lines: Vec<String> = content.split('\n').map(str::to_string).collect();
    let original_lines: Vec<&str> = original_raw_markdown.lines().collect();
    let start_idx = locate_source_block(&lines, original_line_number, &original_lines)?;
    let parent_indent = lines[start_idx]
        .chars()
        .take_while(|c| c.is_whitespace())
        .count();
    let mut end_idx = start_idx + original_lines.len();
    while end_idx < lines.len() {
        let line = &lines[end_idx];
        if line.trim().is_empty()
            || line.chars().take_while(|c| c.is_whitespace()).count() > parent_indent
        {
            end_idx += 1;
        } else {
            break;
        }
    }
    lines.drain(start_idx..end_idx);
    write_file_content_on_disk(file_path, &lines.join("\n"))?;
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
    fn test_update_task_to_deferred_and_reject_unknown_status() {
        let temp_dir = tempdir().unwrap();
        let file_path = temp_dir.path().join("tasks.md");
        fs::write(&file_path, "- [ ] Revisit navigation @desk\n").unwrap();

        update_task_status_in_file(
            file_path.to_str().unwrap(),
            1,
            "- [ ] Revisit navigation @desk",
            "deferred",
        )
        .unwrap();
        assert_eq!(
            fs::read_to_string(&file_path).unwrap(),
            "- [>] Revisit navigation @desk\n"
        );

        let error = update_task_status_in_file(
            file_path.to_str().unwrap(),
            1,
            "- [>] Revisit navigation @desk",
            "unknown",
        )
        .unwrap_err();
        assert_eq!(error.code, WriteErrorCode::InvalidSource);
        assert_eq!(
            fs::read_to_string(&file_path).unwrap(),
            "- [>] Revisit navigation @desk\n"
        );
    }

    #[test]
    fn test_move_task_replaces_only_primary_context() {
        let temp_dir = tempdir().unwrap();
        let file_path = temp_dir.path().join("tasks.md");
        let original = "- [ ] Coordinate [Ana](https://example.com/@linked) `@code` %% @comment %% @call @legacy";
        fs::write(&file_path, format!("{original}\n")).unwrap();

        move_task_in_file(
            file_path.to_str().unwrap(),
            1,
            original,
            "doing",
            Some("ana"),
        )
        .unwrap();

        assert_eq!(
            fs::read_to_string(&file_path).unwrap(),
            "- [/] Coordinate [Ana](https://example.com/@linked) `@code` %% @comment %% @ana @legacy\n"
        );
    }

    #[test]
    fn test_move_task_status_only_preserves_all_contexts() {
        let temp_dir = tempdir().unwrap();
        let file_path = temp_dir.path().join("tasks.md");
        let original = "- [ ] Coordinate @ana @call";
        fs::write(&file_path, format!("{original}\n")).unwrap();

        move_task_in_file(file_path.to_str().unwrap(), 1, original, "deferred", None).unwrap();

        assert_eq!(
            fs::read_to_string(&file_path).unwrap(),
            "- [>] Coordinate @ana @call\n"
        );
    }

    #[test]
    fn test_move_task_inserts_context_and_preserves_trailing_space() {
        let temp_dir = tempdir().unwrap();
        let file_path = temp_dir.path().join("tasks.md");
        fs::write(&file_path, "- [>] Revisit navigation  \n").unwrap();

        move_task_in_file(
            file_path.to_str().unwrap(),
            1,
            "- [>] Revisit navigation  ",
            "todo",
            Some("desk"),
        )
        .unwrap();

        assert_eq!(
            fs::read_to_string(&file_path).unwrap(),
            "- [ ] Revisit navigation @desk  \n"
        );
    }

    #[test]
    fn test_move_task_rejects_invalid_context_without_writing() {
        let temp_dir = tempdir().unwrap();
        let file_path = temp_dir.path().join("tasks.md");
        let original = "- [ ] Revisit navigation @desk\n";
        fs::write(&file_path, original).unwrap();

        let error = move_task_in_file(
            file_path.to_str().unwrap(),
            1,
            original.trim_end(),
            "doing",
            Some("not valid"),
        )
        .unwrap_err();

        assert_eq!(error.code, WriteErrorCode::InvalidSource);
        assert_eq!(fs::read_to_string(&file_path).unwrap(), original);
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

        assert_eq!(error.code, WriteErrorCode::SourceAmbiguous);
        assert_eq!(
            serde_json::to_value(&error).unwrap()["code"],
            "source_ambiguous"
        );
        assert_eq!(fs::read_to_string(&file_path).unwrap(), content);
    }

    #[test]
    fn test_safe_writer_reports_changed_and_missing_sources() {
        let temp_dir = tempdir().unwrap();
        let file_path = temp_dir.path().join("tasks.md");
        fs::write(&file_path, "- [ ] Edited externally\n").unwrap();

        let changed = update_task_status_in_file(
            file_path.to_str().unwrap(),
            1,
            "- [ ] Original task",
            "done",
        )
        .unwrap_err();
        assert_eq!(changed.code, WriteErrorCode::SourceChanged);

        fs::remove_file(&file_path).unwrap();
        let missing = update_task_status_in_file(
            file_path.to_str().unwrap(),
            1,
            "- [ ] Original task",
            "done",
        )
        .unwrap_err();
        assert_eq!(missing.code, WriteErrorCode::SourceMissing);
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
    fn test_update_parent_replaces_existing_subtask_hierarchy() {
        let temp_dir = tempdir().unwrap();
        let file_path = temp_dir.path().join("tasks.md");
        fs::write(
            &file_path,
            "- [ ] Parent\n    - [ ] Old child\n        - [ ] Old grandchild\n- [ ] Following task\n",
        )
        .unwrap();

        update_task_markdown_in_file(
            file_path.to_str().unwrap(),
            1,
            "- [ ] Parent",
            "- [ ] Parent updated\n    - [ ] Replacement child",
        )
        .unwrap();

        let content = fs::read_to_string(&file_path).unwrap();
        assert!(content.contains("Parent updated"));
        assert!(content.contains("Replacement child"));
        assert!(!content.contains("Old child"));
        assert!(!content.contains("Old grandchild"));
        assert!(content.contains("Following task"));
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
