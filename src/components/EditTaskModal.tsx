import { useState } from "react";
import { Trash, X } from "lucide-react";
import { Task } from "../types";

interface EditTaskModalProps {
  task: Task;
  onClose: () => void;
  onSave: (newRawMarkdown: string) => Promise<void>;
  onDelete: () => Promise<void>;
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

export function EditTaskModal({ task, onClose, onSave, onDelete }: EditTaskModalProps) {
  const [rawMarkdown, setRawMarkdown] = useState(task.raw_markdown);
  const [showMarkdown, setShowMarkdown] = useState(false);
  const [sourceMode, setSourceMode] = useState<"raw" | "preview">("raw");
  const [saving, setSaving] = useState(false);
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
  const descLines: string[] = [];
  const subtaskLines: Array<{ prefix: string; text: string; depth: number }> = [];
  for (const line of lines.slice(1)) {
    const match = line.match(/^(\s*[-*+]\s+\[.*?\]\s*)(.*)$/);
    if (match) {
      subtaskLines.push({
        prefix: match[1],
        text: match[2],
        depth: match[1].match(/^\s*/)?.[0].length ?? 0,
      });
    } else {
      descLines.push(line);
    }
  }
  const rawSubtasks = () => subtaskLines.map((subtask) => `${subtask.prefix}${subtask.text}`);
  const description = descLines.join("\n");
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
  const updateDescription = (value: string) =>
    setRawMarkdown([headerLine, ...(value ? value.split("\n") : []), ...rawSubtasks()].join("\n"));
  const updateSubtask = (index: number, value: string) => {
    const next = [...subtaskLines];
    next[index] = { ...next[index], text: value };
    setRawMarkdown(
      [headerLine, ...descLines, ...next.map((subtask) => `${subtask.prefix}${subtask.text}`)].join(
        "\n",
      ),
    );
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
      await onSave(rawMarkdown);
      onClose();
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
            <button
              className={`markdown-toggle ${showMarkdown ? "active" : ""}`}
              type="button"
              onClick={() => setShowMarkdown((open) => !open)}
              aria-pressed={showMarkdown}
            >
              Markdown
            </button>
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
            <div className="form-group">
              <label htmlFor="task-title">Title *</label>
              <input
                id="task-title"
                value={title}
                onChange={(event) => updateTitle(event.target.value)}
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label htmlFor="task-description">Description</label>
              <textarea
                id="task-description"
                value={description}
                onChange={(event) => updateDescription(event.target.value)}
                className="form-textarea"
                placeholder="Add notes..."
              />
            </div>
            <div className="form-group">
              <label>Subtasks</label>
              {subtaskLines.map((subtask, index) => (
                <div
                  className="form-subtask-row"
                  key={`${index}-${subtask.prefix}-${subtask.text}`}
                  style={{ marginLeft: `${subtask.depth}ch` }}
                >
                  <input
                    aria-label={`Subtask ${index + 1}`}
                    value={subtask.text}
                    onChange={(event) => updateSubtask(index, event.target.value)}
                    className="form-input"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const next = [...subtaskLines];
                      next.splice(index, 1);
                      setRawMarkdown(
                        [
                          headerLine,
                          ...descLines,
                          ...next.map((item) => `${item.prefix}${item.text}`),
                        ].join("\n"),
                      );
                    }}
                    className="btn-icon trash"
                    aria-label={`Remove subtask ${index + 1}`}
                  >
                    <Trash size={16} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setRawMarkdown(
                    [headerLine, ...descLines, ...rawSubtasks(), "    - [ ] New subtask"].join(
                      "\n",
                    ),
                  )
                }
                className="add-subtask"
              >
                + Add subtask
              </button>
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="task-priority">Priority</label>
                <select
                  id="task-priority"
                  value={priority}
                  onChange={(event) =>
                    setRawMarkdown((previous) =>
                      replaceHeaderMetadata(
                        previous,
                        /\([A-Da-d]\)/i,
                        event.target.value ? `(${event.target.value})` : "",
                        true,
                      ),
                    )
                  }
                  className="form-select"
                >
                  <option value="">None</option>
                  <option value="A">High (A)</option>
                  <option value="B">Medium (B)</option>
                  <option value="C">Low (C)</option>
                  <option value="D">Lowest (D)</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="task-due-date">Due date</label>
                <input
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
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor="task-status">Status</label>
                <select
                  id="task-status"
                  value={status}
                  onChange={(event) => updateStatus(event.target.value)}
                  className="form-select"
                >
                  <option value=" ">Not started</option>
                  <option value="/">In progress</option>
                  <option value="x">Done</option>
                  <option value="-">Cancelled</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="task-estimate">Estimate</label>
                <input
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
                  className="form-input"
                  placeholder="e.g. 2h, 30m, 3d"
                />
              </div>
              <div className="form-group form-grid-wide">
                <label htmlFor="task-recurrence">Recurrence</label>
                <input
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
                  className="form-input"
                  placeholder="e.g. every weekday or 0 9 * * 1-5"
                />
              </div>
            </div>
            <div className="metadata-inputs">
              {[
                { label: "Contexts", prefix: "@", items: contexts },
                { label: "Projects", prefix: "+", items: projects },
                { label: "Tags", prefix: "#", items: tags },
              ].map(({ label, prefix, items }) => (
                <MetadataInput
                  key={label}
                  label={label}
                  prefix={prefix}
                  items={items}
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
          <button type="button" className="btn-delete" onClick={requestDelete} disabled={saving}>
            Delete Task
          </button>
          <div className="modal-footer-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-save" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
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
  onAdd,
  onRemove,
}: {
  label: string;
  prefix: string;
  items: string[];
  onAdd: (value: string) => void;
  onRemove: (token: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <div className="form-group">
      <label>{label}</label>
      <div className="metadata-container">
        {items.map((item) => (
          <span key={item} className="pill">
            {item}
            <button
              type="button"
              className="pill-remove"
              onClick={() => onRemove(item)}
              aria-label={`Remove ${item}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <input
        aria-label={`Add ${label.toLowerCase()}`}
        className="form-input"
        placeholder={`Add ${label.toLowerCase()}…`}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && value.trim()) {
            event.preventDefault();
            onAdd(value.trim().replace(new RegExp(`^${prefix}`), ""));
            setValue("");
          }
        }}
      />
    </div>
  );
}
