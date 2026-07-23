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
  Camera 
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
  const [captureStatus, setCaptureStatus] = useState<string | null>(null);

  // Initial Boot Fetch
  useEffect(() => {
    fetchTasks();
    fetchCustomViews();
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

  // Perform screenshot capture (triggers the qa-vision capture loop)
  const triggerAppCapture = async () => {
    setCaptureStatus("Capturing...");
    try {
      const result = await invoke<string>("capture_app_window");
      setCaptureStatus("Captured!");
      setTimeout(() => setCaptureStatus(null), 3000);
      console.log(result);
    } catch (e) {
      setCaptureStatus("Error!");
      setTimeout(() => setCaptureStatus(null), 3000);
      console.error("QA capture failed:", e);
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

  // Helper to extract days of current week (Monday to Sunday)
  const getDaysOfWeek = () => {
    const today = new Date();
    const day = today.getDay();
    // Adjust so week starts on Monday
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(today.setDate(diff));
    
    const days = [];
    for (let i = 0; i < 7; i++) {
      const nextDay = new Date(monday);
      nextDay.setDate(monday.getDate() + i);
      days.push(nextDay);
    }
    return days;
  };

  const daysOfWeek = getDaysOfWeek();
  const formatDayName = (date: Date) => {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  };
  const formatDayDate = (date: Date) => {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  const getISODateString = (date: Date) => {
    return date.toISOString().split("T")[0]; // "YYYY-MM-DD"
  };
  const isToday = (date: Date) => {
    const today = new Date();
    return getISODateString(date) === getISODateString(today);
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

          {/* QA-Vision Capture trigger Button */}
          <button className="dev-capture-btn" onClick={triggerAppCapture}>
            <Camera size={16} />
            {captureStatus || "Capture View"}
          </button>
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

        {/* Calendar Weekly Grid or Task List Render container */}
        {!loading && selectedSection === "events" ? (
          <div className="calendar-grid">
            {daysOfWeek.map(day => {
              const isoDate = getISODateString(day);
              const dayEvents = tasks.filter(t => 
                t.task_type === "event" && 
                t.s_start && 
                t.s_start.startsWith(isoDate)
              );

              return (
                <div key={isoDate} className={`calendar-column ${isToday(day) ? "today" : ""}`}>
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
                        return (
                          <div 
                            key={event.hash} 
                            className="calendar-event-card"
                            onClick={(e) => handleCheckboxClick(e, event)}
                          >
                            <div className="calendar-event-time">
                              {timePart} {event.duration_secs ? `(${event.duration_secs / 60}m)` : ""}
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
    </>
  );
}
