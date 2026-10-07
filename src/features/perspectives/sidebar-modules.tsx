import { useEffect, useRef, useState } from "react";
import { BookOpen, Layers } from "lucide-react";
import type { FileNode } from "../../types";
import { FileTree } from "../../components/FileTree";
import {
  ContextsSidebarModule,
  CustomViewsSidebarModule,
  ProjectTreeSidebarModule,
  SmartViewsSidebarModule,
  TagsSidebarModule,
} from "../navigation/SidebarModules";
import type { PerspectiveModuleProps, PerspectiveRootId } from "./model";
import { resolveFileTreeRevealOwner } from "./file-tree-reveal";

export function SmartViewsModule({ context }: PerspectiveModuleProps) {
  return (
    <SmartViewsSidebarModule
      selectedSection={context.selectedSection}
      activeFilePath={context.activeFilePath}
      onSelectSection={context.onSelectSection}
    />
  );
}

export function CustomViewsModule({ context }: PerspectiveModuleProps) {
  return (
    <CustomViewsSidebarModule
      customViews={context.customViews}
      selectedSection={context.selectedSection}
      activeFilePath={context.activeFilePath}
      onSelectSection={context.onSelectSection}
    />
  );
}

export function ProjectTreeModule({ context }: PerspectiveModuleProps) {
  return (
    <ProjectTreeSidebarModule
      projects={context.projects}
      projectCatalogSize={context.projectCatalogSize}
      showInactiveProjects={context.showInactiveProjects}
      onShowInactiveProjectsChange={context.onShowInactiveProjectsChange}
      onRenameProject={context.onRenameProject}
      selectedSection={context.selectedSection}
      activeFilePath={context.activeFilePath}
      onSelectSection={context.onSelectSection}
    />
  );
}

export function ContextsModule({ context }: PerspectiveModuleProps) {
  return (
    <ContextsSidebarModule
      values={context.contexts}
      selectedSection={context.selectedSection}
      activeFilePath={context.activeFilePath}
      onSelectSection={context.onSelectSection}
    />
  );
}

