import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { describe, it } from "node:test";

const rootUrl = new URL("../../", import.meta.url);

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, rootUrl), "utf8"));
}

describe("public release configuration", () => {
  it("uses public MIT metadata without a repository submodule", async () => {
    const [packageJson, cargoToml, license, gitignore] = await Promise.all([
      readJson("package.json"),
      readFile(new URL("src-tauri/Cargo.toml", rootUrl), "utf8"),
      readFile(new URL("LICENSE", rootUrl), "utf8"),
      readFile(new URL(".gitignore", rootUrl), "utf8"),
    ]);

    assert.equal(packageJson.license, "MIT");
    assert.equal(packageJson.repository, "github:pan-narrans/octarine");
    assert.match(cargoToml, /^license = "MIT"$/m);
    assert.match(cargoToml, /^repository = "https:\/\/github\.com\/pan-narrans\/octarine"$/m);
    assert.match(license, /^MIT License$/m);
    assert.match(gitignore, /^\.agents\/$/m);
    await assert.rejects(readFile(new URL(".gitmodules", rootUrl), "utf8"), { code: "ENOENT" });
  });

  it("enforces restrictive production and development CSPs", async () => {
    const config = await readJson("src-tauri/tauri.conf.json");
    const { csp, devCsp } = config.app.security;

    for (const policy of [csp, devCsp]) {
      assert.equal(policy["default-src"], "'self'");
      assert.equal(policy["base-uri"], "'none'");
      assert.equal(policy["form-action"], "'none'");
      assert.equal(policy["frame-ancestors"], "'none'");
      assert.equal(policy["object-src"], "'none'");
      assert.equal(policy["script-src"], "'self'");
      assert.doesNotMatch(JSON.stringify(policy), /unsafe-eval|\*/);
    }

    assert.equal(csp["connect-src"], "'self' ipc: http://ipc.localhost");
    assert.equal(devCsp["connect-src"], "'self' ipc: http://ipc.localhost ws://localhost:1420");
    assert.deepEqual(config.plugins.updater, { pubkey: "" });
    assert.equal(config.bundle.licenseFile, "../LICENSE");
    assert.equal(config.bundle.resources["../LICENSE"], "LICENSE");
    assert.equal(config.bundle.resources["../THIRD_PARTY_LICENSES.md"], "THIRD_PARTY_LICENSES.md");
  });

  it("keeps updater artifact generation in release-only overlay", async () => {
    const [base, release, updaterSource] = await Promise.all([
      readJson("src-tauri/tauri.conf.json"),
      readJson("src-tauri/tauri.release.conf.json"),
      readFile(new URL("src-tauri/src/updates.rs", rootUrl), "utf8"),
    ]);
    const publicKey = updaterSource.match(/const UPDATER_PUBLIC_KEY: &str = "([^"]+)";/)?.[1];

    assert.equal(base.bundle.createUpdaterArtifacts, undefined);
    assert.equal(release.bundle.createUpdaterArtifacts, true);
    assert.ok(publicKey, "runtime updater public key missing");
    assert.equal(release.plugins.updater.pubkey, publicKey);
    assert.match(
      Buffer.from(publicKey, "base64").toString("utf8"),
      /^untrusted comment: minisign public key:/,
    );
  });

  it("runs complete quality gates before signed release builds", async () => {
    const [qualityWorkflow, securityWorkflow, releaseWorkflow, publishWorkflow, channelWorkflow] =
      await Promise.all([
        readFile(new URL(".github/workflows/quality.yml", rootUrl), "utf8"),
        readFile(new URL(".github/workflows/security.yml", rootUrl), "utf8"),
        readFile(new URL(".github/workflows/release.yml", rootUrl), "utf8"),
        readFile(new URL(".github/workflows/publish-updater-pages.yml", rootUrl), "utf8"),
        readFile(new URL(".github/workflows/set-updater-channel.yml", rootUrl), "utf8"),
      ]);
    const requiredCommands = [
      "npm run test",
      "npm run test:release-config",
      "npm run test:release-smoke",
      "npm run test:public-release",
      "npm run test:updater-manifests",
      "npm run licenses:check",
      "npm run visual:test",
    ];
    const requiredCargoFetches = [
      "cargo fetch --manifest-path src-tauri/Cargo.toml --locked --target aarch64-apple-darwin",
      "cargo fetch --manifest-path src-tauri/Cargo.toml --locked --target x86_64-unknown-linux-gnu",
    ];

    for (const workflow of [qualityWorkflow, releaseWorkflow]) {
      for (const command of requiredCommands) {
        assert.ok(workflow.includes(`run: ${command}\n`), `${command} missing from workflow`);
      }
      for (const command of requiredCargoFetches) {
        assert.ok(workflow.includes(command), `${command} missing from workflow`);
      }
    }
    for (const workflow of [qualityWorkflow, securityWorkflow]) {
      assert.match(workflow, /pull_request:\n\s+branches: \[master, "release\/\*\*"\]/);
      assert.match(workflow, /push:\n\s+branches: \[master, "release\/\*\*"\]/);
      assert.doesNotMatch(workflow, /branches: \[[^\]]*develop/);
    }
    assert.match(releaseWorkflow, /needs: \[validate, quality, visual\]/);
    assert.match(releaseWorkflow, /release_version="\$\{tag_version%%-\*\}"/);
    assert.match(releaseWorkflow, /release_branch="release\/\$release_version"/);
    assert.match(releaseWorkflow, /origin\/\$release_branch/);
    assert.match(releaseWorkflow, /Stable release tag must point to a commit on master\./);
    assert.match(publishWorkflow, /--pattern smoke-report\.json/);
    assert.match(publishWorkflow, /validate-smoke-report\.mjs/);
    assert.match(publishWorkflow, /Verify public source clone/);
    assert.match(publishWorkflow, /verify-public-release\.mjs/);
    assert.match(channelWorkflow, /--pattern smoke-report\.json/);
    assert.match(channelWorkflow, /validate-smoke-report\.mjs/);
    assert.match(channelWorkflow, /verify-public-release\.mjs/);
    assert.match(securityWorkflow, /gitleaks\/gitleaks-action@[a-f0-9]{40}/);
    assert.match(securityWorkflow, /GITLEAKS_VERSION: "8\.30\.1"/);
    assert.match(securityWorkflow, /rustsec\/audit-check@[a-f0-9]{40}/);
    assert.match(securityWorkflow, /working-directory: src-tauri/);
  });

  it("pins every workflow action to an immutable commit", async () => {
    const workflowDirectory = new URL(".github/workflows/", rootUrl);
    for (const name of await readdir(workflowDirectory)) {
      if (!name.endsWith(".yml")) continue;
      const workflow = await readFile(new URL(name, workflowDirectory), "utf8");
      for (const match of workflow.matchAll(/^\s*uses:\s+\S+@([^\s#]+)/gm)) {
        assert.match(match[1], /^[a-f0-9]{40}$/, `${name} contains mutable action ref ${match[1]}`);
      }
    }
  });
});
