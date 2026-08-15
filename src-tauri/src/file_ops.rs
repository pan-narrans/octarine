use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileNode>>,
}

pub fn scan_dir_tree(dir_path: &Path) -> Result<FileNode, String> {
    let name = dir_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "Root".to_string());

    let path = dir_path.to_string_lossy().to_string();
    let is_dir = dir_path.is_dir();

    let mut children = None;
    if is_dir {
        let mut node_children = Vec::new();
        let entries = fs::read_dir(dir_path)
            .map_err(|e| format!("Failed to read directory {}: {}", path, e))?;

        for entry in entries.flatten() {
            let entry_path = entry.path();
            let entry_name = entry.file_name().to_string_lossy().to_string();

            // Skip hidden folders/files like .git, .idea, .agent-session, etc.
            if entry_name.starts_with('.') {
                continue;
            }

            if entry_path.is_file() {
                // Only include markdown (*.md) files in the tree
                if entry_path.extension().is_some_and(|ext| ext == "md") {
                    if let Ok(child_node) = scan_dir_tree(&entry_path) {
                        node_children.push(child_node);
                    }
                }
            } else if entry_path.is_dir() {
                if let Ok(child_node) = scan_dir_tree(&entry_path) {
                    node_children.push(child_node);
                }
            }
        }

        // Sort children: Directories first, then files alphabetically (like VS Code/Obsidian)
        node_children.sort_by(|a, b| {
            if a.is_dir && !b.is_dir {
                std::cmp::Ordering::Less
            } else if !a.is_dir && b.is_dir {
                std::cmp::Ordering::Greater
            } else {
                a.name.to_lowercase().cmp(&b.name.to_lowercase())
            }
        });

        children = Some(node_children);
    }

    Ok(FileNode {
        name,
        path,
        is_dir,
        children,
    })
}

pub fn create_file_on_disk(parent_dir: &str, name: &str) -> Result<String, String> {
    let mut file_name = name.to_string();
    if !file_name.ends_with(".md") {
        file_name.push_str(".md");
    }
    let file_path = Path::new(parent_dir).join(&file_name);
    if file_path.exists() {
        return Err("A file with that name already exists.".to_string());
    }

    // Automatically scaffold a clean markdown header
    let placeholder = format!("# {}\n\n", file_name.replace(".md", ""));
    fs::write(&file_path, placeholder).map_err(|e| format!("Failed to create file: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}

pub fn create_directory_on_disk(parent_dir: &str, name: &str) -> Result<String, String> {
    let dir_path = Path::new(parent_dir).join(name);
    if dir_path.exists() {
        return Err("A directory with that name already exists.".to_string());
    }
    fs::create_dir_all(&dir_path).map_err(|e| format!("Failed to create directory: {}", e))?;

    Ok(dir_path.to_string_lossy().to_string())
}

pub fn delete_path_on_disk(path_str: &str) -> Result<(), String> {
    let path = Path::new(path_str);
    if !path.exists() {
        return Err("The specified path does not exist on disk.".to_string());
    }
    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|e| format!("Failed to delete folder: {}", e))?;
    } else {
        fs::remove_file(path).map_err(|e| format!("Failed to delete file: {}", e))?;
    }
    Ok(())
}

pub fn rename_path_on_disk(old_path_str: &str, new_path_str: &str) -> Result<(), String> {
    let old_path = Path::new(old_path_str);
    let new_path = Path::new(new_path_str);
    if !old_path.exists() {
        return Err("The source path does not exist.".to_string());
    }
    if new_path.exists() {
        return Err("The destination path already exists.".to_string());
    }
    fs::rename(old_path, new_path).map_err(|e| format!("Failed to rename/move path: {}", e))?;
    Ok(())
}

pub fn read_file_content_on_disk(path_str: &str) -> Result<String, String> {
    let path = Path::new(path_str);
    if !path.exists() {
        return Err("File not found.".to_string());
    }
    fs::read_to_string(path).map_err(|e| format!("Failed to read file: {}", e))
}

pub fn write_file_content_on_disk(path_str: &str, content: &str) -> Result<(), String> {
    let path = Path::new(path_str);
    if !path.exists() {
        return Err("File not found on disk.".to_string());
    }
    fs::write(path, content).map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(())
}

use regex::Regex;
use std::collections::BTreeMap;
use std::sync::OnceLock;

static JOURNAL_REGEX: OnceLock<Regex> = OnceLock::new();

fn get_journal_regex() -> &'static Regex {
    JOURNAL_REGEX.get_or_init(|| Regex::new(r"^\d{4}-\d{2}-\d{2}\.md$").unwrap())
}

