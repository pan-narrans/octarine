import { expect, it, vi } from "vitest";
import { editorSessions } from "./editor-sessions";
import {
  deleteEditorPath,
  renameEditorPath,
  renameEditorProject,
  mergeEditorProjects,
} from "./file-mutations";
import { deletePath, renamePath } from "./ipc";
import { executeProjectMerge, executeProjectRename } from "../tasks/ipc";

vi.mock("./ipc", () => ({ deletePath: vi.fn(), renamePath: vi.fn() }));
vi.mock("../tasks/ipc", () => ({ executeProjectMerge: vi.fn(), executeProjectRename: vi.fn() }));

it("refuses deletion of a folder containing a closed draft before invoking native IPC", async () => {
  const session = editorSessions.open("/delete/notes/child.md", "Original");
  session.edit("Draft");
  await expect(deleteEditorPath("/delete/notes")).rejects.toThrow("Save changes");
  expect(deletePath).not.toHaveBeenCalled();
  session.edit("Original");
  await deleteEditorPath("/delete/notes");
  expect(deletePath).toHaveBeenCalledWith("/delete/notes");
});

it("protects retained drafts at rename destination as well as source", async () => {
  const session = editorSessions.open("/rename/destination.md", "Original");
  session.edit("Draft");
  await expect(renameEditorPath("/rename/source.md", "/rename/destination.md")).rejects.toThrow(
    "Save changes",
  );
  expect(renamePath).not.toHaveBeenCalled();
  session.edit("Original");
  await renameEditorPath("/rename/source.md", "/rename/destination.md");
  expect(renamePath).toHaveBeenCalledWith("/rename/source.md", "/rename/destination.md");
});

it.each([
  ["rename", renameEditorProject, executeProjectRename],
  ["merge", mergeEditorProjects, executeProjectMerge],
] as const)(
  "protects drafts outside project folders before project %s rewrites",
  async (_, mutate, native) => {
    const session = editorSessions.open("/project-vault/inbox/note.md", "Original");
    session.edit("Draft");
    await expect(mutate("/project-vault", "plan-token")).rejects.toThrow("Save changes");
    expect(native).not.toHaveBeenCalled();
    session.edit("Original");
    await mutate("/project-vault", "plan-token");
    expect(native).toHaveBeenCalledWith("plan-token");
  },
);
