import { useEffect, useState } from "react";
import { useTaskStore } from "./hooks/use-task-store";
import { useTauriEvents } from "./hooks/use-tauri-events";
import { Task, FileNode } from "./types";
import { FileTree } from "./components/FileTree";
import { MarkdownEditor } from "./components/MarkdownEditor";
import { 
  Inbox, 
  Calendar, 
  Layers, 
  Tag, 
  Hash, 
  CheckCircle2, 
  Loader2, 
  AlertCircle, 
  Search, 
  Edit2,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Clock,
  BookOpen
} from "lucide-react";
import { invoke } from "@tauri-apps/api/tauri";
import { open } from "@tauri-apps/api/shell";
import { listen } from "@tauri-apps/api/event";

function formatDueDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function getTaskContexts(rawMarkdown: string): string[] {
  if (!rawMarkdown) return [];
  const cleanText = rawMarkdown.replace(/`[^`]*`/g, "").replace(/\[[^\]]*\]\([^)]*\)/g, "").replace(/https?:\/\/[^\s]+/g, "");
  const ctxMatches = cleanText.match(/@([\p{L}\p{N}_\-/]+)/gu);
  return ctxMatches ? ctxMatches.map(c => c.slice(1)) : [];
}

function getTaskTags(rawMarkdown: string): string[] {
  if (!rawMarkdown) return [];
  const cleanText = rawMarkdown.replace(/`[^`]*`/g, "").replace(/\[[^\]]*\]\([^)]*\)/g, "").replace(/https?:\/\/[^\s]+/g, "");
  const tagMatches = cleanText.match(/#([\p{L}\p{N}_\-/]+)/gu);
  return tagMatches ? tagMatches.map(c => c.slice(1)) : [];
}

function renderTaskNotesAndSubtasks(notes: string) {
  if (!notes) return null;
  const lines = notes.split("\n");
  
  return (
    <div className="task-notes">
      {lines.map((line, idx) => {
        const subtaskMatch = line.match(/^(\s*)-\s*\[([ xX/])\]\s*(.*)$/);
        if (subtaskMatch) {
          const indent = subtaskMatch[1].length;
          const statusChar = subtaskMatch[2];
          const text = subtaskMatch[3];
          
          let statusClass = "todo";
          if (statusChar === "x" || statusChar === "X") {
            statusClass = "done";
          } else if (statusChar === "/") {
            statusClass = "doing";
          }
          
          return (
            <div 
              key={idx} 
              className={`subtask-row ${statusClass}`}
              style={{ paddingLeft: `${indent * 8}px` }}
            >
              <span className={`subtask-checkbox ${statusClass}`} />
              <span className="subtask-text">{text}</span>
            </div>
          );
        } else {
          let cleanLine = line.trim();
          if (cleanLine.startsWith("- ")) {
            cleanLine = cleanLine.slice(2);
          } else if (cleanLine.startsWith("-")) {
            cleanLine = cleanLine.slice(1);
          } else if (cleanLine.startsWith("* ")) {
            cleanLine = cleanLine.slice(2);
          } else if (cleanLine.startsWith("*")) {
            cleanLine = cleanLine.slice(1);
          }
          cleanLine = cleanLine.trim();

          if (!cleanLine) return null;

          return (
            <div key={idx} className="note-text-line">
              {cleanLine}
            </div>
          );
        }
      })}
    </div>
  );
}

