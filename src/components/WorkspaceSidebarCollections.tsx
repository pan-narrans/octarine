import { BookOpen } from "lucide-react";
import { FileTree } from "./FileTree";
import type { FileNode } from "../types";

interface WorkspaceSidebarCollectionsProps {
  journalTree: FileNode | null;
  notesTree: FileNode | null;
  activeFilePath: string | null;
  journalsExpanded: boolean;
  notesExpanded: boolean;
  setupRequired: boolean;
  onToggleJournals: () => void;
  onOpenTodayJournal: () => void;
  onToggleNotes: () => void;
  onSelectFile: (path: string) => void;
  onCreateFile?: (parentPath: string, name: string) => Promise<void>;
  onCreateFolder?: (parentPath: string, name: string) => Promise<void>;
  onRename?: (oldPath: string, newPath: string, node: FileNode) => Promise<void>;
  onDelete?: (path: string) => Promise<void>;
}

export function WorkspaceSidebarCollections({
  journalTree,
  notesTree,
  activeFilePath,
  journalsExpanded,
  notesExpanded,
  setupRequired,
  onToggleJournals,
  onOpenTodayJournal,
  onToggleNotes,
  onSelectFile,
  onCreateFile,
  onCreateFolder,
  onRename,
  onDelete,
}: WorkspaceSidebarCollectionsProps) {
  return (
    <>
      <div className="sidebar-section">
        <div
          className="sidebar-collection-heading"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.25rem",
          }}
        >
          <h4 onClick={onToggleJournals} style={{ margin: 0, cursor: "pointer", flexGrow: 1 }}>
            Journals
          </h4>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <button
              onClick={(event) => {
                event.stopPropagation();
                onOpenTodayJournal();
              }}
              title={setupRequired ? "Configure journal in Task settings" : "Write Today's Entry"}
              disabled={setupRequired}
              style={{
                background: "none",
                border: "none",
                color: "var(--color-violet)",
                cursor: setupRequired ? "not-allowed" : "pointer",
                opacity: setupRequired ? 0.45 : 1,
                display: "flex",
                alignItems: "center",
                padding: 0,
              }}
            >
              <BookOpen size={14} />
            </button>
            <span
              className="sidebar-collection-toggle"
              onClick={onToggleJournals}
              style={{
                fontSize: "var(--workspace-sidebar-aux-font-size)",
                color: "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              {setupRequired ? "Setup required" : journalsExpanded ? "Collapse" : "Expand"}
            </span>
          </div>
        </div>
        {journalsExpanded && (
          <div
            style={{
              marginTop: "0.5rem",
              maxHeight: "250px",
              overflowY: "auto",
              paddingLeft: "0.15rem",
            }}
          >
            {journalTree && journalTree.children ? (
              journalTree.children.map((child, index) => (
                <FileTree
                  key={`${child.path}-${index}`}
                  node={child}
                  selectedPath={activeFilePath}
                  onSelectFile={onSelectFile}
                  readOnly
                />
              ))
            ) : (
              <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                Loading journals...
              </div>
            )}
          </div>
        )}
      </div>

      <div className="sidebar-section">
        <div
          className="sidebar-collection-heading"
          onClick={onToggleNotes}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
            marginBottom: "0.25rem",
          }}
        >
          <h4 style={{ margin: 0 }}>Notes</h4>
          <span
            className="sidebar-collection-toggle"
            style={{
              fontSize: "var(--workspace-sidebar-aux-font-size)",
              color: "var(--text-muted)",
            }}
          >
            {notesExpanded ? "Collapse" : "Expand"}
          </span>
        </div>
        {notesExpanded && (
          <div
            style={{
              marginTop: "0.5rem",
              maxHeight: "250px",
              overflowY: "auto",
              paddingLeft: "0.15rem",
            }}
          >
            {notesTree && notesTree.children ? (
              notesTree.children.map((child, index) => (
                <FileTree
                  key={`${child.path}-${index}`}
                  node={child}
                  selectedPath={activeFilePath}
                  onSelectFile={onSelectFile}
                  onCreateFile={onCreateFile}
                  onCreateFolder={onCreateFolder}
                  onRename={onRename}
                  onDelete={onDelete}
                />
              ))
            ) : (
              <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Loading notes...</div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
