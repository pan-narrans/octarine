import { useState } from "react";
import { X, Trash } from "lucide-react";
import { MarkdownEditor } from "./MarkdownEditor";
import { Task } from "../types";

interface EditTaskModalProps {
  task: Task;
  onClose: () => void;
  onSave: (newRawMarkdown: string) => Promise<void>;
  onDelete?: () => void;
  projects: string[];
  contexts: string[];
}

// Regex helpers for manipulating the markdown string
const replaceMetadata = (
  raw: string,
  regex: RegExp,
  newValue: string,
  type: "priority" | "date" | "context" | "project" | "recur",
): string => {
  const lines = raw.split("\n");
  if (lines.length === 0) return raw;

  let headerLine = lines[0];
  const hasMatch = regex.test(headerLine);

  if (newValue === "") {
    // Remove it
    headerLine = headerLine.replace(regex, "").trim();
  } else {
    if (hasMatch) {
      // Replace it
      headerLine = headerLine.replace(regex, newValue).trim();
    } else {
      // Append it logically
      if (type === "priority") {
        // Priority goes right after checkbox
        headerLine = headerLine.replace(/^(\s*[-*+]\s+\[.*?\]\s*)/, `$1${newValue} `).trim();
      } else {
        // Everything else appends to the end
        headerLine = `${headerLine} ${newValue}`;
      }
    }
  }

  // Clean up extra spaces
  headerLine = headerLine.replace(/\s{2,}/g, " ");
  lines[0] = headerLine;
  return lines.join("\n");
};

const PillInput = ({
  type,
  prefix,
  items,
  onAdd,
  onRemove,
}: {
  type: string;
  prefix: string;
  items: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
}) => {
  const [val, setVal] = useState("");
  return (
    <div className="form-group" style={{ marginBottom: "1rem" }}>
      <label>{type.toUpperCase()}S</label>
      <div
        className="metadata-container"
        style={{ marginBottom: items.length > 0 ? "0.5rem" : "0" }}
      >
        {items.map((item) => (
          <span key={item} className={`pill ${type}`}>
            {item}{" "}
            <button onClick={() => onRemove(item)} className="pill-remove">
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>{prefix}</span>
        <input
          type="text"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd(val);
              setVal("");
            }
          }}
          className="form-input"
          style={{ padding: "0.4rem 0.6rem" }}
          placeholder={`Add ${type}... (Press Enter)`}
        />
      </div>
    </div>
  );
};

