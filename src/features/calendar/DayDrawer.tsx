import { AlertCircle, Clock, Edit2, X } from "lucide-react";
import type { Task } from "../../types";

export interface ScheduleDraft {
  date: string;
  time: string;
  durationMinutes: number;
}

interface DayDrawerProps {
  date: Date;
  events: Task[];
  editingEventHash: string | null;
  draft: ScheduleDraft;
  onClose: () => void;
  onEditStart: (event: Task) => void;
  onDraftChange: (draft: ScheduleDraft) => void;
  onCancelEdit: () => void;
  onSaveSchedule: (event: Task) => void;
}

function eventTime(event: Task) {
  return event.s_start && event.s_start.length > 10 ? event.s_start.slice(11, 16) : "All Day";
}

export function DayDrawer({
  date,
  events,
  editingEventHash,
  draft,
  onClose,
  onEditStart,
  onDraftChange,
  onCancelEdit,
  onSaveSchedule,
}: DayDrawerProps) {
  return (
    <div className="day-drawer-overlay" onClick={onClose}>
      <aside
        aria-label="Day details"
        className="day-drawer"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="day-drawer-header">
          <div>
            <h3 style={{ fontSize: "1.3rem", color: "var(--text-primary)" }}>
              {date.toLocaleDateString("en-US", { weekday: "long" })}
            </h3>
            <span style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>
              {date.toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
          <button className="day-drawer-close" onClick={onClose} aria-label="Close day details">
            <X size={20} />
          </button>
        </div>

        <div className="day-drawer-events-list">
          {events.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100px",
                color: "var(--text-muted)",
                gap: "0.5rem",
              }}
            >
              <AlertCircle size={24} />
              <span>No events scheduled</span>
            </div>
          ) : (
            events.map((event) => {
              const isEditing = editingEventHash === event.hash;
              return (
                <div key={event.hash} className="drawer-event-card">
                  <div className="drawer-event-header">
                    <div>
                      <span className="drawer-event-time">
                        <Clock
                          size={12}
                          style={{
                            display: "inline",
                            marginRight: "0.25rem",
                            verticalAlign: "middle",
                          }}
                        />
                        {eventTime(event)}{" "}
                        {event.duration_secs ? `(${event.duration_secs / 60}m)` : ""}
                      </span>
                      <div className="drawer-event-desc">{event.description}</div>
                    </div>
                    {!isEditing && (
                      <button
                        className="drawer-event-edit-btn"
                        onClick={() => onEditStart(event)}
                        title="Reschedule event"
                        aria-label={`Reschedule ${event.description}`}
                      >
                        <Edit2 size={14} />
                      </button>
                    )}
                  </div>

                  {event.recurring && (
                    <div
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--color-violet)",
                        fontWeight: 500,
                        marginTop: "0.25rem",
                      }}
                    >
                      🔁 Recurs: {event.recurring}
                    </div>
                  )}

                  {isEditing && (
                    <div className="edit-schedule-popover">
                      <label className="edit-popover-field">
                        Date
                        <input
                          type="date"
                          className="edit-popover-input"
                          value={draft.date}
                          onChange={(input) =>
                            onDraftChange({ ...draft, date: input.target.value })
                          }
                        />
                      </label>
                      <label className="edit-popover-field">
                        Start Time
                        <input
                          type="time"
                          className="edit-popover-input"
                          value={draft.time}
                          onChange={(input) =>
                            onDraftChange({ ...draft, time: input.target.value })
                          }
                        />
                      </label>
                      <label className="edit-popover-field">
                        Duration (minutes)
                        <input
                          type="number"
                          className="edit-popover-input"
                          value={draft.durationMinutes}
                          onChange={(input) =>
                            onDraftChange({
                              ...draft,
                              durationMinutes: Number.parseInt(input.target.value, 10) || 0,
                            })
                          }
                          min={0}
                        />
                      </label>

                      <div className="edit-popover-actions">
                        <button
                          className="calendar-tab-btn"
                          style={{ border: "1px solid var(--border-card)" }}
                          onClick={onCancelEdit}
                        >
                          Cancel
                        </button>
                        <button
                          className="calendar-tab-btn active"
                          onClick={() => onSaveSchedule(event)}
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
      </aside>
    </div>
  );
}
