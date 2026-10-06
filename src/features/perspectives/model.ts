import type { ComponentType } from "react";
import type { FileNode, CustomView } from "../../types";
import type { PerspectiveWorkspaceRoot } from "../../generated/ipc/PerspectiveWorkspaceRoot";

export const PERSPECTIVE_SCHEMA_VERSION = 1 as const;
export const DEFAULT_PERSPECTIVE_ID = "default";
const STABLE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export type PerspectiveSurface = "sidebar";
export type PerspectiveRootId = PerspectiveWorkspaceRoot;

export interface PerspectiveModuleInstance extends Record<string, unknown> {
  id: string;
  type: string;
}

export interface PerspectiveDefinition {
  id: string;
  title: string;
  sidebar: PerspectiveModuleInstance[];
}

export interface PerspectiveConfig {
  version: typeof PERSPECTIVE_SCHEMA_VERSION;
  perspectives: PerspectiveDefinition[];
}

export interface PerspectiveConfigField {
  key: string;
  label: string;
  description: string;
  kind: "string" | "enum";
  required: boolean;
  options?: readonly string[];
  defaultValue?: string;
}

export interface PerspectiveModuleExample {
  name: string;
  config: Readonly<Record<string, unknown>>;
}

export interface PerspectiveModuleUiState {
  collapsed?: boolean;
  expandedPaths?: string[];
  scrollTop?: number;
  lastRevealedPath?: string | null;
}

export interface PerspectiveModuleRuntimeContext {
  workspaceId: string;
  activePerspectiveId: string;
  selectedSection: string;
  activeFilePath: string | null;
  activeFileSource?: {
    filePath: string;
    perspectiveId: string;
    instanceId: string;
  } | null;
  customViews: CustomView[];
  projects: string[];
  projectCatalogSize: number;
  showInactiveProjects: boolean;
  contexts: string[];
  tags: string[];
  rootPaths: Partial<Record<PerspectiveRootId, string | null>>;
  workspaceRootsLoaded: boolean;
  readTree: (root: PerspectiveRootId) => Promise<FileNode>;
  onSelectSection: (section: string, filter?: string) => void;
  onSelectFile: (path: string, sourceInstanceId: string) => void;
  onOpenTodayJournal?: (sourceInstanceId?: string) => void;
  onShowInactiveProjectsChange: (showInactiveProjects: boolean) => void;
  onRenameProject?: (sourceProject: string, destinationProject: string) => Promise<void> | void;
  onCreateFile?: (parentPath: string, name: string, sourceInstanceId?: string) => Promise<void>;
  onCreateFolder?: (parentPath: string, name: string) => Promise<void>;
  onRenameFile?: (oldPath: string, newPath: string, node: FileNode) => Promise<void>;
  onDeleteFile?: (path: string) => Promise<void>;
  perspectives: PerspectiveDefinition[];
  onSwitchPerspective: (id: string) => void;
}

export interface PerspectiveModuleProps {
  perspective: PerspectiveDefinition;
  instance: PerspectiveModuleInstance;
  context: PerspectiveModuleRuntimeContext;
  uiState: PerspectiveModuleUiState;
  onUiStateChange: (patch: Partial<PerspectiveModuleUiState>) => void;
}

export interface PerspectiveModuleDefinition {
  type: string;
  title: string;
  description: string;
  supportedSurfaces: readonly PerspectiveSurface[];
  allowMultiple: boolean;
  fields: readonly PerspectiveConfigField[];
  examples: readonly PerspectiveModuleExample[];
  component: ComponentType<PerspectiveModuleProps>;
  validate?: (config: Readonly<Record<string, unknown>>) => string | null;
}

