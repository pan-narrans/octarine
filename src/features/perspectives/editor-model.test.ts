import { describe, expect, it } from "vitest";
import { BUILT_IN_PERSPECTIVE } from "./default";
import {
  addPerspectiveModule,
  buildPerspectiveEditorSaveConfig,
  canSavePerspectiveDraft,
  clearPerspectiveModuleField,
  completePerspectiveEditorWrite,
  copyPerspectiveDraft,
  createModuleInstanceDraft,
  createPerspectiveDraft,
  createStablePerspectiveId,
  movePerspectiveModule,
  movePerspectiveModuleToPosition,
  readPerspectiveEditorDocument,
  removePerspectiveDraft,
  removePerspectiveModule,
  renamePerspectiveDraft,
  resetBuiltInPerspectiveDraft,
  updatePerspectiveModuleField,
} from "./editor-model";
import { PERSPECTIVE_MODULE_REGISTRY } from "./registry";

describe("Perspective editor model", () => {
  it("notifies runtime after deferred durable save even if editor unmounts", async () => {
    let resolveWrite: (saved: boolean) => void = () => undefined;
    const editorMounted = false;
    let runtimeNotifications = 0;
    const write = completePerspectiveEditorWrite(
      () => new Promise<boolean>((resolve) => (resolveWrite = resolve)),
      () => {
        runtimeNotifications += 1;
      },
    );

    resolveWrite(true);
    expect(await write).toEqual({ kind: "saved" });
    expect(editorMounted).toBe(false);
    expect(runtimeNotifications).toBe(1);
  });

  it("reports runtime reload failure after durable write without changing saved outcome", async () => {
    const result = await completePerspectiveEditorWrite(
      async () => true,
      async () => {
        throw new Error("invalid saved configuration");
      },
    );

    expect(result).toEqual({ kind: "saved", runtimeReloadError: "invalid saved configuration" });
  });

  it("generates stable lowercase IDs and preserves IDs when names change", () => {
    const perspectives = [BUILT_IN_PERSPECTIVE];
    const created = createPerspectiveDraft("Research Notes", perspectives);
    const renamed = renamePerspectiveDraft(created, "Field Research");

    expect(createStablePerspectiveId("Résearch Notes", ["research-notes"])).toBe(
      "research-notes-2",
    );
    expect(created.id).toBe("research-notes");
    expect(renamed.id).toBe(created.id);
    expect(renamed.title).toBe("Field Research");
  });

  it("copies, reorders, edits, clears optional fields, and removes modules immutably", () => {
    const fileTreeDefinition = PERSPECTIVE_MODULE_REGISTRY.find(
      (definition) => definition.type === "file-tree",
    );
    const tagsDefinition = PERSPECTIVE_MODULE_REGISTRY.find(
      (definition) => definition.type === "tags",
    );
    expect(fileTreeDefinition).toBeDefined();
    expect(tagsDefinition).toBeDefined();
    if (!fileTreeDefinition || !tagsDefinition) throw new Error("Expected module definitions.");

    const empty = createPerspectiveDraft("Research", [BUILT_IN_PERSPECTIVE]);
    const tree = createModuleInstanceDraft(fileTreeDefinition, []);
    expect(tree.root).toBe("vault");
    const withTree = addPerspectiveModule(empty, tree);
    const withTags = addPerspectiveModule(
      withTree,
      createModuleInstanceDraft(tagsDefinition, withTree.sidebar),
    );
    const reordered = movePerspectiveModule(withTags, "tags", -1);
    const edited = updatePerspectiveModuleField(reordered, tree.id, "title", "Reference");
    const cleared = clearPerspectiveModuleField(
      updatePerspectiveModuleField(edited, tree.id, "collection", "journal"),
      tree.id,
      "collection",
    );
    const copied = copyPerspectiveDraft(cleared, [BUILT_IN_PERSPECTIVE, cleared]);
    const withoutTree = removePerspectiveModule(cleared, tree.id);
    const withoutPerspective = removePerspectiveDraft([BUILT_IN_PERSPECTIVE, copied], copied.id);

    expect(reordered.sidebar.map((instance) => instance.type)).toEqual(["tags", "file-tree"]);
    expect(edited.sidebar[1]).toMatchObject({ title: "Reference" });
    expect(cleared.sidebar[1]).not.toHaveProperty("collection");
    expect(copied.id).toBe("copy-of-research");
    expect(copied.sidebar.map((instance) => instance.id)).toEqual(
      cleared.sidebar.map((instance) => instance.id),
    );
    expect(withoutTree.sidebar.map((instance) => instance.type)).toEqual(["tags"]);
    expect(withoutPerspective).toEqual([BUILT_IN_PERSPECTIVE]);
  });

  it("moves modules before or after drop targets and preserves no-op drafts", () => {
    const perspective = {
      ...createPerspectiveDraft("Research", [BUILT_IN_PERSPECTIVE]),
      sidebar: [
        { id: "one", type: "tags" },
        { id: "two", type: "contexts" },
        { id: "three", type: "file-tree" },
      ],
    };

    const before = movePerspectiveModuleToPosition(perspective, "three", "one", "before");
    const after = movePerspectiveModuleToPosition(perspective, "one", "three", "after");

    expect(before.sidebar.map((instance) => instance.id)).toEqual(["three", "one", "two"]);
    expect(after.sidebar.map((instance) => instance.id)).toEqual(["two", "three", "one"]);
    expect(movePerspectiveModuleToPosition(perspective, "one", "one", "after")).toBe(perspective);
    expect(movePerspectiveModuleToPosition(perspective, "one", "two", "before")).toBe(perspective);
  });

  it("keeps implicit built-in separate from persisted definitions", () => {
    const writing = createPerspectiveDraft("Writing", [BUILT_IN_PERSPECTIVE]);
    const rawText = JSON.stringify({ version: 1, perspectives: [writing] });
    const document = readPerspectiveEditorDocument(
      rawText,
      PERSPECTIVE_MODULE_REGISTRY,
      BUILT_IN_PERSPECTIVE,
    );

    expect(document.errors).toEqual([]);
    expect(document.perspectives.map((perspective) => perspective.id)).toEqual([
      "default",
      "writing",
    ]);
    expect(document.persistedPerspectiveIds).toEqual(["writing"]);
  });

  it("requires explicit recovery before a malformed file becomes an editable draft", () => {
    const document = readPerspectiveEditorDocument(
      "{ malformed config",
      PERSPECTIVE_MODULE_REGISTRY,
      BUILT_IN_PERSPECTIVE,
    );

    expect(document.perspectives).toEqual([BUILT_IN_PERSPECTIVE]);
    expect(document.persistedPerspectiveIds).toEqual([]);
    expect(document.errors[0]).toMatch(/malformed/i);
    expect(document.recoverable).toBe(false);
  });

  it("omits unchanged implicit default when saving new Perspectives", () => {
    const writing = createPerspectiveDraft("Writing", [BUILT_IN_PERSPECTIVE]);
    const saved = buildPerspectiveEditorSaveConfig(
      [BUILT_IN_PERSPECTIVE, writing],
      new Set(),
      BUILT_IN_PERSPECTIVE,
      PERSPECTIVE_MODULE_REGISTRY,
    );

    expect(saved.errors).toEqual([]);
    expect(saved.config?.perspectives.map((perspective) => perspective.id)).toEqual(["writing"]);

    const reorderedKeys = {
      sidebar: BUILT_IN_PERSPECTIVE.sidebar.map((instance) => ({
        ...instance,
        type: instance.type,
        id: instance.id,
      })),
      title: BUILT_IN_PERSPECTIVE.title,
      id: BUILT_IN_PERSPECTIVE.id,
    };
    const savedWithReorderedKeys = buildPerspectiveEditorSaveConfig(
      [reorderedKeys, writing],
      new Set(),
      BUILT_IN_PERSPECTIVE,
      PERSPECTIVE_MODULE_REGISTRY,
    );
    expect(
      savedWithReorderedKeys.config?.perspectives.map((perspective) => perspective.id),
    ).toEqual(["writing"]);
  });

  it("materializes edited built-in override and removes it after reset", () => {
    const editedDefault = renamePerspectiveDraft(BUILT_IN_PERSPECTIVE, "My Workspace");
    const materialized = buildPerspectiveEditorSaveConfig(
      [editedDefault],
      new Set(),
      BUILT_IN_PERSPECTIVE,
      PERSPECTIVE_MODULE_REGISTRY,
    );
    const reset = resetBuiltInPerspectiveDraft([editedDefault], BUILT_IN_PERSPECTIVE);
    const resetSave = buildPerspectiveEditorSaveConfig(
      reset,
      new Set(),
      BUILT_IN_PERSPECTIVE,
      PERSPECTIVE_MODULE_REGISTRY,
    );

    expect(materialized.config?.perspectives).toEqual([editedDefault]);
    expect(resetSave.config?.perspectives).toEqual([]);
  });

  it("rejects invalid drafts and gates save for read failures or unconfirmed recovery", () => {
    const invalid = {
      ...createPerspectiveDraft("Invalid", [BUILT_IN_PERSPECTIVE]),
      sidebar: [
        { id: "contexts", type: "contexts" },
        { id: "contexts-again", type: "contexts" },
      ],
    };
    const result = buildPerspectiveEditorSaveConfig(
      [BUILT_IN_PERSPECTIVE, invalid],
      new Set(),
      BUILT_IN_PERSPECTIVE,
      PERSPECTIVE_MODULE_REGISTRY,
    );

    expect(result.config).toBeNull();
    expect(result.errors.join(" ")).toMatch(/only one 'contexts'/);
    expect(canSavePerspectiveDraft("load-error", true, true, true)).toBe(false);
    expect(canSavePerspectiveDraft("malformed", true, true)).toBe(false);
    expect(canSavePerspectiveDraft("malformed", true, true, true)).toBe(true);
    expect(canSavePerspectiveDraft("ready", false, true)).toBe(false);
  });
});
