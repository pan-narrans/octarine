use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};
use unicase::UniCase;
use unicode_normalization::UnicodeNormalization;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProjectNameError {
    Empty,
    EmptySegment,
    InvalidCharacter { segment: String, character: char },
}

impl fmt::Display for ProjectNameError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Empty => write!(formatter, "Project name cannot be empty."),
            Self::EmptySegment => write!(formatter, "Project path contains an empty segment."),
            Self::InvalidCharacter { segment, character } => write!(
                formatter,
                "Project segment '{segment}' contains invalid character '{character}'."
            ),
        }
    }
}

impl std::error::Error for ProjectNameError {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectPath {
    display: String,
    identity: String,
    segments: Vec<String>,
}

impl ProjectPath {
    pub fn parse(value: &str) -> Result<Self, ProjectNameError> {
        if value.is_empty() {
            return Err(ProjectNameError::Empty);
        }

        let normalized: String = value.nfc().collect();
        let mut segments = Vec::new();
        for segment in normalized.split('/') {
            if segment.is_empty() {
                return Err(ProjectNameError::EmptySegment);
            }
            if let Some(character) = segment.chars().find(|character| {
                !character.is_alphanumeric() && *character != '_' && *character != '-'
            }) {
                return Err(ProjectNameError::InvalidCharacter {
                    segment: segment.to_string(),
                    character,
                });
            }
            segments.push(segment.to_string());
        }

        let display = segments.join("/");
        let identity = UniCase::unicode(&display).to_folded_case().nfc().collect();
        Ok(Self {
            display,
            identity,
            segments,
        })
    }

    pub fn display(&self) -> &str {
        &self.display
    }

    pub fn identity(&self) -> &str {
        &self.identity
    }

    pub fn name(&self) -> &str {
        self.segments.last().map(String::as_str).unwrap_or_default()
    }

    pub fn relative_file_path(&self, project_folder: &str) -> PathBuf {
        let mut destination = PathBuf::from(project_folder);
        if let Some((leaf, parents)) = self.segments.split_last() {
            for parent in parents {
                destination.push(parent);
            }
            destination.push(format!("{leaf}.md"));
        }
        destination
    }

    pub fn relative_directory_path(&self, project_folder: &str) -> PathBuf {
        let mut destination = PathBuf::from(project_folder);
        for segment in &self.segments {
            destination.push(segment);
        }
        destination
    }

    pub fn renamed_descendant(&self, old: &Self, new: &Self) -> Option<String> {
        let old_len = old.segments.len();
        if self.segments.len() < old_len
            || self.segments[..old_len]
                .iter()
                .zip(&old.segments)
                .any(|(candidate, expected)| {
                    folded_identity(candidate) != folded_identity(expected)
                })
        {
            return None;
        }

        let mut segments = new.segments.clone();
        segments.extend(self.segments[old_len..].iter().cloned());
        Some(segments.join("/"))
    }

