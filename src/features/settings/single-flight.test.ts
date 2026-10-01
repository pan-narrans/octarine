import { describe, expect, it, vi } from "vitest";
import { SingleFlight } from "./single-flight";

describe("SingleFlight", () => {
  it("collapses concurrent operations", async () => {
    let resolveOperation: (value: string) => void = () => undefined;
    const operation = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveOperation = resolve;
        }),
    );
    const flight = new SingleFlight<string>();

    const first = flight.run(operation);
    const second = flight.run(operation);
    expect(first).toBe(second);
    expect(operation).toHaveBeenCalledTimes(1);

    resolveOperation("done");
    await expect(first).resolves.toBe("done");
    expect(flight.current).toBeNull();
  });

  it("allows retry after rejection", async () => {
    const flight = new SingleFlight<string>();
    await expect(flight.run(() => Promise.reject(new Error("offline")))).rejects.toThrow("offline");
    await expect(flight.run(() => Promise.resolve("retried"))).resolves.toBe("retried");
  });
});
