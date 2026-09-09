import { useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, FileText, X } from "lucide-react";
import { ActionButton, FormInput } from "../design-system/controls";
import type { TaskDraftPreview } from "../types";
import { TaskComposer } from "./TaskComposer";

export interface CreateTaskModalProps {
  input: string;
  preview: TaskDraftPreview | null;
  expanded: boolean;
  creating?: boolean;
  validationMessage?: string | null;
  onInputChange: (input: string) => void;
  onDraftChange: (preview: TaskDraftPreview) => void;
  onRawMarkdownChange: (rawMarkdown: string) => void;
  onExpandedChange: (expanded: boolean) => void;
  onCreate: () => void;
  onClose: () => void;
}

export function CreateTaskModal({
  input,
  preview,
  expanded,
  creating = false,
  validationMessage = null,
  onInputChange,
  onDraftChange,
  onRawMarkdownChange,
  onExpandedChange,
  onCreate,
  onClose,
}: CreateTaskModalProps) {
  const destination = preview?.destinationPath;
  const dialogRef = useRef<HTMLElement>(null);
  const requestClose = () => {
    if (!creating) onClose();
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("hidden"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    dialog.addEventListener("keydown", handleKeyDown);
    return () => dialog.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <div className="modal-backdrop" onClick={requestClose} role="presentation">
      <section
        ref={dialogRef}
        className={`create-task-modal ${expanded ? "expanded" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-task-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <h2 id="create-task-title">New Task</h2>
            <p>Capture now. Shape details when needed.</p>
          </div>
          <button
            className="modal-close"
            type="button"
            onClick={requestClose}
            aria-label="Close"
            disabled={creating}
          >
            <X size={18} />
          </button>
        </header>

        <div className="create-task-body">
          {expanded && preview ? (
            <TaskComposer
              draft={preview.draft}
              onChange={(draft) => onDraftChange({ ...preview, draft })}
              onRawMarkdownChange={onRawMarkdownChange}
            />
          ) : (
            <div className="create-task-capture">
              <FormInput
                autoFocus
                aria-label="Quick capture"
                aria-invalid={Boolean(validationMessage)}
                aria-describedby={validationMessage ? "create-task-validation" : undefined}
                value={input}
                onChange={(event) => onInputChange(event.target.value)}
                placeholder="Task +project @context #tag due:2026-09-08"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && preview && !creating) onCreate();
                }}
              />
              <p>Use canonical inline metadata. One line only.</p>
              {validationMessage && (
                <p id="create-task-validation" className="create-task-field-error" role="alert">
                  {validationMessage}
                </p>
              )}
            </div>
          )}

          {destination && (
            <div className="create-task-destination">
              <FileText size={15} />
              <span>{destination}</span>
              {preview?.taskType === "event" && <strong>Event</strong>}
            </div>
          )}
        </div>

        <footer className="modal-footer create-task-footer">
          <button
            type="button"
            className="create-task-expand"
            onClick={() => onExpandedChange(!expanded)}
            disabled={!preview}
          >
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            {expanded ? "Quick capture" : "Expand"}
          </button>
          <div className="modal-footer-actions">
            <ActionButton variant="secondary" onClick={requestClose} disabled={creating}>
              Cancel
            </ActionButton>
            <ActionButton variant="primary" onClick={onCreate} disabled={!preview || creating}>
              {creating ? "Creating…" : "Create Task"}
            </ActionButton>
          </div>
        </footer>
      </section>
    </div>
  );
}
