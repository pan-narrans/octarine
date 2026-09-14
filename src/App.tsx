import { useEffect, useMemo, useRef, useState } from "react";
import { useTaskStore } from "./hooks/use-task-store";
import { useTauriEvents } from "./hooks/use-tauri-events";
import {
  Task,
  FileNode,
  type ProjectMergePlan,
  type ProjectMergeRecoveryBundle,
  type ProjectMergeRecoveryReport,
  type ProjectMergeResult,
  type ProjectMergeResolutionAction,
  type ProjectRenamePlan,
  type ProjectRenameRecoveryReport,
} from "./types";
import { FileTree } from "./components/FileTree";
import { MarkdownEditor } from "./components/MarkdownEditor";
import { WorkspaceState } from "./components/WorkspaceState";
import { EditTaskModal } from "./components/EditTaskModal";
import { CreateTaskModal } from "./components/CreateTaskModal";
import { ProjectMoveConfirmation } from "./components/ProjectMoveConfirmation";
import { ProjectRenameConfirmation } from "./components/ProjectRenameConfirmation";
import {
  ProjectMergeRecoveryList,
  ProjectMergeWorkflow,
  type ProjectMergeWorkflowStage,
} from "./components/ProjectMergeWorkflow";
import { NotificationViewport } from "./components/NotificationViewport";
import { TaskCreationSettings } from "./components/TaskCreationSettings";
import { ApplicationUpdateSettings } from "./components/ApplicationUpdateSettings";
import { TaskCard } from "./features/tasks/TaskCard";
import { SidebarNavigation } from "./features/navigation/SidebarNavigation";
import { projectCatalogs } from "./features/navigation/project-visibility";
import {
  readShowInactiveProjects,
  writeShowInactiveProjects,
} from "./features/navigation/project-visibility-preference";
import { Dashboard } from "./features/dashboard/Dashboard";
import { KanbanBoard } from "./features/kanban/KanbanBoard";
import type { ClosedKanbanStatus } from "./features/kanban/model";
import {
  readProjectViewMode,
  writeProjectViewMode,
  type ProjectViewMode,
} from "./features/kanban/preference";
import { CalendarSurface } from "./features/calendar/CalendarSurface";
import { DayDrawer, type ScheduleDraft } from "./features/calendar/DayDrawer";
import { calendarDateKey, getCalendarEvents } from "./features/calendar/calendar-utils";
import { Loader2, Search, Edit2, Check, X, BookOpen, Plus, Settings } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import {
  isWriteConflict,
  deleteTaskMarkdown,
  moveTaskProject,
  cancelProjectMerge,
  deleteProjectMergeRecovery,
  executeProjectRename,
  executeProjectMerge,
  listProjectMergeRecovery,
  openProjectMergeRecovery,
  parseCreateTaskError,
  parseMoveTaskProjectError,
  parseProjectRenameError,
  parseProjectMergeError,
  prepareProjectMerge,
  preflightProjectMerge,
  preflightProjectRename,
  resolveProjectMergeConflict,
  resolveProjectMergeConflictsBulk,
  previewTaskDraft,
  updateEventSchedule,
  updateTaskMarkdown,
  writeErrorMessage,
} from "./features/tasks/ipc";
import { useTaskCreationController } from "./features/tasks/use-task-creation-controller";
import { useNotificationStore } from "./features/notifications/use-notification-store";
import { useTaskCreationSettings } from "./features/settings/use-task-creation-settings";
import { useApplicationUpdates } from "./features/settings/use-application-updates";
import {
  createDirectory,
  createFile,
  deletePath,
  getJournalConfig,
  getVaultConfig,
  readFileContent,
  readJournalTree,
  readVaultTree,
  renamePath,
  setVaultConfig,
  writeFileContent,
} from "./features/workspace/ipc";
import { getVisualScenario } from "./dev/visual-scenario";
import { getTaskCreationConfig } from "./features/settings/ipc";

interface PendingProjectMove {
  sourceProject: string | null;
  destinationProject: string | null;
  sourcePath: string;
  destinationPath: string;
  originalRawMarkdown: string;
  newRawMarkdown: string;
  descendantCount: number;
}

function rootProjects(rawMarkdown: string): string[] {
  return (rawMarkdown.split("\n")[0] ?? "")
    .split(/\s+/)
    .filter((token) => token.startsWith("+") && token.length > 1)
    .map((token) => token.slice(1));
}

function projectNameFromVaultPath(
  path: string,
  vaultRoot: string,
  projectFolder: string,
  isDirectory: boolean,
): "project_root" | string | null {
  const normalizedRoot = vaultRoot.replace(/\/+$/, "");
  const normalizedFolder = projectFolder.replace(/^\/+|\/+$/g, "");
  if (!path.startsWith(`${normalizedRoot}/`)) return null;
  const relative = path.slice(normalizedRoot.length + 1);
  if (relative.localeCompare(normalizedFolder, undefined, { sensitivity: "accent" }) === 0) {
    return "project_root";
  }
  const prefix = `${normalizedFolder}/`;
  if (relative.slice(0, prefix.length).toLocaleLowerCase() !== prefix.toLocaleLowerCase()) {
    return null;
  }
  const projectPath = relative.slice(prefix.length);
  if (isDirectory) return projectPath;
  return projectPath.toLocaleLowerCase().endsWith(".md") ? projectPath.slice(0, -3) : null;
}

function renamedProjectValue(project: string, source: string, destination: string): string {
  if (project.toLocaleLowerCase() === source.toLocaleLowerCase()) return destination;
  const prefix = `${source}/`;
  return project.slice(0, prefix.length).toLocaleLowerCase() === prefix.toLocaleLowerCase()
    ? `${destination}/${project.slice(prefix.length)}`
    : project;
}

function blockedMergePlan(renamePlan: ProjectRenamePlan, projectFolder: string): ProjectMergePlan {
  return {
    planToken: "",
    operationId: "",
    sourceProject: renamePlan.sourceProject,
    destinationProject: renamePlan.destinationProject,
    projectFolder,
    rewrites: [],
    moves: [],
    conflicts: [],
    autoResolutions: [],
    collapsedDescendants: [],
    impact: {
      rewrittenFiles: renamePlan.impact.rewrittenFiles,
      rewrittenTokens: renamePlan.impact.rewrittenTokens,
      filesystemMoves: renamePlan.impact.filesystemMoves,
      conflicts: renamePlan.collisions.length,
      autoResolved: 0,
      collapsedDescendants: renamePlan.impact.descendantProjects,
    },
    warnings: [],
  };
}

