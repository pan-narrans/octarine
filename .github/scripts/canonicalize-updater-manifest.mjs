import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { validateManifest } from "./update-manifests.mjs";

const RELEASE_PATH_PREFIX = "/pan-narrans/octarine/releases/download/";
const API_ASSET_PATH_PREFIX = "/repos/pan-narrans/octarine/releases/assets/";

function releaseAssetName(source, assets, platform) {
  if (source.protocol !== "https:") {
    throw new Error(`Updater manifest ${platform} URL is not a GitHub release asset.`);
  }

  if (source.hostname === "api.github.com") {
    if (!source.pathname.startsWith(API_ASSET_PATH_PREFIX) || source.search || source.hash) {
      throw new Error(`Updater manifest ${platform} URL has invalid API asset path.`);
    }

    const assetId = source.pathname.slice(API_ASSET_PATH_PREFIX.length);
    if (!/^\d+$/.test(assetId)) {
      throw new Error(`Updater manifest ${platform} URL has invalid API asset ID.`);
    }
    const asset = assets.find((candidate) => String(candidate?.id) === assetId);
    if (!asset) {
      throw new Error(`Updater manifest ${platform} asset ID ${assetId} is unknown.`);
    }
    if (
      typeof asset.name !== "string" ||
      asset.name === "" ||
      asset.name === "." ||
      asset.name === ".." ||
      asset.name.includes("/") ||
      asset.name.includes("\\")
    ) {
      throw new Error(`Updater manifest ${platform} asset has invalid name.`);
    }
    return asset.name;
  }

  if (source.hostname !== "github.com") {
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
  return decodeURIComponent(suffix.slice(separator + 1));
}

export function canonicalizeUpdaterManifest(manifest, tag, assets = []) {
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
    const assetName = releaseAssetName(source, assets, platform);
    entry.url = `https://github.com${RELEASE_PATH_PREFIX}${tag}/${encodeURIComponent(assetName)}`;
  }

  return validateManifest(normalized);
}

function main(args) {
  if (args.length < 3 || args.length > 4) {
    throw new Error(
      "Usage: canonicalize-updater-manifest.mjs <input> <tag> <output> [release-assets].",
    );
  }
  const [input, tag, output, assetsPath] = args;
  const manifest = JSON.parse(readFileSync(input, "utf8"));
  const assets = assetsPath ? JSON.parse(readFileSync(assetsPath, "utf8")) : [];
  if (!Array.isArray(assets)) throw new Error("Release asset catalog must be array.");
  const canonical = canonicalizeUpdaterManifest(manifest, tag, assets);
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
