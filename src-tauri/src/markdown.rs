use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use ts_rs::TS;

static TEMP_FILE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownLinkTarget {
    pub path: String,
    pub fragment: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentImportResult {
    pub file_name: String,
    pub relative_path: String,
}

pub fn resolve_markdown_link(
    content_root: impl AsRef<Path>,
    document_path: impl AsRef<Path>,
    target: &str,
) -> Result<MarkdownLinkTarget, String> {
    let content_root = content_root.as_ref();
    let document_path =
        crate::path_security::resolve_existing_within(content_root, document_path, false)?;
    if !document_path.is_file() || !is_markdown_path(&document_path) {
        return Err("Markdown document path is invalid.".to_string());
    }

    if target.starts_with('/') || target.starts_with("\\\\") || target.contains('\\') {
        return Err("Markdown link must use a relative path.".to_string());
    }
    if has_uri_scheme(target) {
        return Err("Markdown link scheme is unsupported.".to_string());
    }

    let (path_part, fragment_part) = target
        .split_once('#')
        .map_or((target, None), |(path, fragment)| (path, Some(fragment)));
    if path_part.contains('?') {
        return Err("Markdown link query strings are unsupported.".to_string());
    }

    let decoded_path = decode_uri_component(path_part)?;
    if decoded_path.starts_with('/') || decoded_path.contains('\\') {
        return Err("Markdown link must use a relative path.".to_string());
    }
    let decoded_fragment = fragment_part.map(decode_uri_component).transpose()?;

    let candidate = if decoded_path.is_empty() {
        document_path.clone()
    } else {
        let parent = document_path
            .parent()
            .ok_or_else(|| "Markdown document has no parent directory.".to_string())?;
        crate::path_security::resolve_descendant_within(
            content_root,
            parent.join(decoded_path),
            false,
        )?
    };

    if !candidate.is_file() || !is_markdown_path(&candidate) {
        return Err("Markdown link target does not exist or is not a Markdown file.".to_string());
    }

    Ok(MarkdownLinkTarget {
        path: candidate.to_string_lossy().into_owned(),
        fragment: decoded_fragment,
    })
}

pub fn import_attachment(
    content_root: impl AsRef<Path>,
    document_path: impl AsRef<Path>,
    file_name: &str,
    bytes: &[u8],
) -> Result<AttachmentImportResult, String> {
    let content_root = content_root.as_ref();
    let document_path =
        crate::path_security::resolve_existing_within(content_root, document_path, false)?;
    if !document_path.is_file() || !is_markdown_path(&document_path) {
        return Err("Markdown document path is invalid.".to_string());
    }
    validate_attachment_name(file_name)?;

    let document_parent = document_path
        .parent()
        .ok_or_else(|| "Markdown document has no parent directory.".to_string())?;
    let attachments_path = document_parent.join("attachments");
    if !attachments_path.exists() {
        match fs::create_dir(&attachments_path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(format!("Failed to create attachments directory: {error}")),
        }
    }
    let attachments_dir =
        crate::path_security::resolve_existing_within(content_root, &attachments_path, false)?;
    if !attachments_dir.is_dir() {
        return Err("Attachments path is not a directory.".to_string());
    }

    let temporary_path = write_temporary_attachment(&attachments_dir, bytes)?;
    let destination = match link_without_overwrite(&temporary_path, &attachments_dir, file_name) {
        Ok(destination) => destination,
        Err(error) => {
            let _ = fs::remove_file(&temporary_path);
            return Err(error);
        }
    };
    let _ = fs::remove_file(&temporary_path);

    let file_name = destination
        .file_name()
        .ok_or_else(|| "Imported attachment has no file name.".to_string())?
        .to_string_lossy()
        .into_owned();

    Ok(AttachmentImportResult {
        relative_path: format!("attachments/{file_name}"),
        file_name,
    })
}

fn has_uri_scheme(target: &str) -> bool {
    let Some((scheme, _)) = target.split_once(':') else {
        return false;
    };
    let mut characters = scheme.chars();
    characters
        .next()
        .is_some_and(|first| first.is_ascii_alphabetic())
        && characters.all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '+' | '.' | '-')
        })
}

