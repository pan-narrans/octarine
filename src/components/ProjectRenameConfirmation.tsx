import { useEffect, useRef } from "react";
import { AlertTriangle, ArrowRight, FilePenLine, FolderInput, Link2Off, X } from "lucide-react";
import type { ProjectRenamePlan, ProjectRenameRecoveryReport } from "../types";
import { ActionButton } from "../design-system/controls";

export interface ProjectRenameConfirmationProps {
  plan: ProjectRenamePlan;
  executing?: boolean;
  recovery?: ProjectRenameRecoveryReport | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ProjectRenameConfirmation({
  plan,
  executing = false,
  recovery = null,
  onConfirm,
  onCancel,
}: ProjectRenameConfirmationProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const blocked = plan.collisions.length > 0;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !executing) {
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
  }, [executing, onCancel]);

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => !executing && onCancel()}>
      <section
        ref={dialogRef}
        className="project-rename-confirmation"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="project-rename-title"
        aria-describedby="project-rename-description"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <h2 id="project-rename-title">
              {recovery ? "Project rename needs attention" : "Rename project hierarchy?"}
            </h2>
            <p id="project-rename-description">
              {recovery
                ? "Some operations completed before rename stopped."
                : "Review every affected source before continuing."}
            </p>
          </div>
          <button
            className="modal-close"
            type="button"
            onClick={onCancel}
            aria-label="Close project rename"
            disabled={executing}
          >
            <X size={18} />
          </button>
        </header>

        <div className="project-rename-body">
          <div className="project-move-route" aria-label="Project rename">
            <div>
              <span>From</span>
              <strong>+{plan.sourceProject}</strong>
            </div>
            <ArrowRight size={18} aria-hidden="true" />
            <div>
              <span>To</span>
              <strong>+{plan.destinationProject}</strong>
            </div>
          </div>

          <div className="project-rename-impact" aria-label="Rename impact">
            <div>
              <FilePenLine size={17} aria-hidden="true" />
              <strong>{plan.impact.rewrittenTokens}</strong>
              <span>task tokens</span>
            </div>
            <div>
              <FolderInput size={17} aria-hidden="true" />
              <strong>{plan.impact.filesystemMoves}</strong>
              <span>path moves</span>
            </div>
            <div>
              <strong>{plan.impact.descendantProjects}</strong>
              <span>descendants</span>
            </div>
          </div>

          {recovery ? (
            <div className="project-rename-recovery">
              <div className="project-rename-alert-title">
                <AlertTriangle size={18} aria-hidden="true" />
                <strong>Manual review required</strong>
              </div>
              <p>{recovery.guidance}</p>
              <dl>
                <div>
                  <dt>Completed</dt>
                  <dd>{recovery.completedOperations.length}</dd>
                </div>
                <div>
                  <dt>Pending</dt>
                  <dd>{recovery.pendingOperations.length}</dd>
                </div>
              </dl>
              <ul>
                {recovery.inspectPaths.map((path) => (
                  <li key={path}>{path}</li>
                ))}
              </ul>
            </div>
          ) : blocked ? (
            <div className="project-rename-collisions">
              <div className="project-rename-alert-title">
                <AlertTriangle size={18} aria-hidden="true" />
                <strong>Resolve conflicts before renaming</strong>
              </div>
              <ul>
                {plan.collisions.map((collision) => (
                  <li key={`${collision.code}-${collision.path ?? collision.project}`}>
                    {collision.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <div className="project-rename-moves">
                <strong>Filesystem changes</strong>
                {plan.moves.length === 0 ? (
                  <p>No project file or directory needs moving.</p>
                ) : (
                  <ul>
                    {plan.moves.map((move) => (
                      <li key={`${move.kind}-${move.sourcePath}`}>
                        <span>{move.sourcePath}</span>
                        <ArrowRight size={13} aria-hidden="true" />
                        <span>{move.destinationPath}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="project-rename-warning">
                <Link2Off size={18} aria-hidden="true" />
                <div>
                  <strong>Links stay unchanged</strong>
                  <p>Markdown links pointing at old paths need manual updates.</p>
                </div>
              </div>
            </>
          )}
        </div>

        <footer className="modal-footer">
          <span>
            {plan.caseOnly
              ? "Case-only rename uses protected temporary paths."
              : "No automatic rollback after partial failure."}
          </span>
          <div className="modal-footer-actions">
            <ActionButton variant="secondary" onClick={onCancel} disabled={executing}>
              {recovery ? "Close" : "Cancel"}
            </ActionButton>
            {!recovery && (
              <ActionButton
                variant="primary"
                onClick={onConfirm}
                disabled={executing || blocked}
                autoFocus={!blocked}
              >
                {executing ? "Renaming…" : blocked ? "Rename blocked" : "Rename project"}
              </ActionButton>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}