export interface PerspectiveValidationResult {
  config: PerspectiveConfig | null;
  errors: string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function validateField(value: unknown, field: PerspectiveConfigField): boolean {
  if (field.kind === "string") return typeof value === "string";
  return typeof value === "string" && Boolean(field.options?.includes(value));
}

function isUsableField(value: unknown): value is PerspectiveConfigField {
  if (
    !isObject(value) ||
    typeof value.key !== "string" ||
    !isStablePerspectiveId(value.key) ||
    typeof value.label !== "string" ||
    typeof value.description !== "string" ||
    typeof value.required !== "boolean" ||
    (value.kind !== "string" && value.kind !== "enum")
  ) {
    return false;
  }
  if (
    value.kind === "enum" &&
    (!Array.isArray(value.options) ||
      value.options.length === 0 ||
      !value.options.every((option) => typeof option === "string"))
  ) {
    return false;
  }
  return (
    value.defaultValue === undefined ||
    validateField(value.defaultValue, value as unknown as PerspectiveConfigField)
  );
}

function isUsableModuleDefinition(value: unknown): value is PerspectiveModuleDefinition {
  return (
    isObject(value) &&
    typeof value.type === "string" &&
    isStablePerspectiveId(value.type) &&
    Array.isArray(value.supportedSurfaces) &&
    value.supportedSurfaces.every((surface) => typeof surface === "string") &&
    typeof value.allowMultiple === "boolean" &&
    Array.isArray(value.fields) &&
    value.fields.every(isUsableField) &&
    (value.validate === undefined || typeof value.validate === "function")
  );
}

export function isStablePerspectiveId(value: string): boolean {
  return STABLE_ID_PATTERN.test(value);
}

export function validatePerspectiveConfig(
  value: unknown,
  registry: readonly PerspectiveModuleDefinition[],
): PerspectiveValidationResult {
  const errors: string[] = [];
  if (!isObject(value))
    return { config: null, errors: ["Perspective configuration must be an object."] };
  if (!hasExactKeys(value, ["version", "perspectives"])) {
    errors.push("Perspective configuration may contain only 'version' and 'perspectives'.");
  }
  if (value.version !== PERSPECTIVE_SCHEMA_VERSION) {
    errors.push(`Unsupported Perspective schema version '${String(value.version)}'. Expected 1.`);
  }
  if (!Array.isArray(value.perspectives)) {
    errors.push("Perspective configuration must include an ordered 'perspectives' array.");
    return { config: null, errors };
  }

  const definitionsByType = new Map(
    registry.filter(isUsableModuleDefinition).map((definition) => [definition.type, definition]),
  );
  const seenPerspectiveIds = new Set<string>();
  const perspectives: PerspectiveDefinition[] = [];

  value.perspectives.forEach((candidate, perspectiveIndex) => {
    const label = `perspectives[${perspectiveIndex}]`;
    if (!isObject(candidate)) {
      errors.push(`${label} must be an object.`);
      return;
    }
    if (!hasExactKeys(candidate, ["id", "title", "sidebar"])) {
      errors.push(`${label} may contain only 'id', 'title', and 'sidebar'.`);
    }
    if (typeof candidate.id !== "string" || !isStablePerspectiveId(candidate.id)) {
      errors.push(`${label}.id must be a stable lowercase ID using letters, numbers, and hyphens.`);
      return;
    }
    if (seenPerspectiveIds.has(candidate.id)) {
      errors.push(`Duplicate Perspective ID '${candidate.id}'.`);
    }
    seenPerspectiveIds.add(candidate.id);
    if (typeof candidate.title !== "string" || !candidate.title.trim()) {
      errors.push(`Perspective '${candidate.id}' needs a user-facing title.`);
    }
    if (!Array.isArray(candidate.sidebar)) {
      errors.push(`Perspective '${candidate.id}' needs an ordered 'sidebar' array.`);
      return;
    }

    const seenInstanceIds = new Set<string>();
    const seenModuleTypes = new Set<string>();
    const sidebar: PerspectiveModuleInstance[] = [];

    candidate.sidebar.forEach((rawInstance, moduleIndex) => {
      const moduleLabel = `Perspective '${candidate.id}' sidebar[${moduleIndex}]`;
      if (!isObject(rawInstance)) {
        errors.push(`${moduleLabel} must be an object.`);
        return;
      }
      if (typeof rawInstance.id !== "string" || !isStablePerspectiveId(rawInstance.id)) {
        errors.push(`${moduleLabel}.id must be a stable lowercase module instance ID.`);
        return;
      }
      if (seenInstanceIds.has(rawInstance.id)) {
        errors.push(
          `Duplicate module instance ID '${rawInstance.id}' in Perspective '${candidate.id}'.`,
        );
      }
      seenInstanceIds.add(rawInstance.id);

      if (typeof rawInstance.type !== "string") {
        errors.push(`${moduleLabel}.type must name a registered semantic module type.`);
        return;
      }
      const definition = definitionsByType.get(rawInstance.type);
      if (!definition) {
        errors.push(`${moduleLabel} uses unknown module type '${rawInstance.type}'.`);
        return;
      }
      if (!definition.supportedSurfaces.includes("sidebar")) {
        errors.push(`Module '${rawInstance.type}' does not support the sidebar surface.`);
      }
      if (!definition.allowMultiple && seenModuleTypes.has(rawInstance.type)) {
        errors.push(`Perspective '${candidate.id}' allows only one '${rawInstance.type}' module.`);
      }
      seenModuleTypes.add(rawInstance.type);

      const allowedKeys = ["id", "type", ...definition.fields.map((field) => field.key)];
      if (!hasExactKeys(rawInstance, allowedKeys)) {
        const unknownKey = Object.keys(rawInstance).find((key) => !allowedKeys.includes(key));
        errors.push(`${moduleLabel} has unsupported option '${unknownKey}'.`);
      }

      let valid = true;
      const normalized: Record<string, unknown> = { id: rawInstance.id, type: rawInstance.type };
      definition.fields.forEach((field) => {
        const fieldValue = Object.prototype.hasOwnProperty.call(rawInstance, field.key)
          ? rawInstance[field.key]
          : field.defaultValue;
        if (fieldValue === undefined) {
          if (field.required) {
            errors.push(`${moduleLabel} requires '${field.key}'.`);
            valid = false;
          }
          return;
        }
        if (!validateField(fieldValue, field)) {
          errors.push(
            `${moduleLabel}.${field.key} must be ${field.kind === "enum" ? `one of ${field.options?.join(", ")}` : "text"}.`,
          );
          valid = false;
          return;
        }
        normalized[field.key] = fieldValue;
      });
      const moduleValidationError = definition.validate?.(rawInstance);
      if (moduleValidationError) {
        errors.push(`${moduleLabel}: ${moduleValidationError}`);
        valid = false;
      }
      if (valid && hasExactKeys(rawInstance, allowedKeys)) {
        sidebar.push(normalized as PerspectiveModuleInstance);
      }
    });

    if (typeof candidate.title === "string" && candidate.title.trim()) {
      perspectives.push({ id: candidate.id, title: candidate.title.trim(), sidebar });
    }
  });

  if (errors.length > 0) return { config: null, errors };
  return {
    config: { version: PERSPECTIVE_SCHEMA_VERSION, perspectives },
    errors,
  };
}

export function resolveConfiguredPerspectives(
  config: PerspectiveConfig,
  builtIn: PerspectiveDefinition,
): PerspectiveDefinition[] {
  if (config.perspectives.some((perspective) => perspective.id === builtIn.id)) {
    return [...config.perspectives];
  }
  return [builtIn, ...config.perspectives];
}

export function loadPerspectiveConfiguration(
  rawText: string | null,
  registry: readonly PerspectiveModuleDefinition[],
  builtIn: PerspectiveDefinition,
): { perspectives: PerspectiveDefinition[]; errors: string[] } {
  const builtInResult = validatePerspectiveConfig(
    { version: PERSPECTIVE_SCHEMA_VERSION, perspectives: [builtIn] },
    registry,
  );
  if (!builtInResult.config) {
    throw new Error(
      `Built-in Perspective configuration is invalid: ${builtInResult.errors.join(" ")}`,
    );
  }
  const validBuiltIn = builtInResult.config.perspectives[0];
  if (!validBuiltIn) throw new Error("Built-in Perspective configuration has no default entry.");
  if (rawText === null) return { perspectives: [validBuiltIn], errors: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Invalid JSON.";
    return {
      perspectives: [validBuiltIn],
      errors: [`Perspective configuration is malformed: ${detail}`],
    };
  }

  const result = validatePerspectiveConfig(parsed, registry);
  if (!result.config) return { perspectives: [validBuiltIn], errors: result.errors };
  return { perspectives: resolveConfiguredPerspectives(result.config, validBuiltIn), errors: [] };
}

export function buildPerspectiveModuleCatalog(registry: readonly PerspectiveModuleDefinition[]): {
  modules: Array<Omit<PerspectiveModuleDefinition, "component" | "validate">>;
  errors: string[];
} {
  const errors: string[] = [];
  const seen = new Set<string>();
  const modules: Array<Omit<PerspectiveModuleDefinition, "component" | "validate">> = [];

  for (const candidate of registry as readonly unknown[]) {
    if (!isObject(candidate)) {
      errors.push("Module registry contains an invalid definition.");
      continue;
    }
    const definition = candidate as Partial<PerspectiveModuleDefinition>;
    const type = typeof definition.type === "string" ? definition.type : "<missing type>";
    let safeToRender = true;
    if (!isStablePerspectiveId(type)) errors.push(`Invalid module type '${type}'.`);
    if (seen.has(type)) errors.push(`Duplicate module type '${type}'.`);
    seen.add(type);
    if (typeof definition.title !== "string" || !definition.title.trim()) {
      errors.push(`Module '${type}' needs a display title.`);
      safeToRender = false;
    }
    if (typeof definition.description !== "string" || !definition.description.trim()) {
      errors.push(`Module '${type}' needs a description.`);
      safeToRender = false;
    }
    if (
      !Array.isArray(definition.supportedSurfaces) ||
      definition.supportedSurfaces.length === 0 ||
      !definition.supportedSurfaces.every((surface) => typeof surface === "string")
    ) {
      errors.push(`Module '${type}' must declare supported surfaces.`);
      safeToRender = false;
    }
    if (typeof definition.allowMultiple !== "boolean") {
      errors.push(`Module '${type}' must declare whether multiple instances are supported.`);
      safeToRender = false;
    }
    if (!Array.isArray(definition.fields)) {
      errors.push(`Module '${type}' must declare field metadata.`);
      safeToRender = false;
    } else {
      definition.fields.forEach((field, index) => {
        if (isUsableField(field)) return;
        errors.push(`Module '${type}' field metadata at index ${index} is invalid.`);
        safeToRender = false;
      });
    }
    if (!Array.isArray(definition.examples)) {
      errors.push(`Module '${type}' must declare examples metadata.`);
      safeToRender = false;
    }
    for (const example of Array.isArray(definition.examples) ? definition.examples : []) {
      if (typeof example.name !== "string" || !example.name.trim() || !isObject(example.config)) {
        errors.push(`Module '${type}' has an invalid example configuration.`);
        safeToRender = false;
        continue;
      }
      const validated = validatePerspectiveConfig(
        {
          version: PERSPECTIVE_SCHEMA_VERSION,
          perspectives: [
            { id: "catalog-example", title: "Catalog example", sidebar: [example.config] },
          ],
        },
        registry.filter(isUsableModuleDefinition),
      );
      errors.push(
        ...validated.errors.map((error) => `Module '${type}' example '${example.name}': ${error}`),
      );
    }
    if (!safeToRender) continue;
    const metadata: Partial<PerspectiveModuleDefinition> = { ...definition };
    delete metadata.component;
    delete metadata.validate;
    modules.push(metadata as Omit<PerspectiveModuleDefinition, "component" | "validate">);
  }

  return { modules, errors };
}
