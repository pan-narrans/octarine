use regex::Regex;
use sha2::{Sha256, Digest};
use std::sync::OnceLock;
use crate::CHECKLIST_CHAR_CLASS;

static HEADER_RE: OnceLock<Regex> = OnceLock::new();
static PROJECT_RE: OnceLock<Regex> = OnceLock::new();
static CONTEXT_RE: OnceLock<Regex> = OnceLock::new();
static TAG_RE: OnceLock<Regex> = OnceLock::new();
static LINK_RE: OnceLock<Regex> = OnceLock::new();
static URL_RE: OnceLock<Regex> = OnceLock::new();
static S_RE: OnceLock<Regex> = OnceLock::new();
static DUE_RE: OnceLock<Regex> = OnceLock::new();
static DUR_RE: OnceLock<Regex> = OnceLock::new();
static REC_RE: OnceLock<Regex> = OnceLock::new();
static WD_RE: OnceLock<Regex> = OnceLock::new();
static P_RE: OnceLock<Regex> = OnceLock::new();
static WHITESPACE_RE: OnceLock<Regex> = OnceLock::new();
static DURATION_RE: OnceLock<Regex> = OnceLock::new();

fn get_header_re() -> &'static Regex {
    HEADER_RE.get_or_init(|| {
        let pattern = format!(r"^(\s*)([-*+])\s+\[([{}])\]\s*(.*)$", CHECKLIST_CHAR_CLASS);
        Regex::new(&pattern).unwrap()
    })
}

fn get_project_re() -> &'static Regex {
    PROJECT_RE.get_or_init(|| Regex::new(r"\+([\w\-/]+)").unwrap())
}

fn get_context_re() -> &'static Regex {
    CONTEXT_RE.get_or_init(|| Regex::new(r"@([\w\-/]+)").unwrap())
}

fn get_tag_re() -> &'static Regex {
    TAG_RE.get_or_init(|| Regex::new(r"#([\w\-/]+)").unwrap())
}

fn get_link_re() -> &'static Regex {
    LINK_RE.get_or_init(|| Regex::new(r"\[[^\]]*\]\([^)]*\)").unwrap())
}

fn get_url_re() -> &'static Regex {
    URL_RE.get_or_init(|| Regex::new(r"https?://[^\s]+").unwrap())
}

fn get_s_re() -> &'static Regex {
    S_RE.get_or_init(|| Regex::new(r"\bs:(?:\x22([^\x22]+)\x22|'([^']+)'|(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})|([^\s]+))").unwrap())
}

fn get_due_re() -> &'static Regex {
    DUE_RE.get_or_init(|| Regex::new(r"\bdue:(?:\x22([^\x22]+)\x22|'([^']+)'|([^\s]+))").unwrap())
}

fn get_dur_re() -> &'static Regex {
    DUR_RE.get_or_init(|| Regex::new(r"\bdur:(?:\x22([^\x22]+)\x22|'([^']+)'|([^\s]+))").unwrap())
}

fn get_rec_re() -> &'static Regex {
    REC_RE.get_or_init(|| Regex::new(r"\brecurring:(?:\x22([^\x22]+)\x22|'([^']+)'|([^\s]+))").unwrap())
}

fn get_wd_re() -> &'static Regex {
    WD_RE.get_or_init(|| Regex::new(r"\bwhen_done:(?:\x22([^\x22]+)\x22|'([^']+)'|([^\s]+))").unwrap())
}

fn get_p_re() -> &'static Regex {
    P_RE.get_or_init(|| Regex::new(r"\(([A-Da-d])\)").unwrap())
}

fn get_whitespace_re() -> &'static Regex {
    WHITESPACE_RE.get_or_init(|| Regex::new(r"\s+").unwrap())
}

