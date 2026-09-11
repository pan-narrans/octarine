import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronRight,
  FileQuestion,
  Files,
  FolderGit2,
  GitMerge,
  Info,
  LockKeyhole,
  ShieldCheck,
  X,
} from "lucide-react";
import type {
  ProjectMergeConflict,
  ProjectMergePlan,
  ProjectMergeRecoveryBundle,
  ProjectMergeRecoveryReport,
  ProjectMergeResolutionAction,
} from "../types";
import { ActionButton } from "../design-system/controls";

export type ProjectMergeWorkflowStage =
  | "offer"
  | "blocked"
  | "review"
  | "resolve"
  | "bulk_confirm"
  | "preparing"
  | "cancelled"
  | "commit"
  | "committing"
  | "stopping"
  | "partial"
  | "success";

export interface ProjectMergeWorkflowProps {
  plan: ProjectMergePlan;
  stage: ProjectMergeWorkflowStage;
  blocker?: "ancestor" | "symlink";
  blockerPath?: string;
  selectedConflictId?: string;
  resolvedConflictIds?: string[];
  bulkCount?: number;
  progress?: number;
  recovery?: ProjectMergeRecoveryReport | null;
  recoveryDeletionDate?: string;
  onClose: () => void;
  onStartMerge: () => void;
  onContinue: () => void;
  onBack: () => void;
  onCancel: () => void;
  onStop: () => void;
  onCommit: () => void;
  onSelectConflict?: (id: string) => void;
  onResolveConflict?: (
    id: string,
    action: ProjectMergeResolutionAction,
    result?: string,
    sourceName?: string,
  ) => void;
  onRequestBulk?: () => void;
  onConfirmBulk?: () => void;
  onOpenDestination?: () => void;
  onOpenRecovery?: () => void;
}

const stageStep: Record<ProjectMergeWorkflowStage, number> = {
  offer: 0,
  blocked: 0,
  review: 0,
  resolve: 1,
  bulk_confirm: 1,
  preparing: 2,
  cancelled: 2,
  commit: 3,
  committing: 3,
  stopping: 3,
  partial: 3,
  success: 4,
};

const stepLabels = ["Preflight", "Resolve", "Validate", "Commit"];

function conflictLabel(conflict: ProjectMergeConflict) {
  if (conflict.kind === "markdown") return "Markdown";
  if (conflict.kind === "ignored") return "Ignored";
  if (conflict.kind === "type_mismatch") return "Type mismatch";
  return "File";
}

function formatRecoveryDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function MergeRoute({ plan }: { plan: ProjectMergePlan }) {
  return (
    <div className="project-merge-route" aria-label="Project merge route">
      <div>
        <span>Source retires</span>
        <strong>+{plan.sourceProject}</strong>
      </div>
      <ArrowRight size={18} aria-hidden="true" />
      <div>
        <span>Destination survives</span>
        <strong>+{plan.destinationProject}</strong>
      </div>
    </div>
  );
}

