import { useState } from "react";
import { 
  Folder, 
  FolderOpen, 
  FileText, 
  FilePlus, 
  FolderPlus, 
  Edit2, 
  Trash2, 
  ChevronRight, 
  ChevronDown,
  Check,
  X
} from "lucide-react";
import { FileNode } from "../types";

// Extends types.ts if needed, but we can declare local interface first for reliability
export interface FileNodeLocal {
  name: String;
  path: String;
  is_dir: boolean;
  children?: FileNodeLocal[];
}

interface FileTreeProps {
  node: FileNode;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  onCreateFile?: (parentPath: string, name: string) => Promise<void>;
  onCreateFolder?: (parentPath: string, name: string) => Promise<void>;
  onRename?: (oldPath: string, newPath: string) => Promise<void>;
  onDelete?: (path: string) => Promise<void>;
  readOnly?: boolean;
}

export function FileTree({ 
  node, 
  selectedPath, 
  onSelectFile, 
  onCreateFile, 
  onCreateFolder, 
  onRename, 
  onDelete,
  readOnly = false
}: FileTreeProps) {
  const [isOpen, setIsOpen] = useState<boolean>(true);
  
  // Inline input editor state for renaming or adding
  const [editMode, setEditMode] = useState<"rename" | "create_file" | "create_dir" | null>(null);
  const [inputText, setInputText] = useState<string>("");

  const isSelected = selectedPath === node.path;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.is_dir) {
      setIsOpen(!isOpen);
    } else {
      onSelectFile(node.path);
    }
  };

  const handleAction = async (e: React.MouseEvent, type: "rename" | "create_file" | "create_dir") => {
    e.stopPropagation();
    setEditMode(type);
    if (type === "rename") {
      setInputText(node.name);
    } else {
      setInputText("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!inputText.trim()) return;

    try {
      if (editMode === "rename" && onRename) {
        const parentParts = node.path.split("/");
        parentParts.pop();
        const newPath = [...parentParts, inputText.trim()].join("/");
        await onRename(node.path, newPath);
      } else if (editMode === "create_file" && onCreateFile) {
        await onCreateFile(node.path, inputText.trim());
        setIsOpen(true); // Ensure expanded to show new file
      } else if (editMode === "create_dir" && onCreateFolder) {
        await onCreateFolder(node.path, inputText.trim());
        setIsOpen(true); // Ensure expanded to show new directory
      }
      setEditMode(null);
    } catch (err) {
      console.error("Action failed:", err);
    }
  };

  const handleDeleteClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const label = node.is_dir ? "folder and all its contents" : "note";
    if (confirm(`Are you sure you want to delete this ${label}?\n${node.name}`)) {
      try {
        if (onDelete) {
          await onDelete(node.path);
        }
      } catch (err) {
        console.error("Delete failed:", err);
      }
    }
  };

  return (
    <div className="file-tree-node">
      {/* Node Row */}
      <div 
        className={`file-tree-row ${isSelected ? "selected" : ""} ${node.is_dir ? "dir" : "file"}`}
        onClick={handleToggle}
      >
        {node.is_dir ? (
          <span className="file-tree-arrow">
            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        ) : (
          <span className="file-tree-arrow-spacer" />
        )}

        <span className="file-tree-icon">
          {node.is_dir ? (
            isOpen ? <FolderOpen size={16} color="#a78bfa" /> : <Folder size={16} color="#a78bfa" />
          ) : (
            <FileText size={16} color="#9ca3af" />
          )}
        </span>

        {editMode ? (
          <form className="file-tree-edit-form" onSubmit={handleSubmit} onClick={e => e.stopPropagation()}>
            <input 
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              className="file-tree-input"
              autoFocus
              onBlur={() => setEditMode(null)}
              placeholder={editMode === "rename" ? "New name" : editMode === "create_file" ? "New note.md" : "New folder"}
            />
            <button type="submit" className="file-tree-edit-btn success">
              <Check size={10} />
            </button>
            <button type="button" className="file-tree-edit-btn cancel" onClick={() => setEditMode(null)}>
              <X size={10} />
            </button>
          </form>
        ) : (
          <span className="file-tree-name">{node.name}</span>
        )}

        {/* Action icons shown on hover */}
        {!editMode && !readOnly && (
          <div className="file-tree-actions">
            {node.is_dir && (
              <>
                <button 
                  onClick={e => handleAction(e, "create_file")} 
                  title="New Markdown Note"
                  className="file-action-btn"
                >
                  <FilePlus size={12} />
                </button>
                <button 
                  onClick={e => handleAction(e, "create_dir")} 
                  title="New Folder"
                  className="file-action-btn"
                >
                  <FolderPlus size={12} />
                </button>
              </>
            )}
            <button 
              onClick={e => handleAction(e, "rename")} 
              title="Rename"
              className="file-action-btn"
            >
              <Edit2 size={12} />
            </button>
            <button 
              onClick={handleDeleteClick} 
              title="Delete"
              className="file-action-btn trash"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Render children if directory and open */}
      {node.is_dir && isOpen && node.children && (
        <div className="file-tree-children">
          {node.children.map((child, index) => (
            <FileTree 
              key={`${child.path}-${index}`}
              node={child}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
              onCreateFile={onCreateFile}
              onCreateFolder={onCreateFolder}
              onRename={onRename}
              onDelete={onDelete}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}
    </div>
  );
}
