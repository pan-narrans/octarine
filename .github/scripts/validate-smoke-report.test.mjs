import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateSmokeReport } from "./validate-smoke-report.mjs";

function validReport() {
  return {
    schemaVersion: 1,
    releaseTag: "v1.0.0",
    testedAt: "2026-09-14T12:00:00Z",
    macos: {
      version: "15.7 Sequoia",
      architecture: "arm64",
      initialGatekeeperApprovals: 1,
      selfUpdates: [
        {
          from: "v1.0.0-beta.1",
          to: "v1.0.0-beta.2",
          gatekeeperApprovalShown: false,
        },
        {
          from: "v1.0.0-beta.2",
          to: "v1.0.0-beta.3",
          gatekeeperApprovalShown: false,
        },
      ],
    },
    linux: {
      ubuntu: { version: "24.04 LTS", passed: true },
      fedora: { version: "42", passed: true },
    },
    rollbackPassed: true,
    failuresPreserveCurrentVersion: true,
  };
}

describe("stable release smoke report", () => {
  it("accepts complete cross-platform evidence", () => {
    assert.equal(validateSmokeReport(validReport(), "v1.0.0").releaseTag, "v1.0.0");
  });

  it("rejects report for another release", () => {
    assert.throws(() => validateSmokeReport(validReport(), "v1.0.1"), /releaseTag/);
  });

  it("rejects repeated Gatekeeper approval", () => {
    const report = validReport();
    report.macos.selfUpdates[1].gatekeeperApprovalShown = true;
    assert.throws(() => validateSmokeReport(report, "v1.0.0"), /must not show another/);
  });

  it("rejects fewer than two self-updates", () => {
    const report = validReport();
    report.macos.selfUpdates.pop();
    assert.throws(() => validateSmokeReport(report, "v1.0.0"), /At least two/);
  });

  it("rejects missing Linux evidence", () => {
    const report = validReport();
    report.linux.fedora.passed = false;
    assert.throws(() => validateSmokeReport(report, "v1.0.0"), /linux.fedora must pass/);
  });

  it("rejects failed rollback or recovery", () => {
    const report = validReport();
    report.rollbackPassed = false;
    assert.throws(() => validateSmokeReport(report, "v1.0.0"), /rollback must pass/);

    const secondReport = validReport();
    secondReport.failuresPreserveCurrentVersion = false;
    assert.throws(() => validateSmokeReport(secondReport, "v1.0.0"), /preserve current version/);
  });
});
