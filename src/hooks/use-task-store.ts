import { create } from "zustand";
import { invoke } from "@tauri-apps/api/tauri";
import { Task, CustomView, isTask, isCustomView } from "../types";

interface TaskState {
  tasks: Task[];
  customViews: CustomView[];
  loading: boolean;
  error: string | null;
  activeFilter: string;

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
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  customViews: [],
  loading: false,
  error: null,
  activeFilter: "",

  setFilter: (filter: string) => {
    set({ activeFilter: filter });
    get().fetchTasks(filter);
  },

  fetchTasks: async (filter?: string) => {
    set({ loading: true, error: null });
    try {
      const activeFilter = filter !== undefined ? filter : get().activeFilter;
      // Invoke Tauri Rust Command
      const rawTasks = await invoke("get_tasks", { filter: activeFilter || null });
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
      const rawViews = await invoke("get_custom_views");
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
      await invoke("update_task_status", {
        filePath,
        lineNumber,
        originalRawMarkdown,
        newStatus,
      });
      // Re-fetch immediately to align with the new cached/written state!
      await get().fetchTasks();
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : String(e), loading: false });
    }
  },
}));
