import { Download, RefreshCw } from "lucide-react";
import type { AvailableUpdate } from "../generated/ipc/AvailableUpdate";
import type { UpdateChannel } from "../generated/ipc/UpdateChannel";
import type { UpdateRuntimeInfo } from "../generated/ipc/UpdateRuntimeInfo";
import { distributionLabel, updateStrategyDescription } from "../features/settings/update-model";
import { ActionButton, FormDropdown } from "../design-system/controls";

export interface ApplicationUpdateSettingsProps {
  runtime: UpdateRuntimeInfo;
  available: AvailableUpdate | null;
  checking: boolean;
  installing: boolean;
  savingChannel: boolean;
  error: string | null;
  onChannelChange: (channel: UpdateChannel) => void;
  onCheck: () => void;
  onInstall: (update: AvailableUpdate) => void;
}

export function ApplicationUpdateSettings({
  runtime,
  available,
  checking,
  installing,
  savingChannel,
  error,
  onChannelChange,
  onCheck,
  onInstall,
}: ApplicationUpdateSettingsProps) {
  const selfUpdate = runtime.installStrategy === "self_update";

  return (
    <section
      className="task-settings task-settings-card application-update-settings"
      aria-labelledby="updates-title"
    >
      <header className="task-settings-card-heading">
        <Download size={18} />
        <div>
          <h2 id="updates-title">Application updates</h2>
          <p>
            Version {runtime.currentVersion} · {distributionLabel(runtime.distribution)}
          </p>
        </div>
      </header>

      <div className="application-update-grid">
        <div className="form-group task-settings-field">
          <label htmlFor="application-update-channel">Release channel</label>
          <FormDropdown
            id="application-update-channel"
            value={runtime.channel}
            options={[
              { value: "stable", label: "Stable" },
              { value: "beta", label: "Beta" },
            ]}
            disabled={!runtime.channelMutable || savingChannel}
            onValueChange={(value) => onChannelChange(value as UpdateChannel)}
          />
        </div>

        <div className="application-update-actions">
          <ActionButton
            variant="secondary"
            onClick={onCheck}
            disabled={checking || installing || !runtime.checkConfigured}
          >
            <RefreshCw size={15} /> {checking ? "Checking…" : "Check now"}
          </ActionButton>
          {available && runtime.installationSupported && (
            <ActionButton
              variant="primary"
              onClick={() => onInstall(available)}
              disabled={installing}
            >
              {installing ? "Installing…" : `Install ${available.version} and restart`}
            </ActionButton>
          )}
        </div>
      </div>

      <p className="application-update-description">
        {updateStrategyDescription(runtime.installStrategy)}
      </p>
      {!runtime.checkConfigured && (
        <p className="application-update-warning">
          Update endpoint is not configured in this build.
        </p>
      )}
      {runtime.checkConfigured && !runtime.installationSupported && selfUpdate && (
        <p className="application-update-warning">
          Signing key is not configured, so this build cannot install updates.
        </p>
      )}
      {!selfUpdate && (
        <p className="application-update-warning">
          Self-update is available only from packaged Octarine downloads.
        </p>
      )}
      {error && (
        <p className="task-settings-field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
