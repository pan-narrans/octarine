import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { Trash } from "lucide-react";
import {
  ActionButton,
  DialogCloseButton,
  FormDropdown,
  FormInput,
  FormTextarea,
  IconButton,
  MetadataPill,
  PriorityBadge,
  StatusControl,
  ToggleButton,
} from "./controls";
import "./shared-controls.css";

function ReferenceFrame({ children }: { children: ReactNode }) {
  return (
    <main className="controls-reference">
      <header className="controls-header">
        <p>Octarine design system</p>
        <h1>Shared controls</h1>
        <span>Production components rendered in their implemented states.</span>
      </header>

      {children}
    </main>
  );
}

function ActionsSection({
  autoFocus = false,
  includeDialogClose = true,
  includeIconButton = true,
}: {
  autoFocus?: boolean;
  includeDialogClose?: boolean;
  includeIconButton?: boolean;
}) {
  return (
    <section aria-labelledby="buttons-heading">
      <h2 id="buttons-heading">Actions</h2>
      <div className="controls-row">
        <ActionButton variant="primary" autoFocus={autoFocus}>
          Save Changes
        </ActionButton>
        <ActionButton variant="secondary">Cancel</ActionButton>
        <ActionButton variant="danger">Delete Task</ActionButton>
        <ToggleButton pressed={false}>Markdown</ToggleButton>
        <ToggleButton pressed>Markdown active</ToggleButton>
        <ActionButton variant="primary" disabled>
          Saving…
        </ActionButton>
        {includeDialogClose && (
          <>
            <DialogCloseButton label="Close dialog" />
            <DialogCloseButton label="Close disabled dialog" disabled />
          </>
        )}
        {includeIconButton && (
          <IconButton label="Delete item" variant="danger">
            <Trash size={16} aria-hidden="true" />
          </IconButton>
        )}
      </div>
    </section>
  );
}

function FieldsSection({
  constrained = false,
  includeStateExamples = true,
}: {
  constrained?: boolean;
  includeStateExamples?: boolean;
}) {
  const [status, setStatus] = useState("doing");

  return (
    <section aria-labelledby="fields-heading">
      <h2 id="fields-heading">Fields</h2>
      <div className="controls-fields" style={constrained ? { maxWidth: 420 } : undefined}>
        <label>
          <span>Text input</span>
          <FormInput value="Audit the calendar" readOnly />
        </label>
        <label>
          <span>Dropdown</span>
          <FormDropdown
            id="shared-controls-status"
            value={status}
            options={[
              { value: "todo", label: "Not started" },
              { value: "doing", label: "In progress" },
              { value: "done", label: "Done" },
            ]}
            onValueChange={setStatus}
          />
        </label>
        {includeStateExamples && (
          <>
            <label>
              <span>Invalid</span>
              <FormInput value="Outside vault" readOnly aria-invalid="true" />
            </label>
            <label>
              <span>Disabled</span>
              <FormInput value="Unavailable" disabled />
            </label>
          </>
        )}
        <label className="controls-field-wide">
          <span>Textarea</span>
          <FormTextarea value="Preserve hierarchy at compact widths." readOnly />
        </label>
      </div>
    </section>
  );
}

function MetadataSection() {
  return (
    <section aria-labelledby="metadata-heading">
      <h2 id="metadata-heading">Metadata</h2>
      <div className="controls-row">
        <PriorityBadge priority={1} />
        <PriorityBadge priority={2} />
        <PriorityBadge priority={3} />
        <PriorityBadge priority={4} />
        <MetadataPill kind="context">@desk</MetadataPill>
        <MetadataPill kind="project">+Octarine</MetadataPill>
        <MetadataPill kind="tag">#design</MetadataPill>
        <MetadataPill kind="scheduled">dur:2h</MetadataPill>
      </div>
      <div className="controls-editable-metadata metadata-inputs">
        <span>Editable metadata</span>
        <div className="metadata-container">
          <MetadataPill kind="context" onRemove={() => undefined} removeLabel="Remove @desk">
            @desk
          </MetadataPill>
          <MetadataPill kind="project" onRemove={() => undefined} removeLabel="Remove +Octarine">
            +Octarine
          </MetadataPill>
          <MetadataPill kind="tag" onRemove={() => undefined} removeLabel="Remove #design">
            #design
          </MetadataPill>
        </div>
      </div>
    </section>
  );
}

function StatusSection() {
  return (
    <section aria-labelledby="status-heading">
      <h2 id="status-heading">Task status</h2>
      <div className="controls-statuses">
        {(["todo", "doing", "deferred", "done", "cancelled"] as const).map((status) => (
          <label key={status}>
            <StatusControl status={status} label={`${status} task`} />
            <span>{status}</span>
          </label>
        ))}
      </div>
    </section>
  );
}

function SharedControls() {
  return (
    <ReferenceFrame>
      <ActionsSection />
      <FieldsSection />
      <MetadataSection />
      <StatusSection />
    </ReferenceFrame>
  );
}

const meta = {
  id: "design-system-shared-controls",
  title: "Design System/Primitives/Controls",
  component: SharedControls,
  parameters: { controls: { disable: true } },
} satisfies Meta<typeof SharedControls>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Inventory: Story = {};

export const Reference: Story = {
  tags: ["visual"],
  render: () => (
    <ReferenceFrame>
      <ActionsSection includeDialogClose={false} includeIconButton={false} />
      <FieldsSection includeStateExamples={false} />
      <MetadataSection />
      <StatusSection />
    </ReferenceFrame>
  ),
};

export const Actions: Story = {
  render: () => (
    <ReferenceFrame>
      <ActionsSection />
    </ReferenceFrame>
  ),
};

export const Fields: Story = {
  render: () => (
    <ReferenceFrame>
      <FieldsSection />
    </ReferenceFrame>
  ),
};

export const ConstrainedFields: Story = {
  tags: ["visual"],
  render: () => (
    <ReferenceFrame>
      <FieldsSection constrained />
    </ReferenceFrame>
  ),
};

export const Metadata: Story = {
  render: () => (
    <ReferenceFrame>
      <MetadataSection />
    </ReferenceFrame>
  ),
};

export const TaskStatus: Story = {
  render: () => (
    <ReferenceFrame>
      <StatusSection />
    </ReferenceFrame>
  ),
};

export const KeyboardFocus: Story = {
  tags: ["visual"],
  render: () => (
    <ReferenceFrame>
      <ActionsSection autoFocus />
    </ReferenceFrame>
  ),
};