export function App() {
  // Activate live Tauri event listener for real-time background watcher sync
  useTauriEvents();

  const {
    tasks,
    customViews,
    loading,
    error,
    pendingTaskMoves,
    fetchTasks,
    fetchCustomViews,
    updateTaskStatus,
    moveTask,
  } = useTaskStore();

  const visualScenario = getVisualScenario();
  const applicationUpdates = useApplicationUpdates({
    automaticCheck: import.meta.env.PROD && visualScenario === null,
  });
  const [selectedSection, setSelectedSection] = useState<string>(() =>
    visualScenario === "calendar"
      ? "events"
      : visualScenario === "kanban"
        ? "proj:octarine"
        : visualScenario === "project-rename"
          ? "proj:octarine"
          : visualScenario === "settings"
            ? "settings"
            : "all",
  );
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [projectViewMode, setProjectViewMode] = useState<ProjectViewMode>(() =>
    readProjectViewMode(window.localStorage),
  );
  const [visibleClosedStatuses, setVisibleClosedStatuses] = useState<ClosedKanbanStatus[]>([]);
  const [activeVaultPath, setActiveVaultPath] = useState<string>("Loading...");
  const [showInactiveProjects, setShowInactiveProjects] = useState(false);

  // Vault Path Inline Editor state
  const [isEditingVault, setIsEditingVault] = useState<boolean>(false);
  const [vaultInput, setVaultInput] = useState<string>("");
  const [savingVault, setSavingVault] = useState<boolean>(false);

  // Complete Calendar / Scheduler state
  const [calendarViewMode, setCalendarViewMode] = useState<"week" | "month">("month");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [showDrawer, setShowDrawer] = useState<boolean>(false);
  const [drawerDate, setDrawerDate] = useState<Date | null>(null);
  const [showFutureRepetitions, setShowFutureRepetitions] = useState<boolean>(false);

  // Event Edit Inline Popover Form state
  const [editingEventHash, setEditingEventHash] = useState<string | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft>({
    date: "",
    time: "",
    durationMinutes: 60,
  });

  // -----------------------------------------------------------------
  // NEW OBSIDIAN-REPLACEMENT NOTES EDITOR STATE
  // -----------------------------------------------------------------
  const [dirTree, setDirTree] = useState<FileNode | null>(null);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [activeFileContent, setActiveFileContent] = useState<string | null>(null);

  // -----------------------------------------------------------------
  // NEW VIRTUAL JOURNAL WORKSPACE STATE
  // -----------------------------------------------------------------
  const [journalTree, setJournalTree] = useState<FileNode | null>(null);
  const [activeJournalPath, setActiveJournalPath] = useState<string>("Loading...");
  const [journalSetupRequired, setJournalSetupRequired] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState<boolean>(false);
  const [journalsExpanded, setJournalsExpanded] = useState<boolean>(false);
  const [modalTask, setModalTask] = useState<Task | null>(null);
  const [pendingProjectMove, setPendingProjectMove] = useState<PendingProjectMove | null>(null);
  const [movingProject, setMovingProject] = useState(false);
  const [pendingProjectRename, setPendingProjectRename] = useState<ProjectRenamePlan | null>(null);
  const [projectRenameRecovery, setProjectRenameRecovery] =
    useState<ProjectRenameRecoveryReport | null>(null);
  const [renamingProject, setRenamingProject] = useState(false);
  const [pendingProjectMerge, setPendingProjectMerge] = useState<ProjectMergePlan | null>(null);
  const [projectMergeStage, setProjectMergeStage] = useState<ProjectMergeWorkflowStage>("offer");
  const [projectMergeBlocker, setProjectMergeBlocker] = useState<"ancestor" | "symlink">();
  const [projectMergeBlockerPath, setProjectMergeBlockerPath] = useState<string>();
  const [resolvedProjectMergeConflicts, setResolvedProjectMergeConflicts] = useState<string[]>([]);
  const [projectMergeRecovery, setProjectMergeRecovery] =
    useState<ProjectMergeRecoveryReport | null>(null);
  const [projectMergeResult, setProjectMergeResult] = useState<ProjectMergeResult | null>(null);
  const [projectMergeRecoveryBundles, setProjectMergeRecoveryBundles] = useState<
    ProjectMergeRecoveryBundle[]
  >([]);
  const pushNotification = useNotificationStore((state) => state.push);
  const openedVisualModal = useRef(false);
  const cancelledProjectMerges = useRef(new Set<string>());
  const [todayJournalContent, setTodayJournalContent] = useState<string | null>(null);
  const [todayJournalPath, setTodayJournalPath] = useState<string>("");
  const [todayJournalLoading, setTodayJournalLoading] = useState<boolean>(true);

  useEffect(() => {
    writeProjectViewMode(window.localStorage, projectViewMode);
  }, [projectViewMode]);

  useEffect(() => {
    if (activeVaultPath === "Loading...") return;
    setShowInactiveProjects(readShowInactiveProjects(window.localStorage, activeVaultPath));
  }, [activeVaultPath]);

  // Initial Boot Fetch & Config Query
  useEffect(() => {
    fetchTasks();
    fetchCustomViews();
    fetchDirTree();
    fetchJournalTree();

    // Fetch active vault path dynamically from Tauri state
    getVaultConfig()
      .then((path) => {
        setActiveVaultPath(path);
        setVaultInput(path);
      })
      .catch((err) => console.error("Failed to query active vault path:", err));

    // Fetch active journal path dynamically from Tauri state
    getJournalConfig()
      .then((path) => {
        setJournalSetupRequired(false);
        setActiveJournalPath(path);
        fetchTodayJournal(path);
      })
      .catch((err) => {
        setJournalSetupRequired(true);
        console.error("Failed to query active journal path:", err);
      });
  }, [fetchTasks, fetchCustomViews]);

  // Listen to background watcher change events to update directories dynamically
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    const setup = async () => {
      try {
        unlistenFn = await listen("vault-changed", () => {
          console.log(
            "Vault change event detected on frontend! Refreshing trees and today's journal...",
          );
          fetchDirTree();
          fetchJournalTree();
          fetchTodayJournal(activeJournalPath);
        });
      } catch (e) {
        console.error("Failed to listen to vault-changed inside App:", e);
      }
    };
    setup();
    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, [activeJournalPath]);

  useEffect(() => {
    if (visualScenario !== "task-modal" || openedVisualModal.current || tasks.length === 0) return;
    const task = tasks.find(
      (candidate) => candidate.task_type === "task" && !candidate.parent_hash,
    );
    if (!task) return;
    const descendants: Task[] = [];
    const collectDescendants = (parentHash: string) => {
      tasks
        .filter((candidate) => candidate.parent_hash === parentHash)
        .sort((a, b) => a.line_number - b.line_number)
        .forEach((child) => {
          descendants.push(child);
          collectDescendants(child.hash);
        });
    };
    collectDescendants(task.hash);
    openedVisualModal.current = true;
    setModalTask({
      ...task,
      raw_markdown: [task.raw_markdown, ...descendants.map((child) => child.raw_markdown)].join(
        "\n",
      ),
    });
  }, [tasks, visualScenario]);

  useEffect(() => {
    if (visualScenario !== "project-rename" || openedVisualModal.current || tasks.length === 0) {
      return;
    }
    openedVisualModal.current = true;
    setPendingProjectRename({
      planToken: "visual-project-rename-plan",
      sourceProject: "octarine",
      destinationProject: "product",
      caseOnly: false,
      rewrites: [
        {
          path: "projects/octarine.md",
          sourceFingerprint: "visual-source",
          replacementCount: 5,
        },
      ],
      moves: [
        {
          kind: "project_file",
          sourcePath: "projects/octarine.md",
          destinationPath: "projects/product.md",
          sourceFingerprint: "visual-source",
        },
      ],
      indexUpdates: [],
      collisions: [],
      impact: {
        rewrittenFiles: 1,
        rewrittenTokens: 5,
        filesystemMoves: 1,
        descendantProjects: 2,
      },
      warnings: ["Markdown links are not updated by project rename."],
    });
  }, [tasks, visualScenario]);

  // Aggregate unique projects, contexts, and tags dynamically from loaded tasks
  const selectedProject =
    activeFilePath === null && selectedSection.startsWith("proj:")
      ? selectedSection.slice("proj:".length)
      : null;
  const { allProjects: projects, sidebarProjects } = useMemo(
    () => projectCatalogs(tasks, { showInactiveProjects, selectedProject }),
    [tasks, showInactiveProjects, selectedProject],
  );
  const contexts = Array.from(
    new Set(
      tasks.map((task) => task.primary_context).filter((context): context is string => !!context),
    ),
  );
  const tags = Array.from(new Set(tasks.flatMap((task) => task.tags)));

  const getTaskMarkdownHierarchy = (task: Task) => {
    const descendants: Task[] = [];
    const collect = (parentHash: string) => {
      tasks
        .filter((candidate) => candidate.parent_hash === parentHash)
        .sort((a, b) => a.line_number - b.line_number)
        .forEach((child) => {
          descendants.push(child);
          collect(child.hash);
        });
    };
    collect(task.hash);
    return [task.raw_markdown, ...descendants.map((child) => child.raw_markdown)].join("\n");
  };

  const openTaskModal = (task: Task) => {
    setModalTask({
      ...task,
      raw_markdown: getTaskMarkdownHierarchy(task),
    });
  };

  const handleTaskStatusChange = async (task: Task, nextStatus: Task["status"]) => {
    await updateTaskStatus(task.file_path || "", task.line_number, task.raw_markdown, nextStatus);
  };

  // Cyclic checklist status toggler: todo -> doing -> done -> cancelled -> todo
  const handleCalendarEventActivate = async (task: Task) => {
    const nextStatusMap: Record<string, "todo" | "doing" | "done" | "cancelled"> = {
      todo: "doing",
      doing: "done",
      done: "cancelled",
      cancelled: "todo",
    };
    const nextStatus = nextStatusMap[task.status] || "todo";

    await updateTaskStatus(task.file_path || "", task.line_number, task.raw_markdown, nextStatus);
  };

  // In-memory filter logic for selected sidebar items and search query
  const filteredTasks = tasks.filter((task) => {
    // 1. Search Query Filter
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      const matchDesc = task.description.toLowerCase().includes(q);
      const matchProj = task.project?.toLowerCase().includes(q) || false;
      if (!matchDesc && !matchProj) return false;
    } else {
      // Exclude subtasks from top-level boards/lists when not searching
      if (task.parent_hash) return false;
    }

    // 2. Sidebar Scoped Filter
    if (selectedSection === "all") return true;
    if (selectedSection === "todo") return task.status === "todo";
    if (selectedSection === "doing") return task.status === "doing";
    if (selectedSection === "done") return task.status === "done";
    if (selectedSection === "events") return task.task_type === "event";

    if (selectedSection.startsWith("proj:")) {
      const proj = selectedSection.slice("proj:".length);
      return (
        task.project === proj || (task.project !== null && task.project.startsWith(proj + "/"))
      );
    }
    if (selectedSection.startsWith("ctx:")) {
      const ctx = selectedSection.slice("ctx:".length);
      return task.primary_context === ctx;
    }
    if (selectedSection.startsWith("tag:")) {
      const tag = selectedSection.slice("tag:".length);
      return task.tags.includes(tag);
    }

    return true;
  });

  const handleSidebarItemClick = (section: string, filterStr?: string) => {
    setActiveFilePath(null);
    setActiveFileContent(null);
    setSelectedSection(section);
    if (section.startsWith("view:") && filterStr) {
      fetchTasks(filterStr);
    } else {
      fetchTasks();
    }
  };

  const handleShowInactiveProjectsChange = (showInactive: boolean) => {
    setShowInactiveProjects(showInactive);
    if (activeVaultPath !== "Loading...") {
      writeShowInactiveProjects(window.localStorage, activeVaultPath, showInactive);
    }
  };

  const toggleClosedStatus = (status: ClosedKanbanStatus) => {
    setVisibleClosedStatuses((current) =>
      current.includes(status)
        ? current.filter((candidate) => candidate !== status)
        : [...current, status],
    );
  };

  // -------------------------------------------------------------
  // NEW DIRECTORY TREE & NOTE MANIPULATION API CALLS
  // -------------------------------------------------------------

  const fetchDirTree = async () => {
    try {
      const tree = await readVaultTree();
      setDirTree(tree);
    } catch (e) {
      console.error("Failed to load directory tree:", e);
    }
  };

  const fetchJournalTree = async () => {
    try {
      const tree = await readJournalTree();
      setJournalTree(tree);
    } catch (e) {
      console.error("Failed to load journal tree:", e);
    }
  };

  const handleOpenTodayJournal = async () => {
    if (journalSetupRequired) {
      handleSidebarItemClick("settings");
      return;
    }
    try {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const todayStr = `${yyyy}-${mm}-${dd}`;
      const filePath = `${activeJournalPath}/${todayStr}.md`;

      let content = "";
      try {
        content = await readFileContent(filePath);
      } catch {
        // File does not exist yet, write empty string to scaffold it!
        await writeFileContent(filePath, `# 📓 Journal Entry: ${todayStr}\n\n`);
        content = `# 📓 Journal Entry: ${todayStr}\n\n`;
      }
      await fetchJournalTree();
      setActiveFilePath(filePath);
      setActiveFileContent(content);
    } catch (e) {
      console.error("Failed to open today's journal note:", e);
      alert(`Error opening journal: ${e}`);
    }
  };

  const fetchTodayJournal = async (journalPath: string) => {
    if (!journalPath || journalPath === "Loading...") return;
    try {
      setTodayJournalLoading(true);
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const todayStr = `${yyyy}-${mm}-${dd}`;
      const filePath = `${journalPath}/${todayStr}.md`;

      let content = "";
      try {
        content = await readFileContent(filePath);
      } catch {
        // Silently scaffold today's journal note
        await writeFileContent(filePath, `# 📓 Journal Entry: ${todayStr}\n\n`);
        content = `# 📓 Journal Entry: ${todayStr}\n\n`;
      }
      setTodayJournalPath(filePath);
      setTodayJournalContent(content);
    } catch (e) {
      console.error("Failed to fetch or scaffold today's journal note:", e);
    } finally {
      setTodayJournalLoading(false);
    }
  };

  const handleSaveTodayJournalContent = async (content: string) => {
    if (!todayJournalPath) return;
    try {
      await writeFileContent(todayJournalPath, content);
      setTodayJournalContent(content);
    } catch (e) {
      console.error("Failed to save today's journal:", e);
      throw e;
    }
  };

  const handleSelectFile = async (path: string) => {
    try {
      const content = await readFileContent(path);
      setActiveFilePath(path);
      setActiveFileContent(content);
    } catch (e) {
      console.error("Failed to read file:", e);
      alert(`Error loading note: ${e}`);
    }
  };

  const handleCreateFile = async (parentPath: string, name: string) => {
    try {
      const createdPath = await createFile(parentPath, name);
      await fetchDirTree();
      await handleSelectFile(createdPath);
    } catch (e) {
      console.error("Failed to create file:", e);
      alert(`Error creating note: ${e}`);
    }
  };

  const handleCreateFolder = async (parentPath: string, name: string) => {
    try {
      await createDirectory(parentPath, name);
      await fetchDirTree();
    } catch (e) {
      console.error("Failed to create directory:", e);
      alert(`Error creating directory: ${e}`);
    }
  };

  const handleDeletePath = async (path: string) => {
    try {
      await deletePath(path);
      if (activeFilePath === path) {
        setActiveFilePath(null);
        setActiveFileContent(null);
      }
      await fetchDirTree();
    } catch (e) {
      console.error("Failed to delete path:", e);
      alert(`Error deleting path: ${e}`);
    }
  };

  const handleRenamePath = async (oldPath: string, newPath: string, node: FileNode) => {
    try {
      const config = await getTaskCreationConfig();
      const sourceProject = projectNameFromVaultPath(
        oldPath,
        activeVaultPath,
        config.projectFolder,
        node.is_dir,
      );
      if (sourceProject === "project_root") {
        pushNotification({
          id: "project-root-rename-blocked",
          kind: "warning",
          title: "Project folder not renamed",
          message: "Change project folder from Task settings so routing remains valid.",
        });
        return;
      }
      if (sourceProject !== null) {
        const destinationProject = projectNameFromVaultPath(
          newPath,
          activeVaultPath,
          config.projectFolder,
          node.is_dir,
        );
        if (!destinationProject || destinationProject === "project_root") {
          pushNotification({
            id: "project-rename-invalid",
            kind: "error",
            title: "Project not renamed",
            message: node.is_dir
              ? "Project directory name is invalid."
              : "Project note must remain a Markdown file inside project folder.",
          });
          return;
        }
        await beginProjectRename(sourceProject, destinationProject);
        return;
      }
      await renamePath(oldPath, newPath);
      if (activeFilePath === oldPath) {
        setActiveFilePath(newPath);
      }
      await fetchDirTree();
    } catch (e) {
      console.error("Failed to rename path:", e);
      pushNotification({
        id: "path-rename-error",
        kind: "error",
        title: "Path not renamed",
        message: parseProjectRenameError(e)?.message ?? writeErrorMessage(e),
      });
    }
  };

  const beginProjectRename = async (sourceProject: string, destinationProject: string) => {
    const plan = await preflightProjectRename(sourceProject, destinationProject);
    setProjectRenameRecovery(null);
    if (plan.collisions.length === 0) {
      setPendingProjectRename(plan);
      return;
    }

    try {
      const mergePlan = await preflightProjectMerge(sourceProject, destinationProject);
      setPendingProjectRename(null);
      setPendingProjectMerge(mergePlan);
      setProjectMergeStage("offer");
      setProjectMergeBlocker(undefined);
      setProjectMergeBlockerPath(undefined);
      setResolvedProjectMergeConflicts([]);
      setProjectMergeRecovery(null);
      setProjectMergeResult(null);
    } catch (error) {
      const mergeError = parseProjectMergeError(error);
      if (mergeError?.code === "ancestor_conflict" || mergeError?.code === "symlink_blocked") {
        const config = await getTaskCreationConfig();
        setPendingProjectRename(null);
        setPendingProjectMerge(blockedMergePlan(plan, config.projectFolder));
        setProjectMergeStage("blocked");
        setProjectMergeBlocker(mergeError.code === "symlink_blocked" ? "symlink" : "ancestor");
        setProjectMergeBlockerPath(mergeError.paths[0]);
        return;
      }
      setPendingProjectRename(plan);
    }
  };

  const handleSidebarProjectRename = async (sourceProject: string, destinationProject: string) => {
    try {
      await beginProjectRename(sourceProject, destinationProject);
    } catch (error) {
      pushNotification({
        id: "sidebar-project-rename-error",
        kind: "error",
        title: "Project not renamed",
        message: parseProjectRenameError(error)?.message ?? writeErrorMessage(error),
      });
      throw error;
    }
  };

  const handleSaveFileContent = async (content: string) => {
    if (!activeFilePath) return;
    try {
      await writeFileContent(activeFilePath, content);
      setActiveFileContent(content);
    } catch (e) {
      console.error("Failed to save note:", e);
      throw e;
    }
  };

  const getSortedEventsForDay = (date: Date) =>
    getCalendarEvents(tasks, date, showFutureRepetitions);

  const shiftCalendar = (amount: number) => {
    const nextDate = new Date(currentDate);
    if (calendarViewMode === "month") {
      nextDate.setMonth(currentDate.getMonth() + amount);
    } else {
      nextDate.setDate(currentDate.getDate() + amount * 7);
    }
    setCurrentDate(nextDate);
  };

  // Day Cell click handler
  const handleDayCellClick = (date: Date) => {
    setDrawerDate(date);
    setShowDrawer(true);
    setEditingEventHash(null); // Reset any open form
  };

  const handleEditStart = (event: Task) => {
    setEditingEventHash(event.hash);

    const s = event.s_start || "";
    const datePart = s.length >= 10 ? s.slice(0, 10) : calendarDateKey(new Date());
    const timePart = s.length > 10 ? s.slice(11, 16) : "12:00";

    setScheduleDraft({
      date: datePart,
      time: timePart,
      durationMinutes: event.duration_secs ? event.duration_secs / 60 : 60,
    });
  };

  const handleSaveSchedule = async (event: Task) => {
    try {
      const new_s_start = `${scheduleDraft.date.trim()} ${scheduleDraft.time.trim()}`;
      const new_duration_secs = scheduleDraft.durationMinutes * 60;

      await updateEventSchedule(
        event.file_path || "",
        event.line_number,
        event.raw_markdown,
        new_s_start,
        new_duration_secs,
      );

      setEditingEventHash(null);
      fetchTasks(); // Reload local store dynamically
    } catch (e) {
      console.error("Failed to update event schedule:", e);
      if (isWriteConflict(e)) {
        setEditingEventHash(null);
        await fetchTasks();
      }
      alert(`Error saving schedule: ${writeErrorMessage(e)}`);
    }
  };

  // Config Saving Command
  const handleSaveVault = async () => {
    if (!vaultInput.trim()) return;
    setSavingVault(true);
    try {
      await setVaultConfig(vaultInput.trim());
      setActiveVaultPath(vaultInput.trim());
      setIsEditingVault(false);
      await fetchTasks();
      await fetchCustomViews();
      await fetchDirTree();
      await fetchJournalTree();
    } catch (e) {
      console.error("Failed to update active vault path:", e);
      alert(`Failed to save: ${e}`);
    } finally {
      setSavingVault(false);
    }
  };

  const taskCreation = useTaskCreationController({
    selectedSection,
    refreshTasks: fetchTasks,
    refreshFiles: fetchDirTree,
    openFile: handleSelectFile,
  });
  const taskSettings = useTaskCreationSettings({
    enabled: selectedSection === "settings" && activeFilePath === null,
    onSaved: async () => {
      const journalPath = await getJournalConfig();
      setJournalSetupRequired(false);
      setActiveJournalPath(journalPath);
      await Promise.all([fetchJournalTree(), fetchDirTree(), fetchTodayJournal(journalPath)]);
    },
  });

  useEffect(() => {
    if (selectedSection !== "settings" || activeFilePath !== null) return;
    let active = true;
    void listProjectMergeRecovery()
      .then((bundles) => {
        if (active) setProjectMergeRecoveryBundles(bundles);
      })
      .catch((error) => {
        if (!active) return;
        pushNotification({
          id: "project-merge-recovery-load-error",
          kind: "warning",
          title: "Merge recovery unavailable",
          message: parseProjectMergeError(error)?.message ?? writeErrorMessage(error),
        });
      });
    return () => {
      active = false;
    };
  }, [activeFilePath, pushNotification, selectedSection]);

  const saveEditedTask = async (newRawMarkdown: string): Promise<boolean> => {
    if (!modalTask) return false;
    const nextMarkdown = newRawMarkdown.trim();
    const projectsInRoot = rootProjects(nextMarkdown);
    if (projectsInRoot.length > 1) {
      pushNotification({
        id: "task-project-invalid",
        kind: "error",
        title: "Task not saved",
        message: "Task can contain one root project.",
      });
      return false;
    }

    const destinationProject = projectsInRoot[0] ?? null;
    const sourceProject = modalTask.project;
    if (destinationProject !== sourceProject) {
      try {
        const previewInput = destinationProject
          ? `Project move preview +${destinationProject}`
          : "Project move preview";
        const preview = await previewTaskDraft(previewInput, {
          project: null,
          contexts: [],
          tags: [],
        });
        setPendingProjectMove({
          sourceProject,
          destinationProject,
          sourcePath: modalTask.file_path ?? "",
          destinationPath: preview.destinationPath,
          originalRawMarkdown: modalTask.raw_markdown,
          newRawMarkdown: nextMarkdown,
          descendantCount: nextMarkdown
            .split("\n")
            .slice(1)
            .filter((line) => /^\s+[-*+]\s+\[[ xX/<>-]\]/.test(line)).length,
        });
        return false;
      } catch (error) {
        pushNotification({
          id: "task-project-preview-error",
          kind: "error",
          title: "Project destination unavailable",
          message: parseCreateTaskError(error)?.message ?? writeErrorMessage(error),
        });
        return false;
      }
    }

    try {
      await updateTaskMarkdown(
        modalTask.file_path || "",
        modalTask.line_number,
        modalTask.raw_markdown,
        nextMarkdown,
      );
      await fetchTasks();
      pushNotification(
        {
          id: `task-updated-${modalTask.hash}`,
          kind: "success",
          title: "Task updated",
          message: modalTask.description,
        },
        6_000,
      );
      return true;
    } catch (error) {
      console.error("Failed to save full task modal:", error);
      if (isWriteConflict(error)) {
        setModalTask(null);
        await fetchTasks();
      }
      pushNotification({
        id: "task-update-error",
        kind: "error",
        title: "Task not saved",
        message: writeErrorMessage(error),
      });
      return false;
    }
  };

  const confirmProjectMove = async () => {
    if (!modalTask || !pendingProjectMove || movingProject) return;
    setMovingProject(true);
    try {
      const result = await moveTaskProject(
        pendingProjectMove.sourcePath,
        modalTask.line_number,
        pendingProjectMove.originalRawMarkdown,
        pendingProjectMove.newRawMarkdown,
      );
      await Promise.all([fetchTasks(), fetchDirTree()]);
      setPendingProjectMove(null);
      setModalTask(null);
      const warningCode = result.warning?.code;
      const kind =
        warningCode === "appended_at_eof" ? "info" : result.warning ? "warning" : "success";
      pushNotification(
        {
          id: `task-project-moved-${result.task.hash}`,
          kind,
          title:
            kind === "success"
              ? "Task moved"
              : kind === "info"
                ? "Task moved to end of file"
                : "Task moved with fallback",
          message: result.warning?.message ?? result.task.description,
          detail: result.destinationPath,
          actions: [
            {
              label: "Open file",
              onClick: () => void handleSelectFile(result.destinationPath),
            },
          ],
        },
        kind === "warning" ? 10_000 : 6_000,
      );
    } catch (error) {
      const moveError = parseMoveTaskProjectError(error);
      setPendingProjectMove(null);
      if (moveError?.recoveryRequired || moveError?.code === "index_failed") {
        setModalTask(null);
        await Promise.all([fetchTasks(), fetchDirTree()]);
      }
      pushNotification({
        id: "task-project-move-error",
        kind: moveError?.code === "index_failed" ? "warning" : "error",
        title:
          moveError?.code === "index_failed"
            ? "Task moved; list not refreshed"
            : moveError?.recoveryRequired
              ? "Project move needs recovery"
              : "Task not moved",
        message: moveError?.message ?? writeErrorMessage(error),
        detail: moveError?.recoveryRequired ? pendingProjectMove.destinationPath : undefined,
      });
    } finally {
      setMovingProject(false);
    }
  };

  const confirmProjectRename = async () => {
    if (!pendingProjectRename || renamingProject || pendingProjectRename.collisions.length > 0) {
      return;
    }
    const plan = pendingProjectRename;
    setRenamingProject(true);
    try {
      const result = await executeProjectRename(plan.planToken);
      if (activeFilePath) {
        const relative = activeFilePath.startsWith(`${activeVaultPath}/`)
          ? activeFilePath.slice(activeVaultPath.length + 1)
          : null;
        if (relative) {
          for (const move of plan.moves) {
            if (relative === move.sourcePath) {
              setActiveFilePath(`${activeVaultPath}/${move.destinationPath}`);
              break;
            }
            const prefix = `${move.sourcePath}/`;
            if (relative.startsWith(prefix)) {
              setActiveFilePath(
                `${activeVaultPath}/${move.destinationPath}/${relative.slice(prefix.length)}`,
              );
              break;
            }
          }
        }
      }
      if (selectedSection.startsWith("proj:")) {
        const selectedProject = selectedSection.slice("proj:".length);
        const renamed = renamedProjectValue(
          selectedProject,
          plan.sourceProject,
          plan.destinationProject,
        );
        if (renamed !== selectedProject) setSelectedSection(`proj:${renamed}`);
      }
      await Promise.all([fetchTasks(), fetchCustomViews(), fetchDirTree()]);
      setPendingProjectRename(null);
      setProjectRenameRecovery(null);
      pushNotification(
        {
          id: `project-renamed-${result.planToken}`,
          kind: "success",
          title: "Project renamed",
          message: `+${plan.sourceProject} → +${plan.destinationProject}`,
          detail: `${result.rewrittenTokens} task tokens · ${result.movedPaths} path moves`,
        },
        6_000,
      );
    } catch (error) {
      const renameError = parseProjectRenameError(error);
      if (renameError?.recovery) {
        setProjectRenameRecovery(renameError.recovery);
        await Promise.all([fetchTasks(), fetchCustomViews(), fetchDirTree()]);
      } else {
        setPendingProjectRename(null);
      }
      pushNotification({
        id: "project-rename-error",
        kind: "error",
        title: renameError?.recovery ? "Project rename needs attention" : "Project not renamed",
        message: renameError?.message ?? writeErrorMessage(error),
      });
    } finally {
      setRenamingProject(false);
    }
  };

  const eligibleProjectMergeConflictIds =
    pendingProjectMerge?.conflicts
      .filter(
        (conflict) =>
          (conflict.kind === "file" || conflict.kind === "ignored") &&
          conflict.sourceKind === "file" &&
          conflict.destinationKind === "file",
      )
      .map((conflict) => conflict.id) ?? [];

  const clearProjectMerge = () => {
    setPendingProjectMerge(null);
    setProjectMergeStage("offer");
    setProjectMergeBlocker(undefined);
    setProjectMergeBlockerPath(undefined);
    setResolvedProjectMergeConflicts([]);
    setProjectMergeRecovery(null);
    setProjectMergeResult(null);
  };

  const closeProjectMerge = async () => {
    const operationId = pendingProjectMerge?.operationId;
    const shouldCancel =
      operationId &&
      projectMergeStage !== "success" &&
      projectMergeStage !== "partial" &&
      projectMergeStage !== "blocked";
    clearProjectMerge();
    if (!shouldCancel) return;
    try {
      await cancelProjectMerge(operationId);
    } catch (error) {
      pushNotification({
        id: "project-merge-cancel-error",
        kind: "warning",
        title: "Merge cleanup needs attention",
        message: parseProjectMergeError(error)?.message ?? writeErrorMessage(error),
      });
    }
  };

  const cancelPendingProjectMerge = async () => {
    if (!pendingProjectMerge?.operationId) {
      clearProjectMerge();
      return;
    }
    try {
      cancelledProjectMerges.current.add(pendingProjectMerge.operationId);
      await cancelProjectMerge(pendingProjectMerge.operationId);
      setProjectMergeStage("cancelled");
    } catch (error) {
      cancelledProjectMerges.current.delete(pendingProjectMerge.operationId);
      pushNotification({
        id: "project-merge-cancel-error",
        kind: "error",
        title: "Project merge not cancelled",
        message: parseProjectMergeError(error)?.message ?? writeErrorMessage(error),
      });
    }
  };

  const saveProjectMergeResolution = async (
    conflictId: string,
    action: ProjectMergeResolutionAction,
    result?: string,
    sourceName?: string,
  ) => {
    if (!pendingProjectMerge) return;
    try {
      await resolveProjectMergeConflict(pendingProjectMerge.planToken, {
        conflictId,
        action,
        result: result ?? null,
        sourceName: sourceName ?? null,
      });
      setResolvedProjectMergeConflicts((current) =>
        current.includes(conflictId) ? current : [...current, conflictId],
      );
    } catch (error) {
      pushNotification({
        id: "project-merge-resolution-error",
        kind: "error",
        title: "Conflict not resolved",
        message: parseProjectMergeError(error)?.message ?? writeErrorMessage(error),
      });
    }
  };

  const confirmBulkProjectMergeResolution = async () => {
    if (!pendingProjectMerge || eligibleProjectMergeConflictIds.length === 0) {
      setProjectMergeStage("resolve");
      return;
    }
    try {
      await resolveProjectMergeConflictsBulk(pendingProjectMerge.planToken, {
        conflictIds: eligibleProjectMergeConflictIds,
        action: "use_destination",
        confirmedCount: eligibleProjectMergeConflictIds.length,
      });
      setResolvedProjectMergeConflicts((current) => [
        ...new Set([...current, ...eligibleProjectMergeConflictIds]),
      ]);
      setProjectMergeStage("resolve");
    } catch (error) {
      pushNotification({
        id: "project-merge-bulk-resolution-error",
        kind: "error",
        title: "Bulk resolution not applied",
        message: parseProjectMergeError(error)?.message ?? writeErrorMessage(error),
      });
    }
  };

  const preparePendingProjectMerge = async () => {
    if (!pendingProjectMerge) return;
    if (resolvedProjectMergeConflicts.length !== pendingProjectMerge.conflicts.length) {
      setProjectMergeStage("resolve");
      pushNotification({
        id: "project-merge-unresolved",
        kind: "warning",
        title: "Resolve every conflict",
        message: `${pendingProjectMerge.conflicts.length - resolvedProjectMergeConflicts.length} conflicts remain.`,
      });
      return;
    }
    setProjectMergeStage("preparing");
    try {
      await prepareProjectMerge(pendingProjectMerge.planToken);
      cancelledProjectMerges.current.delete(pendingProjectMerge.operationId);
      setProjectMergeStage("commit");
    } catch (error) {
      const mergeError = parseProjectMergeError(error);
      const cancellationRequested = cancelledProjectMerges.current.delete(
        pendingProjectMerge.operationId,
      );
      if (mergeError?.code === "cancelled" || cancellationRequested) {
        setProjectMergeStage("cancelled");
        return;
      }
      setProjectMergeStage(pendingProjectMerge.conflicts.length ? "resolve" : "review");
      pushNotification({
        id: "project-merge-prepare-error",
        kind: "error",
        title: "Merge preparation failed",
        message: mergeError?.message ?? writeErrorMessage(error),
      });
    }
  };

  const retryProjectMergePreflight = async () => {
    if (!pendingProjectMerge) return;
    try {
      const plan = await preflightProjectMerge(
        pendingProjectMerge.sourceProject,
        pendingProjectMerge.destinationProject,
      );
      setPendingProjectMerge(plan);
      setResolvedProjectMergeConflicts([]);
      setProjectMergeRecovery(null);
      setProjectMergeResult(null);
      setProjectMergeStage("review");
    } catch (error) {
      pushNotification({
        id: "project-merge-retry-error",
        kind: "error",
        title: "Merge preflight failed",
        message: parseProjectMergeError(error)?.message ?? writeErrorMessage(error),
      });
    }
  };

  const continueProjectMerge = () => {
    if (!pendingProjectMerge) return;
    if (projectMergeStage === "review" && pendingProjectMerge.conflicts.length > 0) {
      setProjectMergeStage("resolve");
      return;
    }
    if (projectMergeStage === "partial") {
      void retryProjectMergePreflight();
      return;
    }
    void preparePendingProjectMerge();
  };

  const commitPendingProjectMerge = async () => {
    if (!pendingProjectMerge) return;
    const plan = pendingProjectMerge;
    setProjectMergeStage("committing");
    try {
      const result = await executeProjectMerge(plan.planToken);
      setProjectMergeResult(result);
      setProjectMergeStage("success");
      setProjectMergeRecovery(null);
      if (selectedSection.startsWith("proj:")) {
        const selectedProject = selectedSection.slice("proj:".length);
        if (
          selectedProject.toLocaleLowerCase() === plan.sourceProject.toLocaleLowerCase() ||
          selectedProject
            .toLocaleLowerCase()
            .startsWith(`${plan.sourceProject.toLocaleLowerCase()}/`)
        ) {
          setSelectedSection(`proj:${plan.destinationProject}`);
        }
      }
      if (activeFilePath?.startsWith(`${activeVaultPath}/${plan.projectFolder}/`)) {
        setActiveFilePath(null);
        setActiveFileContent(null);
      }
      const [, bundles] = await Promise.all([
        Promise.all([fetchTasks(), fetchCustomViews(), fetchDirTree()]),
        listProjectMergeRecovery(),
      ]);
      setProjectMergeRecoveryBundles(bundles);
      pushNotification(
        {
          id: `project-merged-${result.operationId}`,
          kind: "success",
          title: "Projects merged",
          message: `+${plan.sourceProject} → +${plan.destinationProject}`,
          detail: "Original files remain available in recovery for 30 days.",
        },
        6_000,
      );
    } catch (error) {
      const mergeError = parseProjectMergeError(error);
      if (mergeError?.recovery) {
        setProjectMergeRecovery(mergeError.recovery);
        setProjectMergeStage("partial");
        await Promise.all([fetchTasks(), fetchCustomViews(), fetchDirTree()]);
      } else if (mergeError?.code === "cancelled") {
        setProjectMergeStage("cancelled");
      } else {
        setProjectMergeStage("commit");
      }
      pushNotification({
        id: "project-merge-commit-error",
        kind: mergeError?.recovery ? "warning" : "error",
        title: mergeError?.recovery ? "Project merge needs attention" : "Projects not merged",
        message: mergeError?.message ?? writeErrorMessage(error),
      });
    }
  };

  const stopCommittedProjectMerge = async () => {
    if (!pendingProjectMerge) return;
    setProjectMergeStage("stopping");
    try {
      await cancelProjectMerge(pendingProjectMerge.operationId);
    } catch (error) {
      setProjectMergeStage("committing");
      pushNotification({
        id: "project-merge-stop-error",
        kind: "error",
        title: "Safe stop not requested",
        message: parseProjectMergeError(error)?.message ?? writeErrorMessage(error),
      });
    }
  };

  const openMergeRecovery = async (operationId?: string) => {
    const target =
      operationId ?? projectMergeResult?.operationId ?? projectMergeRecovery?.operationId;
    if (!target) return;
    try {
      await openProjectMergeRecovery(target);
    } catch (error) {
      pushNotification({
        id: "project-merge-recovery-open-error",
        kind: "error",
        title: "Recovery not opened",
        message: parseProjectMergeError(error)?.message ?? writeErrorMessage(error),
      });
    }
  };

  const deleteMergeRecovery = async (operationId: string) => {
    if (!window.confirm("Delete this project merge recovery permanently?")) return;
    try {
      await deleteProjectMergeRecovery(operationId);
      setProjectMergeRecoveryBundles((current) =>
        current.filter((bundle) => bundle.operationId !== operationId),
      );
      pushNotification({
        id: `project-merge-recovery-deleted-${operationId}`,
        kind: "info",
        title: "Merge recovery deleted",
        message: "Original files from this merge can no longer be restored.",
      });
    } catch (error) {
      pushNotification({
        id: "project-merge-recovery-delete-error",
        kind: "error",
        title: "Recovery not deleted",
        message: parseProjectMergeError(error)?.message ?? writeErrorMessage(error),
      });
    }
  };

  return (
    <>
      {/* 1. SIDEBAR PANEL */}
      <SidebarNavigation
        selectedSection={selectedSection}
        activeFilePath={activeFilePath}
        customViews={customViews}
        projects={sidebarProjects}
        projectCatalogSize={projects.length}
        showInactiveProjects={showInactiveProjects}
        contexts={contexts}
        tags={tags}
        onSelectSection={handleSidebarItemClick}
        onShowInactiveProjectsChange={handleShowInactiveProjectsChange}
        onRenameProject={handleSidebarProjectRename}
        beforeCollections={
          <>
            {/* Collapsible Journals Virtual Explorer Tree (Swapped to First!) */}
            <div className="sidebar-section">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "0.25rem",
                }}
              >
                <h4
                  onClick={() =>
                    journalSetupRequired
                      ? handleSidebarItemClick("settings")
                      : setJournalsExpanded(!journalsExpanded)
                  }
                  style={{ margin: 0, cursor: "pointer", flexGrow: 1 }}
                >
                  Journals
                </h4>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenTodayJournal();
                    }}
                    title={
                      journalSetupRequired
                        ? "Configure journal in Task settings"
                        : "Write Today's Entry"
                    }
                    disabled={journalSetupRequired}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--color-violet)",
                      cursor: journalSetupRequired ? "not-allowed" : "pointer",
                      opacity: journalSetupRequired ? 0.45 : 1,
                      display: "flex",
                      alignItems: "center",
                      padding: 0,
                    }}
                  >
                    <BookOpen size={14} />
                  </button>
                  <span
                    onClick={() =>
                      journalSetupRequired
                        ? handleSidebarItemClick("settings")
                        : setJournalsExpanded(!journalsExpanded)
                    }
                    style={{ fontSize: "0.7rem", color: "var(--text-muted)", cursor: "pointer" }}
                  >
                    {journalSetupRequired
                      ? "Setup required"
                      : journalsExpanded
                        ? "Collapse"
                        : "Expand"}
                  </span>
                </div>
              </div>
              {journalsExpanded && (
                <div
                  style={{
                    marginTop: "0.5rem",
                    maxHeight: "250px",
                    overflowY: "auto",
                    paddingLeft: "0.15rem",
                  }}
                >
                  {journalTree && journalTree.children ? (
                    journalTree.children.map((child, index) => (
                      <FileTree
                        key={`${child.path}-${index}`}
                        node={child}
                        selectedPath={activeFilePath}
                        onSelectFile={handleSelectFile}
                        readOnly={true}
                      />
                    ))
                  ) : (
                    <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                      Loading journals...
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Collapsible Vault Notes Explorer Tree (Swapped to Second!) */}
            <div className="sidebar-section">
              <div
                onClick={() => setNotesExpanded(!notesExpanded)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  cursor: "pointer",
                  marginBottom: "0.25rem",
                }}
              >
                <h4 style={{ margin: 0 }}>Notes</h4>
                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                  {notesExpanded ? "Collapse" : "Expand"}
                </span>
              </div>
              {notesExpanded && (
                <div
                  style={{
                    marginTop: "0.5rem",
                    maxHeight: "250px",
                    overflowY: "auto",
                    paddingLeft: "0.15rem",
                  }}
                >
                  {dirTree && dirTree.children ? (
                    dirTree.children.map((child, index) => (
                      <FileTree
                        key={`${child.path}-${index}`}
                        node={child}
                        selectedPath={activeFilePath}
                        onSelectFile={handleSelectFile}
                        onCreateFile={handleCreateFile}
                        onCreateFolder={handleCreateFolder}
                        onRename={handleRenamePath}
                        onDelete={handleDeletePath}
                      />
                    ))
                  ) : (
                    <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                      Loading notes...
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        }
        footer={
          <div className="sidebar-footer">
            <ul className="sidebar-list sidebar-settings-link">
              <li>
                <button
                  type="button"
                  className={`sidebar-item ${
                    activeFilePath === null && selectedSection === "settings" ? "active" : ""
                  }`}
                  onClick={() => handleSidebarItemClick("settings")}
                >
                  <Settings size={16} /> Task settings
                </button>
              </li>
            </ul>

            {/* Active Vault Location indicator with Inline Editor */}
            <div
              style={{
                borderTop: "1px solid var(--border-card)",
                paddingTop: "1.5rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "0.5rem",
                }}
              >
                <span
                  style={{
                    fontSize: "0.75rem",
                    textTransform: "uppercase",
                    color: "var(--text-muted)",
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                  }}
                >
                  Active Vault Path
                </span>
                {!isEditingVault && (
                  <button
                    onClick={() => setIsEditingVault(true)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--color-violet)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      padding: 0,
                    }}
                  >
                    <Edit2 size={12} />
                  </button>
                )}
              </div>

              {isEditingVault ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <input
                    type="text"
                    value={vaultInput}
                    onChange={(e) => setVaultInput(e.target.value)}
                    style={{
                      width: "100%",
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid var(--border-card)",
                      borderRadius: "6px",
                      color: "var(--text-primary)",
                      padding: "0.4rem 0.6rem",
                      fontSize: "0.8rem",
                      fontFamily: "monospace",
                    }}
                    placeholder="~/octarine_vault"
                    disabled={savingVault}
                  />
                  <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                    <button
                      onClick={() => setIsEditingVault(false)}
                      style={{
                        background: "rgba(255, 255, 255, 0.05)",
                        border: "1px solid var(--border-card)",
                        color: "var(--text-muted)",
                        padding: "0.25rem 0.5rem",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "0.75rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.25rem",
                      }}
                      disabled={savingVault}
                    >
                      <X size={10} /> Cancel
                    </button>
                    <button
                      onClick={handleSaveVault}
                      style={{
                        background: "var(--color-violet)",
                        border: "none",
                        color: "white",
                        padding: "0.25rem 0.5rem",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        gap: "0.25rem",
                      }}
                      disabled={savingVault}
                    >
                      {savingVault ? (
                        <Loader2 size={10} className="animate-spin" />
                      ) : (
                        <Check size={10} />
                      )}{" "}
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--text-secondary)",
                    wordBreak: "break-all",
                    fontStyle: "italic",
                    lineHeight: 1.4,
                  }}
                >
                  {activeVaultPath}
                </div>
              )}
            </div>
          </div>
        }
      />

      {/* 2. MAIN WORKSPACE PANEL */}
      <div className="main-content">
        {taskCreation.isOpen && (
          <CreateTaskModal
            input={taskCreation.input}
            preview={taskCreation.preview}
            expanded={taskCreation.expanded}
            creating={taskCreation.creating}
            validationMessage={taskCreation.validationMessage}
            onInputChange={taskCreation.setInput}
            onDraftChange={taskCreation.setPreview}
            onRawMarkdownChange={taskCreation.setRawMarkdown}
            onExpandedChange={taskCreation.setExpanded}
            onCreate={() => void taskCreation.create()}
            onClose={taskCreation.close}
          />
        )}

        {modalTask && (
          <EditTaskModal
            task={modalTask}
            onClose={() => setModalTask(null)}
            onSave={saveEditedTask}
            onDelete={async () => {
              try {
                await deleteTaskMarkdown(
                  modalTask.file_path || "",
                  modalTask.line_number,
                  modalTask.raw_markdown,
                );
                await fetchTasks();
              } catch (e) {
                if (isWriteConflict(e)) {
                  setModalTask(null);
                  await fetchTasks();
                }
                alert(`Error deleting task: ${writeErrorMessage(e)}`);
                throw e;
              }
            }}
          />
        )}

        {modalTask && pendingProjectMove && (
          <ProjectMoveConfirmation
            taskTitle={modalTask.description}
            sourceProject={pendingProjectMove.sourceProject}
            destinationProject={pendingProjectMove.destinationProject}
            sourcePath={pendingProjectMove.sourcePath}
            destinationPath={pendingProjectMove.destinationPath}
            descendantCount={pendingProjectMove.descendantCount}
            moving={movingProject}
            onConfirm={() => void confirmProjectMove()}
            onCancel={() => setPendingProjectMove(null)}
          />
        )}

        {pendingProjectRename && (
          <ProjectRenameConfirmation
            plan={pendingProjectRename}
            executing={renamingProject}
            recovery={projectRenameRecovery}
            onConfirm={() => void confirmProjectRename()}
            onCancel={() => {
              setPendingProjectRename(null);
              setProjectRenameRecovery(null);
            }}
          />
        )}

        {pendingProjectMerge && (
          <ProjectMergeWorkflow
            plan={pendingProjectMerge}
            stage={projectMergeStage}
            blocker={projectMergeBlocker}
            blockerPath={projectMergeBlockerPath}
            resolvedConflictIds={resolvedProjectMergeConflicts}
            bulkCount={eligibleProjectMergeConflictIds.length}
            progress={
              projectMergeStage === "preparing" ? 42 : projectMergeStage === "stopping" ? 72 : 68
            }
            recovery={projectMergeRecovery}
            recoveryDeletionDate={projectMergeResult?.recoveryDeletionDate}
            onClose={() => void closeProjectMerge()}
            onStartMerge={() => setProjectMergeStage("review")}
            onContinue={continueProjectMerge}
            onBack={() =>
              setProjectMergeStage(projectMergeStage === "bulk_confirm" ? "resolve" : "review")
            }
            onCancel={() => void cancelPendingProjectMerge()}
            onStop={() => void stopCommittedProjectMerge()}
            onCommit={() => void commitPendingProjectMerge()}
            onResolveConflict={(id, action, result, sourceName) =>
              void saveProjectMergeResolution(id, action, result, sourceName)
            }
            onRequestBulk={() => {
              if (eligibleProjectMergeConflictIds.length > 0) {
                setProjectMergeStage("bulk_confirm");
              } else {
                pushNotification({
                  id: "project-merge-no-bulk-conflicts",
                  kind: "info",
                  title: "No bulk-eligible conflicts",
                  message: "Resolve directories and type mismatches individually.",
                });
              }
            }}
            onConfirmBulk={() => void confirmBulkProjectMergeResolution()}
            onOpenRecovery={() => void openMergeRecovery()}
            onOpenDestination={() => {
              setSelectedSection(`proj:${pendingProjectMerge.destinationProject}`);
              clearProjectMerge();
            }}
          />
        )}

        {!(activeFilePath === null && selectedSection === "settings") && (
          <div className="main-header">
            <div className="main-title">
              <h1>
                {activeFilePath !== null && "Plaintext Note Editor"}
                {activeFilePath === null && selectedSection === "all" && "Inbox Dashboard"}
                {activeFilePath === null && selectedSection === "todo" && "Inbox: Todo"}
                {activeFilePath === null && selectedSection === "doing" && "Active Sprints"}
                {activeFilePath === null && selectedSection === "events" && "Calendar Timeline"}
                {activeFilePath === null &&
                  selectedSection.startsWith("proj:") &&
                  `Project: ${selectedSection.slice(5)}`}
                {activeFilePath === null &&
                  selectedSection.startsWith("ctx:") &&
                  `Context: @${selectedSection.slice(4)}`}
                {activeFilePath === null &&
                  selectedSection.startsWith("tag:") &&
                  `Tag: #${selectedSection.slice(4)}`}
                {activeFilePath === null &&
                  selectedSection.startsWith("view:") &&
                  `Query: ${selectedSection.slice(5)}`}
              </h1>
              <p>
                {activeFilePath !== null
                  ? "Direct Markdown Editor Workspace"
                  : "Sub-millisecond plaintext organization"}
              </p>
            </div>
            <button
              ref={taskCreation.triggerRef}
              type="button"
              className="new-task-button"
              onClick={taskCreation.open}
            >
              <Plus size={16} /> New task
            </button>
          </div>
        )}

        {/* Search Inputs (only displayed in dashboard mode) */}
        {activeFilePath === null && selectedSection !== "settings" && (
          <div className="workspace-toolbar">
            <div className="search-container">
              <Search size={18} color="#6b7280" />
              <input
                type="text"
                placeholder="Search tasks, descriptions or projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            {selectedSection.startsWith("proj:") && (
              <div className="project-view-controls" aria-label="Project view controls">
                <div className="project-view-switch" aria-label="Project presentation">
                  {(["board", "list"] as const).map((mode) => (
                    <button
                      type="button"
                      key={mode}
                      className={projectViewMode === mode ? "active" : ""}
                      aria-pressed={projectViewMode === mode}
                      onClick={() => setProjectViewMode(mode)}
                    >
                      {mode === "board" ? "Board" : "List"}
                    </button>
                  ))}
                </div>
                {projectViewMode === "board" && (
                  <div className="project-status-filters" aria-label="Closed status columns">
                    {(["done", "cancelled"] as const).map((status) => (
                      <button
                        type="button"
                        key={status}
                        className={visibleClosedStatuses.includes(status) ? "active" : ""}
                        aria-pressed={visibleClosedStatuses.includes(status)}
                        onClick={() => toggleClosedStatus(status)}
                      >
                        {status === "done" ? "Done" : "Cancelled"}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Active Loader */}
        {loading && tasks.length === 0 && selectedSection !== "settings" && (
          <WorkspaceState kind="loading" />
        )}

        {/* Render Notes Editor Mode or Normal Task Dashboard Content */}
        {activeFilePath !== null && activeFileContent !== null ? (
          <div
            className="editor-canvas-column"
            style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%" }}
          >
            <MarkdownEditor
              key={activeFilePath} // Remount when file path changes
              filePath={activeFilePath}
              initialContent={activeFileContent}
              onSave={handleSaveFileContent}
              onClose={() => {
                setActiveFilePath(null);
                setActiveFileContent(null);
              }}
              projects={projects}
              contexts={contexts}
            />
          </div>
        ) : selectedSection === "settings" ? (
          taskSettings.value ? (
            <div className="task-settings-app-surface">
              {applicationUpdates.runtime && (
                <ApplicationUpdateSettings
                  runtime={applicationUpdates.runtime}
                  available={applicationUpdates.available}
                  checking={applicationUpdates.checking}
                  installing={applicationUpdates.installing}
                  savingChannel={applicationUpdates.savingChannel}
                  error={applicationUpdates.error}
                  onChannelChange={(channel) => void applicationUpdates.changeChannel(channel)}
                  onCheck={() => void applicationUpdates.check()}
                  onInstall={(update) => void applicationUpdates.install(update)}
                />
              )}
              <TaskCreationSettings
                value={taskSettings.value}
                errors={taskSettings.errors}
                migrationSource={taskSettings.migrationSource}
                saving={taskSettings.saving}
                saved={taskSettings.saved}
                onChange={taskSettings.setValue}
                onSave={() => void taskSettings.save()}
              />
              <div className="task-settings-recovery-section">
                <ProjectMergeRecoveryList
                  bundles={projectMergeRecoveryBundles}
                  onOpen={(operationId) => void openMergeRecovery(operationId)}
                  onDelete={(operationId) => void deleteMergeRecovery(operationId)}
                />
              </div>
            </div>
          ) : taskSettings.loading ? (
            <WorkspaceState kind="loading" />
          ) : (
            <div className="empty-state">
              <h3>Task settings unavailable</h3>
              <p>{taskSettings.loadError}</p>
              <button className="new-task-button" onClick={() => void taskSettings.load()}>
                Retry
              </button>
            </div>
          )
        ) : !loading && selectedSection === "events" ? (
          <CalendarSurface
            tasks={tasks}
            currentDate={currentDate}
            view={calendarViewMode}
            showFutureRepetitions={showFutureRepetitions}
            onViewChange={setCalendarViewMode}
            onPrevious={() => shiftCalendar(-1)}
            onNext={() => shiftCalendar(1)}
            onShowFutureRepetitionsChange={setShowFutureRepetitions}
            onDayOpen={handleDayCellClick}
            onEventActivate={handleCalendarEventActivate}
          />
        ) : !loading && selectedSection === "all" ? (
          <Dashboard
            tasks={tasks}
            projects={projects}
            contexts={contexts}
            journalContent={todayJournalContent}
            journalPath={todayJournalPath}
            journalLoading={todayJournalLoading}
            onSaveJournal={handleSaveTodayJournalContent}
            onOpenTask={openTaskModal}
            onStatusChange={handleTaskStatusChange}
          />
        ) : selectedSection.startsWith("proj:") && projectViewMode === "board" ? (
          <KanbanBoard
            tasks={tasks}
            selectedProject={selectedSection.slice("proj:".length)}
            searchQuery={searchQuery}
            visibleClosedStatuses={visibleClosedStatuses}
            errorMessage={error}
            pendingTaskMoves={pendingTaskMoves}
            onOpenTask={openTaskModal}
            onStatusChange={handleTaskStatusChange}
            onMoveTask={moveTask}
          />
        ) : !loading && filteredTasks.length === 0 ? (
          <WorkspaceState kind="empty" />
        ) : (
          <div className="task-list">
            {(() => {
              const sortedTasks = [...filteredTasks].sort((a, b) => {
                const pA = a.priority === null || a.priority === undefined ? Infinity : a.priority;
                const pB = b.priority === null || b.priority === undefined ? Infinity : b.priority;
                return pA - pB;
              });

              return sortedTasks.map((task) => (
                <TaskCard
                  key={task.hash}
                  task={task}
                  tasks={tasks}
                  onOpen={openTaskModal}
                  onStatusChange={handleTaskStatusChange}
                />
              ));
            })()}
          </div>
        )}
      </div>

      <NotificationViewport
        notifications={taskCreation.notifications}
        onDismiss={taskCreation.dismissNotification}
      />

      {showDrawer && drawerDate && (
        <DayDrawer
          date={drawerDate}
          events={getSortedEventsForDay(drawerDate)}
          editingEventHash={editingEventHash}
          draft={scheduleDraft}
          onClose={() => setShowDrawer(false)}
          onEditStart={handleEditStart}
          onDraftChange={setScheduleDraft}
          onCancelEdit={() => setEditingEventHash(null)}
          onSaveSchedule={handleSaveSchedule}
        />
      )}
    </>
  );
}
