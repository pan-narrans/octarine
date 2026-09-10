export const visualScenarios = [
  "dashboard",
  "calendar",
  "task-modal",
  "project-rename",
  "kanban",
  "settings",
  "empty",
] as const;

export type VisualScenario = (typeof visualScenarios)[number];

export function getVisualScenario(): VisualScenario | null {
  if (!import.meta.env.DEV) return null;
  const requested = new URLSearchParams(window.location.search).get("visual");
  return visualScenarios.find((scenario) => scenario === requested) ?? null;
}
