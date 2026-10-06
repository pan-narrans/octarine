import { describe, expect, it } from "vitest";
import type { PerspectiveDefinition, PerspectiveRootId } from "./model";
import { pathIsWithinRoot, resolveFileTreeRevealOwner } from "./file-tree-reveal";

function perspective(
  id: string,
  trees: Array<{ id: string; root: PerspectiveRootId }>,
): PerspectiveDefinition {
  return {
    id,
    title: id,
    sidebar: trees.map(({ id: instanceId, root }) => ({
      id: instanceId,
      type: "file-tree",
      root,
    })),
  };
}

const nestedRoots = {
  vault: "/octarine/vault",
  journal: "/octarine/vault/journals",
  projects: "/octarine/vault/projects",
};
const projectNote = "/octarine/vault/projects/octarine/roadmap.md";

describe("file-tree reveal ownership", () => {
  it("keeps reveal with tree that opened document, even when another root is deeper", () => {
    const config = perspective("writing", [
      { id: "all-files", root: "vault" },
      { id: "project-files", root: "projects" },
    ]);

    expect(
      resolveFileTreeRevealOwner(
        config,
        projectNote,
        { filePath: projectNote, perspectiveId: "writing", instanceId: "all-files" },
        nestedRoots,
      ),
    ).toBe("all-files");
  });

  it.each([
    [
      "a different file",
      { filePath: "/octarine/vault/old.md", perspectiveId: "writing", instanceId: "all-files" },
    ],
    [
      "a different Perspective",
      { filePath: projectNote, perspectiveId: "planning", instanceId: "all-files" },
    ],
    [
      "an unavailable instance",
      { filePath: projectNote, perspectiveId: "writing", instanceId: "missing-tree" },
    ],
  ])("uses deepest configured root when source refers to %s", (_label, source) => {
    const config = perspective("writing", [
      { id: "all-files", root: "vault" },
      { id: "project-files", root: "projects" },
    ]);

    expect(resolveFileTreeRevealOwner(config, projectNote, source, nestedRoots)).toBe(
      "project-files",
    );
  });

  it("chooses first tree in Perspective order when matching roots tie", () => {
    const firstOrder = perspective("writing", [
      { id: "first-tree", root: "vault" },
      { id: "second-tree", root: "vault" },
    ]);
    const secondOrder = perspective("writing", [
      { id: "second-tree", root: "vault" },
      { id: "first-tree", root: "vault" },
    ]);

    expect(resolveFileTreeRevealOwner(firstOrder, projectNote, null, nestedRoots)).toBe(
      "first-tree",
    );
    expect(resolveFileTreeRevealOwner(secondOrder, projectNote, null, nestedRoots)).toBe(
      "second-tree",
    );
  });

  it("returns no owner for missing documents or paths outside configured roots", () => {
    const config = perspective("writing", [{ id: "all-files", root: "vault" }]);

    expect(resolveFileTreeRevealOwner(config, null, null, nestedRoots)).toBeNull();
    expect(
      resolveFileTreeRevealOwner(config, "/octarine/vault-copy/roadmap.md", null, nestedRoots),
    ).toBeNull();
  });
});

describe("workspace path matching", () => {
  it("matches path boundaries and separators without case-folding", () => {
    expect(pathIsWithinRoot("/octarine/vault/projects/note.md", "/octarine/vault")).toBe(true);
    expect(pathIsWithinRoot("C:\\vault\\note.md", "C:/vault")).toBe(true);
    expect(pathIsWithinRoot("/octarine/vault-copy/note.md", "/octarine/vault")).toBe(false);
    expect(pathIsWithinRoot("/Octarine/Vault/note.md", "/octarine/vault")).toBe(false);
  });
});
