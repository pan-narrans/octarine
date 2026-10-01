export const PROJECT_VIEW_MODE_KEY = "octarine.project-view-mode";

export type ProjectViewMode = "board" | "list";

export function parseProjectViewMode(value: string | null): ProjectViewMode {
  return value === "list" || value === "board" ? value : "board";
}

export function readProjectViewMode(storage: Pick<Storage, "getItem">): ProjectViewMode {
  try {
    return parseProjectViewMode(storage.getItem(PROJECT_VIEW_MODE_KEY));
  } catch {
    return "board";
  }
}

export function writeProjectViewMode(storage: Pick<Storage, "setItem">, mode: ProjectViewMode) {
  try {
    storage.setItem(PROJECT_VIEW_MODE_KEY, mode);
  } catch {
    // Presentation preference failure must not block project navigation.
  }
}
