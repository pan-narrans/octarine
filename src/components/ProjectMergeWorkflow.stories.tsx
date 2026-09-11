import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ProjectMergeConflict, ProjectMergePlan, ProjectMergeRecoveryReport } from "../types";
import { ProjectMergeWorkflow } from "./ProjectMergeWorkflow";

const markdownConflict: ProjectMergeConflict = {
  id: "markdown-readme",
  relativePath: "old/readme.md",
  sourcePath: "projects/old/readme.md",
  destinationPath: "projects/new/readme.md",
  kind: "markdown",
  sourceKind: "file",
  destinationKind: "file",
  sourceFingerprint: "source-markdown",
  destinationFingerprint: "destination-markdown",
  nestedFileCount: 1,
  byteSize: 1240,
  sourcePreview:
    "# API launch\n\n- [ ] Verify migration +new/api\n- [ ] Publish changelog +new/api\n",
  destinationPreview: "# API launch\n\n- [ ] Confirm release owner +new/api\n",
};

const fileConflict: ProjectMergeConflict = {
  id: "file-config",
  relativePath: "old/api/config.json",
  sourcePath: "projects/old/api/config.json",
  destinationPath: "projects/new/api/config.json",
  kind: "file",
  sourceKind: "file",
  destinationKind: "file",
  sourceFingerprint: "source-file",
  destinationFingerprint: "destination-file",
  nestedFileCount: 1,
  byteSize: 825,
  sourcePreview: null,
  destinationPreview: null,
};

const ignoredConflict: ProjectMergeConflict = {
  ...fileConflict,
  id: "ignored-token",
  relativePath: "old/api/.secrets/token",
  sourcePath: "projects/old/api/.secrets/token",
  destinationPath: "projects/new/api/.secrets/token",
  kind: "ignored",
  sourceFingerprint: "opaque-source",
  destinationFingerprint: "opaque-destination",
  byteSize: 96,
};

const mismatchConflict: ProjectMergeConflict = {
  ...fileConflict,
  id: "type-assets",
  relativePath: "old/assets",
  sourcePath: "projects/old/assets",
  destinationPath: "projects/new/assets",
  kind: "type_mismatch",
  sourceKind: "directory",
  destinationKind: "file",
  sourceFingerprint: "directory-metadata",
  destinationFingerprint: "file-hash",
  nestedFileCount: 37,
  byteSize: 246_780,
};

const extraConflicts = Array.from({ length: 18 }, (_, index): ProjectMergeConflict => ({
  ...fileConflict,
  id: `asset-${index}`,
  relativePath: `old/assets/illustration-${String(index + 1).padStart(2, "0")}.png`,
  sourcePath: `projects/old/assets/illustration-${index + 1}.png`,
  destinationPath: `projects/new/assets/illustration-${index + 1}.png`,
  sourceFingerprint: `source-${index}`,
  destinationFingerprint: `destination-${index}`,
  byteSize: 12_000 + index * 113,
}));

const plan: ProjectMergePlan = {
  planToken: "merge-preview-token",
  operationId: "0123456789abcdef01234567",
  sourceProject: "product/launch",
  destinationProject: "product/platform",
  projectFolder: "projects",
  rewrites: [
    {
      path: "projects/product/launch.md",
      destinationPath: "projects/product/platform.md",
      sourceFingerprint: "rewrite-a",
      replacementCount: 12,
    },
  ],
  moves: [
    {
      kind: "file",
      sourcePath: "projects/product/launch/api/notes.txt",
      destinationPath: "projects/product/platform/api/notes.txt",
      sourceFingerprint: "move-a",
      ignored: false,
    },
  ],
  conflicts: [markdownConflict, fileConflict, ignoredConflict, mismatchConflict, ...extraConflicts],
  autoResolutions: [
    {
      sourcePath: "projects/product/launch/logo.png",
      destinationPath: "projects/product/platform/logo.png",
      sourceFingerprint: "same",
      destinationFingerprint: "same",
      reason: "Identical non-Markdown files keep destination; source enters recovery.",
    },
  ],
  collapsedDescendants: ["product/launch/api", "product/launch/mobile", "product/launch/web"],
  impact: {
    rewrittenFiles: 8,
    rewrittenTokens: 34,
    filesystemMoves: 16,
    conflicts: 22,
    autoResolved: 9,
    collapsedDescendants: 3,
  },
  warnings: [
    "Markdown links, wiki-links, embeds, and plain paths are not updated.",
    "Moved ignored paths may require updated .octarineignore rules.",
  ],
};

