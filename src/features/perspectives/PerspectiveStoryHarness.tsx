import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { PerspectiveWorkspaceRoot } from "../../generated/ipc/PerspectiveWorkspaceRoot";
import { PerspectiveSidebar } from "./PerspectiveSidebar";
import { BUILT_IN_PERSPECTIVE } from "./default";
import {
  loadPerspectiveConfiguration,
  PERSPECTIVE_SCHEMA_VERSION,
  validatePerspectiveConfig,
  type PerspectiveDefinition,
  type PerspectiveModuleRuntimeContext,
} from "./model";
import { SidebarNavigation } from "../navigation/SidebarNavigation";
import { PERSPECTIVE_MODULE_REGISTRY } from "./registry";
import {
  defaultStoryRootPaths,
  perspectiveStoryCustomViews,
  perspectiveStoryTrees,
} from "./story-fixtures";
import { usePerspectiveSwitching } from "./use-perspective-switching";

const validatedBuiltIn = loadPerspectiveConfiguration(
  null,
  PERSPECTIVE_MODULE_REGISTRY,
  BUILT_IN_PERSPECTIVE,
).perspectives[0];
if (!validatedBuiltIn) throw new Error("Built-in Perspective configuration has no default entry.");
const noEmptyRoots: readonly PerspectiveWorkspaceRoot[] = [];

export interface PerspectiveStoryHarnessProps {
  perspective: PerspectiveDefinition;
  perspectives?: PerspectiveDefinition[];
  rootPaths?: Partial<Record<PerspectiveWorkspaceRoot, string | null>>;
  activeFilePath?: string | null;
  externalFileTransitions?: readonly {
    label: string;
    path: string;
    sourceInstanceId?: string;
  }[];
  emptyRoots?: readonly PerspectiveWorkspaceRoot[];
  contextOverrides?: Partial<PerspectiveModuleRuntimeContext>;
  configurationErrors?: readonly string[];
  children?: ReactNode;
}

