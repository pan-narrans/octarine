import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ProjectRenamePlan, ProjectRenameRecoveryReport } from "../types";
import { ProjectRenameConfirmation } from "./ProjectRenameConfirmation";

const plan: ProjectRenamePlan = {
  planToken: "preview-token",
  sourceProject: "work",
  destinationProject: "job",
  caseOnly: false,
  rewrites: [
    { path: "projects/work.md", sourceFingerprint: "a", replacementCount: 4 },
    { path: "projects/work/client.md", sourceFingerprint: "b", replacementCount: 3 },
  ],
  moves: [
    {
      kind: "project_file",
      sourcePath: "projects/work.md",
      destinationPath: "projects/job.md",
      sourceFingerprint: "a",
    },
    {
      kind: "descendant_directory",
      sourcePath: "projects/work",
      destinationPath: "projects/job",
      sourceFingerprint: "b",
    },
  ],
  indexUpdates: [],
  collisions: [],
  impact: {
    rewrittenFiles: 2,
    rewrittenTokens: 7,
    filesystemMoves: 2,
    descendantProjects: 3,
  },
  warnings: ["Markdown links are not updated by project rename."],
};

const recovery: ProjectRenameRecoveryReport = {
  completedOperations: ["Rewrite task metadata in projects/work.md"],
  pendingOperations: ["Move projects/work.md to projects/job.md"],
  inspectPaths: ["projects/work.md", "projects/job.md", "projects/work/client.md"],
  guidance:
    "Refresh vault, inspect listed paths, then run rename preflight again. Files are not moved back automatically.",
};

const meta = {
  title: "Tasks/ProjectRenameConfirmation",
  component: ProjectRenameConfirmation,
  args: {
    plan,
    executing: false,
    recovery: null,
    onConfirm: () => undefined,
    onCancel: () => undefined,
  },
} satisfies Meta<typeof ProjectRenameConfirmation>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Hierarchy: Story = {};

export const CaseOnly: Story = {
  args: {
    plan: {
      ...plan,
      sourceProject: "work/client",
      destinationProject: "Work/Client",
      caseOnly: true,
      moves: [
        {
          kind: "project_file",
          sourcePath: "projects/work/client.md",
          destinationPath: "projects/Work/Client.md",
          sourceFingerprint: "a",
        },
        {
          kind: "descendant_directory",
          sourcePath: "projects/work/client",
          destinationPath: "projects/Work/Client",
          sourceFingerprint: "b",
        },
      ],
      impact: { ...plan.impact, descendantProjects: 0 },
    },
  },
};

export const Collision: Story = {
  args: {
    plan: {
      ...plan,
      collisions: [
        {
          code: "destination_exists",
          path: "projects/job.md",
          project: null,
          message: "Destination 'projects/job.md' already exists.",
        },
      ],
    },
  },
};

export const Renaming: Story = { args: { executing: true } };

export const PartialFailure: Story = { args: { recovery } };

export const Mobile: Story = {
  tags: ["visual"],
  globals: { viewport: { value: "octarineMobile", isRotated: false } },
};
