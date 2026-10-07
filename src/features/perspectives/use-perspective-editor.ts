import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PerspectiveDefinition } from "./model";
import { BUILT_IN_PERSPECTIVE } from "./default";
import {
  buildPerspectiveEditorSaveConfig,
  completePerspectiveEditorWrite,
  readPerspectiveEditorDocument,
  resetBuiltInPerspectiveDraft,
} from "./editor-model";
import { PERSPECTIVE_MODULE_REGISTRY } from "./registry";
import { getPerspectiveConfigText, savePerspectiveConfigText } from "../workspace/ipc";

export type PerspectiveEditorStatus =
  "loading" | "ready" | "malformed" | "load-error" | "saving" | "saved" | "save-error" | "conflict";

export interface PerspectiveEditorIo {
  load: () => Promise<string | null>;
  save: (contents: string, expectedOriginal: string | null) => Promise<boolean>;
}

export interface UsePerspectiveEditorOptions {
  io?: PerspectiveEditorIo;
  onSaved?: () => Promise<void> | void;
}

const nativeIo: PerspectiveEditorIo = {
  load: getPerspectiveConfigText,
  save: savePerspectiveConfigText,
};

function sameState(
  left: { draft: PerspectiveDefinition[]; persistedIds: string[]; recovery: boolean },
  right: { draft: PerspectiveDefinition[]; persistedIds: string[]; recovery: boolean },
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function usePerspectiveEditor({ io = nativeIo, onSaved }: UsePerspectiveEditorOptions = {}) {
  const [status, setStatus] = useState<PerspectiveEditorStatus>("loading");
  const [draft, setDraft] = useState<PerspectiveDefinition[]>([BUILT_IN_PERSPECTIVE]);
  const [persistedIds, setPersistedIds] = useState<string[]>([]);
  const [baseline, setBaseline] = useState({
    draft: [BUILT_IN_PERSPECTIVE],
    persistedIds: [] as string[],
    recovery: false,
  });
  const [recoveryStarted, setRecoveryStarted] = useState(false);
  const [rawSnapshot, setRawSnapshot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const requestVersion = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestVersion.current;
    setStatus("loading");
    setError(null);
    setReadError(null);
    setSaved(false);
    setRecoveryStarted(false);
    try {
      const rawText = await io.load();
      if (request !== requestVersion.current) return;
      const document = readPerspectiveEditorDocument(
        rawText,
        PERSPECTIVE_MODULE_REGISTRY,
        BUILT_IN_PERSPECTIVE,
      );
      const nextDraft = document.perspectives;
      const nextIds = document.persistedPerspectiveIds;
      const nextBaseline = { draft: nextDraft, persistedIds: nextIds, recovery: false };
      setRawSnapshot(rawText);
      setDraft(nextDraft);
      setPersistedIds(nextIds);
      setBaseline(nextBaseline);
      setRecoveryStarted(false);
      setError(document.errors[0] ?? null);
      setStatus(document.errors.length > 0 ? "malformed" : "ready");
    } catch (reason) {
      if (request !== requestVersion.current) return;
      const message = reason instanceof Error ? reason.message : String(reason);
      setReadError(`Perspective configuration could not be loaded: ${message}`);
      setStatus("load-error");
    }
  }, [io]);

  useEffect(() => {
    void load();
    return () => {
      requestVersion.current += 1;
    };
  }, [load]);

  const currentState = { draft, persistedIds, recovery: recoveryStarted };
  const hasChanges = !sameState(currentState, baseline);
  const saveConfig = useMemo(
    () =>
      buildPerspectiveEditorSaveConfig(
        draft,
        new Set(persistedIds),
        BUILT_IN_PERSPECTIVE,
        PERSPECTIVE_MODULE_REGISTRY,
      ),
    [draft, persistedIds],
  );
  const canEdit =
    status !== "loading" &&
    status !== "load-error" &&
    status !== "saving" &&
    status !== "conflict" &&
    (status !== "malformed" || recoveryStarted);
  const canSave =
    (status === "ready" ||
      status === "saved" ||
      status === "save-error" ||
      (status === "malformed" && recoveryStarted)) &&
    hasChanges &&
    saveConfig.config !== null;

  const changeDraft = useCallback(
    (next: PerspectiveDefinition[]) => {
      if (
        status === "loading" ||
        status === "load-error" ||
        status === "saving" ||
        status === "conflict"
      ) {
        return;
      }
      setDraft(next);
      setSaved(false);
      setError(null);
      setStatus((current) =>
        current === "malformed" || current === "conflict" ? current : "ready",
      );
    },
    [status],
  );

  const startRecoveryDraft = useCallback(() => {
    if (status !== "malformed") return;
    setDraft([
      {
        ...BUILT_IN_PERSPECTIVE,
        sidebar: BUILT_IN_PERSPECTIVE.sidebar.map((item) => ({ ...item })),
      },
    ]);
    setPersistedIds([]);
    setRecoveryStarted(true);
    setSaved(false);
    setError(null);
  }, [status]);

  const resetBuiltIn = useCallback(() => {
    if (!canEdit) return;
    setDraft((current) => resetBuiltInPerspectiveDraft(current, BUILT_IN_PERSPECTIVE));
    setPersistedIds((current) => current.filter((id) => id !== BUILT_IN_PERSPECTIVE.id));
    setSaved(false);
    setError(null);
    setStatus((current) => (current === "malformed" || current === "conflict" ? current : "ready"));
  }, [canEdit]);

  const save = useCallback(async () => {
    if (!canSave || saveConfig.config === null) return;
    const request = ++requestVersion.current;
    const contents = `${JSON.stringify(saveConfig.config, null, 2)}\n`;
    setStatus("saving");
    setSaved(false);
    setError(null);
    try {
      const result = await completePerspectiveEditorWrite(
        () => io.save(contents, rawSnapshot),
        onSaved,
      );
      if (request !== requestVersion.current) return;
      if (result.kind === "conflict") {
        setStatus("conflict");
        setError("Perspective configuration changed outside Octarine. Reload before saving.");
        return;
      }
      const savedIds = saveConfig.config.perspectives.map((perspective) => perspective.id);
      const nextBaseline = { draft, persistedIds: savedIds, recovery: false };
      setRawSnapshot(contents);
      setPersistedIds(savedIds);
      setBaseline(nextBaseline);
      setRecoveryStarted(false);
      setStatus("saved");
      setSaved(true);
      if (result.runtimeReloadError) {
        setError(
          `Perspective configuration saved, but runtime reload failed: ${result.runtimeReloadError}`,
        );
      }
    } catch (reason) {
      if (request !== requestVersion.current) return;
      const message = reason instanceof Error ? reason.message : String(reason);
      setStatus("save-error");
      setError(`Perspective configuration was not saved: ${message}`);
    }
  }, [canSave, draft, io, onSaved, rawSnapshot, saveConfig.config]);

  const retryRuntimeReload = useCallback(async () => {
    if (!onSaved) return;
    setStatus("saving");
    try {
      await onSaved();
      setStatus("saved");
      setError(null);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setStatus("saved");
      setError(`Perspective configuration saved, but runtime reload failed: ${message}`);
    }
  }, [onSaved]);

  return {
    status,
    draft,
    error,
    readError,
    saved,
    hasChanges,
    savedPerspectiveIds: persistedIds,
    validationErrors: saveConfig.errors,
    canEdit,
    canSave,
    recoveryStarted,
    rawSnapshot,
    setDraft: changeDraft,
    startRecoveryDraft,
    resetBuiltIn,
    save,
    reload: load,
    retryRuntimeReload,
  };
}
