import type { KeyboardEvent, MouseEvent } from "react";
import { Calendar, CheckCircle2 } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { MetadataPill, PriorityBadge, StatusControl } from "../../design-system/controls";
import type { Task } from "../../types";

interface TaskCardProps {
  task: Task;
  tasks: Task[];
  onOpen: (task: Task) => void;
  onStatusChange: (task: Task, status: Task["status"]) => void;
  showScheduleMetadata?: boolean;
  showStatusControl?: boolean;
  showDoneLabel?: boolean;
  showContexts?: boolean;
  projectLabel?: string | null;
}

function formatDueDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      return new Date(year, month, day).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function getTaskDoneDate(rawMarkdown: string): string | null {
  if (!rawMarkdown) return null;
  const firstLine = rawMarkdown.split("\n")[0];
  return firstLine.match(/\bdone:(\d{4}-\d{2}-\d{2})\b/)?.[1] ?? null;
}

function cleanDescription(text: string): string {
  const trimmed = text.trim();
  return (
    trimmed.startsWith("- ")
      ? trimmed.slice(2)
      : trimmed.startsWith("-")
        ? trimmed.slice(1)
        : trimmed
  ).trim();
}

function renderMarkdownDescription(text: string) {
  const cleanedText = cleanDescription(text);
  if (!cleanedText) return "";

  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = linkRegex.exec(cleanedText)) !== null) {
    if (match.index > lastIndex) parts.push(cleanedText.slice(lastIndex, match.index));
    const matchIndex = match.index;
    const anchor = match[1];
    const url = match[2];
    parts.push(
      <a
        key={matchIndex}
        href={url}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          openUrl(url).catch((error) => console.error("Failed to open URL:", error));
        }}
        className="task-inline-link"
      >
        {anchor}
      </a>,
    );
    lastIndex = linkRegex.lastIndex;
  }

  if (lastIndex < cleanedText.length) parts.push(cleanedText.slice(lastIndex));
  return parts.length > 0 ? parts : cleanedText;
}

function renderTaskNotesAndSubtasks(notes: string) {
  if (!notes) return null;

  return (
    <div className="task-notes">
      {notes.split("\n").map((line, index) => {
        const subtaskMatch = line.match(/^(\s*)-\s*\[([ xX/>-])\]\s*(.*)$/);
        if (subtaskMatch) {
          const statusClass =
            subtaskMatch[2] === "x" || subtaskMatch[2] === "X"
              ? "done"
              : subtaskMatch[2] === "/"
                ? "doing"
                : subtaskMatch[2] === ">"
                  ? "deferred"
                  : subtaskMatch[2] === "-"
                    ? "cancelled"
                    : "todo";
          return (
            <div
              key={index}
              className={`subtask-row ${statusClass}`}
              style={{ paddingLeft: `${subtaskMatch[1].length * 8}px` }}
            >
              <span className={`subtask-checkbox ${statusClass}`} />
              <span className="subtask-text">{subtaskMatch[3]}</span>
            </div>
          );
        }

        const cleanLine = line
          .trim()
          .replace(/^[-*]\s*/, "")
          .trim();
        return cleanLine ? (
          <div key={index} className="note-text-line">
            {cleanLine}
          </div>
        ) : null;
      })}
    </div>
  );
}

function nextTaskStatus(status: Task["status"]): Task["status"] {
  const nextStatus: Record<Task["status"], Task["status"]> = {
    todo: "doing",
    doing: "done",
    deferred: "todo",
    done: "cancelled",
    cancelled: "todo",
  };
  return nextStatus[status];
}