export function App() {
  // Activate live Tauri event listener for real-time background watcher sync
  useTauriEvents();

  const { 
    tasks, 
    customViews, 
    loading, 
    fetchTasks, 
    fetchCustomViews, 
    updateTaskStatus 
  } = useTaskStore();

  const [selectedSection, setSelectedSection] = useState<string>("all");
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
  const [editDateInput, setEditDateInput] = useState<string>("");
  const [editTimeInput, setEditTimeInput] = useState<string>("");
  const [editDurationInput, setEditDurationInput] = useState<number>(60);

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
  const [editingTaskHash, setEditingTaskHash] = useState<string | null>(null);
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
    invoke<string>("get_vault_config")
      .then(path => {
        setActiveVaultPath(path);
        setVaultInput(path);
      })
      .catch(err => console.error("Failed to query active vault path:", err));

    // Fetch active journal path dynamically from Tauri state
    invoke<string>("get_journal_config")
      .then(path => {
        setActiveJournalPath(path);
        setJournalInput(path);
        fetchTodayJournal(path);
      })
      .catch(err => console.error("Failed to query active journal path:", err));
  }, [fetchTasks, fetchCustomViews]);

  // Listen to background watcher change events to update directories dynamically
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    const setup = async () => {
      try {
        unlistenFn = await listen("vault-changed", () => {
          console.log("Vault change event detected on frontend! Refreshing trees and today's journal...");
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

  // Aggregate unique projects, contexts, and tags dynamically from loaded tasks
  const projects = Array.from(new Set(tasks.map(t => t.project).filter((p): p is string => !!p)));
  const contexts = Array.from(new Set(tasks.flatMap(t => {
    const cleanText = t.raw_markdown.replace(/`[^`]*`/g, "").replace(/\[[^\]]*\]\([^)]*\)/g, "").replace(/https?:\/\/[^\s]+/g, "");
    const ctxMatches = cleanText.match(/@([\p{L}\p{N}_\-/]+)/gu);
    return ctxMatches ? ctxMatches.map(c => c.slice(1)) : [];
  })));
  const tags = Array.from(new Set(tasks.flatMap(t => {
    const cleanText = t.raw_markdown.replace(/`[^`]*`/g, "").replace(/\[[^\]]*\]\([^)]*\)/g, "").replace(/https?:\/\/[^\s]+/g, "");
    const tagMatches = cleanText.match(/#([\p{L}\p{N}_\-/]+)/gu);
    return tagMatches ? tagMatches.map(c => c.slice(1)) : [];
  })));

  // Cyclic checklist status toggler: todo -> doing -> done -> cancelled -> todo
  const handleCheckboxClick = async (e: React.MouseEvent, task: Task) => {
    e.stopPropagation(); // Prevent card body click handlers
    const nextStatusMap: Record<string, "todo" | "doing" | "done" | "cancelled"> = {
      todo: "doing",
      doing: "done",
      done: "cancelled",
      cancelled: "todo"
    };
    const nextStatus = nextStatusMap[task.status] || "todo";
    
    await updateTaskStatus(
      (task as any).file_path || "",
      task.line_number,
      task.hash,
      nextStatus
    );
  };

  const handleSaveTaskInlineEdit = async (task: Task, newContent: string) => {
    const trimmed = newContent.trim();
    if (trimmed === task.raw_markdown.trim()) {
      setEditingTaskHash(null);
      return;
    }

    try {
      await invoke("update_task_markdown", {
        filePath: (task as any).file_path || "",
        lineNumber: task.line_number,
        hash: task.hash,
        newRawMarkdown: trimmed
      });
      setEditingTaskHash(null);
      await fetchTasks();
    } catch (e) {
      console.error("Failed to update task inline:", e);
      alert(`Error saving task: ${e}`);
    }
  };

  // In-memory filter logic for selected sidebar items and search query
  const filteredTasks = tasks.filter(task => {
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
      return task.project === proj || (task.project !== null && task.project.startsWith(proj + "/"));
    }
    if (selectedSection.startsWith("ctx:")) {
      const ctx = selectedSection.slice("ctx:".length);
      return task.raw_markdown.includes(`@${ctx}`);
    }
    if (selectedSection.startsWith("tag:")) {
      const tag = selectedSection.slice("tag:".length);
      return task.raw_markdown.includes(`#${tag}`);
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
      const tree = await invoke<FileNode>("read_dir_tree");
      setDirTree(tree);
    } catch (e) {
      console.error("Failed to load directory tree:", e);
    }
  };

  const fetchJournalTree = async () => {
    try {
      const tree = await invoke<FileNode>("read_journal_tree");
      setJournalTree(tree);
    } catch (e) {
      console.error("Failed to load journal tree:", e);
    }
  };

  const handleSaveJournal = async () => {
    setSavingJournal(true);
    try {
      await invoke("set_journal_config", { newDir: journalInput.trim() });
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
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const todayStr = `${yyyy}-${mm}-${dd}`;
      const filePath = `${activeJournalPath}/${todayStr}.md`;

      let content = "";
      try {
        content = await invoke("read_file_content", { path: filePath });
      } catch (_) {
        // File does not exist yet, write empty string to scaffold it!
        await invoke("write_file_content", { path: filePath, content: `# 📓 Journal Entry: ${todayStr}\n\n` });
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
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const todayStr = `${yyyy}-${mm}-${dd}`;
      const filePath = `${journalPath}/${todayStr}.md`;

      let content = "";
      try {
        content = await invoke("read_file_content", { path: filePath });
      } catch (_) {
        // Silently scaffold today's journal note
        await invoke("write_file_content", { path: filePath, content: `# 📓 Journal Entry: ${todayStr}\n\n` });
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
      await invoke("write_file_content", { path: todayJournalPath, content });
      setTodayJournalContent(content);
    } catch (e) {
      console.error("Failed to save today's journal:", e);
      throw e;
    }
  };

  const handleSelectFile = async (path: string) => {
    try {
      const content = await invoke<string>("read_file_content", { path });
      setActiveFilePath(path);
      setActiveFileContent(content);
    } catch (e) {
      console.error("Failed to read file:", e);
      alert(`Error loading note: ${e}`);
    }
  };

  const handleCreateFile = async (parentPath: string, name: string) => {
    try {
      const createdPath = await invoke<string>("create_file", { parentDir: parentPath, name });
      await fetchDirTree();
      await handleSelectFile(createdPath);
    } catch (e) {
      console.error("Failed to create file:", e);
      alert(`Error creating note: ${e}`);
    }
  };

  const handleCreateFolder = async (parentPath: string, name: string) => {
    try {
      await invoke("create_directory", { parentDir: parentPath, name });
      await fetchDirTree();
    } catch (e) {
      console.error("Failed to create directory:", e);
      alert(`Error creating directory: ${e}`);
    }
  };

  const handleDeletePath = async (path: string) => {
    try {
      await invoke("delete_path", { path });
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
      await invoke("rename_path", { oldPath, newPath });
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
      await invoke("write_file_content", { path: activeFilePath, content });
      setActiveFileContent(content);
    } catch (e) {
      console.error("Failed to save note:", e);
      throw e;
    }
  };

  const renderMarkdownDescription = (text: string) => {
    if (!text) return "";
    let cleanedText = text.trim();
    if (cleanedText.startsWith("- ")) {
      cleanedText = cleanedText.slice(2);
    } else if (cleanedText.startsWith("-")) {
      cleanedText = cleanedText.slice(1);
    }
    cleanedText = cleanedText.trim();

    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    linkRegex.lastIndex = 0;
    while ((match = linkRegex.exec(cleanedText)) !== null) {
      const matchIndex = match.index;
      if (matchIndex > lastIndex) {
        parts.push(cleanedText.slice(lastIndex, matchIndex));
      }
      const anchor = match[1];
      const url = match[2];
      parts.push(
        <a 
          key={matchIndex}
          href={url} 
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            open(url).catch(err => console.error("Failed to open URL:", err));
          }}
          className="task-inline-link"
        >
          {anchor}
        </a>
      );
      lastIndex = linkRegex.lastIndex;
    }

    if (lastIndex < cleanedText.length) {
      parts.push(cleanedText.slice(lastIndex));
    }

    return parts.length > 0 ? parts : cleanedText;
  };

  // -------------------------------------------------------------
  // HIERARCHICAL PROJECTS COMPILER & RENDERER
  // -------------------------------------------------------------
  const buildProjectTree = (flatProjects: string[]) => {
    const root: Record<string, any> = {};

    for (const path of flatProjects) {
      const parts = path.split("/");
      let current = root;
      let currentPath = "";

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        if (!current[part]) {
          current[part] = {
            name: part,
            fullPath: currentPath,
            children: {}
          };
        }
        current = current[part].children;
      }
    }
    return root;
  };

  const renderProjectNode = (node: any, level: number = 0) => {
    const isSelected = selectedSection === `proj:${node.fullPath}`;
    const childKeys = Object.keys(node.children);
    const hasChildren = childKeys.length > 0;

    return (
      <div key={node.fullPath} style={{ display: "flex", flexDirection: "column" }}>
        <li 
          className={`sidebar-item ${activeFilePath === null && isSelected ? "active" : ""}`}
          onClick={() => handleSidebarItemClick(`proj:${node.fullPath}`)}
          style={{ paddingLeft: `${Math.min(level * 10 + 8, 48)}px`, fontSize: "0.82rem" }}
        >
          <span style={{ marginRight: "0.4rem", opacity: 0.6, fontSize: "0.75rem", fontFamily: "monospace" }}>+</span>
          <span>{node.name}</span>
        </li>
        {hasChildren && childKeys.map(key => renderProjectNode(node.children[key], level + 1))}
      </div>
    );
  };

  // -------------------------------------------------------------
  // CALENDAR CALCULATION ENGINE
  // -------------------------------------------------------------

  // Calculates 42 monthly cells (6 rows x 7 cols) starting from the correct Monday
  const getDaysInMonthView = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    let startDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sunday, 1 = Monday...
    let startOffset = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

    const startCellDate = new Date(firstDayOfMonth);
    startCellDate.setDate(firstDayOfMonth.getDate() - startOffset);

    const cells = [];
    for (let i = 0; i < 42; i++) {
      const cellDate = new Date(startCellDate);
      cellDate.setDate(startCellDate.getDate() + i);
      cells.push(cellDate);
    }
    return cells;
  };

  // Calculates 7 weekly cells centered around the currentDate
  const getDaysInWeekView = (date: Date) => {
    const day = date.getDay();
    let diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date);
    monday.setDate(diff);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const nextDay = new Date(monday);
      nextDay.setDate(monday.getDate() + i);
      days.push(nextDay);
    }
    return days;
  };

  const getISODateString = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const isToday = (date: Date) => {
    return getISODateString(date) === getISODateString(new Date());
  };

  const formatDayName = (date: Date) => {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  };

  const formatDayDate = (date: Date) => {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  // Recurrence Matching Engine
  const doesEventRecurOn = (event: Task, date: Date) => {
    if (!event.recurring) return false;
    const rule = event.recurring.toLowerCase().trim();
    const dayName = date.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();

    if (event.s_start) {
      const startDay = new Date(event.s_start.slice(0, 10));
      // Recurring occurrences only virtual-clone on dates equal to or after their literal start day
      if (date < startDay) return false;
    }

    if (rule === "every day") return true;
    if (rule === "every weekday") {
      const d = date.getDay();
      return d !== 0 && d !== 6;
    }
    if (rule.startsWith("every ")) {
      const targetDay = rule.slice(6).trim();
      return targetDay === dayName;
    }
    return false;
  };

  // Retrieves all literal + recurring events matching a calendar day
  const getEventsForDay = (date: Date) => {
    const isoDate = getISODateString(date);
    return tasks.filter(t => {
      if (t.task_type !== "event") return false;
      const startsOnDay = t.s_start && t.s_start.startsWith(isoDate);
      if (startsOnDay) return true;

      // Under Option C, we expand virtual occurrences if toggle is ticked
      if (showFutureRepetitions && doesEventRecurOn(t, date)) {
        return true;
      }
      return false;
    });
  };

  // Chronologically sorts events for Day Detail Drawer
  const getSortedEventsForDay = (date: Date) => {
    const dayEvents = getEventsForDay(date);
    return [...dayEvents].sort((a, b) => {
      const timeA = a.s_start && a.s_start.length > 10 ? a.s_start.slice(11, 16) : "00:00";
      const timeB = b.s_start && b.s_start.length > 10 ? b.s_start.slice(11, 16) : "00:00";
      return timeA.localeCompare(timeB);
    });
  };

  // Pagination navigation clicks
  const handlePrev = () => {
    const nextDate = new Date(currentDate);
    if (calendarViewMode === "month") {
      nextDate.setMonth(currentDate.getMonth() - 1);
    } else {
      nextDate.setDate(currentDate.getDate() - 7);
    }
    setCurrentDate(nextDate);
  };

  const handleNext = () => {
    const nextDate = new Date(currentDate);
    if (calendarViewMode === "month") {
      nextDate.setMonth(currentDate.getMonth() + 1);
    } else {
      nextDate.setDate(currentDate.getDate() + 7);
    }
    setCurrentDate(nextDate);
  };

  const getCalendarHeaderLabel = () => {
    if (calendarViewMode === "month") {
      return currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    } else {
      const days = getDaysInWeekView(currentDate);
      const startStr = days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const endStr = days[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      return `${startStr} - ${endStr}`;
    }
  };

  // Day Cell click handler
  const handleDayCellClick = (date: Date) => {
    setDrawerDate(date);
    setShowDrawer(true);
    setEditingEventHash(null); // Reset any open form
  };

  // Inline Form clicks
  const handleEditClick = (e: React.MouseEvent, event: Task) => {
    e.stopPropagation();
    setEditingEventHash(event.hash);

    const s = event.s_start || "";
    const datePart = s.length >= 10 ? s.slice(0, 10) : getISODateString(new Date());
    const timePart = s.length > 10 ? s.slice(11, 16) : "12:00";

    setEditDateInput(datePart);
    setEditTimeInput(timePart);
    setEditDurationInput(event.duration_secs ? event.duration_secs / 60 : 60);
  };

  const handleSaveSchedule = async (event: Task) => {
    try {
      const new_s_start = `${editDateInput.trim()} ${editTimeInput.trim()}`;
      const new_duration_secs = editDurationInput * 60;

      await invoke("update_event_schedule", {
        filePath: (event as any).file_path || "",
        lineNumber: event.line_number,
        hash: event.hash,
        newSStart: new_s_start,
        newDurationSecs: new_duration_secs
      });

      setEditingEventHash(null);
      fetchTasks(); // Reload local store dynamically
    } catch (e) {
      console.error("Failed to update event schedule:", e);
      alert(`Error saving schedule: ${e}`);
    }
  };

  // Config Saving Command
  const handleSaveVault = async () => {
    if (!vaultInput.trim()) return;
    setSavingVault(true);
    try {
      await invoke("set_vault_config", { newDir: vaultInput.trim() });
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
      <div className="sidebar">
        <h2>
          Octarine <span>🌌</span>
        </h2>

        <div className="sidebar-section">
          <h4>Smart Views</h4>
          <ul className="sidebar-list">
            <li 
              className={`sidebar-item ${activeFilePath === null && selectedSection === "all" ? "active" : ""}`}
              onClick={() => handleSidebarItemClick("all")}
            >
              <Inbox size={16} /> All Tasks
            </li>
            <li 
              className={`sidebar-item ${activeFilePath === null && selectedSection === "todo" ? "active" : ""}`}
              onClick={() => handleSidebarItemClick("todo")}
            >
              <CheckCircle2 size={16} color="#9ca3af" /> Not Started
            </li>
            <li 
              className={`sidebar-item ${activeFilePath === null && selectedSection === "doing" ? "active" : ""}`}
              onClick={() => handleSidebarItemClick("doing")}
            >
              <Loader2 size={16} className="animate-spin" color="#a78bfa" /> In Progress
            </li>
            <li 
              className={`sidebar-item ${activeFilePath === null && selectedSection === "events" ? "active" : ""}`}
              onClick={() => handleSidebarItemClick("events")}
            >
              <Calendar size={16} color="#818cf8" /> Schedule Events
            </li>
          </ul>
        </div>

        {/* Collapsible Journals Virtual Explorer Tree (Swapped to First!) */}
        <div className="sidebar-section">
          <div 
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}
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
                style={{ background: "none", border: "none", color: "var(--color-violet)", cursor: "pointer", display: "flex", alignItems: "center", padding: 0 }}
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
            <div style={{ marginTop: "0.5rem", maxHeight: "250px", overflowY: "auto", paddingLeft: "0.15rem" }}>
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
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", marginBottom: "0.25rem" }}
          >
            <h4 style={{ margin: 0 }}>Notes</h4>
            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
              {notesExpanded ? "Collapse" : "Expand"}
            </span>
          </div>
          {notesExpanded && (
            <div style={{ marginTop: "0.5rem", maxHeight: "250px", overflowY: "auto", paddingLeft: "0.15rem" }}>
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

        {customViews.length > 0 && (
          <div className="sidebar-section">
            <h4>Custom Query Dashboards</h4>
            <ul className="sidebar-list">
              {customViews.map(view => {
                const lines = view.query_raw.split("\n");
                const filterLine = lines.find(l => l.trim().startsWith("filter:"));
                const filterStr = filterLine ? filterLine.trim().slice("filter:".length).trim().replace(/"/g, "") : "";

                return (
                  <li 
                    key={`${view.title}-${view.line_number}`}
                    className={`sidebar-item ${activeFilePath === null && selectedSection === `view:${view.title}` ? "active" : ""}`}
                    onClick={() => handleSidebarItemClick(`view:${view.title}`, filterStr)}
                  >
                    <Layers size={16} /> {view.title}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {projects.length > 0 && (
          <div className="sidebar-section">
            <h4>Projects</h4>
            <ul className="sidebar-list">
              {Object.keys(buildProjectTree(projects)).map(key => 
                renderProjectNode(buildProjectTree(projects)[key])
              )}
            </ul>
          </div>
        )}

        {contexts.length > 0 && (
          <div className="sidebar-section">
            <h4>Contexts</h4>
            <ul className="sidebar-list">
              {contexts.map(c => (
                <li 
                  key={c}
                  className={`sidebar-item ${activeFilePath === null && selectedSection === `ctx:${c}` ? "active" : ""}`}
                  onClick={() => handleSidebarItemClick(`ctx:${c}`)}
                >
                  <Tag size={16} /> @{c}
                </li>
              ))}
            </ul>
          </div>
        )}

        {tags.length > 0 && (
          <div className="sidebar-section">
            <h4>Tags</h4>
            <ul className="sidebar-list">
              {tags.map(t => (
                <li 
                  key={t}
                  className={`sidebar-item ${activeFilePath === null && selectedSection === `tag:${t}` ? "active" : ""}`}
                  onClick={() => handleSidebarItemClick(`tag:${t}`)}
                >
                  <Hash size={16} /> #{t}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Active Vault Location indicator with Inline Editor */}
        <div style={{ marginTop: "auto", borderTop: "1px solid var(--border-card)", paddingTop: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.05em" }}>
              Active Vault Path
            </span>
            {!isEditingVault && (
              <button 
                onClick={() => setIsEditingVault(true)}
                style={{ background: "none", border: "none", color: "var(--color-violet)", cursor: "pointer", display: "flex", alignItems: "center", padding: 0 }}
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
                  fontFamily: "monospace"
                }}
                placeholder="~/octarine_vault"
                disabled={savingVault}
              />
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button 
                  onClick={() => setIsEditingVault(false)}
                  style={{ background: "rgba(255, 255, 255, 0.05)", border: "1px solid var(--border-card)", color: "var(--text-muted)", padding: "0.25rem 0.5rem", borderRadius: "4px", cursor: "pointer", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.25rem" }}
                  disabled={savingVault}
                >
                  <X size={10} /> Cancel
                </button>
                <button 
                  onClick={handleSaveVault}
                  style={{ background: "var(--color-violet)", border: "none", color: "white", padding: "0.25rem 0.5rem", borderRadius: "4px", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.25rem" }}
                  disabled={savingVault}
                >
                  {savingVault ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} Save
                </button>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", wordBreak: "break-all", fontStyle: "italic", lineHeight: 1.4 }}>
              {activeVaultPath}
            </div>
          )}
        </div>

        {/* Active Journal Location indicator with Inline Editor */}
        <div style={{ marginTop: "1rem", borderTop: "1px solid rgba(255,255,255,0.03)", paddingTop: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.05em" }}>
              Active Journal Path
            </span>
            {!isEditingJournal && (
              <button 
                onClick={() => setIsEditingJournal(true)}
                style={{ background: "none", border: "none", color: "var(--color-violet)", cursor: "pointer", display: "flex", alignItems: "center", padding: 0 }}
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
                  fontFamily: "monospace"
                }}
                placeholder="~/octarine_journal"
                disabled={savingJournal}
              />
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button 
                  onClick={() => setIsEditingJournal(false)}
                  style={{ background: "rgba(255, 255, 255, 0.05)", border: "1px solid var(--border-card)", color: "var(--text-muted)", padding: "0.25rem 0.5rem", borderRadius: "4px", cursor: "pointer", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.25rem" }}
                  disabled={savingJournal}
                >
                  <X size={10} /> Cancel
                </button>
                <button 
                  onClick={handleSaveJournal}
                  style={{ background: "var(--color-violet)", border: "none", color: "white", padding: "0.25rem 0.5rem", borderRadius: "4px", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.25rem" }}
                  disabled={savingJournal}
                >
                  {savingJournal ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} Save
                </button>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", wordBreak: "break-all", fontStyle: "italic", lineHeight: 1.4 }}>
              {activeJournalPath}
            </div>
          )}
        </div>
      </div>

      {/* 2. MAIN WORKSPACE PANEL */}
      <div className="main-content">
        <div className="main-header">
          <div className="main-title">
            <h1>
              {activeFilePath !== null && "Plaintext Note Editor"}
              {activeFilePath === null && selectedSection === "all" && "Inbox Dashboard"}
              {activeFilePath === null && selectedSection === "todo" && "Inbox: Todo"}
              {activeFilePath === null && selectedSection === "doing" && "Active Sprints"}
              {activeFilePath === null && selectedSection === "events" && "Calendar Timeline"}
              {activeFilePath === null && selectedSection.startsWith("proj:") && `Project: ${selectedSection.slice(5)}`}
              {activeFilePath === null && selectedSection.startsWith("ctx:") && `Context: @${selectedSection.slice(4)}`}
              {activeFilePath === null && selectedSection.startsWith("tag:") && `Tag: #${selectedSection.slice(4)}`}
              {activeFilePath === null && selectedSection.startsWith("view:") && `Query: ${selectedSection.slice(5)}`}
            </h1>
            <p>{activeFilePath !== null ? "Direct Markdown Editor Workspace" : "Sub-millisecond plaintext organization"}</p>
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
        {loading && tasks.length === 0 && (
          <div className="empty-state">
            <Loader2 className="empty-state-icon animate-spin" size={32} />
            <h3>Reading plaintext vault...</h3>
          </div>
        )}

        {/* Render Notes Editor Mode or Normal Task Dashboard Content */}
        {activeFilePath !== null && activeFileContent !== null ? (
          <div className="editor-canvas-column" style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%" }}>
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
          <div style={{ display: "flex", flexDirection: "column" }}>
            
            {/* Calendar Controls Panel */}
            <div className="calendar-controls">
              
              {/* Tab Toggles */}
              <div className="calendar-tabs">
                <button 
                  className={`calendar-tab-btn ${calendarViewMode === "week" ? "active" : ""}`}
                  onClick={() => setCalendarViewMode("week")}
                >
                  Week Grid
                </button>
                <button 
                  className={`calendar-tab-btn ${calendarViewMode === "month" ? "active" : ""}`}
                  onClick={() => setCalendarViewMode("month")}
                >
                  Month View
                </button>
              </div>

              {/* Navigation Pagination */}
              <div className="calendar-nav">
                <button className="calendar-nav-btn" onClick={handlePrev}>
                  <ChevronLeft size={16} />
                </button>
                <div className="calendar-current-label">
                  {getCalendarHeaderLabel()}
                </div>
                <button className="calendar-nav-btn" onClick={handleNext}>
                  <ChevronRight size={16} />
                </button>
              </div>

              {/* Recurrence Toggle */}
              <div className="calendar-toggle-section">
                <input 
                  type="checkbox" 
                  id="show-recurrence-cb"
                  className="calendar-toggle-checkbox"
                  checked={showFutureRepetitions}
                  onChange={(e) => setShowFutureRepetitions(e.target.checked)}
                />
                <label htmlFor="show-recurrence-cb">Show Future Repetitions</label>
              </div>
            </div>

            {/* Rendering active grid mode */}
            {calendarViewMode === "week" ? (
              <div className="calendar-grid">
                {getDaysInWeekView(currentDate).map(day => {
                  const isoDate = getISODateString(day);
                  const dayEvents = getSortedEventsForDay(day);

                  return (
                    <div 
                      key={isoDate} 
                      className={`calendar-column ${isToday(day) ? "today" : ""}`}
                      onClick={() => handleDayCellClick(day)}
                    >
                      <div className="calendar-column-header">
                        <div className="calendar-day-name">{formatDayName(day)}</div>
                        <div className="calendar-day-date">{formatDayDate(day)}</div>
                      </div>
                      <div className="calendar-events-list">
                        {dayEvents.length === 0 ? (
                          <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", textAlign: "center", marginTop: "1rem" }}>
                            No events
                          </div>
                        ) : (
                          dayEvents.map(event => {
                            const timePart = event.s_start && event.s_start.length > 10 ? event.s_start.slice(11) : "All Day";
                            const isRecurrent = !!event.recurring && !event.s_start?.startsWith(isoDate);
                            return (
                              <div 
                                key={`${event.hash}-${isoDate}`} 
                                className={`calendar-event-card ${isRecurrent ? "recurrent" : ""}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCheckboxClick(e, event);
                                }}
                              >
                                <div className="calendar-event-time">
                                  {timePart} {event.duration_secs ? `(${event.duration_secs / 60}m)` : ""}
                                  {isRecurrent && " 🔁"}
                                </div>
                                <div className="calendar-event-title">{event.description}</div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="month-grid">
                {getDaysInMonthView(currentDate).map((day, idx) => {
                  const isoDate = getISODateString(day);
                  const dayEvents = getSortedEventsForDay(day);
                  const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                  
                  // Smart Overflow limit of 2 items
                  const visibleEvents = dayEvents.slice(0, 2);
                  const overflowCount = dayEvents.length - visibleEvents.length;

                  return (
                    <div 
                      key={`${isoDate}-${idx}`} 
                      className={`month-cell ${isToday(day) ? "today" : ""} ${!isCurrentMonth ? "other-month" : ""}`}
                      onClick={() => handleDayCellClick(day)}
                    >
                      <div className="month-cell-header">
                        <span className="month-cell-number">{day.getDate()}</span>
                      </div>
                      
                      <div className="month-cell-events">
                        {visibleEvents.map(event => {
                          const timePart = event.s_start && event.s_start.length > 10 ? event.s_start.slice(11, 16) : "All Day";
                          const isRecurrent = !!event.recurring && !event.s_start?.startsWith(isoDate);
                          return (
                            <div 
                              key={`${event.hash}-${isoDate}`} 
                              className={`month-mini-event ${isRecurrent ? "recurrent" : ""}`}
                              title={event.description}
                            >
                              {timePart} {event.description}
                            </div>
                          );
                        })}
                        {overflowCount > 0 && (
                          <div className="month-cell-more">
                            +{overflowCount} more
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : !loading && selectedSection === "all" ? (
          <div className="unified-dashboard" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
            <div className="dashboard-grid-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
              {/* Left Column: Events (Today's Events & Future Events) */}
              <div className="dashboard-column events" style={{ display: "flex", flexDirection: "column" }}>
                <h2>Events Timeline 📅</h2>
                
                {/* Today's Events */}
                <div className="events-sub-section">
                  <h3>Today's Schedule</h3>
                  {(() => {
                    const today = new Date();
                    const todayEvents = getSortedEventsForDay(today);
                    if (todayEvents.length === 0) {
                      return <p className="no-items">No events scheduled for today.</p>;
                    }
                    return (
                      <div className="events-vertical-list">
                        {todayEvents.map(event => {
                          const timePart = event.s_start && event.s_start.length > 10 ? event.s_start.slice(11) : "All Day";
                          return (
                            <div key={event.hash} className="dashboard-event-card">
                              <span className="event-time">{timePart}</span>
                              <span className="event-desc">{event.description}</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                {/* Future Events */}
                <div className="events-sub-section" style={{ marginTop: "1.5rem" }}>
                  <h3>Upcoming Events</h3>
                  {(() => {
                    const todayStr = getISODateString(new Date());
                    const futureEvents = tasks.filter(t => t.task_type === "event" && t.s_start && t.s_start.slice(0, 10) > todayStr)
                      .sort((a, b) => (a.s_start || "").localeCompare(b.s_start || ""));
                    
                    if (futureEvents.length === 0) {
                      return <p className="no-items">No upcoming future events.</p>;
                    }
                    return (
                      <div className="events-vertical-list">
                        {futureEvents.slice(0, 5).map(event => {
                          const datePart = event.s_start ? event.s_start.slice(5, 10) : "";
                          const timePart = event.s_start && event.s_start.length > 10 ? event.s_start.slice(11) : "All Day";
                          return (
                            <div key={event.hash} className="dashboard-event-card upcoming">
                              <span className="event-date">{datePart}</span>
                              <span className="event-time">{timePart}</span>
                              <span className="event-desc">{event.description}</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Right Column: Pressing Tasks */}
              <div className="dashboard-column tasks">
                <h2>Most Pressing Tasks 🚀</h2>
                {(() => {
                  const pressingTasks = tasks.filter(t => t.task_type === "task" && (t.status === "todo" || t.status === "doing") && !t.parent_hash)
                    .sort((a, b) => {
                      const pA = a.priority === null || a.priority === undefined ? Infinity : a.priority;
                      const pB = b.priority === null || b.priority === undefined ? Infinity : b.priority;
                      return pA - pB;
                    });

                  if (pressingTasks.length === 0) {
                    return <p className="no-items">Clear Space! No active tasks found.</p>;
                  }
                  return (
                    <div className="task-list condensed">
                      {pressingTasks.slice(0, 8).map(task => {
                        const rawLines = task.raw_markdown.split("\n");
                        const hasNotes = rawLines.length > 1;
                        const notes = hasNotes ? rawLines.slice(1).join("\n") : "";
                        const isEditingThisTask = editingTaskHash === task.hash;

                        return (
                          <div 
                            key={task.hash} 
                            className={`task-card ${task.status} ${isEditingThisTask ? "editing" : ""}`}
                            onClick={() => {
                              if (!isEditingThisTask) {
                                setEditingTaskHash(task.hash);
                              }
                            }}
                          >
                          {isEditingThisTask ? (
                            <div 
                              className="task-inline-editor-container"
                              style={{ width: "100%" }}
                              onClick={(e) => e.stopPropagation()} // Ignore click propagation
                            >
                              <MarkdownEditor 
                                key={task.hash}
                                filePath={(task as any).file_path || ""}
                                initialContent={task.raw_markdown}
                                onSave={async (content) => {
                                  await handleSaveTaskInlineEdit(task, content);
                                }}
                                onClose={() => setEditingTaskHash(null)}
                                projects={projects}
                                contexts={contexts}
                                isInline={true}
                              />
                            </div>
                          ) : (
                              <>
                                <div 
                                  className={`checkbox ${task.status}`}
                                  onClick={(e) => {
                                    e.stopPropagation(); // Stop toggling editor on click!
                                    handleCheckboxClick(e, task);
                                  }}
                                >
                                  {task.status === "done" && "✓"}
                                  {task.status === "doing" && "•"}
                                  {task.status === "cancelled" && "×"}
                                </div>
                                <div className="task-details">
                                  <div className="task-header-row">
                                    <div className="task-desc">{renderMarkdownDescription(task.description)}</div>
                                    {task.due_date && (
                                      <div className="task-due-top">
                                        <Calendar size={14} className="calendar-icon-top" />
                                        <span>{formatDueDate(task.due_date)}</span>
                                      </div>
                                    )}
                                  </div>
                                  {hasNotes && renderTaskNotesAndSubtasks(notes)}
                                  {(() => {
                                    const subtasks = tasks.filter(t => t.parent_hash === task.hash);
                                    if (subtasks.length === 0) return null;
                                    return (
                                      <div className="task-subtasks-list">
                                        {subtasks.map(sub => {
                                          const isEditingThisSub = editingTaskHash === sub.hash;
                                          return (
                                            <div 
                                              key={sub.hash} 
                                              className={`subtask-item ${sub.status}`}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                if (!isEditingThisSub) {
                                                  setEditingTaskHash(sub.hash);
                                                }
                                              }}
                                            >
                                              <div 
                                                className={`subtask-checkbox-clickable ${sub.status}`}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  const statuses: ("todo" | "doing" | "done" | "cancelled")[] = ["todo", "doing", "done", "cancelled"];
                                                  const currIdx = statuses.indexOf(sub.status as any);
                                                  const nextStatus = statuses[(currIdx + 1) % statuses.length];
                                                  updateTaskStatus((sub as any).file_path || "", sub.line_number, sub.hash, nextStatus);
                                                }}
                                              >
                                                {sub.status === "done" && "✓"}
                                                {sub.status === "doing" && "•"}
                                                {sub.status === "cancelled" && "×"}
                                              </div>
                                              <div className="subtask-text-content">
                                                <span className="subtask-title">{renderMarkdownDescription(sub.description)}</span>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    );
                                  })()}
                                  <div className="metadata-container">
                                    <div className="metadata-left-badges">
                                      {task.priority !== null && task.priority !== undefined && (() => {
                                        const letter = task.priority === 1 ? "A" : task.priority === 2 ? "B" : task.priority === 3 ? "C" : task.priority === 4 ? "D" : String(task.priority);
                                        return (
                                          <span className={`badge-priority p-${letter}`}>{letter}</span>
                                        );
                                      })()}
                                      {task.project && <span className="pill project">+{task.project}</span>}
                                      {getTaskContexts(task.raw_markdown).map(ctx => (
                                        <span key={ctx} className="pill context">@{ctx}</span>
                                      ))}
                                      {getTaskTags(task.raw_markdown).map(tag => (
                                        <span key={tag} className="pill tag">#{tag}</span>
                                      ))}
                                    </div>
                                    {(() => {
                                      const subtasksCount = tasks.filter(t => t.parent_hash === task.hash).length;
                                      if (subtasksCount === 0 && !hasNotes) return null;
                                      return (
                                        <span className="subtask-counter">
                                          {subtasksCount} {subtasksCount === 1 ? "subtask" : "subtasks"}
                                        </span>
                                      );
                                    })()}
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Bottom Panel: Today's Daily Note Editor */}
            <div className="dashboard-daily-note-section" style={{ display: "flex", flexDirection: "column" }}>
              <h2 style={{ fontSize: "1.15rem", color: "var(--text-primary)", marginBottom: "1rem", fontWeight: 700, borderBottom: "1px solid var(--border-card)", paddingBottom: "0.5rem" }}>
                📓 Today's Daily Journal Note
              </h2>
              {!todayJournalLoading && todayJournalContent !== null ? (
                <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-card)", borderRadius: "8px", overflow: "hidden", minHeight: "220px" }}>
                  <MarkdownEditor 
                    key={todayJournalPath}
                    filePath={todayJournalPath}
                    initialContent={todayJournalContent}
                    onSave={handleSaveTodayJournalContent}
                    onClose={() => {}}
                    projects={projects}
                    contexts={contexts}
                  />
                </div>
              ) : (
                <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", fontStyle: "italic" }}>
                  Preparing today's daily journal entry...
                </div>
              )}
            </div>
          </div>
        ) : !loading && filteredTasks.length === 0 ? (
          <div className="empty-state">
            <AlertCircle className="empty-state-icon" size={32} />
            <h3>Clear Space</h3>
            <p>No active tasks or schedules found matching the current workspace filters.</p>
          </div>
        ) : (
          <div className="task-list">
            {(() => {
              const sortedTasks = [...filteredTasks].sort((a, b) => {
                const pA = a.priority === null || a.priority === undefined ? Infinity : a.priority;
                const pB = b.priority === null || b.priority === undefined ? Infinity : b.priority;
                return pA - pB;
              });

              return sortedTasks.map(task => {
                const rawLines = task.raw_markdown.split("\n");
                const hasNotes = rawLines.length > 1;
                const notes = hasNotes ? rawLines.slice(1).join("\n") : "";
                const isEditingThisTask = editingTaskHash === task.hash;

                return (
                  <div 
                    key={task.hash} 
                    className={`task-card ${task.status} ${isEditingThisTask ? "editing" : ""}`}
                    onClick={() => {
                      if (!isEditingThisTask) {
                        setEditingTaskHash(task.hash);
                      }
                    }}
                  >
                    {isEditingThisTask ? (
                      <div 
                        className="task-inline-editor-container"
                        style={{ width: "100%" }}
                        onClick={(e) => e.stopPropagation()} // Ignore click propagation
                      >
                        <MarkdownEditor 
                          key={task.hash}
                          filePath={(task as any).file_path || ""}
                          initialContent={task.raw_markdown}
                          onSave={async (content) => {
                            await handleSaveTaskInlineEdit(task, content);
                          }}
                          onClose={() => setEditingTaskHash(null)}
                          projects={projects}
                          contexts={contexts}
                          isInline={true}
                        />
                      </div>
                    ) : (
                      <>
                        {/* Status Indicator Checkbox */}
                        <div 
                          className={`checkbox ${task.status}`}
                          onClick={(e) => {
                            e.stopPropagation(); // Stop toggling editor on click!
                            handleCheckboxClick(e, task);
                          }}
                        >
                          {task.status === "done" && "✓"}
                          {task.status === "doing" && "•"}
                          {task.status === "cancelled" && "×"}
                        </div>

                        {/* Task details */}
                        <div className="task-details">
                          <div className="task-header-row">
                            <div className="task-desc">{renderMarkdownDescription(task.description)}</div>
                            {task.due_date && (
                              <div className="task-due-top">
                                <Calendar size={14} className="calendar-icon-top" />
                                <span>{formatDueDate(task.due_date)}</span>
                              </div>
                            )}
                          </div>
                          
                          {/* Notes block */}
                          {hasNotes && renderTaskNotesAndSubtasks(notes)}

                          {/* Nested Subtasks List */}
                          {(() => {
                            const subtasks = tasks.filter(t => t.parent_hash === task.hash);
                            if (subtasks.length === 0) return null;
                            return (
                              <div className="task-subtasks-list">
                                {subtasks.map(sub => {
                                  const isEditingThisSub = editingTaskHash === sub.hash;
                                  return (
                                    <div 
                                      key={sub.hash} 
                                      className={`subtask-item ${sub.status}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!isEditingThisSub) {
                                          setEditingTaskHash(sub.hash);
                                        }
                                      }}
                                    >
                                      <div 
                                        className={`subtask-checkbox-clickable ${sub.status}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const statuses: ("todo" | "doing" | "done" | "cancelled")[] = ["todo", "doing", "done", "cancelled"];
                                          const currIdx = statuses.indexOf(sub.status as any);
                                          const nextStatus = statuses[(currIdx + 1) % statuses.length];
                                          updateTaskStatus((sub as any).file_path || "", sub.line_number, sub.hash, nextStatus);
                                        }}
                                      >
                                        {sub.status === "done" && "✓"}
                                        {sub.status === "doing" && "•"}
                                        {sub.status === "cancelled" && "×"}
                                      </div>
                                      <div className="subtask-text-content">
                                        <span className="subtask-title">{renderMarkdownDescription(sub.description)}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}

                          {/* Metadata Badges Container */}
                          <div className="metadata-container">
                            <div className="metadata-left-badges">
                              {task.priority !== null && task.priority !== undefined && (() => {
                                const letter = task.priority === 1 ? "A" : task.priority === 2 ? "B" : task.priority === 3 ? "C" : task.priority === 4 ? "D" : String(task.priority);
                                return (
                                  <span className={`badge-priority p-${letter}`}>{letter}</span>
                                );
                              })()}
                              {task.project && (
                                <span className="pill project">+{task.project}</span>
                              )}
                              {getTaskContexts(task.raw_markdown).map(ctx => (
                                <span key={ctx} className="pill context">@{ctx}</span>
                              ))}
                              {getTaskTags(task.raw_markdown).map(tag => (
                                <span key={tag} className="pill tag">#{tag}</span>
                              ))}
                              {task.s_start && (
                                <span className="pill scheduled">s:{task.s_start}</span>
                              )}
                              {task.duration_secs && (
                                <span className="pill scheduled">dur:{task.duration_secs / 60}m</span>
                              )}
                            </div>
                            {(() => {
                              const subtasksCount = tasks.filter(t => t.parent_hash === task.hash).length;
                              if (subtasksCount === 0 && !hasNotes) return null;
                              return (
                                <span className="subtask-counter">
                                  {subtasksCount} {subtasksCount === 1 ? "subtask" : "subtasks"}
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>

      {/* 3. RIGHT DAY DETAIL DRAWER MODAL OVERLAY */}
      {showDrawer && drawerDate && (
        <div className="day-drawer-overlay" onClick={() => setShowDrawer(false)}>
          <div className="day-drawer" onClick={(e) => e.stopPropagation()}>
            
            {/* Drawer Header */}
            <div className="day-drawer-header">
              <div>
                <h3 style={{ fontSize: "1.3rem", color: "var(--text-primary)" }}>
                  {drawerDate.toLocaleDateString("en-US", { weekday: "long" })}
                </h3>
                <span style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>
                  {drawerDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </span>
              </div>
              <button className="day-drawer-close" onClick={() => setShowDrawer(false)}>
                <X size={20} />
              </button>
            </div>

            {/* Drawer Event List */}
            <div className="day-drawer-events-list">
              {getSortedEventsForDay(drawerDate).length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100px", color: "var(--text-muted)", gap: "0.5rem" }}>
                  <AlertCircle size={24} />
                  <span>No events scheduled</span>
                </div>
              ) : (
                getSortedEventsForDay(drawerDate).map(event => {
                  const timePart = event.s_start && event.s_start.length > 10 ? event.s_start.slice(11, 16) : "All Day";
                  const isEditing = editingEventHash === event.hash;

                  return (
                    <div key={event.hash} className="drawer-event-card">
                      <div className="drawer-event-header">
                        <div>
                          <span className="drawer-event-time">
                            <Clock size={12} style={{ display: "inline", marginRight: "0.25rem", verticalAlign: "middle" }} />
                            {timePart} {event.duration_secs ? `(${event.duration_secs / 60}m)` : ""}
                          </span>
                          <div className="drawer-event-desc">{event.description}</div>
                        </div>
                        {!isEditing && (
                          <button 
                            className="drawer-event-edit-btn"
                            onClick={(e) => handleEditClick(e, event)}
                            title="Reschedule event"
                          >
                            <Edit2 size={14} />
                          </button>
                        )}
                      </div>

                      {/* Notes/Recurring rules indicators */}
                      {event.recurring && (
                        <div style={{ fontSize: "0.8rem", color: "var(--color-violet)", fontWeight: 500, marginTop: "0.25rem" }}>
                          🔁 Recurs: {event.recurring}
                        </div>
                      )}

                      {/* Inline reschedule form popover */}
                      {isEditing && (
                        <div className="edit-schedule-popover">
                          
                          <div className="edit-popover-field">
                            <label>Date</label>
                            <input 
                              type="date"
                              className="edit-popover-input"
                              value={editDateInput}
                              onChange={(e) => setEditDateInput(e.target.value)}
                            />
                          </div>

                          <div className="edit-popover-field">
                            <label>Start Time</label>
                            <input 
                              type="time"
                              className="edit-popover-input"
                              value={editTimeInput}
                              onChange={(e) => setEditTimeInput(e.target.value)}
                            />
                          </div>

                          <div className="edit-popover-field">
                            <label>Duration (minutes)</label>
                            <input 
                              type="number"
                              className="edit-popover-input"
                              value={editDurationInput}
                              onChange={(e) => setEditDurationInput(parseInt(e.target.value) || 0)}
                              min={0}
                            />
                          </div>

                          <div className="edit-popover-actions">
                            <button 
                              className="calendar-tab-btn" 
                              style={{ border: "1px solid var(--border-card)" }}
                              onClick={() => setEditingEventHash(null)}
                            >
                              Cancel
                            </button>
                            <button 
                              className="calendar-tab-btn active"
                              onClick={() => handleSaveSchedule(event)}
                            >
                              Save Changes
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

          </div>
        </div>
      )}
    </>
  );
}
