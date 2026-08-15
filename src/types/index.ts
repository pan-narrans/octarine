export interface Task {
  line_number: number;
  raw_markdown: string;
  hash: string;
  status: "todo" | "doing" | "done" | "cancelled";
  task_type: "task" | "event";
  description: string;
  project: string | null;
  due_date: string | null;
  s_start: string | null;
  duration_secs: number | null;
  recurring: string | null;
  when_done: string | null;
  parse_errors: string | null;
  priority: number | null;
  parent_hash: string | null;
  file_path: string | null;
  tags: string[];
  contexts: string[];
}

export interface CustomView {
  line_number: number;
  title: string;
  query_raw: string;
}

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

export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children: FileNode[] | null;
}
