import type { Task } from "../../types";

const ACTIVE_PROJECT_STATUSES: ReadonlySet<Task["status"]> = new Set(["todo", "doing", "deferred"]);

export interface ProjectVisibilityOptions {
  showInactiveProjects: boolean;
  selectedProject: string | null;
}

export interface ProjectCatalogProjection {
  allProjects: string[];
  sidebarProjects: string[];
}

type ProjectCatalogTask = Pick<Task, "project" | "status">;

function isProjectOrDescendant(project: string, ancestor: string) {
  return project === ancestor || project.startsWith(`${ancestor}/`);
}

export function projectCatalogs(
  tasks: readonly ProjectCatalogTask[],
  { showInactiveProjects, selectedProject }: ProjectVisibilityOptions,
): ProjectCatalogProjection {
  const allProjects: string[] = [];
  const seenProjects = new Set<string>();
  const activeProjects = new Set<string>();

  for (const task of tasks) {
    if (!task.project) continue;
    if (!seenProjects.has(task.project)) {
      seenProjects.add(task.project);
      allProjects.push(task.project);
    }
    if (ACTIVE_PROJECT_STATUSES.has(task.status)) activeProjects.add(task.project);
  }

  if (showInactiveProjects) {
    return { allProjects, sidebarProjects: [...allProjects] };
  }

  const selectedRepresentedByActiveDescendant =
    selectedProject !== null &&
    allProjects.some(
      (project) => activeProjects.has(project) && isProjectOrDescendant(project, selectedProject),
    );
  const selectedInsertionIndex =
    selectedProject !== null && !selectedRepresentedByActiveDescendant
      ? allProjects.findIndex((project) => isProjectOrDescendant(project, selectedProject))
      : -1;
  const sidebarProjects: string[] = [];

  allProjects.forEach((project, index) => {
    if (
      selectedProject !== null &&
      index === selectedInsertionIndex &&
      project !== selectedProject
    ) {
      sidebarProjects.push(selectedProject);
    }
    if (activeProjects.has(project) || project === selectedProject) {
      sidebarProjects.push(project);
    }
  });

  return { allProjects, sidebarProjects };
}
