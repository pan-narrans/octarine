import { create } from "zustand";
import type {
  CaptureContext,
  CreateTaskError,
  CreateTaskResult,
  TaskDraft,
  TaskDraftPreview,
} from "../../types";
import { useTaskStore } from "../../hooks/use-task-store";
import { createTask, parseCreateTaskError, previewTaskDraft, undoCreatedTask } from "./ipc";

type CreationPhase = "idle" | "previewing" | "ready" | "creating" | "created" | "undoing" | "error";

interface TaskCreationState {
  phase: CreationPhase;
  preview: TaskDraftPreview | null;
  result: CreateTaskResult | null;
  error: CreateTaskError | null;
  setPreview: (preview: TaskDraftPreview) => void;
  previewCompact: (input: string, context: CaptureContext) => Promise<TaskDraftPreview | null>;
  createDraft: (operationId: string, draft: TaskDraft) => Promise<CreateTaskResult | null>;
  undoLastCreation: () => Promise<boolean>;
  reset: () => void;
}

let previewSequence = 0;
let pendingCreation: Promise<CreateTaskResult | null> | null = null;

function normalizeError(error: unknown): CreateTaskError {
  return (
    parseCreateTaskError(error) ?? {
      code: "operation_failed",
      message: error instanceof Error ? error.message : String(error),
    }
  );
}

export const useTaskCreationStore = create<TaskCreationState>((set, get) => ({
  phase: "idle",
  preview: null,
  result: null,
  error: null,

  setPreview: (preview) => set({ phase: "ready", preview, error: null }),

  previewCompact: async (input, context) => {
    const sequence = ++previewSequence;
    set({ phase: "previewing", error: null });
    try {
      const preview = await previewTaskDraft(input, context);
      if (sequence !== previewSequence) return null;
      set({ phase: "ready", preview, error: null });
      return preview;
    } catch (error) {
      if (sequence !== previewSequence) return null;
      set({ phase: "error", preview: null, error: normalizeError(error) });
      return null;
    }
  },

  createDraft: (operationId, draft) => {
    if (pendingCreation) return pendingCreation;
    set({ phase: "creating", error: null });
    pendingCreation = createTask(operationId, draft)
      .then((result) => {
        useTaskStore.getState().reconcileCreatedTask(result.task);
        set({ phase: "created", result, error: null });
        return result;
      })
      .catch((error: unknown) => {
        set({ phase: "error", error: normalizeError(error) });
        return null;
      })
      .finally(() => {
        pendingCreation = null;
      });
    return pendingCreation;
  },

  undoLastCreation: async () => {
    const result = get().result;
    if (!result || get().phase === "undoing") return false;
    set({ phase: "undoing", error: null });
    try {
      await undoCreatedTask(result.undoReceipt);
      await useTaskStore.getState().fetchTasks();
      set({ phase: "idle", result: null, preview: null, error: null });
      return true;
    } catch (error) {
      set({ phase: "error", error: normalizeError(error) });
      return false;
    }
  },

  reset: () => {
    previewSequence += 1;
    set({ phase: "idle", preview: null, result: null, error: null });
  },
}));
