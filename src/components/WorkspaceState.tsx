import { AlertCircle, Loader2 } from "lucide-react";

export type WorkspaceStateKind = "loading" | "empty";

interface WorkspaceStateProps {
  kind: WorkspaceStateKind;
}

const content = {
  loading: {
    title: "Reading plaintext vault...",
    description: null,
  },
  empty: {
    title: "Clear Space",
    description: "No active tasks or schedules found matching the current workspace filters.",
  },
} as const;

export function WorkspaceState({ kind }: WorkspaceStateProps) {
  const state = content[kind];
  const Icon = kind === "loading" ? Loader2 : AlertCircle;

  return (
    <div className="empty-state">
      <Icon className={`empty-state-icon ${kind === "loading" ? "animate-spin" : ""}`} size={32} />
      <h3>{state.title}</h3>
      {state.description && <p>{state.description}</p>}
    </div>
  );
}
