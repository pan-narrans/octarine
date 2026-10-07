import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileNode } from "../../types";
import type { PerspectiveWorkspaceRoot } from "../../generated/ipc/PerspectiveWorkspaceRoot";
import type { PerspectiveWorkspaceRoots } from "../../generated/ipc/PerspectiveWorkspaceRoots";
import { invalidatePerspectiveTreeCache, readCachedPerspectiveTree } from "./tree-cache";
import {
  getPerspectiveConfigText,
  getPerspectiveWorkspaceRoots,
  readPerspectiveTree,
} from "../workspace/ipc";
import { BUILT_IN_PERSPECTIVE } from "./default";
import {
  loadPerspectiveConfiguration,
  type PerspectiveDefinition,
  type PerspectiveRootId,
} from "./model";
import { PERSPECTIVE_MODULE_REGISTRY } from "./registry";
import {
  readSelectedPerspective,
  resolveActivePerspective,
  writeSelectedPerspective,
} from "./perspective-state";
import { usePerspectiveSwitching } from "./use-perspective-switching";

const validatedBuiltIn = loadPerspectiveConfiguration(
  null,
  PERSPECTIVE_MODULE_REGISTRY,
  BUILT_IN_PERSPECTIVE,
).perspectives[0];
if (!validatedBuiltIn) throw new Error("Built-in Perspective configuration has no default entry.");

function rootPathsFromDto(
  roots: PerspectiveWorkspaceRoots,
): Record<PerspectiveRootId, string | null> {
  return {
    vault: roots.vault,
    journal: roots.journal,
    projects: roots.projects,
  };
}

function getLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export interface PerspectiveRuntime {
  perspectives: PerspectiveDefinition[];
  activePerspective: PerspectiveDefinition;
  activePerspectiveId: string;
  rootPaths: ReturnType<typeof rootPathsFromDto>;
  workspaceRootsLoaded: boolean;
  errors: string[];
  loading: boolean;
  switchPerspective: (id: string) => void;
  nextPerspective: () => void;
  previousPerspective: () => void;
  readTree: (root: PerspectiveWorkspaceRoot) => Promise<FileNode>;
  refreshWorkspaceRoots: () => Promise<void>;
  refreshConfiguration: () => Promise<void>;
  configurationRefreshing: boolean;
}

function firstPerspective(perspectives: PerspectiveDefinition[]): PerspectiveDefinition {
  const perspective = perspectives[0];
  if (!perspective) throw new Error("Built-in Perspective configuration has no entries.");
  return perspective;
}

