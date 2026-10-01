import { describe, expect, it } from "vitest";
import type { Task } from "../../types";
import { projectCatalogs } from "./project-visibility";

type ProjectTask = Pick<Task, "project" | "status">;

const task = (project: string | null, status: Task["status"]): ProjectTask => ({
  project,
  status,
});

const hidden = { showInactiveProjects: false, selectedProject: null };

describe("project catalog visibility", () => {
  it("keeps full catalog while showing only projects with active statuses", () => {
    const result = projectCatalogs(
      [
        task("todo", "todo"),
        task("doing", "doing"),
        task("deferred", "deferred"),
        task("done", "done"),
        task("cancelled", "cancelled"),
      ],
      hidden,
    );

    expect(result).toEqual({
      allProjects: ["todo", "doing", "deferred", "done", "cancelled"],
      sidebarProjects: ["todo", "doing", "deferred"],
    });
  });

  it("reveals every canonical project without changing first-seen order", () => {
    const tasks = [
      task("gamma", "done"),
      task("alpha", "todo"),
      task("gamma", "doing"),
      task("beta", "cancelled"),
    ];

    expect(projectCatalogs(tasks, { showInactiveProjects: true, selectedProject: null })).toEqual({
      allProjects: ["gamma", "alpha", "beta"],
      sidebarProjects: ["gamma", "alpha", "beta"],
    });
  });

  it("uses every indexed item status, including events and subtasks", () => {
    expect(
      projectCatalogs([task("event-project", "todo"), task("subtask-project", "doing")], hidden)
        .sidebarProjects,
    ).toEqual(["event-project", "subtask-project"]);
  });

  it("ignores projectless items", () => {
    expect(projectCatalogs([task(null, "todo")], hidden)).toEqual({
      allProjects: [],
      sidebarProjects: [],
    });
  });

  it("keeps selected inactive canonical project in original position", () => {
    const result = projectCatalogs(
      [task("alpha", "todo"), task("beta", "done"), task("gamma", "doing")],
      { showInactiveProjects: false, selectedProject: "beta" },
    );

    expect(result.sidebarProjects).toEqual(["alpha", "beta", "gamma"]);
  });

  it("keeps selected synthetic parent without revealing inactive children", () => {
    const result = projectCatalogs(
      [task("alpha", "todo"), task("org/team", "done"), task("zeta", "doing")],
      { showInactiveProjects: false, selectedProject: "org" },
    );

    expect(result.sidebarProjects).toEqual(["alpha", "org", "zeta"]);
  });

  it("uses active descendant path to preserve selected synthetic parent", () => {
    const result = projectCatalogs([task("org/team", "doing"), task("org/archive", "done")], {
      showInactiveProjects: false,
      selectedProject: "org",
    });

    expect(result.sidebarProjects).toEqual(["org/team"]);
  });

  it("hides inactive child while direct parent remains active", () => {
    const result = projectCatalogs([task("org", "todo"), task("org/archive", "done")], hidden);

    expect(result.sidebarProjects).toEqual(["org"]);
  });

  it("does not reveal inactive sibling when selected child is kept", () => {
    const result = projectCatalogs(
      [task("org/current", "done"), task("org/archive", "cancelled")],
      { showInactiveProjects: false, selectedProject: "org/current" },
    );

    expect(result.sidebarProjects).toEqual(["org/current"]);
  });

  it("does not create stale selected projects absent from full catalog", () => {
    const result = projectCatalogs([task("alpha", "done")], {
      showInactiveProjects: false,
      selectedProject: "missing",
    });

    expect(result.sidebarProjects).toEqual([]);
  });
});
