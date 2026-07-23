import { useEffect, useState } from "react";
import { useTaskStore } from "./hooks/use-task-store";
import { useTauriEvents } from "./hooks/use-tauri-events";
import { Task } from "./types";
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
  Clock
} from "lucide-react";
import { invoke } from "@tauri-apps/api/tauri";

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

  // Initial Boot Fetch & Config Query
  useEffect(() => {
    fetchTasks();
    fetchCustomViews();
    
    // Fetch active vault path dynamically from Tauri state
    invoke<string>("get_vault_config")
      .then(path => {
        setActiveVaultPath(path);
        setVaultInput(path);
      })
      .catch(err => console.error("Failed to query active vault path:", err));
  }, [fetchTasks, fetchCustomViews]);

  // Aggregate unique projects, contexts, and tags dynamically from loaded tasks
  const projects = Array.from(new Set(tasks.map(t => t.project).filter((p): p is string => !!p)));
  const contexts = Array.from(new Set(tasks.flatMap(t => {
    const ctxMatches = t.raw_markdown.match(/@([a-zA-Z0-9_\-/]+)/g);
    return ctxMatches ? ctxMatches.map(c => c.slice(1)) : [];
  })));
  const tags = Array.from(new Set(tasks.flatMap(t => {
    const tagMatches = t.raw_markdown.match(/#([a-zA-Z0-9_\-/]+)/g);
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

  // In-memory filter logic for selected sidebar items and search query
  const filteredTasks = tasks.filter(task => {
    // 1. Search Query Filter
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      const matchDesc = task.description.toLowerCase().includes(q);
      const matchProj = task.project?.toLowerCase().includes(q) || false;
      if (!matchDesc && !matchProj) return false;
    }

    // 2. Sidebar Scoped Filter
    if (selectedSection === "all") return true;
    if (selectedSection === "todo") return task.status === "todo";
    if (selectedSection === "doing") return task.status === "doing";
    if (selectedSection === "done") return task.status === "done";
    if (selectedSection === "events") return task.task_type === "event";
    
    if (selectedSection.startsWith("proj:")) {
      const proj = selectedSection.slice("proj:".length);
      return task.project === proj;
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
    setSelectedSection(section);
    if (section.startsWith("view:") && filterStr) {
      fetchTasks(filterStr);
    } else {
      fetchTasks();
    }
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
              className={`sidebar-item ${selectedSection === "all" ? "active" : ""}`}
              onClick={() => handleSidebarItemClick("all")}
            >
              <Inbox size={16} /> All Tasks
            </li>
            <li 
              className={`sidebar-item ${selectedSection === "todo" ? "active" : ""}`}
              onClick={() => handleSidebarItemClick("todo")}
            >
              <CheckCircle2 size={16} color="#9ca3af" /> Not Started
            </li>
            <li 
              className={`sidebar-item ${selectedSection === "doing" ? "active" : ""}`}
              onClick={() => handleSidebarItemClick("doing")}
            >
              <Loader2 size={16} className="animate-spin" color="#a78bfa" /> In Progress
            </li>
            <li 
              className={`sidebar-item ${selectedSection === "events" ? "active" : ""}`}
              onClick={() => handleSidebarItemClick("events")}
            >
              <Calendar size={16} color="#818cf8" /> Schedule Events
            </li>
          </ul>
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
                    className={`sidebar-item ${selectedSection === `view:${view.title}` ? "active" : ""}`}
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
              {projects.map(p => (
                <li 
                  key={p}
                  className={`sidebar-item ${selectedSection === `proj:${p}` ? "active" : ""}`}
                  onClick={() => handleSidebarItemClick(`proj:${p}`)}
                >
                  <Hash size={16} /> {p}
                </li>
              ))}
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
                  className={`sidebar-item ${selectedSection === `ctx:${c}` ? "active" : ""}`}
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
                  className={`sidebar-item ${selectedSection === `tag:${t}` ? "active" : ""}`}
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
      </div>

      {/* 2. MAIN WORKSPACE PANEL */}
      <div className="main-content">
        <div className="main-header">
          <div className="main-title">
            <h1>
              {selectedSection === "all" && "Inbox Dashboard"}
              {selectedSection === "todo" && "Inbox: Todo"}
              {selectedSection === "doing" && "Active Sprints"}
              {selectedSection === "events" && "Calendar Timeline"}
              {selectedSection.startsWith("proj:") && `Project: ${selectedSection.slice(5)}`}
              {selectedSection.startsWith("ctx:") && `Context: @${selectedSection.slice(4)}`}
              {selectedSection.startsWith("tag:") && `Tag: #${selectedSection.slice(4)}`}
              {selectedSection.startsWith("view:") && `Query: ${selectedSection.slice(5)}`}
            </h1>
            <p>Sub-millisecond plaintext organization</p>
          </div>
        </div>

        {/* Search Inputs */}
        <div className="search-container">
          <Search size={18} color="#6b7280" />
          <input 
            type="text" 
            placeholder="Search tasks, descriptions or projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Active Loader */}
        {loading && tasks.length === 0 && (
          <div className="empty-state">
            <Loader2 className="empty-state-icon animate-spin" size={32} />
            <h3>Reading plaintext vault...</h3>
          </div>
        )}

        {/* Calendar Scheduler View */}
        {!loading && selectedSection === "events" ? (
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
        ) : !loading && filteredTasks.length === 0 ? (
          <div className="empty-state">
            <AlertCircle className="empty-state-icon" size={32} />
            <h3>Clear Space</h3>
            <p>No active tasks or schedules found matching the current workspace filters.</p>
          </div>
        ) : (
          <div className="task-list">
            {filteredTasks.map(task => {
              const rawLines = task.raw_markdown.split("\n");
              const hasNotes = rawLines.length > 1;
              const notes = hasNotes ? rawLines.slice(1).join("\n") : "";

              return (
                <div 
                  key={task.hash} 
                  className={`task-card ${task.status}`}
                  onClick={(e) => handleCheckboxClick(e, task)}
                >
                  {/* Status Indicator Checkbox */}
                  <div 
                    className={`checkbox ${task.status}`}
                    onClick={(e) => handleCheckboxClick(e, task)}
                  >
                    {task.status === "done" && "✓"}
                    {task.status === "doing" && "•"}
                    {task.status === "cancelled" && "×"}
                  </div>

                  {/* Task details */}
                  <div className="task-details">
                    <div className="task-desc">{task.description}</div>
                    
                    {/* Notes block */}
                    {hasNotes && (
                      <div className="task-notes">{notes}</div>
                    )}

                    {/* Metadata Badges Container */}
                    <div className="metadata-container">
                      {task.project && (
                        <span className="pill project">+{task.project}</span>
                      )}
                      {task.due_date && (
                        <span className="pill due">due:{task.due_date}</span>
                      )}
                      {task.s_start && (
                        <span className="pill scheduled">s:{task.s_start}</span>
                      )}
                      {task.duration_secs && (
                        <span className="pill scheduled">dur:{task.duration_secs / 60}m</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
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
