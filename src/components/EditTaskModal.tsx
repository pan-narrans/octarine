import { useState } from "react";
import { Trash, X } from "lucide-react";
import {
  ActionButton,
  FormDropdown,
  FormInput,
  FormTextarea,
  MetadataPill,
} from "../design-system/controls";
import { Task } from "../types";

interface EditTaskModalProps {
  task: Task;
  onClose: () => void;
  onSave: (newRawMarkdown: string) => Promise<void | boolean>;
  onDelete: () => Promise<void>;
  /** Storybook-only initial states; production callers use the defaults. */
  initialShowMarkdown?: boolean;
  initialSelectedTask?: "main" | number | null;
  initialSaving?: boolean;
}

const TASK_PREFIX = /^(\s*[-*+]\s+\[.*?\]\s*(?:\([A-Da-d]\)\s*)?)/i;
const METADATA =
  /(?:due:|s:|dur:|when_done:)(?:"[^"]*"|'[^']*'|\S+)|recurring:(?:"[^"]*"|'[^']*'|\S+)|\+[\w\-/]+|@[\w\-/]+|#[\w\-/]+/g;

function replaceHeaderMetadata(raw: string, expression: RegExp, value: string, priority = false) {
  const lines = raw.split("\n");
  let header = lines[0] ?? "";
  if (expression.test(header)) header = header.replace(expression, value);
  else if (value)
    header = priority
      ? header.replace(/^(\s*[-*+]\s+\[.*?\]\s*)/, `$1${value} `)
      : `${header} ${value}`;
  lines[0] = header.replace(/\s{2,}/g, " ").trim();
  return lines.join("\n");
}

function metadataValue(header: string, key: "due" | "dur" | "recurring") {
  const match = header.match(new RegExp(`${key}:(?:"([^"]*)"|'([^']*)'|(\\S+))`, "i"));
  return match ? (match[1] ?? match[2] ?? match[3] ?? "") : "";
}

function displayDescription(lines: string[]) {
  return lines.map((line) => line.replace(/^\s*-\s?/, "")).join("\n");
}

