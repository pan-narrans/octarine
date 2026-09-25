import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ProjectMergeRecoveryBundle } from "../types";
import { ProjectMergeRecoveryList } from "./ProjectMergeWorkflow";

const bundles: ProjectMergeRecoveryBundle[] = [
  {
    operationId: "0123456789abcdef01234567",
    recoveryPath: ".octarine/recovery/0123456789abcdef01234567",
    createdAt: "2026-09-11T08:30:00Z",
    completedAt: "2026-09-11T08:31:18Z",
    expiresAt: "2026-10-11T08:31:18Z",
    sourceProject: "product/launch",
    destinationProject: "product/platform",
    status: "successful",
    sizeBytes: 184_320,
    completedOperations: 14,
    pendingOperations: 0,
  },
  {
    operationId: "fedcba987654321001234567",
    recoveryPath: ".octarine/recovery/fedcba987654321001234567",
    createdAt: "2026-09-09T17:12:00Z",
    completedAt: null,
    expiresAt: null,
    sourceProject: "client/archive",
    destinationProject: "client/current",
    status: "stopped",
    sizeBytes: 2_441_216,
    completedOperations: 7,
    pendingOperations: 4,
  },
];

function SettingsSurface(props: React.ComponentProps<typeof ProjectMergeRecoveryList>) {
  return (
    <main className="project-merge-recovery-review-surface">
      <header>
        <h1>Task settings</h1>
        <p>Task routing, templates, and local recovery.</p>
      </header>
      <ProjectMergeRecoveryList {...props} />
    </main>
  );
}

const meta = {
  title: "Settings/ProjectMergeRecovery",
  component: ProjectMergeRecoveryList,
  render: (args) => <SettingsSurface {...args} />,
  args: {
    bundles,
    onOpen: () => undefined,
    onDelete: () => undefined,
  },
} satisfies Meta<typeof ProjectMergeRecoveryList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Bundles: Story = {};
export const Empty: Story = { args: { bundles: [] } };
export const Narrow: Story = {
  tags: ["visual"],
  globals: { viewport: { value: "octarineNarrow", isRotated: false } },
};
