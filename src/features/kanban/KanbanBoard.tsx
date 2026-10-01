import { useRef, useState, type DragEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Task } from "../../types";
import { TaskCard } from "../tasks/TaskCard";
import {
  buildKanbanBoard,
  type ClosedKanbanStatus,
  type KanbanCardModel,
  type KanbanStatus,
} from "./model";
import { isKanbanMoveNoop, type KanbanMoveIntent } from "./move";

const STATUS_LABELS: Record<KanbanStatus, string> = {
  todo: "To-do",
  doing: "Doing",
  deferred: "Deferred",
  done: "Done",
  cancelled: "Cancelled",
};

interface KanbanBoardProps {
  tasks: Task[];
  selectedProject: string;
  searchQuery?: string;
  visibleClosedStatuses?: readonly ClosedKanbanStatus[];
  errorMessage?: string | null;
  pendingTaskMoves?: readonly string[];
  onOpenTask: (task: Task) => void;
  onStatusChange: (task: Task, status: Task["status"]) => void;
  onMoveTask: (task: Task, intent: KanbanMoveIntent) => void;
}

interface DropTarget {
  zone: "header" | "group";
  status: KanbanStatus;
  context: string | null;
}

function targetKey(target: DropTarget) {
  return `${target.zone}:${target.status}:${target.context ?? "__preserve__"}`;
}

interface KanbanCardListProps {
  cards: KanbanCardModel[];
  tasks: Task[];
  pendingTaskMoves: readonly string[];
  onOpenTask: (task: Task) => void;
  onStatusChange: (task: Task, status: Task["status"]) => void;
  onDragStartTask: (task: Task) => void;
  onDragFinish: (task: Task) => void;
}

function KanbanCardList({
  cards,
  tasks,
  pendingTaskMoves,
  onOpenTask,
  onStatusChange,
  onDragStartTask,
  onDragFinish,
}: KanbanCardListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualized = cards.length > 50;
  const virtualizer = useVirtualizer({
    count: cards.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 144,
    overscan: 4,
    enabled: virtualized,
  });

  const renderCard = ({ task, relativeProject }: KanbanCardModel, index: number) => {
    const pending = pendingTaskMoves.includes(task.hash);
    return (
      <div
        className={`kanban-card ${pending ? "is-pending" : ""}`}
        draggable={!pending}
        key={task.hash}
        data-index={index}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", task.hash);
          onDragStartTask(task);
        }}
        onDragEnd={() => onDragFinish(task)}
      >
        <TaskCard
          task={task}
          tasks={tasks}
          onOpen={onOpenTask}
          onStatusChange={onStatusChange}
          showScheduleMetadata={false}
          showStatusControl={false}
          showDoneLabel={false}
          showContexts={false}
          projectLabel={relativeProject}
        />
      </div>
    );
  };

  if (!virtualized) {
    return <div className="kanban-card-list">{cards.map(renderCard)}</div>;
  }

  return (
    <div className="kanban-card-list virtualized" ref={scrollRef}>
      <div className="kanban-virtual-content" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => (
          <div
            className="kanban-virtual-row"
            key={cards[item.index].task.hash}
            ref={virtualizer.measureElement}
            data-index={item.index}
            style={{ transform: `translateY(${item.start}px)` }}
          >
            {renderCard(cards[item.index], item.index)}
          </div>
        ))}
      </div>
    </div>
  );
}