fn get_month_name(month: u32) -> &'static str {
    match month {
        1 => "January",
        2 => "February",
        3 => "March",
        4 => "April",
        5 => "May",
        6 => "June",
        7 => "July",
        8 => "August",
        9 => "September",
        10 => "October",
        11 => "November",
        12 => "December",
        _ => "Unknown",
    }
}

pub fn build_journal_tree(journal_dir_path: &Path) -> Result<FileNode, String> {
    if !journal_dir_path.exists() {
        fs::create_dir_all(journal_dir_path)
            .map_err(|e| format!("Failed to create journal directory: {}", e))?;
    }

    let mut matching_files = Vec::new();
    if journal_dir_path.is_dir() {
        let entries = fs::read_dir(journal_dir_path)
            .map_err(|e| format!("Failed to read journal directory: {}", e))?;
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_file() {
                let file_name = entry_path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                if get_journal_regex().is_match(&file_name) {
                    matching_files.push((file_name, entry_path));
                }
            }
        }
    }

    let total_files = matching_files.len();

    // Group files: Year (String) -> Month (u32) -> Vec<FileNode>
    let mut groups: BTreeMap<String, BTreeMap<u32, Vec<FileNode>>> = BTreeMap::new();
    for (file_name, entry_path) in matching_files {
        let date_str = file_name.replace(".md", "");
        let parts: Vec<&str> = date_str.split('-').collect();
        if parts.len() == 3 {
            let year = parts[0].to_string();
            if let (Ok(month), Ok(_day)) = (parts[1].parse::<u32>(), parts[2].parse::<u32>()) {
                let node = FileNode {
                    name: date_str.clone(),
                    path: entry_path.to_string_lossy().to_string(),
                    is_dir: false,
                    children: None,
                };
                groups
                    .entry(year)
                    .or_default()
                    .entry(month)
                    .or_default()
                    .push(node);
            }
        }
    }

    let mut year_nodes = Vec::new();
    for (year, months) in groups {
        let mut month_nodes = Vec::new();
        let mut year_file_count = 0;

        for (month_num, mut day_nodes) in months {
            let month_file_count = day_nodes.len();
            year_file_count += month_file_count;

            // Sort days descending (newest first)
            day_nodes.sort_by(|a, b| b.name.cmp(&a.name));

            let month_name = get_month_name(month_num);
            let month_node = FileNode {
                name: format!("{} ({})", month_name, month_file_count),
                path: format!("000 - journals/{}/{}", year, month_name),
                is_dir: true,
                children: Some(day_nodes),
            };
            month_nodes.push(month_node);
        }

        // Reverse month nodes to show newest first (e.g. July before June)
        month_nodes.reverse();

        let year_node = FileNode {
            name: format!("{} ({})", year, year_file_count),
            path: format!("000 - journals/{}", year),
            is_dir: true,
            children: Some(month_nodes),
        };
        year_nodes.push(year_node);
    }

    // Reverse year nodes to show newest first (e.g. 2026 before 2025)
    year_nodes.reverse();

    let root_node = FileNode {
        name: format!("000 - journals ({})", total_files),
        path: "000 - journals".to_string(),
        is_dir: true,
        children: Some(year_nodes),
    };

    Ok(root_node)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_scan_dir_tree_and_file_ops() {
        let temp_dir = tempdir().unwrap();
        let vault_path = temp_dir.path();

        // 1. Scaffold sub-directories and files
        let proj_a = create_directory_on_disk(&vault_path.to_string_lossy(), "Project A").unwrap();
        let _proj_b = create_directory_on_disk(&vault_path.to_string_lossy(), "Project B").unwrap();

        let file_a1 = create_file_on_disk(&proj_a, "task1.md").unwrap();
        let _file_a2 = create_file_on_disk(&proj_a, "task2.md").unwrap();

        // Write content to file a1
        write_file_content_on_disk(&file_a1, "# Task 1\n- [<] Clean up s:2026-07-23\n").unwrap();

        // 2. Scan Directory Tree
        let tree = scan_dir_tree(vault_path).unwrap();
        assert!(tree.is_dir);

        let children = tree.children.unwrap();
        assert_eq!(children.len(), 2); // Project A, Project B
        assert_eq!(children[0].name, "Project A");
        assert!(children[0].is_dir);

        let sub_children = children[0].children.as_ref().unwrap();
        assert_eq!(sub_children.len(), 2); // task1.md, task2.md
        assert_eq!(sub_children[0].name, "task1.md");
        assert!(!sub_children[0].is_dir);

        // 3. Read content
        let content = read_file_content_on_disk(&file_a1).unwrap();
        assert!(content.contains("- [<] Clean up"));

        // 4. Rename file
        let new_file_a1 = Path::new(&proj_a).join("renamed_task1.md");
        rename_path_on_disk(&file_a1, &new_file_a1.to_string_lossy()).unwrap();
        assert!(new_file_a1.exists());
        assert!(!Path::new(&file_a1).exists());

        // 5. Delete file
        delete_path_on_disk(&new_file_a1.to_string_lossy()).unwrap();
        assert!(!new_file_a1.exists());
    }

    #[test]
    fn test_build_journal_tree() {
        let temp_dir = tempdir().unwrap();
        let journal_path = temp_dir.path();

        // Create some sample journal files
        // Match pattern YYYY-MM-DD.md
        let file_2026_07_23 = journal_path.join("2026-07-23.md");
        fs::write(&file_2026_07_23, "# 2026-07-23").unwrap();

        let file_2026_06_15 = journal_path.join("2026-06-15.md");
        fs::write(&file_2026_06_15, "# 2026-06-15").unwrap();

        let file_2025_12_01 = journal_path.join("2025-12-01.md");
        fs::write(&file_2025_12_01, "# 2025-12-01").unwrap();

        // Write some non-matching files to ensure they are ignored
        let file_ignored = journal_path.join("random_file.md");
        fs::write(&file_ignored, "# Ignored").unwrap();

        let tree = build_journal_tree(journal_path).unwrap();
        assert_eq!(tree.name, "000 - journals (3)");
        assert!(tree.is_dir);

        let years = tree.children.unwrap();
        assert_eq!(years.len(), 2); // 2026, 2025 (newest first!)
        assert_eq!(years[0].name, "2026 (2)");
        assert_eq!(years[1].name, "2025 (1)");

        let months_2026 = years[0].children.as_ref().unwrap();
        assert_eq!(months_2026.len(), 2); // July, June (newest first!)
        assert_eq!(months_2026[0].name, "July (1)");
        assert_eq!(months_2026[1].name, "June (1)");

        let days_july = months_2026[0].children.as_ref().unwrap();
        assert_eq!(days_july.len(), 1);
        assert_eq!(days_july[0].name, "2026-07-23");
        assert!(!days_july[0].is_dir);
        assert_eq!(
            days_july[0].path,
            file_2026_07_23.to_string_lossy().to_string()
        );
    }
}