fn get_duration_re() -> &'static Regex {
    DURATION_RE.get_or_init(|| Regex::new(r"^(?:(\d+)h)?(?:(\d+)m)?$").unwrap())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct ParsedTask {
    pub line_number: usize, // 1-based index
    pub raw_markdown: String,
    pub hash: String,
    pub status: String,      // "todo", "doing", "done", "cancelled"
    pub task_type: String,   // "task" or "event"
    pub description: String,
    pub project: Option<String>,
    pub due_date: Option<String>,
    pub s_start: Option<String>,
    pub duration_secs: Option<i32>,
    pub recurring: Option<String>,
    pub when_done: Option<String>,
    pub priority: Option<i32>,
    pub tags: Vec<String>,
    pub contexts: Vec<String>,
    pub parse_errors: Option<String>, // JSON string array of error messages, or None
    pub file_path: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct ParsedCustomView {
    pub line_number: usize, // 1-based index
    pub title: String,
    pub query_raw: String,
}

pub fn calculate_hash(file_path: &str, line_number: usize, raw_markdown: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(file_path.as_bytes());
    hasher.update(line_number.to_string().as_bytes());
    hasher.update(raw_markdown.as_bytes());
    hex::encode(hasher.finalize())
}

// Check if a date string is valid YYYY-MM-DD
fn is_valid_date(s: &str) -> bool {
    chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").is_ok()
}

// Check if a scheduled start is valid YYYY-MM-DD HH:MM
fn is_valid_datetime(s: &str) -> bool {
    chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M").is_ok() || is_valid_date(s)
}

// Parse duration string like "1h30m", "45m", "2h" into seconds
fn parse_duration(s: &str) -> Result<i32, String> {
    let re = get_duration_re();
    if let Some(caps) = re.captures(s) {
        let h = caps.get(1).map(|m| m.as_str().parse::<i32>().unwrap_or(0)).unwrap_or(0);
        let m = caps.get(2).map(|m| m.as_str().parse::<i32>().unwrap_or(0)).unwrap_or(0);
        if h == 0 && m == 0 {
            return Err(format!("Invalid duration format: {}", s));
        }
        Ok(h * 3600 + m * 60)
    } else {
        Err(format!("Invalid duration format: {}", s))
    }
}

pub fn parse_markdown_content(file_path: &str, content: &str) -> (Vec<ParsedTask>, Vec<ParsedCustomView>) {
    let lines: Vec<&str> = content.lines().collect();
    let mut tasks = Vec::new();
    let mut views = Vec::new();

    let header_re = get_header_re();
    let project_re = get_project_re();
    let context_re = get_context_re();
    let tag_re = get_tag_re();

    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];

        // 1. Parse tasks-query codeblocks
        if line.trim().starts_with("```tasks-query") {
            let start_line = i + 1;
            let mut query_lines = Vec::new();
            i += 1;
            while i < lines.len() && !lines[i].trim().starts_with("```") {
                query_lines.push(lines[i]);
                i += 1;
            }
            let query_raw = query_lines.join("\n");
            
            // Extract title from query_raw
            let mut title = format!("Custom View @ Line {}", start_line);
            for q_line in &query_lines {
                if q_line.trim().starts_with("title:") {
                    let t_val = q_line.trim()["title:".len()..].trim();
                    title = t_val.trim_matches(|c| c == '"' || c == '\'').to_string();
                    break;
                }
            }

            views.push(ParsedCustomView {
                line_number: start_line,
                title,
                query_raw,
            });
            i += 1;
            continue;
        }

        // 2. Parse Checklist Tasks/Events
        if let Some(caps) = header_re.captures(line) {
            let start_line = i + 1;
            let indent = caps.get(1).unwrap().as_str();
            let marker = caps.get(3).unwrap().as_str();
            let rest = caps.get(4).unwrap().as_str();

            // Status and Type determination
            let (status, mut task_type) = match marker {
                " " => ("todo".to_string(), "task".to_string()),
                "/" => ("doing".to_string(), "task".to_string()),
                "x" | "X" => ("done".to_string(), "task".to_string()),
                "-" => ("cancelled".to_string(), "task".to_string()),
                "<" => ("todo".to_string(), "event".to_string()),
                _ => ("todo".to_string(), "task".to_string()),
            };

            // Gather indented multiline notes
            let mut raw_markdown_lines = vec![line.to_string()];
            let mut next_i = i + 1;
            while next_i < lines.len() {
                let next_line = lines[next_i];
                if next_line.trim().is_empty() {
                    raw_markdown_lines.push(next_line.to_string());
                    next_i += 1;
                    continue;
                }

                // Check indentation
                let next_indent_len = next_line.chars().take_while(|c| c.is_whitespace()).count();
                if next_indent_len > indent.len() {
                    // Check if it starts a new task list item
                    if header_re.is_match(next_line) {
                        break; // It's a sub-task, handle separately
                    }
                    raw_markdown_lines.push(next_line.to_string());
                    next_i += 1;
                } else {
                    break;
                }
            }

            // Clean trailing blank lines from the gathered block
            while raw_markdown_lines.len() > 1 && raw_markdown_lines.last().unwrap().trim().is_empty() {
                raw_markdown_lines.pop();
            }

            let raw_markdown = raw_markdown_lines.join("\n");
            let hash = calculate_hash(file_path, start_line, &raw_markdown);

            // Now parse metadata elements in the first line
            // 1. Strip standard closed markdown links completely
            let link_re = get_link_re();
            let mut metadata_text = link_re.replace_all(rest, "").to_string();

            // 2. Strip any raw URLs starting with http/https up to whitespace (handles unclosed links!)
            let url_re = get_url_re();
            metadata_text = url_re.replace_all(&metadata_text, "").to_string();

            let mut projects = Vec::new();
            for p_cap in project_re.captures_iter(&metadata_text) {
                projects.push(p_cap.get(1).unwrap().as_str().to_string());
            }
            let project = projects.first().cloned();

            let mut contexts = Vec::new();
            for c_cap in context_re.captures_iter(&metadata_text) {
                contexts.push(c_cap.get(1).unwrap().as_str().to_string());
            }

            let mut tags = Vec::new();
            for t_cap in tag_re.captures_iter(&metadata_text) {
                tags.push(t_cap.get(1).unwrap().as_str().to_string());
            }

            let mut clean_description = rest.to_string();
            let mut errors = Vec::new();

            // 1. Extract and strip s (scheduled start)
            let s_re = get_s_re();
            let s_start = s_re.captures(&metadata_text).map(|caps| {
                let val = if let Some(m) = caps.get(1) {
                    m.as_str().to_string()
                } else if let Some(m) = caps.get(2) {
                    m.as_str().to_string()
                } else if let Some(m) = caps.get(3) {
                    m.as_str().to_string()
                } else {
                    caps.get(4).unwrap().as_str().to_string()
                };
                if let Some(m) = caps.get(0) {
                    clean_description = clean_description.replace(m.as_str(), "");
                }
                
                if !is_valid_datetime(&val) {
                    errors.push(format!("Invalid scheduled start format: '{}' (expected YYYY-MM-DD HH:MM)", val));
                }
                val
            });

            if s_start.is_some() {
                task_type = "event".to_string();
            }

            // 2. Extract and strip due date
            let due_re = get_due_re();
            let due_date = due_re.captures(&metadata_text).map(|caps| {
                let val = if let Some(m) = caps.get(1) {
                    m.as_str().to_string()
                } else if let Some(m) = caps.get(2) {
                    m.as_str().to_string()
                } else {
                    caps.get(3).unwrap().as_str().to_string()
                };
                if let Some(m) = caps.get(0) {
                    clean_description = clean_description.replace(m.as_str(), "");
                }
                
                if !is_valid_date(&val) {
                    errors.push(format!("Invalid due date format: '{}' (expected YYYY-MM-DD)", val));
                }
                val
            });

            // 3. Extract and strip duration
            let dur_re = get_dur_re();
            let duration_secs = dur_re.captures(&metadata_text).and_then(|caps| {
                let val = if let Some(m) = caps.get(1) {
                    m.as_str().to_string()
                } else if let Some(m) = caps.get(2) {
                    m.as_str().to_string()
                } else {
                    caps.get(3).unwrap().as_str().to_string()
                };
                if let Some(m) = caps.get(0) {
                    clean_description = clean_description.replace(m.as_str(), "");
                }
                
                match parse_duration(&val) {
                    Ok(secs) => Some(secs),
                    Err(err) => {
                        errors.push(err);
                        None
                    }
                }
            });

            // 4. Extract and strip recurring
            let rec_re = get_rec_re();
            let recurring = rec_re.captures(&metadata_text).map(|caps| {
                let val = if let Some(m) = caps.get(1) {
                    m.as_str().to_string()
                } else if let Some(m) = caps.get(2) {
                    m.as_str().to_string()
                } else {
                    caps.get(3).unwrap().as_str().to_string()
                };
                if let Some(m) = caps.get(0) {
                    clean_description = clean_description.replace(m.as_str(), "");
                }
                val
            });

            // 5. Extract and strip when_done
            let wd_re = get_wd_re();
            let when_done = wd_re.captures(&metadata_text).map(|caps| {
                let val = if let Some(m) = caps.get(1) {
                    m.as_str().to_string()
                } else if let Some(m) = caps.get(2) {
                    m.as_str().to_string()
                } else {
                    caps.get(3).unwrap().as_str().to_string()
                };
                if let Some(m) = caps.get(0) {
                    clean_description = clean_description.replace(m.as_str(), "");
                }
                
                if val != "delete" && val != "archive" {
                    errors.push(format!("Invalid when_done action: '{}' (expected 'delete' or 'archive')", val));
                }
                val
            });

            // 6. Extract and strip priority
            let p_re = get_p_re();
            let priority = p_re.captures(&metadata_text).and_then(|caps| {
                let val = caps.get(1).unwrap().as_str().to_uppercase();
                if let Some(m) = caps.get(0) {
                    clean_description = clean_description.replace(m.as_str(), "");
                }
                
                match val.as_str() {
                    "A" => Some(1),
                    "B" => Some(2),
                    "C" => Some(3),
                    "D" => Some(4),
                    _ => {
                        errors.push(format!("Invalid priority format: '{}' (expected A, B, C, or D)", val));
                        None
                    }
                }
            });

            // Strip project, context, tag markers from the description
            for p in &projects {
                let pattern = format!(r"\+{}", regex::escape(p));
                if let Ok(re) = Regex::new(&pattern) {
                    clean_description = re.replace_all(&clean_description, "").into_owned();
                }
            }
            for c in &contexts {
                let pattern = format!(r"@{}", regex::escape(c));
                if let Ok(re) = Regex::new(&pattern) {
                    clean_description = re.replace_all(&clean_description, "").into_owned();
                }
            }
            for t in &tags {
                let pattern = format!(r"#{}", regex::escape(t));
                if let Ok(re) = Regex::new(&pattern) {
                    clean_description = re.replace_all(&clean_description, "").into_owned();
                }
            }

            // Cleanup whitespace in description
            let clean_description = clean_description.trim()
                .replace("  ", " ");
            let clean_description = get_whitespace_re().replace_all(&clean_description, " ").to_string();

            let parse_errors = if errors.is_empty() {
                None
            } else {
                Some(serde_json::to_string(&errors).unwrap_or_default())
            };

            tasks.push(ParsedTask {
                line_number: start_line,
                raw_markdown,
                hash,
                status,
                task_type,
                description: clean_description,
                project,
                due_date,
                s_start,
                duration_secs,
                recurring,
                when_done,
                priority,
                tags,
                contexts,
                parse_errors,
                file_path: Some(file_path.to_string()),
            });

            // Advance the cursor to consume processed note lines
            i = next_i;
            continue;
        }

        i += 1;
    }

    (tasks, views)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_task() {
        let content = "- [ ] Call client @phone +work/marketing due:2026-07-25 #urgent";
        let (tasks, _) = parse_markdown_content("test.md", content);
        assert_eq!(tasks.len(), 1);
        let task = &tasks[0];
        assert_eq!(task.status, "todo");
        assert_eq!(task.task_type, "task");
        assert_eq!(task.project.as_deref(), Some("work/marketing"));
        assert_eq!(task.due_date.as_deref(), Some("2026-07-25"));
        assert!(task.contexts.contains(&"phone".to_string()));
        assert!(task.tags.contains(&"urgent".to_string()));
        assert_eq!(task.description, "Call client");
        assert_eq!(task.parse_errors, None);
    }

    #[test]
    fn test_parse_event_and_duration() {
        let content = "- [<] Strategy meeting s:2026-07-22 14:00 dur:1h30m +work";
        let (tasks, _) = parse_markdown_content("test.md", content);
        assert_eq!(tasks.len(), 1);
        let task = &tasks[0];
        assert_eq!(task.status, "todo");
        assert_eq!(task.task_type, "event");
        assert_eq!(task.project.as_deref(), Some("work"));
        assert_eq!(task.s_start.as_deref(), Some("2026-07-22 14:00"));
        assert_eq!(task.duration_secs, Some(5400));
        assert_eq!(task.description, "Strategy meeting");
    }

    #[test]
    fn test_parse_multiline_note() {
        let content = r#"- [/] Write parser +work
    This is an indented note paragraph.
    It has multiple lines.
    - And a sub-bullet that isn't a task.
- [ ] Another task"#;
        let (tasks, _) = parse_markdown_content("test.md", content);
        assert_eq!(tasks.len(), 2);
        
        let task1 = &tasks[0];
        assert_eq!(task1.status, "doing");
        assert_eq!(task1.description, "Write parser");
        assert!(task1.raw_markdown.contains("This is an indented note paragraph."));
        assert!(task1.raw_markdown.contains("- And a sub-bullet"));
        
        let task2 = &tasks[1];
        assert_eq!(task2.status, "todo");
        assert_eq!(task2.description, "Another task");
    }

    #[test]
    fn test_parse_errors() {
        let content = "- [ ] Broken metadata due:invalid-date dur:10x when_done:unsupported";
        let (tasks, _) = parse_markdown_content("test.md", content);
        assert_eq!(tasks.len(), 1);
        let task = &tasks[0];
        assert!(task.parse_errors.is_some());
        let errors: Vec<String> = serde_json::from_str(task.parse_errors.as_ref().unwrap()).unwrap();
        assert_eq!(errors.len(), 3);
        assert!(errors[0].contains("Invalid due date"));
        assert!(errors[1].contains("Invalid duration format"));
        assert!(errors[2].contains("Invalid when_done action"));
    }

    #[test]
    fn test_parse_custom_view() {
        let content = r#"# Notes
Some notes here.

```tasks-query
title: "Today's Errands"
filter: "due = today AND @errands"
group_by: "none"
```
"#;
        let (_, views) = parse_markdown_content("test.md", content);
        assert_eq!(views.len(), 1);
        assert_eq!(views[0].title, "Today's Errands");
        assert!(views[0].query_raw.contains("filter: \"due = today AND @errands\""));
    }

    #[test]
    fn test_ignore_metadata_in_links() {
        let content = "- [ ] Visit [our +work page with @phone details and #urgent tag](https://example.com/#tag) s:2026-07-23 due:2026-07-23";
        let (tasks, _) = parse_markdown_content("test.md", content);
        assert_eq!(tasks.len(), 1);
        let task = &tasks[0];
        
        // Projects, contexts, and tags inside links must be completely ignored
        assert_eq!(task.project, None);
        assert_eq!(task.contexts.len(), 0);
        assert_eq!(task.tags.len(), 0);
        
        // Metadata outside links must be parsed correctly
        assert_eq!(task.s_start.as_deref(), Some("2026-07-23"));
        assert_eq!(task.due_date.as_deref(), Some("2026-07-23"));
        
        // The markdown link itself should remain fully preserved in the final description!
        assert_eq!(task.description, "Visit [our +work page with @phone details and #urgent tag](https://example.com/#tag)");
    }

    #[test]
    fn test_ignore_metadata_in_unclosed_links() {
        let content = "- [x] Actualizar la página de confluence de [Jerarquía de Productos y Categorías](https://example.atlassian.net/wiki/spaces/TEST/pages/12345/WIP+-+Jerarqu+a+de+Productos+y+Categor+as)";
        let (tasks, _) = parse_markdown_content("test.md", content);
        assert_eq!(tasks.len(), 1);
        let task = &tasks[0];

        // The malformed/closed link must not leak any projects (like "+-")
        assert_eq!(task.project, None);
        assert_eq!(task.contexts.len(), 0);
        assert_eq!(task.tags.len(), 0);

        // The raw string remains fully preserved in the description
        assert_eq!(task.description, "Actualizar la página de confluence de [Jerarquía de Productos y Categorías](https://example.atlassian.net/wiki/spaces/TEST/pages/12345/WIP+-+Jerarqu+a+de+Productos+y+Categor+as)");
    }

    #[test]
    fn test_parse_accented_unicode_metadata() {
        let content = "- [ ] Análisis Portugal +work/eglc/estimación @eglc/gestión #urgente/producción";
        let (tasks, _) = parse_markdown_content("test.md", content);
        assert_eq!(tasks.len(), 1);
        let task = &tasks[0];

        // Ensure full accented unicode values are extracted cleanly without cutoffs
        assert_eq!(task.project.as_deref(), Some("work/eglc/estimación"));
        assert!(task.contexts.contains(&"eglc/gestión".to_string()));
        assert!(task.tags.contains(&"urgente/producción".to_string()));
    }

    #[test]
    fn test_scheduled_is_always_an_event() {
        // A standard task with s_start should be classified as an event
        let content = "- [ ] Call client s:2026-07-28";
        let (tasks, _) = parse_markdown_content("test.md", content);
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].task_type, "event");

        // A completed task with s_start should be classified as an event
        let content_completed = "- [x] Call client s:2026-07-28";
        let (tasks_completed, _) = parse_markdown_content("test.md", content_completed);
        assert_eq!(tasks_completed.len(), 1);
        assert_eq!(tasks_completed[0].task_type, "event");
    }

    #[test]
    fn test_parse_priority() {
        let content = r#"- [ ] (A) Call client due:2026-07-25 @phone +work
- [/] (b) Write design document
- [ ] Regular task with no priority
    - [ ] (C) Sub task with priority"#;
        let (tasks, _) = parse_markdown_content("test.md", content);
        assert_eq!(tasks.len(), 4);

        assert_eq!(tasks[0].priority, Some(1));
        assert_eq!(tasks[0].description, "Call client");

        assert_eq!(tasks[1].priority, Some(2));
        assert_eq!(tasks[1].description, "Write design document");

        assert_eq!(tasks[2].priority, None);
        assert_eq!(tasks[2].description, "Regular task with no priority");

        assert_eq!(tasks[3].priority, Some(3));
        assert_eq!(tasks[3].description, "Sub task with priority");
    }
}
