import { afterEach, describe, expect, it, vi } from "vitest";
import type { FileNode } from "../../types";
import type { PerspectiveWorkspaceRoot } from "../../generated/ipc/PerspectiveWorkspaceRoot";
import { invalidatePerspectiveTreeCache, readCachedPerspectiveTree } from "./tree-cache";

const root: PerspectiveWorkspaceRoot = "vault";

function tree(name: string): FileNode {
  return { name, path: `/${name}`, is_dir: true, children: [] };
}

afterEach(() => invalidatePerspectiveTreeCache());

describe("Perspective workspace tree cache", () => {
  it("shares requests within one workspace, then reloads after A-to-B-to-A entry", async () => {
    const oldTree = tree("old-vault");
    const workspaceATreeBeforeSwitch = vi.fn(async () => oldTree);
    const workspaceBTree = vi.fn(async () => tree("other-vault"));
    const workspaceATreeAfterReturn = vi.fn(async () => tree("changed-vault"));

    invalidatePerspectiveTreeCache("workspace-a");
    await expect(
      readCachedPerspectiveTree("workspace-a", root, 0, workspaceATreeBeforeSwitch),
    ).resolves.toBe(oldTree);
    await expect(
      readCachedPerspectiveTree("workspace-a", root, 0, workspaceATreeAfterReturn),
    ).resolves.toBe(oldTree);
    expect(workspaceATreeBeforeSwitch).toHaveBeenCalledOnce();
    expect(workspaceATreeAfterReturn).not.toHaveBeenCalled();

    invalidatePerspectiveTreeCache("workspace-b");
    await expect(
      readCachedPerspectiveTree("workspace-b", root, 0, workspaceBTree),
    ).resolves.toMatchObject({ name: "other-vault" });

    invalidatePerspectiveTreeCache("workspace-a");
    await expect(
      readCachedPerspectiveTree("workspace-a", root, 0, workspaceATreeAfterReturn),
    ).resolves.toMatchObject({ name: "changed-vault" });
    expect(workspaceATreeAfterReturn).toHaveBeenCalledOnce();
  });

  it("drops rejected requests so next read can recover", async () => {
    const fail = vi.fn(async () => {
      throw new Error("root changed");
    });
    const recover = vi.fn(async () => tree("recovered"));

    await expect(readCachedPerspectiveTree("workspace", root, 0, fail)).rejects.toThrow(
      "root changed",
    );
    await expect(readCachedPerspectiveTree("workspace", root, 0, recover)).resolves.toMatchObject({
      name: "recovered",
    });
    expect(recover).toHaveBeenCalledOnce();
  });
});
