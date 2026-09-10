import type { FileNode as GeneratedFileNode } from "../generated/ipc/FileNode";
import type { ParsedCustomView } from "../generated/ipc/ParsedCustomView";
import type { ParsedTask } from "../generated/ipc/ParsedTask";
import type { CreateTaskResult as GeneratedCreateTaskResult } from "../generated/ipc/CreateTaskResult";
import type { MoveTaskProjectResult as GeneratedMoveTaskProjectResult } from "../generated/ipc/MoveTaskProjectResult";

export type Task = Omit<ParsedTask, "status" | "task_type"> & {
  status: "todo" | "doing" | "deferred" | "done" | "cancelled";
  task_type: "task" | "event";
};
export type CreateTaskResult = Omit<GeneratedCreateTaskResult, "task"> & { task: Task };
export type MoveTaskProjectResult = Omit<GeneratedMoveTaskProjectResult, "task"> & { task: Task };
export type CustomView = ParsedCustomView;
export type FileNode = GeneratedFileNode;
export type { WriteError } from "../generated/ipc/WriteError";
export type { WriteErrorCode } from "../generated/ipc/WriteErrorCode";
export type { CaptureContext } from "../generated/ipc/CaptureContext";
export type { CreateWarning } from "../generated/ipc/CreateWarning";
export type { CreateWarningCode } from "../generated/ipc/CreateWarningCode";
export type { CreateTaskError } from "../generated/ipc/CreateTaskError";
export type { CreateTaskErrorCode } from "../generated/ipc/CreateTaskErrorCode";
export type { MoveTaskProjectError } from "../generated/ipc/MoveTaskProjectError";
export type { MoveTaskProjectErrorCode } from "../generated/ipc/MoveTaskProjectErrorCode";
export type { ProjectRenameCollision } from "../generated/ipc/ProjectRenameCollision";
export type { ProjectRenameError } from "../generated/ipc/ProjectRenameError";
export type { ProjectRenameErrorCode } from "../generated/ipc/ProjectRenameErrorCode";
export type { ProjectRenamePlan } from "../generated/ipc/ProjectRenamePlan";
export type { ProjectRenameRecoveryReport } from "../generated/ipc/ProjectRenameRecoveryReport";
export type { ProjectRenameResult } from "../generated/ipc/ProjectRenameResult";
export type { InsertionResult } from "../generated/ipc/InsertionResult";
export type { TaskDraft } from "../generated/ipc/TaskDraft";
export type { TaskDraftError } from "../generated/ipc/TaskDraftError";
export type { TaskDraftErrorCode } from "../generated/ipc/TaskDraftErrorCode";
export type { TaskDraftPreview } from "../generated/ipc/TaskDraftPreview";
export type { TaskPriority } from "../generated/ipc/TaskPriority";
export type { TaskStatus } from "../generated/ipc/TaskStatus";
export type { TaskType } from "../generated/ipc/TaskType";
export type { UndoCreateReceipt } from "../generated/ipc/UndoCreateReceipt";

// Type guard to validate a Task payload from Tauri
export function isTask(payload: unknown): payload is Task {
  if (typeof payload !== "object" || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.line_number === "number" &&
    typeof p.raw_markdown === "string" &&
    typeof p.hash === "string" &&
    (p.status === "todo" ||
      p.status === "doing" ||
      p.status === "deferred" ||
      p.status === "done" ||
      p.status === "cancelled") &&
    (p.task_type === "task" || p.task_type === "event") &&
    typeof p.description === "string" &&
    (typeof p.file_path === "string" || p.file_path === null) &&
    Array.isArray(p.tags) &&
    p.tags.every((tag) => typeof tag === "string") &&
    Array.isArray(p.contexts) &&
    p.contexts.every((context) => typeof context === "string") &&
    (typeof p.primary_context === "string" || p.primary_context === null)
  );
}

// Type guard to validate a CustomView payload from Tauri
export function isCustomView(payload: unknown): payload is CustomView {
  if (typeof payload !== "object" || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.line_number === "number" &&
    typeof p.title === "string" &&
    typeof p.query_raw === "string"
  );
}
