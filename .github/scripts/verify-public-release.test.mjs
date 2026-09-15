import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { verifyPublicRelease } from "./verify-public-release.mjs";

function manifest() {
  return {
    version: "1.0.0",
    notes: "Octarine 1.0.0",
    pub_date: "2026-09-14T12:00:00Z",
    platforms: {
      "darwin-aarch64": {
        url: "https://github.com/pan-narrans/octarine/releases/download/v1.0.0/octarine.app.tar.gz",
        signature: "mac-signature",
      },
      "linux-x86_64": {
        url: "https://github.com/pan-narrans/octarine/releases/download/v1.0.0/octarine.AppImage",
        signature: "linux-signature",
      },
    },
  };
}

function response(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

describe("public release verification", () => {
  it("accepts public source, Pages channel, and immutable artifacts", async () => {
    const fetcher = async (url) => {
      if (url.includes("api.github.com")) return response({ private: false });
      if (url.includes("updates/stable.json")) return response(manifest());
      return response({});
    };

    assert.equal(
      (await verifyPublicRelease({ fetcher, channel: "stable", attempts: 1 })).version,
      "1.0.0",
    );
  });

  it("rejects private repository", async () => {
    const fetcher = async () => response({ private: true });
    await assert.rejects(
      verifyPublicRelease({ fetcher, channel: "stable", attempts: 1 }),
      /not public/,
    );
  });

  it("rejects inaccessible artifact", async () => {
    const fetcher = async (url) => {
      if (url.includes("api.github.com")) return response({ private: false });
      if (url.includes("updates/beta.json")) return response(manifest());
      if (url.includes("releases/download")) return response({}, { ok: false, status: 404 });
      return response({});
    };

    await assert.rejects(
      verifyPublicRelease({ fetcher, channel: "beta", attempts: 1 }),
      /HTTP 404/,
    );
  });
});
