import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { CustomView, FileNode, Task } from "../types";
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
  return {
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
    parse_errors: null,
    file_path: "/visual/vault/inbox.md",
    parent_hash: null,
    ...overrides,
  };
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
        "- [ ] (A) Task 1 +octarine/launch @desk\n" +
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
  const marker = { todo: " ", doing: "/", done: "x", cancelled: "-" }[status];
  return rawMarkdown.replace(/^(\s*[-*+]\s+\[).(\])/, `$1${marker}$2`);
}

export function installVisualFixtures(scenario: VisualScenario): void {
  let tasks = scenario === "empty" ? [] : populatedTasks();
  let eventListenerId = 0;
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
  mockIPC((command, args) => {
    switch (command) {
      case "tauri":
        return ++eventListenerId;
      case "get_tasks":
        return tasks.map((entry) => ({ ...entry }));
      case "get_custom_views":
        return customViews;
      case "get_vault_config":
        return "/visual/vault";
      case "get_journal_config":
        return "/visual/journal";
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
      case "update_task_markdown": {
        const lineNumber = Number(args.lineNumber);
        tasks = tasks.map((entry) =>
          entry.line_number === lineNumber
            ? { ...entry, raw_markdown: String(args.newRawMarkdown) }
            : entry,
        );
        return undefined;
      }
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
