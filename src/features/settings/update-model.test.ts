import { describe, expect, it } from "vitest";
import { distributionLabel, updateStrategyDescription } from "./update-model";

describe("update settings labels", () => {
  it("names supported direct distributions", () => {
    expect(distributionLabel("direct")).toBe("Direct download");
    expect(distributionLabel("app_image")).toBe("AppImage");
    expect(distributionLabel("unknown")).toBe("Development build");
  });

  it("describes self-update and unsupported builds", () => {
    expect(updateStrategyDescription("self_update")).toContain("installs");
    expect(updateStrategyDescription("unsupported")).toContain("unavailable");
  });
});
