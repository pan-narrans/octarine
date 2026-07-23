use std::fs;
use std::path::Path;
use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileNode>>,
}

pub fn scan_dir_tree(dir_path: &Path) -> Result<FileNode, String> {
    let name = dir_path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "Root".to_string());
    
    let path = dir_path.to_string_lossy().to_string();
    let is_dir = dir_path.is_dir();

    let mut children = None;
    if is_dir {
        let mut node_children = Vec::new();
        let entries = fs::read_dir(dir_path)
            .map_err(|e| format!("Failed to read directory {}: {}", path, e))?;
        
        for entry in entries {
            if let Ok(entry) = entry {
                let entry_path = entry.path();
                let entry_name = entry.file_name().to_string_lossy().to_string();

                // Skip hidden folders/files like .git, .idea, .agent-session, etc.
                if entry_name.starts_with('.') {
                    continue;
                }

                if entry_path.is_file() {
                    // Only include markdown (*.md) files in the tree
                    if entry_path.extension().map_or(false, |ext| ext == "md") {
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
    let placeholder = format!(
        "# {}\n\n",
        file_name.replace(".md", "")
    );
    fs::write(&file_path, placeholder)
        .map_err(|e| format!("Failed to create file: {}", e))?;
    
    Ok(file_path.to_string_lossy().to_string())
}

pub fn create_directory_on_disk(parent_dir: &str, name: &str) -> Result<String, String> {
    let dir_path = Path::new(parent_dir).join(name);
    if dir_path.exists() {
        return Err("A directory with that name already exists.".to_string());
    }
    fs::create_dir_all(&dir_path)
        .map_err(|e| format!("Failed to create directory: {}", e))?;
    
    Ok(dir_path.to_string_lossy().to_string())
}

pub fn delete_path_on_disk(path_str: &str) -> Result<(), String> {
    let path = Path::new(path_str);
    if !path.exists() {
        return Err("The specified path does not exist on disk.".to_string());
    }
    if path.is_dir() {
        fs::remove_dir_all(path)
            .map_err(|e| format!("Failed to delete folder: {}", e))?;
    } else {
        fs::remove_file(path)
            .map_err(|e| format!("Failed to delete file: {}", e))?;
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
    fs::rename(old_path, new_path)
        .map_err(|e| format!("Failed to rename/move path: {}", e))?;
    Ok(())
}

pub fn read_file_content_on_disk(path_str: &str) -> Result<String, String> {
    let path = Path::new(path_str);
    if !path.exists() {
        return Err("File not found.".to_string());
    }
    fs::read_to_string(path)
        .map_err(|e| format!("Failed to read file: {}", e))
}

pub fn write_file_content_on_disk(path_str: &str, content: &str) -> Result<(), String> {
    let path = Path::new(path_str);
    if !path.exists() {
        return Err("File not found on disk.".to_string());
    }
    fs::write(path, content)
        .map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(())
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
        assert_eq!(tree.is_dir, true);
        
        let children = tree.children.unwrap();
        assert_eq!(children.len(), 2); // Project A, Project B
        assert_eq!(children[0].name, "Project A");
        assert_eq!(children[0].is_dir, true);

        let sub_children = children[0].children.as_ref().unwrap();
        assert_eq!(sub_children.len(), 2); // task1.md, task2.md
        assert_eq!(sub_children[0].name, "task1.md");
        assert_eq!(sub_children[0].is_dir, false);

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
}
