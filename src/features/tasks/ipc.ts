import { invoke } from "@tauri-apps/api/core";
import {
  isTask,
  type CaptureContext,
  type CreateTaskError,
  type CreateTaskErrorCode,
  type CreateTaskResult,
  type MoveTaskProjectError,
  type MoveTaskProjectErrorCode,
  type MoveTaskProjectResult,
  type PreparedProjectMerge,
  type ProjectMergeBulkResolution,
  type ProjectMergeError,
  type ProjectMergeErrorCode,
  type ProjectMergePlan,
  type ProjectMergeRecoveryBundle,
  type ProjectMergeResolution,
  type ProjectMergeResult,
  type ProjectRenameError,
  type ProjectRenameErrorCode,
  type ProjectRenamePlan,
  type ProjectRenameResult,
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
  if (!isCreateWarning(value.warning)) return false;
  return (
    isRecord(value.undoReceipt) &&
    typeof value.undoReceipt.filePath === "string" &&
    typeof value.undoReceipt.lineNumber === "number" &&
    typeof value.undoReceipt.rawMarkdown === "string" &&
    typeof value.undoReceipt.sourceFingerprint === "string"
  );
}

function isCreateWarning(value: unknown): boolean {
  return (
    value === null ||
    (isRecord(value) && WARNING_CODES.has(String(value.code)) && typeof value.message === "string")
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

const MOVE_PROJECT_ERROR_CODES: ReadonlySet<MoveTaskProjectErrorCode> = new Set([
  "invalid_source",
  "invalid_destination",
  "project_collision",
  "destination_conflict",
  "source_removal_failed",
  "rollback_failed",
  "index_failed",
  "operation_failed",
]);

export function parseMoveTaskProjectError(error: unknown): MoveTaskProjectError | null {
  if (!isRecord(error) || typeof error.message !== "string") return null;
  if (
    typeof error.code !== "string" ||
    !MOVE_PROJECT_ERROR_CODES.has(error.code as MoveTaskProjectErrorCode) ||
    typeof error.recoveryRequired !== "boolean"
  ) {
    return null;
  }
  return error as unknown as MoveTaskProjectError;
}

export async function moveTaskProject(
  sourceFilePath: string,
  originalLineNumber: number,
  originalRawMarkdown: string,
  newRawMarkdown: string,
): Promise<MoveTaskProjectResult> {
  const result: unknown = await invoke("move_task_project", {
    sourceFilePath,
    originalLineNumber,
    originalRawMarkdown,
    newRawMarkdown,
  });
  if (
    !isRecord(result) ||
    !isTask(result.task) ||
    typeof result.sourcePath !== "string" ||
    typeof result.destinationPath !== "string" ||
    !isCreateWarning(result.warning)
  ) {
    throw new Error("Invalid project move response.");
  }
  return result as unknown as MoveTaskProjectResult;
}

const PROJECT_RENAME_ERROR_CODES: ReadonlySet<ProjectRenameErrorCode> = new Set([
  "invalid_request",
  "collision",
  "unknown_plan",
  "stale_plan",
  "busy",
  "operation_failed",
  "partial_failure",
]);

export function parseProjectRenameError(error: unknown): ProjectRenameError | null {
  if (!isRecord(error) || typeof error.message !== "string") return null;
  if (
    typeof error.code !== "string" ||
    !PROJECT_RENAME_ERROR_CODES.has(error.code as ProjectRenameErrorCode)
  ) {
    return null;
  }
  if (error.recovery !== null) {
    if (
      !isRecord(error.recovery) ||
      !isStringArray(error.recovery.completedOperations) ||
      !isStringArray(error.recovery.pendingOperations) ||
      !isStringArray(error.recovery.inspectPaths) ||
      typeof error.recovery.guidance !== "string"
    ) {
      return null;
    }
  }
  return error as unknown as ProjectRenameError;
}

function isProjectRenamePlan(value: unknown): value is ProjectRenamePlan {
  return (
    isRecord(value) &&
    typeof value.planToken === "string" &&
    typeof value.sourceProject === "string" &&
    typeof value.destinationProject === "string" &&
    typeof value.caseOnly === "boolean" &&
    Array.isArray(value.rewrites) &&
    Array.isArray(value.moves) &&
    Array.isArray(value.indexUpdates) &&
    Array.isArray(value.collisions) &&
    isRecord(value.impact) &&
    typeof value.impact.rewrittenFiles === "number" &&
    typeof value.impact.rewrittenTokens === "number" &&
    typeof value.impact.filesystemMoves === "number" &&
    typeof value.impact.descendantProjects === "number" &&
    isStringArray(value.warnings)
  );
}

export async function preflightProjectRename(
  sourceProject: string,
  destinationProject: string,
): Promise<ProjectRenamePlan> {
  const result: unknown = await invoke("preflight_project_rename", {
    sourceProject,
    destinationProject,
  });
  if (!isProjectRenamePlan(result)) throw new Error("Invalid project rename plan response.");
  return result;
}

export async function executeProjectRename(planToken: string): Promise<ProjectRenameResult> {
  const result: unknown = await invoke("execute_project_rename", { planToken });
  if (
    !isRecord(result) ||
    typeof result.planToken !== "string" ||
    !isStringArray(result.completedOperations) ||
    typeof result.rewrittenFiles !== "number" ||
    typeof result.rewrittenTokens !== "number" ||
    typeof result.movedPaths !== "number"
  ) {
    throw new Error("Invalid project rename result response.");
  }
  return result as unknown as ProjectRenameResult;
}

const PROJECT_MERGE_ERROR_CODES: ReadonlySet<ProjectMergeErrorCode> = new Set([
  "invalid_request",
  "destination_missing",
  "ancestor_conflict",
  "symlink_blocked",
  "unknown_plan",
  "unresolved_conflict",
  "invalid_resolution",
  "invalid_result",
  "stale_plan",
  "busy",
  "cancelled",
  "operation_failed",
  "partial_failure",
  "recovery_failure",
]);

const MERGE_ENTRY_KINDS = new Set(["markdown", "file", "ignored", "type_mismatch"]);
const MERGE_PATH_KINDS = new Set(["file", "directory"]);
const MERGE_MOVE_KINDS = new Set(["file", "directory"]);
const MERGE_STAGED_KINDS = new Set(["markdown", "file", "directory"]);
const MERGE_RECOVERY_STATUSES = new Set(["committing", "successful", "stopped", "failed"]);

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isMergeConflict(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.relativePath === "string" &&
    typeof value.sourcePath === "string" &&
    typeof value.destinationPath === "string" &&
    MERGE_ENTRY_KINDS.has(String(value.kind)) &&
    MERGE_PATH_KINDS.has(String(value.sourceKind)) &&
    MERGE_PATH_KINDS.has(String(value.destinationKind)) &&
    typeof value.sourceFingerprint === "string" &&
    typeof value.destinationFingerprint === "string" &&
    typeof value.nestedFileCount === "number" &&
    typeof value.byteSize === "number" &&
    isNullableString(value.sourcePreview) &&
    isNullableString(value.destinationPreview)
  );
}

export function isProjectMergePlan(value: unknown): value is ProjectMergePlan {
  if (
    !isRecord(value) ||
    typeof value.planToken !== "string" ||
    typeof value.operationId !== "string" ||
    typeof value.sourceProject !== "string" ||
    typeof value.destinationProject !== "string" ||
    typeof value.projectFolder !== "string" ||
    !Array.isArray(value.rewrites) ||
    !Array.isArray(value.moves) ||
    !Array.isArray(value.conflicts) ||
    !Array.isArray(value.autoResolutions) ||
    !isStringArray(value.collapsedDescendants) ||
    !isStringArray(value.warnings) ||
    !isRecord(value.impact)
  ) {
    return false;
  }
  const validRewrites = value.rewrites.every(
    (rewrite) =>
      isRecord(rewrite) &&
      typeof rewrite.path === "string" &&
      typeof rewrite.destinationPath === "string" &&
      typeof rewrite.sourceFingerprint === "string" &&
      typeof rewrite.replacementCount === "number",
  );
  const validMoves = value.moves.every(
    (move) =>
      isRecord(move) &&
      MERGE_MOVE_KINDS.has(String(move.kind)) &&
      typeof move.sourcePath === "string" &&
      typeof move.destinationPath === "string" &&
      typeof move.sourceFingerprint === "string" &&
      typeof move.ignored === "boolean",
  );
  const validAutoResolutions = value.autoResolutions.every(
    (resolution) =>
      isRecord(resolution) &&
      typeof resolution.sourcePath === "string" &&
      typeof resolution.destinationPath === "string" &&
      typeof resolution.sourceFingerprint === "string" &&
      typeof resolution.destinationFingerprint === "string" &&
      typeof resolution.reason === "string",
  );
  return (
    validRewrites &&
    validMoves &&
    value.conflicts.every(isMergeConflict) &&
    validAutoResolutions &&
    typeof value.impact.rewrittenFiles === "number" &&
    typeof value.impact.rewrittenTokens === "number" &&
    typeof value.impact.filesystemMoves === "number" &&
    typeof value.impact.conflicts === "number" &&
    typeof value.impact.autoResolved === "number" &&
    typeof value.impact.collapsedDescendants === "number"
  );
}

export function isPreparedProjectMerge(value: unknown): value is PreparedProjectMerge {
  return (
    isRecord(value) &&
    typeof value.preparedToken === "string" &&
    typeof value.planToken === "string" &&
    typeof value.operationId === "string" &&
    typeof value.stagingPath === "string" &&
    isStringArray(value.warnings) &&
    Array.isArray(value.entries) &&
    value.entries.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.destinationPath === "string" &&
        typeof entry.stagedPath === "string" &&
        typeof entry.fingerprint === "string" &&
        MERGE_STAGED_KINDS.has(String(entry.kind)) &&
        typeof entry.ignored === "boolean",
    )
  );
}

