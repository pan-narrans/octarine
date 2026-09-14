import { useCallback, useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { AvailableUpdate } from "../../generated/ipc/AvailableUpdate";
import type { UpdateChannel } from "../../generated/ipc/UpdateChannel";
import type { UpdateRuntimeInfo } from "../../generated/ipc/UpdateRuntimeInfo";
import { useNotificationStore } from "../notifications/use-notification-store";
import { checkForUpdate, getUpdateRuntimeInfo, installUpdate, setUpdateChannel } from "./ipc";
import { distributionLabel } from "./update-model";
import { startUpdateScheduler } from "./update-scheduler";
import { SingleFlight } from "./single-flight";

const RELEASES_URL = "https://github.com/pan-narrans/octarine/releases";

export function useApplicationUpdates({ automaticCheck }: { automaticCheck: boolean }) {
  const [runtime, setRuntime] = useState<UpdateRuntimeInfo | null>(null);
  const [available, setAvailable] = useState<AvailableUpdate | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [savingChannel, setSavingChannel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runtimeRef = useRef<UpdateRuntimeInfo | null>(null);
  const checkFlightRef = useRef(new SingleFlight<AvailableUpdate | null>());
  const channelGenerationRef = useRef(0);
  const installingRef = useRef(false);
  const installRef = useRef<(update: AvailableUpdate) => Promise<void>>(async () => undefined);
  const checkRef = useRef<(announceCurrent?: boolean) => Promise<void>>(async () => undefined);
  const push = useNotificationStore((state) => state.push);
  const dismiss = useNotificationStore((state) => state.dismiss);

  const install = useCallback(
    async (update: AvailableUpdate) => {
      if (installingRef.current) return;
      installingRef.current = true;
      setInstalling(true);
      setError(null);
      try {
        await installUpdate(update.version);
      } catch (installError) {
        const message = String(installError);
        setError(message);
        installingRef.current = false;
        setInstalling(false);
        push({
          id: "application-update-install-error",
          kind: "error",
          title: "Update not installed",
          message,
          actions: [
            { label: "Retry", onClick: () => void installRef.current(update) },
            {
              label: "Open download page",
              onClick: () => void openUrl(update.downloadPageUrl).catch(console.error),
            },
          ],
        });
      }
    },
    [push],
  );

  const beginCheck = useCallback((): Promise<AvailableUpdate | null> => {
    return checkFlightRef.current.run(async () => {
      const generation = channelGenerationRef.current;
      setChecking(true);
      setError(null);
      try {
        const update = await checkForUpdate();
        if (generation !== channelGenerationRef.current) return update;
        setAvailable(update);
        if (update) {
          const info = runtimeRef.current;
          const installationSupported = info?.installationSupported ?? false;
          push({
            id: "application-update-available",
            kind: "info",
            title: `Octarine ${update.version} available`,
            message: installationSupported
              ? `${update.channel === "beta" ? "Beta" : "Stable"} update will restart Octarine immediately after installation.`
              : `${distributionLabel(info?.distribution ?? "unknown")} build cannot install this update.`,
            detail: update.notes ?? undefined,
            actions: installationSupported
              ? [
                  {
                    label: "Update now",
                    onClick: () => {
                      dismiss("application-update-available");
                      void installRef.current(update);
                    },
                  },
                  {
                    label: "Later",
                    onClick: () => dismiss("application-update-available"),
                  },
                ]
              : [
                  {
                    label: "Open download page",
                    onClick: () => void openUrl(update.downloadPageUrl).catch(console.error),
                  },
                ],
          });
        }
        return update;
      } catch (checkError) {
        const message = String(checkError);
        if (generation === channelGenerationRef.current) setError(message);
        throw checkError;
      } finally {
        setChecking(false);
      }
    });
  }, [dismiss, push]);

  const check = useCallback(
    async (announceCurrent = true) => {
      try {
        const update = await beginCheck();
        if (!update && announceCurrent) {
          push(
            {
              id: "application-update-current",
              kind: "success",
              title: "Octarine is current",
              message: "No different release is available on selected channel.",
            },
            6_000,
          );
        }
      } catch (checkError) {
        if (announceCurrent) {
          const message = String(checkError);
          push({
            id: "application-update-check-error",
            kind: "warning",
            title: "Could not check for updates",
            message,
            actions: [
              { label: "Retry", onClick: () => void checkRef.current(true) },
              {
                label: "Open download page",
                onClick: () => void openUrl(RELEASES_URL).catch(console.error),
              },
            ],
          });
        }
      }
    },
    [beginCheck, push],
  );

  installRef.current = install;
  checkRef.current = check;

  useEffect(() => {
    let active = true;
    void getUpdateRuntimeInfo()
      .then((info) => {
        if (active) {
          runtimeRef.current = info;
          setRuntime(info);
        }
      })
      .catch((loadError) => {
        if (active) setError(String(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!automaticCheck || !runtime?.checkConfigured) return;
    return startUpdateScheduler({ check: () => check(false) });
  }, [automaticCheck, check, runtime?.checkConfigured]);

  const changeChannel = async (channel: UpdateChannel) => {
    if (!runtime?.channelMutable || savingChannel || channel === runtime.channel) return;
    setSavingChannel(true);
    setError(null);
    try {
      const updated = await setUpdateChannel(channel);
      const currentCheck = checkFlightRef.current.current;
      channelGenerationRef.current += 1;
      runtimeRef.current = updated;
      setRuntime(updated);
      setAvailable(null);
      if (currentCheck) await currentCheck.catch(() => undefined);
      await check(false);
    } catch (saveError) {
      const message = String(saveError);
      setError(message);
      push({
        id: "application-update-channel-error",
        kind: "error",
        title: "Update channel not changed",
        message,
      });
    } finally {
      setSavingChannel(false);
    }
  };

  return {
    runtime,
    available,
    loading,
    checking,
    installing,
    savingChannel,
    error,
    check,
    install,
    changeChannel,
  };
}
