use crate::parser::parse_markdown_content;
use crate::project::ProjectPath;
use chrono::NaiveDate;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::OnceLock;

static COMPACT_PROJECT_RE: OnceLock<Regex> = OnceLock::new();
static COMPACT_CONTEXT_RE: OnceLock<Regex> = OnceLock::new();
static COMPACT_TAG_RE: OnceLock<Regex> = OnceLock::new();
static LEADING_CHECKBOX_RE: OnceLock<Regex> = OnceLock::new();

fn compact_project_re() -> &'static Regex {
    COMPACT_PROJECT_RE.get_or_init(|| Regex::new(r"(?:^|\s)\+([^\s]+)").unwrap())
}

fn compact_context_re() -> &'static Regex {
    COMPACT_CONTEXT_RE.get_or_init(|| Regex::new(r"(?:^|\s)@([^\s]+)").unwrap())
}

fn compact_tag_re() -> &'static Regex {
    COMPACT_TAG_RE.get_or_init(|| Regex::new(r"(?:^|\s)#([^\s]+)").unwrap())
}

fn leading_checkbox_re() -> &'static Regex {
    LEADING_CHECKBOX_RE.get_or_init(|| Regex::new(r"^[-*+]\s+\[[ xX/<>-]\](?:\s|$)").unwrap())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Todo,
    Doing,
    Deferred,
    Done,
    Cancelled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
pub enum TaskPriority {
    A,
    B,
    C,
    D,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "snake_case")]
