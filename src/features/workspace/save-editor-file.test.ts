import { beforeEach, expect, it, vi } from "vitest";
import { useNotificationStore } from "../notifications/use-notification-store";
import { useTaskStore } from "../../hooks/use-task-store";
import { reindexFile, writeFileContent } from "./ipc";
import { saveEditorFile } from "./save-editor-file";

vi.mock("./ipc", () => ({ writeFileContent: vi.fn(), reindexFile: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  useNotificationStore.getState().clear();
});

it("shows conflict without resolving save or losing structured message", async () => {
  const conflict = { code: "source_changed", message: "File changed on disk." };
  vi.mocked(writeFileContent).mockRejectedValue(conflict);
  await expect(saveEditorFile("/vault/note.md", "Local", "Original")).rejects.toEqual(conflict);
  expect(useNotificationStore.getState().notifications[0]).toMatchObject({
    title: "Note not saved",
    message: conflict.message,
  });
});

it("acknowledges durable write and recovery reindexes before fetching tasks", async () => {
  vi.mocked(writeFileContent).mockResolvedValue(false);
  const fetchTasks = vi.spyOn(useTaskStore.getState(), "fetchTasks").mockResolvedValue();
  vi.mocked(reindexFile).mockImplementation(async () => {
    expect(fetchTasks).not.toHaveBeenCalled();
  });
  await expect(saveEditorFile("/vault/note.md", "Saved", "Original")).resolves.toBeUndefined();
  const notification = useNotificationStore.getState().notifications[0];
  expect(notification.title).toBe("Note saved; index refresh failed");
  await notification.actions![0].onClick();
  expect(reindexFile).toHaveBeenCalledWith("/vault/note.md");
  expect(fetchTasks).toHaveBeenCalledOnce();
  expect(useNotificationStore.getState().notifications).toEqual([]);
  fetchTasks.mockRestore();
});

it("failed recovery remains visible and does not retry Markdown write", async () => {
  vi.mocked(writeFileContent).mockResolvedValue(false);
  vi.mocked(reindexFile).mockRejectedValue({
    code: "operation_failed",
    message: "Index unavailable.",
  });
  await saveEditorFile("/vault/note.md", "Saved", "Original");
  await useNotificationStore.getState().notifications[0].actions![0].onClick();
  expect(useNotificationStore.getState().notifications[0]).toMatchObject({
    title: "Index refresh failed",
    message: "Index unavailable.",
  });
  expect(writeFileContent).toHaveBeenCalledOnce();
});