export function parseProjectMergeError(error: unknown): ProjectMergeError | null {
  if (
    !isRecord(error) ||
    typeof error.code !== "string" ||
    !PROJECT_MERGE_ERROR_CODES.has(error.code as ProjectMergeErrorCode) ||
    typeof error.message !== "string" ||
    !isStringArray(error.paths)
  ) {
    return null;
  }
  if (
    error.recovery !== null &&
    (!isRecord(error.recovery) ||
      typeof error.recovery.operationId !== "string" ||
      typeof error.recovery.recoveryPath !== "string" ||
      !isStringArray(error.recovery.completedOperations) ||
      !isStringArray(error.recovery.pendingOperations) ||
      !isStringArray(error.recovery.inspectPaths) ||
      typeof error.recovery.guidance !== "string")
  ) {
    return null;
  }
  return error as unknown as ProjectMergeError;
}

export async function preflightProjectMerge(
  sourceProject: string,
  destinationProject: string,
): Promise<ProjectMergePlan> {
  const result: unknown = await invoke("preflight_project_merge", {
    sourceProject,
    destinationProject,
  });
  if (!isProjectMergePlan(result)) throw new Error("Invalid project merge plan response.");
  return result;
}

export function resolveProjectMergeConflict(
  planToken: string,
  resolution: ProjectMergeResolution,
): Promise<void> {
  return invoke("resolve_project_merge_conflict", { planToken, resolution });
}

