import { useTaskStore } from "../../hooks/use-task-store";
import { useNotificationStore } from "../notifications/use-notification-store";
import { writeErrorMessage } from "../tasks/ipc";
import { reindexFile, writeFileContent } from "./ipc";

export async function saveEditorFile(
  path: string,
  content: string,
  originalContent: string,
): Promise<void> {
  const notifications = useNotificationStore.getState();
  const indexId = `editor-index:${path}`;
  try {
    const indexed = await writeFileContent(path, content, originalContent);
    notifications.dismiss(`editor-save:${path}`);
    if (indexed) {
      notifications.dismiss(indexId);
      return;
    }
    notifications.push({
      id: indexId,
      kind: "error",
      title: "Note saved; index refresh failed",
      message: "Markdown is saved. Refresh indexed tasks before continuing task operations.",
      actions: [
        {
          label: "Refresh",
          onClick: async () => {
            try {
              await reindexFile(path);
              await useTaskStore.getState().fetchTasks();
              notifications.dismiss(indexId);
            } catch (error) {
              notifications.push({
                id: indexId,
                kind: "error",
                title: "Index refresh failed",
                message: writeErrorMessage(error),
              });
            }
          },
        },
      ],
    });
  } catch (error) {
    notifications.push({
      id: `editor-save:${path}`,
      kind: "error",
      title: "Note not saved",
      message: writeErrorMessage(error),
    });
    throw error;
  }
}