export function PerspectiveStoryHarness({
  perspective,
  perspectives: suppliedPerspectives,
  rootPaths = defaultStoryRootPaths,
  activeFilePath: initialActiveFilePath = null,
  externalFileTransitions = [],
  emptyRoots: suppliedEmptyRoots,
  contextOverrides,
  configurationErrors,
  children,
}: PerspectiveStoryHarnessProps) {
  const perspectives = useMemo(
    () => suppliedPerspectives ?? [perspective],
    [perspective, suppliedPerspectives],
  );
  const emptyRoots = suppliedEmptyRoots ?? noEmptyRoots;
  const storyConfiguration = useMemo(
    () =>
      validatePerspectiveConfig(
        {
          version: PERSPECTIVE_SCHEMA_VERSION,
          perspectives: perspectives.some((candidate) => candidate.id === perspective.id)
            ? perspectives
            : [perspective, ...perspectives],
        },
        PERSPECTIVE_MODULE_REGISTRY,
      ),
    [perspective, perspectives],
  );
  const validatedPerspectives = useMemo(
    () => storyConfiguration.config?.perspectives ?? [validatedBuiltIn],
    [storyConfiguration.config],
  );
  const initialPerspective =
    validatedPerspectives.find((candidate) => candidate.id === perspective.id) ??
    validatedPerspectives[0] ??
    validatedBuiltIn;
  const [selectedSection, setSelectedSection] = useState("all");
  const [activeFilePath, setActiveFilePath] = useState<string | null>(initialActiveFilePath);
  const [activeFileSource, setActiveFileSource] =
    useState<PerspectiveModuleRuntimeContext["activeFileSource"]>(null);
  const [activePerspectiveId, setActivePerspectiveId] = useState(initialPerspective.id);
  const [commandErrors, setCommandErrors] = useState<string[]>([]);
  const [showInactiveProjects, setShowInactiveProjects] = useState(false);
  const activePerspective =
    validatedPerspectives.find((candidate) => candidate.id === activePerspectiveId) ??
    initialPerspective;
  const switching = usePerspectiveSwitching(
    validatedPerspectives,
    activePerspectiveId,
    setActivePerspectiveId,
    (message) => setCommandErrors((current) => [...current, message]),
  );
  const storyErrors = [
    ...(configurationErrors ?? []),
    ...storyConfiguration.errors,
    ...commandErrors,
  ];
  const onSelectSection = useCallback((section: string) => {
    setSelectedSection(section);
    setActiveFilePath(null);
    setActiveFileSource(null);
  }, []);
  const onSelectFile = useCallback(
    (path: string, instanceId: string) => {
      setActiveFilePath(path);
      setActiveFileSource({ filePath: path, perspectiveId: activePerspective.id, instanceId });
    },
    [activePerspective.id],
  );
  const readTree = useCallback(
    async (root: PerspectiveWorkspaceRoot) => {
      await Promise.resolve();
      const tree = perspectiveStoryTrees[root];
      return emptyRoots.includes(root) ? { ...tree, children: [] } : tree;
    },
    [emptyRoots],
  );
  const openTodayJournal = useCallback(() => {
    const journalInstance =
      activePerspective.sidebar.find(
        (instance) => instance.type === "file-tree" && instance.root === "journal",
      )?.id ?? "journal-files";
    onSelectFile("/octarine/vault/journals/2026-10-05.md", journalInstance);
  }, [activePerspective.sidebar, onSelectFile]);
  const context = useMemo<PerspectiveModuleRuntimeContext>(
    () => ({
      workspaceId: `storybook:${perspective.id}`,
      activePerspectiveId,
      selectedSection,
      activeFilePath,
      activeFileSource,
      customViews: perspectiveStoryCustomViews,
      projects: ["octarine", "octarine/docs", "octarine/ui", "writing/essays"],
      projectCatalogSize: 4,
      showInactiveProjects,
      contexts: ["focus", "desk", "home"],
      tags: ["planning", "writing", "review"],
      rootPaths,
      workspaceRootsLoaded: true,
      readTree,
      onSelectSection,
      onSelectFile,
      onOpenTodayJournal: openTodayJournal,
      onShowInactiveProjectsChange: setShowInactiveProjects,
      onRenameProject: async () => undefined,
      onCreateFile: async () => undefined,
      onCreateFolder: async () => undefined,
      onRenameFile: async () => undefined,
      onDeleteFile: async () => undefined,
      perspectives: validatedPerspectives,
      onSwitchPerspective: switching.switchTo,
      ...contextOverrides,
    }),
    [
      activeFilePath,
      activeFileSource,
      activePerspectiveId,
      perspective.id,
      switching.switchTo,
      contextOverrides,
      onSelectFile,
      openTodayJournal,
      onSelectSection,
      validatedPerspectives,
      readTree,
      rootPaths,
      selectedSection,
      showInactiveProjects,
    ],
  );

  return (
    <div className="perspective-story-frame">
      <SidebarNavigation
        selectedSection={context.selectedSection}
        activeFilePath={context.activeFilePath}
        customViews={context.customViews}
        projects={context.projects}
        projectCatalogSize={context.projectCatalogSize}
        showInactiveProjects={context.showInactiveProjects}
        contexts={context.contexts}
        tags={context.tags}
        onSelectSection={context.onSelectSection}
        onShowInactiveProjectsChange={context.onShowInactiveProjectsChange}
        onRenameProject={context.onRenameProject}
        contentOverride={
          <>
            <PerspectiveSidebar
              perspective={activePerspective}
              context={context}
              configurationErrors={storyErrors}
            />
            <div className="perspective-story-footer">Workspace controls stay in app chrome.</div>
          </>
        }
      />
      <main className="perspective-story-main">
        {children ?? (
          <div>
            <span className="perspective-story-eyebrow">ACTIVE PERSPECTIVE</span>
            <h1>{activePerspective.title}</h1>
            <p>Existing tasks, notes, journals, and projects stay shared across workflows.</p>
            {context.activeFilePath && (
              <p className="perspective-story-active-file">{context.activeFilePath}</p>
            )}
            {externalFileTransitions.length > 0 && (
              <div className="perspective-story-transitions" aria-label="Open files from editor">
                {externalFileTransitions.map((transition) => (
                  <button
                    key={transition.path}
                    type="button"
                    onClick={() => {
                      setActiveFilePath(transition.path);
                      setActiveFileSource(
                        transition.sourceInstanceId
                          ? {
                              filePath: transition.path,
                              perspectiveId: activePerspective.id,
                              instanceId: transition.sourceInstanceId,
                            }
                          : null,
                      );
                    }}
                  >
                    Open {transition.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
