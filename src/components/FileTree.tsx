import { useState, useEffect, useRef, useCallback } from "react";
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
  X,
} from "lucide-react";
import { FileNode } from "../types";

function treeContainsPath(node: FileNode, target: string): boolean {
  return (
    node.path === target || Boolean(node.children?.some((child) => treeContainsPath(child, target)))
  );
}

function directoryPaths(node: FileNode): string[] {
  if (!node.is_dir) return [];
  return [node.path, ...(node.children?.flatMap(directoryPaths) ?? [])];
}

// Extends types.ts if needed, but we can declare local interface first for reliability
export interface FileNodeLocal {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileNodeLocal[];
}

interface FileTreeProps {
  node: FileNode;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  onCreateFile?: (parentPath: string, name: string) => Promise<void>;
  onCreateFolder?: (parentPath: string, name: string) => Promise<void>;
  onRename?: (oldPath: string, newPath: string, node: FileNode) => Promise<void>;
  onDelete?: (path: string) => Promise<void>;
  readOnly?: boolean;
  collapseAllTrigger?: number;
  initialOpen?: boolean;
  initialEditMode?: "rename" | "create_file" | "create_dir" | null;
  expandedPaths?: string[];
  onExpandedPathsChange?: (paths: string[]) => void;
  revealPath?: string | null;
}

export interface FileTreePropsLocal {
  node: FileNode;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  readOnly?: boolean;
  collapseAllTrigger?: number;
}

export function FileTree({
  node,
  selectedPath,
  onSelectFile,
  onCreateFile,
  onCreateFolder,
  onRename,
  onDelete,
  readOnly = false,
  collapseAllTrigger = 0,
  initialOpen = false,
  initialEditMode = null,
  expandedPaths,
  onExpandedPathsChange,
  revealPath = null,
}: FileTreeProps) {
  const [localOpen, setLocalOpen] = useState<boolean>(initialOpen);
  const lastRevealedPath = useRef<string | null>(null);
  const lastCollapseTrigger = useRef(collapseAllTrigger);
  const isOpen = expandedPaths ? expandedPaths.includes(node.path) : localOpen;
  const changeExpanded = useCallback(
    (open: boolean) => {
      const currentlyOpen = expandedPaths ? expandedPaths.includes(node.path) : localOpen;
      if (currentlyOpen === open) return;
      if (expandedPaths && onExpandedPathsChange) {
        onExpandedPathsChange(
          open
            ? [...new Set([...expandedPaths, node.path])]
            : expandedPaths.filter((path) => path !== node.path),
        );
      } else {
        setLocalOpen(open);
      }
    },
    [expandedPaths, localOpen, onExpandedPathsChange, node.path],
  );

  useEffect(() => {
    if (!revealPath) {
      lastRevealedPath.current = null;
      return;
    }
    if (
      revealPath !== lastRevealedPath.current &&
      node.is_dir &&
      node.children?.some((child) => treeContainsPath(child, revealPath))
    ) {
      lastRevealedPath.current = revealPath;
      changeExpanded(true);
    }
  }, [changeExpanded, node.children, node.is_dir, revealPath]);

  // Collapse folders on global collapse trigger
  useEffect(() => {
    if (
      collapseAllTrigger > 0 &&
      collapseAllTrigger !== lastCollapseTrigger.current &&
      node.is_dir
    ) {
      lastCollapseTrigger.current = collapseAllTrigger;
      if (expandedPaths !== undefined && onExpandedPathsChange) {
        const pathsToCollapse = new Set(directoryPaths(node));
        onExpandedPathsChange(expandedPaths.filter((path) => !pathsToCollapse.has(path)));
      } else {
        changeExpanded(false);
      }
    }
  }, [changeExpanded, collapseAllTrigger, expandedPaths, node, onExpandedPathsChange]);

  // Inline input editor state for renaming or adding
  const [editMode, setEditMode] = useState<"rename" | "create_file" | "create_dir" | null>(
    initialEditMode,
  );
  const [inputText, setInputText] = useState<string>(initialEditMode === "rename" ? node.name : "");

  const isSelected = selectedPath === node.path;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.is_dir) {
      changeExpanded(!isOpen);
    } else {
      onSelectFile(node.path);
    }
  };

  const handleAction = async (
    e: React.MouseEvent,
    type: "rename" | "create_file" | "create_dir",
  ) => {
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
        await onRename(node.path, newPath, node);
      } else if (editMode === "create_file" && onCreateFile) {
        await onCreateFile(node.path, inputText.trim());
        changeExpanded(true); // Ensure expanded to show new file
      } else if (editMode === "create_dir" && onCreateFolder) {
        await onCreateFolder(node.path, inputText.trim());
        changeExpanded(true); // Ensure expanded to show new directory
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
            isOpen ? (
              <FolderOpen size={16} color="#a78bfa" />
            ) : (
              <Folder size={16} color="#a78bfa" />
            )
          ) : (
            <FileText size={16} color="#9ca3af" />
          )}
        </span>

        {editMode ? (
          <form
            className="file-tree-edit-form"
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="file-tree-input"
              autoFocus
              onBlur={() => setEditMode(null)}
              placeholder={
                editMode === "rename"
                  ? "New name"
                  : editMode === "create_file"
                    ? "New note.md"
                    : "New folder"
              }
            />
            <button type="submit" className="file-tree-edit-btn success">
              <Check size={10} />
            </button>
            <button
              type="button"
              className="file-tree-edit-btn cancel"
              onClick={() => setEditMode(null)}
            >
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
                  onClick={(e) => handleAction(e, "create_file")}
                  title="New Markdown Note"
                  className="file-action-btn"
                >
                  <FilePlus size={12} />
                </button>
                <button
                  onClick={(e) => handleAction(e, "create_dir")}
                  title="New Folder"
                  className="file-action-btn"
                >
                  <FolderPlus size={12} />
                </button>
              </>
            )}
            <button
              onClick={(e) => handleAction(e, "rename")}
              title="Rename"
              className="file-action-btn"
            >
              <Edit2 size={12} />
            </button>
            <button onClick={handleDeleteClick} title="Delete" className="file-action-btn trash">
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
              collapseAllTrigger={
                expandedPaths !== undefined && onExpandedPathsChange ? 0 : collapseAllTrigger
              }
              expandedPaths={expandedPaths}
              onExpandedPathsChange={onExpandedPathsChange}
              revealPath={revealPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}
