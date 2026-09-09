import { invoke } from "@tauri-apps/api/tauri";
import {
  isTask,
  type CaptureContext,
  type CreateTaskError,
  type CreateTaskErrorCode,
  type CreateTaskResult,
  type TaskDraft,
  type TaskDraftPreview,
  type UndoCreateReceipt,
  type WriteError,
  type WriteErrorCode,
} from "../../types";

export interface MoveTaskRequest {
  filePath: string;
  lineNumber: number;
  originalRawMarkdown: string;
  newStatus: string;
  newPrimaryContext?: string;
}

const CONFLICT_CODES: ReadonlySet<WriteErrorCode> = new Set([
  "source_missing",
  "source_changed",
  "source_ambiguous",
]);

export function parseWriteError(error: unknown): WriteError | null {
  if (typeof error !== "object" || error === null) return null;
  const candidate = error as Record<string, unknown>;
  if (typeof candidate.code !== "string" || typeof candidate.message !== "string") return null;
  const knownCodes: ReadonlySet<string> = new Set([
    ...CONFLICT_CODES,
    "invalid_source",
    "operation_failed",
  ]);
  return knownCodes.has(candidate.code)
    ? ({ code: candidate.code, message: candidate.message } as WriteError)
    : null;
}

export function isWriteConflict(error: unknown): boolean {
  const parsed = parseWriteError(error);
  return parsed !== null && CONFLICT_CODES.has(parsed.code);
}

export function writeErrorMessage(error: unknown): string {
  return (
    parseWriteError(error)?.message ?? (error instanceof Error ? error.message : String(error))
  );
}

export function getTasks(filter: string | null): Promise<unknown> {
  return invoke("get_tasks", { filter });
}

export function getCustomViews(): Promise<unknown> {
  return invoke("get_custom_views");
}

export function updateTaskStatus(
  filePath: string,
  lineNumber: number,
  originalRawMarkdown: string,
  newStatus: string,
): Promise<void> {
  return invoke("update_task_status", {
    filePath,
    lineNumber,
    originalRawMarkdown,
    newStatus,
  });
}

export function moveTask({
  filePath,
  lineNumber,
  originalRawMarkdown,
  newStatus,
  newPrimaryContext,
}: MoveTaskRequest): Promise<void> {
  return invoke("move_task", {
    filePath,
    lineNumber,
    originalRawMarkdown,
    newStatus,
    newPrimaryContext,
  });
}

export function updateTaskMarkdown(
  filePath: string,
  lineNumber: number,
  originalRawMarkdown: string,
  newRawMarkdown: string,
): Promise<void> {
  return invoke("update_task_markdown", {
    filePath,
    lineNumber,
    originalRawMarkdown,
    newRawMarkdown,
  });
}

export function deleteTaskMarkdown(
  filePath: string,
  lineNumber: number,
  originalRawMarkdown: string,
): Promise<void> {
  return invoke("delete_task_markdown", { filePath, lineNumber, originalRawMarkdown });
}

export function updateEventSchedule(
  filePath: string,
  lineNumber: number,
  originalRawMarkdown: string,
  newSStart: string | null,
  newDurationSecs: number | null,
): Promise<void> {
  return invoke("update_event_schedule", {
    filePath,
    lineNumber,
    originalRawMarkdown,
    newSStart,
    newDurationSecs,
  });
}

const CREATE_ERROR_CODES: ReadonlySet<CreateTaskErrorCode> = new Set([
  "invalid_draft",
  "invalid_destination",
  "project_collision",
  "destination_conflict",
  "index_failed",
  "operation_failed",
]);

const WARNING_CODES = new Set([
  "insertion_target_missing",
  "insertion_target_ambiguous",
  "appended_at_eof",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function isTaskDraft(value: unknown): value is TaskDraft {
  if (!isRecord(value)) return false;
  return (
    typeof value.title === "string" &&
    typeof value.notes === "string" &&
    ["todo", "doing", "deferred", "done", "cancelled"].includes(String(value.status)) &&
    (value.priority === null || ["A", "B", "C", "D"].includes(String(value.priority))) &&
    (value.dueDate === null || typeof value.dueDate === "string") &&
    (value.duration === null || typeof value.duration === "string") &&
    (value.recurrence === null || typeof value.recurrence === "string") &&
    (value.project === null || typeof value.project === "string") &&
    isStringArray(value.contexts) &&
    isStringArray(value.tags) &&
    Array.isArray(value.subtasks) &&
    value.subtasks.every(isTaskDraft) &&
    typeof value.rawMarkdown === "string"
  );
}

export function isTaskDraftPreview(value: unknown): value is TaskDraftPreview {
  return (
    isRecord(value) &&
    isTaskDraft(value.draft) &&
    (value.taskType === "task" || value.taskType === "event") &&
    typeof value.destinationPath === "string" &&
    (value.inheritedProject === null || typeof value.inheritedProject === "string")
  );
}

export function isCreateTaskResult(value: unknown): value is CreateTaskResult {
  if (!isRecord(value) || !isTask(value.task) || typeof value.destinationPath !== "string") {
    return false;
  }
  if (
    value.warning !== null &&
    (!isRecord(value.warning) ||
      !WARNING_CODES.has(String(value.warning.code)) ||
      typeof value.warning.message !== "string")
  ) {
    return false;
  }
  return (
    isRecord(value.undoReceipt) &&
    typeof value.undoReceipt.filePath === "string" &&
    typeof value.undoReceipt.lineNumber === "number" &&
    typeof value.undoReceipt.rawMarkdown === "string" &&
    typeof value.undoReceipt.sourceFingerprint === "string"
  );
}

export function parseCreateTaskError(error: unknown): CreateTaskError | null {
  if (!isRecord(error) || typeof error.message !== "string") return null;
  return typeof error.code === "string" && CREATE_ERROR_CODES.has(error.code as CreateTaskErrorCode)
    ? ({ code: error.code, message: error.message } as CreateTaskError)
    : null;
}

export async function previewTaskDraft(
  input: string,
  captureContext: CaptureContext,
): Promise<TaskDraftPreview> {
  const result: unknown = await invoke("preview_task_draft", { input, captureContext });
  if (!isTaskDraftPreview(result)) throw new Error("Invalid task preview response.");
  return result;
}

export async function createTask(operationId: string, draft: TaskDraft): Promise<CreateTaskResult> {
  const result: unknown = await invoke("create_task", { operationId, draft });
  if (!isCreateTaskResult(result)) throw new Error("Invalid task creation response.");
  return result;
}

export function undoCreatedTask(receipt: UndoCreateReceipt): Promise<void> {
  return invoke("undo_created_task", { receipt });
}