fn decode_uri_component(value: &str) -> Result<String, String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let high = bytes
                .get(index + 1)
                .and_then(|byte| hex_value(*byte))
                .ok_or_else(|| "Markdown link contains invalid percent encoding.".to_string())?;
            let low = bytes
                .get(index + 2)
                .and_then(|byte| hex_value(*byte))
                .ok_or_else(|| "Markdown link contains invalid percent encoding.".to_string())?;
            decoded.push((high << 4) | low);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded)
        .map_err(|_| "Markdown link contains invalid UTF-8 encoding.".to_string())
}

fn hex_value(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(extension.to_ascii_lowercase().as_str(), "md" | "markdown")
        })
}

fn validate_attachment_name(file_name: &str) -> Result<(), String> {
    let mut components = Path::new(file_name).components();
    if file_name.is_empty()
        || file_name.contains('/')
        || file_name.contains('\\')
        || file_name.chars().any(char::is_control)
        || !matches!(components.next(), Some(Component::Normal(_)))
        || components.next().is_some()
    {
        return Err("Attachment name must be a single safe file name.".to_string());
    }
    Ok(())
}

fn write_temporary_attachment(directory: &Path, bytes: &[u8]) -> Result<PathBuf, String> {
    loop {
        let sequence = TEMP_FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let name = format!(".octarine-attachment-{}-{sequence}.tmp", std::process::id());
        let path = directory.join(&name);
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut file) => {
                if let Err(error) = file.write_all(bytes).and_then(|()| file.sync_all()) {
                    let _ = fs::remove_file(&path);
                    return Err(format!("Failed to write attachment: {error}"));
                }
                return Ok(path);
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("Failed to prepare attachment: {error}")),
        }
    }
}

