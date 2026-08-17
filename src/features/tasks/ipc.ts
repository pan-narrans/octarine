import { invoke } from "@tauri-apps/api/tauri";
import type { WriteError, WriteErrorCode } from "../../types";

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
