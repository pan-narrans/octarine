import { useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { Dashboard as DashboardView } from "../features/dashboard/Dashboard";
import { SidebarNavigation } from "../features/navigation/SidebarNavigation";
import { TaskCard } from "../features/tasks/TaskCard";
import { MarkdownEditor } from "./MarkdownEditor";
import { WorkspaceHeader, WorkspaceToolbar } from "./WorkspaceHeader";
import { WorkspaceSidebarCollections } from "./WorkspaceSidebarCollections";
import { WorkspaceSidebarFooter } from "./WorkspaceSidebarFooter";
import type { FileNode, Task } from "../types";

type Surface = "dashboard" | "task-list" | "editor";

interface WorkspaceLayoutStoryProps {
  surface: Surface;
  initialSection?: string;
  showInactiveProjects?: boolean;
  setupRequired?: boolean;
  expandNotesTree?: boolean;
}

const octarineProject = "octarine/ui";

const taskSpecs: Array<
  Pick<
    Task,
    | "status"
    | "description"
    | "project"
    | "due_date"
    | "priority"
    | "tags"
    | "contexts"
    | "primary_context"
  >
> = [
  {
    status: "todo",
    description: "Draft vault path migration safeguards",
    project: "octarine/docs",
    due_date: "2026-10-06",
    priority: 1,
    tags: ["safeguards", "storage"],
    contexts: ["desk"],
    primary_context: "desk",
  },
  {
    status: "doing",
    description: "Review journal template inheritance",
    project: "personal/journal",
    due_date: "2026-10-07",
    priority: 2,
    tags: ["journal"],
    contexts: ["focus", "home"],
    primary_context: "focus",
  },
  {
    status: "todo",
    description: "Cross-check preview and source scroll positions",
    project: octarineProject,
    due_date: "2026-10-09",
    priority: 3,
    tags: ["editor", "responsive"],
    contexts: ["desk"],
    primary_context: "desk",
  },
  {
    status: "todo",
    description: "Document rename recovery states",
    project: "octarine/docs",
    due_date: "2026-10-12",
    priority: 2,
    tags: ["rename"],
    contexts: ["focus"],
    primary_context: "focus",
  },
  {
    status: "doing",
    description: "Capture 1000px and drawer layouts",
    project: octarineProject,
    due_date: "2026-10-13",
    priority: 3,
    tags: ["density", "review"],
    contexts: ["desk", "focus"],
    primary_context: "desk",
  },
  {
    status: "todo",
    description: "Publish compact workspace review notes",
    project: "personal/journal",
    due_date: "2026-10-14",
    priority: 4,
    tags: ["writing"],
    contexts: ["home"],
    primary_context: "home",
  },
  {
    status: "deferred",
    description: "Archive superseded navigation notes",
    project: "octarine/archive",
    due_date: null,
    priority: 3,
    tags: ["archive"],
    contexts: ["desk"],
    primary_context: "desk",
  },
  {
    status: "done",
    description: "Close existing spacing audit",
    project: octarineProject,
    due_date: null,
    priority: null,
    tags: ["audit"],
    contexts: ["focus"],
    primary_context: "focus",
  },
];

const statusMarkers: Record<Task["status"], string> = {
  todo: " ",
  doing: "/",
  deferred: ">",
  done: "x",
  cancelled: "-",
};

const additionalTasks: Task[] = taskSpecs.map((task, index) => {
  const priority = task.priority === null ? null : ["A", "B", "C", "D"][task.priority - 1];
  const metadata = [
    task.project ? `+${task.project}` : "",
    ...task.contexts.map((context) => `@${context}`),
    ...task.tags.map((tag) => `#${tag}`),
    task.due_date ? `due:${task.due_date}` : "",
    task.status === "done" ? "done:2026-09-30" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    line_number: index + 4,
    raw_markdown: `- [${statusMarkers[task.status]}]${priority ? ` (${priority})` : ""} ${task.description} ${metadata}`,
    hash: `density-additional-${index}`,
    status: task.status,
    task_type: "task",
    description: task.description,
    project: task.project,
    due_date: task.due_date,
    s_start: null,
    duration_secs: null,
    recurring: null,
    when_done: null,
    priority: task.priority,
    tags: task.tags,
    contexts: task.contexts,
    primary_context: task.primary_context,
    parse_errors: null,
    file_path: "/Vault/Projects/Octarine/UI.md",
    parent_hash: null,
  };
});

function dateFromToday(offsetDays: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

const todayEventDate = dateFromToday(0);
const upcomingEventDate = dateFromToday(2);

const dashboardEvents: Task[] = [
  {
    line_number: 20,
    raw_markdown: `- [ ] Design review s:${todayEventDate} 10:00`,
    hash: "density-event-today",
    status: "todo",
    task_type: "event",
    description: "Design review",
    project: octarineProject,
    due_date: null,
    s_start: `${todayEventDate} 10:00`,
    duration_secs: 3600,
    recurring: null,
    when_done: null,
    priority: null,
    tags: ["review"],
    contexts: ["desk"],
    primary_context: "desk",
    parse_errors: null,
    file_path: "/Vault/Projects/Octarine/UI.md",
    parent_hash: null,
  },
  {
    line_number: 21,
    raw_markdown: `- [ ] Planning session s:${upcomingEventDate} 14:30`,
    hash: "density-event-upcoming",
    status: "todo",
    task_type: "event",
    description: "Planning session",
    project: octarineProject,
    due_date: null,
    s_start: `${upcomingEventDate} 14:30`,
    duration_secs: 1800,
    recurring: null,
    when_done: null,
    priority: null,
    tags: ["planning"],
    contexts: ["desk"],
    primary_context: "desk",
    parse_errors: null,
    file_path: "/Vault/Projects/Octarine/UI.md",
    parent_hash: null,
  },
];

const tasks: Task[] = [
  {
    line_number: 1,
    raw_markdown:
      "- [ ] (A) Refine file navigation density +octarine/ui @desk #navigation due:2026-10-05\n  Keep project names readable and preserve keyboard targets.",
    hash: "density-navigation",
    status: "todo",
    task_type: "task",
    description: "Refine file navigation density",
    project: octarineProject,
    due_date: "2026-10-05",
    s_start: null,
    duration_secs: null,
    recurring: null,
    when_done: null,
    priority: 1,
    tags: ["navigation", "review"],
    contexts: ["desk"],
    primary_context: "desk",
    parse_errors: null,
    file_path: "/Vault/Projects/Octarine/UI.md",
    parent_hash: null,
  },
  {
    line_number: 2,
    raw_markdown:
      "- [/] (B) Compare task card hierarchy +octarine/ui @focus #density due:2026-10-08\n  Keep metadata visible while trimming repeated vertical space.",
    hash: "density-cards",
    status: "doing",
    task_type: "task",
    description: "Compare task card hierarchy",
    project: octarineProject,
    due_date: "2026-10-08",
    s_start: null,
    duration_secs: null,
    recurring: null,
    when_done: null,
    priority: 2,
    tags: ["density"],
    contexts: ["focus"],
    primary_context: "focus",
    parse_errors: null,
    file_path: "/Vault/Projects/Octarine/UI.md",
    parent_hash: null,
  },
  {
    line_number: 3,
    raw_markdown: "  - [ ] Measure selected and inactive project rows",
    hash: "density-subtask",
    status: "todo",
    task_type: "task",
    description: "Measure selected and inactive project rows",
    project: null,
    due_date: null,
    s_start: null,
    duration_secs: null,
    recurring: null,
    when_done: null,
    priority: null,
    tags: [],
    contexts: [],
    primary_context: null,
    parse_errors: null,
    file_path: "/Vault/Projects/Octarine/UI.md",
    parent_hash: "density-cards",
  },
  ...additionalTasks,
  ...dashboardEvents,
];

const topLevelTasks = tasks.filter((task) => task.task_type === "task" && !task.parent_hash);

const customViews = [
  {
    line_number: 1,
    title: "Design review queue",
    query_raw: 'filter: "project:octarine/ui"',
  },
];

const activeProjects = ["octarine/ui", "octarine/docs", "personal/journal"];
const allProjects = [
  ...activeProjects,
  "octarine/archive",
  "studio/old-brand",
  "personal/finished",
];

const activeDocumentPath = "/Vault/Product/Octarine/Concepts/Information architecture.md";

const journalTree: FileNode = {
  name: "Journal",
  path: "/Vault/Journal",
  is_dir: true,
  children: [
    {
      name: "2026",
      path: "/Vault/Journal/2026",
      is_dir: true,
      children: [
        {
          name: "October",
          path: "/Vault/Journal/2026/October",
          is_dir: true,
          children: [
            {
              name: "01.md",
              path: "/Vault/Journal/2026/October/01.md",
              is_dir: false,
              children: null,
            },
          ],
        },
      ],
    },
  ],
};

const noteTree: FileNode = {
  name: "Vault",
  path: "/Vault",
  is_dir: true,
  children: [
    {
      name: "Product",
      path: "/Vault/Product",
      is_dir: true,
      children: [
        {
          name: "Octarine",
          path: "/Vault/Product/Octarine",
          is_dir: true,
          children: [
            {
              name: "Concepts",
              path: "/Vault/Product/Octarine/Concepts",
              is_dir: true,
              children: [
                {
                  name: "Information architecture.md",
                  path: "/Vault/Product/Octarine/Concepts/Information architecture.md",
                  is_dir: false,
                  children: null,
                },
                {
                  name: "Density review.md",
                  path: "/Vault/Product/Octarine/Concepts/Density review.md",
                  is_dir: false,
                  children: null,
                },
              ],
            },
            {
              name: "Reference",
              path: "/Vault/Product/Octarine/Reference",
              is_dir: true,
              children: [
                {
                  name: "Color palette.md",
                  path: "/Vault/Product/Octarine/Reference/Color palette.md",
                  is_dir: false,
                  children: null,
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const documentContent = `# Product workspace density\n\n## Keep hierarchy clear\n\nThe workspace should show enough of each task to support quick scanning. Project, context, priority, and due-date details stay visible.\n\n## Review points\n\n- Keep controls reachable at compact widths.\n- Use 12 px and 16 px tree indents to distinguish hierarchy.\n- Preserve room for the document and its outline.\n\n### Navigation states\n\nSelected files and inactive projects remain easy to identify.`;

function WorkspaceLayoutStory({
  surface,
  initialSection = "all",
  showInactiveProjects = false,
  setupRequired = false,
  expandNotesTree = false,
}: WorkspaceLayoutStoryProps) {
  const [selectedSection, setSelectedSection] = useState(initialSection);
  const [showInactive, setShowInactive] = useState(showInactiveProjects);
  const [journalsExpanded, setJournalsExpanded] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(expandNotesTree || surface === "editor");
  const [isEditingVault, setIsEditingVault] = useState(false);
  const [vaultInput, setVaultInput] = useState("~/OctarineVault");
  const [search, setSearch] = useState("");
  const createTaskRef = useRef<HTMLButtonElement>(null);
  const title =
    surface === "editor"
      ? "Product workspace"
      : selectedSection === "all"
        ? "Inbox Dashboard"
        : `Project: ${selectedSection.slice("proj:".length)}`;

  return (
    <div className="workspace-layout-story-shell" data-surface={surface}>
      <SidebarNavigation
        selectedSection={selectedSection}
        activeFilePath={surface === "editor" ? activeDocumentPath : null}
        customViews={customViews}
        projects={showInactive ? allProjects : activeProjects}
        projectCatalogSize={allProjects.length}
        showInactiveProjects={showInactive}
        contexts={["desk", "focus", "home"]}
        tags={["navigation", "design", "review"]}
        onSelectSection={setSelectedSection}
        onShowInactiveProjectsChange={setShowInactive}
        onRenameProject={() => undefined}
        appVersion="0.1.0-beta.1"
        updateChannel="beta"
        beforeCollections={
          <WorkspaceSidebarCollections
            journalTree={journalTree}
            notesTree={noteTree}
            activeFilePath={surface === "editor" ? activeDocumentPath : null}
            journalsExpanded={journalsExpanded}
            notesExpanded={notesExpanded}
            setupRequired={setupRequired}
            onToggleJournals={() =>
              setupRequired
                ? setSelectedSection("settings")
                : setJournalsExpanded(!journalsExpanded)
            }
            onOpenTodayJournal={() => undefined}
            onToggleNotes={() => setNotesExpanded(!notesExpanded)}
            onSelectFile={() => undefined}
          />
        }
        footer={
          <WorkspaceSidebarFooter
            selectedSection={selectedSection}
            activeVaultPath="~/OctarineVault"
            isEditingVault={isEditingVault}
            vaultInput={vaultInput}
            savingVault={false}
            onOpenSettings={() => setSelectedSection("settings")}
            onEditVault={() => setIsEditingVault(true)}
            onVaultInputChange={setVaultInput}
            onCancelVaultEdit={() => setIsEditingVault(false)}
            onSaveVault={() => setIsEditingVault(false)}
          />
        }
      />

      <main className="main-content">
        <WorkspaceHeader
          title={title}
          subtitle={
            surface === "editor"
              ? "Direct Markdown Editor Workspace"
              : "Sub-millisecond plaintext organization"
          }
          triggerRef={createTaskRef}
          onCreateTask={() => undefined}
        />

        {surface !== "editor" && (
          <WorkspaceToolbar searchValue={search} onSearchChange={setSearch}>
            {surface === "task-list" && (
              <div className="project-view-controls" aria-label="Project view controls">
                <div className="project-view-switch" aria-label="Project presentation">
                  <button type="button" className="active" aria-pressed="true">
                    List
                  </button>
                  <button type="button" aria-pressed="false">
                    Board
                  </button>
                </div>
              </div>
            )}
          </WorkspaceToolbar>
        )}

        {surface === "dashboard" ? (
          <DashboardView
            tasks={tasks}
            projects={[octarineProject, "octarine/docs"]}
            contexts={["desk", "focus"]}
            journalContent={
              "# Thursday, October 1\n\n## Today\n\nReview compact navigation and task hierarchy.\n\n- Confirm visible metadata\n- Check long project names"
            }
            journalPath="/Vault/Journal/2026/October/01.md"
            journalLoading={false}
            onSaveJournal={async () => undefined}
            onOpenTask={() => undefined}
            onStatusChange={() => undefined}
          />
        ) : surface === "task-list" ? (
          <div className="task-list workspace-layout-task-list">
            {topLevelTasks.map((task) => (
              <TaskCard
                key={task.hash}
                task={task}
                tasks={tasks}
                onOpen={() => undefined}
                onStatusChange={() => undefined}
              />
            ))}
          </div>
        ) : (
          <div
            className="editor-canvas-column"
            style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%" }}
          >
            <MarkdownEditor
              filePath={activeDocumentPath}
              initialContent={documentContent}
              onSave={async () => undefined}
              onClose={() => undefined}
              projects={[octarineProject, "octarine/docs"]}
              contexts={["desk", "focus"]}
            />
          </div>
        )}
      </main>
    </div>
  );
}

const meta = {
  title: "Workspace/Layout",
  component: WorkspaceLayoutStory,
  args: {
    surface: "dashboard",
  },
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof WorkspaceLayoutStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Dashboard: Story = {
  args: { surface: "dashboard" },
  globals: { viewport: { value: "octarineDesktop", isRotated: false } },
};

export const TaskListAt1000: Story = {
  args: {
    surface: "task-list",
    initialSection: "proj:octarine/archive",
    showInactiveProjects: true,
    setupRequired: true,
  },
  globals: { viewport: { value: "octarineCompactDesktop", isRotated: false } },
};

export const FullDocumentEditor: Story = {
  args: {
    surface: "editor",
    expandNotesTree: true,
  },
  globals: { viewport: { value: "octarineDesktop", isRotated: false } },
  play: async ({ canvasElement }) => {
    const sidebar = within(
      within(canvasElement).getByRole("complementary", { name: "Octarine navigation" }),
    );
    await userEvent.click(
      sidebar.getByText("Product", { exact: true, selector: ".file-tree-name" }),
    );
    await userEvent.click(
      sidebar.getByText("Octarine", { exact: true, selector: ".file-tree-name" }),
    );
    await userEvent.click(
      sidebar.getByText("Concepts", { exact: true, selector: ".file-tree-name" }),
    );
  },
};

export const DeepTreeDrawerAt850: Story = {
  args: {
    surface: "dashboard",
    initialSection: "proj:octarine/archive",
    showInactiveProjects: true,
    expandNotesTree: true,
  },
  globals: { viewport: { value: "octarineTablet", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Open navigation" }));
    const sidebar = within(canvas.getByRole("complementary", { name: "Octarine navigation" }));
    await userEvent.click(
      sidebar.getByText("Product", { exact: true, selector: ".file-tree-name" }),
    );
    await userEvent.click(
      sidebar.getByText("Octarine", { exact: true, selector: ".file-tree-name" }),
    );
    await userEvent.click(
      sidebar.getByText("Concepts", { exact: true, selector: ".file-tree-name" }),
    );
  },
};

export const FullDocumentEditorNarrow360: Story = {
  tags: ["visual"],
  args: {
    surface: "editor",
  },
  globals: { viewport: { value: "octarineNarrow", isRotated: false } },
};

export const DashboardNarrow360: Story = {
  tags: ["visual"],
  args: {
    surface: "dashboard",
  },
  globals: { viewport: { value: "octarineNarrow", isRotated: false } },
};
