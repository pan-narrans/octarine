import { useEffect, useRef, useState } from "react";
import type { CaptureContext, CreateTaskResult } from "../../types";
import { useNotificationStore } from "../notifications/use-notification-store";
import { undoCreatedTask, writeErrorMessage } from "./ipc";
import { useTaskCreationStore } from "./use-task-creation-store";

interface TaskCreationControllerOptions {
  selectedSection: string;
  refreshTasks: () => Promise<unknown>;
  refreshFiles: () => Promise<unknown>;
  openFile: (path: string) => Promise<unknown>;
}

export function captureContextForSection(selectedSection: string): CaptureContext {
  if (selectedSection.startsWith("proj:")) {
    return { project: selectedSection.slice("proj:".length), contexts: [], tags: [] };
  }
  if (selectedSection.startsWith("ctx:")) {
    return { project: null, contexts: [selectedSection.slice("ctx:".length)], tags: [] };
  }
  if (selectedSection.startsWith("tag:")) {
    return { project: null, contexts: [], tags: [selectedSection.slice("tag:".length)] };
  }
  return { project: null, contexts: [], tags: [] };
}

export function useTaskCreationController({
  selectedSection,
  refreshTasks,
  refreshFiles,
  openFile,
}: TaskCreationControllerOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [captureContext, setCaptureContext] = useState<CaptureContext>({
    project: null,
    contexts: [],
    tags: [],
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { phase, preview, error, previewCompact, createDraft, setPreview, reset } =
    useTaskCreationStore();
  const { notifications, push, dismiss } = useNotificationStore();

  useEffect(() => {
    if (!isOpen) return;
    if (!input.trim()) {
      reset();
      dismiss("task-preview-error");
      return;
    }

    const timer = window.setTimeout(() => {
      void previewCompact(input, captureContext).then((nextPreview) => {
        if (nextPreview) {
          dismiss("task-preview-error");
          return;
        }
        const previewError = useTaskCreationStore.getState().error;
        if (previewError && previewError.code !== "invalid_draft") {
          push({
            id: "task-preview-error",
            kind: "error",
            title: "Task destination unavailable",
            message: previewError.message,
          });
        }
      });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [captureContext, dismiss, input, isOpen, previewCompact, push, reset]);

  const returnFocus = () => window.requestAnimationFrame(() => triggerRef.current?.focus());

  const open = () => {
    reset();
    dismiss("task-preview-error");
    setCaptureContext(captureContextForSection(selectedSection));
    setInput("");
    setExpanded(false);
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    reset();
    dismiss("task-preview-error");
    returnFocus();
  };

  const openDestination = async (path: string) => {
    try {
      await refreshFiles();
      await openFile(path);
    } catch (openError) {
      push({
        id: "task-open-error",
        kind: "error",
        title: "Could not open task file",
        message: writeErrorMessage(openError),
      });
    }
  };

  const undo = async (result: CreateTaskResult, notificationId: string) => {
    try {
      await undoCreatedTask(result.undoReceipt);
      await refreshTasks();
      await refreshFiles();
      dismiss(notificationId);
      push(
        {
          id: `task-undone-${result.task.hash}`,
          kind: "info",
          title: "Task creation undone",
          message: result.task.description,
        },
        6_000,
      );
    } catch (undoError) {
      push({
        id: `task-undo-error-${result.task.hash}`,
        kind: "error",
        title: "Could not undo task creation",
        message: writeErrorMessage(undoError),
      });
    }
  };

  const create = async () => {
    if (!preview || phase === "creating") return;
    const destinationPath = preview.destinationPath;
    const result = await createDraft(crypto.randomUUID(), preview.draft);

    if (result) {
      setIsOpen(false);
      reset();
      await refreshFiles();
      const warningCode = result.warning?.code;
      const kind =
        warningCode === "appended_at_eof" ? "info" : result.warning ? "warning" : "success";
      const notificationId = `task-created-${result.task.hash}`;
      push(
        {
          id: notificationId,
          kind,
          title:
            kind === "success"
              ? "Task created"
              : kind === "info"
                ? "Task created at end of file"
                : "Task created with fallback",
          message: result.warning?.message ?? result.task.description,
          detail: result.destinationPath,
          actions: [
            { label: "Undo", onClick: () => void undo(result, notificationId) },
            { label: "Open file", onClick: () => void openDestination(result.destinationPath) },
          ],
        },
        kind === "warning" ? 10_000 : 6_000,
      );
      returnFocus();
      return;
    }

    const createError = useTaskCreationStore.getState().error;
    if (!createError || createError.code === "invalid_draft") return;
    if (createError.code === "index_failed") {
      setIsOpen(false);
      reset();
      push({
        id: "task-index-failed",
        kind: "warning",
        title: "Task saved; list not refreshed",
        message: createError.message,
        detail: destinationPath,
        actions: [
          { label: "Retry refresh", onClick: () => void refreshTasks() },
          { label: "Open file", onClick: () => void openDestination(destinationPath) },
        ],
      });
      returnFocus();
      return;
    }

    push({
      id: "task-create-error",
      kind: "error",
      title: "Task not created",
      message: createError.message,
    });
  };

  const setRawMarkdown = (rawMarkdown: string) => {
    if (!preview) return;
    setPreview({ ...preview, draft: { ...preview.draft, rawMarkdown } });
  };

  return {
    isOpen,
    input,
    expanded,
    creating: phase === "creating",
    preview,
    validationMessage: error?.code === "invalid_draft" ? error.message : null,
    notifications,
    triggerRef,
    open,
    close,
    create,
    dismissNotification: dismiss,
    setInput,
    setExpanded,
    setPreview,
    setRawMarkdown,
  };
}
