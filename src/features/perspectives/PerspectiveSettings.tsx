import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { ActionButton, FormDropdown, FormInput } from "../../design-system/controls";
import type { PerspectiveDefinition, PerspectiveModuleDefinition } from "./model";
import {
  addPerspectiveModule,
  clearPerspectiveModuleField,
  copyPerspectiveDraft,
  createModuleInstanceDraft,
  createPerspectiveDraft,
  movePerspectiveModule,
  removePerspectiveDraft,
  removePerspectiveModule,
  renamePerspectiveDraft,
  updatePerspectiveModuleField,
} from "./editor-model";
import { BUILT_IN_PERSPECTIVE } from "./default";
import { findPerspectiveModule, PERSPECTIVE_MODULE_REGISTRY } from "./registry";
import { usePerspectiveEditor } from "./use-perspective-editor";
import type { PerspectiveEditorIo } from "./use-perspective-editor";

export interface PerspectiveSettingsProps {
  io?: PerspectiveEditorIo;
  activePerspectiveId?: string;
  onActivate?: (id: string) => void;
  onSaved?: () => Promise<void> | void;
}

function moduleBaseLabel(
  definition: PerspectiveModuleDefinition | undefined,
  instance: PerspectiveDefinition["sidebar"][number],
): string {
  return typeof instance.title === "string" && instance.title.trim()
    ? instance.title.trim()
    : (definition?.title ?? instance.type);
}

