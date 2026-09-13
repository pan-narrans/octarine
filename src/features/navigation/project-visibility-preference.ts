export const PROJECT_VISIBILITY_KEY_PREFIX = "octarine.sidebar.show-inactive-projects";

export function projectVisibilityKey(vaultIdentity: string) {
  return `${PROJECT_VISIBILITY_KEY_PREFIX}:${encodeURIComponent(vaultIdentity)}`;
}

export function parseShowInactiveProjects(value: string | null) {
  return value === "true";
}

export function readShowInactiveProjects(storage: Pick<Storage, "getItem">, vaultIdentity: string) {
  try {
    return parseShowInactiveProjects(storage.getItem(projectVisibilityKey(vaultIdentity)));
  } catch {
    return false;
  }
}

export function writeShowInactiveProjects(
  storage: Pick<Storage, "setItem">,
  vaultIdentity: string,
  showInactiveProjects: boolean,
) {
  try {
    storage.setItem(projectVisibilityKey(vaultIdentity), String(showInactiveProjects));
  } catch {
    // Presentation preference failure must not block project navigation.
  }
}
