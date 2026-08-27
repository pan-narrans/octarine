import type { Meta, StoryObj } from "@storybook/react-vite";
import { WorkspaceState } from "./WorkspaceState";

const meta = {
  title: "States/WorkspaceState",
  component: WorkspaceState,
  args: {
    kind: "empty",
  },
  decorators: [
    (Story) => (
      <div style={{ minHeight: "440px", padding: "48px", background: "var(--bg-space)" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof WorkspaceState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const Loading: Story = { args: { kind: "loading" } };
