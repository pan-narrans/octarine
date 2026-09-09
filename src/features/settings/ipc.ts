import { invoke } from "@tauri-apps/api/tauri";
import type { TaskCreationConfig } from "../../generated/ipc/TaskCreationConfig";

export const getTaskCreationConfig = (): Promise<TaskCreationConfig> =>
  invoke("get_task_creation_config");

export const setTaskCreationConfig = (settings: TaskCreationConfig): Promise<TaskCreationConfig> =>
  invoke("set_task_creation_config", { settings });