export function TaskCard({
  task,
  tasks,
  onOpen,
  onStatusChange,
  showScheduleMetadata = true,
  showStatusControl = true,
  showDoneLabel = true,
  showContexts = true,
  projectLabel,
}: TaskCardProps) {
  const rawLines = task.raw_markdown.split("\n");
  const hasNotes = rawLines.length > 1;
  const notes = hasNotes ? rawLines.slice(1).join("\n") : "";
  const subtasks = tasks.filter((candidate) => candidate.parent_hash === task.hash);
  const doneDate = getTaskDoneDate(task.raw_markdown);
  const description = cleanDescription(task.description) || "Untitled task";

  const openFromKeyboard = (event: KeyboardEvent<HTMLElement>, selectedTask: Task) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    onOpen(selectedTask);
  };

  const changeStatus = (event: MouseEvent<HTMLElement>, selectedTask: Task) => {
    event.stopPropagation();
    onStatusChange(selectedTask, nextTaskStatus(selectedTask.status));
  };

  const changeStatusFromKeyboard = (event: KeyboardEvent<HTMLElement>, selectedTask: Task) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    onStatusChange(selectedTask, nextTaskStatus(selectedTask.status));
  };

  return (
    <div
      className={`task-card ${task.status}`}
      role="button"
      tabIndex={0}
      aria-label={`Edit task: ${description}`}
      onClick={() => onOpen(task)}
      onKeyDown={(event) => openFromKeyboard(event, task)}
    >
      {showStatusControl && (
        <StatusControl
          status={task.status}
          label={`Change status for ${description}`}
          onClick={(event) => changeStatus(event, task)}
          onKeyDown={(event) => changeStatusFromKeyboard(event, task)}
        />
      )}

      <div className="task-details">
        <div className="task-header-row">
          <div className="task-desc">{renderMarkdownDescription(task.description)}</div>
          {(task.due_date || doneDate) && (
            <div className="task-dates-container">
              {task.due_date && (
                <div className="task-due-top">
                  <Calendar size={14} className="calendar-icon-top" />
                  <span>{formatDueDate(task.due_date)}</span>
                </div>
              )}
              {doneDate && (
                <div className="task-done-top">
                  <CheckCircle2 size={14} className="done-icon-top" />
                  <span>
                    {showDoneLabel ? "Done " : ""}
                    {formatDueDate(doneDate)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {hasNotes && renderTaskNotesAndSubtasks(notes)}

        {subtasks.length > 0 && (
          <div className="task-subtasks-list">
            {subtasks.map((subtask) => {
              const subtaskDescription =
                cleanDescription(subtask.description) || "Untitled subtask";
              return (
                <div
                  key={subtask.hash}
                  className={`subtask-item ${subtask.status}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Edit task: ${subtaskDescription}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpen(subtask);
                  }}
                  onKeyDown={(event) => openFromKeyboard(event, subtask)}
                >
                  <StatusControl
                    baseClass="subtask-checkbox-clickable"
                    status={subtask.status}
                    label={`Change status for ${subtaskDescription}`}
                    onClick={(event) => changeStatus(event, subtask)}
                    onKeyDown={(event) => changeStatusFromKeyboard(event, subtask)}
                  />
                  <div className="subtask-text-content">
                    <span className="subtask-title">
                      {renderMarkdownDescription(subtask.description)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="metadata-container">
          <div className="metadata-left-badges">
            {task.priority !== null && task.priority !== undefined && (
              <PriorityBadge priority={task.priority} />
            )}
            {(projectLabel === undefined ? task.project : projectLabel) && (
              <MetadataPill kind="project">{`+${projectLabel ?? task.project}`}</MetadataPill>
            )}
            {showContexts &&
              task.contexts.map((context, index) => (
                <MetadataPill key={`${context}-${index}`} kind="context">
                  {`@${context}`}
                </MetadataPill>
              ))}
            {task.tags.map((tag) => (
              <MetadataPill key={tag} kind="tag">
                {`#${tag}`}
              </MetadataPill>
            ))}
            {showScheduleMetadata && task.s_start && (
              <MetadataPill kind="scheduled">{`s:${task.s_start}`}</MetadataPill>
            )}
            {showScheduleMetadata && task.duration_secs && (
              <MetadataPill kind="scheduled">{`dur:${task.duration_secs / 60}m`}</MetadataPill>
            )}
          </div>
          {subtasks.length > 0 && (
            <span className="subtask-counter">
              {subtasks.length} {subtasks.length === 1 ? "subtask" : "subtasks"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
