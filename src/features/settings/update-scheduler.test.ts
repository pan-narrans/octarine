import { afterEach, describe, expect, it, vi } from "vitest";
import { startUpdateScheduler, UPDATE_CHECK_INTERVAL_MS } from "./update-scheduler";

afterEach(() => {
  vi.useRealTimers();
});

describe("update scheduler", () => {
  it("checks immediately and every 24 hours after completion", async () => {
    vi.useFakeTimers();
    const check = vi.fn().mockResolvedValue(undefined);
    const stop = startUpdateScheduler({ check });

    await vi.advanceTimersByTimeAsync(0);
    expect(check).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS - 1);
    expect(check).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(check).toHaveBeenCalledTimes(2);
    stop();
  });

  it("waits for current check before scheduling next interval", async () => {
    vi.useFakeTimers();
    let resolveCheck: () => void = () => undefined;
    const check = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCheck = () => resolve();
        }),
    );
    const stop = startUpdateScheduler({ check });

    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS * 2);
    expect(check).toHaveBeenCalledTimes(1);

    resolveCheck();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS);
    expect(check).toHaveBeenCalledTimes(2);
    stop();
  });

  it("cancels pending checks", async () => {
    vi.useFakeTimers();
    const check = vi.fn().mockResolvedValue(undefined);
    const stop = startUpdateScheduler({ check });

    await vi.advanceTimersByTimeAsync(0);
    stop();
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS);
    expect(check).toHaveBeenCalledTimes(1);
  });
});
