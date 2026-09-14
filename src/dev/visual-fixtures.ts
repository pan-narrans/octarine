import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { CaptureContext, CustomView, FileNode, Task, TaskDraft } from "../types";
import type { TaskCreationConfig } from "../generated/ipc/TaskCreationConfig";
import type { UpdateChannel } from "../generated/ipc/UpdateChannel";
import type { VisualScenario } from "./visual-scenario";

function localDate(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function task(overrides: Partial<Task> & Pick<Task, "hash" | "description">): Task {
  const value: Task = {
    line_number: 1,
    raw_markdown: `- [ ] ${overrides.description}`,
    status: "todo",
    task_type: "task",
    project: null,
    due_date: null,
    s_start: null,
    duration_secs: null,
    recurring: null,
    when_done: null,
    priority: null,
    tags: [],
    contexts: [],
    primary_context: overrides.primary_context ?? overrides.contexts?.[0] ?? null,
    parse_errors: null,
    file_path: "/visual/vault/inbox.md",
    parent_hash: null,
    ...overrides,
  };
  if (overrides.file_path === undefined && overrides.project) {
    value.file_path = `/visual/vault/projects/${overrides.project}.md`;
  }
  return value;
}

function populatedTasks(): Task[] {
  const today = localDate();
  const tomorrow = localDate(1);
  const nextWeek = localDate(6);

  return [
    task({
      hash: "visual-complex-task",
      line_number: 3,
      description: "Task 1",
      raw_markdown:
        "- [ ] (A) Task 1 +octarine/launch @desk #frontend\n" +
        "  - Task 1 description\n" +
        "    - [ ] (B) Sub-task 1\n" +
        "    - [ ] (A) Sub-task 2\n" +
        "      - Sub-task 2 description\n" +
        "      - [ ] Sub-task 2-1\n" +
        "        - Sub-task 2-1 description\n" +
        "  - Task 1 description bis",
      priority: 1,
      project: "octarine/launch",
      contexts: ["desk"],
      tags: ["frontend"],
    }),
    task({
      hash: "visual-responsive-audit",
      line_number: 8,
      description: "Audit the calendar at compact widths",
      raw_markdown:
        `- [/] (B) Audit the calendar at compact widths due:${nextWeek} +octarine/ui @laptop #responsive\n` +
        "  - Preserve the month hierarchy while reducing crowding.",
      status: "doing",
      due_date: nextWeek,
      priority: 2,
      project: "octarine/ui",
      contexts: ["laptop"],
      tags: ["responsive"],
    }),
    task({
      hash: "visual-token-notes",
      line_number: 12,
      description: "Document established spacing tokens",
      raw_markdown: `- [x] (C) Document established spacing tokens done:${today} +octarine/ui #design-system`,
      status: "done",
      priority: 3,
      project: "octarine/ui",
      tags: ["design-system"],
    }),
    task({
      hash: "visual-event-standup",
      line_number: 16,
      description: "Design systems stand-up",
      raw_markdown: `- [<] Design systems stand-up s:${today} 09:30 dur:1800 @team`,
      task_type: "event",
      s_start: `${today} 09:30`,
      duration_secs: 1800,
      contexts: ["team"],
    }),
    task({
      hash: "visual-event-review",
      line_number: 17,
      description: "Octarine interaction review",
      raw_markdown: `- [<] Octarine interaction review s:${today} 14:00 dur:3600 +octarine/ui`,
      task_type: "event",
      s_start: `${today} 14:00`,
      duration_secs: 3600,
      project: "octarine/ui",
    }),
    task({
      hash: "visual-event-planning",
      line_number: 18,
      description: "Release planning workshop",
      raw_markdown: `- [<] Release planning workshop s:${tomorrow} 11:00 dur:5400 +octarine/launch`,
      task_type: "event",
      s_start: `${tomorrow} 11:00`,
      duration_secs: 5400,
      project: "octarine/launch",
    }),
  ];
}

const customViews: CustomView[] = [
  {
    line_number: 2,
    title: "Design follow-up",
    query_raw: 'filter: "#frontend or #design-system"',
  },
];

const vaultTree: FileNode = {
  name: "vault",
  path: "/visual/vault",
  is_dir: true,
  children: [
    {
      name: "Projects",
      path: "/visual/vault/Projects",
      is_dir: true,
      children: [
        {
          name: "Octarine.md",
          path: "/visual/vault/Projects/Octarine.md",
          is_dir: false,
          children: null,
        },
      ],
    },
    {
      name: "inbox.md",
      path: "/visual/vault/inbox.md",
      is_dir: false,
      children: null,
    },
  ],
};

const journalTree: FileNode = {
  name: "journal",
  path: "/visual/journal",
  is_dir: true,
  children: [
    {
      name: `${localDate()}.md`,
      path: `/visual/journal/${localDate()}.md`,
      is_dir: false,
      children: null,
    },
  ],
};

function replaceTaskMarker(rawMarkdown: string, status: Task["status"]): string {
  const marker = { todo: " ", doing: "/", deferred: ">", done: "x", cancelled: "-" }[status];
  return rawMarkdown.replace(/^(\s*[-*+]\s+\[).(\])/, `$1${marker}$2`);
}

export function taskStatusFromMarkdown(rawMarkdown: string): Task["status"] {
  const marker = rawMarkdown.match(/^\s*[-*+]\s+\[(.)\]/)?.[1];
  return marker === "/"
    ? "doing"
    : marker === ">"
      ? "deferred"
      : marker === "x" || marker === "X"
        ? "done"
        : marker === "-"
          ? "cancelled"
          : "todo";
}

function mockVisualIPC(handler: Parameters<typeof mockIPC>[0]): void {
  mockIPC(handler, { shouldMockEvents: true });
}

export function installVisualFixtures(scenario: VisualScenario): void {
  let tasks = scenario === "empty" ? [] : populatedTasks();
  let pendingRename = { source: "octarine", destination: "product" };
  let pendingMerge = { source: "octarine/launch", destination: "octarine/ui" };
  let mergeCompleted = false;
  let taskCreationConfig: TaskCreationConfig = {
    defaultDestination: "inbox",
    inboxFile: "inbox.md",
    journalFolder: "journals",
    dailyFilenamePattern: "YYYY-MM-DD.md",
    projectFolder: "projects",
    templates: {
      inbox: {
        template: "# Inbox\n\n## Tasks\n",
        insertion: { mode: "heading", target: "## Tasks" },
      },
      daily_note: {
        template: "# {{date}}\n\n## Tasks\n",
        insertion: { mode: "heading", target: "## Tasks" },
      },
      project: {
        template: "# {{project_name}}\n\nProject: +{{project}}\n\n## Tasks\n",
        insertion: { mode: "heading", target: "## Tasks" },
      },
    },
    migrationSource: null,
  };
  let updateChannel: UpdateChannel = "stable";
  const files = new Map<string, string>([
    [
      `/visual/journal/${localDate()}.md`,
      `# Journal — ${localDate()}\n\n## Focus\n\nKeep the visual verification loop fast and explicit.\n`,
    ],
    [
      "/visual/vault/Projects/Octarine.md",
      "# Octarine\n\nA local-first task workspace with rendered visual verification.\n",
    ],
    ["/visual/vault/inbox.md", "# Inbox\n\nVisual fixture data is kept in memory.\n"],
  ]);

  mockWindows("main");
  mockVisualIPC((command, payload) => {
    const args = (payload ?? {}) as Record<string, unknown>;
    switch (command) {
      case "get_tasks":
        return tasks.map((entry) => ({ ...entry }));
      case "get_custom_views":
        return customViews;
      case "get_vault_config":
        return "/visual/vault";
      case "get_journal_config":
        return "/visual/journal";
      case "get_task_creation_config":
        return structuredClone(taskCreationConfig);
      case "set_task_creation_config":
        taskCreationConfig = {
          ...(args.settings as TaskCreationConfig),
          migrationSource: null,
        };
        return structuredClone(taskCreationConfig);
      case "get_update_runtime_info":
        return {
          currentVersion: "0.1.0",
          channel: updateChannel,
          channelMutable: true,
          distribution: "direct",
          installStrategy: "self_update",
          checkConfigured: true,
          installationSupported: true,
        };
      case "set_update_channel":
        updateChannel = args.channel as UpdateChannel;
        return {
          currentVersion: "0.1.0",
          channel: updateChannel,
          channelMutable: true,
          distribution: "direct",
          installStrategy: "self_update",
          checkConfigured: true,
          installationSupported: true,
        };
      case "check_for_update":
        return null;
      case "install_update":
        return null;
      case "preview_task_draft": {
        const input = String(args.input).trim();
        if (!input) throw { code: "invalid_draft", message: "Task title is required." };
        const context = args.captureContext as CaptureContext;
        const projectMatch = input.match(/(?:^|\s)\+([\p{L}\p{N}_/-]+)/u);
        const project = projectMatch?.[1] ?? context.project;
        const draft: TaskDraft = {
          title: input.replace(/(?:^|\s)[+@#][^\s]+/gu, "").trim(),
          notes: "",
          status: "todo",
          priority: null,
          dueDate: null,
          duration: null,
          recurrence: null,
          project,
          contexts: context.contexts,
          tags: context.tags,
          subtasks: [],
          rawMarkdown: `- [ ] ${input}`,
        };
        return {
          draft,
          taskType: "task",
          destinationPath: project
            ? `/visual/vault/projects/${project}.md`
            : "/visual/vault/inbox.md",
          inheritedProject: context.project,
        };
      }
      case "create_task": {
        const draft = args.draft as TaskDraft;
        const created = task({
          hash: `visual-created-${tasks.length}`,
          line_number: tasks.length + 20,
          description: draft.title,
          raw_markdown: draft.rawMarkdown,
          project: draft.project,
          contexts: draft.contexts,
          tags: draft.tags,
          primary_context: draft.contexts[0] ?? null,
        });
        const destinationPath = draft.project
          ? `/visual/vault/projects/${draft.project}.md`
          : "/visual/vault/inbox.md";
        created.file_path = destinationPath;
        tasks = [created, ...tasks];
        files.set(
          destinationPath,
          `${files.get(destinationPath) ?? ""}${files.has(destinationPath) ? "\n" : ""}${draft.rawMarkdown}\n`,
        );
        return {
          task: created,
          destinationPath,
          warning: null,
          undoReceipt: {
            filePath: destinationPath,
            lineNumber: created.line_number,
            rawMarkdown: created.raw_markdown,
            sourceFingerprint: "visual-fingerprint",
          },
        };
      }
      case "undo_created_task": {
        const receipt = args.receipt as { lineNumber: number; filePath: string };
        tasks = tasks.filter(
          (entry) =>
            entry.line_number !== receipt.lineNumber || entry.file_path !== receipt.filePath,
        );
        return undefined;
      }
      case "read_dir_tree":
        return vaultTree;
      case "read_journal_tree":
        return journalTree;
      case "read_file_content": {
        const content = files.get(String(args.path));
        if (content === undefined) throw new Error(`Visual fixture file not found: ${args.path}`);
        return content;
      }
      case "write_file_content":
        files.set(String(args.path), String(args.content));
        return undefined;
      case "update_task_status": {
        const lineNumber = Number(args.lineNumber);
        const status = String(args.newStatus) as Task["status"];
        tasks = tasks.map((entry) =>
          entry.line_number === lineNumber
            ? { ...entry, status, raw_markdown: replaceTaskMarker(entry.raw_markdown, status) }
            : entry,
        );
        return undefined;
      }
      case "move_task": {
        const lineNumber = Number(args.lineNumber);
        const status = String(args.newStatus) as Task["status"];
        const newPrimaryContext =
          args.newPrimaryContext === undefined ? undefined : String(args.newPrimaryContext);
        tasks = tasks.map((entry) => {
          if (entry.line_number !== lineNumber) return entry;
          const contexts =
            newPrimaryContext === undefined
              ? entry.contexts
              : entry.contexts.length === 0
                ? [newPrimaryContext]
                : [newPrimaryContext, ...entry.contexts.slice(1)];
          return {
            ...entry,
            status,
            contexts,
            primary_context: contexts[0] ?? null,
            raw_markdown: replaceTaskMarker(entry.raw_markdown, status),
          };
        });
        return undefined;
      }
      case "update_task_markdown": {
        const lineNumber = Number(args.lineNumber);
        const rawMarkdown = String(args.newRawMarkdown);
        tasks = tasks.map((entry) =>
          entry.line_number === lineNumber
            ? {
                ...entry,
                raw_markdown: rawMarkdown,
                status: taskStatusFromMarkdown(rawMarkdown),
              }
            : entry,
        );
        return undefined;
      }
      case "move_task_project": {
        const lineNumber = Number(args.originalLineNumber);
        const rawMarkdown = String(args.newRawMarkdown);
        const project = rootProjects(rawMarkdown)[0] ?? null;
        const destinationPath = project
          ? `/visual/vault/projects/${project}.md`
          : "/visual/vault/inbox.md";
        let movedTask: Task | undefined;
        tasks = tasks.map((entry) => {
          if (entry.line_number !== lineNumber) return entry;
          movedTask = {
            ...entry,
            raw_markdown: rawMarkdown,
            project,
            file_path: destinationPath,
            status: taskStatusFromMarkdown(rawMarkdown),
          };
          return movedTask;
        });
        if (!movedTask) throw new Error("Visual fixture task not found.");
        return {
          task: movedTask,
          sourcePath: String(args.sourceFilePath),
          destinationPath,
          warning: null,
        };
      }
      case "preflight_project_rename": {
        const sourceProject = String(args.sourceProject);
        const destinationProject = String(args.destinationProject);
        pendingRename = { source: sourceProject, destination: destinationProject };
        const destinationExists = tasks.some(
          (entry) => entry.project?.toLocaleLowerCase() === destinationProject.toLocaleLowerCase(),
        );
        return {
          planToken: "visual-project-rename-plan",
          sourceProject,
          destinationProject,
          caseOnly: sourceProject.toLocaleLowerCase() === destinationProject.toLocaleLowerCase(),
          rewrites: [
            {
              path: `projects/${sourceProject}.md`,
              sourceFingerprint: "visual-source",
              replacementCount: tasks.filter(
                (entry) =>
                  entry.project &&
                  renamedProject(entry.project, sourceProject, destinationProject) !==
                    entry.project,
              ).length,
            },
          ],
          moves: [
            {
              kind: "project_file",
              sourcePath: `projects/${sourceProject}.md`,
              destinationPath: `projects/${destinationProject}.md`,
              sourceFingerprint: "visual-source",
            },
          ],
          indexUpdates: [],
          collisions: destinationExists
            ? [
                {
                  code: "project_identity",
                  path: null,
                  project: destinationProject,
                  message: `Renamed project '${destinationProject}' conflicts with existing project '${destinationProject}'.`,
                },
              ]
            : [],
          impact: {
            rewrittenFiles: 1,
            rewrittenTokens: tasks.filter(
              (entry) =>
                entry.project &&
                renamedProject(entry.project, sourceProject, destinationProject) !== entry.project,
            ).length,
            filesystemMoves: 1,
            descendantProjects: 0,
          },
          warnings: ["Markdown links are not updated by project rename."],
        };
      }
      case "execute_project_rename": {
        tasks = tasks.map((entry) =>
          entry.project
            ? {
                ...entry,
                project: renamedProject(
                  entry.project,
                  pendingRename.source,
                  pendingRename.destination,
                ),
              }
            : entry,
        );
        return {
          planToken: String(args.planToken),
          completedOperations: ["Rename visual project"],
          rewrittenFiles: 1,
          rewrittenTokens: 5,
          movedPaths: 1,
        };
      }
      case "preflight_project_merge": {
        const sourceProject = String(args.sourceProject);
        const destinationProject = String(args.destinationProject);
        pendingMerge = { source: sourceProject, destination: destinationProject };
        return {
          planToken: "visual-project-merge-plan",
          operationId: "0123456789abcdef01234567",
          sourceProject,
          destinationProject,
          projectFolder: "projects",
          rewrites: [],
          moves: [],
          conflicts: [],
          autoResolutions: [],
          collapsedDescendants: [],
          impact: {
            rewrittenFiles: 1,
            rewrittenTokens: tasks.filter(
              (entry) => entry.project?.toLocaleLowerCase() === sourceProject.toLocaleLowerCase(),
            ).length,
            filesystemMoves: 1,
            conflicts: 0,
            autoResolved: 0,
            collapsedDescendants: 0,
          },
          warnings: ["Markdown links stay unchanged."],
        };
      }
      case "prepare_project_merge":
        return {
          preparedToken: "visual-prepared-merge",
          planToken: String(args.planToken),
          operationId: "0123456789abcdef01234567",
          stagingPath: ".octarine/staging/0123456789abcdef01234567",
          entries: [],
          warnings: [],
        };
      case "execute_project_merge":
        tasks = tasks.map((entry) =>
          entry.project?.toLocaleLowerCase() === pendingMerge.source.toLocaleLowerCase()
            ? { ...entry, project: pendingMerge.destination }
            : entry,
        );
        mergeCompleted = true;
        return {
          preparedToken: "visual-prepared-merge",
          operationId: "0123456789abcdef01234567",
          recoveryPath: ".octarine/recovery/0123456789abcdef01234567",
          recoveryDeletionDate: "2026-10-11T09:00:00Z",
          completedOperations: ["Install merged project", "Reconcile derived task index"],
        };
      case "list_project_merge_recovery":
        return mergeCompleted
          ? [
              {
                operationId: "0123456789abcdef01234567",
                recoveryPath: ".octarine/recovery/0123456789abcdef01234567",
                createdAt: "2026-09-11T09:00:00Z",
                completedAt: "2026-09-11T09:00:02Z",
                expiresAt: "2026-10-11T09:00:00Z",
                sourceProject: pendingMerge.source,
                destinationProject: pendingMerge.destination,
                status: "successful",
                sizeBytes: 4096,
                completedOperations: 2,
                pendingOperations: 0,
              },
            ]
          : [];
      case "open_project_merge_recovery":
      case "cancel_project_merge":
        return undefined;
      case "delete_project_merge_recovery":
        mergeCompleted = false;
        return undefined;
      case "delete_task_markdown":
        tasks = tasks.filter((entry) => entry.line_number !== Number(args.lineNumber));
        return undefined;
      case "update_event_schedule": {
        const lineNumber = Number(args.lineNumber);
        tasks = tasks.map((entry) =>
          entry.line_number === lineNumber
            ? {
                ...entry,
                s_start: args.newSStart === null ? null : String(args.newSStart),
                duration_secs: args.newDurationSecs === null ? null : Number(args.newDurationSecs),
              }
            : entry,
        );
        return undefined;
      }
      case "set_vault_config":
      case "set_journal_config":
      case "create_directory":
      case "delete_path":
      case "rename_path":
        return undefined;
      case "create_file":
        return `${String(args.parentDir)}/${String(args.name)}`;
      default:
        throw new Error(`Unhandled visual fixture command: ${command}`);
    }
  });
}

function rootProjects(rawMarkdown: string): string[] {
  return (rawMarkdown.split("\n")[0] ?? "")
    .split(/\s+/)
    .filter((token) => token.startsWith("+") && token.length > 1)
    .map((token) => token.slice(1));
}

function renamedProject(project: string, source: string, destination: string): string {
  if (project.toLocaleLowerCase() === source.toLocaleLowerCase()) return destination;
  return project.toLocaleLowerCase().startsWith(`${source.toLocaleLowerCase()}/`)
    ? `${destination}/${project.slice(source.length + 1)}`
    : project;
}
