import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Calendar,
  Check,
  CheckCircle2,
  Eye,
  Hash,
  Inbox,
  Layers,
  Loader2,
  Pencil,
  Tag,
  X,
} from "lucide-react";
import type { CustomView } from "../../types";

interface SelectionProps {
  selectedSection: string;
  activeFilePath: string | null;
  onSelectSection: (section: string, filter?: string) => void;
}

function sectionIsActive(selectedSection: string, activeFilePath: string | null, section: string) {
  return activeFilePath === null && selectedSection === section;
}

export function SmartViewsSidebarModule({
  selectedSection,
  activeFilePath,
  onSelectSection,
}: SelectionProps) {
  const isActive = (section: string) => sectionIsActive(selectedSection, activeFilePath, section);

  return (
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
  );
}

interface CustomViewsProps extends SelectionProps {
  customViews: CustomView[];
}

export function CustomViewsSidebarModule({
  selectedSection,
  activeFilePath,
  onSelectSection,
  customViews,
}: CustomViewsProps) {
  const isActive = (section: string) => sectionIsActive(selectedSection, activeFilePath, section);

  if (customViews.length === 0) return null;

  return (
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
  );
}

interface ProjectNode {
  name: string;
  fullPath: string;
  children: Record<string, ProjectNode>;
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

interface ProjectTreeProps extends SelectionProps {
  projects: string[];
  projectCatalogSize: number;
  showInactiveProjects: boolean;
  onShowInactiveProjectsChange: (showInactiveProjects: boolean) => void;
  onRenameProject?: (sourceProject: string, destinationProject: string) => Promise<void> | void;
}

export function ProjectTreeSidebarModule({
  selectedSection,
  activeFilePath,
  onSelectSection,
  projects,
  projectCatalogSize,
  showInactiveProjects,
  onShowInactiveProjectsChange,
  onRenameProject,
}: ProjectTreeProps) {
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [renamingProject, setRenamingProject] = useState(false);
  const renderedProjects = useAnimatedProjects(projects);
  const projectTree = useMemo(() => buildProjectTree(renderedProjects), [renderedProjects]);
  const visibleProjectPaths = useMemo(() => buildProjectPathSet(projects), [projects]);
  const isActive = (section: string) => sectionIsActive(selectedSection, activeFilePath, section);

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

  const renderProjectNode = (node: ProjectNode, level = 0): React.ReactNode => {
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
              editingProject !== node.fullPath && onSelectSection(`proj:${node.fullPath}`)
            }
            style={{
              paddingLeft: `calc(min(${level} * var(--workspace-project-indent) + var(--workspace-project-indent-start), 48px))`,
              fontSize: "var(--workspace-project-font-size)",
            }}
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
                      setEditingProject(node.fullPath);
                      setProjectNameDraft(node.name);
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

  if (projectCatalogSize === 0) return null;

  return (
    <div className="sidebar-section">
      <div className="sidebar-section-heading">
        <h4>Projects</h4>
        <button
          type="button"
          className={`sidebar-project-visibility-toggle ${showInactiveProjects ? "active" : ""}`}
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
  );
}

interface CollectionSidebarProps extends SelectionProps {
  values: string[];
}

export function ContextsSidebarModule(props: CollectionSidebarProps) {
  return <StringCollectionSidebarModule {...props} kind="context" />;
}

export function TagsSidebarModule(props: CollectionSidebarProps) {
  return <StringCollectionSidebarModule {...props} kind="tag" />;
}

function StringCollectionSidebarModule({
  selectedSection,
  activeFilePath,
  onSelectSection,
  values,
  kind,
}: CollectionSidebarProps & { kind: "context" | "tag" }) {
  if (values.length === 0) return null;
  const title = kind === "context" ? "Contexts" : "Tags";
  const sectionPrefix = kind === "context" ? "ctx:" : "tag:";

  return (
    <div className="sidebar-section">
      <h4>{title}</h4>
      <ul className="sidebar-list">
        {values.map((value) => (
          <li
            key={value}
            className={`sidebar-item ${
              sectionIsActive(selectedSection, activeFilePath, `${sectionPrefix}${value}`)
                ? "active"
                : ""
            }`}
            onClick={() => onSelectSection(`${sectionPrefix}${value}`)}
          >
            {kind === "context" ? <Tag size={16} /> : <Hash size={16} />}
            {kind === "context" ? `@${value}` : `#${value}`}
          </li>
        ))}
      </ul>
    </div>
  );
}
