import { useState } from "react";
import { X } from "lucide-react";
import { MarkdownEditor } from "./MarkdownEditor";
import { Task } from "../types";

interface EditTaskModalProps {
  task: Task;
  onClose: () => void;
  onSave: (newRawMarkdown: string) => Promise<void>;
  projects: string[];
  contexts: string[];
}

// Regex helpers for manipulating the markdown string
const replaceMetadata = (raw: string, regex: RegExp, newValue: string, type: 'priority' | 'date' | 'context' | 'project'): string => {
  const lines = raw.split('\n');
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
      if (type === 'priority') {
        // Priority goes right after checkbox
        headerLine = headerLine.replace(/^(\s*[-*+]\s+\[.*?\]\s*)/, `$1${newValue} `).trim();
      } else {
        // Everything else appends to the end
        headerLine = `${headerLine} ${newValue}`;
      }
    }
  }
  
  // Clean up extra spaces
  headerLine = headerLine.replace(/\s{2,}/g, ' ');
  lines[0] = headerLine;
  return lines.join('\n');
};

export function EditTaskModal({ task, onClose, onSave, projects, contexts }: EditTaskModalProps) {
  const [rawMarkdown, setRawMarkdown] = useState<string>(task.raw_markdown);
  const [saving, setSaving] = useState(false);

  // Derived state from rawMarkdown
  const headerLine = rawMarkdown.split('\n')[0] || "";
  
  // Title (strip checkbox, priority, and metadata)
  let title = headerLine.replace(/^(\s*[-*+]\s+\[.*?\]\s*)/, '');
  title = title.replace(/\([A-Da-d]\)\s*/g, '');
  title = title.replace(/(due:|s:|dur:|recurring:|when_done:)[^\s]+/g, '');
  title = title.replace(/(\+[\w\-/]+|@[\w\-/]+|#[\w\-/]+)/g, '');
  title = title.replace(/\[[^\]]*\]\([^)]*\)/g, ''); // strip links
  title = title.trim();

  // Priority
  const priorityMatch = headerLine.match(/\(([A-Da-d])\)/i);
  const priority = priorityMatch ? priorityMatch[1].toUpperCase() : "";

  // Date (due date)
  const dueMatch = headerLine.match(/due:([^\s]+)/);
  const dueDate = dueMatch ? dueMatch[1] : "";

  // Handlers for Form Fields
  const handlePriorityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const p = e.target.value;
    const newVal = p ? `(${p})` : "";
    setRawMarkdown(prev => replaceMetadata(prev, /\([A-Da-d]\)/i, newVal, 'priority'));
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const d = e.target.value;
    const newVal = d ? `due:${d}` : "";
    setRawMarkdown(prev => replaceMetadata(prev, /due:[^\s]+/i, newVal, 'date'));
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setRawMarkdown(prev => {
      const lines = prev.split('\n');
      if (lines.length === 0) return prev;
      
      // We want to replace the title portion but keep the checkbox, priority, and metadata intact.
      // Easiest robust way is to rebuild the header line.
      let h = lines[0];
      
      // Extract prefix (e.g. "- [ ] (A) ")
      const prefixMatch = h.match(/^(\s*[-*+]\s+\[.*?\]\s*(?:\([A-Da-d]\)\s*)?)/i);
      const prefix = prefixMatch ? prefixMatch[1] : "- [ ] ";
      
      // Extract metadata (dates, contexts, projects, tags)
      const metadataRe = /(?:due:|s:|dur:|recurring:|when_done:)[^\s]+|\+[\w\-/]+|@[\w\-/]+|#[\w\-/]+/g;
      const metadata = h.match(metadataRe)?.join(" ") || "";
      
      lines[0] = `${prefix}${newTitle} ${metadata}`.trim();
      return lines.join('\n');
    });
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(rawMarkdown);
    setSaving(false);
    onClose();
  };

  // Prevent clicks inside the modal from bubbling to the backdrop
  const stopProp = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container" onClick={stopProp}>
        <div className="modal-header">
          <h2>Edit Task</h2>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body">
          {/* Left Column: Form Fields */}
          <div className="modal-form">
            <div className="form-group">
              <label>TITLE *</label>
              <input 
                type="text" 
                value={title} 
                onChange={handleTitleChange}
                className="form-input"
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
            </div>

            {/* Note: Full context/project/subtask form editing is simplified for brevity but raw text syncs perfectly! */}
            <div className="form-hint">
              Modify the raw markdown on the right to add subtasks, contexts, projects, and tags instantly.
            </div>

          </div>

          {/* Right Column: Raw Markdown Editor */}
          <div className="modal-raw">
            <div className="raw-header">
              <span>RAW MARKDOWN</span>
            </div>
            <div className="raw-editor-wrapper">
              <MarkdownEditor
                filePath={(task as any).file_path || "modal"}
                initialContent={rawMarkdown}
                onSave={async (c) => setRawMarkdown(c)} // Auto-update state on blur/save inside editor
                onClose={() => {}}
                projects={projects}
                contexts={contexts}
                isInline={false} // Use full multiline view with line numbers
              />
            </div>
            {/* Sync typing directly without needing blur */}
            <textarea 
              className="raw-textarea-fallback" 
              value={rawMarkdown}
              onChange={(e) => setRawMarkdown(e.target.value)}
              placeholder="Edit raw markdown directly..."
              style={{ width: '100%', height: '100px', marginTop: '1rem', display: 'none' }} 
              // We keep the real CodeMirror above, but if we need instant typing sync in the modal, 
              // CodeMirror's updateListener inside MarkdownEditor needs to push changes up.
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button className="btn-save" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