    pub fn case_collision<'a, I>(&self, existing: I) -> Result<Option<String>, ProjectNameError>
    where
        I: IntoIterator<Item = &'a str>,
    {
        for value in existing {
            let parsed = Self::parse(value)?;
            if parsed.identity == self.identity && parsed.display != self.display {
                return Ok(Some(parsed.display));
            }
        }
        Ok(None)
    }
}

pub fn resolve_project_file(
    vault_root: &Path,
    project_folder: &str,
    project: &ProjectPath,
) -> Result<PathBuf, String> {
    let relative = project.relative_file_path(project_folder);
    let resolved = crate::path_security::resolve_descendant_within(vault_root, &relative, false)?;
    let filter = crate::vault_ignore::VaultPathFilter::load(vault_root)?;
    if filter.is_ignored(&resolved, false) {
        return Err("Project destination cannot be hidden or ignored.".to_string());
    }
    if resolved.exists() && !resolved.is_file() {
        return Err("Project destination must resolve to a Markdown file.".to_string());
    }
    Ok(resolved)
}

pub fn filesystem_case_collision(
    vault_root: &Path,
    project_folder: &str,
    project: &ProjectPath,
) -> Result<Option<String>, String> {
    let mut current =
        crate::path_security::resolve_descendant_within(vault_root, project_folder, false)?;
    let mut actual_segments = Vec::new();

    for (index, desired) in project.segments.iter().enumerate() {
        if !current.is_dir() {
            return Ok(None);
        }
        let is_leaf = index + 1 == project.segments.len();
        let desired_entry = if is_leaf {
            format!("{desired}.md")
        } else {
            desired.clone()
        };
        let desired_identity = folded_identity(&desired_entry);
        let matched = fs::read_dir(&current)
            .map_err(|error| format!("Failed to inspect project destination: {error}"))?
            .filter_map(Result::ok)
            .find(|entry| {
                folded_identity(&entry.file_name().to_string_lossy()) == desired_identity
            });
        let Some(matched) = matched else {
            return Ok(None);
        };
        let actual_entry = matched.file_name().to_string_lossy().into_owned();
        let actual_segment = if is_leaf {
            actual_entry
                .strip_suffix(".md")
                .or_else(|| actual_entry.strip_suffix(".MD"))
                .unwrap_or(&actual_entry)
                .to_string()
        } else {
            actual_entry.clone()
        };
        actual_segments.push(actual_segment);
        if actual_entry != desired_entry {
            return Ok(Some(actual_segments.join("/")));
        }
        current = matched.path();
    }
    Ok(None)
}

fn folded_identity(value: &str) -> String {
    let normalized: String = value.nfc().collect();
    UniCase::unicode(normalized)
        .to_folded_case()
        .nfc()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn validates_and_maps_hierarchical_project() {
        let project = ProjectPath::parse("Work/client-a_1").unwrap();

        assert_eq!(project.display(), "Work/client-a_1");
        assert_eq!(project.identity(), "work/client-a_1");
        assert_eq!(
            project.relative_file_path("projects"),
            PathBuf::from("projects/Work/client-a_1.md")
        );
    }

    #[test]
    fn normalizes_unicode_to_nfc() {
        let project = ProjectPath::parse("work/estimacio\u{301}n").unwrap();

        assert_eq!(project.display(), "work/estimación");
        assert_eq!(project.identity(), "work/estimación");
    }

    #[test]
    fn uses_full_unicode_case_folding_for_identity() {
        let sharp_s = ProjectPath::parse("straße").unwrap();
        let uppercase = ProjectPath::parse("STRASSE").unwrap();

        assert_eq!(sharp_s.identity(), uppercase.identity());
        assert_eq!(
            sharp_s.case_collision([uppercase.display()]).unwrap(),
            Some("STRASSE".to_string())
        );
    }

    #[test]
    fn rejects_invalid_names() {
        assert_eq!(ProjectPath::parse(""), Err(ProjectNameError::Empty));
        assert_eq!(
            ProjectPath::parse("work//project"),
            Err(ProjectNameError::EmptySegment)
        );
        assert!(matches!(
            ProjectPath::parse("work/project name"),
            Err(ProjectNameError::InvalidCharacter { character: ' ', .. })
        ));
        assert!(ProjectPath::parse("work/project.md").is_err());
        assert!(ProjectPath::parse("../work").is_err());
        assert!(ProjectPath::parse("/work").is_err());
        assert!(ProjectPath::parse("work/").is_err());
    }

    #[test]
    fn detects_case_insensitive_collision_but_allows_exact_existing_name() {
        let project = ProjectPath::parse("Work/Client").unwrap();

        assert_eq!(
            project.case_collision(["personal", "work/client"]).unwrap(),
            Some("work/client".to_string())
        );
        assert_eq!(project.case_collision(["Work/Client"]).unwrap(), None);
    }

    #[test]
    fn resolves_destination_inside_vault_and_rejects_ignore_match() {
        let temp = tempdir().unwrap();
        let vault = temp.path().join("vault");
        fs::create_dir(&vault).unwrap();
        let project = ProjectPath::parse("work/client").unwrap();

        assert_eq!(
            resolve_project_file(&vault, "projects", &project).unwrap(),
            vault
                .canonicalize()
                .unwrap()
                .join("projects/work/client.md")
        );

        fs::write(vault.join(".octarineignore"), "projects/work/\n").unwrap();
        assert_eq!(
            resolve_project_file(&vault, "projects", &project).unwrap_err(),
            "Project destination cannot be hidden or ignored."
        );
    }

    #[test]
    fn detects_casefold_collision_from_existing_project_path() {
        let temp = tempdir().unwrap();
        let vault = temp.path().join("vault");
        fs::create_dir_all(vault.join("projects/Work")).unwrap();
        fs::write(vault.join("projects/Work/STRASSE.md"), "# Empty project\n").unwrap();

        let project = ProjectPath::parse("Work/straße").unwrap();
        assert_eq!(
            filesystem_case_collision(&vault, "projects", &project).unwrap(),
            Some("Work/STRASSE".to_string())
        );
        let exact = ProjectPath::parse("Work/STRASSE").unwrap();
        assert_eq!(
            filesystem_case_collision(&vault, "projects", &exact).unwrap(),
            None
        );
    }

    #[test]
    fn renames_exact_and_descendant_segments_without_matching_prefixes() {
        let old = ProjectPath::parse("work").unwrap();
        let new = ProjectPath::parse("job").unwrap();

        assert_eq!(
            ProjectPath::parse("Work/Client")
                .unwrap()
                .renamed_descendant(&old, &new),
            Some("job/Client".to_string())
        );
        assert_eq!(
            ProjectPath::parse("workshop")
                .unwrap()
                .renamed_descendant(&old, &new),
            None
        );
    }
}
