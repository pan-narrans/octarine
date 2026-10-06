import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adjacentPerspectiveId,
  initialPerspectiveModuleUiState,
  perspectiveDirectionForShortcut,
  perspectiveModuleStateKey,
  readSelectedPerspective,
  resolveActivePerspective,
  writeSelectedPerspective,
} from "./perspective-state";
import { usePerspectiveUiStore } from "./perspective-state";
import type { PerspectiveDefinition } from "./model";
import { switchPerspectiveCommand } from "./use-perspective-switching";

const perspectives: PerspectiveDefinition[] = [
  { id: "default", title: "Workspace", sidebar: [] },
  { id: "writing", title: "Writing", sidebar: [] },
  { id: "planning", title: "Planning", sidebar: [] },
];

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
}

afterEach(() => {
  usePerspectiveUiStore.setState({ modules: {} });
});

describe("Perspective module state", () => {
  it("namespaces state by workspace, Perspective, and module instance", () => {
    const key = perspectiveModuleStateKey("/vault A", "writing", "notes/tree");

    expect(key).toBe("%2Fvault%20A::writing::notes%2Ftree");
    expect(perspectiveModuleStateKey("/vault A", "planning", "notes/tree")).not.toBe(key);
    expect(perspectiveModuleStateKey("/vault A", "writing", "journal/tree")).not.toBe(key);
    expect(perspectiveModuleStateKey("/vault B", "writing", "notes/tree")).not.toBe(key);
  });

  it("keeps same-type module instances independent and leaves configuration unchanged", () => {
    const first = Object.freeze({ id: "notes", type: "file-tree", root: "vault" });
    const second = Object.freeze({ id: "journal", type: "file-tree", root: "journal" });
    const config = Object.freeze({
      version: 1,
      perspectives: Object.freeze([
        Object.freeze({ id: "writing", title: "Writing", sidebar: Object.freeze([first, second]) }),
      ]),
    });
    const originalConfig = JSON.stringify(config);
    const firstKey = perspectiveModuleStateKey("/vault", "writing", first.id);
    const secondKey = perspectiveModuleStateKey("/vault", "writing", second.id);

    usePerspectiveUiStore.getState().patchModule(firstKey, { collapsed: false, scrollTop: 120 });
    usePerspectiveUiStore.getState().patchModule(secondKey, { collapsed: true, scrollTop: 0 });

    expect(usePerspectiveUiStore.getState().modules[firstKey]).toEqual({
      collapsed: false,
      scrollTop: 120,
    });
    expect(usePerspectiveUiStore.getState().modules[secondKey]).toEqual({
      collapsed: true,
      scrollTop: 0,
    });
    expect(JSON.stringify(config)).toBe(originalConfig);
  });

  it("starts file trees collapsed with independent expanded-path state", () => {
    expect(initialPerspectiveModuleUiState("file-tree")).toEqual({
      collapsed: true,
      expandedPaths: [],
    });
    expect(initialPerspectiveModuleUiState("contexts")).toEqual({});
  });
});

describe("Perspective selection and switching state", () => {
  it("persists selection per workspace and falls back when saved ID disappears", () => {
    const storage = memoryStorage();

    expect(writeSelectedPerspective(storage, "/vault A", "writing")).toBeNull();
    expect(readSelectedPerspective(storage, "/vault A", perspectives)).toEqual({
      id: "writing",
      warning: null,
    });
    expect(readSelectedPerspective(storage, "/vault B", perspectives).id).toBe("default");
    expect(readSelectedPerspective(storage, "/vault A", [perspectives[0]!])).toEqual({
      id: "default",
      warning: "Saved Perspective 'writing' is unavailable. Switched to 'default'.",
    });
  });

  it("reports local-storage read and write failures without losing active fallback", () => {
    const brokenRead = {
      getItem: vi.fn(() => {
        throw new Error("blocked");
      }),
    };
    const brokenWrite = {
      setItem: vi.fn(() => {
        throw new Error("quota");
      }),
    };

    expect(readSelectedPerspective(brokenRead, "/vault", perspectives)).toEqual({
      id: "default",
      warning: "Saved Perspective could not be read. Using the default Perspective.",
    });
    expect(writeSelectedPerspective(brokenWrite, "/vault", "writing")).toBe(
      "Active Perspective could not be saved on this device.",
    );
  });

  it("recovers from missing active IDs and handles empty lists explicitly", () => {
    expect(resolveActivePerspective(perspectives, "missing")).toEqual({
      perspective: perspectives[0],
      error: "Active Perspective 'missing' is unavailable. Using 'default'.",
    });
    expect(resolveActivePerspective([], "missing")).toEqual({
      perspective: null,
      error: "No valid Perspective is available.",
    });
  });

  it("wraps next and previous commands in configured order", () => {
    expect(adjacentPerspectiveId(perspectives, "default", "next")).toBe("writing");
    expect(adjacentPerspectiveId(perspectives, "default", "previous")).toBe("planning");
    expect(adjacentPerspectiveId(perspectives, "planning", "next")).toBe("default");
    expect(adjacentPerspectiveId(perspectives, "missing", "next")).toBe("writing");
    expect(adjacentPerspectiveId([], "missing", "previous")).toBe("missing");
  });

  it("accepts only Meta-or-Control plus Alt arrow shortcuts", () => {
    const base = {
      key: "ArrowRight",
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    };
    expect(perspectiveDirectionForShortcut({ ...base, metaKey: true })).toBe("next");
    expect(perspectiveDirectionForShortcut({ ...base, ctrlKey: true, key: "ArrowLeft" })).toBe(
      "previous",
    );
    expect(perspectiveDirectionForShortcut(base)).toBeNull();
    expect(perspectiveDirectionForShortcut({ ...base, metaKey: true, shiftKey: true })).toBeNull();
    expect(
      perspectiveDirectionForShortcut({ ...base, metaKey: true, key: "ArrowDown" }),
    ).toBeNull();
  });

  it("executes valid core switch commands and reports missing IDs", () => {
    const onSwitch = vi.fn();
    const onError = vi.fn();

    switchPerspectiveCommand(perspectives, "writing", onSwitch, onError);
    switchPerspectiveCommand(perspectives, "missing", onSwitch, onError);

    expect(onSwitch).toHaveBeenCalledExactlyOnceWith("writing");
    expect(onError).toHaveBeenCalledExactlyOnceWith("Perspective ID 'missing' is unavailable.");
  });
});