const cleanPlan: ProjectMergePlan = {
  ...plan,
  conflicts: [],
  impact: { ...plan.impact, conflicts: 0, filesystemMoves: 21 },
};

const recovery: ProjectMergeRecoveryReport = {
  operationId: plan.operationId,
  recoveryPath: `.octarine/recovery/${plan.operationId}`,
  completedOperations: [
    "Install projects/product/platform.md",
    "Install projects/product/platform/api/notes.txt",
    "Recover source projects/product/launch.md",
  ],
  pendingOperations: [
    "Recover source projects/product/launch/assets",
    "Remove empty source project product/launch",
    "Reconcile derived task index",
  ],
  inspectPaths: [
    "projects/product/platform.md",
    "projects/product/launch/assets",
    `.octarine/recovery/${plan.operationId}`,
  ],
  guidance: "Inspect recovery and listed vault paths. Files are never rolled back automatically.",
};

const meta = {
  title: "Tasks/ProjectMergeWorkflow",
  component: ProjectMergeWorkflow,
  args: {
    plan,
    stage: "review",
    progress: 64,
    resolvedConflictIds: [markdownConflict.id, fileConflict.id],
    recovery: null,
    onClose: () => undefined,
    onStartMerge: () => undefined,
    onContinue: () => undefined,
    onBack: () => undefined,
    onCancel: () => undefined,
    onStop: () => undefined,
    onCommit: () => undefined,
    onSelectConflict: () => undefined,
    onResolveConflict: () => undefined,
    onRequestBulk: () => undefined,
    onConfirmBulk: () => undefined,
    onOpenDestination: () => undefined,
    onOpenRecovery: () => undefined,
  },
} satisfies Meta<typeof ProjectMergeWorkflow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MergeOffer: Story = { args: { stage: "offer" } };
export const AncestorBlocker: Story = { args: { stage: "blocked", blocker: "ancestor" } };
export const SymlinkBlocker: Story = { args: { stage: "blocked", blocker: "symlink" } };
export const CleanPlan: Story = { args: { stage: "review", plan: cleanPlan } };
export const Unresolved: Story = { args: { stage: "review", resolvedConflictIds: [] } };
export const Markdown: Story = {
  args: { stage: "resolve", selectedConflictId: markdownConflict.id },
};
export const File: Story = { args: { stage: "resolve", selectedConflictId: fileConflict.id } };
export const Ignored: Story = {
  args: { stage: "resolve", selectedConflictId: ignoredConflict.id },
};
export const TypeMismatch: Story = {
  args: { stage: "resolve", selectedConflictId: mismatchConflict.id },
};
export const BulkConfirmation: Story = { args: { stage: "bulk_confirm", bulkCount: 18 } };
export const Preparing: Story = { args: { stage: "preparing", progress: 42 } };
export const Cancelled: Story = { args: { stage: "cancelled" } };
export const CommitBoundary: Story = { args: { stage: "commit" } };
export const Committing: Story = { args: { stage: "committing", progress: 68 } };
export const Stopping: Story = { args: { stage: "stopping", progress: 71 } };
export const PartialRecovery: Story = { args: { stage: "partial", recovery } };
export const Success: Story = { args: { stage: "success" } };
export const Narrow: Story = {
  args: { stage: "resolve", selectedConflictId: markdownConflict.id },
  globals: { viewport: { value: "octarineNarrow", isRotated: false } },
};
