import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Calendar,
  Check,
  CheckCircle2,
  Eye,
  Hash,
  Inbox,
  Layers,
  Loader2,
  Menu,
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
  projectCatalogSize: number;
  showInactiveProjects: boolean;
  contexts: string[];
  tags: string[];
  onSelectSection: (section: string, filter?: string) => void;
  onShowInactiveProjectsChange: (showInactiveProjects: boolean) => void;
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

function buildProjectPathSet(flatProjects: string[]) {
  const paths = new Set<string>();

  for (const path of flatProjects) {
    const parts = path.split("/");
    let currentPath = "";
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      paths.add(currentPath);
    }
  }

  return paths;
}

function mergeAnimatedProjectOrder(current: string[], next: string[]) {
  const merged = [...current];

  next.forEach((project, nextIndex) => {
    if (merged.includes(project)) return;
    const previousAnchor = [...next.slice(0, nextIndex)]
      .reverse()
      .find((candidate) => merged.includes(candidate));
    if (previousAnchor) {
      merged.splice(merged.indexOf(previousAnchor) + 1, 0, project);
      return;
    }
    const nextAnchor = next.slice(nextIndex + 1).find((candidate) => merged.includes(candidate));
    if (nextAnchor) {
      merged.splice(merged.indexOf(nextAnchor), 0, project);
      return;
    }
    merged.push(project);
  });

  return merged;
}

function useAnimatedProjects(projects: string[]) {
  const [renderedProjects, setRenderedProjects] = useState(projects);

  useEffect(() => {
    setRenderedProjects((current) => mergeAnimatedProjectOrder(current, projects));
    const timeout = window.setTimeout(() => setRenderedProjects(projects), 200);
    return () => window.clearTimeout(timeout);
  }, [projects]);

  return renderedProjects;
}

export function SidebarNavigation({
  selectedSection,
  activeFilePath,
  customViews,
  projects,
  projectCatalogSize,
  showInactiveProjects,
  contexts,
  tags,
  onSelectSection,
  onShowInactiveProjectsChange,
  onRenameProject,
  beforeCollections,
  footer,
}: SidebarNavigationProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [renamingProject, setRenamingProject] = useState(false);
  const renderedProjects = useAnimatedProjects(projects);
  const projectTree = useMemo(() => buildProjectTree(renderedProjects), [renderedProjects]);
  const visibleProjectPaths = useMemo(() => buildProjectPathSet(projects), [projects]);
  const isActive = (section: string) => activeFilePath === null && selectedSection === section;

  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen]);

  const selectSection = (section: string, filter?: string) => {
    setMobileOpen(false);
    onSelectSection(section, filter);
  };

  const closeAfterNavigation = (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (
      target.closest(
        ".sidebar-project-rename, .sidebar-project-rename-trigger, .file-tree-actions, .file-tree-edit-form",
      )
    ) {
      return;
    }
    if (target.closest(".sidebar-item, .file-tree-row.file")) setMobileOpen(false);
  };

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
    const isVisible = visibleProjectPaths.has(node.fullPath);

    return (
      <div
        key={node.fullPath}
        className={`sidebar-project-branch ${isVisible ? "" : "is-exiting"}`}
        data-project-path={node.fullPath}
      >
        <div className="sidebar-project-branch-content">
          <li
            className={`sidebar-item ${isActive(`proj:${node.fullPath}`) ? "active" : ""}`}
            onClick={() =>
              editingProject !== node.fullPath && selectSection(`proj:${node.fullPath}`)
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
      </div>
    );
  };

  const sidebar = (
    <aside
      id="octarine-sidebar"
      className={`sidebar ${mobileOpen ? "is-mobile-open" : ""}`}
      aria-label="Octarine navigation"
      onClickCapture={closeAfterNavigation}
    >
      <h2>
        Octarine <span>🌌</span>
      </h2>

      <div className="sidebar-section">
        <h4>Smart Views</h4>
        <ul className="sidebar-list">
          <li
            className={`sidebar-item ${isActive("all") ? "active" : ""}`}
            onClick={() => selectSection("all")}
          >
            <Inbox size={16} /> All Tasks
          </li>
          <li
            className={`sidebar-item ${isActive("todo") ? "active" : ""}`}
            onClick={() => selectSection("todo")}
          >
            <CheckCircle2 size={16} color="#9ca3af" /> Not Started
          </li>
          <li
            className={`sidebar-item ${isActive("doing") ? "active" : ""}`}
            onClick={() => selectSection("doing")}
          >
            <Loader2 size={16} className="animate-spin" color="#a78bfa" /> In Progress
          </li>
          <li
            className={`sidebar-item ${isActive("events") ? "active" : ""}`}
            onClick={() => selectSection("events")}
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
                  onClick={() => selectSection(`view:${view.title}`, filter)}
                >
                  <Layers size={16} /> {view.title}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {projectCatalogSize > 0 && (
        <div className="sidebar-section">
          <div className="sidebar-section-heading">
            <h4>Projects</h4>
            <button
              type="button"
              className={`sidebar-project-visibility-toggle ${
                showInactiveProjects ? "active" : ""
              }`}
              aria-pressed={showInactiveProjects}
              onClick={() => onShowInactiveProjectsChange(!showInactiveProjects)}
            >
              <Eye size={12} />
              Show inactive
            </button>
          </div>
          <ul className="sidebar-list sidebar-project-list">
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
                onClick={() => selectSection(`ctx:${context}`)}
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
                onClick={() => selectSection(`tag:${tag}`)}
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

  return (
    <>
      <button
        type="button"
        className="sidebar-mobile-toggle"
        aria-controls="octarine-sidebar"
        aria-expanded={mobileOpen}
        aria-label="Open navigation"
        onClick={() => setMobileOpen(true)}
      >
        <Menu size={20} />
      </button>
      {mobileOpen && (
        <button
          type="button"
          className="sidebar-mobile-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      {sidebar}
    </>
  );
}
