import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canonicalizeUpdaterManifest } from "./canonicalize-updater-manifest.mjs";

function draftManifest() {
  const base = "https://github.com/pan-narrans/octarine/releases/download/untagged-draft-id";
  return {
    version: "0.1.0-beta.5",
    platforms: {
      "darwin-aarch64": { url: `${base}/octarine.app.tar.gz`, signature: "mac-signature" },
      "linux-x86_64": { url: `${base}/octarine.AppImage`, signature: "linux-signature" },
    },
  };
}

function apiManifest() {
  const source = draftManifest();
  source.platforms["darwin-aarch64"].url =
    "https://api.github.com/repos/pan-narrans/octarine/releases/assets/101";
  source.platforms["linux-x86_64"].url =
    "https://api.github.com/repos/pan-narrans/octarine/releases/assets/102";
  return source;
}

const releaseAssets = [
  { id: 101, name: "octarine_0.1.0-beta.5_aarch64.app.tar.gz" },
  { id: 102, name: "octarine_0.1.0-beta.5_amd64.AppImage" },
];

describe("updater manifest canonicalization", () => {
  it("replaces draft release paths with immutable tag paths", () => {
    const source = draftManifest();
    const result = canonicalizeUpdaterManifest(source, "v0.1.0-beta.5");

    assert.equal(
      result.platforms["darwin-aarch64"].url,
      "https://github.com/pan-narrans/octarine/releases/download/v0.1.0-beta.5/octarine.app.tar.gz",
    );
    assert.equal(
      result.platforms["linux-x86_64"].url,
      "https://github.com/pan-narrans/octarine/releases/download/v0.1.0-beta.5/octarine.AppImage",
    );
    assert.match(source.platforms["darwin-aarch64"].url, /untagged-draft-id/);
  });

  it("maps GitHub API asset IDs to immutable release paths", () => {
    const result = canonicalizeUpdaterManifest(apiManifest(), "v0.1.0-beta.5", releaseAssets);

    assert.equal(
      result.platforms["darwin-aarch64"].url,
      "https://github.com/pan-narrans/octarine/releases/download/v0.1.0-beta.5/octarine_0.1.0-beta.5_aarch64.app.tar.gz",
    );
    assert.equal(
      result.platforms["linux-x86_64"].url,
      "https://github.com/pan-narrans/octarine/releases/download/v0.1.0-beta.5/octarine_0.1.0-beta.5_amd64.AppImage",
    );
  });

  it("rejects unknown GitHub API asset IDs", () => {
    assert.throws(
      () => canonicalizeUpdaterManifest(apiManifest(), "v0.1.0-beta.5", []),
      /asset ID 101 is unknown/,
    );
  });

  it("rejects tag and manifest version mismatch", () => {
    assert.throws(
      () => canonicalizeUpdaterManifest(draftManifest(), "v0.1.0-beta.6"),
      /does not match manifest version/,
    );
  });

  it("rejects non-release asset URLs", () => {
    const source = draftManifest();
    source.platforms["darwin-aarch64"].url = "https://example.com/octarine.app.tar.gz";
    assert.throws(() => canonicalizeUpdaterManifest(source, "v0.1.0-beta.5"), /not a GitHub/);
  });
});
