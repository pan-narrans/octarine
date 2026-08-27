import { useEffect, useRef, useState } from "react";
import { useTaskStore } from "./hooks/use-task-store";
import { useTauriEvents } from "./hooks/use-tauri-events";
import { Task, FileNode } from "./types";
import { FileTree } from "./components/FileTree";
import { MarkdownEditor } from "./components/MarkdownEditor";
import { WorkspaceState } from "./components/WorkspaceState";
import { EditTaskModal } from "./components/EditTaskModal";
import { TaskCard } from "./features/tasks/TaskCard";
import { SidebarNavigation } from "./features/navigation/SidebarNavigation";
import { Dashboard } from "./features/dashboard/Dashboard";
import { CalendarSurface } from "./features/calendar/CalendarSurface";
import { DayDrawer, type ScheduleDraft } from "./features/calendar/DayDrawer";
import { calendarDateKey, getCalendarEvents } from "./features/calendar/calendar-utils";
import { Loader2, Search, Edit2, Check, X, BookOpen } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import {
  isWriteConflict,
  deleteTaskMarkdown,
  updateEventSchedule,
  updateTaskMarkdown,
  writeErrorMessage,
} from "./features/tasks/ipc";
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
  setJournalConfig,
  setVaultConfig,
  writeFileContent,
} from "./features/workspace/ipc";
import { getVisualScenario } from "./dev/visual-scenario";

export function App() {
  // Activate live Tauri event listener for real-time background watcher sync
  useTauriEvents();

  const { tasks, customViews, loading, fetchTasks, fetchCustomViews, updateTaskStatus } =
    useTaskStore();

  const visualScenario = getVisualScenario();
  const [selectedSection, setSelectedSection] = useState<string>(() =>
    visualScenario === "calendar" ? "events" : "all",
  );
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeVaultPath, setActiveVaultPath] = useState<string>("Loading...");

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
  const [isEditingJournal, setIsEditingJournal] = useState<boolean>(false);
  const [journalInput, setJournalInput] = useState<string>("");
  const [savingJournal, setSavingJournal] = useState<boolean>(false);
  const [notesExpanded, setNotesExpanded] = useState<boolean>(false);
  const [journalsExpanded, setJournalsExpanded] = useState<boolean>(false);
  const [modalTask, setModalTask] = useState<Task | null>(null);
  const openedVisualModal = useRef(false);
  const [todayJournalContent, setTodayJournalContent] = useState<string | null>(null);
  const [todayJournalPath, setTodayJournalPath] = useState<string>("");
  const [todayJournalLoading, setTodayJournalLoading] = useState<boolean>(true);

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
        setActiveJournalPath(path);
        setJournalInput(path);
        fetchTodayJournal(path);
      })
      .catch((err) => console.error("Failed to query active journal path:", err));
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

  // Aggregate unique projects, contexts, and tags dynamically from loaded tasks
  const projects = Array.from(new Set(tasks.map((t) => t.project).filter((p): p is string => !!p)));
  const contexts = Array.from(new Set(tasks.flatMap((task) => task.contexts)));
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
      return task.contexts.includes(ctx);
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

  const handleSaveJournal = async () => {
    setSavingJournal(true);
    try {
      await setJournalConfig(journalInput.trim());
      setActiveJournalPath(journalInput.trim());
      setIsEditingJournal(false);
      await fetchJournalTree();
    } catch (e) {
      console.error("Failed to save journal config:", e);
      alert(`Error saving journal path: ${e}`);
    } finally {
      setSavingJournal(false);
    }
  };

  const handleOpenTodayJournal = async () => {
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

  const handleRenamePath = async (oldPath: string, newPath: string) => {
    try {
      await renamePath(oldPath, newPath);
      if (activeFilePath === oldPath) {
        setActiveFilePath(newPath);
      }
      await fetchDirTree();
    } catch (e) {
      console.error("Failed to rename path:", e);
      alert(`Error renaming path: ${e}`);
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

  return (
    <>
      {/* 1. SIDEBAR PANEL */}
      <SidebarNavigation
        selectedSection={selectedSection}
        activeFilePath={activeFilePath}
        customViews={customViews}
        projects={projects}
        contexts={contexts}
        tags={tags}
        onSelectSection={handleSidebarItemClick}
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
                  onClick={() => setJournalsExpanded(!journalsExpanded)}
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
                    title="Write Today's Entry"
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
                    <BookOpen size={14} />
                  </button>
                  <span
                    onClick={() => setJournalsExpanded(!journalsExpanded)}
                    style={{ fontSize: "0.7rem", color: "var(--text-muted)", cursor: "pointer" }}
                  >
                    {journalsExpanded ? "Collapse" : "Expand"}
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
          <>
            {/* Active Vault Location indicator with Inline Editor */}
            <div
              style={{
                marginTop: "auto",
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

            {/* Active Journal Location indicator with Inline Editor */}
            <div
              style={{
                marginTop: "1rem",
                borderTop: "1px solid rgba(255,255,255,0.03)",
                paddingTop: "1rem",
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
                  Active Journal Path
                </span>
                {!isEditingJournal && (
                  <button
                    onClick={() => setIsEditingJournal(true)}
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

              {isEditingJournal ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <input
                    type="text"
                    value={journalInput}
                    onChange={(e) => setJournalInput(e.target.value)}
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
                    placeholder="~/octarine_journal"
                    disabled={savingJournal}
                  />
                  <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                    <button
                      onClick={() => setIsEditingJournal(false)}
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
                      disabled={savingJournal}
                    >
                      <X size={10} /> Cancel
                    </button>
                    <button
                      onClick={handleSaveJournal}
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
                      disabled={savingJournal}
                    >
                      {savingJournal ? (
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
                  {activeJournalPath}
                </div>
              )}
            </div>
          </>
        }
      />

      {/* 2. MAIN WORKSPACE PANEL */}
      <div className="main-content">
        {modalTask && (
          <EditTaskModal
            task={modalTask}
            onClose={() => setModalTask(null)}
            onSave={async (newRawMarkdown) => {
              try {
                await updateTaskMarkdown(
                  modalTask.file_path || "",
                  modalTask.line_number,
                  tasks.find((task) => task.hash === modalTask.hash)?.raw_markdown ??
                    modalTask.raw_markdown,
                  newRawMarkdown.trim(),
                );
                await fetchTasks();
              } catch (e) {
                console.error("Failed to save full task modal:", e);
                if (isWriteConflict(e)) {
                  setModalTask(null);
                  await fetchTasks();
                }
                alert(`Error saving task: ${writeErrorMessage(e)}`);
                throw e;
              }
            }}
            onDelete={async () => {
              try {
                await deleteTaskMarkdown(
                  modalTask.file_path || "",
                  modalTask.line_number,
                  tasks.find((task) => task.hash === modalTask.hash)?.raw_markdown ??
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
        </div>

        {/* Search Inputs (only displayed in dashboard mode) */}
        {activeFilePath === null && (
          <div className="search-container">
            <Search size={18} color="#6b7280" />
            <input
              type="text"
              placeholder="Search tasks, descriptions or projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        )}

        {/* Active Loader */}
        {loading && tasks.length === 0 && <WorkspaceState kind="loading" />}

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
