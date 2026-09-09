import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { TaskDraftPreview } from "../types";
import { CreateTaskModal } from "./CreateTaskModal";
import type { AppNotification } from "./NotificationViewport";
import { NotificationViewport } from "./NotificationViewport";

const preview: TaskDraftPreview = {
  draft: {
    title: "Prepare launch brief",
    notes: "Summarize scope and open decisions.",
    status: "todo",
    priority: "A",
    dueDate: "2026-09-10",
    duration: "1h30m",
    recurrence: null,
    project: "work/octarine",
    contexts: ["desk"],
    tags: ["launch"],
    subtasks: [
      {
        title: "Collect screenshots",
        notes: "",
        status: "todo",
        priority: null,
        dueDate: null,
        duration: null,
        recurrence: null,
        project: "work/octarine",
        contexts: [],
        tags: [],
        subtasks: [],
        rawMarkdown: "- [ ] Collect screenshots",
      },
    ],
    rawMarkdown:
      "- [ ] Prepare launch brief +work/octarine @desk #launch (A) due:2026-09-10 dur:1h30m\n    Summarize scope and open decisions.\n    - [ ] Collect screenshots",
  },
  taskType: "task",
  destinationPath: "/Users/me/Octarine/projects/work/octarine.md",
  inheritedProject: "work/octarine",
};

const successfulCreation: AppNotification = {
  id: "created",
  kind: "success",
  title: "Task created",
  message: "Prepare launch brief",
  detail: preview.destinationPath,
  actions: [
    { label: "Undo", onClick: () => undefined },
    { label: "Open file", onClick: () => undefined },
  ],
};

interface ReviewArgs {
  input: string;
  preview: TaskDraftPreview | null;
  expanded: boolean;
  creating?: boolean;
  validationMessage?: string | null;
  initialModalOpen?: boolean;
  initialNotifications?: AppNotification[];
}

function ReviewHarness({
  input: initialInput,
  preview: initialPreview,
  expanded: initiallyExpanded,
  creating = false,
  validationMessage = null,
  initialModalOpen = true,
  initialNotifications = [],
}: ReviewArgs) {
  const [input, setInput] = useState(initialInput);
  const [currentPreview, setPreview] = useState(initialPreview);
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [modalOpen, setModalOpen] = useState(initialModalOpen);
  const [notifications, setNotifications] = useState(initialNotifications);

  return (
    <main className="task-creation-review-surface">
      <header className="task-creation-review-header">
        <span>Octarine</span>
        <button type="button" onClick={() => setModalOpen(true)}>
          New task
        </button>
      </header>
      <div className="task-creation-review-content" aria-hidden="true">
        <h1>Today</h1>
        <div />
        <div />
      </div>

      {modalOpen && (
        <CreateTaskModal
          input={input}
          preview={currentPreview}
          expanded={expanded}
          creating={creating}
          validationMessage={validationMessage}
          onInputChange={setInput}
          onDraftChange={setPreview}
          onRawMarkdownChange={(rawMarkdown) =>
            setPreview((current) =>
              current ? { ...current, draft: { ...current.draft, rawMarkdown } } : current,
            )
          }
          onExpandedChange={setExpanded}
          onCreate={() => {
            setModalOpen(false);
            setNotifications([successfulCreation]);
          }}
          onClose={() => setModalOpen(false)}
        />
      )}

      <NotificationViewport
        notifications={notifications}
        onDismiss={(id) =>
          setNotifications((current) => current.filter((notification) => notification.id !== id))
        }
      />
    </main>
  );
}

const meta = {
  title: "Tasks/CreateTaskModal",
  component: ReviewHarness,
  args: {
    input: "Prepare launch brief +work/octarine @desk #launch",
    preview,
    expanded: false,
  },
} satisfies Meta<typeof ReviewHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

export const QuickCapture: Story = {};

export const ExpandedInheritedProject: Story = {
  args: { expanded: true },
};

export const EventDestination: Story = {
  args: {
    preview: { ...preview, taskType: "event" },
    input: 'Design review s:"2026-09-10 14:00" +work/octarine',
  },
};

export const Creating: Story = {
  args: { creating: true },
};

export const Created: Story = {
  args: { initialModalOpen: false, initialNotifications: [successfulCreation] },
};

export const ValidationError: Story = {
  args: {
    preview: null,
    validationMessage: "Use one project only.",
  },
};

export const MobileExpanded: Story = {
  args: { expanded: true },
  globals: { viewport: { value: "octarineMobile", isRotated: false } },
};

export const MobileCreated: Story = {
  args: { initialModalOpen: false, initialNotifications: [successfulCreation] },
  globals: { viewport: { value: "octarineMobile", isRotated: false } },
};
