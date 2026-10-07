import {
  DEFAULT_PERSPECTIVE_ID,
  PERSPECTIVE_SCHEMA_VERSION,
  isStablePerspectiveId,
  resolveConfiguredPerspectives,
  validatePerspectiveConfig,
  type PerspectiveDefinition,
  type PerspectiveModuleDefinition,
  type PerspectiveModuleInstance,
} from "./model";

export interface PerspectiveEditorDocument {
  perspectives: PerspectiveDefinition[];
  persistedPerspectiveIds: string[];
  errors: string[];
  recoverable: boolean;
}

export interface PerspectiveEditorSaveResult {
  config: {
    version: typeof PERSPECTIVE_SCHEMA_VERSION;
    perspectives: PerspectiveDefinition[];
  } | null;
  errors: string[];
}

export type PerspectiveEditorLoadState = "ready" | "malformed" | "load-error";

export type PerspectiveEditorWriteResult =
  { kind: "conflict" } | { kind: "saved"; runtimeReloadError?: string };

export async function completePerspectiveEditorWrite(
  write: () => Promise<boolean>,
  onSaved?: () => Promise<void> | void,
): Promise<PerspectiveEditorWriteResult> {
  if (!(await write())) return { kind: "conflict" };
  try {
    await onSaved?.();
    return { kind: "saved" };
  } catch (error) {
    return {
      kind: "saved",
      runtimeReloadError: error instanceof Error ? error.message : String(error),
    };
  }
}