export function PerspectiveSettings({
  io,
  activePerspectiveId,
  onActivate,
  onSaved,
}: PerspectiveSettingsProps) {
  const editor = usePerspectiveEditor({ io, onSaved });
  const [selectedId, setSelectedId] = useState(BUILT_IN_PERSPECTIVE.id);
  const selected =
    editor.draft.find((perspective) => perspective.id === selectedId) ??
    editor.draft[0] ??
    BUILT_IN_PERSPECTIVE;
  const usedModuleTypes = useMemo(
    () => new Set(selected.sidebar.map((instance) => instance.type)),
    [selected.sidebar],
  );
  const addableModules = PERSPECTIVE_MODULE_REGISTRY.filter(
    (definition) =>
      definition.supportedSurfaces.includes("sidebar") &&
      (definition.allowMultiple || !usedModuleTypes.has(definition.type)),
  );
  const selectedIsBuiltIn = selected.id === BUILT_IN_PERSPECTIVE.id;
  const builtInDraft = editor.draft.find(
    (perspective) => perspective.id === BUILT_IN_PERSPECTIVE.id,
  );
  const builtInChanged =
    builtInDraft !== undefined &&
    JSON.stringify(builtInDraft) !== JSON.stringify(BUILT_IN_PERSPECTIVE);
  const builtInHasSavedOverride = editor.savedPerspectiveIds.includes(BUILT_IN_PERSPECTIVE.id);
  const canResetBuiltIn = builtInChanged || builtInHasSavedOverride;
  const persistedIds = new Set(editor.savedPerspectiveIds);

  useEffect(() => {
    if (editor.draft.some((perspective) => perspective.id === selectedId)) return;
    setSelectedId(editor.draft[0]?.id ?? BUILT_IN_PERSPECTIVE.id);
  }, [editor.draft, selectedId]);

  const replaceSelected = (next: PerspectiveDefinition) => {
    editor.setDraft(
      editor.draft.map((perspective) => (perspective.id === next.id ? next : perspective)),
    );
  };

  const createNew = () => {
    const next = createPerspectiveDraft("New perspective", editor.draft);
    editor.setDraft([...editor.draft, next]);
    setSelectedId(next.id);
  };

  const copySelected = () => {
    const next = copyPerspectiveDraft(selected, editor.draft);
    editor.setDraft([...editor.draft, next]);
    setSelectedId(next.id);
  };

  const deleteSelected = () => {
    editor.setDraft(removePerspectiveDraft(editor.draft, selected.id));
  };

  const addModule = (type: string) => {
    const definition = findPerspectiveModule(type);
    if (!definition) return;
    const instance = createModuleInstanceDraft(definition, selected.sidebar);
    replaceSelected(addPerspectiveModule(selected, instance));
  };

  const resetBuiltIn = () => {
    editor.resetBuiltIn();
    setSelectedId(BUILT_IN_PERSPECTIVE.id);
  };

  const recoveryAvailable = editor.status === "malformed" && !editor.recoveryStarted;
  const savedPerspective = selected.id === BUILT_IN_PERSPECTIVE.id || persistedIds.has(selected.id);
  const loadFailed = editor.status === "load-error";
  const conflict = editor.status === "conflict";
  const canActivate =
    savedPerspective &&
    !editor.hasChanges &&
    editor.status !== "loading" &&
    editor.status !== "saving" &&
    !editor.error &&
    !loadFailed &&
    !conflict;

  return (
    <main className="task-settings-review-surface perspective-settings-review-surface">
      <section
        className="task-settings perspective-settings"
        aria-labelledby="perspective-settings-title"
      >
        <header className="task-settings-header">
          <div>
            <h1 id="perspective-settings-title">Perspectives</h1>
            <p>Choose which Octarine modules appear in each workspace view.</p>
          </div>
          {editor.saved && (
            <span className="task-settings-saved" role="status">
              <Check size={15} /> Saved
            </span>
          )}
        </header>

        {editor.status === "saved" && editor.error && (
          <div className="perspective-editor-runtime-warning" role="alert">
            <AlertTriangle size={17} />
            <p>File saved. {editor.error}</p>
            {onSaved && (
              <ActionButton variant="secondary" onClick={() => void editor.retryRuntimeReload()}>
                <RefreshCw size={14} /> Retry refresh
              </ActionButton>
            )}
          </div>
        )}

        {loadFailed && (
          <div className="task-settings-migration perspective-editor-notice" role="alert">
            <AlertTriangle size={19} />
            <div>
              <strong>Could not load Perspectives</strong>
              <p>{editor.readError} Saving stays disabled until file loads.</p>
            </div>
            <ActionButton variant="secondary" onClick={() => void editor.reload()}>
              <RefreshCw size={14} /> Reload
            </ActionButton>
          </div>
        )}

        {recoveryAvailable && (
          <div className="task-settings-migration perspective-editor-notice" role="alert">
            <AlertTriangle size={19} />
            <div>
              <strong>Perspective file needs recovery</strong>
              <p>{editor.error} File stays unchanged until you save a new draft.</p>
            </div>
            <ActionButton variant="secondary" onClick={editor.startRecoveryDraft}>
              Start from default
            </ActionButton>
          </div>
        )}

        {conflict && (
          <div className="task-settings-migration perspective-editor-notice" role="alert">
            <AlertTriangle size={19} />
            <div>
              <strong>Perspective file changed</strong>
              <p>{editor.error} Reload to view latest file before editing again.</p>
            </div>
            <ActionButton variant="secondary" onClick={() => void editor.reload()}>
              <RefreshCw size={14} /> Reload
            </ActionButton>
          </div>
        )}

        {editor.status === "loading" && (
          <p className="perspective-editor-loading">Loading Perspectives…</p>
        )}

        <div className="perspective-editor-layout">
          <section
            className="task-settings-card perspective-editor-list"
            aria-label="Perspective list"
          >
            <header className="task-settings-card-heading">
              <div>
                <h2>Your Perspectives</h2>
                <p>{editor.draft.length} configured views</p>
              </div>
              <ActionButton
                variant="secondary"
                className="perspective-editor-icon-action"
                aria-label="Create Perspective"
                title="Create Perspective"
                disabled={!editor.canEdit}
                onClick={createNew}
              >
                <Plus size={15} /> New
              </ActionButton>
            </header>
            <div className="perspective-editor-list-items">
              {editor.draft.map((perspective) => (
                <button
                  key={perspective.id}
                  type="button"
                  className={`perspective-editor-list-item${perspective.id === selected.id ? " is-selected" : ""}`}
                  aria-current={perspective.id === selected.id ? "true" : undefined}
                  onClick={() => setSelectedId(perspective.id)}
                >
                  <span>{perspective.title || "Untitled Perspective"}</span>
                  {perspective.id === BUILT_IN_PERSPECTIVE.id && (
                    <small>{builtInHasSavedOverride ? "Default override" : "Built-in"}</small>
                  )}
                </button>
              ))}
            </div>
            <p className="perspective-editor-list-note">
              Order here sets order in Perspective Switcher.
            </p>
          </section>

          <section
            className="task-settings-card perspective-editor-detail"
            aria-label="Edit Perspective"
          >
            <header className="task-settings-card-heading perspective-editor-detail-heading">
              <div>
                <h2>{selected.title || "Untitled Perspective"}</h2>
                <p>
                  Stable ID <code>{selected.id}</code>
                </p>
              </div>
              <div className="perspective-editor-actions">
                {activePerspectiveId === selected.id && (
                  <span className="perspective-editor-active">Active</span>
                )}
                {onActivate && activePerspectiveId !== selected.id && (
                  <ActionButton
                    variant="secondary"
                    disabled={!canActivate}
                    title={
                      savedPerspective && !editor.hasChanges
                        ? "Use this Perspective"
                        : "Save changes before using this Perspective"
                    }
                    onClick={() => onActivate(selected.id)}
                  >
                    Use
                  </ActionButton>
                )}
                <ActionButton
                  variant="secondary"
                  className="perspective-editor-icon-action"
                  aria-label="Copy Perspective"
                  title="Copy Perspective"
                  disabled={!editor.canEdit}
                  onClick={copySelected}
                >
                  <Copy size={14} />
                </ActionButton>
                {!selectedIsBuiltIn && (
                  <ActionButton
                    variant="danger"
                    className="perspective-editor-icon-action"
                    aria-label="Remove Perspective"
                    title="Remove Perspective"
                    disabled={!editor.canEdit}
                    onClick={deleteSelected}
                  >
                    <Trash2 size={14} />
                  </ActionButton>
                )}
              </div>
            </header>

            <div className="perspective-editor-fields">
              <div className="task-settings-field">
                <label htmlFor="perspective-editor-title">Name</label>
                <FormInput
                  id="perspective-editor-title"
                  value={selected.title}
                  maxLength={80}
                  disabled={!editor.canEdit}
                  aria-invalid={!selected.title.trim() || undefined}
                  onChange={(event) =>
                    replaceSelected(renamePerspectiveDraft(selected, event.currentTarget.value))
                  }
                />
              </div>
              {selectedIsBuiltIn && canResetBuiltIn && (
                <ActionButton
                  variant="secondary"
                  className="perspective-editor-reset"
                  disabled={!editor.canEdit}
                  onClick={resetBuiltIn}
                >
                  <RotateCcw size={14} /> Reset to built-in
                </ActionButton>
              )}
            </div>

            <div className="perspective-editor-modules-heading">
              <div>
                <h3>Sidebar modules</h3>
                <p>Module order controls sidebar order.</p>
              </div>
              <FormDropdown
                id="perspective-editor-add-module"
                value=""
                options={[
                  { value: "", label: "Add module…" },
                  ...addableModules.map((definition) => ({
                    value: definition.type,
                    label: definition.title,
                  })),
                ]}
                disabled={!editor.canEdit || addableModules.length === 0}
                onValueChange={(type) => addModule(type)}
              />
            </div>

            {selected.sidebar.length === 0 ? (
              <div className="perspective-editor-empty-modules">
                <strong>No sidebar modules</strong>
                <p>
                  Add modules from the list above. You can add only one of each single-instance
                  module.
                </p>
              </div>
            ) : (
              <div className="perspective-editor-modules">
                {selected.sidebar.map((instance, index) => {
                  const definition = findPerspectiveModule(instance.type);
                  const baseLabel = moduleBaseLabel(definition, instance);
                  const repeatedLabels = selected.sidebar.filter(
                    (candidate) =>
                      moduleBaseLabel(findPerspectiveModule(candidate.type), candidate) ===
                      baseLabel,
                  );
                  const displayLabel =
                    repeatedLabels.length > 1
                      ? `${baseLabel} ${repeatedLabels.findIndex((candidate) => candidate.id === instance.id) + 1}`
                      : baseLabel;
                  return (
                    <article className="perspective-editor-module" key={instance.id}>
                      <header>
                        <div>
                          <h4>{displayLabel}</h4>
                          <span>
                            {definition?.title ?? instance.type} ·{" "}
                            {definition?.allowMultiple ? "Multiple allowed" : "One per Perspective"}
                          </span>
                        </div>
                        <div className="perspective-editor-module-actions">
                          <ActionButton
                            variant="secondary"
                            className="perspective-editor-icon-action"
                            aria-label={`Move ${displayLabel} up`}
                            title="Move up"
                            disabled={!editor.canEdit || index === 0}
                            onClick={() =>
                              replaceSelected(movePerspectiveModule(selected, instance.id, -1))
                            }
                          >
                            <ArrowUp size={14} />
                          </ActionButton>
                          <ActionButton
                            variant="secondary"
                            className="perspective-editor-icon-action"
                            aria-label={`Move ${displayLabel} down`}
                            title="Move down"
                            disabled={!editor.canEdit || index === selected.sidebar.length - 1}
                            onClick={() =>
                              replaceSelected(movePerspectiveModule(selected, instance.id, 1))
                            }
                          >
                            <ArrowDown size={14} />
                          </ActionButton>
                          <ActionButton
                            variant="danger"
                            className="perspective-editor-icon-action"
                            aria-label={`Remove ${displayLabel}`}
                            title="Remove module"
                            disabled={!editor.canEdit}
                            onClick={() =>
                              replaceSelected(removePerspectiveModule(selected, instance.id))
                            }
                          >
                            <Trash2 size={14} />
                          </ActionButton>
                        </div>
                      </header>
                      {definition?.fields.length ? (
                        <div className="perspective-editor-module-fields">
                          {definition.fields.map((field) => {
                            const inputId = `perspective-${instance.id}-${field.key}`;
                            const value =
                              typeof instance[field.key] === "string"
                                ? String(instance[field.key])
                                : "";
                            return (
                              <div className="task-settings-field" key={field.key}>
                                <label htmlFor={inputId}>
                                  {field.label}
                                  {field.required ? " *" : ""}
                                </label>
                                {field.kind === "enum" ? (
                                  <FormDropdown
                                    id={inputId}
                                    value={value}
                                    options={[
                                      ...(!field.required ? [{ value: "", label: "None" }] : []),
                                      ...(field.options ?? []).map((option) => ({
                                        value: option,
                                        label:
                                          option === "vault"
                                            ? "Vault root"
                                            : option === "journal"
                                              ? "Journal root"
                                              : option === "projects"
                                                ? "Projects root"
                                                : option,
                                      })),
                                    ]}
                                    disabled={!editor.canEdit}
                                    onValueChange={(nextValue) =>
                                      replaceSelected(
                                        nextValue === "" && !field.required
                                          ? clearPerspectiveModuleField(
                                              selected,
                                              instance.id,
                                              field.key,
                                            )
                                          : updatePerspectiveModuleField(
                                              selected,
                                              instance.id,
                                              field.key,
                                              nextValue,
                                            ),
                                      )
                                    }
                                  />
                                ) : (
                                  <FormInput
                                    id={inputId}
                                    value={value}
                                    disabled={!editor.canEdit}
                                    aria-describedby={`${inputId}-description`}
                                    onChange={(event) =>
                                      replaceSelected(
                                        updatePerspectiveModuleField(
                                          selected,
                                          instance.id,
                                          field.key,
                                          event.currentTarget.value,
                                        ),
                                      )
                                    }
                                  />
                                )}
                                <p
                                  className="perspective-editor-field-description"
                                  id={`${inputId}-description`}
                                >
                                  {field.description}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="perspective-editor-module-description">
                          {definition?.description ?? "This module is no longer registered."}
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            )}

            {editor.validationErrors.length > 0 && (
              <div className="perspective-editor-validation" role="alert">
                <strong>Fix configuration errors before saving</strong>
                <ul>
                  {editor.validationErrors.map((message, index) => (
                    <li key={`${message}-${index}`}>{message}</li>
                  ))}
                </ul>
              </div>
            )}
            {editor.status === "save-error" && editor.error && (
              <p className="task-settings-field-error" role="alert">
                {editor.error}
              </p>
            )}
            {editor.recoveryStarted && (
              <p className="perspective-editor-recovery-note">
                Saving replaces the malformed file with this valid draft.
              </p>
            )}

            <footer className="task-settings-footer perspective-editor-footer">
              <p>{editor.hasChanges ? "Unsaved changes" : "All changes saved"}</p>
              <div>
                {editor.hasChanges && !conflict && !recoveryAvailable && (
                  <ActionButton
                    variant="secondary"
                    disabled={editor.status === "saving" || loadFailed}
                    onClick={() => void editor.reload()}
                  >
                    Discard
                  </ActionButton>
                )}
                <ActionButton
                  variant="primary"
                  disabled={!editor.canSave}
                  onClick={() => void editor.save()}
                >
                  <Save size={14} /> {editor.status === "saving" ? "Saving…" : "Save changes"}
                </ActionButton>
              </div>
            </footer>
          </section>
        </div>
      </section>
    </main>
  );
}
