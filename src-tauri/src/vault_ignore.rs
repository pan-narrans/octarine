use ignore::gitignore::{Gitignore, GitignoreBuilder};
use std::path::{Component, Path, PathBuf};

pub const IGNORE_FILE_NAME: &str = ".octarineignore";

pub struct VaultPathFilter {
    root: PathBuf,
    configured_root: PathBuf,
    matcher: Gitignore,
}

impl VaultPathFilter {
    pub fn load(root: impl AsRef<Path>) -> Result<Self, String> {
        let configured_root = root.as_ref().to_path_buf();
        let root = configured_root
            .canonicalize()
            .map_err(|e| format!("Failed to resolve vault ignore root: {e}"))?;
        let mut builder = GitignoreBuilder::new(&root);
        builder.allow_unclosed_class(false);
        let ignore_path = root.join(IGNORE_FILE_NAME);
        if ignore_path.exists() {
            if let Some(error) = builder.add(&ignore_path) {
                return Err(format!("Failed to parse .octarineignore: {error}"));
            }
        }
        let matcher = builder
            .build()
            .map_err(|e| format!("Failed to build .octarineignore rules: {e}"))?;
        Ok(Self {
            root,
            configured_root,
            matcher,
        })
    }

    pub fn is_ignored(&self, path: impl AsRef<Path>, is_dir: bool) -> bool {
        let path = path.as_ref();
        let relative = path
            .strip_prefix(&self.root)
            .or_else(|_| path.strip_prefix(&self.configured_root));
        let Ok(relative) = relative else {
            return true;
        };
        if relative.components().any(is_hidden_component) {
            return true;
        }
        self.matcher
            .matched_path_or_any_parents(relative, is_dir)
            .is_ignore()
    }

    pub fn is_indexable_markdown(&self, path: impl AsRef<Path>) -> bool {
        let path = path.as_ref();
        path.extension().is_some_and(|extension| extension == "md") && !self.is_ignored(path, false)
    }

    pub fn is_ignore_file(path: impl AsRef<Path>) -> bool {
        path.as_ref()
            .file_name()
            .is_some_and(|name| name == IGNORE_FILE_NAME)
    }
}

fn is_hidden_component(component: Component<'_>) -> bool {
    match component {
        Component::Normal(value) => value.to_string_lossy().starts_with('.'),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn applies_gitignore_rules_and_keeps_unmatched_markdown() {
        let temp = tempdir().unwrap();
        let root = temp.path().join("vault");
        fs::create_dir(&root).unwrap();
        fs::write(
            root.join(IGNORE_FILE_NAME),
            "archives/\ngenerated/**/*.md\n!generated/keep.md\n",
        )
        .unwrap();
        let filter = VaultPathFilter::load(&root).unwrap();

        assert!(filter.is_ignored(root.join("archives/task.md"), false));
        assert!(filter.is_ignored(root.join("generated/nested/task.md"), false));
        assert!(!filter.is_ignored(root.join("generated/keep.md"), false));
        assert!(filter.is_indexable_markdown(root.join("notes/task.md")));
        assert!(!filter.is_indexable_markdown(root.join("notes/task.txt")));
    }

    #[test]
    fn excludes_hidden_paths_and_paths_outside_root() {
        let temp = tempdir().unwrap();
        let root = temp.path().join("vault");
        fs::create_dir(&root).unwrap();
        let filter = VaultPathFilter::load(&root).unwrap();

        assert!(filter.is_ignored(root.join(".hidden/task.md"), false));
        assert!(filter.is_ignored(root.join("notes/.task.md"), false));
        assert!(filter.is_ignored(temp.path().join("outside.md"), false));
    }

    #[test]
    fn reports_invalid_ignore_pattern() {
        let temp = tempdir().unwrap();
        let root = temp.path().join("vault");
        fs::create_dir(&root).unwrap();
        fs::write(root.join(IGNORE_FILE_NAME), "[invalid\n").unwrap();

        assert!(VaultPathFilter::load(&root).is_err());
    }
}
