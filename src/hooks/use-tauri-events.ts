import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTaskStore } from "./use-task-store";

export function useTauriEvents(): void {
  const fetchTasks = useTaskStore((state) => state.fetchTasks);
  const fetchCustomViews = useTaskStore((state) => state.fetchCustomViews);

  useEffect(() => {
    let unlistenFn: (() => void) | null = null;

    const setupListener = async () => {
      try {
        unlistenFn = await listen("vault-changed", () => {
          console.log("Vault change event detected! Refreshing store reactively...");
          fetchTasks();
          fetchCustomViews();
        });
      } catch (e) {
        console.error("Failed to bind Tauri event listener:", e);
      }
    };

    setupListener();

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [fetchTasks, fetchCustomViews]);
}
