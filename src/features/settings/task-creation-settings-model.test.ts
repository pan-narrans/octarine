import { describe, expect, it } from "vitest";
import type { TaskCreationConfig } from "../../generated/ipc/TaskCreationConfig";
import {
  serverErrorToSettingsErrors,
  taskCreationConfigToValue,
  taskCreationValueToConfig,
  validateTaskCreationSettings,
} from "./task-creation-settings-model";

const config: TaskCreationConfig = {
  defaultDestination: "daily_note",
  inboxFile: "capture/inbox.md",
  journalFolder: "journals",
  dailyFilenamePattern: "YYYY-MM-DD.md",
  projectFolder: "projects",
  templates: {
    inbox: {
      template: "# Inbox\n",
      insertion: { mode: "marker", target: "<!-- tasks -->" },
    },
    daily_note: {
      template: "# {{date}}\n",
      insertion: { mode: "eof", target: null },
    },
    project: {
      template: "# {{project_name}}\n+{{project}}\n",
      insertion: { mode: "heading", target: "## Tasks" },
    },
  },
  migrationSource: "~/old-journals",
};

describe("task creation settings model", () => {
  it("round-trips backend config through approved settings value", () => {
    const value = taskCreationConfigToValue(config);

    expect(value.destinations.dailyNote).toEqual({
      template: "# {{date}}\n",
      insertionMode: "eof",
      insertionTarget: "",
    });
    expect(taskCreationValueToConfig(value, config.migrationSource)).toEqual(config);
  });

  it("rejects unsafe paths, invalid placeholders, and multiline targets", () => {
    const value = taskCreationConfigToValue(config);
    value.inboxFile = "../outside.md";
    value.destinations.inbox.template = "{{project}}";
    value.destinations.project.insertionTarget = "## Tasks\n## More";

    expect(validateTaskCreationSettings(value)).toEqual({
      inboxFile: "Inbox file must be relative to vault without traversal.",
      "inbox.template": 'Placeholder "{{project}}" requires Projects destination.',
      "project.insertionTarget": "Insertion target must be one line.",
    });
  });

  it("maps server validation failures back to matching fields", () => {
    expect(serverErrorToSettingsErrors("Project folder cannot be hidden or ignored.")).toEqual({
      projectFolder: "Project folder cannot be hidden or ignored.",
    });
    expect(serverErrorToSettingsErrors("Daily note insertion target is required.")).toEqual({
      "dailyNote.insertionTarget": "Daily note insertion target is required.",
    });
  });
});