export function usePerspectiveRuntime(workspaceId: string | null): PerspectiveRuntime {
  const [perspectives, setPerspectives] = useState<PerspectiveDefinition[]>([validatedBuiltIn]);
  const perspectivesRef = useRef<PerspectiveDefinition[]>([validatedBuiltIn]);
  const [activePerspectiveId, setActivePerspectiveId] = useState(validatedBuiltIn.id);
  const [rootPaths, setRootPaths] = useState<ReturnType<typeof rootPathsFromDto>>({
    vault: null,
    journal: null,
    projects: null,
  });
  const [workspaceRootsLoadedState, setWorkspaceRootsLoaded] = useState(false);
  const [rootsWorkspaceId, setRootsWorkspaceId] = useState<string | null>(null);
  const [configurationErrors, setConfigurationErrors] = useState<string[]>([]);
  const [workspaceRootError, setWorkspaceRootError] = useState<string | null>(null);
  const [preferenceErrors, setPreferenceErrors] = useState<string[]>([]);
  const [commandErrors, setCommandErrors] = useState<string[]>([]);
  const [configurationWorkspaceId, setConfigurationWorkspaceId] = useState<string | null>(null);
  const [loadingState, setLoading] = useState(true);
  const [configurationRefreshing, setConfigurationRefreshing] = useState(false);
  const [rootRefreshVersion, setRootRefreshVersion] = useState(0);
  const configurationRequestVersion = useRef(0);
  const configurationWorkspaceRef = useRef<string | null>(null);
  const configurationRefreshInProgress = useRef(false);
  const hydratedPreferenceWorkspaceRef = useRef<string | null>(null);
  const activeWorkspaceRef = useRef(workspaceId);
  activeWorkspaceRef.current = workspaceId;

  useEffect(() => {
    if (workspaceId !== null) invalidatePerspectiveTreeCache(workspaceId);
  }, [workspaceId]);

  useEffect(() => {
    const firstLoadForWorkspace = configurationWorkspaceRef.current !== workspaceId;
    configurationWorkspaceRef.current = workspaceId;
    const requestVersion = ++configurationRequestVersion.current;
    let current = true;
    if (firstLoadForWorkspace) {
      hydratedPreferenceWorkspaceRef.current = null;
      configurationRefreshInProgress.current = false;
      setConfigurationRefreshing(false);
      setLoading(true);
      perspectivesRef.current = [validatedBuiltIn];
      setPerspectives([validatedBuiltIn]);
      setActivePerspectiveId(validatedBuiltIn.id);
      setConfigurationErrors([]);
      setPreferenceErrors([]);
      setCommandErrors([]);
      setConfigurationWorkspaceId(null);
    }
    if (workspaceId === null) {
      configurationWorkspaceRef.current = null;
      setLoading(false);
      return () => {
        current = false;
        if (configurationRequestVersion.current === requestVersion) {
          configurationRequestVersion.current += 1;
        }
      };
    }
    if (firstLoadForWorkspace) {
      setRootPaths({ vault: null, journal: null, projects: null });
      setWorkspaceRootsLoaded(false);
    }
    getPerspectiveConfigText()
      .then((rawText) => {
        if (!current || requestVersion !== configurationRequestVersion.current) return;
        const loaded = loadPerspectiveConfiguration(
          rawText,
          PERSPECTIVE_MODULE_REGISTRY,
          BUILT_IN_PERSPECTIVE,
        );
        perspectivesRef.current = loaded.perspectives;
        setPerspectives(loaded.perspectives);
        setActivePerspectiveId((activeId) =>
          loaded.perspectives.some((perspective) => perspective.id === activeId)
            ? activeId
            : firstPerspective(loaded.perspectives).id,
        );
        setConfigurationErrors(loaded.errors);
      })
      .catch((error: unknown) => {
        if (!current || requestVersion !== configurationRequestVersion.current) return;
        if (firstLoadForWorkspace) {
          perspectivesRef.current = [validatedBuiltIn];
          setPerspectives([validatedBuiltIn]);
          setActivePerspectiveId(validatedBuiltIn.id);
        }
        setConfigurationErrors([
          `Perspective configuration could not be loaded: ${error instanceof Error ? error.message : String(error)}`,
        ]);
      })
      .finally(() => {
        if (!current || requestVersion !== configurationRequestVersion.current) return;
        configurationWorkspaceRef.current = workspaceId;
        setConfigurationWorkspaceId(workspaceId);
        setLoading(false);
      });
    return () => {
      current = false;
      configurationRequestVersion.current += 1;
      configurationRefreshInProgress.current = false;
    };
  }, [workspaceId]);

  useEffect(() => {
    let current = true;
    setWorkspaceRootError(null);
    setWorkspaceRootsLoaded(false);
    setRootsWorkspaceId(null);
    if (workspaceId === null) {
      setRootPaths({ vault: null, journal: null, projects: null });
      return () => {
        current = false;
      };
    }
    getPerspectiveWorkspaceRoots()
      .then((roots) => {
        if (current) setRootPaths(rootPathsFromDto(roots));
      })
      .catch((error: unknown) => {
        if (!current) return;
        setRootPaths({ vault: null, journal: null, projects: null });
        setWorkspaceRootError(
          `Workspace roots could not be loaded: ${error instanceof Error ? error.message : String(error)}`,
        );
      })
      .finally(() => {
        if (current) {
          setRootsWorkspaceId(workspaceId);
          setWorkspaceRootsLoaded(true);
        }
      });
    return () => {
      current = false;
    };
  }, [rootRefreshVersion, workspaceId]);

  useEffect(() => {
    if (workspaceId === null) {
      hydratedPreferenceWorkspaceRef.current = null;
      return;
    }
    if (
      configurationWorkspaceId !== workspaceId ||
      hydratedPreferenceWorkspaceRef.current === workspaceId
    ) {
      return;
    }
    hydratedPreferenceWorkspaceRef.current = workspaceId;
    const storage = getLocalStorage();
    const fallbackId = firstPerspective(perspectives).id;
    const selection = storage
      ? readSelectedPerspective(storage, workspaceId, perspectives)
      : { id: fallbackId, warning: "Saved Perspective could not be read on this device." };
    setActivePerspectiveId(selection.id);
    setPreferenceErrors(selection.warning ? [selection.warning] : []);
  }, [configurationWorkspaceId, perspectives, workspaceId]);

  const workspaceRootsLoaded =
    workspaceId !== null && rootsWorkspaceId === workspaceId && workspaceRootsLoadedState;
  const loading = workspaceId === null || configurationWorkspaceId !== workspaceId || loadingState;

  const activeResult = useMemo(
    () => resolveActivePerspective(perspectives, activePerspectiveId),
    [activePerspectiveId, perspectives],
  );
  const activePerspective = activeResult.perspective ?? firstPerspective(perspectives);
  const switchPerspective = useCallback(
    (id: string) => {
      const currentPerspectives = perspectivesRef.current;
      if (
        workspaceId === null ||
        configurationWorkspaceId !== workspaceId ||
        loadingState ||
        configurationRefreshInProgress.current
      ) {
        return;
      }
      if (!currentPerspectives.some((perspective) => perspective.id === id)) {
        setCommandErrors((current) => [...current, `Perspective ID '${id}' is unavailable.`]);
        return;
      }
      setActivePerspectiveId(id);
      const storage = getLocalStorage();
      if (!storage) {
        setPreferenceErrors(["Active Perspective could not be saved on this device."]);
        return;
      }
      const persistenceError = writeSelectedPerspective(storage, workspaceId, id);
      setPreferenceErrors(persistenceError ? [persistenceError] : []);
    },
    [configurationWorkspaceId, loadingState, workspaceId],
  );
  const commands = usePerspectiveSwitching(
    perspectives,
    activePerspectiveId,
    switchPerspective,
    (message) => setCommandErrors((current) => [...current, message]),
  );
  const readTree = useCallback(
    (root: PerspectiveWorkspaceRoot) => {
      if (workspaceId === null) {
        return Promise.reject(new Error("Perspective workspace is not ready."));
      }
      return readCachedPerspectiveTree(workspaceId, root, rootRefreshVersion, () =>
        readPerspectiveTree(root),
      );
    },
    [rootRefreshVersion, workspaceId],
  );
  const refreshWorkspaceRoots = useCallback(async () => {
    if (workspaceId === null) return;
    invalidatePerspectiveTreeCache(workspaceId);
    setWorkspaceRootsLoaded(false);
    setRootRefreshVersion((version) => version + 1);
  }, [workspaceId]);
  const refreshConfiguration = useCallback(async () => {
    if (workspaceId === null || activeWorkspaceRef.current !== workspaceId) return;
    const requestVersion = ++configurationRequestVersion.current;
    configurationRefreshInProgress.current = true;
    setConfigurationRefreshing(true);
    try {
      let rawText: string | null;
      try {
        rawText = await getPerspectiveConfigText();
      } catch (error) {
        if (
          requestVersion !== configurationRequestVersion.current ||
          activeWorkspaceRef.current !== workspaceId
        ) {
          return;
        }
        setConfigurationErrors([
          `Perspective configuration could not be loaded: ${error instanceof Error ? error.message : String(error)}`,
        ]);
        throw error;
      }
      if (
        requestVersion !== configurationRequestVersion.current ||
        activeWorkspaceRef.current !== workspaceId
      ) {
        return;
      }
      const loaded = loadPerspectiveConfiguration(
        rawText,
        PERSPECTIVE_MODULE_REGISTRY,
        BUILT_IN_PERSPECTIVE,
      );
      if (loaded.errors.length > 0) {
        setConfigurationErrors(loaded.errors);
        throw new Error(`Perspective configuration failed validation: ${loaded.errors.join(" ")}`);
      }
      perspectivesRef.current = loaded.perspectives;
      setPerspectives(loaded.perspectives);
      setActivePerspectiveId((activeId) =>
        loaded.perspectives.some((perspective) => perspective.id === activeId)
          ? activeId
          : firstPerspective(loaded.perspectives).id,
      );
      setConfigurationErrors([]);
      configurationWorkspaceRef.current = workspaceId;
      setConfigurationWorkspaceId(workspaceId);
      setLoading(false);
    } finally {
      if (
        requestVersion === configurationRequestVersion.current &&
        activeWorkspaceRef.current === workspaceId
      ) {
        configurationRefreshInProgress.current = false;
        setConfigurationRefreshing(false);
      }
    }
  }, [workspaceId]);
  const errors = [
    ...configurationErrors,
    ...(workspaceRootError ? [workspaceRootError] : []),
    ...preferenceErrors,
    ...commandErrors,
    ...(activeResult.error ? [activeResult.error] : []),
  ];

  return {
    perspectives,
    activePerspective,
    activePerspectiveId,
    rootPaths,
    workspaceRootsLoaded,
    errors: [...new Set(errors)],
    loading,
    switchPerspective,
    nextPerspective: commands.next,
    previousPerspective: commands.previous,
    readTree,
    refreshWorkspaceRoots,
    refreshConfiguration,
    configurationRefreshing,
  };
}
