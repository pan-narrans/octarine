import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import type { Task } from "../types";

function classes(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function FormInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={classes("form-input", className)} {...props} />;
}

export function FormSelect({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={classes("form-select", className)} {...props} />;
}

export function FormTextarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={classes("form-textarea", className)} {...props} />;
}

type ActionButtonVariant = "primary" | "secondary" | "danger" | "toggle";

const actionButtonClasses: Record<ActionButtonVariant, string> = {
  primary: "btn-save",
  secondary: "btn-cancel",
  danger: "btn-delete",
  toggle: "markdown-toggle",
};

export function ActionButton({
  variant,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant: ActionButtonVariant }) {
  return (
    <button type={type} className={classes(actionButtonClasses[variant], className)} {...props} />
  );
}

type MetadataKind = "context" | "project" | "tag" | "scheduled";

export function MetadataPill({
  kind,
  children,
  onRemove,
  removeLabel,
}: {
  kind: MetadataKind;
  children: string;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  if (onRemove) {
    return (
      <button type="button" className={`pill ${kind}`} onClick={onRemove} aria-label={removeLabel}>
        {children}
      </button>
    );
  }

  return <span className={`pill ${kind}`}>{children}</span>;
}

const priorityLabels = ["", "A", "B", "C", "D"];

export function PriorityBadge({ priority }: { priority: number }) {
  const label = priorityLabels[priority] ?? String(priority);
  return <span className={`badge-priority p-${label}`}>{label}</span>;
}

function statusMark(status: Task["status"]) {
  if (status === "done") return "✓";
  if (status === "doing") return "•";
  if (status === "cancelled") return "×";
  return null;
}

export function StatusControl({
  status,
  label,
  baseClass = "checkbox",
  className,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  status: Task["status"];
  label: string;
  baseClass?: "checkbox" | "subtask-checkbox-clickable";
}) {
  return (
    <button
      type="button"
      className={classes(baseClass, status, className)}
      aria-label={label}
      {...props}
    >
      {statusMark(status)}
    </button>
  );
}
