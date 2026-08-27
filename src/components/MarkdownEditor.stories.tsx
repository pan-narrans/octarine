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
