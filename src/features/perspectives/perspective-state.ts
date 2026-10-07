import { create } from "zustand";
import type { PerspectiveDefinition, PerspectiveModuleUiState } from "./model";

export function perspectiveModuleStateKey(
  workspaceId: string,
  perspectiveId: string,
  instanceId: string,
): string {
  return [workspaceId, perspectiveId, instanceId].map(encodeURIComponent).join("::");
}

export function initialPerspectiveModuleUiState(type: string): PerspectiveModuleUiState {
  return type === "file-tree" ? { collapsed: true, expandedPaths: [] } : {};
}

interface PerspectiveUiStore {
  modules: Record<string, PerspectiveModuleUiState>;
  patchModule: (key: string, patch: Partial<PerspectiveModuleUiState>) => void;
}

export const usePerspectiveUiStore = create<PerspectiveUiStore>((set) => ({
  modules: {},
  patchModule: (key, patch) =>
    set((state) => ({
      modules: {
        ...state.modules,
        [key]: { ...state.modules[key], ...patch },
      },
    })),
}));

export const PERSPECTIVE_SELECTION_KEY_PREFIX = "octarine:selected-perspective:";

function perspectiveSelectionKey(vaultPath: string): string {
  return `${PERSPECTIVE_SELECTION_KEY_PREFIX}${encodeURIComponent(vaultPath)}`;
}

export interface PerspectiveSelectionResult {
  id: string;
  warning: string | null;
}

export function readSelectedPerspective(
  storage: Pick<Storage, "getItem">,
  vaultPath: string,
  perspectives: readonly PerspectiveDefinition[],
): PerspectiveSelectionResult {
  const fallbackId = perspectives[0]?.id ?? "default";
  try {
    const selectedId = storage.getItem(perspectiveSelectionKey(vaultPath));
    if (selectedId === null) return { id: fallbackId, warning: null };
    if (perspectives.some((perspective) => perspective.id === selectedId)) {
      return { id: selectedId, warning: null };
    }
    return {
      id: fallbackId,
      warning: `Saved Perspective '${selectedId}' is unavailable. Switched to '${fallbackId}'.`,
    };
  } catch {
    return {
      id: fallbackId,
      warning: "Saved Perspective could not be read. Using the default Perspective.",
    };
  }
}

export function writeSelectedPerspective(
  storage: Pick<Storage, "setItem">,
  vaultPath: string,
  perspectiveId: string,
): string | null {
  try {
    storage.setItem(perspectiveSelectionKey(vaultPath), perspectiveId);
    return null;
  } catch {
    return "Active Perspective could not be saved on this device.";
  }
}

export function resolveActivePerspective(
  perspectives: readonly PerspectiveDefinition[],
  selectedId: string,
): { perspective: PerspectiveDefinition | null; error: string | null } {
  const active = perspectives.find((perspective) => perspective.id === selectedId);
  if (active) return { perspective: active, error: null };
  return {
    perspective: perspectives[0] ?? null,
    error: perspectives.length
      ? `Active Perspective '${selectedId}' is unavailable. Using '${perspectives[0].id}'.`
      : "No valid Perspective is available.",
  };
}

export type PerspectiveNavigationDirection = "next" | "previous";

export function adjacentPerspectiveId(
  perspectives: readonly PerspectiveDefinition[],
  selectedId: string,
  direction: PerspectiveNavigationDirection,
): string {
  if (perspectives.length === 0) return selectedId;
  const currentIndex = perspectives.findIndex((perspective) => perspective.id === selectedId);
  const baseIndex = currentIndex < 0 ? 0 : currentIndex;
  const offset = direction === "next" ? 1 : -1;
  return perspectives[(baseIndex + offset + perspectives.length) % perspectives.length].id;
}

export interface PerspectiveShortcutEvent {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export function perspectiveDirectionForShortcut(
  event: PerspectiveShortcutEvent,
): PerspectiveNavigationDirection | null {
  if (!(event.metaKey || event.ctrlKey) || !event.altKey || event.shiftKey) return null;
  if (event.key === "ArrowRight") return "next";
  if (event.key === "ArrowLeft") return "previous";
  return null;
}
