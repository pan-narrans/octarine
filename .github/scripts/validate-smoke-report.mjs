import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const TAG_PATTERN = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function requireNonEmptyString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value;
}

function requirePassedPlatform(platform, field) {
  if (!platform || typeof platform !== "object") {
    throw new Error(`${field} result is required.`);
  }
  requireNonEmptyString(platform.version, `${field}.version`);
  if (platform.passed !== true) {
    throw new Error(`${field} must pass.`);
  }
}

export function validateSmokeReport(report, expectedReleaseTag) {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new Error("Smoke report must be a JSON object.");
  }
  if (report.schemaVersion !== 1) {
    throw new Error("Smoke report schemaVersion must be 1.");
  }
  if (report.releaseTag !== expectedReleaseTag) {
    throw new Error(`Smoke report releaseTag must be ${expectedReleaseTag}.`);
  }
  if (!TAG_PATTERN.test(report.releaseTag)) {
    throw new Error("Smoke report releaseTag must be a version tag.");
  }

  const testedAt = requireNonEmptyString(report.testedAt, "testedAt");
  if (Number.isNaN(Date.parse(testedAt))) {
    throw new Error("testedAt must be an ISO-8601 timestamp.");
  }

  const macos = report.macos;
  if (!macos || typeof macos !== "object") {
    throw new Error("macos result is required.");
  }
  if (!requireNonEmptyString(macos.version, "macos.version").startsWith("15")) {
    throw new Error("macos.version must record macOS 15 Sequoia.");
  }
  if (macos.architecture !== "arm64") {
    throw new Error("macos.architecture must be arm64.");
  }
  if (macos.initialGatekeeperApprovals !== 1) {
    throw new Error("Exactly one initial Gatekeeper approval is required.");
  }
  if (!Array.isArray(macos.selfUpdates) || macos.selfUpdates.length < 2) {
    throw new Error("At least two macOS self-updates are required.");
  }
  for (const [index, update] of macos.selfUpdates.entries()) {
    const prefix = `macos.selfUpdates[${index}]`;
    if (!TAG_PATTERN.test(requireNonEmptyString(update?.from, `${prefix}.from`))) {
      throw new Error(`${prefix}.from must be a version tag.`);
    }
    if (!TAG_PATTERN.test(requireNonEmptyString(update?.to, `${prefix}.to`))) {
      throw new Error(`${prefix}.to must be a version tag.`);
    }
    if (update.gatekeeperApprovalShown !== false) {
      throw new Error(`${prefix} must not show another Gatekeeper approval.`);
    }
  }

  requirePassedPlatform(report.linux?.ubuntu, "linux.ubuntu");
  requirePassedPlatform(report.linux?.fedora, "linux.fedora");
  if (report.rollbackPassed !== true) {
    throw new Error("Signed rollback must pass.");
  }
  if (report.failuresPreserveCurrentVersion !== true) {
    throw new Error("Failure-path checks must preserve current version.");
  }

  return report;
}

async function main(args) {
  if (args.length !== 2) {
    throw new Error("Usage: validate-smoke-report.mjs <report.json> <release-tag>");
  }
  const [path, expectedReleaseTag] = args;
  const report = JSON.parse(await readFile(path, "utf8"));
  validateSmokeReport(report, expectedReleaseTag);
  process.stdout.write(`Validated release smoke report for ${expectedReleaseTag}.\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
