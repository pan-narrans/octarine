import type { PerspectiveDefinition } from "./model";

/** Built-in definition used when user configuration is missing or invalid. */
export const BUILT_IN_PERSPECTIVE: PerspectiveDefinition = {
  id: "default",
  title: "Workspace",
  sidebar: [
    { id: "smart-views", type: "smart-views" },
    {
      id: "journal-files",
      type: "file-tree",
      title: "Journals",
      root: "journal",
      collection: "journal",
    },
    { id: "notes", type: "file-tree", title: "Notes", root: "vault" },
    { id: "custom-views", type: "custom-views" },
    { id: "project-tree", type: "project-tree" },
    { id: "contexts", type: "contexts" },
    { id: "tags", type: "tags" },
  ],
};
