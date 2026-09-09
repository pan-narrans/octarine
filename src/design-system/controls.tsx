import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
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

export interface FormDropdownOption {
  value: string;
  label: string;
}

export function FormDropdown({
  id,
  value,
  options,
  onValueChange,
  disabled = false,
}: {
  id: string;
  value: string;
  options: readonly FormDropdownOption[];
  onValueChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  const focusOption = (index: number) => {
    const boundedIndex = (index + options.length) % options.length;
    optionRefs.current[boundedIndex]?.focus();
  };
  const openAndFocusSelected = () => {
    setOpen(true);
    requestAnimationFrame(() => focusOption(selectedIndex));
  };

  return (
    <div className="form-dropdown" ref={rootRef}>
      <button
        id={id}
        type="button"
        className="form-select form-dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openAndFocusSelected())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openAndFocusSelected();
          }
        }}
      >
        <span>{selected?.label ?? ""}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div id={`${id}-options`} className="form-dropdown-options" role="listbox">
          {options.map((option, index) => (
            <button
              key={option.value}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className="form-dropdown-option"
              onClick={() => {
                onValueChange(option.value);
                setOpen(false);
                document.getElementById(id)?.focus();
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  focusOption(index + (event.key === "ArrowDown" ? 1 : -1));
                } else if (event.key === "Escape") {
                  setOpen(false);
                  document.getElementById(id)?.focus();
                }
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
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
  if (status === "deferred") return "›";
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
