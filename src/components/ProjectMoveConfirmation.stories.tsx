import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProjectMoveConfirmation } from "./ProjectMoveConfirmation";

const meta = {
  title: "Tasks/ProjectMoveConfirmation",
  component: ProjectMoveConfirmation,
  args: {
    taskTitle: "Prepare launch brief",
    sourceProject: "work/octarine",
    destinationProject: "work/website",
    sourcePath: "/Users/me/Octarine/projects/work/octarine.md",
    destinationPath: "/Users/me/Octarine/projects/work/website.md",
    descendantCount: 3,
    moving: false,
    onConfirm: () => undefined,
    onCancel: () => undefined,
  },
} satisfies Meta<typeof ProjectMoveConfirmation>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ProjectToProject: Story = {};

export const RemoveProject: Story = {
  args: {
    destinationProject: null,
    destinationPath: "/Users/me/Octarine/inbox.md",
    descendantCount: 1,
  },
};

export const RootOnly: Story = {
  args: { descendantCount: 0 },
};

export const Moving: Story = {
  args: { moving: true },
};

export const Mobile: Story = {
  args: {
    destinationProject: null,
    destinationPath: "/Users/me/Octarine/journals/2026-09-09.md",
  },
  globals: { viewport: { value: "octarineMobile", isRotated: false } },
};
