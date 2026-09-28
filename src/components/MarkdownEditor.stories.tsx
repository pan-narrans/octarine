import { useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MarkdownEditor } from "./MarkdownEditor";

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
  return (
    <>
      <button disabled={!pending} onClick={() => completion.current?.resolve()}>
        Complete save
      </button>
      <button disabled={!pending} onClick={() => completion.current?.reject()}>
        Reject save
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
