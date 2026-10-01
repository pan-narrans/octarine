import type { Task } from "../../types";
import type { KanbanStatus } from "./model";

export interface KanbanMoveIntent {
  newStatus: KanbanStatus;
  newPrimaryContext?: string;
}

export function isKanbanMoveNoop(task: Task, intent: KanbanMoveIntent) {
  return (
    task.status === intent.newStatus &&
    (intent.newPrimaryContext === undefined || task.primary_context === intent.newPrimaryContext)
  );
}

export function applyKanbanMove(task: Task, intent: KanbanMoveIntent): Task {
  if (isKanbanMoveNoop(task, intent)) return task;
  if (intent.newPrimaryContext === undefined) {
    return { ...task, status: intent.newStatus };
  }

  return {
    ...task,
    status: intent.newStatus,
    primary_context: intent.newPrimaryContext,
    contexts:
      task.contexts.length === 0
        ? [intent.newPrimaryContext]
        : [intent.newPrimaryContext, ...task.contexts.slice(1)],
  };
}