export function EditTaskModal({
  task,
  onClose,
  onSave,
  onDelete,
  projects,
  contexts,
}: EditTaskModalProps) {
  const [rawMarkdown, setRawMarkdown] = useState<string>(task.raw_markdown);
  const [saving, setSaving] = useState(false);

  // Derived state from rawMarkdown
  const lines = rawMarkdown.split("\n");
  const headerLine = lines[0] || "";

  // Title
  let title = headerLine.replace(/^(\s*[-*+]\s+\[.*?\]\s*)/, "");
  title = title.replace(/\([A-Da-d]\)\s*/g, "");
  title = title.replace(/(due:|s:|dur:|recurring:|when_done:)[^\s]+/g, "");
  title = title.replace(/(\+[\w\-/]+|@[\w\-/]+|#[\w\-/]+)/g, "");
  title = title.replace(/\[[^\]]*\]\([^)]*\)/g, ""); // strip links
  title = title.trim();

  // Status
  const statusMatch = headerLine.match(/^\s*[-*+]\s+\[(.)\]/);
  const status = statusMatch ? statusMatch[1] : " ";

  // Priority
  const priorityMatch = headerLine.match(/\(([A-Da-d])\)/i);
  const priority = priorityMatch ? priorityMatch[1].toUpperCase() : "";

  // Date (due date)
  const dueMatch = headerLine.match(/due:([^\s]+)/);
  const dueDate = dueMatch ? dueMatch[1] : "";

  // Recur
  const recurMatch = headerLine.match(/recurring:([^\s]+)/);
  const recur = recurMatch ? recurMatch[1] : "";

  // Metadata arrays
  const parsedContexts = headerLine.match(/@[\w\-/]+/g) || [];
  const parsedProjects = headerLine.match(/\+[\w\-/]+/g) || [];
  const parsedTags = headerLine.match(/#[\w\-/]+/g) || [];

  // Description and Subtasks
  const tailLines = lines.slice(1);
  const descLines: string[] = [];
  const subtaskLines: string[] = [];
  for (const line of tailLines) {
    if (/^\s*[-*+]\s+\[.*?\]/.test(line)) {
      subtaskLines.push(line);
    } else {
      descLines.push(line);
    }
  }
  const description = descLines.join("\n");

  // Handlers for Form Fields
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setRawMarkdown((prev) => {
      const l = prev.split("\n");
      if (l.length === 0) return prev;
      const h = l[0];
      const prefixMatch = h.match(/^(\s*[-*+]\s+\[.*?\]\s*(?:\([A-Da-d]\)\s*)?)/i);
      const prefix = prefixMatch ? prefixMatch[1] : "- [ ] ";
      const metadataRe =
        /(?:due:|s:|dur:|recurring:|when_done:)[^\s]+|\+[\w\-/]+|@[\w\-/]+|#[\w\-/]+/g;
      const metadata = h.match(metadataRe)?.join(" ") || "";
      l[0] = `${prefix}${newTitle} ${metadata}`.trim();
      return l.join("\n");
    });
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const s = e.target.value;
    setRawMarkdown((prev) => {
      const l = prev.split("\n");
      if (l.length > 0) {
        if (/^\s*[-*+]\s+\[.\]/.test(l[0])) {
          l[0] = l[0].replace(/^(\s*[-*+]\s+\[)(.)(\])/, `$1${s}$3`);
        } else {
          l[0] = `- [${s}] ${l[0]}`;
        }
      }
      return l.join("\n");
    });
  };

  const handlePriorityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const p = e.target.value;
    const newVal = p ? `(${p})` : "";
    setRawMarkdown((prev) => replaceMetadata(prev, /\([A-Da-d]\)/i, newVal, "priority"));
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const d = e.target.value;
    const newVal = d ? `due:${d}` : "";
    setRawMarkdown((prev) => replaceMetadata(prev, /due:[^\s]+/i, newVal, "date"));
  };

  const handleRecurChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const r = e.target.value;
    const newVal = r ? `recurring:${r}` : "";
    setRawMarkdown((prev) => replaceMetadata(prev, /recurring:[^\s]+/i, newVal, "recur"));
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newDesc = e.target.value;
    setRawMarkdown(
      [headerLine, ...(newDesc ? newDesc.split("\n") : []), ...subtaskLines].join("\n"),
    );
  };

  const handleAddSubtask = () => {
    setRawMarkdown([headerLine, ...descLines, ...subtaskLines, "    - [ ] New subtask"].join("\n"));
  };

  const handleRemoveSubtask = (index: number) => {
    const newSt = [...subtaskLines];
    newSt.splice(index, 1);
    setRawMarkdown([headerLine, ...descLines, ...newSt].join("\n"));
  };

  const handleSubtaskChange = (index: number, newText: string) => {
    const newSt = [...subtaskLines];
    newSt[index] = newText;
    setRawMarkdown([headerLine, ...descLines, ...newSt].join("\n"));
  };

  const addMetadata = (prefix: string, value: string) => {
    const token = `${prefix}${value.trim()}`;
    if (!token.trim() || token === prefix) return;
    if (!headerLine.includes(token)) {
      setRawMarkdown((prev) => {
        const l = prev.split("\n");
        l[0] = `${l[0]} ${token}`.replace(/\s{2,}/g, " ");
        return l.join("\n");
      });
    }
  };

  const removeMetadata = (token: string) => {
    setRawMarkdown((prev) => {
      const l = prev.split("\n");
      if (l.length === 0) return prev;
      const tokens = l[0].split(/\s+/);
      l[0] = tokens.filter((t) => t !== token).join(" ");
      return l.join("\n");
    });
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(rawMarkdown);
    setSaving(false);
    onClose();
  };

  const stopProp = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container" onClick={stopProp}>
        <div className="modal-header">
          <h2>Edit Task</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {/* Left Column: Form Fields */}
          <div className="modal-form">
            <div className="form-row">
              <div className="form-group" style={{ flex: 3 }}>
                <label>TITLE *</label>
                <input
                  type="text"
                  value={title}
                  onChange={handleTitleChange}
                  className="form-input"
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>STATUS</label>
                <select value={status} onChange={handleStatusChange} className="form-select">
                  <option value=" ">[ ] Not Started</option>
                  <option value="/">[/] In Progress</option>
                  <option value="x">[x] Done</option>
                  <option value="-">[-] Cancelled</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>DESCRIPTION</label>
              <textarea
                value={description}
                onChange={handleDescriptionChange}
                className="form-textarea"
                placeholder="Add notes..."
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>PRIORITY</label>
                <select value={priority} onChange={handlePriorityChange} className="form-select">
                  <option value="">None</option>
                  <option value="A">High (A)</option>
                  <option value="B">Medium (B)</option>
                  <option value="C">Low (C)</option>
                  <option value="D">Lowest (D)</option>
                </select>
              </div>

              <div className="form-group">
                <label>DUE DATE</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={handleDateChange}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label>RECUR</label>
                <select value={recur} onChange={handleRecurChange} className="form-select">
                  <option value="">None</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <PillInput
                type="context"
                prefix="@"
                items={parsedContexts}
                onAdd={(v) => addMetadata("@", v)}
                onRemove={removeMetadata}
              />
              <PillInput
                type="project"
                prefix="+"
                items={parsedProjects}
                onAdd={(v) => addMetadata("+", v)}
                onRemove={removeMetadata}
              />
              <PillInput
                type="tag"
                prefix="#"
                items={parsedTags}
                onAdd={(v) => addMetadata("#", v)}
                onRemove={removeMetadata}
              />
            </div>

            <div className="form-group">
              <label>SUBTASKS</label>
              {subtaskLines.map((st, i) => (
                <div key={i} className="form-subtask-row">
                  <input
                    type="text"
                    value={st}
                    onChange={(e) => handleSubtaskChange(i, e.target.value)}
                    className="form-input"
                  />
                  <button
                    onClick={() => handleRemoveSubtask(i)}
                    className="btn-icon trash"
                    title="Remove Subtask"
                  >
                    <Trash size={16} />
                  </button>
                </div>
              ))}
              <button
                onClick={handleAddSubtask}
                className="btn-cancel"
                style={{ marginTop: "0.5rem", width: "100%", borderStyle: "dashed" }}
              >
                + Add subtask
              </button>
            </div>
          </div>

          {/* Right Column: Raw Markdown Editor */}
          <div className="modal-raw">
            <div className="raw-header">
              <span>RAW MARKDOWN</span>
            </div>
            <div className="raw-editor-wrapper">
              <MarkdownEditor
                filePath={task.file_path || "modal"}
                initialContent={rawMarkdown}
                onSave={async (c) => setRawMarkdown(c)}
                onClose={() => {}}
                projects={projects}
                contexts={contexts}
                isInline={false}
              />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          {onDelete && (
            <button className="btn-delete" onClick={onDelete}>
              Delete Task
            </button>
          )}
          <button className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-save" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
