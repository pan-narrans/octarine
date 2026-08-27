import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import type { Task } from "../../types";
import { DayDrawer, type ScheduleDraft } from "./DayDrawer";

const events: Task[] = [
  {
    line_number: 1,
    raw_markdown: "- [ ] Design review",
    hash: "design-review",
    status: "todo",
    task_type: "event",
    description: "Design review",
    project: null,
    due_date: null,
    s_start: "2026-08-26 10:00",
    duration_secs: 3600,
    recurring: "every weekday",
    when_done: null,
    priority: null,
    tags: [],
    contexts: [],
    parse_errors: null,
    file_path: "/example.md",
    parent_hash: null,
  },
  {
    line_number: 2,
    raw_markdown: "- [ ] Planning session",
    hash: "planning-session",
    status: "todo",
    task_type: "event",
    description: "Planning session",
    project: null,
    due_date: null,
    s_start: "2026-08-26 14:30",
    duration_secs: 1800,
    recurring: null,
    when_done: null,
    priority: null,
    tags: [],
    contexts: [],
    parse_errors: null,
    file_path: "/example.md",
    parent_hash: null,
  },
];

function Harness({
  initialEvents,
  initiallyEditing = false,
}: {
  initialEvents: Task[];
  initiallyEditing?: boolean;
}) {
  const [editingEventHash, setEditingEventHash] = useState<string | null>(
    initiallyEditing ? (initialEvents[0]?.hash ?? null) : null,
  );
  const [draft, setDraft] = useState<ScheduleDraft>({
    date: "2026-08-26",
    time: "10:00",
    durationMinutes: 60,
  });

  return (
    <DayDrawer
      date={new Date("2026-08-26T12:00:00")}
      events={initialEvents}
      editingEventHash={editingEventHash}
      draft={draft}
      onClose={() => undefined}
      onEditStart={(event) => {
        setEditingEventHash(event.hash);
        setDraft({
          date: event.s_start?.slice(0, 10) ?? "2026-08-26",
          time: event.s_start?.slice(11, 16) ?? "12:00",
          durationMinutes: event.duration_secs ? event.duration_secs / 60 : 60,
        });
      }}
      onDraftChange={setDraft}
      onCancelEdit={() => setEditingEventHash(null)}
      onSaveSchedule={() => setEditingEventHash(null)}
    />
  );
}

const meta = {
  title: "Calendar/DayDrawer",
  component: DayDrawer,
  args: {
    date: new Date("2026-08-26T12:00:00"),
    events,
    editingEventHash: null,
    draft: { date: "2026-08-26", time: "10:00", durationMinutes: 60 },
    onClose: () => undefined,
    onEditStart: () => undefined,
    onDraftChange: () => undefined,
    onCancelEdit: () => undefined,
    onSaveSchedule: () => undefined,
  },
} satisfies Meta<typeof DayDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { render: () => <Harness initialEvents={events} /> };
export const Editing: Story = { render: () => <Harness initialEvents={events} initiallyEditing /> };
export const Empty: Story = { render: () => <Harness initialEvents={[]} /> };

export const Narrow: Story = {
  render: () => <Harness initialEvents={events} initiallyEditing />,
  globals: { viewport: { value: "octarineNarrow", isRotated: false } },
};
