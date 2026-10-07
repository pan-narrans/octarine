import { useEffect, useCallback } from "react";
import type { PerspectiveDefinition } from "./model";
import {
  adjacentPerspectiveId,
  perspectiveDirectionForShortcut,
  type PerspectiveNavigationDirection,
} from "./perspective-state";

export interface PerspectiveCommands {
  switchTo: (id: string) => void;
  next: () => void;
  previous: () => void;
}

export function switchPerspectiveCommand(
  perspectives: readonly PerspectiveDefinition[],
  id: string,
  onSwitch: (id: string) => void,
  onError: (message: string) => void,
): void {
  if (!perspectives.some((perspective) => perspective.id === id)) {
    onError(`Perspective ID '${id}' is unavailable.`);
    return;
  }
  onSwitch(id);
}

export function usePerspectiveSwitching(
  perspectives: readonly PerspectiveDefinition[],
  activeId: string,
  onSwitch: (id: string) => void,
  onError: (message: string) => void,
): PerspectiveCommands {
  const perspectiveList = perspectives;
  const switchTo = useCallback(
    (id: string) => switchPerspectiveCommand(perspectiveList, id, onSwitch, onError),
    [onError, onSwitch, perspectiveList],
  );
  const move = useCallback(
    (direction: PerspectiveNavigationDirection) => {
      switchTo(adjacentPerspectiveId(perspectiveList, activeId, direction));
    },
    [activeId, perspectiveList, switchTo],
  );
  const next = useCallback(() => move("next"), [move]);
  const previous = useCallback(() => move("previous"), [move]);

  useEffect(() => {
    if (perspectiveList.some((perspective) => perspective.id === activeId)) return;
    const fallback = perspectiveList[0];
    onError(
      fallback
        ? `Active Perspective '${activeId}' is unavailable. Switched to '${fallback.id}'.`
        : "No valid Perspective is available.",
    );
    if (fallback) onSwitch(fallback.id);
  }, [activeId, onError, onSwitch, perspectiveList]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }
      const direction = perspectiveDirectionForShortcut(event);
      if (!direction) return;
      event.preventDefault();
      move(direction);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [move]);

  return { switchTo, next, previous };
}
