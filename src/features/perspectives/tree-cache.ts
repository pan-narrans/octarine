import type { FileNode } from "../../types";
import type { PerspectiveWorkspaceRoot } from "../../generated/ipc/PerspectiveWorkspaceRoot";

type CachedTreeRequest = { generation: number; request: Promise<FileNode> };

const treeCache = new Map<string, Map<PerspectiveWorkspaceRoot, CachedTreeRequest>>();

export function readCachedPerspectiveTree(
  workspaceId: string,
  root: PerspectiveWorkspaceRoot,
  generation: number,
  load: () => Promise<FileNode>,
): Promise<FileNode> {
  let workspaceCache = treeCache.get(workspaceId);
  if (!workspaceCache) {
    workspaceCache = new Map();
    treeCache.set(workspaceId, workspaceCache);
  }
  const cached = workspaceCache.get(root);
  if (cached?.generation === generation) return cached.request;

  const entry: CachedTreeRequest = {
    generation,
    request: load().catch((error: unknown) => {
      if (workspaceCache?.get(root) === entry) workspaceCache.delete(root);
      throw error;
    }),
  };
  workspaceCache.set(root, entry);
  return entry.request;
}

export function invalidatePerspectiveTreeCache(workspaceId?: string): void {
  if (workspaceId === undefined) treeCache.clear();
  else treeCache.delete(workspaceId);
}
