import type { Task } from "../../types";

export const ACTIVE_KANBAN_STATUSES = ["todo", "doing", "deferred"] as const;
export const CLOSED_KANBAN_STATUSES = ["done", "cancelled"] as const;

export type ActiveKanbanStatus = (typeof ACTIVE_KANBAN_STATUSES)[number];
export type ClosedKanbanStatus = (typeof CLOSED_KANBAN_STATUSES)[number];
export type KanbanStatus = ActiveKanbanStatus | ClosedKanbanStatus;

export interface KanbanCardModel {
  task: Task;
  relativeProject: string | null;
}

export interface KanbanGroupModel {
  context: string | null;
  cards: KanbanCardModel[];
}

export interface KanbanColumnModel {
  status: KanbanStatus;
  groups: KanbanGroupModel[];
}

interface BuildKanbanBoardOptions {
  tasks: Task[];
  selectedProject: string;
  searchQuery?: string;
  visibleClosedStatuses?: readonly ClosedKanbanStatus[];
}

export function isTaskInProject(taskProject: string | null, selectedProject: string) {
  return taskProject === selectedProject || taskProject?.startsWith(`${selectedProject}/`) === true;
}

export function relativeProjectPath(taskProject: string | null, selectedProject: string) {
  if (!taskProject || taskProject === selectedProject) return null;
  return isTaskInProject(taskProject, selectedProject)
    ? taskProject.slice(selectedProject.length + 1)
    : null;
}

function compareOptionalNumber(left: number | null, right: number | null) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

function compareOptionalText(left: string | null, right: string | null) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left.localeCompare(right);
}

export function compareKanbanTasks(left: Task, right: Task) {
  return (
    compareOptionalNumber(left.priority, right.priority) ||
    compareOptionalText(left.due_date, right.due_date) ||
    (left.file_path ?? "").localeCompare(right.file_path ?? "") ||
    left.line_number - right.line_number ||
    left.hash.localeCompare(right.hash)
  );
}

function matchesSearch(task: Task, searchQuery: string) {
  const query = searchQuery.trim().toLocaleLowerCase();
  if (!query) return true;
  return (
    task.description.toLocaleLowerCase().includes(query) ||
    task.project?.toLocaleLowerCase().includes(query) === true
  );
}

function compareContextGroups(left: string | null, right: string | null) {
  if (left === null) return right === null ? 0 : -1;
  if (right === null) return 1;
  return left.localeCompare(right);
}

export function buildKanbanBoard({
  tasks,
  selectedProject,
  searchQuery = "",
  visibleClosedStatuses = [],
}: BuildKanbanBoardOptions): KanbanColumnModel[] {
  const statuses: KanbanStatus[] = [
    ...ACTIVE_KANBAN_STATUSES,
    ...CLOSED_KANBAN_STATUSES.filter((status) => visibleClosedStatuses.includes(status)),
  ];
  const visibleStatuses = new Set<KanbanStatus>(statuses);
  const scopedTasks = tasks.filter(
    (task) =>
      task.task_type === "task" &&
      task.parent_hash === null &&
      isTaskInProject(task.project, selectedProject) &&
      visibleStatuses.has(task.status) &&
      matchesSearch(task, searchQuery),
  );

  return statuses.map((status) => {
    const groups = new Map<string | null, KanbanCardModel[]>();
    scopedTasks
      .filter((task) => task.status === status)
      .sort(compareKanbanTasks)
      .forEach((task) => {
        const context = task.primary_context;
        const cards = groups.get(context) ?? [];
        cards.push({ task, relativeProject: relativeProjectPath(task.project, selectedProject) });
        groups.set(context, cards);
      });

    return {
      status,
      groups: [...groups.entries()]
        .sort(([left], [right]) => compareContextGroups(left, right))
        .map(([context, cards]) => ({ context, cards })),
    };
  });
}
