import { invoke } from "@tauri-apps/api/tauri";

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
