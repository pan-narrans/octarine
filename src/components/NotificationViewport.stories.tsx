import type { Meta, StoryObj } from "@storybook/react-vite";
import type { AppNotification } from "./NotificationViewport";
import { NotificationViewport } from "./NotificationViewport";

const destinationPath = "/Users/me/Octarine/projects/work/octarine.md";

const success: AppNotification = {
  id: "created",
  kind: "success",
  title: "Task created",
  message: "Prepare launch brief",
  detail: destinationPath,
  actions: [
    { label: "Undo", onClick: () => undefined },
    { label: "Open file", onClick: () => undefined },
  ],
};

function ReviewSurface(props: React.ComponentProps<typeof NotificationViewport>) {
  return (
    <main className="task-creation-review-surface">
      <header className="task-creation-review-header">
        <span>Octarine</span>
        <button type="button">New task</button>
      </header>
      <div className="task-creation-review-content" aria-hidden="true">
        <h1>Today</h1>
        <div />
        <div />
      </div>
      <NotificationViewport {...props} />
    </main>
  );
}

const meta = {
  title: "Feedback/NotificationViewport",
  component: NotificationViewport,
  render: (args) => <ReviewSurface {...args} />,
  args: {
    notifications: [],
    onDismiss: () => undefined,
  },
} satisfies Meta<typeof NotificationViewport>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Success: Story = {
  args: { notifications: [success] },
};

export const Information: Story = {
  args: {
    notifications: [
      {
        ...success,
        kind: "info",
        title: "Task created at end of file",
        message: "No insertion method configured. Used end of file.",
      },
    ],
  },
};

export const Warning: Story = {
  args: {
    notifications: [
      {
        ...success,
        kind: "warning",
        title: "Task created with fallback",
        message: "Insertion target appears multiple times. Used end of file.",
      },
    ],
  },
};

export const Error: Story = {
  args: {
    notifications: [
      {
        id: "write-error",
        kind: "error",
        title: "Task not created",
        message: "Octarine could not write destination file. Your draft is still open.",
        detail: destinationPath,
      },
    ],
  },
};

export const PartialSuccessWarning: Story = {
  args: {
    notifications: [
      {
        id: "index-warning",
        kind: "warning",
        title: "Task saved; list not refreshed",
        message: "Markdown is safe. Retry refresh to show task in Octarine.",
        detail: destinationPath,
        actions: [
          { label: "Retry refresh", onClick: () => undefined },
          { label: "Open file", onClick: () => undefined },
        ],
      },
    ],
  },
};

export const Stack: Story = {
  args: {
    notifications: [
      {
        id: "newest",
        kind: "error",
        title: "Task not created",
        message: "Destination is not writable.",
      },
      {
        id: "second",
        kind: "warning",
        title: "Task created with fallback",
        message: "Used end of file.",
      },
      success,
      {
        id: "hidden-fourth",
        kind: "info",
        title: "Hidden notification",
        message: "Only three newest notifications render.",
      },
    ],
  },
};

export const MobileInformation: Story = {
  args: {
    notifications: [
      {
        ...success,
        kind: "info",
        title: "Task created at end of file",
        message: "No insertion method configured. Used end of file.",
      },
    ],
  },
  globals: { viewport: { value: "octarineMobile", isRotated: false } },
};
