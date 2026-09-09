import { create } from "zustand";
import { Task, CustomView, isTask, isCustomView } from "../types";
import {
  getCustomViews,
  getTasks,
  isWriteConflict,
  moveTask as moveTaskOnDisk,
  updateTaskStatus as updateTaskStatusOnDisk,
  writeErrorMessage,
} from "../features/tasks/ipc";
import { applyKanbanMove, type KanbanMoveIntent } from "../features/kanban/move";

interface TaskState {
  tasks: Task[];
  customViews: CustomView[];
  loading: boolean;
  error: string | null;
  activeFilter: string;
  pendingTaskMoves: string[];

  // Actions
  setFilter: (filter: string) => void;
  fetchTasks: (filter?: string) => Promise<void>;
  fetchCustomViews: () => Promise<void>;
  updateTaskStatus: (
    filePath: string,
    lineNumber: number,
    originalRawMarkdown: string,
    newStatus: string,
  ) => Promise<void>;
  moveTask: (task: Task, intent: KanbanMoveIntent) => Promise<void>;
  reconcileCreatedTask: (task: Task) => void;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  customViews: [],
  loading: false,
  error: null,
  activeFilter: "",
  pendingTaskMoves: [],

  reconcileCreatedTask: (task: Task) => {
    set({
      tasks: [
        task,
        ...get().tasks.filter(
          (candidate) =>
            candidate.hash !== task.hash &&
            !(candidate.file_path === task.file_path && candidate.line_number === task.line_number),
        ),
      ],
    });
  },

  setFilter: (filter: string) => {
    set({ activeFilter: filter });
    get().fetchTasks(filter);
  },

  fetchTasks: async (filter?: string) => {
    set({ loading: true, error: null });
    try {
      const activeFilter = filter !== undefined ? filter : get().activeFilter;
      const rawTasks = await getTasks(activeFilter || null);
      if (Array.isArray(rawTasks)) {
        const validatedTasks = rawTasks.filter(isTask);
        set({ tasks: validatedTasks, loading: false });
      } else {
        throw new Error("Invalid payload format received from get_tasks.");
      }
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : String(e), loading: false });
    }
  },

  fetchCustomViews: async () => {
    try {
      const rawViews = await getCustomViews();
      if (Array.isArray(rawViews)) {
        const validatedViews = rawViews.filter(isCustomView);
        set({ customViews: validatedViews });
      }
    } catch (e: unknown) {
      console.error("Failed to fetch custom views:", e);
    }
  },

  updateTaskStatus: async (
    filePath: string,
    lineNumber: number,
    originalRawMarkdown: string,
    newStatus: string,
  ) => {
    set({ loading: true, error: null });
    try {
      await updateTaskStatusOnDisk(filePath, lineNumber, originalRawMarkdown, newStatus);
      // Re-fetch immediately to align with the new cached/written state!
      await get().fetchTasks();
    } catch (e: unknown) {
      if (isWriteConflict(e)) await get().fetchTasks();
      set({ error: writeErrorMessage(e), loading: false });
    }
  },

  moveTask: async (task: Task, intent: KanbanMoveIntent) => {
    if (get().pendingTaskMoves.includes(task.hash)) return;

    const previousTasks = get().tasks;
    set({
      tasks: previousTasks.map((candidate) =>
        candidate.hash === task.hash ? applyKanbanMove(candidate, intent) : candidate,
      ),
      pendingTaskMoves: [...get().pendingTaskMoves, task.hash],
      error: null,
    });

    try {
      await moveTaskOnDisk({
        filePath: task.file_path || "",
        lineNumber: task.line_number,
        originalRawMarkdown: task.raw_markdown,
        newStatus: intent.newStatus,
        newPrimaryContext: intent.newPrimaryContext,
      });
      await get().fetchTasks();
    } catch (e: unknown) {
      if (isWriteConflict(e)) {
        await get().fetchTasks();
      } else {
        set({
          tasks: get().tasks.map((candidate) => (candidate.hash === task.hash ? task : candidate)),
        });
      }
      set({ error: writeErrorMessage(e), loading: false });
    } finally {
      set({
        pendingTaskMoves: get().pendingTaskMoves.filter((hash) => hash !== task.hash),
      });
    }
  },
}));
