import type { PerspectiveWorkspaceRoot } from "../../generated/ipc/PerspectiveWorkspaceRoot";
import type { FileNode, CustomView } from "../../types";

const vaultTree: FileNode = {
  name: "vault",
  path: "/octarine/vault",
  is_dir: true,
  children: [
    {
      name: "projects",
      path: "/octarine/vault/projects",
      is_dir: true,
      children: [
        {
          name: "octarine",
          path: "/octarine/vault/projects/octarine",
          is_dir: true,
          children: [
            {
              name: "roadmap.md",
              path: "/octarine/vault/projects/octarine/roadmap.md",
              is_dir: false,
              children: null,
            },
          ],
        },
      ],
    },
    {
      name: "notes",
      path: "/octarine/vault/notes",
      is_dir: true,
      children: [
        {
          name: "ideas.md",
          path: "/octarine/vault/notes/ideas.md",
          is_dir: false,
          children: null,
        },
      ],
    },
    {
      name: "inbox.md",
      path: "/octarine/vault/inbox.md",
      is_dir: false,
      children: null,
    },
  ],
};

const journalTree: FileNode = {
  name: "000 - journals (2)",
  path: "000 - journals",
  is_dir: true,
  children: [
    {
      name: "2026 (2)",
      path: "000 - journals/2026",
      is_dir: true,
      children: [
        {
          name: "October (2)",
          path: "000 - journals/2026/October",
          is_dir: true,
          children: [
            {
              name: "2026-10-05",
              path: "/octarine/vault/journals/2026-10-05.md",
              is_dir: false,
              children: null,
            },
            {
              name: "2026-10-04",
              path: "/octarine/vault/journals/2026-10-04.md",
              is_dir: false,
              children: null,
            },
          ],
        },
      ],
    },
  ],
};

export const perspectiveStoryTrees: Record<PerspectiveWorkspaceRoot, FileNode> = {
  vault: vaultTree,
  journal: journalTree,
  projects: vaultTree.children?.[0] ?? vaultTree,
};

export const perspectiveStoryCustomViews: CustomView[] = [
  { title: "Focus", query_raw: 'filter: "status = doing AND @focus"', line_number: 1 },
  { title: "Next up", query_raw: 'filter: "status = todo AND +octarine"', line_number: 8 },
];

export const defaultStoryRootPaths: Partial<Record<PerspectiveWorkspaceRoot, string | null>> = {
  vault: "/octarine/vault",
  journal: "/octarine/vault/journals",
  projects: "/octarine/vault/projects",
};
