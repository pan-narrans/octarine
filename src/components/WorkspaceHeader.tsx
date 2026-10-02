import type { ReactNode, Ref } from "react";
import { Plus, Search } from "lucide-react";

interface WorkspaceHeaderProps {
  title: ReactNode;
  subtitle: ReactNode;
  triggerRef?: Ref<HTMLButtonElement>;
  onCreateTask: () => void;
}

interface WorkspaceToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  children?: ReactNode;
}

export function WorkspaceHeader({
  title,
  subtitle,
  triggerRef,
  onCreateTask,
}: WorkspaceHeaderProps) {
  return (
    <div className="main-header">
      <div className="main-title">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <button ref={triggerRef} type="button" className="new-task-button" onClick={onCreateTask}>
        <Plus size={16} /> New task
      </button>
    </div>
  );
}

export function WorkspaceToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search tasks, descriptions or projects...",
  children,
}: WorkspaceToolbarProps) {
  return (
    <div className="workspace-toolbar">
      <label className="search-container">
        <Search size={18} color="#6b7280" aria-hidden="true" />
        <input
          type="text"
          aria-label={searchPlaceholder}
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>
      {children}
    </div>
  );
}
