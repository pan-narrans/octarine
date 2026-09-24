import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { validateManifest } from "./update-manifests.mjs";

const RELEASE_PATH_PREFIX = "/pan-narrans/octarine/releases/download/";

export function canonicalizeUpdaterManifest(manifest, tag) {
  if (typeof tag !== "string" || !tag.startsWith("v")) {
    throw new Error("Release tag must start with v.");
  }

  const normalized = structuredClone(manifest);
  const version = normalized.version?.startsWith("v")
    ? normalized.version
    : `v${normalized.version}`;
  if (version !== tag) {
    throw new Error(`Release tag ${tag} does not match manifest version ${normalized.version}.`);
  }

  for (const [platform, entry] of Object.entries(normalized.platforms ?? {})) {
    if (!entry || typeof entry !== "object" || typeof entry.url !== "string") continue;
    const source = new URL(entry.url);
    if (source.protocol !== "https:" || source.hostname !== "github.com") {
      throw new Error(`Updater manifest ${platform} URL is not a GitHub release asset.`);
    }
    if (!source.pathname.startsWith(RELEASE_PATH_PREFIX)) {
      throw new Error(`Updater manifest ${platform} URL is not a release asset.`);
    }

    const suffix = source.pathname.slice(RELEASE_PATH_PREFIX.length);
    const separator = suffix.indexOf("/");
    if (separator <= 0 || separator === suffix.length - 1 || source.search || source.hash) {
      throw new Error(`Updater manifest ${platform} URL has invalid release asset path.`);
    }
    entry.url = `https://github.com${RELEASE_PATH_PREFIX}${tag}/${suffix.slice(separator + 1)}`;
  }

  return validateManifest(normalized);
}

function main(args) {
  if (args.length !== 3) {
    throw new Error("Usage: canonicalize-updater-manifest.mjs <input> <tag> <output>.");
  }
  const [input, tag, output] = args;
  const manifest = JSON.parse(readFileSync(input, "utf8"));
  const canonical = canonicalizeUpdaterManifest(manifest, tag);
  writeFileSync(output, `${JSON.stringify(canonical, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