export function TagsModule({ context }: PerspectiveModuleProps) {
  return (
    <TagsSidebarModule
      values={context.tags}
      selectedSection={context.selectedSection}
      activeFilePath={context.activeFilePath}
      onSelectSection={context.onSelectSection}
    />
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown native error.";
}

export function FileTreeModule({
  perspective,
  instance,
  context,
  uiState,
  onUiStateChange,
}: PerspectiveModuleProps) {
  const root = instance.root as PerspectiveRootId;
  const title = typeof instance.title === "string" ? instance.title : "Files";
  const isJournalCollection = instance.collection === "journal";
  const [tree, setTree] = useState<FileNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollContainer = useRef<HTMLDivElement>(null);
  const configuredRootPath = context.rootPaths[root];
  const expandedPaths = uiState.expandedPaths ?? [];
  const collapsed = uiState.collapsed ?? true;
  const activeFilePath = context.activeFilePath;
  const readTree = context.readTree;
  const workspaceRootsLoaded = context.workspaceRootsLoaded;

  useEffect(() => {
    let current = true;
    setTree(null);
    setError(null);
    setLoading(true);
    if (!workspaceRootsLoaded) {
      return () => {
        current = false;
      };
    }
    if (!configuredRootPath) {
      setError(
        `Perspective "${perspective.title}" references workspace root "${root}" which is not available.`,
      );
      setLoading(false);
      return () => {
        current = false;
      };
    }
    readTree(root)
      .then((nextTree) => {
        if (current) setTree(nextTree);
      })
      .catch((reason: unknown) => {
        if (current) {
          setError(
            `Perspective "${perspective.title}" references workspace root "${root}" which is not available. ${errorMessage(reason)}`,
          );
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [configuredRootPath, readTree, workspaceRootsLoaded, perspective.title, root]);

  useEffect(() => {
    if (scrollContainer.current) scrollContainer.current.scrollTop = uiState.scrollTop ?? 0;
  }, [collapsed, loading, tree, uiState.scrollTop]);

  const rootPath = configuredRootPath ?? tree?.path ?? null;
  const ownerId = resolveFileTreeRevealOwner(
    perspective,
    activeFilePath,
    context.activeFileSource,
    rootPath ? { ...context.rootPaths, [root]: rootPath } : context.rootPaths,
  );
  const revealPath = ownerId === instance.id ? activeFilePath : null;
  const readOnly = root === "journal";
  const unavailable = error !== null;

  useEffect(() => {
    if (!activeFilePath) {
      if (uiState.lastRevealedPath !== null) onUiStateChange({ lastRevealedPath: null });
      return;
    }
    if (ownerId !== instance.id) {
      if (uiState.lastRevealedPath !== null) onUiStateChange({ lastRevealedPath: null });
      return;
    }
    if (uiState.lastRevealedPath === activeFilePath) return;
    onUiStateChange({ collapsed: false, lastRevealedPath: activeFilePath });
  }, [activeFilePath, instance.id, onUiStateChange, ownerId, uiState.lastRevealedPath]);

  return (
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
        <h4
          onClick={() => onUiStateChange({ collapsed: !collapsed })}
          style={{ margin: 0, cursor: "pointer", flexGrow: 1 }}
        >
          {title}
        </h4>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {isJournalCollection && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                context.onOpenTodayJournal?.(instance.id);
              }}
              title={
                !configuredRootPath
                  ? "Configure journal in Task settings"
                  : unavailable
                    ? "Journal root unavailable"
                    : "Write Today's Entry"
              }
              disabled={!context.onOpenTodayJournal || (unavailable && !isJournalCollection)}
              style={{
                background: "none",
                border: "none",
                color: "var(--color-violet)",
                cursor: !context.onOpenTodayJournal ? "not-allowed" : "pointer",
                opacity: !context.onOpenTodayJournal ? 0.45 : 1,
                display: "flex",
                alignItems: "center",
                padding: 0,
              }}
            >
              <BookOpen size={14} />
            </button>
          )}
          <span
            className="sidebar-collection-toggle"
            onClick={() => onUiStateChange({ collapsed: !collapsed })}
            style={{
              fontSize: "var(--workspace-sidebar-aux-font-size)",
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            {isJournalCollection && !configuredRootPath
              ? "Setup required"
              : collapsed
                ? "Expand"
                : "Collapse"}
          </span>
        </div>
      </div>
      {(!collapsed || error !== null) && (
        <div
          ref={scrollContainer}
          onScroll={(event) => onUiStateChange({ scrollTop: event.currentTarget.scrollTop })}
          style={{
            marginTop: "0.5rem",
            maxHeight: "250px",
            overflowY: "auto",
            paddingLeft: "0.15rem",
          }}
        >
          {error ? (
            <div className="kanban-empty" role="status">
              {error}
            </div>
          ) : loading ? (
            <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
              Loading {title.toLocaleLowerCase()}...
            </div>
          ) : tree?.children?.length ? (
            tree.children.map((child, index) => (
              <FileTree
                key={`${child.path}-${index}`}
                node={child}
                selectedPath={context.activeFilePath}
                onSelectFile={(path) => context.onSelectFile(path, instance.id)}
                onCreateFile={
                  readOnly || !context.onCreateFile
                    ? undefined
                    : (parentPath, name) =>
                        context.onCreateFile?.(parentPath, name, instance.id) ?? Promise.resolve()
                }
                onCreateFolder={readOnly ? undefined : context.onCreateFolder}
                onRename={readOnly ? undefined : context.onRenameFile}
                onDelete={readOnly ? undefined : context.onDeleteFile}
                readOnly={readOnly}
                expandedPaths={expandedPaths}
                onExpandedPathsChange={(paths) => onUiStateChange({ expandedPaths: paths })}
                revealPath={revealPath}
              />
            ))
          ) : unavailable ? (
            <div className="kanban-empty" role="status">
              {error}
            </div>
          ) : (
            <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
              This workspace root has no Markdown files.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CustomQueryModule({ perspective, instance, context }: PerspectiveModuleProps) {
  const sectionId = `perspective-query:${perspective.id}:${instance.id}`;
  const title = typeof instance.title === "string" ? instance.title : "Custom query";
  const filter = typeof instance.filter === "string" ? instance.filter : "";
  const active = context.activeFilePath === null && context.selectedSection === sectionId;

  return (
    <div className="sidebar-section">
      <h4>Custom queries</h4>
      <ul className="sidebar-list">
        <li
          className={`sidebar-item ${active ? "active" : ""}`}
          onClick={() => context.onSelectSection(sectionId, filter)}
        >
          <Layers size={16} /> {title}
        </li>
      </ul>
    </div>
  );
}

export function PerspectiveSwitcherModule({ context }: PerspectiveModuleProps) {
  return (
    <div className="sidebar-section" aria-label="Perspective switcher">
      <h4>Perspectives</h4>
      <ul className="sidebar-list">
        {context.perspectives.map((perspective) => (
          <li key={perspective.id}>
            <button
              type="button"
              className={`sidebar-item ${context.activePerspectiveId === perspective.id ? "active" : ""}`}
              aria-current={context.activePerspectiveId === perspective.id ? "page" : undefined}
              onClick={() => context.onSwitchPerspective(perspective.id)}
            >
              <Layers size={16} /> {perspective.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
