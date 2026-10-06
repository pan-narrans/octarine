import type { PerspectiveDefinition, PerspectiveRootId } from "./model";

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function pathIsWithinRoot(path: string, root: string): boolean {
  const normalizedPath = normalizePath(path);
  const normalizedRoot = normalizePath(root);
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

export function resolveFileTreeRevealOwner(
  perspective: PerspectiveDefinition,
  activeFilePath: string | null,
  activeFileSource: PerspectiveModuleRuntimeSource | null | undefined,
  rootPaths: Partial<Record<PerspectiveRootId, string | null>>,
): string | null {
  if (!activeFilePath) return null;
  const trees = perspective.sidebar.filter((module) => module.type === "file-tree");
  const source = activeFileSource;
  const sourcedTree = source && trees.find((tree) => tree.id === source.instanceId);
  const sourcedRoot = sourcedTree?.root;
  const sourcedRootPath =
    typeof sourcedRoot === "string" ? rootPaths[sourcedRoot as PerspectiveRootId] : null;
  if (
    source?.filePath === activeFilePath &&
    source.perspectiveId === perspective.id &&
    sourcedRootPath &&
    pathIsWithinRoot(activeFilePath, sourcedRootPath)
  ) {
    return source.instanceId;
  }

  let bestId: string | null = null;
  let bestDepth = -1;
  for (const tree of trees) {
    const root = tree.root;
    if (typeof root !== "string") continue;
    const rootPath = rootPaths[root as PerspectiveRootId];
    if (!rootPath || !pathIsWithinRoot(activeFilePath, rootPath)) continue;
    const depth = normalizePath(rootPath).split("/").filter(Boolean).length;
    if (depth > bestDepth) {
      bestId = tree.id;
      bestDepth = depth;
    }
  }
  return bestId;
}

interface PerspectiveModuleRuntimeSource {
  filePath: string;
  perspectiveId: string;
  instanceId: string;
}
