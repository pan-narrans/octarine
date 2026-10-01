import { useState, type ReactNode } from "react";
import { AlertTriangle, Check, FileText, FolderOpen } from "lucide-react";
import { ActionButton, FormDropdown, FormInput, FormTextarea } from "../design-system/controls";

export type UnprojectedDestination = "inbox" | "daily_note";
export type InsertionMode = "heading" | "marker" | "eof";
export type DestinationKey = "inbox" | "dailyNote" | "project";

export interface DestinationSettings {
  template: string;
  insertionMode: InsertionMode;
  insertionTarget: string;
}

export interface TaskCreationSettingsValue {
  defaultDestination: UnprojectedDestination;
  inboxFile: string;
  journalFolder: string;
  dailyFilenamePattern: string;
  projectFolder: string;
  destinations: Record<DestinationKey, DestinationSettings>;
}

export type TaskCreationSettingsErrors = Partial<
  Record<
    | "inboxFile"
    | "journalFolder"
    | "dailyFilenamePattern"
    | "projectFolder"
    | `${DestinationKey}.template`
    | `${DestinationKey}.insertionTarget`,
    string
  >
>;

export interface TaskCreationSettingsProps {
  value: TaskCreationSettingsValue;
  errors?: TaskCreationSettingsErrors;
  initialDestination?: DestinationKey;
  migrationSource?: string | null;
  saving?: boolean;
  saved?: boolean;
  onChange: (value: TaskCreationSettingsValue) => void;
  onSave: () => void;
}

const destinationLabels: Record<DestinationKey, string> = {
  inbox: "Inbox",
  dailyNote: "Daily note",
  project: "Projects",
};

const destinationDescriptions: Record<DestinationKey, string> = {
  inbox: "Tasks without project when Inbox is default.",
  dailyNote: "Tasks without project when Daily note is default.",
  project: "Tasks containing +project metadata.",
};

