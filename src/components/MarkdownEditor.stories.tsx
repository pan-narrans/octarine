import { useEffect, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MarkdownEditor } from "./MarkdownEditor";
import { editorSessions } from "../features/workspace/editor-sessions";

const journalPath = "/vault/journal/2026-08-26.md";

const journalEntry = `# Journal — 2026-08-26

## Focus

- [ ] Review the Calendar surface +octarine/ui @desk due:today
- [ ] Capture the Day Drawer regression states #design

## Notes

Keep the Storybook → app review loop explicit and small.`;

const meta = {
  title: "Editors/MarkdownEditor",
  component: MarkdownEditor,
  args: {
    filePath: journalPath,
    initialContent: journalEntry,
    onSave: async () => undefined,
    onClose: () => undefined,
    projects: ["octarine/ui", "octarine/docs"],
    contexts: ["desk", "focus"],
  },
  decorators: [
    (Story) => (
      <div
        style={{
          minHeight: "560px",
          padding: "48px",
          background: "var(--bg-space)",
        }}
      >
        <div
          style={{
            height: "460px",
            overflow: "hidden",
            background: "var(--bg-card)",
            border: "1px solid var(--border-card)",
            borderRadius: "8px",
          }}
        >
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof MarkdownEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const JournalEntry: Story = {};

export const BlankJournal: Story = {
  args: {
    initialContent: "# Journal — 2026-08-26\n\n",
  },
};

export const SplitView: Story = {
  args: {
    initialViewMode: "split",
  },
};

export const LiveMarkdownPreview: Story = {
  args: {
    filePath: "/fixture/live-markdown-preview.md",
    initialViewMode: "live",
    initialContent: `# Live Markdown preview

Move the cursor between lines. The current line stays in source form while inactive lines render.

## Inline formatting

This line has **bold**, *italic*, ~~strikethrough~~, \`inline code\`, and [a link](reference.md).

## Block quote

> Quote markers collapse into a rendered accent.

## Lists

- [x] Completed task
- [ ] Open task
- Bullet item

1. Ordered item
2. Another item`,
  },
};

export const Preview: Story = {
  args: {
    initialViewMode: "preview",
  },
};

export const OutlineOpen: Story = {
  args: {
    initialOutlineOpen: true,
  },
};

export const FormattingToolbar: Story = {
  args: {
    filePath: "/fixture/formatting-toolbar.md",
    initialContent: `# Formatting toolbar

Select text, then try bold, italic, strikethrough, inline code, links, headings, quotes, lists, task lists, and fenced code.

Toolbar stays available while switching between editor, split, and preview.`,
  },
};

export const GfmPreview: Story = {
  args: {
    filePath: "/fixture/gfm-preview.md",
    initialViewMode: "preview",
    initialContent: `# GFM preview

| Feature | Rendering |
| --- | --- |
| Table | GitHub Flavored Markdown |
| Task list | Interactive checkbox |

- [x] Completed task
- [ ] Open task

Strikethrough: ~~removed text~~.

\`\`\`ts
const format = "code block";
\`\`\`

[Internal reference](reference.md#review-checklist)

![Architecture diagram](attachments/architecture.png)`,
  },
};

export const OutlineHierarchy: Story = {
  args: {
    filePath: "/fixture/outline-hierarchy.md",
    initialOutlineOpen: true,
    initialContent: `# Workspace

Opening paragraph.

## Editor

### Source

#### Commands

### Preview

## Attachments

### Import flow

## Navigation

### Internal links`,
  },
};

export const AttachmentEnabled: Story = {
  args: {
    filePath: "/fixture/attachment-enabled.md",
    initialContent: `# Attachments

Use Attach to choose a file. The Storybook callback returns a fixture path without native IPC.`,
    onImportAttachment: async (fileName) => ({
      fileName,
      relativePath: `attachments/${fileName}`,
    }),
  },
};

function InternalLinkPreviewHarness() {
  const [openedTarget, setOpenedTarget] = useState("Click internal link to inspect mock callback");

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <MarkdownEditor
          filePath="/fixture/internal-link-preview.md"
          initialContent={`# Internal links\n\n[Open review checklist](reference.md#review-checklist)\n\nThe mock callback records the requested relative Markdown target.`}
          initialViewMode="preview"
          onSave={async () => undefined}
          onClose={() => undefined}
          onOpenMarkdownLink={async (_documentPath, target) => {
            setOpenedTarget(target);
            return { path: "/fixture/reference.md", fragment: "review-checklist" };
          }}
        />
      </div>
      <output
        aria-label="Mock internal link callback"
        style={{ padding: "6px 12px", color: "var(--text-secondary)", fontSize: "12px" }}
      >
        Mock callback: {openedTarget}
      </output>
    </div>
  );
}

export const InternalLinkPreview: Story = {
  render: () => <InternalLinkPreviewHarness />,
};

function LockedEditorControlsHarness() {
  useEffect(() => {
    let release: (() => void) | null = null;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      void editorSessions
        .withCleanPaths(
          ["/fixture/locked-controls"],
          () =>
            new Promise<void>((resolve) => {
              release = resolve;
            }),
        )
        .catch(() => undefined);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      release?.();
    };
  }, []);

  return (
    <MarkdownEditor
      filePath="/fixture/locked-controls/note.md"
      initialContent={`# File operation in progress\n\nFormatting and attachment controls are disabled while this note is locked.`}
      onSave={async () => undefined}
      onClose={() => undefined}
      onImportAttachment={async (fileName) => ({
        fileName,
        relativePath: `attachments/${fileName}`,
      })}
    />
  );
}

export const LockedEditorControls: Story = {
  render: () => <LockedEditorControlsHarness />,
};

// Controlled persistence boundary for browser behavior tests; no native writes or timers.
function PersistenceHarness() {
  const [files, setFiles] = useState<Record<string, string>>({
    "/fixture/note.md": "# Original note",
    "/fixture/other.md": "# Other note",
  });
  const [path, setPath] = useState("/fixture/note.md");
  const filesRef = useRef(files);
  filesRef.current = files;
  const [open, setOpen] = useState(true);
  const [pending, setPending] = useState(false);
  const [calls, setCalls] = useState(0);
  const [original, setOriginal] = useState("");
  const completion = useRef<{ resolve: () => void; reject: () => void } | null>(null);
  const [mutationPending, setMutationPending] = useState(false);
  const [mutationResult, setMutationResult] = useState("");
  const [importResult, setImportResult] = useState("No attachment imported");
  const [delayImport, setDelayImport] = useState(false);
  const [importPending, setImportPending] = useState(false);
  const [openedLink, setOpenedLink] = useState("No internal link opened");
  const failMutation = useRef<(() => void) | null>(null);
  const completeImport = useRef<(() => void) | null>(null);
  return (
    <>
      <button
        disabled={mutationPending}
        onClick={() => {
          void editorSessions
            .withCleanPaths(
              ["/fixture"],
              () =>
                new Promise<void>((_, reject) => {
                  setMutationPending(true);
                  setMutationResult("Pending");
                  failMutation.current = () => reject(new Error("Native operation failed"));
                }),
            )
            .catch((error: Error) => setMutationResult(error.message))
            .finally(() => setMutationPending(false));
        }}
      >
        Begin file operation
      </button>
      <button disabled={!mutationPending} onClick={() => failMutation.current?.()}>
        Fail file operation
      </button>
      <output aria-label="File operation result">{mutationResult}</output>
      <output aria-label="Attachment import result">{importResult}</output>
      <output aria-label="Opened Markdown link">{openedLink}</output>
      <button disabled={!pending} onClick={() => completion.current?.resolve()}>
        Complete save
      </button>
      <button disabled={!pending} onClick={() => completion.current?.reject()}>
        Reject save
      </button>
      <button aria-pressed={delayImport} onClick={() => setDelayImport((value) => !value)}>
        Delay attachment import
      </button>
      <button disabled={!importPending} onClick={() => completeImport.current?.()}>
        Complete attachment import
      </button>
      <button disabled={open} onClick={() => setOpen(true)}>
        Reopen note
      </button>
      <button
        onClick={() =>
          setPath(path === "/fixture/note.md" ? "/fixture/other.md" : "/fixture/note.md")
        }
      >
        Switch note
      </button>
      <button onClick={() => setFiles({ ...files, [path]: "# External edit" })}>
        External edit
      </button>
      <output aria-label="Persisted content">{files[path]}</output>
      <output aria-label="Save calls">{calls}</output>
      <output aria-label="Original snapshot">{original}</output>
      {open && (
        <MarkdownEditor
          filePath={path}
          initialContent={files[path]}
          onClose={() => setOpen(false)}
          onOpenMarkdownLink={async (_documentPath, target) => {
            setOpenedLink(target);
            return { path: "/fixture/other.md", fragment: null };
          }}
          onImportAttachment={async (fileName, bytes) => {
            const result = { fileName, relativePath: `attachments/${fileName}` };
            const recordImport = () => setImportResult(`${fileName}:${bytes.byteLength}`);
            if (!delayImport) {
              recordImport();
              return result;
            }
            return new Promise((resolve) => {
              setImportPending(true);
              completeImport.current = () => {
                completeImport.current = null;
                setImportPending(false);
                recordImport();
                resolve(result);
              };
            });
          }}
          onSave={(content, originalContent) =>
            new Promise<void>((resolve, reject) => {
              setPending(true);
              setCalls((count) => count + 1);
              setOriginal(originalContent);
              completion.current = {
                resolve: () => {
                  setPending(false);
                  if (filesRef.current[path] !== originalContent) {
                    reject(new Error("File changed"));
                    return;
                  }
                  setFiles((current) => ({ ...current, [path]: content }));
                  resolve();
                },
                reject: () => {
                  setPending(false);
                  reject(new Error("Fixture save rejected"));
                },
              };
            })
          }
        />
      )}
    </>
  );
}

export const Persistence: Story = {
  tags: ["visual"],
  render: () => <PersistenceHarness />,
};
