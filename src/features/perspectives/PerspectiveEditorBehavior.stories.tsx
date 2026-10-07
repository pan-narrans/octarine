import { useCallback, useMemo, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { PerspectiveDefinition } from "./model";
import { BUILT_IN_PERSPECTIVE } from "./default";
import { PerspectiveSettings } from "./PerspectiveSettings";
import type { PerspectiveEditorIo } from "./use-perspective-editor";

type HarnessMode =
  "success" | "fail-once" | "conflict" | "deferred" | "load-deferred" | "load-error";

const configuredPerspective: PerspectiveDefinition = {
  id: "writing",
  title: "Writing",
  sidebar: [
    {
      id: "journal-files",
      type: "file-tree",
      title: "Journals",
      root: "journal",
      collection: "journal",
    },
  ],
};

function serialize(perspectives: PerspectiveDefinition[]): string {
  return `${JSON.stringify({ version: 1, perspectives }, null, 2)}\n`;
}

interface PersistenceHarnessProps {
  initialConfig: string | null;
  mode?: HarnessMode;
}

function PersistenceHarness({ initialConfig, mode = "success" }: PersistenceHarnessProps) {
  const persistedRef = useRef(initialConfig);
  const saveAttempts = useRef(0);
  const pendingSave = useRef<{
    contents: string;
    expectedOriginal: string | null;
    resolve: (saved: boolean) => void;
  } | null>(null);
  const pendingLoad = useRef<((contents: string | null) => void) | null>(null);
  const [persistedConfig, setPersistedConfig] = useState(initialConfig);
  const [saveCalls, setSaveCalls] = useState(0);
  const [refreshCalls, setRefreshCalls] = useState(0);
  const [savePending, setSavePending] = useState(false);
  const [editorMounted, setEditorMounted] = useState(true);

  const io = useMemo<PerspectiveEditorIo>(
    () => ({
      load: () =>
        mode === "load-deferred"
          ? new Promise<string | null>((resolve) => {
              pendingLoad.current = resolve;
            })
          : mode === "load-error"
            ? Promise.reject(new Error("Fixture read denied."))
            : Promise.resolve(initialConfig),
      save: (contents, expectedOriginal) => {
        setSaveCalls((count) => count + 1);
        const attempt = saveAttempts.current++;
        if (mode === "fail-once" && attempt === 0) {
          return Promise.reject(new Error("Fixture save rejected."));
        }
        if (mode === "conflict") return Promise.resolve(false);
        if (mode === "deferred") {
          return new Promise<boolean>((resolve) => {
            pendingSave.current = { contents, expectedOriginal, resolve };
            setSavePending(true);
          });
        }
        if (persistedRef.current !== expectedOriginal) return Promise.resolve(false);
        persistedRef.current = contents;
        setPersistedConfig(contents);
        return Promise.resolve(true);
      },
    }),
    [initialConfig, mode],
  );

  const onSaved = useCallback(async () => {
    setRefreshCalls((count) => count + 1);
  }, []);

  const completeSave = () => {
    const pending = pendingSave.current;
    if (!pending) return;
    pendingSave.current = null;
    setSavePending(false);
    if (persistedRef.current !== pending.expectedOriginal) {
      pending.resolve(false);
      return;
    }
    persistedRef.current = pending.contents;
    setPersistedConfig(pending.contents);
    pending.resolve(true);
  };

  return (
    <>
      <div className="perspective-editor-test-controls">
        <button disabled={!savePending} onClick={completeSave}>
          Complete native save
        </button>
        <button
          onClick={() => {
            const resolve = pendingLoad.current;
            pendingLoad.current = null;
            resolve?.(null);
          }}
        >
          Complete configuration load
        </button>
        <button disabled={!editorMounted} onClick={() => setEditorMounted(false)}>
          Unmount editor
        </button>
        <output aria-label="Persisted configuration">
          {persistedConfig ?? "No configuration saved"}
        </output>
        <output aria-label="Save calls">{saveCalls}</output>
        <output aria-label="Runtime refresh calls">{refreshCalls}</output>
      </div>
      {editorMounted && (
        <PerspectiveSettings io={io} onSaved={mode === "deferred" ? onSaved : undefined} />
      )}
    </>
  );
}

const meta = {
  title: "Perspectives/Editor behavior",
  component: PerspectiveSettings,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PerspectiveSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  render: () => <PersistenceHarness initialConfig={null} mode="load-deferred" />,
  tags: ["visual"],
};

export const ReadFailure: Story = {
  render: () => <PersistenceHarness initialConfig={null} mode="load-error" />,
  tags: ["visual"],
};

export const CreateAndPersist: Story = {
  render: () => <PersistenceHarness initialConfig={null} />,
  tags: ["visual"],
};

export const EditAndPersist: Story = {
  render: () => <PersistenceHarness initialConfig={serialize([configuredPerspective])} />,
  tags: ["visual"],
};

export const ClearOptionalEnum: Story = {
  render: () => <PersistenceHarness initialConfig={serialize([configuredPerspective])} />,
  tags: ["visual"],
};

export const MalformedRecovery: Story = {
  render: () => <PersistenceHarness initialConfig="{ broken user config" />,
  tags: ["visual"],
};

export const RetryableSave: Story = {
  render: () => <PersistenceHarness initialConfig={null} mode="fail-once" />,
  tags: ["visual"],
};

export const ExternalChangeConflict: Story = {
  render: () => (
    <PersistenceHarness initialConfig={serialize([configuredPerspective])} mode="conflict" />
  ),
  tags: ["visual"],
};

export const DeferredSaveAfterUnmount: Story = {
  render: () => <PersistenceHarness initialConfig={null} mode="deferred" />,
  tags: ["visual"],
};

export const ExplicitBuiltIn: Story = {
  render: () => <PersistenceHarness initialConfig={serialize([BUILT_IN_PERSPECTIVE])} />,
  tags: ["visual"],
};