export function TaskCreationSettings({
  value,
  errors = {},
  initialDestination = "inbox",
  migrationSource = null,
  saving = false,
  saved = false,
  onChange,
  onSave,
}: TaskCreationSettingsProps) {
  const [activeDestination, setActiveDestination] = useState<DestinationKey>(initialDestination);
  const destination = value.destinations[activeDestination];
  const update = <Key extends keyof TaskCreationSettingsValue>(
    key: Key,
    nextValue: TaskCreationSettingsValue[Key],
  ) => onChange({ ...value, [key]: nextValue });
  const updateDestination = (patch: Partial<DestinationSettings>) =>
    onChange({
      ...value,
      destinations: {
        ...value.destinations,
        [activeDestination]: { ...destination, ...patch },
      },
    });
  const hasErrors = Object.values(errors).some(Boolean);
  const placeholders =
    activeDestination === "project"
      ? ["{{project}}", "{{project_name}}", "{{date}}", "{{datetime}}"]
      : ["{{date}}", "{{datetime}}"];

  return (
    <section className="task-settings" aria-labelledby="task-settings-title">
      <header className="task-settings-header">
        <div>
          <h1 id="task-settings-title">Task creation</h1>
          <p>Choose where new tasks go and how destination files are structured.</p>
        </div>
        {saved && (
          <span className="task-settings-saved" role="status">
            <Check size={15} /> Saved
          </span>
        )}
      </header>

      {migrationSource && (
        <div className="task-settings-migration" role="alert">
          <AlertTriangle size={19} />
          <div>
            <strong>Journal folder needs migration</strong>
            <p>
              Existing journal remains at <code>{migrationSource}</code>. No files were moved.
              Choose journal folder inside vault to enable daily notes.
            </p>
          </div>
        </div>
      )}

      <div className="task-settings-card">
        <header className="task-settings-card-heading">
          <FolderOpen size={18} />
          <div>
            <h2>Routing</h2>
            <p>All paths below are relative to active vault.</p>
          </div>
        </header>

        <div className="task-settings-routing-grid">
          <SettingField label="Default for tasks without project" htmlFor="task-settings-default">
            <FormDropdown
              id="task-settings-default"
              value={value.defaultDestination}
              options={[
                { value: "inbox", label: "Inbox file" },
                { value: "daily_note", label: "Daily note" },
              ]}
              onValueChange={(nextValue) =>
                update("defaultDestination", nextValue as UnprojectedDestination)
              }
            />
          </SettingField>
          <PathField
            id="task-settings-inbox"
            label="Inbox file"
            value={value.inboxFile}
            error={errors.inboxFile}
            placeholder="inbox.md"
            onChange={(nextValue) => update("inboxFile", nextValue)}
          />
          <PathField
            id="task-settings-journal"
            label="Journal folder"
            value={value.journalFolder}
            error={errors.journalFolder}
            placeholder="journals"
            onChange={(nextValue) => update("journalFolder", nextValue)}
          />
          <PathField
            id="task-settings-daily-pattern"
            label="Daily filename"
            value={value.dailyFilenamePattern}
            error={errors.dailyFilenamePattern}
            placeholder="YYYY-MM-DD.md"
            onChange={(nextValue) => update("dailyFilenamePattern", nextValue)}
          />
          <PathField
            id="task-settings-projects"
            label="Project folder"
            value={value.projectFolder}
            error={errors.projectFolder}
            placeholder="projects"
            onChange={(nextValue) => update("projectFolder", nextValue)}
          />
        </div>
        <p className="task-settings-ignore-note">
          Hidden paths and matches from <code>.octarineignore</code> cannot be destinations.
        </p>
      </div>

      <div className="task-settings-card">
        <header className="task-settings-card-heading">
          <FileText size={18} />
          <div>
            <h2>Destination files</h2>
            <p>Template applies only when destination file does not exist.</p>
          </div>
        </header>

        <div className="task-settings-destination-tabs" role="tablist" aria-label="Destination">
          {(Object.keys(destinationLabels) as DestinationKey[]).map((key) => (
            <button
              key={key}
              id={`task-settings-tab-${key}`}
              type="button"
              role="tab"
              aria-selected={activeDestination === key}
              aria-controls="task-settings-panel"
              onClick={() => setActiveDestination(key)}
            >
              {destinationLabels[key]}
            </button>
          ))}
        </div>

        <div
          id="task-settings-panel"
          className="task-settings-destination"
          role="tabpanel"
          aria-labelledby={`task-settings-tab-${activeDestination}`}
        >
          <div className="task-settings-destination-intro">
            <strong>{destinationLabels[activeDestination]}</strong>
            <span>{destinationDescriptions[activeDestination]}</span>
          </div>
          <SettingField
            label="New file template"
            error={errors[`${activeDestination}.template`]}
            htmlFor="task-settings-template"
          >
            <FormTextarea
              id="task-settings-template"
              className="task-settings-template"
              value={destination.template}
              rows={6}
              spellCheck={false}
              aria-invalid={Boolean(errors[`${activeDestination}.template`])}
              onChange={(event) => updateDestination({ template: event.target.value })}
            />
            <div className="task-settings-placeholders" aria-label="Available placeholders">
              <span>Available:</span>
              {placeholders.map((placeholder) => (
                <code key={placeholder}>{placeholder}</code>
              ))}
            </div>
          </SettingField>

          <div className="task-settings-insertion-grid">
            <SettingField label="Insert new tasks" htmlFor="task-settings-insertion">
              <FormDropdown
                id="task-settings-insertion"
                value={destination.insertionMode}
                options={[
                  { value: "heading", label: "Below heading" },
                  { value: "marker", label: "Below HTML marker" },
                  { value: "eof", label: "At end of file" },
                ]}
                onValueChange={(nextValue) =>
                  updateDestination({
                    insertionMode: nextValue as InsertionMode,
                    insertionTarget: nextValue === "eof" ? "" : destination.insertionTarget,
                  })
                }
              />
            </SettingField>

            {destination.insertionMode !== "eof" && (
              <SettingField
                label={destination.insertionMode === "heading" ? "Heading text" : "HTML marker"}
                error={errors[`${activeDestination}.insertionTarget`]}
                htmlFor="task-settings-target"
              >
                <FormInput
                  id="task-settings-target"
                  value={destination.insertionTarget}
                  aria-invalid={Boolean(errors[`${activeDestination}.insertionTarget`])}
                  placeholder={
                    destination.insertionMode === "heading" ? "## Tasks" : "<!-- octarine:tasks -->"
                  }
                  onChange={(event) => updateDestination({ insertionTarget: event.target.value })}
                />
              </SettingField>
            )}
          </div>
          <p className="task-settings-fallback-note">
            {destination.insertionMode === "eof"
              ? "New tasks append at end of file. Existing task order remains unchanged."
              : "Missing or duplicate target still creates task at end of file and shows notification."}
          </p>
        </div>
      </div>

      <footer className="task-settings-footer">
        <p>
          {hasErrors ? "Fix highlighted settings before saving." : "Changes affect new tasks only."}
        </p>
        <ActionButton variant="primary" onClick={onSave} disabled={saving || hasErrors}>
          {saving ? "Saving…" : "Save settings"}
        </ActionButton>
      </footer>
    </section>
  );
}

function SettingField({
  label,
  error,
  htmlFor,
  children,
}: {
  label: string;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="form-group task-settings-field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error && (
        <p className="task-settings-field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function PathField({
  id,
  label,
  value,
  error,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <SettingField label={label} error={error} htmlFor={id}>
      <FormInput
        id={id}
        value={value}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        onChange={(event) => onChange(event.target.value)}
      />
    </SettingField>
  );
}
