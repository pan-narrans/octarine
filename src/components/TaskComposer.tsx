import { Plus, Trash } from "lucide-react";
import { FormDropdown, FormInput, FormTextarea, MetadataPill } from "../design-system/controls";
import type { TaskDraft, TaskPriority, TaskStatus } from "../types";
import { inheritDraftProject } from "./task-composer-model";

interface TaskComposerProps {
  draft: TaskDraft;
  onChange: (draft: TaskDraft) => void;
  onRawMarkdownChange: (rawMarkdown: string) => void;
}

export function TaskComposer({ draft, onChange, onRawMarkdownChange }: TaskComposerProps) {
  const update = <Key extends keyof TaskDraft>(key: Key, value: TaskDraft[Key]) =>
    onChange({ ...draft, [key]: value });
  const addToken = (key: "contexts" | "tags", value: string) => {
    const normalized = value.trim().replace(/^[@#]/, "");
    if (!normalized || draft[key].includes(normalized)) return;
    update(key, [...draft[key], normalized]);
  };

  return (
    <div className="task-composer">
      <div className="task-summary" data-selected="true">
        <div className="form-group task-summary-title">
          <FormInput
            aria-label="Task title"
            value={draft.title}
            onChange={(event) => update("title", event.target.value)}
            placeholder="What needs doing?"
          />
        </div>
        <div className="form-group task-summary-description">
          <FormTextarea
            aria-label="Task notes"
            value={draft.notes}
            onChange={(event) => update("notes", event.target.value)}
            placeholder="Add notes…"
            rows={Math.max(2, draft.notes.split("\n").length)}
          />
        </div>
      </div>

      <div className="form-group">
        <div className="task-composer-section-heading">
          <label>Subtasks</label>
          <button
            type="button"
            className="task-composer-add"
            onClick={() =>
              update("subtasks", [
                ...draft.subtasks,
                {
                  ...draft,
                  title: "",
                  notes: "",
                  priority: null,
                  dueDate: null,
                  duration: null,
                  recurrence: null,
                  contexts: [],
                  tags: [],
                  subtasks: [],
                  rawMarkdown: "",
                },
              ])
            }
          >
            <Plus size={14} /> Add
          </button>
        </div>
        {draft.subtasks.length === 0 ? (
          <p className="task-composer-empty">No subtasks</p>
        ) : (
          <div className="task-composer-subtasks">
            {draft.subtasks.map((subtask, index) => (
              <div className="task-composer-subtask" key={index}>
                <FormInput
                  aria-label={`Subtask ${index + 1}`}
                  value={subtask.title}
                  onChange={(event) => {
                    const subtasks = [...draft.subtasks];
                    subtasks[index] = { ...subtask, title: event.target.value };
                    update("subtasks", subtasks);
                  }}
                  placeholder="Subtask title"
                />
                <button
                  type="button"
                  className="btn-icon trash"
                  aria-label={`Remove subtask ${index + 1}`}
                  onClick={() =>
                    update(
                      "subtasks",
                      draft.subtasks.filter((_, candidate) => candidate !== index),
                    )
                  }
                >
                  <Trash size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="create-task-priority">Priority</label>
          <FormDropdown
            id="create-task-priority"
            value={draft.priority ?? ""}
            options={[
              { value: "", label: "None" },
              { value: "A", label: "High (A)" },
              { value: "B", label: "Medium (B)" },
              { value: "C", label: "Low (C)" },
              { value: "D", label: "Lowest (D)" },
            ]}
            onValueChange={(value) => update("priority", (value || null) as TaskPriority | null)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="create-task-due">Due date</label>
          <FormInput
            id="create-task-due"
            type="date"
            value={draft.dueDate ?? ""}
            onChange={(event) => update("dueDate", event.target.value || null)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="create-task-status">Status</label>
          <FormDropdown
            id="create-task-status"
            value={draft.status}
            options={[
              { value: "todo", label: "Not started" },
              { value: "doing", label: "In progress" },
              { value: "deferred", label: "Deferred" },
              { value: "done", label: "Done" },
              { value: "cancelled", label: "Cancelled" },
            ]}
            onValueChange={(value) => update("status", value as TaskStatus)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="create-task-estimate">Estimate</label>
          <FormInput
            id="create-task-estimate"
            value={draft.duration ?? ""}
            onChange={(event) => update("duration", event.target.value || null)}
            placeholder="e.g. 2h, 30m"
          />
        </div>
        <div className="form-group form-grid-wide">
          <label htmlFor="create-task-recurrence">Recurrence</label>
          <FormInput
            id="create-task-recurrence"
            value={draft.recurrence ?? ""}
            onChange={(event) => update("recurrence", event.target.value || null)}
            placeholder="e.g. every weekday"
          />
        </div>
      </div>

      <div className="metadata-inputs">
        <TokenInput
          label="Contexts"
          prefix="@"
          values={draft.contexts}
          kind="context"
          onAdd={(value) => addToken("contexts", value)}
          onRemove={(value) =>
            update(
              "contexts",
              draft.contexts.filter((item) => item !== value),
            )
          }
        />
        <div className="form-group">
          <label htmlFor="create-task-project">Project</label>
          <FormInput
            id="create-task-project"
            value={draft.project ?? ""}
            onChange={(event) => onChange(inheritDraftProject(draft, event.target.value || null))}
            placeholder="work/project1"
          />
          {draft.project && (
            <div className="metadata-container">
              <MetadataPill
                kind="project"
                onRemove={() => onChange(inheritDraftProject(draft, null))}
                removeLabel={`Remove +${draft.project}`}
              >
                {`+${draft.project}`}
              </MetadataPill>
            </div>
          )}
        </div>
        <TokenInput
          label="Tags"
          prefix="#"
          values={draft.tags}
          kind="tag"
          onAdd={(value) => addToken("tags", value)}
          onRemove={(value) =>
            update(
              "tags",
              draft.tags.filter((item) => item !== value),
            )
          }
        />
      </div>

      <div className="form-group task-composer-markdown">
        <label htmlFor="create-task-markdown">Markdown</label>
        <FormTextarea
          id="create-task-markdown"
          value={draft.rawMarkdown}
          onChange={(event) => onRawMarkdownChange(event.target.value)}
          rows={5}
          spellCheck={false}
        />
        <p>Source changes revalidate through Rust before creation.</p>
      </div>
    </div>
  );
}

function TokenInput({
  label,
  prefix,
  values,
  kind,
  onAdd,
  onRemove,
}: {
  label: string;
  prefix: "@" | "#";
  values: string[];
  kind: "context" | "tag";
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
}) {
  return (
    <div className="form-group">
      <label htmlFor={`create-task-${kind}`}>{label}</label>
      <FormInput
        id={`create-task-${kind}`}
        placeholder={`Add ${label.toLowerCase()}…`}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || !event.currentTarget.value.trim()) return;
          event.preventDefault();
          onAdd(event.currentTarget.value);
          event.currentTarget.value = "";
        }}
      />
      <div className="metadata-container">
        {values.map((value) => (
          <MetadataPill
            key={value}
            kind={kind}
            onRemove={() => onRemove(value)}
            removeLabel={`Remove ${prefix}${value}`}
          >
            {`${prefix}${value}`}
          </MetadataPill>
        ))}
      </div>
    </div>
  );
}
