import { useRef, useState } from "react";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { BUILT_IN_PERSPECTIVE } from "./default";
import { usePerspectiveRuntime } from "./use-perspective-runtime";

const runtimeFixture = {
  workspaceId: "workspace-a",
  configReads: 0,
  deferNextConfig: false,
};

function configText(perspectives: unknown[]): string {
  return JSON.stringify({ version: 1, perspectives });
}

function startRuntimeFixture(mode: "workspace-switch" | "selection-refresh") {
  runtimeFixture.workspaceId = "workspace-a";
  runtimeFixture.configReads = 0;
  runtimeFixture.deferNextConfig = false;
  mockIPC((command) => {
    if (command === "get_perspective_config") {
      runtimeFixture.configReads += 1;
      if (runtimeFixture.deferNextConfig) {
        runtimeFixture.deferNextConfig = false;
        return new Promise<string | null>(() => undefined);
      }
      if (mode === "workspace-switch") {
        const letter = runtimeFixture.workspaceId === "workspace-a" ? "a" : "b";
        return configText([
          { id: "default", title: `Workspace ${letter.toUpperCase()}`, sidebar: [] },
        ]);
      }
      return configText([BUILT_IN_PERSPECTIVE, { id: "writing", title: "Writing", sidebar: [] }]);
    }
    if (command === "get_perspective_workspace_roots") {
      return { vault: "/fixture/vault", journal: null, projects: null };
    }
    return undefined;
  });
}

function WorkspaceSwitchHarness({ rapidReturn = false }: { rapidReturn?: boolean }) {
  const [workspaceId, setWorkspaceId] = useState("workspace-a");
  const runtime = usePerspectiveRuntime(workspaceId);
  const workspaceARefresh = useRef(runtime.refreshConfiguration);
  if (workspaceId === "workspace-a") workspaceARefresh.current = runtime.refreshConfiguration;
  runtimeFixture.workspaceId = workspaceId;
  const [oldRefreshCompleted, setOldRefreshCompleted] = useState(false);

  return (
    <main className="perspective-runtime-test-harness">
      <button
        onClick={() => {
          if (rapidReturn) runtimeFixture.deferNextConfig = true;
          setWorkspaceId("workspace-b");
        }}
      >
        Switch to workspace B
      </button>
      {rapidReturn ? (
        <button onClick={() => setWorkspaceId("workspace-a")}>Return to workspace A</button>
      ) : (
        <button
          onClick={() => {
            runtimeFixture.deferNextConfig = true;
            void workspaceARefresh.current().then(() => setOldRefreshCompleted(true));
          }}
        >
          Run saved workspace A refresh
        </button>
      )}
      <output aria-label="Runtime workspace">{workspaceId}</output>
      <output aria-label="Active perspective">{runtime.activePerspective.title}</output>
      <output aria-label="Runtime loading">{runtime.loading ? "yes" : "no"}</output>
      <output aria-label="Configuration refreshing">
        {runtime.configurationRefreshing ? "yes" : "no"}
      </output>
      <output aria-label="Configuration read calls">{runtimeFixture.configReads}</output>
      <output aria-label="Old refresh completed">{oldRefreshCompleted ? "yes" : "no"}</output>
    </main>
  );
}

function SelectionHydrationHarness() {
  const runtime = usePerspectiveRuntime("/runtime-selection-test");

  return (
    <main className="perspective-runtime-test-harness">
      <button onClick={() => runtime.switchPerspective("writing")}>Choose Writing</button>
      <button onClick={() => void runtime.refreshConfiguration()}>Refresh configuration</button>
      <output aria-label="Active perspective">{runtime.activePerspective.id}</output>
      <output aria-label="Active perspective title">{runtime.activePerspective.title}</output>
      <output aria-label="Runtime warnings">{runtime.errors.join(" ")}</output>
      <output aria-label="Configuration refreshing">
        {runtime.configurationRefreshing ? "yes" : "no"}
      </output>
    </main>
  );
}

const meta = {
  title: "Perspectives/Runtime behavior",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const StaleWorkspaceRefresh: Story = {
  render: () => {
    startRuntimeFixture("workspace-switch");
    return <WorkspaceSwitchHarness />;
  },
  tags: ["visual"],
};

export const RapidReturnToWorkspace: Story = {
  render: () => {
    startRuntimeFixture("workspace-switch");
    return <WorkspaceSwitchHarness rapidReturn />;
  },
  tags: ["visual"],
};

export const SelectionSurvivesRefreshFailure: Story = {
  render: () => {
    startRuntimeFixture("selection-refresh");
    return <SelectionHydrationHarness />;
  },
  tags: ["visual"],
};
