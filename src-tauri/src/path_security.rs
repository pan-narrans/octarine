use std::path::{Component, Path, PathBuf};

pub fn canonicalize_root(root: impl AsRef<Path>) -> Result<PathBuf, String> {
    let root = root.as_ref();
    let canonical = root
        .canonicalize()
        .map_err(|e| format!("Failed to resolve configured root: {e}"))?;
    if !canonical.is_dir() {
        return Err("Configured capability root is not a directory.".to_string());
    }
    Ok(canonical)
}

pub fn resolve_existing_within(
    root: impl AsRef<Path>,
    candidate: impl AsRef<Path>,
    allow_root: bool,
) -> Result<PathBuf, String> {
    let root = canonicalize_root(root)?;
    let candidate = candidate
        .as_ref()
        .canonicalize()
        .map_err(|e| format!("Failed to resolve path: {e}"))?;

    if !candidate.starts_with(&root) || (!allow_root && candidate == root) {
        return Err("Path is outside the configured capability root.".to_string());
    }
    Ok(candidate)
}

pub fn resolve_new_within(
    root: impl AsRef<Path>,
    candidate: impl AsRef<Path>,
) -> Result<PathBuf, String> {
    let candidate = candidate.as_ref();
    let file_name = candidate
        .file_name()
        .ok_or_else(|| "Destination path must have a file or directory name.".to_string())?;
    let parent = candidate
        .parent()
        .ok_or_else(|| "Destination path must have a parent directory.".to_string())?;
    let parent = resolve_existing_within(root, parent, true)?;
    Ok(parent.join(file_name))
}

pub fn resolve_child_within(
    root: impl AsRef<Path>,
    parent: impl AsRef<Path>,
    name: &str,
) -> Result<PathBuf, String> {
    let mut components = Path::new(name).components();
    let is_single_normal_component =
        matches!(components.next(), Some(Component::Normal(_))) && components.next().is_none();
    if !is_single_normal_component {
        return Err("Name must be a single file or directory name.".to_string());
    }

    let parent = resolve_existing_within(root, parent, true)?;
    Ok(parent.join(name))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn accepts_existing_and_new_paths_inside_root() {
        let temp = tempdir().unwrap();
        let root = temp.path().join("vault");
        fs::create_dir(&root).unwrap();
        let note = root.join("note.md");
        fs::write(&note, "note").unwrap();

        assert_eq!(
            resolve_existing_within(&root, &note, false).unwrap(),
            note.canonicalize().unwrap()
        );
        assert_eq!(
            resolve_new_within(&root, root.join("new.md")).unwrap(),
            root.canonicalize().unwrap().join("new.md")
        );
    }

    #[test]
    fn rejects_traversal_and_root_mutation() {
        let temp = tempdir().unwrap();
        let root = temp.path().join("vault");
        fs::create_dir(&root).unwrap();
        let outside = temp.path().join("outside.md");
        fs::write(&outside, "outside").unwrap();

        assert!(resolve_existing_within(&root, &outside, false).is_err());
        assert!(resolve_existing_within(&root, &root, false).is_err());
        assert!(resolve_child_within(&root, &root, "../outside.md").is_err());
        assert!(resolve_new_within(&root, root.join("../outside-2.md")).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlinks_that_escape_root() {
        use std::os::unix::fs::symlink;

        let temp = tempdir().unwrap();
        let root = temp.path().join("vault");
        let outside = temp.path().join("outside");
        fs::create_dir(&root).unwrap();
        fs::create_dir(&outside).unwrap();
        fs::write(outside.join("secret.md"), "secret").unwrap();
        symlink(&outside, root.join("escape")).unwrap();

        assert!(resolve_existing_within(&root, root.join("escape/secret.md"), false).is_err());
        assert!(resolve_new_within(&root, root.join("escape/new.md")).is_err());
    }
}