fn link_without_overwrite(
    temporary_path: &Path,
    directory: &Path,
    requested_name: &str,
) -> Result<PathBuf, String> {
    let (stem, extension) = requested_name
        .rsplit_once('.')
        .filter(|(stem, _)| !stem.is_empty())
        .map_or((requested_name, None), |(stem, extension)| {
            (stem, Some(extension))
        });
    let mut suffix = 1_u32;
    loop {
        let candidate_name = if suffix == 1 {
            requested_name.to_string()
        } else if let Some(extension) = extension {
            format!("{stem}-{suffix}.{extension}")
        } else {
            format!("{stem}-{suffix}")
        };
        let candidate = directory.join(candidate_name);
        match fs::hard_link(temporary_path, &candidate) {
            Ok(()) => return Ok(candidate),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                suffix = suffix
                    .checked_add(1)
                    .ok_or_else(|| "Could not find an available attachment name.".to_string())?;
            }
            Err(error) => {
                return Err(format!(
                    "Failed to save attachment without overwriting: {error}"
                ))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn note(root: &Path, relative: &str, content: &str) -> PathBuf {
        let path = root.join(relative);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, content).unwrap();
        path
    }

    #[test]
    fn resolves_relative_markdown_file_and_heading_fragment() {
        let temp = tempdir().unwrap();
        let root = temp.path().join("vault");
        fs::create_dir(&root).unwrap();
        let document = note(&root, "notes/source.md", "# Source");
        let target = note(&root, "notes/next note.md", "# Next");

        let result =
            resolve_markdown_link(&root, &document, "next%20note.md#next-heading").unwrap();
        assert_eq!(
            result.path,
            target.canonicalize().unwrap().to_string_lossy()
        );
        assert_eq!(result.fragment.as_deref(), Some("next-heading"));
    }

    #[test]
    fn resolves_same_document_fragments() {
        let temp = tempdir().unwrap();
        let root = temp.path().join("vault");
        fs::create_dir(&root).unwrap();
        let document = note(&root, "note.md", "# Note");

        let result = resolve_markdown_link(&root, &document, "#note").unwrap();
        assert_eq!(
            result.path,
            document.canonicalize().unwrap().to_string_lossy()
        );
        assert_eq!(result.fragment.as_deref(), Some("note"));
    }

    #[test]
    fn rejects_schemes_traversal_missing_and_non_markdown_targets() {
        let temp = tempdir().unwrap();
        let root = temp.path().join("vault");
        fs::create_dir(&root).unwrap();
        let document = note(&root, "notes/source.md", "# Source");
        note(&root, "notes/image.png", "image");

        for target in [
            "https://example.test",
            "javascript:alert(1)",
            "../../outside.md",
            "%2e%2e/%2e%2e/outside.md",
            "/absolute.md",
            "missing.md",
            "image.png",
            "next.md?download=1",
        ] {
            assert!(
                resolve_markdown_link(&root, &document, target).is_err(),
                "{target}"
            );
        }
    }

    #[cfg(unix)]
    #[test]
    fn rejects_link_symlinks_that_escape_content_root() {
        use std::os::unix::fs::symlink;

        let temp = tempdir().unwrap();
        let root = temp.path().join("vault");
        let outside = temp.path().join("outside");
        fs::create_dir(&root).unwrap();
        fs::create_dir(&outside).unwrap();
        let document = note(&root, "source.md", "# Source");
        note(&outside, "private.md", "# Private");
        symlink(&outside, root.join("escape")).unwrap();

        assert!(resolve_markdown_link(&root, &document, "escape/private.md").is_err());
    }

    #[test]
    fn imports_atomically_with_deterministic_conflict_suffixes() {
        let temp = tempdir().unwrap();
        let root = temp.path().join("vault");
        fs::create_dir(&root).unwrap();
        let document = note(&root, "notes/source.md", "# Source");

        let first = import_attachment(&root, &document, "image.png", b"first").unwrap();
        let second = import_attachment(&root, &document, "image.png", b"second").unwrap();
        let third = import_attachment(&root, &document, "image.png", b"third").unwrap();
        let attachments = root.join("notes/attachments");

        assert_eq!(first.file_name, "image.png");
        assert_eq!(second.file_name, "image-2.png");
        assert_eq!(third.file_name, "image-3.png");
        assert_eq!(first.relative_path, "attachments/image.png");
        assert_eq!(fs::read(attachments.join("image.png")).unwrap(), b"first");
        assert_eq!(
            fs::read(attachments.join("image-2.png")).unwrap(),
            b"second"
        );
        assert_eq!(fs::read(attachments.join("image-3.png")).unwrap(), b"third");
    }

    #[test]
    fn rejects_unsafe_names_and_invalid_document_paths() {
        let temp = tempdir().unwrap();
        let root = temp.path().join("vault");
        fs::create_dir(&root).unwrap();
        let document = note(&root, "source.md", "# Source");

        for name in [
            "",
            "../escape.png",
            "folder/image.png",
            "folder\\image.png",
            ".",
        ] {
            assert!(
                import_attachment(&root, &document, name, b"bytes").is_err(),
                "{name}"
            );
        }
        assert!(import_attachment(&root, root.join("missing.md"), "image.png", b"bytes").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_attachment_directory_symlink_escape() {
        use std::os::unix::fs::symlink;

        let temp = tempdir().unwrap();
        let root = temp.path().join("vault");
        let outside = temp.path().join("outside");
        fs::create_dir(&root).unwrap();
        fs::create_dir(&outside).unwrap();
        let document = note(&root, "source.md", "# Source");
        symlink(&outside, root.join("attachments")).unwrap();

        assert!(import_attachment(&root, &document, "image.png", b"bytes").is_err());
        assert!(!outside.join("image.png").exists());
    }

    #[cfg(unix)]
    #[test]
    fn imports_through_in_root_attachment_symlink_with_portable_sibling_path() {
        use std::os::unix::fs::symlink;

        let temp = tempdir().unwrap();
        let root = temp.path().join("vault");
        fs::create_dir(&root).unwrap();
        let document = note(&root, "notes/source.md", "# Source");
        let shared = root.join("shared-attachments");
        fs::create_dir(&shared).unwrap();
        symlink(&shared, root.join("notes/attachments")).unwrap();

        let result = import_attachment(&root, &document, "image.png", b"inside").unwrap();

        assert_eq!(result.relative_path, "attachments/image.png");
        assert_eq!(fs::read(shared.join("image.png")).unwrap(), b"inside");
    }
}
