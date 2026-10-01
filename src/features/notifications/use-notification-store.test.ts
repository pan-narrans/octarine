import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNotificationStore } from "./use-notification-store";

function notification(id: string) {
  return { id, kind: "info" as const, title: id, message: `${id} message` };
}

describe("notification store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useNotificationStore.getState().clear();
  });

  afterEach(() => vi.useRealTimers());

  it("keeps three newest notifications and replaces duplicate ids", () => {
    const { push } = useNotificationStore.getState();
    push(notification("one"));
    push(notification("two"));
    push(notification("three"));
    push(notification("two"));
    push(notification("four"));

    expect(useNotificationStore.getState().notifications.map(({ id }) => id)).toEqual([
      "four",
      "two",
      "three",
    ]);
  });

  it("dismisses timed feedback and preserves persistent feedback", () => {
    const { push } = useNotificationStore.getState();
    push(notification("timed"), 6_000);
    push(notification("persistent"));

    vi.advanceTimersByTime(6_000);

    expect(useNotificationStore.getState().notifications).toEqual([notification("persistent")]);
  });
});
