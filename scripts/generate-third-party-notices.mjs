import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "THIRD_PARTY_LICENSES.md");
const licensePattern = /^(licen[cs]e|copying|notice)(?:[._-].*)?$/i;

async function sha256(relativePath) {
  const contents = await readFile(path.join(root, relativePath));
  return createHash("sha256").update(contents).digest("hex");
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
}

function normalizeRepository(repository) {
  const raw = typeof repository === "string" ? repository : repository?.url;
  if (!raw) return null;
  return raw.replace(/^git\+/, "").replace(/\.git$/, "");
}

async function npmPackages() {
  const directories = run("npm", ["ls", "--omit=dev", "--all", "--parseable"])
    .trim()
    .split("\n")
    .slice(1)
    .filter(Boolean);
  const packages = [];

  for (const directory of directories) {
    const manifest = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
    const licenseFiles = (await readdir(directory))
      .filter((name) => licensePattern.test(name))
      .sort();
    if (licenseFiles.length === 0) {
      throw new Error(`${manifest.name}@${manifest.version} contains no license or notice file.`);
    }
    packages.push({
      name: manifest.name,
      version: manifest.version,
      license: manifest.license,
      repository: normalizeRepository(manifest.repository),
      notices: await Promise.all(
        licenseFiles.map(async (name) => ({
          name,
          text: await readFile(path.join(directory, name), "utf8"),
        })),
      ),
    });
  }

  return packages.sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`),
  );
}

function cargoAbout() {
  const executable = process.env.OCTARINE_CARGO_ABOUT ?? "cargo-about";
  return JSON.parse(
    run(executable, [
      "generate",
      "--manifest-path",
      "src-tauri/Cargo.toml",
      "--config",
      "about.toml",
      "--format",
      "json",
      "--locked",
      "--offline",
      "--fail",
    ]),
  );
}

function indent(text) {
  return text
    .trim()
    .split("\n")
    .map((line) => {
      const normalized = line.replaceAll("\t", "    ").trimEnd();
      return normalized ? `    ${normalized}` : "";
    })
    .join("\n");
}

function packageLink(name, version, repository, fallback) {
  const label = `${name} ${version}`;
  return repository ? `[${label}](${repository})` : `[${label}](${fallback})`;
}

async function generate() {
  const [cargoLockHash, packageLockHash, npm] = await Promise.all([
    sha256("src-tauri/Cargo.lock"),
    sha256("package-lock.json"),
    npmPackages(),
  ]);
  const cargo = cargoAbout();
  const lines = [
    "# Third-Party Licenses",
    "",
    "Generated from production dependency lockfiles. Do not edit manually.",
    "",
    `- Cargo.lock SHA-256: \`${cargoLockHash}\``,
    `- package-lock.json SHA-256: \`${packageLockHash}\``,
    "",
    "## Rust components",
    "",
    "| Component | Selected license |",
    "| --- | --- |",
  ];

  for (const entry of cargo.crates) {
    const crate = entry.package;
    lines.push(
      `| ${packageLink(crate.name, crate.version, crate.repository, `https://crates.io/crates/${crate.name}`)} | ${entry.license} |`,
    );
  }

  lines.push("", "## Rust license and notice texts", "");
  for (const [index, license] of cargo.licenses.entries()) {
    const users = license.used_by
      .map(({ crate }) => `${crate.name} ${crate.version}`)
      .sort()
      .join(", ");
    lines.push(
      `### Rust notice ${index + 1}: ${license.name}`,
      "",
      `Used by: ${users}.`,
      "",
      indent(license.text),
      "",
    );
  }

  lines.push("## npm production components", "");
  for (const entry of npm) {
    lines.push(
      `### ${packageLink(entry.name, entry.version, entry.repository, `https://www.npmjs.com/package/${entry.name}/v/${entry.version}`)}`,
      "",
      `License expression: ${entry.license}.`,
      "",
    );
    for (const notice of entry.notices) {
      lines.push(`#### ${notice.name}`, "", indent(notice.text), "");
    }
  }

  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

async function check() {
  const existing = await readFile(outputPath, "utf8");
  const [cargoLockHash, packageLockHash] = await Promise.all([
    sha256("src-tauri/Cargo.lock"),
    sha256("package-lock.json"),
  ]);
  assert.ok(existing.includes("Cargo.lock SHA-256: `" + cargoLockHash + "`"));
  assert.ok(existing.includes("package-lock.json SHA-256: `" + packageLockHash + "`"));

  for (const entry of await npmPackages()) {
    assert.ok(existing.includes(`${entry.name} ${entry.version}`), `Missing ${entry.name} notice.`);
  }

  const targetPackages = new Set();
  for (const target of ["aarch64-apple-darwin", "x86_64-unknown-linux-gnu"]) {
    const tree = run("cargo", [
      "tree",
      "--manifest-path",
      "src-tauri/Cargo.toml",
      "--locked",
      "--offline",
      "--target",
      target,
      "--edges",
      "normal,build",
      "--prefix",
      "none",
      "--format",
      "{p}",
    ]);
    for (const line of tree.split("\n")) {
      const match = /^(\S+) v(\S+)/.exec(line);
      if (match && match[1] !== "octarine") targetPackages.add(`${match[1]} ${match[2]}`);
    }
  }
  for (const entry of targetPackages) {
    assert.ok(existing.includes(entry), `Missing ${entry} notice.`);
  }
}

const mode = process.argv[2];
if (mode === "--write") {
  await writeFile(outputPath, await generate());
  process.stdout.write(`Generated ${path.relative(root, outputPath)}.\n`);
} else if (mode === "--check") {
  await check();
  process.stdout.write("Third-party notices match dependency lockfiles.\n");
} else {
  throw new Error("Usage: generate-third-party-notices.mjs --write|--check");
}