pub enum TaskType {
    Task,
    Event,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct TaskDraft {
    pub title: String,
    pub notes: String,
    pub status: TaskStatus,
    pub priority: Option<TaskPriority>,
    pub due_date: Option<String>,
    pub duration: Option<String>,
    pub recurrence: Option<String>,
    pub project: Option<String>,
    pub contexts: Vec<String>,
    pub tags: Vec<String>,
    pub subtasks: Vec<TaskDraft>,
    pub raw_markdown: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct CaptureContext {
    pub project: Option<String>,
    pub contexts: Vec<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct TaskDraftPreview {
    pub draft: TaskDraft,
    pub task_type: TaskType,
    pub destination_path: String,
    pub inherited_project: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "snake_case")]
pub enum TaskDraftErrorCode {
    EmptyTitle,
    MultilineCompactInput,
    LeadingChecklistMarker,
    InvalidMetadata,
    MultipleProjects,
    ConflictingChildProject,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
pub struct TaskDraftError {
    pub code: TaskDraftErrorCode,
    pub message: String,
}

impl TaskDraftError {
    fn new(code: TaskDraftErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

pub fn parse_compact_task(
    input: &str,
    capture_context: &CaptureContext,
) -> Result<(TaskDraft, TaskType), TaskDraftError> {
    if input.contains(['\r', '\n']) {
        return Err(TaskDraftError::new(
            TaskDraftErrorCode::MultilineCompactInput,
            "Quick capture accepts one line. Expand task to add notes or subtasks.",
        ));
    }
    let input = input.trim();
    if leading_checkbox_re().is_match(input) {
        return Err(TaskDraftError::new(
            TaskDraftErrorCode::LeadingChecklistMarker,
            "Quick capture adds checklist syntax automatically.",
        ));
    }

    let project_tokens = token_values(compact_project_re(), input);
    if project_tokens.len() > 1 {
        return Err(TaskDraftError::new(
            TaskDraftErrorCode::MultipleProjects,
            "Task can contain one project.",
        ));
    }
    let explicit_project = project_tokens
        .first()
        .map(|value| normalize_name(value, "project"))
        .transpose()?;
    validate_token_values(compact_context_re(), input, "context")?;
    validate_token_values(compact_tag_re(), input, "tag")?;

    let raw_markdown = format!("- [ ] {input}");
    let (tasks, _) = parse_markdown_content("<task-draft>", &raw_markdown);
    let parsed = tasks.first().ok_or_else(|| {
        TaskDraftError::new(
            TaskDraftErrorCode::EmptyTitle,
            "Task title cannot be empty.",
        )
    })?;
    if let Some(errors) = &parsed.parse_errors {
        return Err(TaskDraftError::new(
            TaskDraftErrorCode::InvalidMetadata,
            errors.clone(),
        ));
    }
    if parsed.description.trim().is_empty() {
        return Err(TaskDraftError::new(
            TaskDraftErrorCode::EmptyTitle,
            "Task title cannot be empty.",
        ));
    }

    let inherited_project = capture_context
        .project
        .as_deref()
        .map(|value| normalize_name(value, "inherited project"))
        .transpose()?;
    let project = explicit_project.or(inherited_project);
    let contexts = merge_values(&capture_context.contexts, &parsed.contexts);
    let tags = merge_values(&capture_context.tags, &parsed.tags);
    validate_names(&contexts, "context")?;
    validate_names(&tags, "tag")?;

    let task_type = if parsed.task_type == "event" {
        TaskType::Event
    } else {
        TaskType::Task
    };
    let draft = TaskDraft {
        title: parsed.description.clone(),
        notes: String::new(),
        status: TaskStatus::Todo,
        priority: parsed.priority.and_then(priority_from_number),
        due_date: parsed.due_date.clone(),
        duration: parsed.duration_secs.map(format_duration),
        recurrence: parsed.recurring.clone(),
        project,
        contexts,
        tags,
        subtasks: Vec::new(),
        raw_markdown,
    };
    Ok((draft, task_type))
}

pub fn apply_inheritance(
    draft: &mut TaskDraft,
    capture_context: &CaptureContext,
) -> Result<(), TaskDraftError> {
    let inherited_project = capture_context
        .project
        .as_deref()
        .map(|value| normalize_name(value, "inherited project"))
        .transpose()?;
    draft.project = draft
        .project
        .as_deref()
        .map(|value| normalize_name(value, "project"))
        .transpose()?
        .or(inherited_project);
    draft.contexts = merge_values(&capture_context.contexts, &draft.contexts);
    draft.tags = merge_values(&capture_context.tags, &draft.tags);
    validate_names(&draft.contexts, "context")?;
    validate_names(&draft.tags, "tag")?;
    inherit_child_projects(&mut draft.subtasks, draft.project.as_deref())
}

pub fn serialize_task_draft(draft: &TaskDraft) -> Result<(String, TaskType), TaskDraftError> {
    validate_draft(draft, None)?;
    let scheduled_start = parse_markdown_content("<task-draft>", &draft.raw_markdown)
        .0
        .first()
        .and_then(|task| task.s_start.clone());
    let task_type = if scheduled_start.is_some() {
        TaskType::Event
    } else {
        TaskType::Task
    };
    Ok((
        serialize_draft_block(draft, 0, scheduled_start.as_deref())?,
        task_type,
    ))
}

fn validate_draft(draft: &TaskDraft, parent_project: Option<&str>) -> Result<(), TaskDraftError> {
    if draft.title.trim().is_empty() {
        return Err(TaskDraftError::new(
            TaskDraftErrorCode::EmptyTitle,
            "Task title cannot be empty.",
        ));
    }
    if draft.title.contains(['\r', '\n']) {
        return Err(TaskDraftError::new(
            TaskDraftErrorCode::InvalidMetadata,
            "Task title must be one line.",
        ));
    }
    if let Some(project) = &draft.project {
        normalize_name(project, "project")?;
        if parent_project.is_some_and(|parent| !same_project(project, parent)) {
            return Err(TaskDraftError::new(
                TaskDraftErrorCode::ConflictingChildProject,
                "Subtask project must match parent project.",
            ));
        }
    }
    if parent_project.is_some() && draft.project.is_none() {
        return Err(TaskDraftError::new(
            TaskDraftErrorCode::ConflictingChildProject,
            "Subtask must inherit parent project.",
        ));
    }
    validate_names(&draft.contexts, "context")?;
    validate_names(&draft.tags, "tag")?;
    if draft
        .due_date
        .as_deref()
        .is_some_and(|date| NaiveDate::parse_from_str(date, "%Y-%m-%d").is_err())
    {
        return Err(TaskDraftError::new(
            TaskDraftErrorCode::InvalidMetadata,
            "Due date must use YYYY-MM-DD.",
        ));
    }
    if draft
        .duration
        .as_deref()
        .is_some_and(|duration| parse_duration_text(duration).is_none())
    {
        return Err(TaskDraftError::new(
            TaskDraftErrorCode::InvalidMetadata,
            "Duration must use values such as 2h, 30m, or 1h30m.",
        ));
    }
    if draft
        .recurrence
        .as_deref()
        .is_some_and(|value| value.trim().is_empty() || value.contains(['\r', '\n', '\'', '"']))
    {
        return Err(TaskDraftError::new(
            TaskDraftErrorCode::InvalidMetadata,
            "Recurrence contains unsupported characters.",
        ));
    }

    let effective_project = draft.project.as_deref().or(parent_project);
    for child in &draft.subtasks {
        if effective_project.is_none() && child.project.is_some() {
            return Err(TaskDraftError::new(
                TaskDraftErrorCode::ConflictingChildProject,
                "Subtask project must match parent project.",
            ));
        }
        validate_draft(child, effective_project)?;
    }
    Ok(())
}

fn serialize_draft_block(
    draft: &TaskDraft,
    depth: usize,
    scheduled_start: Option<&str>,
) -> Result<String, TaskDraftError> {
    let indent = "    ".repeat(depth);
    let marker = match draft.status {
        TaskStatus::Todo => " ",
        TaskStatus::Doing => "/",
        TaskStatus::Deferred => ">",
        TaskStatus::Done => "x",
        TaskStatus::Cancelled => "-",
    };
    let mut line = format!("{indent}- [{marker}] {}", draft.title.trim());
    if depth == 0 {
        if let Some(project) = &draft.project {
            line.push_str(" +");
            line.push_str(ProjectPath::parse(project).unwrap().display());
        }
    }
    for context in deduplicate(&draft.contexts) {
        line.push_str(" @");
        line.push_str(context);
    }
    for tag in deduplicate(&draft.tags) {
        line.push_str(" #");
        line.push_str(tag);
    }
    if let Some(priority) = draft.priority {
        line.push_str(match priority {
            TaskPriority::A => " (A)",
            TaskPriority::B => " (B)",
            TaskPriority::C => " (C)",
            TaskPriority::D => " (D)",
        });
    }
    if let Some(date) = &draft.due_date {
        line.push_str(" due:");
        line.push_str(date);
    }
    if let Some(duration) = &draft.duration {
        line.push_str(" dur:");
        line.push_str(duration);
    }
    if let Some(recurrence) = &draft.recurrence {
        line.push_str(" recurring:");
        line.push_str(&quote_metadata_value(recurrence));
    }
    if let Some(scheduled_start) = scheduled_start {
        line.push_str(" s:");
        line.push_str(&quote_metadata_value(scheduled_start));
    }

    let mut lines = vec![line];
    for note_line in draft.notes.lines() {
        lines.push(format!("{indent}    {note_line}"));
    }
    for child in &draft.subtasks {
        lines.push(serialize_draft_block(child, depth + 1, None)?);
    }
    Ok(lines.join("\n"))
}

fn deduplicate(values: &[String]) -> Vec<&str> {
    let mut seen = HashSet::new();
    values
        .iter()
        .filter(|value| seen.insert(value.as_str()))
        .map(String::as_str)
        .collect()
}

fn quote_metadata_value(value: &str) -> String {
    if value.chars().any(char::is_whitespace) {
        format!("\"{value}\"")
    } else {
        value.to_string()
    }
}

fn parse_duration_text(value: &str) -> Option<i32> {
    let captures = Regex::new(r"^(?:(\d+)h)?(?:(\d+)m)?$")
        .unwrap()
        .captures(value)?;
    let hours = captures
        .get(1)
        .and_then(|value| value.as_str().parse::<i32>().ok())
        .unwrap_or_default();
    let minutes = captures
        .get(2)
        .and_then(|value| value.as_str().parse::<i32>().ok())
        .unwrap_or_default();
    (hours > 0 || minutes > 0).then_some(hours * 3600 + minutes * 60)
}

fn inherit_child_projects(
    children: &mut [TaskDraft],
    parent_project: Option<&str>,
) -> Result<(), TaskDraftError> {
    for child in children {
        let child_project = child
            .project
            .as_deref()
            .map(|value| normalize_name(value, "child project"))
            .transpose()?;
        if child_project.as_deref().is_some_and(|project| {
            parent_project.is_none_or(|parent| !same_project(project, parent))
        }) {
            return Err(TaskDraftError::new(
                TaskDraftErrorCode::ConflictingChildProject,
                "Subtask project must match parent project.",
            ));
        }
        child.project = parent_project.map(str::to_string);
        inherit_child_projects(&mut child.subtasks, parent_project)?;
    }
    Ok(())
}

fn same_project(left: &str, right: &str) -> bool {
    match (ProjectPath::parse(left), ProjectPath::parse(right)) {
        (Ok(left), Ok(right)) => left.identity() == right.identity(),
        _ => false,
    }
}

fn token_values<'a>(regex: &Regex, input: &'a str) -> Vec<&'a str> {
    regex
        .captures_iter(input)
        .filter_map(|captures| captures.get(1).map(|value| value.as_str()))
        .collect()
}

fn validate_token_values(regex: &Regex, input: &str, label: &str) -> Result<(), TaskDraftError> {
    validate_names(&token_values(regex, input), label)
}

fn validate_names<T: AsRef<str>>(values: &[T], label: &str) -> Result<(), TaskDraftError> {
    for value in values {
        normalize_name(value.as_ref(), label)?;
    }
    Ok(())
}

fn normalize_name(value: &str, label: &str) -> Result<String, TaskDraftError> {
    ProjectPath::parse(value)
        .map(|value| value.display().to_string())
        .map_err(|error| {
            TaskDraftError::new(
                TaskDraftErrorCode::InvalidMetadata,
                format!("Invalid {label}: {error}"),
            )
        })
}

fn merge_values(inherited: &[String], explicit: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();
    inherited
        .iter()
        .chain(explicit)
        .filter(|value| seen.insert((*value).clone()))
        .cloned()
        .collect()
}

fn priority_from_number(value: i32) -> Option<TaskPriority> {
    match value {
        1 => Some(TaskPriority::A),
        2 => Some(TaskPriority::B),
        3 => Some(TaskPriority::C),
        4 => Some(TaskPriority::D),
        _ => None,
    }
}

fn format_duration(seconds: i32) -> String {
    let hours = seconds / 3600;
    let minutes = (seconds % 3600) / 60;
    match (hours, minutes) {
        (0, minutes) => format!("{minutes}m"),
        (hours, 0) => format!("{hours}h"),
        (hours, minutes) => format!("{hours}h{minutes}m"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn blank_draft(title: &str, project: Option<&str>) -> TaskDraft {
        TaskDraft {
            title: title.to_string(),
            notes: String::new(),
            status: TaskStatus::Todo,
            priority: None,
            due_date: None,
            duration: None,
            recurrence: None,
            project: project.map(str::to_string),
            contexts: Vec::new(),
            tags: Vec::new(),
            subtasks: Vec::new(),
            raw_markdown: title.to_string(),
        }
    }

    #[test]
    fn parses_canonical_metadata_and_classifies_scheduled_task_as_event() {
        let context = CaptureContext {
            project: Some("inherited/project".to_string()),
            contexts: vec!["home".to_string()],
            tags: vec!["next".to_string()],
        };

        let (draft, task_type) = parse_compact_task(
            "Call client +Work/estimacio\u{301}n @phone @home #urgent #next (A) due:2026-09-08 dur:1h30m recurring:weekly s:2026-09-08",
            &context,
        )
        .unwrap();

        assert_eq!(draft.title, "Call client");
        assert_eq!(draft.project.as_deref(), Some("Work/estimación"));
        assert_eq!(draft.contexts, vec!["home", "phone"]);
        assert_eq!(draft.tags, vec!["next", "urgent"]);
        assert_eq!(draft.priority, Some(TaskPriority::A));
        assert_eq!(draft.due_date.as_deref(), Some("2026-09-08"));
        assert_eq!(draft.duration.as_deref(), Some("1h30m"));
        assert_eq!(draft.recurrence.as_deref(), Some("weekly"));
        assert_eq!(task_type, TaskType::Event);
    }

    #[test]
    fn rejects_invalid_compact_input() {
        let context = CaptureContext::default();
        for (input, code) in [
            ("", TaskDraftErrorCode::EmptyTitle),
            ("one\ntwo", TaskDraftErrorCode::MultilineCompactInput),
            ("- [ ] existing", TaskDraftErrorCode::LeadingChecklistMarker),
            ("task +one +two", TaskDraftErrorCode::MultipleProjects),
            ("task due:nope", TaskDraftErrorCode::InvalidMetadata),
            ("task +bad.name", TaskDraftErrorCode::InvalidMetadata),
        ] {
            assert_eq!(parse_compact_task(input, &context).unwrap_err().code, code);
        }
    }

    #[test]
    fn explicit_project_replaces_inherited_project() {
        let context = CaptureContext {
            project: Some("work/old".to_string()),
            ..CaptureContext::default()
        };

        let (draft, _) = parse_compact_task("Task +work/new", &context).unwrap();

        assert_eq!(draft.project.as_deref(), Some("work/new"));
    }

    #[test]
    fn subtasks_inherit_project_and_reject_conflict() {
        let mut draft = blank_draft("Parent", Some("work/project"));
        let mut child = blank_draft("Child", None);
        child.subtasks.push(blank_draft("Grandchild", None));
        draft.subtasks.push(child);

        apply_inheritance(&mut draft, &CaptureContext::default()).unwrap();
        assert_eq!(draft.subtasks[0].project.as_deref(), Some("work/project"));
        assert_eq!(
            draft.subtasks[0].subtasks[0].project.as_deref(),
            Some("work/project")
        );

        draft.subtasks[0].project = Some("personal".to_string());
        assert_eq!(
            apply_inheritance(&mut draft, &CaptureContext::default())
                .unwrap_err()
                .code,
            TaskDraftErrorCode::ConflictingChildProject
        );
    }

    #[test]
    fn serializes_canonical_root_notes_and_subtasks() {
        let mut draft = blank_draft("Parent", Some("Work/project"));
        draft.status = TaskStatus::Doing;
        draft.notes = "First note\nSecond note".to_string();
        draft.contexts = vec!["home".to_string(), "home".to_string()];
        draft.tags = vec!["next".to_string()];
        draft.priority = Some(TaskPriority::B);
        draft.due_date = Some("2026-09-08".to_string());
        draft.duration = Some("1h30m".to_string());
        draft.recurrence = Some("every week".to_string());
        draft.raw_markdown = "- [ ] Parent s:\"2026-09-08 14:30\"".to_string();
        let mut child = blank_draft("Child", Some("work/PROJECT"));
        child.tags.push("small".to_string());
        draft.subtasks.push(child);

        let (markdown, task_type) = serialize_task_draft(&draft).unwrap();

        assert_eq!(task_type, TaskType::Event);
        assert_eq!(
            markdown,
            "- [/] Parent +Work/project @home #next (B) due:2026-09-08 dur:1h30m recurring:\"every week\" s:\"2026-09-08 14:30\"\n    First note\n    Second note\n    - [ ] Child #small"
        );
    }

    #[test]
    fn serializer_rejects_invalid_fields_and_conflicting_child() {
        let mut draft = blank_draft("Parent", Some("work"));
        draft.duration = Some("forever".to_string());
        assert_eq!(
            serialize_task_draft(&draft).unwrap_err().code,
            TaskDraftErrorCode::InvalidMetadata
        );

        draft.duration = None;
        draft.subtasks.push(blank_draft("Child", Some("personal")));
        assert_eq!(
            serialize_task_draft(&draft).unwrap_err().code,
            TaskDraftErrorCode::ConflictingChildProject
        );
    }
}
