import { copyFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const REQUIRED_PLATFORMS = ["darwin-aarch64", "linux-x86_64"];
const RELEASE_PATH_PREFIX = "/pan-narrans/octarine/releases/download/";
const SEMVER_PATTERN =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function parseSemVer(value) {
  if (typeof value !== "string") throw new Error("Manifest version must be string.");
  const match = SEMVER_PATTERN.exec(value);
  if (!match) throw new Error(`Invalid SemVer: ${value}`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split(".") ?? [],
  };
}

export function compareSemVer(leftValue, rightValue) {
  const left = parseSemVer(leftValue);
  const right = parseSemVer(rightValue);
  for (const field of ["major", "minor", "patch"]) {
    if (left[field] !== right[field]) return left[field] > right[field] ? 1 : -1;
  }

  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    if (left.prerelease.length === right.prerelease.length) return 0;
    return left.prerelease.length === 0 ? 1 : -1;
  }

  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = left.prerelease[index];
    const rightIdentifier = right.prerelease[index];
    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;
    if (leftIdentifier === rightIdentifier) continue;

    const leftNumeric = /^\d+$/.test(leftIdentifier);
    const rightNumeric = /^\d+$/.test(rightIdentifier);
    if (leftNumeric && rightNumeric) {
      return Number(leftIdentifier) > Number(rightIdentifier) ? 1 : -1;
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftIdentifier > rightIdentifier ? 1 : -1;
  }
  return 0;
}

export function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Updater manifest must be object.");
  }
  const version = manifest.version;
  parseSemVer(version);
  if (!manifest.platforms || typeof manifest.platforms !== "object") {
    throw new Error("Updater manifest platforms must be object.");
  }

  const normalizedVersion = version.startsWith("v") ? version.slice(1) : version;
  const releasePrefix = `${RELEASE_PATH_PREFIX}v${normalizedVersion}/`;
  for (const platform of REQUIRED_PLATFORMS) {
    if (!manifest.platforms[platform]) {
      throw new Error(`Updater manifest lacks ${platform}.`);
    }
  }

  for (const [platform, entry] of Object.entries(manifest.platforms)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Updater manifest has invalid ${platform} entry.`);
    }
    if (typeof entry.signature !== "string" || entry.signature.trim() === "") {
      throw new Error(`Updater manifest lacks ${platform} signature.`);
    }
    if (typeof entry.url !== "string") {
      throw new Error(`Updater manifest lacks ${platform} URL.`);
    }

    let url;
    try {
      url = new URL(entry.url);
    } catch {
      throw new Error(`Updater manifest has invalid ${platform} URL.`);
    }
    if (
      url.protocol !== "https:" ||
      url.hostname !== "github.com" ||
      !url.pathname.startsWith(releasePrefix)
    ) {
      throw new Error(`Updater manifest ${platform} URL is not immutable release asset.`);
    }
  }
  return manifest;
}

export function readManifest(path) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Could not read updater manifest ${path}: ${error.message}`);
  }
  return validateManifest(manifest);
}

export function selectBetaManifest(stableManifest, betaManifest) {
  if (!stableManifest && !betaManifest) throw new Error("No beta-channel candidate exists.");
  if (!stableManifest) return validateManifest(betaManifest);
  if (!betaManifest) return validateManifest(stableManifest);
  validateManifest(stableManifest);
  validateManifest(betaManifest);
  return compareSemVer(stableManifest.version, betaManifest.version) >= 0
    ? stableManifest
    : betaManifest;
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function main() {
  const command = process.argv[2];
  if (command === "validate") {
    const path = process.argv[3];
    if (!path) throw new Error("Usage: update-manifests.mjs validate <manifest>.");
    process.stdout.write(`${readManifest(path).version}\n`);
    return;
  }

  if (command === "channel") {
    const path = process.argv[3];
    if (!path) throw new Error("Usage: update-manifests.mjs channel <manifest>.");
    const version = readManifest(path).version;
    const channel = parseSemVer(version).prerelease.length === 0 ? "stable" : "beta";
    process.stdout.write(`${channel}\n`);
    return;
  }

  if (command === "select-beta") {
    const stablePath = argumentValue("--stable");
    const betaPath = argumentValue("--beta");
    const outputPath = argumentValue("--output");
    if (!outputPath || (!stablePath && !betaPath)) {
      throw new Error(
        "Usage: update-manifests.mjs select-beta [--stable path] [--beta path] --output path.",
      );
    }
    const stable = stablePath ? readManifest(stablePath) : null;
    const beta = betaPath ? readManifest(betaPath) : null;
    const selected = selectBetaManifest(stable, beta);
    const selectedPath = selected === stable ? stablePath : betaPath;
    copyFileSync(selectedPath, outputPath);
    process.stdout.write(`${selected.version}\n`);
    return;
  }

  throw new Error(`Unknown updater manifest command: ${command ?? "<missing>"}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
