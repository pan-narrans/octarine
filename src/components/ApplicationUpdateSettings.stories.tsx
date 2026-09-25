import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { UpdateChannel } from "../generated/ipc/UpdateChannel";
import type { UpdateRuntimeInfo } from "../generated/ipc/UpdateRuntimeInfo";
import {
  ApplicationUpdateSettings,
  type ApplicationUpdateSettingsProps,
} from "./ApplicationUpdateSettings";

const directRuntime: UpdateRuntimeInfo = {
  currentVersion: "0.9.0",
  channel: "stable",
  channelMutable: true,
  distribution: "direct",
  installStrategy: "self_update",
  checkConfigured: true,
  installationSupported: true,
};

function ReviewHarness(props: ApplicationUpdateSettingsProps) {
  const [runtime, setRuntime] = useState(props.runtime);
  const changeChannel = (channel: UpdateChannel) => {
    setRuntime((current) => ({ ...current, channel }));
    props.onChannelChange(channel);
  };
  return (
    <main className="task-settings-review-surface">
      <ApplicationUpdateSettings {...props} runtime={runtime} onChannelChange={changeChannel} />
    </main>
  );
}

const meta = {
  title: "Settings/ApplicationUpdateSettings",
  component: ApplicationUpdateSettings,
  render: (args) => <ReviewHarness {...args} />,
  args: {
    runtime: directRuntime,
    available: null,
    checking: false,
    installing: false,
    savingChannel: false,
    error: null,
    onChannelChange: () => undefined,
    onCheck: () => undefined,
    onInstall: () => undefined,
  },
} satisfies Meta<typeof ApplicationUpdateSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Direct: Story = {};

export const Available: Story = {
  args: {
    available: {
      currentVersion: "0.9.0",
      version: "1.0.0",
      notes: "Signed stable release with safer local updates.",
      publishedAt: "2026-09-13T16:00:00Z",
      channel: "stable",
      downloadPageUrl: "https://github.com/pan-narrans/octarine/releases/tag/v1.0.0",
    },
  },
};

export const NarrowAvailable: Story = {
  tags: ["visual"],
  args: Available.args,
  globals: { viewport: { value: "octarineNarrow", isRotated: false } },
};

export const Unconfigured: Story = {
  args: {
    runtime: {
      ...directRuntime,
      distribution: "unknown",
      installStrategy: "unsupported",
      checkConfigured: false,
      installationSupported: false,
    },
  },
};

export const Error: Story = {
  args: { error: "Update endpoint did not return valid signed metadata." },
};
