import { MarkdownEditor } from "../../components/MarkdownEditor";
import type { Task } from "../../types";
import { TaskCard } from "../tasks/TaskCard";

interface DashboardProps {
  tasks: Task[];
  projects: string[];
  contexts: string[];
  journalContent: string | null;
  journalPath: string;
  journalLoading: boolean;
  onSaveJournal: (content: string) => Promise<void>;
  onOpenTask: (task: Task) => void;
  onStatusChange: (task: Task, status: Task["status"]) => void;
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function eventTime(event: Task) {
  return event.s_start && event.s_start.length > 10 ? event.s_start.slice(11) : "All Day";
}

export function Dashboard({
  tasks,
  projects,
  contexts,
  journalContent,
  journalPath,
  journalLoading,
  onSaveJournal,
  onOpenTask,
  onStatusChange,
}: DashboardProps) {
  const today = new Date();
  const todayKey = isoDate(today);
  const todayEvents = tasks
    .filter((task) => task.task_type === "event" && task.s_start?.startsWith(todayKey))
    .sort((a, b) => (a.s_start || "").localeCompare(b.s_start || ""));
  const futureEvents = tasks
    .filter(
      (task) => task.task_type === "event" && task.s_start && task.s_start.slice(0, 10) > todayKey,
    )
    .sort((a, b) => (a.s_start || "").localeCompare(b.s_start || ""));
  const pressingTasks = tasks
    .filter(
      (task) =>
        task.task_type === "task" &&
        (task.status === "todo" || task.status === "doing") &&
        !task.parent_hash,
    )
    .sort((a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity));

  return (
    <div
      className="unified-dashboard"
      style={{ display: "flex", flexDirection: "column", gap: "2rem" }}
    >
      <div className="dashboard-grid-row">
        <section
          className="dashboard-column events"
          style={{ display: "flex", flexDirection: "column" }}
        >
          <h2>Events Timeline 📅</h2>
          <div className="events-sub-section">
            <h3>Today's Schedule</h3>
            {todayEvents.length === 0 ? (
              <p className="no-items">No events scheduled for today.</p>
            ) : (
              <div className="events-vertical-list">
                {todayEvents.map((event) => (
                  <div key={event.hash} className="dashboard-event-card">
                    <span className="event-time">{eventTime(event)}</span>
                    <span className="event-desc">{event.description}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="events-sub-section upcoming-events">
            <h3>Upcoming Events</h3>
            {futureEvents.length === 0 ? (
              <p className="no-items">No upcoming future events.</p>
            ) : (
              <div className="events-vertical-list">
                {futureEvents.slice(0, 5).map((event) => (
                  <div key={event.hash} className="dashboard-event-card upcoming">
                    <span className="event-date">{event.s_start?.slice(5, 10)}</span>
                    <span className="event-time">{eventTime(event)}</span>
                    <span className="event-desc">{event.description}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="dashboard-column tasks">
          <h2>Most Pressing Tasks 🚀</h2>
          {pressingTasks.length === 0 ? (
            <p className="no-items">Clear Space! No active tasks found.</p>
          ) : (
            <div className="task-list condensed">
              {pressingTasks.slice(0, 8).map((task) => (
                <TaskCard
                  key={task.hash}
                  task={task}
                  tasks={tasks}
                  onOpen={onOpenTask}
                  onStatusChange={onStatusChange}
                  showScheduleMetadata={false}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <section
        className="dashboard-daily-note-section"
        style={{ display: "flex", flexDirection: "column" }}
      >
        <h2 className="dashboard-daily-note-title">📓 Today's Daily Journal Note</h2>
        {!journalLoading && journalContent !== null ? (
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-card)",
              borderRadius: "8px",
              overflow: "hidden",
              minHeight: "220px",
            }}
          >
            <MarkdownEditor
              key={journalPath}
              filePath={journalPath}
              initialContent={journalContent}
              onSave={onSaveJournal}
              onClose={() => undefined}
              projects={projects}
              contexts={contexts}
            />
          </div>
        ) : (
          <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", fontStyle: "italic" }}>
            Preparing today's daily journal entry...
          </div>
        )}
      </section>
    </div>
  );
}