export function resolveProjectMergeConflictsBulk(
  planToken: string,
  bulk: ProjectMergeBulkResolution,
): Promise<void> {
  return invoke("resolve_project_merge_conflicts_bulk", { planToken, bulk });
}

export async function prepareProjectMerge(planToken: string): Promise<PreparedProjectMerge> {
  const result: unknown = await invoke("prepare_project_merge", { planToken });
  if (!isPreparedProjectMerge(result)) {
    throw new Error("Invalid prepared project merge response.");
  }
  return result;
}

export async function executeProjectMerge(planToken: string): Promise<ProjectMergeResult> {
  const result: unknown = await invoke("execute_project_merge", { planToken });
  if (
    !isRecord(result) ||
    typeof result.preparedToken !== "string" ||
    typeof result.operationId !== "string" ||
    typeof result.recoveryPath !== "string" ||
    typeof result.recoveryDeletionDate !== "string" ||
    !isStringArray(result.completedOperations)
  ) {
    throw new Error("Invalid project merge result response.");
  }
  return result as unknown as ProjectMergeResult;
}

export function cancelProjectMerge(operationId: string): Promise<void> {
  return invoke("cancel_project_merge", { operationId });
}

export async function listProjectMergeRecovery(): Promise<ProjectMergeRecoveryBundle[]> {
  const result: unknown = await invoke("list_project_merge_recovery");
  if (
    !Array.isArray(result) ||
    !result.every(
      (bundle) =>
        isRecord(bundle) &&
        typeof bundle.operationId === "string" &&
        typeof bundle.recoveryPath === "string" &&
        typeof bundle.createdAt === "string" &&
        isNullableString(bundle.completedAt) &&
        isNullableString(bundle.expiresAt) &&
        typeof bundle.sourceProject === "string" &&
        typeof bundle.destinationProject === "string" &&
        MERGE_RECOVERY_STATUSES.has(String(bundle.status)) &&
        typeof bundle.sizeBytes === "number" &&
        typeof bundle.completedOperations === "number" &&
        typeof bundle.pendingOperations === "number",
    )
  ) {
    throw new Error("Invalid project merge recovery response.");
  }
  return result as ProjectMergeRecoveryBundle[];
}

export function deleteProjectMergeRecovery(operationId: string): Promise<void> {
  return invoke("delete_project_merge_recovery", { operationId });
}

export function openProjectMergeRecovery(operationId: string): Promise<void> {
  return invoke("open_project_merge_recovery", { operationId });
}
