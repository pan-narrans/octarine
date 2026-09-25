import type { Meta, StoryObj } from "@storybook/react-vite";
import type { FileNode } from "../types";
import { FileTree } from "./FileTree";

const projectTree: FileNode = {
  name: "vault",
  path: "/vault",
  is_dir: true,
  children: [
    {
      name: "Projects",
      path: "/vault/Projects",
      is_dir: true,
      children: [
        {
          name: "Octarine.md",
          path: "/vault/Projects/Octarine.md",
          is_dir: false,
          children: null,
        },
        {
          name: "Roadmap.md",
          path: "/vault/Projects/Roadmap.md",
          is_dir: false,
          children: null,
        },
      ],
    },
    {
      name: "inbox.md",
      path: "/vault/inbox.md",
      is_dir: false,
      children: null,
    },
  ],
};

const meta = {
  title: "Navigation/FileTree",
  component: FileTree,
  args: {
    node: projectTree,
    selectedPath: null,
    onSelectFile: () => undefined,
    onCreateFile: async () => undefined,
    onCreateFolder: async () => undefined,
    onRename: async () => undefined,
    onDelete: async () => undefined,
  },
  decorators: [
    (Story) => (
      <div
        style={{
          width: "320px",
          maxWidth: "calc(100vw - 32px)",
          minHeight: "360px",
          padding: "16px",
          background: "var(--bg-sidebar)",
          border: "1px solid var(--border-card)",
          borderRadius: "12px",
        }}
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FileTree>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Folder: Story = {};

export const File: Story = {
  args: {
    node: projectTree.children?.[1] ?? projectTree,
  },
};

export const Expanded: Story = {
  args: {
    initialOpen: true,
  },
};

export const SelectedFile: Story = {
  args: {
    initialOpen: true,
    selectedPath: "/vault/inbox.md",
  },
};

export const Renaming: Story = {
  args: {
    initialEditMode: "rename",
  },
};

export const ReadOnly: Story = {
  args: {
    initialOpen: true,
    readOnly: true,
  },
};

export const Narrow: Story = {
  tags: ["visual"],
  args: {
    initialOpen: true,
    selectedPath: "/vault/Projects/Octarine.md",
  },
  globals: { viewport: { value: "octarineNarrow", isRotated: false } },
};
