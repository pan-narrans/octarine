import type { TaskDraft } from "../types";

export function inheritDraftProject(draft: TaskDraft, project: string | null): TaskDraft {
  return {
    ...draft,
    project,
    subtasks: draft.subtasks.map((subtask) => inheritDraftProject(subtask, project)),
  };
}
