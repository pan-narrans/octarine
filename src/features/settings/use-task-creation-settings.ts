import { useCallback, useEffect, useState } from "react";
import type {
  TaskCreationSettingsErrors,
  TaskCreationSettingsValue,
} from "../../components/TaskCreationSettings";
import { useNotificationStore } from "../notifications/use-notification-store";
import { getTaskCreationConfig, setTaskCreationConfig } from "./ipc";
import {
  serverErrorToSettingsErrors,
  taskCreationConfigToValue,
  taskCreationValueToConfig,
  validateTaskCreationSettings,
} from "./task-creation-settings-model";

interface Options {
  enabled: boolean;
  onSaved: () => Promise<void>;
}

export function useTaskCreationSettings({ enabled, onSaved }: Options) {
  const [value, setValueState] = useState<TaskCreationSettingsValue | null>(null);
  const [errors, setErrors] = useState<TaskCreationSettingsErrors>({});
  const [migrationSource, setMigrationSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadAttempted, setLoadAttempted] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { push } = useNotificationStore();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const config = await getTaskCreationConfig();
      const nextValue = taskCreationConfigToValue(config);
      setValueState(nextValue);
      setErrors(validateTaskCreationSettings(nextValue));
      setMigrationSource(config.migrationSource);
    } catch (error) {
      setLoadError(String(error));
      push({
        id: "task-settings-load-error",
        kind: "error",
        title: "Could not load task settings",
        message: String(error),
      });
    } finally {
      setLoadAttempted(true);
      setLoading(false);
    }
  }, [push]);

  useEffect(() => {
    if (enabled && value === null && !loading && !loadAttempted) void load();
  }, [enabled, load, loadAttempted, loading, value]);

  const setValue = (nextValue: TaskCreationSettingsValue) => {
    setValueState(nextValue);
    setErrors(validateTaskCreationSettings(nextValue));
    setSaved(false);
  };

  const save = async () => {
    if (!value || saving) return;
    const clientErrors = validateTaskCreationSettings(value);
    setErrors(clientErrors);
    if (Object.values(clientErrors).some(Boolean)) return;

    setSaving(true);
    try {
      const savedConfig = await setTaskCreationConfig(
        taskCreationValueToConfig(value, migrationSource),
      );
      const nextValue = taskCreationConfigToValue(savedConfig);
      setValueState(nextValue);
      setMigrationSource(savedConfig.migrationSource);
      setErrors({});
      setSaved(true);
      await onSaved();
      push(
        {
          id: "task-settings-saved",
          kind: "success",
          title: "Task settings saved",
          message: "New tasks now use updated routing and templates.",
        },
        6_000,
      );
    } catch (error) {
      const message = String(error);
      setErrors(serverErrorToSettingsErrors(message));
      push({
        id: "task-settings-save-error",
        kind: "error",
        title: "Task settings not saved",
        message,
      });
    } finally {
      setSaving(false);
    }
  };

  return {
    value,
    errors,
    migrationSource,
    loading,
    loadError,
    saving,
    saved,
    setValue,
    save,
    load,
  };
}
