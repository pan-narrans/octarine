import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import type { Task } from "../../types";
import { CalendarSurface, type CalendarView } from "./CalendarSurface";

const task: Task = {
  line_number: 1,
  raw_markdown: "- [ ] Design review",
  hash: "calendar-event",
  status: "todo",
  task_type: "event",
  description: "Design review",
  project: null,
  due_date: null,
  s_start: "2026-08-26 10:00",
  duration_secs: 3600,
  recurring: null,
  when_done: null,
  priority: null,
  tags: [],
  contexts: [],
  parse_errors: null,
  file_path: "/example.md",
  parent_hash: null,
};

function Harness({ initialView }: { initialView: CalendarView }) {
  const [view, setView] = useState(initialView);
  const [date, setDate] = useState(new Date("2026-08-26T12:00:00"));
  const [repetitions, setRepetitions] = useState(false);
  return (
    <CalendarSurface
      tasks={[task]}
      currentDate={date}
      view={view}
      showFutureRepetitions={repetitions}
      onViewChange={setView}
      onPrevious={() => setDate(new Date(date.getFullYear(), date.getMonth() - 1, 1))}
      onNext={() => setDate(new Date(date.getFullYear(), date.getMonth() + 1, 1))}
      onShowFutureRepetitionsChange={setRepetitions}
      onDayOpen={() => undefined}
    />
  );
}

const meta = {
  title: "Calendar/CalendarSurface",
  component: CalendarSurface,
  args: {
    tasks: [task],
    currentDate: new Date("2026-08-26T12:00:00"),
    view: "month",
    showFutureRepetitions: false,
    onViewChange: () => undefined,
    onPrevious: () => undefined,
    onNext: () => undefined,
    onShowFutureRepetitionsChange: () => undefined,
    onDayOpen: () => undefined,
  },
  decorators: [
    (Story) => (
      <div style={{ minHeight: "100vh", padding: "48px", background: "var(--bg-space)" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CalendarSurface>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Month: Story = { render: () => <Harness initialView="month" /> };
export const Week: Story = { render: () => <Harness initialView="week" /> };

export const MonthNarrow: Story = {
  render: () => <Harness initialView="month" />,
  globals: { viewport: { value: "octarineNarrow", isRotated: false } },
};

export const WeekNarrow: Story = {
  render: () => <Harness initialView="week" />,
  globals: { viewport: { value: "octarineNarrow", isRotated: false } },
};
