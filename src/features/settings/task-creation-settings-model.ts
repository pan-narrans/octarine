import type { TaskCreationConfig } from "../../generated/ipc/TaskCreationConfig";
import type {
  DestinationKey,
  DestinationSettings,
  TaskCreationSettingsErrors,
  TaskCreationSettingsValue,
} from "../../components/TaskCreationSettings";

const destinationKeys: DestinationKey[] = ["inbox", "dailyNote", "project"];
const allowedPlaceholders = new Set(["date", "datetime", "project", "project_name"]);

function backendDestinationKey(key: DestinationKey): keyof TaskCreationConfig["templates"] {
  return key === "dailyNote" ? "daily_note" : key;
}

export function taskCreationConfigToValue(config: TaskCreationConfig): TaskCreationSettingsValue {
  return {
    defaultDestination: config.defaultDestination,
    inboxFile: config.inboxFile,
    journalFolder: config.journalFolder,
    dailyFilenamePattern: config.dailyFilenamePattern,
    projectFolder: config.projectFolder,
    destinations: Object.fromEntries(
      destinationKeys.map((key) => {
        const template = config.templates[backendDestinationKey(key)];
        return [
          key,
          {
            template: template.template,
            insertionMode: template.insertion.mode,
            insertionTarget: template.insertion.target ?? "",
          } satisfies DestinationSettings,
        ];
      }),
    ) as Record<DestinationKey, DestinationSettings>,
  };
}

export function taskCreationValueToConfig(
  value: TaskCreationSettingsValue,
  migrationSource: string | null,
): TaskCreationConfig {
  return {
    defaultDestination: value.defaultDestination,
    inboxFile: value.inboxFile.trim(),
    journalFolder: value.journalFolder.trim(),
    dailyFilenamePattern: value.dailyFilenamePattern.trim(),
    projectFolder: value.projectFolder.trim(),
    templates: Object.fromEntries(
      destinationKeys.map((key) => {
        const destination = value.destinations[key];
        return [
          backendDestinationKey(key),
          {
            template: destination.template,
            insertion: {
              mode: destination.insertionMode,
              target: destination.insertionMode === "eof" ? null : destination.insertionTarget,
            },
          },
        ];
      }),
    ) as TaskCreationConfig["templates"],
    migrationSource,
  };
}

export function validateTaskCreationSettings(
  value: TaskCreationSettingsValue,
): TaskCreationSettingsErrors {
  const errors: TaskCreationSettingsErrors = {};
  validateRelativePath(value.inboxFile, "Inbox file", true, (message) => {
    errors.inboxFile = message;
  });
  validateRelativePath(value.journalFolder, "Journal folder", false, (message) => {
    errors.journalFolder = message;
  });
  validateRelativePath(value.dailyFilenamePattern, "Daily filename", true, (message) => {
    errors.dailyFilenamePattern = message;
  });
  validateRelativePath(value.projectFolder, "Project folder", false, (message) => {
    errors.projectFolder = message;
  });

  for (const key of destinationKeys) {
    const destination = value.destinations[key];
    const templateError = validateTemplate(destination.template, key === "project");
    if (templateError) errors[`${key}.template`] = templateError;
    if (destination.insertionMode !== "eof") {
      const target = destination.insertionTarget.trim();
      if (!target) {
        errors[`${key}.insertionTarget`] = "Insertion target is required.";
      } else if (target.includes("\n") || target.includes("\r")) {
        errors[`${key}.insertionTarget`] = "Insertion target must be one line.";
      }
    }
  }
  return errors;
}

export function serverErrorToSettingsErrors(message: string): TaskCreationSettingsErrors {
  const lower = message.toLowerCase();
  if (lower.startsWith("inbox file")) return { inboxFile: message };
  if (lower.startsWith("journal folder")) return { journalFolder: message };
  if (lower.startsWith("daily filename")) return { dailyFilenamePattern: message };
  if (lower.startsWith("project folder")) return { projectFolder: message };

  const destination = lower.startsWith("inbox ")
    ? "inbox"
    : lower.startsWith("daily note ")
      ? "dailyNote"
      : lower.startsWith("project ")
        ? "project"
        : null;
  if (!destination) return {};
  return lower.includes("insertion")
    ? { [`${destination}.insertionTarget`]: message }
    : { [`${destination}.template`]: message };
}

function validateRelativePath(
  rawValue: string,
  label: string,
  requireMarkdown: boolean,
  report: (message: string) => void,
) {
  const value = rawValue.trim();
  const segments = value.split("/");
  if (
    !value ||
    value.startsWith("/") ||
    value.startsWith("~") ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    report(`${label} must be relative to vault without traversal.`);
    return;
  }
  if (requireMarkdown && !value.endsWith(".md")) {
    report(`${label} must use .md extension.`);
  }
}

function validateTemplate(template: string, projectAvailable: boolean): string | null {
  let malformed = false;
  let invalidMessage: string | null = null;
  const remainder = template.replace(/\{\{([^{}]*)\}\}/g, (_token, name: string) => {
    if (!name) malformed = true;
    else if (!allowedPlaceholders.has(name)) {
      invalidMessage = `Template contains unknown placeholder "{{${name}}}".`;
    } else if (!projectAvailable && (name === "project" || name === "project_name")) {
      invalidMessage = `Placeholder "{{${name}}}" requires Projects destination.`;
    }
    return "";
  });
  if (malformed || remainder.includes("{{") || remainder.includes("}}")) {
    return "Template contains malformed placeholder syntax.";
  }
  return invalidMessage;
}
