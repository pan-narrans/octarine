use crate::project::ProjectPath;
use chrono::{DateTime, FixedOffset};
use std::fmt;

const PROJECT_PLACEHOLDER: &str = "project";
const PROJECT_NAME_PLACEHOLDER: &str = "project_name";
const DATE_PLACEHOLDER: &str = "date";
const DATETIME_PLACEHOLDER: &str = "datetime";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TemplateError {
    Malformed,
    UnknownPlaceholder(String),
    ProjectPlaceholderUnavailable(String),
}

impl fmt::Display for TemplateError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Malformed => write!(formatter, "Template contains malformed placeholder syntax."),
            Self::UnknownPlaceholder(name) => {
                write!(
                    formatter,
                    "Template contains unknown placeholder '{{{{{name}}}}}'."
                )
            }
            Self::ProjectPlaceholderUnavailable(name) => write!(
                formatter,
                "Placeholder '{{{{{name}}}}}' requires a project destination."
            ),
        }
    }
}

impl std::error::Error for TemplateError {}

#[derive(Debug, Clone, Copy)]
pub struct TemplateContext<'a> {
    pub project: Option<&'a ProjectPath>,
    pub submitted_at: DateTime<FixedOffset>,
}

pub fn validate_template(template: &str, project_available: bool) -> Result<(), TemplateError> {
    for placeholder in placeholders(template)? {
        if matches!(placeholder, PROJECT_PLACEHOLDER | PROJECT_NAME_PLACEHOLDER)
            && !project_available
        {
            return Err(TemplateError::ProjectPlaceholderUnavailable(
                placeholder.to_string(),
            ));
        }
    }
    Ok(())
}

pub fn render_template(
    template: &str,
    context: TemplateContext<'_>,
) -> Result<String, TemplateError> {
    let parsed = placeholders(template)?;
    let mut rendered = String::with_capacity(template.len());
    let mut cursor = 0;

    for placeholder in parsed {
        let token = format!("{{{{{placeholder}}}}}");
        let relative_start = template[cursor..]
            .find(&token)
            .expect("parsed placeholder token must exist");
        let start = cursor + relative_start;
        rendered.push_str(&template[cursor..start]);
        rendered.push_str(&replacement(placeholder, context)?);
        cursor = start + token.len();
    }

    rendered.push_str(&template[cursor..]);
    Ok(rendered)
}

fn replacement(placeholder: &str, context: TemplateContext<'_>) -> Result<String, TemplateError> {
    match placeholder {
        PROJECT_PLACEHOLDER => context
            .project
            .map(|project| project.display().to_string())
            .ok_or_else(|| TemplateError::ProjectPlaceholderUnavailable(placeholder.to_string())),
        PROJECT_NAME_PLACEHOLDER => context
            .project
            .map(|project| project.name().to_string())
            .ok_or_else(|| TemplateError::ProjectPlaceholderUnavailable(placeholder.to_string())),
        DATE_PLACEHOLDER => Ok(context.submitted_at.format("%Y-%m-%d").to_string()),
        DATETIME_PLACEHOLDER => Ok(context.submitted_at.to_rfc3339()),
        _ => Err(TemplateError::UnknownPlaceholder(placeholder.to_string())),
    }
}

fn placeholders(template: &str) -> Result<Vec<&str>, TemplateError> {
    let mut parsed = Vec::new();
    let mut cursor = 0;

    while cursor < template.len() {
        let remaining = &template[cursor..];
        let open = remaining.find("{{");
        let close = remaining.find("}}");

        match (open, close) {
            (None, None) => break,
            (None, Some(_)) => return Err(TemplateError::Malformed),
            (Some(open), Some(close)) if close < open => {
                return Err(TemplateError::Malformed);
            }
            (Some(open), _) => {
                let name_start = cursor + open + 2;
                let tail = &template[name_start..];
                let close = tail.find("}}").ok_or(TemplateError::Malformed)?;
                let placeholder = &tail[..close];
                if placeholder.is_empty() || placeholder.contains("{{") {
                    return Err(TemplateError::Malformed);
                }
                if !matches!(
                    placeholder,
                    PROJECT_PLACEHOLDER
                        | PROJECT_NAME_PLACEHOLDER
                        | DATE_PLACEHOLDER
                        | DATETIME_PLACEHOLDER
                ) {
                    return Err(TemplateError::UnknownPlaceholder(placeholder.to_string()));
                }
                parsed.push(placeholder);
                cursor = name_start + close + 2;
            }
        }
    }

    Ok(parsed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn submitted_at() -> DateTime<FixedOffset> {
        FixedOffset::west_opt(7 * 60 * 60)
            .unwrap()
            .with_ymd_and_hms(2026, 8, 31, 23, 59, 58)
            .unwrap()
    }

    #[test]
    fn renders_supported_placeholders_using_injected_local_time() {
        let project = ProjectPath::parse("Work/client-1").unwrap();
        let context = TemplateContext {
            project: Some(&project),
            submitted_at: submitted_at(),
        };

        assert_eq!(
            render_template(
                "# {{project_name}}\n+{{project}}\n{{date}} {{datetime}}\n",
                context,
            )
            .unwrap(),
            "# client-1\n+Work/client-1\n2026-08-31 2026-08-31T23:59:58-07:00\n"
        );
    }

    #[test]
    fn repeated_placeholders_render_without_evaluating_replacement_text() {
        let context = TemplateContext {
            project: None,
            submitted_at: submitted_at(),
        };

        assert_eq!(
            render_template("{{date}} / {{date}}", context).unwrap(),
            "2026-08-31 / 2026-08-31"
        );
    }

    #[test]
    fn rejects_unknown_and_malformed_placeholders() {
        assert_eq!(
            validate_template("{{unknown}}", true),
            Err(TemplateError::UnknownPlaceholder("unknown".to_string()))
        );
        for malformed in ["{{date", "date}}", "{{}}", "{{{{date}}", "{{date}}}}"] {
            assert_eq!(
                validate_template(malformed, true),
                Err(TemplateError::Malformed),
                "{malformed}"
            );
        }
    }

    #[test]
    fn rejects_project_values_for_unprojected_destination() {
        assert_eq!(
            validate_template("# {{project_name}}", false),
            Err(TemplateError::ProjectPlaceholderUnavailable(
                "project_name".to_string()
            ))
        );
        assert_eq!(
            render_template(
                "# {{project}}",
                TemplateContext {
                    project: None,
                    submitted_at: submitted_at(),
                },
            ),
            Err(TemplateError::ProjectPlaceholderUnavailable(
                "project".to_string()
            ))
        );
    }
}
