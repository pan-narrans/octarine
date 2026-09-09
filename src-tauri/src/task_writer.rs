use crate::config::{InsertionConfig, InsertionMode};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::Path;
use tempfile::NamedTempFile;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "snake_case")]
pub enum CreateWarningCode {
    InsertionTargetMissing,
    InsertionTargetAmbiguous,
    AppendedAtEof,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
pub struct CreateWarning {
    pub code: CreateWarningCode,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct InsertionResult {
    pub content: String,
    pub line_number: usize,
    pub warning: Option<CreateWarning>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileInsertionResult {
    pub insertion: InsertionResult,
    pub created_file: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TaskFileWriteError {
    Conflict,
    OperationFailed,
}

impl std::fmt::Display for TaskFileWriteError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Conflict => write!(
                formatter,
                "Destination changed repeatedly. No newer content was overwritten."
            ),
            Self::OperationFailed => write!(formatter, "Destination file could not be updated."),
        }
    }
}

impl std::error::Error for TaskFileWriteError {}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WriteAttempt {
    pub number: usize,
    pub destination_existed: bool,
}

pub fn write_task_block(
    destination: &Path,
    rendered_template: &str,
    task_block: &str,
    insertion: &InsertionConfig,
) -> Result<FileInsertionResult, TaskFileWriteError> {
    write_task_block_with_hook(
        destination,
        rendered_template,
        task_block,
        insertion,
        |_| {},
    )
}

fn write_task_block_with_hook<F>(
    destination: &Path,
    rendered_template: &str,
    task_block: &str,
    insertion: &InsertionConfig,
    mut before_commit: F,
) -> Result<FileInsertionResult, TaskFileWriteError>
where
    F: FnMut(WriteAttempt),
{
    for number in 1..=2 {
        let destination_existed = destination.exists();
        let snapshot = if destination_existed {
            fs::read_to_string(destination).map_err(|_| TaskFileWriteError::OperationFailed)?
        } else {
            rendered_template.to_string()
        };
        let result = insert_task_block(&snapshot, task_block, insertion)
            .map_err(|_| TaskFileWriteError::OperationFailed)?;
        before_commit(WriteAttempt {
            number,
            destination_existed,
        });

        let write_result = if destination_existed {
            replace_existing_if_unchanged(destination, &snapshot, &result.content)
        } else {
            create_new_file(destination, &result.content)
        };
        match write_result {
            Ok(()) => {
                return Ok(FileInsertionResult {
                    insertion: result,
                    created_file: !destination_existed,
                });
            }
            Err(CommitError::Changed) if number == 1 => continue,
            Err(CommitError::Changed) => return Err(TaskFileWriteError::Conflict),
            Err(CommitError::Io) => return Err(TaskFileWriteError::OperationFailed),
        }
    }
    unreachable!("bounded write loop always returns")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CommitError {
    Changed,
    Io,
}

fn replace_existing_if_unchanged(
    destination: &Path,
    expected: &str,
    updated: &str,
) -> Result<(), CommitError> {
    let parent = destination.parent().ok_or(CommitError::Io)?;
    let permissions = fs::metadata(destination)
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                CommitError::Changed
            } else {
                CommitError::Io
            }
        })?
        .permissions();
    let mut temporary = NamedTempFile::new_in(parent).map_err(|_| CommitError::Io)?;
    temporary
        .write_all(updated.as_bytes())
        .map_err(|_| CommitError::Io)?;
    temporary
        .as_file_mut()
        .set_permissions(permissions)
        .map_err(|_| CommitError::Io)?;
    temporary
        .as_file_mut()
        .sync_all()
        .map_err(|_| CommitError::Io)?;
    let current = fs::read_to_string(destination).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            CommitError::Changed
        } else {
            CommitError::Io
        }
    })?;
    if current != expected {
        return Err(CommitError::Changed);
    }
    temporary
        .persist(destination)
        .map_err(|_| CommitError::Io)?;
    Ok(())
}