function MergeSteps({ stage }: { stage: ProjectMergeWorkflowStage }) {
  const active = stageStep[stage];
  return (
    <ol className="project-merge-steps" aria-label="Merge progress">
      {stepLabels.map((label, index) => (
        <li className={index < active ? "complete" : index === active ? "active" : ""} key={label}>
          <span>{index < active ? <Check size={12} /> : index + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}

function MergeImpact({ plan }: { plan: ProjectMergePlan }) {
  const values = [
    [plan.impact.rewrittenTokens, "task tokens"],
    [plan.impact.filesystemMoves, "moves"],
    [plan.impact.conflicts, "conflicts"],
    [plan.impact.autoResolved, "auto-resolved"],
    [plan.impact.collapsedDescendants, "descendants"],
  ] as const;
  return (
    <div className="project-merge-impact" aria-label="Merge impact">
      {values.map(([value, label]) => (
        <div key={label}>
          <strong>{value}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function ConflictList({
  conflicts,
  selectedId,
  resolvedIds,
  onSelect,
}: {
  conflicts: ProjectMergeConflict[];
  selectedId: string;
  resolvedIds: ReadonlySet<string>;
  onSelect: (id: string) => void;
}) {
  const rowHeight = 54;
  const viewportHeight = 270;
  const [scrollTop, setScrollTop] = useState(0);
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - 2);
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + 4;
  const visible = conflicts.slice(first, first + visibleCount);
  return (
    <div
      className="project-merge-conflict-list"
      style={{ height: viewportHeight }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      role="listbox"
      aria-label={`${conflicts.length} merge conflicts`}
    >
      <div
        className="project-merge-conflict-spacer"
        style={{ height: conflicts.length * rowHeight }}
      >
        {visible.map((conflict, offset) => (
          <button
            type="button"
            role="option"
            aria-selected={selectedId === conflict.id}
            className={selectedId === conflict.id ? "selected" : ""}
            style={{ top: (first + offset) * rowHeight, height: rowHeight }}
            key={conflict.id}
            onClick={() => onSelect(conflict.id)}
          >
            <span className={`project-merge-kind ${conflict.kind}`}>{conflictLabel(conflict)}</span>
            <strong>{conflict.relativePath}</strong>
            {resolvedIds.has(conflict.id) ? (
              <Check size={14} aria-label="Resolved" />
            ) : (
              <ChevronRight size={14} />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function ResolutionChoice({
  action,
  active,
  children,
  onClick,
}: {
  action: ProjectMergeResolutionAction;
  active: ProjectMergeResolutionAction;
  children: string;
  onClick: (action: ProjectMergeResolutionAction) => void;
}) {
  return (
    <button
      type="button"
      className={active === action ? "active" : ""}
      aria-pressed={active === action}
      onClick={() => onClick(action)}
    >
      {children}
    </button>
  );
}

function ConflictResolver({
  conflict,
  onResolve,
}: {
  conflict: ProjectMergeConflict;
  onResolve: (action: ProjectMergeResolutionAction, result?: string, sourceName?: string) => void;
}) {
  const sourceFilename = conflict.sourcePath.split("/").pop() ?? "source";
  const extensionIndex = sourceFilename.lastIndexOf(".");
  const defaultSourceName =
    extensionIndex > 0
      ? `${sourceFilename.slice(0, extensionIndex)}-source${sourceFilename.slice(extensionIndex)}`
      : `${sourceFilename}-source`;
  const defaultAction: ProjectMergeResolutionAction =
    conflict.kind === "markdown" ? "combine" : "use_destination";
  const [action, setAction] = useState<ProjectMergeResolutionAction>(defaultAction);
  const defaultResult = `${conflict.destinationPreview?.trimEnd() ?? ""}\n\n---\n\n${conflict.sourcePreview ?? ""}`;
  const [result, setResult] = useState(defaultResult);
  const [sourceName, setSourceName] = useState(defaultSourceName);
  useEffect(() => {
    setAction(conflict.kind === "markdown" ? "combine" : "use_destination");
    setResult(
      `${conflict.destinationPreview?.trimEnd() ?? ""}\n\n---\n\n${conflict.sourcePreview ?? ""}`,
    );
    setSourceName(defaultSourceName);
  }, [conflict, defaultSourceName]);
  const choose = (next: ProjectMergeResolutionAction) => setAction(next);
  const nonMarkdownActions = (
    <>
      <div className="project-merge-resolution-options">
        <ResolutionChoice action="use_destination" active={action} onClick={choose}>
          Keep destination
        </ResolutionChoice>
        <ResolutionChoice action="use_source" active={action} onClick={choose}>
          Use source
        </ResolutionChoice>
        <ResolutionChoice action="keep_both" active={action} onClick={choose}>
          Keep both
        </ResolutionChoice>
      </div>
      {action === "keep_both" && (
        <label className="project-merge-keep-both">
          Source copy name
          <input value={sourceName} onChange={(event) => setSourceName(event.target.value)} />
        </label>
      )}
      <div className="project-merge-resolve-footer">
        <span>Choice remains reversible until final commit.</span>
        <ActionButton
          variant="primary"
          onClick={() =>
            onResolve(action, undefined, action === "keep_both" ? sourceName : undefined)
          }
        >
          Save resolution
        </ActionButton>
      </div>
    </>
  );

  if (conflict.kind === "ignored") {
    return (
      <div className="project-merge-resolver-panel">
        <div className="project-merge-privacy">
          <LockKeyhole size={20} aria-hidden="true" />
          <div>
            <strong>Content stays private</strong>
            <p>Ignored file contents are never previewed, parsed, or hashed.</p>
          </div>
        </div>
        <PathComparison conflict={conflict} />
        {nonMarkdownActions}
      </div>
    );
  }

  if (conflict.kind === "type_mismatch") {
    return (
      <div className="project-merge-resolver-panel">
        <div className="project-merge-type-warning">
          <FileQuestion size={20} aria-hidden="true" />
          <div>
            <strong>File and folder occupy same path</strong>
            <p>
              {conflict.nestedFileCount} nested files · {conflict.byteSize.toLocaleString()} bytes.
              Resolve individually.
            </p>
          </div>
        </div>
        <PathComparison conflict={conflict} />
        {nonMarkdownActions}
      </div>
    );
  }

  if (conflict.kind === "markdown") {
    return (
      <div className="project-merge-resolver-panel markdown">
        <div className="project-merge-resolution-options">
          <ResolutionChoice action="use_destination" active={action} onClick={choose}>
            Use destination
          </ResolutionChoice>
          <ResolutionChoice action="use_source" active={action} onClick={choose}>
            Use source
          </ResolutionChoice>
          <ResolutionChoice action="combine" active={action} onClick={choose}>
            Combine
          </ResolutionChoice>
        </div>
        <div className="project-merge-markdown-sources">
          <label>
            Destination, unchanged<pre>{conflict.destinationPreview}</pre>
          </label>
          <label>
            Source, project rewritten<pre>{conflict.sourcePreview}</pre>
          </label>
        </div>
        <label className="project-merge-result-label">
          Final result
          <textarea
            value={result}
            onChange={(event) => setResult(event.target.value)}
            spellCheck={false}
          />
        </label>
        <div className="project-merge-resolve-footer">
          <span>Duplicates remain unless edited. No Git markers added.</span>
          <ActionButton
            variant="primary"
            onClick={() => onResolve(action, action === "combine" ? result : undefined)}
          >
            Save resolution
          </ActionButton>
        </div>
      </div>
    );
  }

  return (
    <div className="project-merge-resolver-panel">
      <PathComparison conflict={conflict} />
      {nonMarkdownActions}
    </div>
  );
}

function PathComparison({ conflict }: { conflict: ProjectMergeConflict }) {
  return (
    <dl className="project-merge-paths">
      <div>
        <dt>Source {conflict.sourceKind}</dt>
        <dd>{conflict.sourcePath}</dd>
      </div>
      <div>
        <dt>Destination {conflict.destinationKind}</dt>
        <dd>{conflict.destinationPath}</dd>
      </div>
    </dl>
  );
}

function ProgressPanel({
  stage,
  progress,
}: {
  stage: ProjectMergeWorkflowStage;
  progress: number;
}) {
  const committing = stage === "committing" || stage === "stopping";
  return (
    <div className="project-merge-progress-panel">
      <span className="project-merge-progress-icon">
        <GitMerge size={25} />
      </span>
      <strong>
        {stage === "stopping"
          ? "Stopping after current file…"
          : committing
            ? "Committing merge…"
            : "Preparing complete result…"}
      </strong>
      <p>
        {committing
          ? "Originals enter recovery before each replacement."
          : "Project files remain unchanged until final commit."}
      </p>
      <div
        className="project-merge-progress-track"
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      <small>
        {progress}% ·{" "}
        {committing ? "Installing destination outputs" : "Validating Markdown and staging files"}
      </small>
    </div>
  );
}

export function ProjectMergeWorkflow({
  plan,
  stage,
  blocker,
  blockerPath,
  selectedConflictId,
  resolvedConflictIds = [],
  bulkCount = 12,
  progress = 64,
  recovery = null,
  recoveryDeletionDate = "October 11, 2026",
  onClose,
  onStartMerge,
  onContinue,
  onBack,
  onCancel,
  onStop,
  onCommit,
  onSelectConflict,
  onResolveConflict,
  onRequestBulk,
  onConfirmBulk,
  onOpenDestination,
  onOpenRecovery,
}: ProjectMergeWorkflowProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const [selected, setSelected] = useState(selectedConflictId ?? plan.conflicts[0]?.id ?? "");
  const selectedConflict = useMemo(
    () => plan.conflicts.find((conflict) => conflict.id === selected) ?? plan.conflicts[0],
    [plan.conflicts, selected],
  );
  const busy = stage === "preparing" || stage === "committing" || stage === "stopping";

  useEffect(() => {
    if (selectedConflictId) setSelected(selectedConflictId);
  }, [selectedConflictId]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    dialog.addEventListener("keydown", handleKeyDown);
    return () => dialog.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose]);

  const title =
    stage === "offer"
      ? "Project name already exists"
      : stage === "blocked"
        ? "Projects cannot be merged"
        : stage === "resolve" || stage === "bulk_confirm"
          ? "Resolve project conflicts"
          : stage === "preparing"
            ? "Preparing project merge"
            : stage === "cancelled"
              ? "Preparation cancelled"
              : stage === "commit"
                ? "Ready to commit merge"
                : stage === "committing" || stage === "stopping"
                  ? "Project merge in progress"
                  : stage === "partial"
                    ? "Project merge needs attention"
                    : stage === "success"
                      ? "Projects merged"
                      : "Merge project hierarchy?";
  const description =
    stage === "partial"
      ? "Some durable operations finished before merge stopped."
      : stage === "success"
        ? "Destination is current. Originals remain available in recovery."
        : stage === "committing" || stage === "stopping"
          ? "Durable commit is active. Each current filesystem operation finishes safely."
          : "Dry run first. Durable files change only after explicit commit.";
  const footerNote =
    stage === "partial"
      ? "No automatic rollback. Recovery remains protected."
      : stage === "success"
        ? `Successful recovery expires ${formatRecoveryDate(recoveryDeletionDate)}.`
        : stage === "committing" || stage === "stopping"
          ? "Current filesystem operation always finishes."
          : "Source project remains available until commit.";

  return (
    <div className="modal-backdrop project-merge-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="project-merge-workflow"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-merge-title"
      >
        <header className="modal-header">
          <div>
            <h2 id="project-merge-title">{title}</h2>
            <p>{description}</p>
          </div>
          <button
            className="modal-close"
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close project merge"
          >
            <X size={18} />
          </button>
        </header>

        {stage !== "offer" && <MergeSteps stage={stage} />}

        <div className="project-merge-body">
          <MergeRoute plan={plan} />

          {stage === "offer" && (
            <div className="project-merge-offer">
              <span>
                <GitMerge size={22} />
              </span>
              <div>
                <strong>Merge into existing project</strong>
                <p>Review collisions, combine files, then commit all validated changes together.</p>
              </div>
            </div>
          )}

          {stage === "blocked" && (
            <div className="project-merge-blocker">
              <AlertTriangle size={22} />
              <div>
                <strong>
                  {blocker === "symlink"
                    ? "Symlink found in project tree"
                    : "Projects contain each other"}
                </strong>
                <p>
                  {blocker === "symlink"
                    ? "Remove or relocate symlink before merging. Octarine never follows it."
                    : "Rename source through unrelated temporary project, then retry merge."}
                </p>
                {blocker === "symlink" && blockerPath && <code>{blockerPath}</code>}
              </div>
            </div>
          )}

          {stage === "review" && (
            <>
              <MergeImpact plan={plan} />
              <div className="project-merge-review-grid">
                <div>
                  <FolderGit2 size={18} />
                  <strong>Recursive hierarchy</strong>
                  <p>
                    {plan.collapsedDescendants.length
                      ? `${plan.collapsedDescendants.join(", ")} collapse into destination.`
                      : "No descendant projects change."}
                  </p>
                </div>
                <div>
                  <ShieldCheck size={18} />
                  <strong>Protected dry run</strong>
                  <p>Complete outputs stage inside vault. Cancel leaves projects byte-identical.</p>
                </div>
              </div>
              <div className="project-merge-link-note">
                <Info size={17} />
                <span>Markdown links, wiki-links, embeds, and plain paths stay unchanged.</span>
              </div>
            </>
          )}

          {(stage === "resolve" || stage === "bulk_confirm") && selectedConflict && (
            <div className="project-merge-resolve-layout">
              <aside>
                <div className="project-merge-conflict-heading">
                  <strong>Conflicts</strong>
                  <span>
                    {resolvedConflictIds.length}/{plan.conflicts.length}
                  </span>
                </div>
                <ConflictList
                  conflicts={plan.conflicts}
                  selectedId={selectedConflict.id}
                  resolvedIds={new Set(resolvedConflictIds)}
                  onSelect={(id) => {
                    setSelected(id);
                    onSelectConflict?.(id);
                  }}
                />
                <button
                  className="project-merge-bulk-trigger"
                  type="button"
                  onClick={onRequestBulk}
                >
                  Resolve eligible files in bulk
                </button>
              </aside>
              {stage === "bulk_confirm" ? (
                <div className="project-merge-bulk-confirm">
                  <Files size={25} />
                  <strong>Use destination for {bulkCount} files?</strong>
                  <p>
                    Directories and type mismatches stay unchanged. This choice can be reviewed
                    before preparation.
                  </p>
                  <div>
                    <ActionButton variant="secondary" onClick={onBack}>
                      Back
                    </ActionButton>
                    <ActionButton variant="primary" onClick={onConfirmBulk}>
                      Apply to {bulkCount} files
                    </ActionButton>
                  </div>
                </div>
              ) : (
                <ConflictResolver
                  conflict={selectedConflict}
                  onResolve={(action, result, sourceName) =>
                    onResolveConflict?.(selectedConflict.id, action, result, sourceName)
                  }
                />
              )}
            </div>
          )}

          {(stage === "preparing" || stage === "committing" || stage === "stopping") && (
            <ProgressPanel stage={stage} progress={progress} />
          )}

          {stage === "cancelled" && (
            <div className="project-merge-clean-state">
              <span>
                <Check size={23} />
              </span>
              <strong>Nothing changed</strong>
              <p>Staging removed. Source and destination projects remain untouched.</p>
            </div>
          )}

          {stage === "commit" && (
            <div className="project-merge-commit-boundary">
              <AlertTriangle size={22} />
              <div>
                <strong>Commit starts durable changes</strong>
                <p>
                  Changes are atomic per file, not for whole vault. Stop safely works between files.
                  Originals remain in recovery; Octarine never rolls back automatically.
                </p>
              </div>
            </div>
          )}

          {stage === "partial" && recovery && (
            <div className="project-merge-recovery-state">
              <AlertTriangle size={22} />
              <div>
                <strong>Manual review required</strong>
                <p>{recovery.guidance}</p>
              </div>
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
              <code>{recovery.recoveryPath}</code>
              <div className="project-merge-recovery-actions">
                <ActionButton variant="secondary" onClick={onOpenRecovery}>
                  Open recovery
                </ActionButton>
                <ActionButton variant="primary" onClick={onContinue}>
                  Retry preflight
                </ActionButton>
              </div>
            </div>
          )}

          {stage === "success" && (
            <div className="project-merge-success-state">
              <span>
                <Check size={26} />
              </span>
              <div>
                <strong>Destination now owns merged project</strong>
                <p>Recovery kept until {formatRecoveryDate(recoveryDeletionDate)}.</p>
              </div>
              <div>
                <ActionButton variant="secondary" onClick={onOpenRecovery}>
                  Open recovery
                </ActionButton>
                <ActionButton variant="primary" onClick={onOpenDestination}>
                  Open destination
                </ActionButton>
              </div>
            </div>
          )}
        </div>

        <footer className="modal-footer project-merge-footer">
          <span>{footerNote}</span>
          <div className="modal-footer-actions">
            {stage === "offer" && (
              <>
                <ActionButton variant="secondary" onClick={onClose}>
                  Cancel rename
                </ActionButton>
                <ActionButton variant="primary" onClick={onStartMerge}>
                  Merge projects
                </ActionButton>
              </>
            )}
            {stage === "blocked" && (
              <ActionButton variant="secondary" onClick={onClose}>
                Close
              </ActionButton>
            )}
            {stage === "review" && (
              <>
                <ActionButton variant="secondary" onClick={onCancel}>
                  Cancel
                </ActionButton>
                <ActionButton variant="primary" onClick={onContinue}>
                  {plan.conflicts.length
                    ? `Resolve ${plan.conflicts.length} conflicts`
                    : "Prepare merge"}
                </ActionButton>
              </>
            )}
            {stage === "resolve" && (
              <>
                <ActionButton variant="secondary" onClick={onBack}>
                  Back
                </ActionButton>
                <ActionButton variant="primary" onClick={onContinue}>
                  Validate & prepare
                </ActionButton>
              </>
            )}
            {stage === "preparing" && (
              <ActionButton variant="secondary" onClick={onCancel}>
                Cancel preparation
              </ActionButton>
            )}
            {stage === "cancelled" && (
              <ActionButton variant="secondary" onClick={onClose}>
                Close
              </ActionButton>
            )}
            {stage === "commit" && (
              <>
                <ActionButton variant="secondary" onClick={onCancel}>
                  Cancel
                </ActionButton>
                <ActionButton variant="primary" onClick={onCommit}>
                  Commit merge
                </ActionButton>
              </>
            )}
            {stage === "committing" && (
              <ActionButton variant="secondary" onClick={onStop}>
                Stop safely
              </ActionButton>
            )}
            {stage === "stopping" && (
              <ActionButton variant="secondary" disabled>
                Stopping safely…
              </ActionButton>
            )}
            {(stage === "partial" || stage === "success") && (
              <ActionButton variant="secondary" onClick={onClose}>
                Close
              </ActionButton>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}

export function ProjectMergeRecoveryList({
  bundles,
  onOpen,
  onDelete,
}: {
  bundles: ProjectMergeRecoveryBundle[];
  onOpen: (operationId: string) => void;
  onDelete: (operationId: string) => void;
}) {
  return (
    <section className="project-merge-recovery-list" aria-labelledby="project-merge-recovery-title">
      <header>
        <div>
          <h2 id="project-merge-recovery-title">Project merge recovery</h2>
          <p>Original files retained after project merges.</p>
        </div>
        <span>{bundles.length} bundles</span>
      </header>
      {bundles.length === 0 ? (
        <div className="project-merge-recovery-empty">
          <ShieldCheck size={22} />
          <p>No recovery bundles.</p>
        </div>
      ) : (
        <ul>
          {bundles.map((bundle) => (
            <li key={bundle.operationId}>
              <span className={`project-merge-recovery-status ${bundle.status}`}>
                {bundle.status}
              </span>
              <div>
                <strong>
                  <span>+{bundle.sourceProject}</span>
                  <ArrowRight size={13} />
                  <span>+{bundle.destinationProject}</span>
                </strong>
                <code>{bundle.recoveryPath}</code>
              </div>
              <dl>
                <div>
                  <dt>Size</dt>
                  <dd>{Math.max(1, Math.round(bundle.sizeBytes / 1024))} KB</dd>
                </div>
                <div>
                  <dt>Pending</dt>
                  <dd>{bundle.pendingOperations}</dd>
                </div>
                <div>
                  <dt>Expires</dt>
                  <dd>{bundle.expiresAt ? formatRecoveryDate(bundle.expiresAt) : "Manual"}</dd>
                </div>
              </dl>
              <div className="project-merge-recovery-row-actions">
                <ActionButton variant="secondary" onClick={() => onOpen(bundle.operationId)}>
                  Open
                </ActionButton>
                <ActionButton variant="danger" onClick={() => onDelete(bundle.operationId)}>
                  Delete
                </ActionButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
