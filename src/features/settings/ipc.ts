import { invoke } from "@tauri-apps/api/core";
import type { AvailableUpdate } from "../../generated/ipc/AvailableUpdate";
import type { TaskCreationConfig } from "../../generated/ipc/TaskCreationConfig";
import type { UpdateChannel } from "../../generated/ipc/UpdateChannel";
import type { UpdateRuntimeInfo } from "../../generated/ipc/UpdateRuntimeInfo";

export const getTaskCreationConfig = (): Promise<TaskCreationConfig> =>
  invoke("get_task_creation_config");

export const setTaskCreationConfig = (settings: TaskCreationConfig): Promise<TaskCreationConfig> =>
  invoke("set_task_creation_config", { settings });

export const getUpdateRuntimeInfo = (): Promise<UpdateRuntimeInfo> =>
  invoke("get_update_runtime_info");

export const setUpdateChannel = (channel: UpdateChannel): Promise<UpdateRuntimeInfo> =>
  invoke("set_update_channel", { channel });

export const checkForUpdate = (): Promise<AvailableUpdate | null> => invoke("check_for_update");

export const installUpdate = (expectedVersion: string): Promise<void> =>
  invoke("install_update", { expectedVersion });