fn create_new_file(destination: &Path, content: &str) -> Result<(), CommitError> {
    let parent = destination.parent().ok_or(CommitError::Io)?;
    fs::create_dir_all(parent).map_err(|_| CommitError::Io)?;
    let mut temporary = NamedTempFile::new_in(parent).map_err(|_| CommitError::Io)?;
    temporary
        .write_all(content.as_bytes())
        .map_err(|_| CommitError::Io)?;
    temporary
        .as_file_mut()
        .sync_all()
        .map_err(|_| CommitError::Io)?;
    temporary.persist_noclobber(destination).map_err(|error| {
        if error.error.kind() == std::io::ErrorKind::AlreadyExists {
            CommitError::Changed
        } else {
            CommitError::Io
        }
    })?;
    Ok(())
}

pub fn insert_task_block(
    content: &str,
    task_block: &str,
    insertion: &InsertionConfig,
) -> Result<InsertionResult, String> {
    if task_block.trim().is_empty() {
        return Err("Task block cannot be empty.".to_string());
    }
    let line_ending = detect_line_ending(content);
    let task_block = normalize_line_endings(task_block, line_ending);

    match insertion.mode {
        InsertionMode::Heading | InsertionMode::Marker => {
            let target = insertion
                .target
                .as_deref()
                .ok_or_else(|| "Insertion target is required.".to_string())?;
            let matches = matching_line_ends(content, target);
            match matches.as_slice() {
                [position] => insert_at(content, &task_block, *position, line_ending, None),
                [] => append_at_eof(
                    content,
                    &task_block,
                    line_ending,
                    CreateWarning {
                        code: CreateWarningCode::InsertionTargetMissing,
                        message: "Insertion target was not found. Task appended at end of file."
                            .to_string(),
                    },
                ),
                _ => append_at_eof(
                    content,
                    &task_block,
                    line_ending,
                    CreateWarning {
                        code: CreateWarningCode::InsertionTargetAmbiguous,
                        message:
                            "Insertion target appears multiple times. Task appended at end of file."
                                .to_string(),
                    },
                ),
            }
        }
        InsertionMode::Eof => append_at_eof(
            content,
            &task_block,
            line_ending,
            CreateWarning {
                code: CreateWarningCode::AppendedAtEof,
                message: "Task appended at end of file.".to_string(),
            },
        ),
    }
}

fn matching_line_ends(content: &str, target: &str) -> Vec<usize> {
    let mut matches = Vec::new();
    let mut offset = 0;
    for segment in content.split_inclusive('\n') {
        let line = segment
            .strip_suffix('\n')
            .unwrap_or(segment)
            .strip_suffix('\r')
            .unwrap_or_else(|| segment.strip_suffix('\n').unwrap_or(segment));
        if line == target {
            matches.push(offset + segment.len());
        }
        offset += segment.len();
    }
    if !content.is_empty() && !content.ends_with('\n') {
        let start = content.rfind('\n').map_or(0, |position| position + 1);
        let line = content[start..]
            .strip_suffix('\r')
            .unwrap_or(&content[start..]);
        if line == target && !matches.contains(&content.len()) {
            matches.push(content.len());
        }
    }
    matches
}

fn insert_at(
    content: &str,
    task_block: &str,
    position: usize,
    line_ending: &str,
    warning: Option<CreateWarning>,
) -> Result<InsertionResult, String> {
    let target_had_line_ending = position > 0 && content.as_bytes()[position - 1] == b'\n';
    let had_trailing_line_ending = content.ends_with('\n');
    let mut updated =
        String::with_capacity(content.len() + task_block.len() + line_ending.len() * 2);
    updated.push_str(&content[..position]);
    if !target_had_line_ending {
        updated.push_str(line_ending);
    }
    updated.push_str(task_block);
    if position < content.len() || had_trailing_line_ending {
        updated.push_str(line_ending);
    }
    updated.push_str(&content[position..]);
    let line_number = if content.is_empty() {
        1
    } else {
        content[..position]
            .bytes()
            .filter(|byte| *byte == b'\n')
            .count()
            + if target_had_line_ending { 1 } else { 2 }
    };
    Ok(InsertionResult {
        content: updated,
        line_number,
        warning,
    })
}

