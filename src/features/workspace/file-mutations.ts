import { editorSessions } from "./editor-sessions";
import { deletePath, renamePath } from "./ipc";
import { executeProjectMerge, executeProjectRename } from "../tasks/ipc";
import type { ProjectMergeResult, ProjectRenameResult } from "../../types";

export const deleteEditorPath = (path: string): Promise<void> =>
  editorSessions.withCleanPaths([path], () => deletePath(path));

export const renameEditorPath = (oldPath: string, newPath: string): Promise<void> =>
  editorSessions.withCleanPaths([oldPath, newPath], () => renamePath(oldPath, newPath));

// Project metadata rewrites can reach notes outside the moved directory.
export const renameEditorProject = (
  vaultPath: string,
  token: string,
): Promise<ProjectRenameResult> =>
  editorSessions.withCleanPaths([vaultPath], () => executeProjectRename(token));

export const mergeEditorProjects = (
  vaultPath: string,
  token: string,
): Promise<ProjectMergeResult> =>
  editorSessions.withCleanPaths([vaultPath], () => executeProjectMerge(token));
