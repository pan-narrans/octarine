import { useState, type FormEvent, type ReactNode } from "react";
import {
  Calendar,
  Check,
  CheckCircle2,
  Hash,
  Inbox,
  Layers,
  Loader2,
  Pencil,
  Tag,
  X,
} from "lucide-react";
import type { CustomView } from "../../types";

interface ProjectNode {
  name: string;
  fullPath: string;
  children: Record<string, ProjectNode>;
}

interface SidebarNavigationProps {
  selectedSection: string;
  activeFilePath: string | null;
  customViews: CustomView[];
  projects: string[];
  contexts: string[];
  tags: string[];
  onSelectSection: (section: string, filter?: string) => void;
  onRenameProject?: (sourceProject: string, destinationProject: string) => Promise<void> | void;
  beforeCollections?: ReactNode;
  footer?: ReactNode;
}

function buildProjectTree(flatProjects: string[]) {
  const root: Record<string, ProjectNode> = {};

  for (const path of flatProjects) {
    const parts = path.split("/");
    let current = root;
    let currentPath = "";

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      current[part] ??= { name: part, fullPath: currentPath, children: {} };
      current = current[part].children;
    }
  }

  return root;
}

export function SidebarNavigation({
  selectedSection,
  activeFilePath,
  customViews,
  projects,
  contexts,
  tags,
  onSelectSection,
  onRenameProject,
  beforeCollections,
  footer,
}: SidebarNavigationProps) {
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [renamingProject, setRenamingProject] = useState(false);
  const projectTree = buildProjectTree(projects);
  const isActive = (section: string) => activeFilePath === null && selectedSection === section;

  const startProjectRename = (node: ProjectNode) => {
    setEditingProject(node.fullPath);
    setProjectNameDraft(node.name);
  };

  const cancelProjectRename = () => {
    if (renamingProject) return;
    setEditingProject(null);
    setProjectNameDraft("");
  };

  const submitProjectRename = async (event: FormEvent, node: ProjectNode) => {
    event.preventDefault();
    event.stopPropagation();
    const nextSegment = projectNameDraft.trim();
    if (!onRenameProject || !nextSegment || nextSegment === node.name || renamingProject) return;
    const parent = node.fullPath.includes("/")
      ? node.fullPath.slice(0, node.fullPath.lastIndexOf("/"))
      : "";
    const destination = parent ? `${parent}/${nextSegment}` : nextSegment;
    setRenamingProject(true);
    try {
      await onRenameProject(node.fullPath, destination);
      setEditingProject(null);
      setProjectNameDraft("");
    } catch {
      return;
    } finally {
      setRenamingProject(false);
    }
  };

  const renderProjectNode = (node: ProjectNode, level = 0): ReactNode => {
    const childNodes = Object.values(node.children);

    return (
      <div key={node.fullPath} style={{ display: "flex", flexDirection: "column" }}>
        <li
          className={`sidebar-item ${isActive(`proj:${node.fullPath}`) ? "active" : ""}`}
          onClick={() =>
            editingProject !== node.fullPath && onSelectSection(`proj:${node.fullPath}`)
          }
          style={{ paddingLeft: `${Math.min(level * 10 + 8, 48)}px`, fontSize: "0.82rem" }}
        >
          <span
            style={{
              marginRight: "0.4rem",
              opacity: 0.6,
              fontSize: "0.75rem",
              fontFamily: "monospace",
            }}
          >
            +
          </span>
          {editingProject === node.fullPath ? (
            <form
              className="sidebar-project-rename"
              onClick={(event) => event.stopPropagation()}
              onSubmit={(event) => void submitProjectRename(event, node)}
            >
              <input
                aria-label={`New name for +${node.fullPath}`}
                value={projectNameDraft}
                onChange={(event) => setProjectNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") cancelProjectRename();
                }}
                autoFocus
                disabled={renamingProject}
              />
              <button
                type="submit"
                aria-label={`Confirm rename of +${node.fullPath}`}
                disabled={
                  renamingProject ||
                  !projectNameDraft.trim() ||
                  projectNameDraft.trim() === node.name
                }
              >
                {renamingProject ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Check size={12} />
                )}
              </button>
              <button
                type="button"
                aria-label={`Cancel rename of +${node.fullPath}`}
                onClick={cancelProjectRename}
                disabled={renamingProject}
              >
                <X size={12} />
              </button>
            </form>
          ) : (
            <>
              <span className="sidebar-project-name">{node.name}</span>
              {onRenameProject && (
                <button
                  type="button"
                  className="sidebar-project-rename-trigger"
                  aria-label={`Rename +${node.fullPath}`}
                  title={`Rename +${node.fullPath}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    startProjectRename(node);
                  }}
                >
                  <Pencil size={12} />
                </button>
              )}
            </>
          )}
        </li>
        {childNodes.map((child) => renderProjectNode(child, level + 1))}
      </div>
    );
  };

  return (
    <aside className="sidebar" aria-label="Octarine navigation">
      <h2>
        Octarine <span>🌌</span>
      </h2>

      <div className="sidebar-section">
        <h4>Smart Views</h4>
        <ul className="sidebar-list">
          <li
            className={`sidebar-item ${isActive("all") ? "active" : ""}`}
            onClick={() => onSelectSection("all")}
          >
            <Inbox size={16} /> All Tasks
          </li>
          <li
            className={`sidebar-item ${isActive("todo") ? "active" : ""}`}
            onClick={() => onSelectSection("todo")}
          >
            <CheckCircle2 size={16} color="#9ca3af" /> Not Started
          </li>
          <li
            className={`sidebar-item ${isActive("doing") ? "active" : ""}`}
            onClick={() => onSelectSection("doing")}
          >
            <Loader2 size={16} className="animate-spin" color="#a78bfa" /> In Progress
          </li>
          <li
            className={`sidebar-item ${isActive("events") ? "active" : ""}`}
            onClick={() => onSelectSection("events")}
          >
            <Calendar size={16} color="#818cf8" /> Schedule Events
          </li>
        </ul>
      </div>

      {beforeCollections}

      {customViews.length > 0 && (
        <div className="sidebar-section">
          <h4>Custom Query Dashboards</h4>
          <ul className="sidebar-list">
            {customViews.map((view) => {
              const filterLine = view.query_raw
                .split("\n")
                .find((line) => line.trim().startsWith("filter:"));
              const filter = filterLine
                ? filterLine.trim().slice("filter:".length).trim().replace(/"/g, "")
                : "";

              return (
                <li
                  key={`${view.title}-${view.line_number}`}
                  className={`sidebar-item ${isActive(`view:${view.title}`) ? "active" : ""}`}
                  onClick={() => onSelectSection(`view:${view.title}`, filter)}
                >
                  <Layers size={16} /> {view.title}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {projects.length > 0 && (
        <div className="sidebar-section">
          <h4>Projects</h4>
          <ul className="sidebar-list">
            {Object.values(projectTree).map((node) => renderProjectNode(node))}
          </ul>
        </div>
      )}

      {contexts.length > 0 && (
        <div className="sidebar-section">
          <h4>Contexts</h4>
          <ul className="sidebar-list">
            {contexts.map((context) => (
              <li
                key={context}
                className={`sidebar-item ${isActive(`ctx:${context}`) ? "active" : ""}`}
                onClick={() => onSelectSection(`ctx:${context}`)}
              >
                <Tag size={16} /> @{context}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tags.length > 0 && (
        <div className="sidebar-section">
          <h4>Tags</h4>
          <ul className="sidebar-list">
            {tags.map((tag) => (
              <li
                key={tag}
                className={`sidebar-item ${isActive(`tag:${tag}`) ? "active" : ""}`}
                onClick={() => onSelectSection(`tag:${tag}`)}
              >
                <Hash size={16} /> #{tag}
              </li>
            ))}
          </ul>
        </div>
      )}

      {footer}
    </aside>
  );
}