fn append_at_eof(
    content: &str,
    task_block: &str,
    line_ending: &str,
    warning: CreateWarning,
) -> Result<InsertionResult, String> {
    let position = content.len();
    let had_trailing_line_ending = content.ends_with('\n');
    let mut result = insert_at(content, task_block, position, line_ending, Some(warning))?;
    if had_trailing_line_ending && !result.content.ends_with(line_ending) {
        result.content.push_str(line_ending);
    }
    Ok(result)
}

fn detect_line_ending(content: &str) -> &'static str {
    if content.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    }
}

fn normalize_line_endings(content: &str, line_ending: &str) -> String {
    content
        .replace("\r\n", "\n")
        .trim_end_matches('\n')
        .split('\n')
        .collect::<Vec<_>>()
        .join(line_ending)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    use tempfile::tempdir;

    fn heading() -> InsertionConfig {
        InsertionConfig {
            mode: InsertionMode::Heading,
            target: Some("## Tasks".to_string()),
        }
    }

    #[test]
    fn inserts_newest_task_directly_below_unique_heading() {
        let content = "# Note\n\n## Tasks\n- [ ] Older\n";
        let result = insert_task_block(content, "- [ ] New", &heading()).unwrap();

        assert_eq!(
            result.content,
            "# Note\n\n## Tasks\n- [ ] New\n- [ ] Older\n"
        );
        assert_eq!(result.line_number, 4);
        assert_eq!(result.warning, None);
    }

    #[test]
    fn missing_and_duplicate_targets_fall_back_to_eof() {
        let missing = insert_task_block("# Note\n", "- [ ] New", &heading()).unwrap();
        assert_eq!(missing.content, "# Note\n- [ ] New\n");
        assert_eq!(
            missing.warning.unwrap().code,
            CreateWarningCode::InsertionTargetMissing
        );

        let duplicate = insert_task_block(
            "## Tasks\n- [ ] One\n## Tasks\n- [ ] Two",
            "- [ ] New",
            &heading(),
        )
        .unwrap();
        assert_eq!(
            duplicate.content,
            "## Tasks\n- [ ] One\n## Tasks\n- [ ] Two\n- [ ] New"
        );
        assert_eq!(
            duplicate.warning.unwrap().code,
            CreateWarningCode::InsertionTargetAmbiguous
        );
    }

    #[test]
    fn eof_mode_returns_information_and_preserves_trailing_newline() {
        let insertion = InsertionConfig {
            mode: InsertionMode::Eof,
            target: None,
        };
        let with_newline = insert_task_block("# Note\n", "- [ ] New\n", &insertion).unwrap();
        assert_eq!(with_newline.content, "# Note\n- [ ] New\n");
        assert_eq!(
            with_newline.warning.unwrap().code,
            CreateWarningCode::AppendedAtEof
        );

        let without_newline = insert_task_block("# Note", "- [ ] New\n", &insertion).unwrap();
        assert_eq!(without_newline.content, "# Note\n- [ ] New");
    }

    #[test]
    fn preserves_crlf_and_handles_target_at_eof() {
        let result =
            insert_task_block("# Note\r\n## Tasks", "- [ ] One\n  note", &heading()).unwrap();

        assert_eq!(result.content, "# Note\r\n## Tasks\r\n- [ ] One\r\n  note");
        assert_eq!(result.line_number, 3);
    }

    #[test]
    fn matches_marker_as_exact_line() {
        let insertion = InsertionConfig {
            mode: InsertionMode::Marker,
            target: Some("<!-- octarine:tasks -->".to_string()),
        };
        let result = insert_task_block(
            "<!-- octarine:tasks -->\n<!-- octarine:tasks --> extra\n",
            "- [ ] New",
            &insertion,
        )
        .unwrap();

        assert_eq!(
            result.content,
            "<!-- octarine:tasks -->\n- [ ] New\n<!-- octarine:tasks --> extra\n"
        );
    }

    #[test]
    fn creates_parent_and_new_file_from_rendered_template() {
        let temp = tempdir().unwrap();
        let destination = temp.path().join("projects/work/project.md");

        let result = write_task_block(
            &destination,
            "# Project\n\n## Tasks\n",
            "- [ ] New",
            &heading(),
        )
        .unwrap();

        assert!(result.created_file);
        assert_eq!(result.insertion.line_number, 4);
        assert_eq!(
            fs::read_to_string(destination).unwrap(),
            "# Project\n\n## Tasks\n- [ ] New\n"
        );
    }

    #[cfg(unix)]
    #[test]
    fn existing_write_preserves_permissions_and_unrelated_content() {
        use std::os::unix::fs::PermissionsExt;

        let temp = tempdir().unwrap();
        let destination = temp.path().join("inbox.md");
        fs::write(&destination, "# Inbox\r\n\r\n## Tasks\r\nOld prose\r\n").unwrap();
        fs::set_permissions(&destination, fs::Permissions::from_mode(0o640)).unwrap();

        write_task_block(&destination, "unused", "- [ ] New", &heading()).unwrap();

        assert_eq!(
            fs::read_to_string(&destination).unwrap(),
            "# Inbox\r\n\r\n## Tasks\r\n- [ ] New\r\nOld prose\r\n"
        );
        assert_eq!(
            fs::metadata(destination).unwrap().permissions().mode() & 0o777,
            0o640
        );
    }

    #[test]
    fn retries_once_after_external_edit() {
        let temp = tempdir().unwrap();
        let destination = temp.path().join("inbox.md");
        fs::write(&destination, "## Tasks\n- [ ] Old\n").unwrap();
        let changed = Cell::new(false);

        let result =
            write_task_block_with_hook(&destination, "unused", "- [ ] New", &heading(), |_| {
                if !changed.replace(true) {
                    fs::write(&destination, "External\n## Tasks\n- [ ] Old\n").unwrap();
                }
            })
            .unwrap();

        assert!(!result.created_file);
        assert_eq!(
            fs::read_to_string(destination).unwrap(),
            "External\n## Tasks\n- [ ] New\n- [ ] Old\n"
        );
    }

    #[test]
    fn repeated_external_edit_fails_without_overwrite() {
        let temp = tempdir().unwrap();
        let destination = temp.path().join("inbox.md");
        fs::write(&destination, "## Tasks\n").unwrap();

        let result = write_task_block_with_hook(
            &destination,
            "unused",
            "- [ ] New",
            &heading(),
            |attempt| {
                fs::write(
                    &destination,
                    format!("External {}\n## Tasks\n", attempt.number),
                )
                .unwrap();
            },
        );

        assert_eq!(result, Err(TaskFileWriteError::Conflict));
        assert_eq!(
            fs::read_to_string(destination).unwrap(),
            "External 2\n## Tasks\n"
        );
    }

    #[test]
    fn new_file_collision_retries_as_existing_file() {
        let temp = tempdir().unwrap();
        let destination = temp.path().join("inbox.md");
        let collided = Cell::new(false);

        let result = write_task_block_with_hook(
            &destination,
            "# Inbox\n## Tasks\n",
            "- [ ] New",
            &heading(),
            |_| {
                if !collided.replace(true) {
                    fs::write(&destination, "External\n## Tasks\n").unwrap();
                }
            },
        )
        .unwrap();

        assert!(!result.created_file);
        assert_eq!(
            fs::read_to_string(destination).unwrap(),
            "External\n## Tasks\n- [ ] New\n"
        );
    }
}