export function KanbanBoard({
  tasks,
  selectedProject,
  searchQuery = "",
  visibleClosedStatuses = [],
  errorMessage = null,
  pendingTaskMoves = [],
  onOpenTask,
  onStatusChange,
  onMoveTask,
}: KanbanBoardProps) {
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const draggedTaskRef = useRef<Task | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const dropTargetRef = useRef<DropTarget | null>(null);
  const moveCommittedRef = useRef(false);
  const columns = buildKanbanBoard({
    tasks,
    selectedProject,
    searchQuery,
    visibleClosedStatuses,
  });

  const setTarget = (event: DragEvent, target: DropTarget) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    dropTargetRef.current = target;
    setDropTarget(target);
  };

  const commitMove = (task: Task, target: DropTarget) => {
    const intent: KanbanMoveIntent = { newStatus: target.status };
    if (target.context !== null) intent.newPrimaryContext = target.context;
    if (!isKanbanMoveNoop(task, intent)) onMoveTask(task, intent);
  };

  const resetDrag = () => {
    draggedTaskRef.current = null;
    dropTargetRef.current = null;
    setDraggedTask(null);
    setDropTarget(null);
  };

  const startDrag = (task: Task) => {
    moveCommittedRef.current = false;
    draggedTaskRef.current = task;
    setDraggedTask(task);
  };

  const finishDrag = (task: Task) => {
    const target = dropTargetRef.current;
    if (!moveCommittedRef.current && target) commitMove(task, target);
    resetDrag();
  };

  const drop = (event: DragEvent, target: DropTarget) => {
    event.preventDefault();
    const transferredHash = event.dataTransfer.getData("text/plain");
    const task =
      draggedTaskRef.current ??
      draggedTask ??
      tasks.find((candidate) => candidate.hash === transferredHash) ??
      null;
    if (!task) return;
    moveCommittedRef.current = true;
    commitMove(task, target);
    resetDrag();
  };

  const preview = (target: DropTarget) => {
    if (!draggedTask || targetKey(target) !== (dropTarget ? targetKey(dropTarget) : null))
      return null;
    const contextEffect =
      target.context === null
        ? `keep ${draggedTask.primary_context ? `@${draggedTask.primary_context}` : "no context"}`
        : `set @${target.context}`;
    return (
      <div className="kanban-drop-preview" aria-live="polite">
        Move to {STATUS_LABELS[target.status]}; {contextEffect}
      </div>
    );
  };

  const activeCount = columns.reduce(
    (count, column) => count + column.groups.reduce((sum, group) => sum + group.cards.length, 0),
    0,
  );

  return (
    <section className="kanban-surface" aria-label={`Kanban board for ${selectedProject}`}>
      {errorMessage && (
        <div className="kanban-error" role="alert">
          {errorMessage}
        </div>
      )}
      {activeCount === 0 && !searchQuery.trim() ? (
        <div className="kanban-empty">
          <strong>No active tasks in +{selectedProject}</strong>
          <span>Completed and cancelled tasks remain available through filters.</span>
        </div>
      ) : activeCount === 0 ? (
        <div className="kanban-empty">
          <strong>No matching tasks</strong>
          <span>Change search text or closed-status filters.</span>
        </div>
      ) : null}
      <div className="kanban-board">
        {columns.map((column) => {
          const cardCount = column.groups.reduce((sum, group) => sum + group.cards.length, 0);
          const headerTarget: DropTarget = { zone: "header", status: column.status, context: null };
          return (
            <section
              className={`kanban-column ${
                dropTarget && targetKey(dropTarget) === targetKey(headerTarget)
                  ? "drop-active-status"
                  : ""
              }`}
              key={column.status}
              aria-labelledby={`kanban-${column.status}`}
              onDragEnter={(event) => setTarget(event, headerTarget)}
              onDragOver={(event) => setTarget(event, headerTarget)}
              onDrop={(event) => drop(event, headerTarget)}
            >
              <header
                className={`kanban-column-header ${
                  dropTarget && targetKey(dropTarget) === targetKey(headerTarget)
                    ? "drop-active"
                    : ""
                }`}
                onDragEnter={(event) => {
                  event.stopPropagation();
                  setTarget(event, headerTarget);
                }}
                onDragOver={(event) => {
                  event.stopPropagation();
                  setTarget(event, headerTarget);
                }}
                onDrop={(event) => {
                  event.stopPropagation();
                  drop(event, headerTarget);
                }}
              >
                <h2 id={`kanban-${column.status}`}>{STATUS_LABELS[column.status]}</h2>
                <span aria-label={`${cardCount} tasks`}>{cardCount}</span>
                {preview(headerTarget)}
              </header>
              <div className="kanban-column-content">
                {column.groups.length === 0 && <div className="kanban-column-empty">No tasks</div>}
                {column.groups.map((group) => {
                  const target: DropTarget = {
                    zone: "group",
                    status: column.status,
                    context: group.context,
                  };
                  const active = dropTarget && targetKey(dropTarget) === targetKey(target);
                  return (
                    <section
                      className={`kanban-context-group ${active ? "drop-active" : ""}`}
                      key={group.context ?? "no-context"}
                      aria-label={group.context ? `Context ${group.context}` : "No context"}
                      onDragEnter={(event) => {
                        event.stopPropagation();
                        setTarget(event, target);
                      }}
                      onDragOver={(event) => {
                        event.stopPropagation();
                        setTarget(event, target);
                      }}
                      onDrop={(event) => {
                        event.stopPropagation();
                        drop(event, target);
                      }}
                    >
                      <header>
                        <h3>{group.context ? `@${group.context}` : "No context"}</h3>
                        <span>{group.cards.length}</span>
                      </header>
                      {preview(target)}
                      <KanbanCardList
                        cards={group.cards}
                        tasks={tasks}
                        pendingTaskMoves={pendingTaskMoves}
                        onOpenTask={onOpenTask}
                        onStatusChange={onStatusChange}
                        onDragStartTask={startDrag}
                        onDragFinish={finishDrag}
                      />
                    </section>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
