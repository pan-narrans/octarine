import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  ActionButton,
  FormInput,
  FormSelect,
  FormTextarea,
  MetadataPill,
  PriorityBadge,
  StatusControl,
} from "./controls";
import "./shared-controls.css";

function SharedControls() {
  return (
    <main className="controls-reference">
      <header className="controls-header">
        <p>Octarine design system</p>
        <h1>Shared controls</h1>
        <span>Production components rendered in their implemented states.</span>
      </header>

      <section aria-labelledby="buttons-heading">
        <h2 id="buttons-heading">Actions</h2>
        <div className="controls-row">
          <ActionButton variant="primary">Save Changes</ActionButton>
          <ActionButton variant="secondary">Cancel</ActionButton>
          <ActionButton variant="danger">Delete Task</ActionButton>
          <ActionButton variant="toggle">Markdown</ActionButton>
          <ActionButton variant="toggle" className="active">
            Markdown active
          </ActionButton>
          <ActionButton variant="primary" disabled>
            Saving…
          </ActionButton>
        </div>
      </section>

      <section aria-labelledby="fields-heading">
        <h2 id="fields-heading">Fields</h2>
        <div className="controls-fields">
          <label>
            <span>Text input</span>
            <FormInput value="Audit the calendar" readOnly />
          </label>
          <label>
            <span>Select</span>
            <FormSelect value="doing" onChange={() => undefined}>
              <option value="todo">Not started</option>
              <option value="doing">In progress</option>
              <option value="done">Done</option>
            </FormSelect>
          </label>
          <label className="controls-field-wide">
            <span>Textarea</span>
            <FormTextarea value="Preserve hierarchy at compact widths." readOnly />
          </label>
        </div>
      </section>

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
    </main>
  );
}

const meta = {
  title: "Design System/Shared Controls",
  component: SharedControls,
  parameters: { controls: { disable: true } },
} satisfies Meta<typeof SharedControls>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Reference: Story = {};