function copyPerspective(perspective: PerspectiveDefinition): PerspectiveDefinition {
  return {
    ...perspective,
    sidebar: perspective.sidebar.map((instance) => ({ ...instance })),
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

function slug(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (normalized || "perspective").slice(0, 64).replace(/-+$/g, "") || "perspective";
}

export function createStablePerspectiveId(title: string, usedIds: Iterable<string>): string {
  return createUniqueId(title, usedIds);
}

export function createStableModuleInstanceId(label: string, usedIds: Iterable<string>): string {
  return createUniqueId(label, usedIds);
}

function createUniqueId(label: string, usedIds: Iterable<string>): string {
  const used = new Set(usedIds);
  const base = slug(label);
  if (!used.has(base) && isStablePerspectiveId(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const tail = `-${suffix}`;
    const candidate = `${base.slice(0, 64 - tail.length).replace(/-+$/g, "")}${tail}`;
    if (!used.has(candidate)) return candidate;
  }
}

export function createPerspectiveDraft(
  title: string,
  perspectives: readonly PerspectiveDefinition[],
): PerspectiveDefinition {
  return {
    id: createStablePerspectiveId(
      title,
      perspectives.map((perspective) => perspective.id),
    ),
    title,
    sidebar: [],
  };
}

export function copyPerspectiveDraft(
  source: PerspectiveDefinition,
  perspectives: readonly PerspectiveDefinition[],
): PerspectiveDefinition {
  const title = `Copy of ${source.title}`;
  const id = createStablePerspectiveId(
    title,
    perspectives.map((perspective) => perspective.id),
  );
  return { ...copyPerspective(source), id, title };
}

export function renamePerspectiveDraft(
  perspective: PerspectiveDefinition,
  title: string,
): PerspectiveDefinition {
  return { ...perspective, title };
}

export function createModuleInstanceDraft(
  definition: PerspectiveModuleDefinition,
  instances: readonly PerspectiveModuleInstance[],
): PerspectiveModuleInstance {
  const defaults: Record<string, unknown> = { type: definition.type };
  for (const field of definition.fields) {
    if (field.defaultValue !== undefined) {
      defaults[field.key] = field.defaultValue;
    } else if (field.required && field.kind === "enum") {
      defaults[field.key] = field.options?.[0] ?? "";
    } else if (field.required && field.kind === "string") {
      defaults[field.key] = "";
    }
  }
  const label =
    typeof defaults.title === "string" && defaults.title ? defaults.title : definition.type;
  return {
    ...defaults,
    id: createStableModuleInstanceId(
      label,
      instances.map((instance) => instance.id),
    ),
  } as PerspectiveModuleInstance;
}

export function updatePerspectiveModuleField(
  perspective: PerspectiveDefinition,
  instanceId: string,
  key: string,
  value: string,
): PerspectiveDefinition {
  return {
    ...perspective,
    sidebar: perspective.sidebar.map((instance) =>
      instance.id === instanceId ? { ...instance, [key]: value } : instance,
    ),
  };
}

export function clearPerspectiveModuleField(
  perspective: PerspectiveDefinition,
  instanceId: string,
  key: string,
): PerspectiveDefinition {
  return {
    ...perspective,
    sidebar: perspective.sidebar.map((instance) => {
      if (instance.id !== instanceId) return instance;
      const next = { ...instance };
      delete next[key];
      return next;
    }),
  };
}

export function addPerspectiveModule(
  perspective: PerspectiveDefinition,
  instance: PerspectiveModuleInstance,
): PerspectiveDefinition {
  return { ...perspective, sidebar: [...perspective.sidebar, instance] };
}

export function removePerspectiveModule(
  perspective: PerspectiveDefinition,
  instanceId: string,
): PerspectiveDefinition {
  return {
    ...perspective,
    sidebar: perspective.sidebar.filter((instance) => instance.id !== instanceId),
  };
}

export function movePerspectiveModule(
  perspective: PerspectiveDefinition,
  instanceId: string,
  offset: -1 | 1,
): PerspectiveDefinition {
  const from = perspective.sidebar.findIndex((instance) => instance.id === instanceId);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= perspective.sidebar.length) return perspective;
  const sidebar = [...perspective.sidebar];
  [sidebar[from], sidebar[to]] = [sidebar[to]!, sidebar[from]!];
  return { ...perspective, sidebar };
}

export type PerspectiveModuleDropPosition = "before" | "after";

export function movePerspectiveModuleToPosition(
  perspective: PerspectiveDefinition,
  instanceId: string,
  targetInstanceId: string,
  position: PerspectiveModuleDropPosition,
): PerspectiveDefinition {
  const from = perspective.sidebar.findIndex((instance) => instance.id === instanceId);
  const target = perspective.sidebar.findIndex((instance) => instance.id === targetInstanceId);
  if (from < 0 || target < 0 || from === target) return perspective;

  const sidebar = [...perspective.sidebar];
  const [moving] = sidebar.splice(from, 1);
  const targetAfterRemoval = sidebar.findIndex((instance) => instance.id === targetInstanceId);
  const insertionIndex = targetAfterRemoval + (position === "after" ? 1 : 0);
  sidebar.splice(insertionIndex, 0, moving!);

  if (sidebar.every((instance, index) => instance.id === perspective.sidebar[index]?.id)) {
    return perspective;
  }

  return { ...perspective, sidebar };
}

export function removePerspectiveDraft(
  perspectives: readonly PerspectiveDefinition[],
  id: string,
): PerspectiveDefinition[] {
  return perspectives.filter((perspective) => perspective.id !== id);
}

export function resetBuiltInPerspectiveDraft(
  perspectives: readonly PerspectiveDefinition[],
  builtIn: PerspectiveDefinition,
): PerspectiveDefinition[] {
  const reset = copyPerspective(builtIn);
  const existingIndex = perspectives.findIndex((perspective) => perspective.id === builtIn.id);
  if (existingIndex < 0) return [reset, ...perspectives.map(copyPerspective)];
  return perspectives.map((perspective, index) => (index === existingIndex ? reset : perspective));
}

export function readPerspectiveEditorDocument(
  rawText: string | null,
  registry: readonly PerspectiveModuleDefinition[],
  builtIn: PerspectiveDefinition,
): PerspectiveEditorDocument {
  if (rawText === null) {
    return {
      perspectives: [copyPerspective(builtIn)],
      persistedPerspectiveIds: [],
      errors: [],
      recoverable: true,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Invalid JSON.";
    return {
      perspectives: [copyPerspective(builtIn)],
      persistedPerspectiveIds: [],
      errors: [`Perspective configuration is malformed: ${detail}`],
      recoverable: false,
    };
  }

  const validated = validatePerspectiveConfig(parsed, registry);
  if (!validated.config) {
    return {
      perspectives: [copyPerspective(builtIn)],
      persistedPerspectiveIds: [],
      errors: validated.errors,
      recoverable: false,
    };
  }

  return {
    perspectives: resolveConfiguredPerspectives(validated.config, builtIn).map(copyPerspective),
    persistedPerspectiveIds: validated.config.perspectives.map((perspective) => perspective.id),
    errors: [],
    recoverable: true,
  };
}

export function buildPerspectiveEditorSaveConfig(
  perspectives: readonly PerspectiveDefinition[],
  persistedPerspectiveIds: ReadonlySet<string>,
  builtIn: PerspectiveDefinition,
  registry: readonly PerspectiveModuleDefinition[],
): PerspectiveEditorSaveResult {
  const builtInDraft = perspectives.find((perspective) => perspective.id === builtIn.id);
  const shouldPersistBuiltIn =
    persistedPerspectiveIds.has(DEFAULT_PERSPECTIVE_ID) ||
    (builtInDraft !== undefined &&
      JSON.stringify(canonicalize(builtInDraft)) !== JSON.stringify(canonicalize(builtIn)));
  const persistedPerspectives = perspectives
    .filter((perspective) => perspective.id !== builtIn.id || shouldPersistBuiltIn)
    .map(copyPerspective);
  const validation = validatePerspectiveConfig(
    { version: PERSPECTIVE_SCHEMA_VERSION, perspectives: persistedPerspectives },
    registry,
  );
  return { config: validation.config, errors: validation.errors };
}

export function canSavePerspectiveDraft(
  state: PerspectiveEditorLoadState,
  dirty: boolean,
  valid: boolean,
  recoveryStarted = false,
): boolean {
  if (!dirty || !valid || state === "load-error") return false;
  return state === "ready" || (state === "malformed" && recoveryStarted);
}
