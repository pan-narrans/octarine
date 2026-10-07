import type { PerspectiveModuleDefinition } from "./model";
import {
  ContextsModule,
  CustomQueryModule,
  CustomViewsModule,
  FileTreeModule,
  PerspectiveSwitcherModule,
  ProjectTreeModule,
  SmartViewsModule,
  TagsModule,
} from "./sidebar-modules";

export const PERSPECTIVE_MODULE_REGISTRY: readonly PerspectiveModuleDefinition[] = [
  {
    type: "smart-views",
    title: "Smart Views",
    description: "Open built-in task, status, and schedule views.",
    supportedSurfaces: ["sidebar"],
    allowMultiple: false,
    fields: [],
    examples: [{ name: "Planning", config: { id: "smart-views", type: "smart-views" } }],
    component: SmartViewsModule,
  },
  {
    type: "file-tree",
    title: "File Tree",
    description: "Browse Markdown documents in an approved workspace root.",
    supportedSurfaces: ["sidebar"],
    allowMultiple: true,
    fields: [
      {
        key: "title",
        label: "Title",
        description: "Heading shown above this file tree.",
        kind: "string",
        required: false,
        defaultValue: "Files",
      },
      {
        key: "root",
        label: "Workspace root",
        description: "Logical root already authorized by Octarine.",
        kind: "enum",
        required: true,
        options: ["vault", "journal", "projects"],
      },
      {
        key: "collection",
        label: "Collection behavior",
        description: "Add today's-entry action; journal root retains its existing date grouping.",
        kind: "enum",
        required: false,
        options: ["journal"],
      },
    ],
    examples: [
      {
        name: "Journal",
        config: {
          id: "journal-files",
          type: "file-tree",
          title: "Journals",
          root: "journal",
          collection: "journal",
        },
      },
      {
        name: "Notes",
        config: { id: "notes", type: "file-tree", title: "Notes", root: "vault" },
      },
    ],
    validate: (config) =>
      config.collection === "journal" && config.root !== "journal"
        ? "'collection: journal' requires 'root: journal'."
        : null,
    component: FileTreeModule,
  },
  {
    type: "custom-views",
    title: "Custom Views",
    description: "Show task dashboards parsed from existing tasks-query blocks.",
    supportedSurfaces: ["sidebar"],
    allowMultiple: false,
    fields: [],
    examples: [{ name: "Saved queries", config: { id: "custom-views", type: "custom-views" } }],
    component: CustomViewsModule,
  },
  {
    type: "project-tree",
    title: "Project Tree",
    description: "Navigate indexed project paths and reveal inactive projects.",
    supportedSurfaces: ["sidebar"],
    allowMultiple: false,
    fields: [],
    examples: [{ name: "Projects", config: { id: "projects", type: "project-tree" } }],
    component: ProjectTreeModule,
  },
  {
    type: "contexts",
    title: "Contexts",
    description: "Filter tasks by their primary context.",
    supportedSurfaces: ["sidebar"],
    allowMultiple: false,
    fields: [],
    examples: [{ name: "Contexts", config: { id: "contexts", type: "contexts" } }],
    component: ContextsModule,
  },
  {
    type: "tags",
    title: "Tags",
    description: "Filter tasks by indexed tag.",
    supportedSurfaces: ["sidebar"],
    allowMultiple: false,
    fields: [],
    examples: [{ name: "Tags", config: { id: "tags", type: "tags" } }],
    component: TagsModule,
  },
  {
    type: "custom-query",
    title: "Custom Query",
    description: "Run one existing Octarine task query and show its results.",
    supportedSurfaces: ["sidebar"],
    allowMultiple: true,
    fields: [
      {
        key: "title",
        label: "Title",
        description: "Label shown in the sidebar.",
        kind: "string",
        required: false,
        defaultValue: "Custom query",
      },
      {
        key: "filter",
        label: "Filter",
        description: "Existing task query syntax, evaluated by Rust query infrastructure.",
        kind: "string",
        required: true,
      },
    ],
    examples: [
      {
        name: "Today's tasks",
        config: {
          id: "today-tasks",
          type: "custom-query",
          title: "Today's tasks",
          filter: "due = today AND status != done",
        },
      },
    ],
    component: CustomQueryModule,
  },
  {
    type: "perspective-switcher",
    title: "Perspective Switcher",
    description: "Switch the active sidebar presentation.",
    supportedSurfaces: ["sidebar"],
    allowMultiple: false,
    fields: [],
    examples: [
      {
        name: "Switching control",
        config: { id: "perspective-switcher", type: "perspective-switcher" },
      },
    ],
    component: PerspectiveSwitcherModule,
  },
];

export function findPerspectiveModule(type: string): PerspectiveModuleDefinition | undefined {
  return PERSPECTIVE_MODULE_REGISTRY.find((definition) => definition.type === type);
}
