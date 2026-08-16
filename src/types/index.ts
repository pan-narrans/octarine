import type { FileNode as GeneratedFileNode } from "../generated/ipc/FileNode";
import type { ParsedCustomView } from "../generated/ipc/ParsedCustomView";
import type { ParsedTask } from "../generated/ipc/ParsedTask";

export type Task = Omit<ParsedTask, "status" | "task_type"> & {
  status: "todo" | "doing" | "done" | "cancelled";
  task_type: "task" | "event";
};
export type CustomView = ParsedCustomView;
export type FileNode = GeneratedFileNode;
export type { WriteError } from "../generated/ipc/WriteError";
export type { WriteErrorCode } from "../generated/ipc/WriteErrorCode";

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
      p.status === "done" ||
      p.status === "cancelled") &&
    (p.task_type === "task" || p.task_type === "event") &&
    typeof p.description === "string" &&
    (typeof p.file_path === "string" || p.file_path === null) &&
    Array.isArray(p.tags) &&
    p.tags.every((tag) => typeof tag === "string") &&
    Array.isArray(p.contexts) &&
    p.contexts.every((context) => typeof context === "string")
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
