import type { Task } from "../../types";

export function calendarDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function eventTime(event: Task) {
  return event.s_start && event.s_start.length > 10 ? event.s_start.slice(11, 16) : "00:00";
}

function occursOn(event: Task, day: Date) {
  if (!event.recurring) return false;
  if (event.s_start && day < new Date(event.s_start.slice(0, 10))) return false;

  const rule = event.recurring.toLowerCase().trim();
  if (rule === "every day") return true;
  if (rule === "every weekday") return day.getDay() !== 0 && day.getDay() !== 6;
  if (rule.startsWith("every ")) {
    const weekday = day.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
    return rule.slice(6).trim() === weekday;
  }
  return false;
}

export function getCalendarEvents(tasks: Task[], day: Date, showFutureRepetitions: boolean) {
  const dateKey = calendarDateKey(day);
  return tasks
    .filter((task) => {
      if (task.task_type !== "event") return false;
      return task.s_start?.startsWith(dateKey) || (showFutureRepetitions && occursOn(task, day));
    })
    .sort((first, second) => eventTime(first).localeCompare(eventTime(second)));
}
