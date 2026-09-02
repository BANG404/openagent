import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DOWNLOADS = [
  {
    id: "windows-standard",
    platform: "Windows",
    architecture: "x64",
    package: "Standard installer",
    description: "Smallest download; fetches the embedding model during first setup.",
    pattern: /(?<!-full)-setup\.exe$/,
  },
  {
    id: "windows-full",
    platform: "Windows",
    architecture: "x64",
    package: "Full installer",
    description: "Includes the embedding model for offline first setup.",
    pattern: /-full-setup\.exe$/,
  },
  {
    id: "macos-arm64-standard",
    platform: "macOS",
    architecture: "Apple Silicon",
    package: "DMG",
    description: "Standard installer for Apple Silicon Macs.",
    pattern: /_aarch64\.dmg$/,
  },
  {
    id: "macos-arm64-full",
    platform: "macOS",
    architecture: "Apple Silicon",
    package: "Full DMG",
    description: "Includes the embedding model for offline first setup.",
    pattern: /_aarch64-full\.dmg$/,
  },
  {
    id: "macos-x64-standard",
    platform: "macOS",
    architecture: "Intel",
    package: "DMG",
    description: "Standard installer for Intel Macs.",
    pattern: /_x64\.dmg$/,
  },
  {
    id: "macos-x64-full",
    platform: "macOS",
    architecture: "Intel",
    package: "Full DMG",
    description: "Includes the embedding model for offline first setup.",
    pattern: /_x64-full\.dmg$/,
  },
  {
    id: "linux-appimage",
    platform: "Linux",
    architecture: "x64",
    package: "AppImage",
    description: "Portable standard package for most Linux distributions.",
    pattern: /(?<!-full)\.AppImage$/,
  },
  {
    id: "linux-appimage-full",
    platform: "Linux",
    architecture: "x64",
    package: "Full AppImage",
    description: "Portable package with the embedding model included.",
    pattern: /-full\.AppImage$/,
  },
  {
    id: "linux-deb",
    platform: "Linux",
    architecture: "x64",
    package: "DEB",
    description: "Package for Debian, Ubuntu, and compatible distributions.",
    pattern: /\.deb$/,
  },
  {
    id: "linux-rpm",
    platform: "Linux",
    architecture: "x64",
    package: "RPM",
    description: "Package for Fedora, RHEL, and compatible distributions.",
    pattern: /\.rpm$/,
  },
];

/** @param {string} value */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** @param {string} changelog @param {string} version */
export function currentReleaseChanges(changelog, version) {
  const heading = new RegExp(`^## \\[${escapeRegExp(version)}\\](?: - .+)?\\r?$`, "m");
  const match = heading.exec(changelog);
  if (!match) throw new Error(`CHANGELOG.md has no section for ${version}`);
  const bodyStart = changelog.indexOf("\n", match.index + match[0].length);
  if (bodyStart < 0) return "_No categorized changes are listed for this release._";
  const remainder = changelog.slice(bodyStart + 1);
  const nextHeading = /^## \[/m.exec(remainder);
  const body = remainder.slice(0, nextHeading?.index ?? remainder.length).trim();
  return body || "_No categorized changes are listed for this release._";
}

/** @param {string[]} values */
function sentenceList(values) {
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

/** @param {string} repository @param {string} tag @param {string} name */
function assetUrl(repository, tag, name) {
  return `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`;
}

/**
 * @param {{
 *   manifest: { version: string, tag: string, channel: string, previousTag: string, components?: { frontend?: boolean, runtime?: boolean, nativeShell?: boolean } },
 *   changelog: string,
 *   assetNames: string[],
 *   repository: string,
 * }} options
 */
export function createReleaseNotes({ manifest, changelog, assetNames, repository }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    throw new Error(`Invalid GitHub repository: ${repository}`);
  }
  for (const field of ["version", "tag", "channel", "previousTag"]) {
    if (typeof manifest[field] !== "string" || !manifest[field]) {
      throw new Error(`Release manifest field ${field} is required`);
    }
  }
  if (!Array.isArray(assetNames) || assetNames.some((name) => typeof name !== "string")) {
    throw new Error("Release asset names must be a string array");
  }

  const components = manifest.components ?? {
    frontend: true,
    runtime: true,
    nativeShell: true,
  };
  /** @type {string[]} */
  const updated = [];
  if (components.frontend) updated.push("frontend");
  if (components.runtime) updated.push("Agent Runtime");
  if (components.nativeShell) updated.push("desktop app and installers");
  if (updated.length === 0) throw new Error("Release manifest selects no components");

  const changes = currentReleaseChanges(changelog, manifest.version);
  const compareUrl = `https://github.com/${repository}/compare/${encodeURIComponent(manifest.previousTag)}...${encodeURIComponent(manifest.tag)}`;
  const changelogUrl = `https://github.com/${repository}/blob/${encodeURIComponent(manifest.tag)}/CHANGELOG.md`;
  const lines = [
    `> **${manifest.channel.toUpperCase()} release.** Updated components: ${sentenceList(updated)}.`,
    "",
    `## Changes since ${manifest.previousTag}`,
    "",
    changes,
    "",
    `**Version comparison:** [${manifest.previousTag}...${manifest.tag}](${compareUrl}) | [Full changelog](${changelogUrl})`,
    "",
    "## Downloads",
    "",
  ];

  if (components.nativeShell) {
    const rows = DOWNLOADS.map((download) => {
      const matches = assetNames.filter((name) => download.pattern.test(name));
      if (matches.length !== 1) {
        throw new Error(
          `Expected one ${download.id} release asset, found ${matches.length}: ${matches.join(", ")}`,
        );
      }
      const name = matches[0];
      return `| ${download.platform} | ${download.architecture} | ${download.package} | [Download](${assetUrl(repository, manifest.tag, name)}) | ${download.description} |`;
    });
    lines.push(
      "Standard packages are smaller and download the embedding model during first setup. Full packages include it for offline first setup.",
      "",
      "| Platform | Architecture | Package | Link | Description |",
      "| --- | --- | --- | --- | --- |",
      ...rows,
    );
  } else {
    lines.push(
      "Desktop installers are unchanged in this component release. Existing installations receive the selected component updates through the application update channels.",
    );
  }

  lines.push(
    "",
    "Updater signatures, manifests, and developer-facing component artifacts remain available in the Assets section below.",
    "",
  );
  return lines.join("\n");
}

/** @param {string[]} args @param {string} name */
function option(args, name) {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : "";
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const args = process.argv.slice(2);
  const manifest = JSON.parse(await readFile(path.resolve(option(args, "--manifest")), "utf8"));
  const changelog = await readFile(path.resolve(option(args, "--changelog")), "utf8");
  const rawAssets = JSON.parse(await readFile(path.resolve(option(args, "--assets")), "utf8"));
  const assetNames = rawAssets.map((asset) => (typeof asset === "string" ? asset : asset.name));
  const notes = createReleaseNotes({
    manifest,
    changelog,
    assetNames,
    repository: option(args, "--repository"),
  });
  await writeFile(path.resolve(option(args, "--output")), notes);
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entry && fileURLToPath(import.meta.url) === entry) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
