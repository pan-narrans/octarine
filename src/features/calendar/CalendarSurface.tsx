import { ChevronLeft, ChevronRight } from "lucide-react";
import type { KeyboardEvent } from "react";
import type { Task } from "../../types";
import { calendarDateKey, getCalendarEvents } from "./calendar-utils";

export type CalendarView = "week" | "month";

interface CalendarSurfaceProps {
  tasks: Task[];
  currentDate: Date;
  view: CalendarView;
  showFutureRepetitions: boolean;
  onViewChange: (view: CalendarView) => void;
  onPrevious: () => void;
  onNext: () => void;
  onShowFutureRepetitionsChange: (value: boolean) => void;
  onDayOpen: (date: Date) => void;
  onEventActivate?: (task: Task) => void;
}

function daysForView(date: Date, view: CalendarView) {
  const start = new Date(date);
  if (view === "week") {
    start.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }
  start.setDate(1);
  start.setDate(1 - ((start.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function eventTime(event: Task) {
  return event.s_start && event.s_start.length > 10 ? event.s_start.slice(11, 16) : "All day";
}

function isToday(day: Date) {
  return calendarDateKey(day) === calendarDateKey(new Date());
}

export function CalendarSurface({
  tasks,
  currentDate,
  view,
  showFutureRepetitions,
  onViewChange,
  onPrevious,
  onNext,
  onShowFutureRepetitionsChange,
  onDayOpen,
  onEventActivate,
}: CalendarSurfaceProps) {
  const days = daysForView(currentDate, view);
  const label =
    view === "month"
      ? currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : `${days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${days[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  const eventsFor = (day: Date) => getCalendarEvents(tasks, day, showFutureRepetitions);
  const openDayFromKeyboard = (event: KeyboardEvent<HTMLDivElement>, day: Date) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onDayOpen(day);
    }
  };

  return (
    <div className="calendar-surface">
      <div className="calendar-controls">
        <div className="calendar-tabs">
          <button
            className={`calendar-tab-btn ${view === "week" ? "active" : ""}`}
            onClick={() => onViewChange("week")}
          >
            Week Grid
          </button>
          <button
            className={`calendar-tab-btn ${view === "month" ? "active" : ""}`}
            onClick={() => onViewChange("month")}
          >
            Month View
          </button>
        </div>
        <div className="calendar-nav">
          <button className="calendar-nav-btn" onClick={onPrevious}>
            <ChevronLeft size={16} />
          </button>
          <div className="calendar-current-label">{label}</div>
          <button className="calendar-nav-btn" onClick={onNext}>
            <ChevronRight size={16} />
          </button>
        </div>
        <label className="calendar-toggle-section">
          <input
            type="checkbox"
            className="calendar-toggle-checkbox"
            checked={showFutureRepetitions}
            onChange={(event) => onShowFutureRepetitionsChange(event.target.checked)}
          />
          Show Future Repetitions
        </label>
      </div>
      <div className="calendar-grid-scroll">
        <div className={view === "week" ? "calendar-grid" : "month-grid"}>
          {days.map((day) => {
            const events = eventsFor(day);
            return (
              <div
                key={calendarDateKey(day)}
                className={
                  view === "week"
                    ? `calendar-column ${isToday(day) ? "today" : ""}`
                    : `month-cell ${isToday(day) ? "today" : ""} ${day.getMonth() !== currentDate.getMonth() ? "other-month" : ""}`
                }
                role="button"
                tabIndex={0}
                onClick={() => onDayOpen(day)}
                onKeyDown={(event) => openDayFromKeyboard(event, day)}
              >
                {view === "week" ? (
                  <>
                    <div className="calendar-column-header">
                      <div className="calendar-day-name">
                        {day.toLocaleDateString("en-US", { weekday: "short" })}
                      </div>
                      <div className="calendar-day-date">
                        {day.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </div>
                    </div>
                    <div className="calendar-events-list">
                      {events.length === 0 ? (
                        <div className="calendar-empty-day">No events</div>
                      ) : (
                        events.map((event) => {
                          const recurrent = Boolean(
                            event.recurring && !event.s_start?.startsWith(calendarDateKey(day)),
                          );
                          return (
                            <button
                              key={`${event.hash}-${calendarDateKey(day)}`}
                              type="button"
                              className={`calendar-event-card ${recurrent ? "recurrent" : ""}`}
                              onClick={(clickEvent) => {
                                clickEvent.stopPropagation();
                                onEventActivate?.(event);
                              }}
                            >
                              <div className="calendar-event-time">
                                {eventTime(event)}{" "}
                                {event.duration_secs ? `(${event.duration_secs / 60}m)` : ""}
                                {recurrent && " 🔁"}
                              </div>
                              <div className="calendar-event-title">{event.description}</div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="month-cell-header">
                      <span className="month-cell-number">{day.getDate()}</span>
                    </div>
                    <div className="month-cell-events">
                      {events.slice(0, 2).map((event) => {
                        const recurrent = Boolean(
                          event.recurring && !event.s_start?.startsWith(calendarDateKey(day)),
                        );
                        return (
                          <div
                            key={`${event.hash}-${calendarDateKey(day)}`}
                            className={`month-mini-event ${recurrent ? "recurrent" : ""}`}
                            title={event.description}
                          >
                            {eventTime(event)} {event.description}
                          </div>
                        );
                      })}
                      {events.length > 2 && (
                        <div className="month-cell-more">+{events.length - 2} more</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
