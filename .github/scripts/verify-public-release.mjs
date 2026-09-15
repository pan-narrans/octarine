import { pathToFileURL } from "node:url";
import { validateManifest } from "./update-manifests.mjs";

const repositoryApi = "https://api.github.com/repos/pan-narrans/octarine";
const pagesRoot = "https://pan-narrans.github.io/octarine/";

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchWithRetry(fetcher, url, options, attempts) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetcher(url, options);
      if (response.ok) return response;
      lastError = new Error(`${url} returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await delay(6_000);
  }
  throw lastError;
}

export async function verifyPublicRelease({ fetcher = fetch, channel, attempts = 10 }) {
  if (channel !== "stable" && channel !== "beta") {
    throw new Error("Channel must be stable or beta.");
  }

  const repositoryResponse = await fetchWithRetry(
    fetcher,
    repositoryApi,
    { headers: { Accept: "application/vnd.github+json" } },
    attempts,
  );
  const repository = await repositoryResponse.json();
  if (repository.private !== false) {
    throw new Error("GitHub repository is not public.");
  }

  await fetchWithRetry(fetcher, pagesRoot, {}, attempts);
  const manifestUrl = `${pagesRoot}updates/${channel}.json?verification=${Date.now()}`;
  const manifestResponse = await fetchWithRetry(fetcher, manifestUrl, {}, attempts);
  const manifest = validateManifest(await manifestResponse.json());

  for (const [platform, artifact] of Object.entries(manifest.platforms)) {
    await fetchWithRetry(fetcher, artifact.url, { method: "HEAD", redirect: "follow" }, attempts);
    process.stdout.write(`Verified public ${platform} artifact.\n`);
  }

  process.stdout.write(`Verified public repository and ${channel} updater channel.\n`);
  return manifest;
}

async function main(args) {
  if (args.length !== 2 || args[0] !== "--channel") {
    throw new Error("Usage: verify-public-release.mjs --channel stable|beta");
  }
  await verifyPublicRelease({ channel: args[1] });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
