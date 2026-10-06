import { describe, expect, it } from "vitest";
import { BUILT_IN_PERSPECTIVE } from "./default";
import {
  buildPerspectiveModuleCatalog,
  loadPerspectiveConfiguration,
  validatePerspectiveConfig,
} from "./model";
import { findPerspectiveModule, PERSPECTIVE_MODULE_REGISTRY } from "./registry";

describe("Perspective configuration", () => {
  it("validates built-in modules through same strict parser", () => {
    const loaded = loadPerspectiveConfiguration(
      null,
      PERSPECTIVE_MODULE_REGISTRY,
      BUILT_IN_PERSPECTIVE,
    );
    expect(loaded.errors).toEqual([]);
    expect(loaded.perspectives).toEqual([BUILT_IN_PERSPECTIVE]);
  });

  it("falls back to validated built-in config for malformed JSON", () => {
    const loaded = loadPerspectiveConfiguration(
      "{broken",
      PERSPECTIVE_MODULE_REGISTRY,
      BUILT_IN_PERSPECTIVE,
    );
    expect(loaded.perspectives).toEqual([BUILT_IN_PERSPECTIVE]);
    expect(loaded.errors[0]).toMatch(/malformed/i);
  });

  it("reports unsupported schema versions and recovers to the built-in Perspective", () => {
    const rawText = JSON.stringify({ version: 2, perspectives: [] });
    const result = validatePerspectiveConfig(JSON.parse(rawText), PERSPECTIVE_MODULE_REGISTRY);
    const loaded = loadPerspectiveConfiguration(
      rawText,
      PERSPECTIVE_MODULE_REGISTRY,
      BUILT_IN_PERSPECTIVE,
    );

    expect(result.config).toBeNull();
    expect(result.errors.join(" ")).toMatch(/Unsupported Perspective schema version '2'/);
    expect(loaded.perspectives).toEqual([BUILT_IN_PERSPECTIVE]);
    expect(loaded.errors).toEqual(result.errors);
  });

  it("replaces built-in default without merging or reordering configured Perspectives", () => {
    const loaded = loadPerspectiveConfiguration(
      JSON.stringify({
        version: 1,
        perspectives: [
          {
            id: "writing",
            title: "Writing",
            sidebar: [{ id: "journal", type: "file-tree", root: "journal" }],
          },
          { id: "default", title: "My workspace", sidebar: [{ id: "contexts", type: "contexts" }] },
        ],
      }),
      PERSPECTIVE_MODULE_REGISTRY,
      BUILT_IN_PERSPECTIVE,
    );

    expect(loaded.errors).toEqual([]);
    expect(loaded.perspectives).toEqual([
      {
        id: "writing",
        title: "Writing",
        sidebar: [{ id: "journal", type: "file-tree", title: "Files", root: "journal" }],
      },
      { id: "default", title: "My workspace", sidebar: [{ id: "contexts", type: "contexts" }] },
    ]);
  });

  it.each([
    ["unknown module option", { id: "notes", type: "file-tree", root: "vault", path: "/tmp" }],
    ["explicit null field", { id: "notes", type: "file-tree", root: null }],
    ["arbitrary root", { id: "notes", type: "file-tree", root: "outside" }],
  ])("rejects %s", (_label, module) => {
    const result = validatePerspectiveConfig(
      { version: 1, perspectives: [{ id: "default", title: "Workspace", sidebar: [module] }] },
      PERSPECTIVE_MODULE_REGISTRY,
    );
    expect(result.config).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects duplicate Perspective and module instance IDs", () => {
    const result = validatePerspectiveConfig(
      {
        version: 1,
        perspectives: [
          {
            id: "default",
            title: "Workspace",
            sidebar: [
              { id: "contexts", type: "contexts" },
              { id: "contexts", type: "tags" },
            ],
          },
          { id: "default", title: "Duplicate", sidebar: [] },
        ],
      },
      PERSPECTIVE_MODULE_REGISTRY,
    );
    expect(result.errors.join(" ")).toMatch(/Duplicate Perspective ID/);
    expect(result.errors.join(" ")).toMatch(/Duplicate module instance ID/);
  });

  it("rejects unknown semantic module types and module-specific invalid options", () => {
    const unknownType = validatePerspectiveConfig(
      {
        version: 1,
        perspectives: [
          { id: "default", title: "Workspace", sidebar: [{ id: "unknown", type: "react-panel" }] },
        ],
      },
      PERSPECTIVE_MODULE_REGISTRY,
    );
    const invalidModuleConfig = validatePerspectiveConfig(
      {
        version: 1,
        perspectives: [
          {
            id: "default",
            title: "Workspace",
            sidebar: [
              {
                id: "notes",
                type: "file-tree",
                root: "vault",
                collection: "journal",
              },
            ],
          },
        ],
      },
      PERSPECTIVE_MODULE_REGISTRY,
    );

    expect(unknownType.config).toBeNull();
    expect(unknownType.errors.join(" ")).toMatch(/unknown module type 'react-panel'/i);
    expect(invalidModuleConfig.config).toBeNull();
    expect(invalidModuleConfig.errors.join(" ")).toMatch(/requires 'root: journal'/);
  });

  it("rejects module types that do not support the configured surface", () => {
    const registry = PERSPECTIVE_MODULE_REGISTRY.map((definition) =>
      definition.type === "contexts"
        ? {
            ...definition,
            supportedSurfaces: ["main" as unknown as (typeof definition.supportedSurfaces)[number]],
          }
        : definition,
    );
    const result = validatePerspectiveConfig(
      {
        version: 1,
        perspectives: [
          { id: "default", title: "Workspace", sidebar: [{ id: "contexts", type: "contexts" }] },
        ],
      },
      registry,
    );

    expect(result.config).toBeNull();
    expect(result.errors.join(" ")).toMatch(/does not support the sidebar surface/);
  });

  it("allows multiple file-tree instances with stable, distinct IDs", () => {
    const result = validatePerspectiveConfig(
      {
        version: 1,
        perspectives: [
          {
            id: "writing",
            title: "Writing",
            sidebar: [
              { id: "journal-files", type: "file-tree", root: "journal" },
              { id: "notes-files", type: "file-tree", root: "vault" },
            ],
          },
        ],
      },
      PERSPECTIVE_MODULE_REGISTRY,
    );

    expect(result.errors).toEqual([]);
    expect(result.config?.perspectives[0]?.sidebar.map((instance) => instance.id)).toEqual([
      "journal-files",
      "notes-files",
    ]);
  });

  it("builds catalog fields and examples from registry metadata", () => {
    const catalog = buildPerspectiveModuleCatalog(PERSPECTIVE_MODULE_REGISTRY);
    const fileTree = catalog.modules.find((module) => module.type === "file-tree");
    expect(catalog.errors).toEqual([]);
    expect(fileTree?.fields.map((field) => field.key)).toEqual(["title", "root", "collection"]);
    expect(fileTree?.examples.map((example) => example.name)).toEqual(["Journal", "Notes"]);
  });

  it("resolves semantic module types and includes newly registered metadata automatically", () => {
    expect(findPerspectiveModule("file-tree")?.title).toBe("File Tree");
    expect(findPerspectiveModule("react-component-name")).toBeUndefined();

    const addedModule = {
      ...PERSPECTIVE_MODULE_REGISTRY[0],
      type: "timeline-summary",
      title: "Timeline Summary",
      description: "Shows existing dated work.",
      examples: [
        {
          name: "Daily overview",
          config: { id: "daily-overview", type: "timeline-summary" },
        },
      ],
    };
    const catalog = buildPerspectiveModuleCatalog([...PERSPECTIVE_MODULE_REGISTRY, addedModule]);
    const discovered = catalog.modules.find((module) => module.type === "timeline-summary");

    expect(catalog.errors).toEqual([]);
    expect(discovered).toMatchObject({
      title: "Timeline Summary",
      description: "Shows existing dated work.",
      examples: [{ name: "Daily overview", config: { type: "timeline-summary" } }],
    });
    expect(discovered).not.toHaveProperty("component");
  });

  it("reports malformed registry metadata without crashing catalog construction", () => {
    const malformed = [
      { ...PERSPECTIVE_MODULE_REGISTRY[0], title: undefined, description: "", fields: null },
    ];
    const catalog = buildPerspectiveModuleCatalog(
      malformed as unknown as typeof PERSPECTIVE_MODULE_REGISTRY,
    );
    expect(catalog.errors.join(" ")).toMatch(/display title/);
    expect(catalog.errors.join(" ")).toMatch(/needs a description/);
    expect(catalog.errors.join(" ")).toMatch(/field metadata/);
    expect(catalog.modules).toEqual([]);
  });
});
