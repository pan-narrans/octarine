import { useEffect, useRef } from "react";
import { ArrowRight, FolderInput, X } from "lucide-react";
import { ActionButton } from "../design-system/controls";

export interface ProjectMoveConfirmationProps {
  taskTitle: string;
  sourceProject: string | null;
  destinationProject: string | null;
  sourcePath: string;
  destinationPath: string;
  descendantCount?: number;
  moving?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function projectLabel(project: string | null) {
  return project ? `+${project}` : "No project";
}

export function ProjectMoveConfirmation({
  taskTitle,
  sourceProject,
  destinationProject,
  sourcePath,
  destinationPath,
  descendantCount = 0,
  moving = false,
  onConfirm,
  onCancel,
}: ProjectMoveConfirmationProps) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !moving) {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      );
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
  }, [moving, onCancel]);

  const subtreeLabel =
    descendantCount === 0
      ? "Task notes move with it."
      : `${descendantCount} nested ${descendantCount === 1 ? "task" : "tasks"} and all notes move with it.`;

  return (
    <div
      className="modal-backdrop"
      onClick={() => {
        if (!moving) onCancel();
      }}
      role="presentation"
    >
      <section
        ref={dialogRef}
        className="project-move-confirmation"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="project-move-title"
        aria-describedby="project-move-description"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <h2 id="project-move-title">Move task to another project?</h2>
            <p id="project-move-description">{taskTitle}</p>
          </div>
          <button
            className="modal-close"
            type="button"
            onClick={onCancel}
            aria-label="Cancel project move"
            disabled={moving}
          >
            <X size={18} />
          </button>
        </header>

        <div className="project-move-body">
          <div className="project-move-route" aria-label="Project change">
            <div>
              <span>From</span>
              <strong>{projectLabel(sourceProject)}</strong>
            </div>
            <ArrowRight size={18} aria-hidden="true" />
            <div>
              <span>To</span>
              <strong>{projectLabel(destinationProject)}</strong>
            </div>
          </div>

          <div className="project-move-detail">
            <FolderInput size={18} aria-hidden="true" />
            <div>
              <strong>{subtreeLabel}</strong>
              <p>Destination write completes before source removal.</p>
            </div>
          </div>

          <dl className="project-move-paths">
            <div>
              <dt>Source</dt>
              <dd>{sourcePath}</dd>
            </div>
            <div>
              <dt>Destination</dt>
              <dd>{destinationPath}</dd>
            </div>
          </dl>
        </div>

        <footer className="modal-footer">
          <span>File move requires confirmation.</span>
          <div className="modal-footer-actions">
            <ActionButton variant="secondary" onClick={onCancel} disabled={moving}>
              Cancel
            </ActionButton>
            <ActionButton variant="primary" onClick={onConfirm} disabled={moving} autoFocus>
              {moving ? "Moving…" : "Move task"}
            </ActionButton>
          </div>
        </footer>
      </section>
    </div>
  );
}
