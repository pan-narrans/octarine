import type { Meta, StoryObj } from "@storybook/react-vite";
import { BUILT_IN_PERSPECTIVE } from "./default";
import type { PerspectiveDefinition } from "./model";
import { PerspectiveStoryHarness } from "./PerspectiveStoryHarness";

function createPerspective(
  id: string,
  title: string,
  sidebar: PerspectiveDefinition["sidebar"],
): PerspectiveDefinition {
  return { id, title, sidebar };
}

const contexts = createPerspective("contexts-only", "Contexts", [
  { id: "contexts", type: "contexts" },
]);
const fileTree = createPerspective("file-tree-only", "File Tree", [
  { id: "notes", type: "file-tree", title: "Notes", root: "vault" },
]);
const projects = createPerspective("projects-only", "Projects", [
  { id: "project-tree", type: "project-tree" },
]);
const writing = createPerspective("writing", "Writing", [
  { id: "switcher", type: "perspective-switcher" },
  {
    id: "journal-files",
    type: "file-tree",
    title: "Journals",
    root: "journal",
    collection: "journal",
  },
  { id: "notes", type: "file-tree", title: "Notes", root: "vault" },
  { id: "tags", type: "tags" },
]);
const multipleTrees = createPerspective("multiple-trees", "Project Files", [
  { id: "all-files", type: "file-tree", title: "All Notes", root: "vault" },
  { id: "project-files", type: "file-tree", title: "Project Files", root: "projects" },
]);
const switchable = createPerspective("switcher-demo", "Daily work", [
  { id: "switcher", type: "perspective-switcher" },
  {
    id: "today-tasks",
    type: "custom-query",
    title: "Today's tasks",
    filter: "due = today AND status != done",
  },
]);
const focusWithoutSwitcher = createPerspective("focus-no-switcher", "Focus (without switcher)", [
  { id: "notes", type: "file-tree", title: "Notes", root: "vault" },
  { id: "contexts", type: "contexts" },
]);
const revealTransitions = createPerspective("reveal-transitions", "Reveal transitions", [
  { id: "tree-a", type: "file-tree", title: "All files", root: "vault" },
  { id: "tree-b", type: "file-tree", title: "Project files", root: "projects" },
]);
const treeStateA = createPerspective("daily-work", "Daily work", [
  { id: "files", type: "file-tree", title: "Daily files", root: "vault" },
]);
const treeStateB = createPerspective("writing-state", "Writing", [
  { id: "files", type: "file-tree", title: "Writing files", root: "vault" },
]);

const meta = {
  title: "Perspectives/Sidebar modules",
  component: PerspectiveStoryHarness,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PerspectiveStoryHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DefaultComposition: Story = {
  args: { perspective: BUILT_IN_PERSPECTIVE },
  globals: { viewport: { value: "octarineDesktop", isRotated: false } },
};

export const WritingComposition: Story = {
  args: { perspective: writing, perspectives: [BUILT_IN_PERSPECTIVE, writing] },
};

export const ContextsDefault: Story = {
  args: { perspective: contexts },
};

export const ContextsEmpty: Story = {
  args: { perspective: contexts },
  render: (args) => <PerspectiveStoryHarness {...args} contextOverrides={{ contexts: [] }} />,
};

export const FileTreeDefault: Story = {
  args: { perspective: fileTree },
};

export const FileTreeCustomTitle: Story = {
  args: {
    perspective: createPerspective("custom-file-tree", "Research", [
      { id: "research-files", type: "file-tree", title: "Research notes", root: "vault" },
    ]),
  },
};

export const FileTreeRootUnavailable: Story = {
  args: { perspective: fileTree, rootPaths: { vault: null } },
};

export const FileTreeEmptyContent: Story = {
  args: { perspective: fileTree, emptyRoots: ["vault"] },
};

export const FileTreeActiveFile: Story = {
  args: {
    perspective: fileTree,
    activeFilePath: "/octarine/vault/projects/octarine/roadmap.md",
  },
};

export const RevealOwnerTransitions: Story = {
  args: {
    perspective: revealTransitions,
    externalFileTransitions: [
      { label: "inbox note", path: "/octarine/vault/inbox.md" },
      { label: "project roadmap", path: "/octarine/vault/projects/octarine/roadmap.md" },
    ],
  },
};

export const SourceOwnedReveal: Story = {
  args: {
    perspective: revealTransitions,
    externalFileTransitions: [
      {
        label: "project roadmap from All files",
        path: "/octarine/vault/projects/octarine/roadmap.md",
        sourceInstanceId: "tree-a",
      },
    ],
  },
};

export const IndependentTreeState: Story = {
  args: { perspective: treeStateA, perspectives: [treeStateA, treeStateB] },
  tags: ["visual"],
};

export const FileTreeMultipleInstances: Story = {
  args: {
    perspective: multipleTrees,
    activeFilePath: "/octarine/vault/projects/octarine/roadmap.md",
  },
};

export const ProjectTreeDefault: Story = {
  args: { perspective: projects },
};

export const PerspectiveSwitcher: Story = {
  args: { perspective: switchable, perspectives: [switchable, writing] },
};

export const PerspectiveSwitcherTargetWithoutControl: Story = {
  args: { perspective: switchable, perspectives: [switchable, focusWithoutSwitcher] },
  tags: ["visual"],
};

export const NarrowSidebar: Story = {
  args: { perspective: BUILT_IN_PERSPECTIVE },
  globals: { viewport: { value: "octarineNarrow", isRotated: false } },
  tags: ["visual"],
};
