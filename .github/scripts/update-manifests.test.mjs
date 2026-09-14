import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareSemVer,
  parseSemVer,
  selectBetaManifest,
  validateManifest,
} from "./update-manifests.mjs";

function manifest(version) {
  const tagVersion = version.startsWith("v") ? version.slice(1) : version;
  const base = `https://github.com/pan-narrans/octarine/releases/download/v${tagVersion}`;
  return {
    version,
    notes: `Octarine ${version}`,
    pub_date: "2026-09-14T08:00:00Z",
    platforms: {
      "darwin-aarch64": { url: `${base}/octarine.app.tar.gz`, signature: "mac-signature" },
      "linux-x86_64": { url: `${base}/octarine.AppImage`, signature: "linux-signature" },
    },
  };
}

describe("SemVer comparison", () => {
  it("parses release and prerelease versions", () => {
    assert.deepEqual(parseSemVer("v1.2.3-beta.4+build.8"), {
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: ["beta", "4"],
    });
  });

  it("implements SemVer prerelease precedence", () => {
    const ordered = [
      "1.0.0-alpha",
      "1.0.0-alpha.1",
      "1.0.0-alpha.beta",
      "1.0.0-beta",
      "1.0.0-beta.2",
      "1.0.0-beta.11",
      "1.0.0-rc.1",
      "1.0.0",
    ];
    for (let index = 1; index < ordered.length; index += 1) {
      assert.equal(compareSemVer(ordered[index - 1], ordered[index]), -1);
    }
  });

  it("rejects malformed or zero-padded versions", () => {
    assert.throws(() => parseSemVer("1.0"), /Invalid SemVer/);
    assert.throws(() => parseSemVer("01.0.0"), /Invalid SemVer/);
    assert.throws(() => parseSemVer("1.0.0-01"), /Invalid SemVer/);
  });
});

describe("updater manifest validation", () => {
  it("accepts signed immutable platform entries", () => {
    assert.equal(validateManifest(manifest("1.2.3")).version, "1.2.3");
  });

  it("rejects missing supported platform", () => {
    const candidate = manifest("1.2.3");
    delete candidate.platforms["linux-x86_64"];
    assert.throws(() => validateManifest(candidate), /lacks linux-x86_64/);
  });

  it("rejects missing signature", () => {
    const candidate = manifest("1.2.3");
    candidate.platforms["darwin-aarch64"].signature = "";
    assert.throws(() => validateManifest(candidate), /lacks darwin-aarch64 signature/);
  });

  it("rejects mutable or foreign URLs", () => {
    const candidate = manifest("1.2.3");
    candidate.platforms["darwin-aarch64"].url =
      "https://github.com/pan-narrans/octarine/releases/latest/download/octarine.app.tar.gz";
    assert.throws(() => validateManifest(candidate), /not immutable/);
  });

  it("rejects URL whose tag differs from manifest version", () => {
    const candidate = manifest("1.2.3");
    candidate.platforms["linux-x86_64"].url =
      "https://github.com/pan-narrans/octarine/releases/download/v1.2.2/octarine.AppImage";
    assert.throws(() => validateManifest(candidate), /not immutable/);
  });

  it("rejects malformed extra platform entries", () => {
    const candidate = manifest("1.2.3");
    candidate.platforms["darwin-aarch64-app"] = {
      url: "https://example.com/latest",
      signature: "",
    };
    assert.throws(() => validateManifest(candidate), /lacks darwin-aarch64-app signature/);
  });
});

describe("beta channel selection", () => {
  it("selects newer beta over stable", () => {
    assert.equal(
      selectBetaManifest(manifest("1.1.0"), manifest("1.2.0-beta.1")).version,
      "1.2.0-beta.1",
    );
  });

  it("selects newer stable over beta", () => {
    assert.equal(selectBetaManifest(manifest("1.2.0"), manifest("1.2.0-beta.4")).version, "1.2.0");
  });

  it("uses only available candidate", () => {
    assert.equal(selectBetaManifest(manifest("1.2.0"), null).version, "1.2.0");
    assert.equal(selectBetaManifest(null, manifest("1.3.0-beta.1")).version, "1.3.0-beta.1");
  });
});