export function EditTaskModal({
  task,
  onClose,
  onSave,
  onDelete,
  initialShowMarkdown = false,
  initialSelectedTask = null,
  initialSaving = false,
}: EditTaskModalProps) {
  const [rawMarkdown, setRawMarkdown] = useState(task.raw_markdown);
  const [showMarkdown, setShowMarkdown] = useState(initialShowMarkdown);
  const [sourceMode, setSourceMode] = useState<"raw" | "preview">("raw");
  const [selectedTask, setSelectedTask] = useState<"main" | number | null>(initialSelectedTask);
  const [saving, setSaving] = useState(initialSaving);
  const lines = rawMarkdown.split("\n");
  const headerLine = lines[0] ?? "";
  const status = headerLine.match(/^\s*[-*+]\s+\[(.)\]/)?.[1] ?? " ";
  const priority = headerLine.match(/\(([A-Da-d])\)/i)?.[1]?.toUpperCase() ?? "";
  const dueDate = metadataValue(headerLine, "due");
  const estimate = metadataValue(headerLine, "dur");
  const recurrence = metadataValue(headerLine, "recurring");
  const contexts = headerLine.match(/@[\w\-/]+/g) ?? [];
  const projects = headerLine.match(/\+[\w\-/]+/g) ?? [];
  const tags = headerLine.match(/#[\w\-/]+/g) ?? [];
  let title = headerLine.replace(TASK_PREFIX, "");
  title = title
    .replace(/\([A-Da-d]\)\s*/g, "")
    .replace(METADATA, "")
    .trim();
  const parentDescriptionIndexes: number[] = [];
  const subtaskLines: Array<{
    prefix: string;
    text: string;
    depth: number;
    lineIndex: number;
    descriptionIndexes: number[];
  }> = [];
  const stack: Array<{ depth: number; subtask?: number }> = [{ depth: 0 }];
  lines.slice(1).forEach((line, offset) => {
    const lineIndex = offset + 1;
    const match = line.match(/^(\s*[-*+]\s+\[.*?\]\s*)(.*)$/);
    const depth = line.match(/^\s*/)?.[0].length ?? 0;
    if (match) {
      while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop();
      subtaskLines.push({
        prefix: match[1],
        text: match[2],
        depth,
        lineIndex,
        descriptionIndexes: [],
      });
      stack.push({ depth, subtask: subtaskLines.length - 1 });
    } else {
      const owner = [...stack]
        .reverse()
        .find((entry) => entry.subtask !== undefined && entry.depth < depth);
      const previousSubtask = subtaskLines[subtaskLines.length - 1];
      const fallbackOwner =
        previousSubtask && previousSubtask.depth === depth ? previousSubtask : undefined;
      const subtask = owner?.subtask === undefined ? fallbackOwner : subtaskLines[owner.subtask];
      if (!subtask) parentDescriptionIndexes.push(lineIndex);
      else subtask.descriptionIndexes.push(lineIndex);
    }
  });
  const rootSubtaskDepth = subtaskLines.length
    ? Math.min(...subtaskLines.map((subtask) => subtask.depth))
    : 0;
  const description = displayDescription(parentDescriptionIndexes.map((index) => lines[index]));
  const updateHeader = (updater: (header: string) => string) =>
    setRawMarkdown((previous) => {
      const next = previous.split("\n");
      next[0] = updater(next[0] ?? "");
      return next.join("\n");
    });
  const updateTitle = (value: string) =>
    updateHeader((header) =>
      `${header.match(TASK_PREFIX)?.[1] ?? "- [ ] "}${value} ${header.match(METADATA)?.join(" ") ?? ""}`
        .replace(/\s{2,}/g, " ")
        .trim(),
    );
  const updateStatus = (value: string) =>
    updateHeader((header) =>
      /^\s*[-*+]\s+\[.\]/.test(header)
        ? header.replace(/^(\s*[-*+]\s+\[)(.)(\])/, `$1${value}$3`)
        : `- [${value}] ${header}`,
    );
  const updateDescription = (
    indexes: number[],
    value: string,
    depth = 0,
    insertionIndex?: number,
  ) =>
    setRawMarkdown((previous) => {
      const next = previous.split("\n");
      const replacement = value
        ? value.split("\n").map((line) => (line ? `${" ".repeat(depth + 2)}- ${line}` : ""))
        : [];
      const start = indexes[0] ?? insertionIndex ?? (depth === 0 ? 1 : next.length);
      const end = indexes.length ? indexes[indexes.length - 1] + 1 : start;
      next.splice(start, end - start, ...replacement);
      return next.join("\n");
    });
  const updateSubtask = (index: number, value: string) => {
    setRawMarkdown((previous) => {
      const next = previous.split("\n");
      next[subtaskLines[index].lineIndex] = `${subtaskLines[index].prefix}${value}`;
      return next.join("\n");
    });
  };
  const addSubtask = () => {
    const next = [...lines];
    const selectedSubtask =
      typeof selectedTask === "number" ? subtaskLines[selectedTask] : undefined;
    const parentDepth = selectedSubtask?.depth;
    const depth = parentDepth === undefined ? rootSubtaskDepth || 4 : parentDepth + 2;
    const subtreeStart = selectedSubtask ?? subtaskLines.find((subtask) => subtask.depth === depth);
    let insertionIndex = next.length;

    if (subtreeStart) {
      for (let index = subtreeStart.lineIndex + 1; index < next.length; index += 1) {
        if (!next[index].trim()) continue;
        const candidateDepth = next[index].match(/^\s*/)?.[0].length ?? 0;
        const leavesSelectedSubtree =
          parentDepth === undefined ? candidateDepth < depth : candidateDepth <= parentDepth;
        if (leavesSelectedSubtree) {
          insertionIndex = index;
          break;
        }
      }
    }

    const newSubtaskIndex = subtaskLines.filter(
      (subtask) => subtask.lineIndex < insertionIndex,
    ).length;
    next.splice(insertionIndex, 0, `${" ".repeat(depth)}- [ ] New subtask`);
    setRawMarkdown(next.join("\n"));
    setSelectedTask(newSubtaskIndex);
  };
  const removeToken = (token: string) =>
    updateHeader((header) =>
      header
        .replace(token, "")
        .replace(/\s{2,}/g, " ")
        .trim(),
    );
  const requestDelete = async () => {
    if (
      !window.confirm(
        "Delete this task and all of its notes and nested subtasks from the Markdown file?",
      )
    )
      return;
    setSaving(true);
    try {
      await onDelete();
      onClose();
    } finally {
      setSaving(false);
    }
  };
  const handleSave = async () => {
    if (!rawMarkdown.trim()) return requestDelete();
    setSaving(true);
    try {
      const shouldClose = await onSave(rawMarkdown);
      if (shouldClose !== false) onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section
        className={`modal-container ${showMarkdown ? "markdown-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-task-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="edit-task-title">Edit Task</h2>
          <div className="modal-header-actions">
            <ActionButton
              variant="toggle"
              className={showMarkdown ? "active" : ""}
              onClick={() => setShowMarkdown((open) => !open)}
              aria-pressed={showMarkdown}
            >
              Markdown
            </ActionButton>
            <button
              className="modal-close"
              type="button"
              onClick={onClose}
              aria-label="Close edit task dialog"
            >
              <X size={18} />
            </button>
          </div>
        </header>
        <div className="modal-body">
          <div className="modal-form">
            <div
              className="task-summary"
              data-selected={selectedTask === "main" ? "true" : undefined}
              onPointerDown={() => setSelectedTask("main")}
              onFocusCapture={() => setSelectedTask("main")}
            >
              <div className="form-group task-summary-title">
                <FormInput
                  id="task-title"
                  value={title}
                  onChange={(event) => updateTitle(event.target.value)}
                />
              </div>
              <div className="form-group task-summary-description">
                <FormTextarea
                  id="task-description"
                  value={description}
                  onChange={(event) =>
                    updateDescription(
                      parentDescriptionIndexes,
                      event.target.value,
                      0,
                      subtaskLines[0]?.lineIndex ?? 1,
                    )
                  }
                  placeholder="Add description..."
                  rows={Math.max(1, description.split("\n").length)}
                />
              </div>
            </div>
            <div className="form-group">
              <label>Subtasks</label>
              {subtaskLines.map((subtask, index) => (
                <div
                  className="form-subtask-row"
                  key={`${index}-${subtask.prefix}-${subtask.text}`}
                  style={{ marginLeft: `${Math.max(0, subtask.depth - rootSubtaskDepth) * 10}px` }}
                  data-selected={selectedTask === index ? "true" : undefined}
                  onPointerDown={() => setSelectedTask(index)}
                  onFocusCapture={() => setSelectedTask(index)}
                >
                  <FormInput
                    aria-label={`Subtask ${index + 1}`}
                    value={subtask.text}
                    onChange={(event) => updateSubtask(index, event.target.value)}
                  />
                  <FormTextarea
                    aria-label={`Description for subtask ${index + 1}`}
                    value={displayDescription(
                      subtask.descriptionIndexes.map((lineIndex) => lines[lineIndex]),
                    )}
                    onChange={(event) =>
                      updateDescription(
                        subtask.descriptionIndexes,
                        event.target.value,
                        subtask.depth,
                        subtask.lineIndex + 1,
                      )
                    }
                    className="subtask-description"
                    placeholder="Add subtask description..."
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTask(null);
                      setRawMarkdown((previous) => {
                        const next = previous.split("\n");
                        const start = subtask.lineIndex;
                        const end = subtaskLines[index + 1]?.lineIndex ?? next.length;
                        next.splice(start, end - start);
                        return next.join("\n");
                      });
                    }}
                    className="btn-icon trash"
                    aria-label={`Remove subtask ${index + 1}`}
                  >
                    <Trash size={16} />
                  </button>
                </div>
              ))}
              <button type="button" onClick={addSubtask} className="add-subtask">
                + Add subtask
              </button>
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="task-priority">Priority</label>
                <FormDropdown
                  id="task-priority"
                  value={priority}
                  options={[
                    { value: "", label: "None" },
                    { value: "A", label: "High (A)" },
                    { value: "B", label: "Medium (B)" },
                    { value: "C", label: "Low (C)" },
                    { value: "D", label: "Lowest (D)" },
                  ]}
                  onValueChange={(value) =>
                    setRawMarkdown((previous) =>
                      replaceHeaderMetadata(
                        previous,
                        /\([A-Da-d]\)/i,
                        value ? `(${value})` : "",
                        true,
                      ),
                    )
                  }
                />
              </div>
              <div className="form-group">
                <label htmlFor="task-due-date">Due date</label>
                <FormInput
                  id="task-due-date"
                  type="date"
                  value={dueDate}
                  onChange={(event) =>
                    setRawMarkdown((previous) =>
                      replaceHeaderMetadata(
                        previous,
                        /due:(?:"[^"]*"|'[^']*'|\S+)/i,
                        event.target.value ? `due:${event.target.value}` : "",
                      ),
                    )
                  }
                />
              </div>
              <div className="form-group">
                <label htmlFor="task-status">Status</label>
                <FormDropdown
                  id="task-status"
                  value={status}
                  options={[
                    { value: " ", label: "Not started" },
                    { value: "/", label: "In progress" },
                    { value: ">", label: "Deferred" },
                    { value: "x", label: "Done" },
                    { value: "-", label: "Cancelled" },
                  ]}
                  onValueChange={updateStatus}
                />
              </div>
              <div className="form-group">
                <label htmlFor="task-estimate">Estimate</label>
                <FormInput
                  id="task-estimate"
                  value={estimate}
                  onChange={(event) =>
                    setRawMarkdown((previous) =>
                      replaceHeaderMetadata(
                        previous,
                        /dur:(?:"[^"]*"|'[^']*'|\S+)/i,
                        event.target.value.trim() ? `dur:${event.target.value.trim()}` : "",
                      ),
                    )
                  }
                  placeholder="e.g. 2h, 30m, 3d"
                />
              </div>
              <div className="form-group form-grid-wide">
                <label htmlFor="task-recurrence">Recurrence</label>
                <FormInput
                  id="task-recurrence"
                  value={recurrence}
                  onChange={(event) =>
                    setRawMarkdown((previous) =>
                      replaceHeaderMetadata(
                        previous,
                        /recurring:(?:"[^"]*"|'[^']*'|\S+)/i,
                        event.target.value.trim() ? `recurring:"${event.target.value.trim()}"` : "",
                      ),
                    )
                  }
                  placeholder="e.g. every weekday or 0 9 * * 1-5"
                />
              </div>
            </div>
            <div className="metadata-inputs">
              {[
                { label: "Contexts", prefix: "@", items: contexts, kind: "context" as const },
                { label: "Projects", prefix: "+", items: projects, kind: "project" as const },
                { label: "Tags", prefix: "#", items: tags, kind: "tag" as const },
              ].map(({ label, prefix, items, kind }) => (
                <MetadataInput
                  key={label}
                  label={label}
                  prefix={prefix}
                  items={items}
                  kind={kind}
                  onAdd={(value) =>
                    updateHeader((header) =>
                      `${header} ${prefix}${value}`.replace(/\s{2,}/g, " ").trim(),
                    )
                  }
                  onRemove={removeToken}
                />
              ))}
            </div>
          </div>
          {showMarkdown && (
            <aside className="modal-raw" aria-label="Markdown source">
              <div className="raw-header">
                <span>Markdown</span>
                <div className="source-tabs">
                  <button
                    type="button"
                    className={sourceMode === "preview" ? "active" : ""}
                    onClick={() => setSourceMode("preview")}
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    className={sourceMode === "raw" ? "active" : ""}
                    onClick={() => setSourceMode("raw")}
                  >
                    Raw
                  </button>
                </div>
              </div>
              {sourceMode === "raw" ? (
                <textarea
                  className="raw-textarea"
                  aria-label="Raw Markdown"
                  value={rawMarkdown}
                  onChange={(event) => setRawMarkdown(event.target.value)}
                />
              ) : (
                <pre className="raw-preview">{rawMarkdown || "Nothing to preview."}</pre>
              )}
            </aside>
          )}
        </div>
        <footer className="modal-footer">
          <ActionButton variant="danger" onClick={requestDelete} disabled={saving}>
            Delete Task
          </ActionButton>
          <div className="modal-footer-actions">
            <ActionButton variant="secondary" onClick={onClose}>
              Cancel
            </ActionButton>
            <ActionButton variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </ActionButton>
          </div>
        </footer>
      </section>
    </div>
  );
}

function MetadataInput({
  label,
  prefix,
  items,
  kind,
  onAdd,
  onRemove,
}: {
  label: string;
  prefix: string;
  items: string[];
  kind: "context" | "project" | "tag";
  onAdd: (value: string) => void;
  onRemove: (token: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <div className="form-group">
      <label>{label}</label>
      <FormInput
        aria-label={`Add ${label.toLowerCase()}`}
        placeholder={`Add ${label.toLowerCase()}…`}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && value.trim()) {
            event.preventDefault();
            const trimmedValue = value.trim();
            onAdd(
              trimmedValue.startsWith(prefix) ? trimmedValue.slice(prefix.length) : trimmedValue,
            );
            setValue("");
          }
        }}
      />
      <div className="metadata-container">
        {items.map((item) => (
          <MetadataPill
            key={item}
            kind={kind}
            onRemove={() => onRemove(item)}
            removeLabel={`Remove ${item}`}
          >
            {item}
          </MetadataPill>
        ))}
      </div>
    </div>
  );
}
