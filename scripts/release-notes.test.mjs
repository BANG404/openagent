import { describe, expect, test } from "bun:test";
import { createReleaseNotes, currentReleaseChanges } from "./release-notes.mjs";

const changelog = `# Changelog

## [1.2.3] - 2026-09-02

### Features
- Add release download shortcuts

### Bug Fixes
- Keep updater metadata separate

## [1.2.2] - 2026-08-20

- Previous release
`;

const nativeAssets = [
  "openagent_1.2.3_x64-setup.exe",
  "openagent_1.2.3_x64-full-setup.exe",
  "openagent_1.2.3_aarch64.dmg",
  "openagent_1.2.3_aarch64-full.dmg",
  "openagent_1.2.3_x64.dmg",
  "openagent_1.2.3_x64-full.dmg",
  "openagent_1.2.3_amd64.AppImage",
  "openagent_1.2.3_amd64-full.AppImage",
  "openagent_1.2.3_amd64.deb",
  "openagent-1.2.3-1.x86_64.rpm",
  "latest.json",
  "openagent_1.2.3_x64-setup.exe.sig",
  "openagent-server-windows-x64.exe",
  "codex-windows-sandbox-setup.exe",
  "codex-command-runner.exe",
];

describe("release notes", () => {
  test("extracts only the current changelog section", () => {
    expect(currentReleaseChanges(changelog, "1.2.3")).toBe(`### Features
- Add release download shortcuts

### Bug Fixes
- Keep updater metadata separate`);
  });

  test("describes version differences and user-facing native downloads", () => {
    const notes = createReleaseNotes({
      manifest: {
        version: "1.2.3",
        tag: "v1.2.3",
        channel: "stable",
        previousTag: "v1.2.2",
        components: { frontend: true, runtime: true, nativeShell: true },
      },
      changelog,
      assetNames: nativeAssets,
      repository: "BANG404/openagent",
    });

    expect(notes).toContain("## Changes since v1.2.2");
    expect(notes).toContain("/compare/v1.2.2...v1.2.3");
    expect(notes).toContain("### Features");
    expect(notes).toContain("| Windows | x64 | Standard installer | [Download](");
    expect(notes).toContain("| macOS | Apple Silicon | Full DMG | [Download](");
    expect(notes).toContain("| Linux | x64 | DEB | [Download](");
    expect(notes.match(/\| \[Download\]\(/g)).toHaveLength(10);
    expect(notes).not.toContain("latest.json)");
    expect(notes).not.toContain("setup.exe.sig)");
    expect(notes).not.toContain("openagent-server-windows-x64.exe)");
    expect(notes).not.toContain("codex-windows-sandbox-setup.exe)");
  });

  test("selects the current desktop version among helper, foreign, and older installer assets", () => {
    const notes = createReleaseNotes({
      manifest: { version: "1.2.3", tag: "v1.2.3", channel: "stable", previousTag: "v1.2.2" },
      changelog,
      assetNames: [
        ...nativeAssets.map((name) => name.replace("openagent", "OpenAgent")),
        ...nativeAssets.map((name) => name.replace("1.2.3", "1.2.2")),
        "other_1.2.3_x64-setup.exe",
      ],
      repository: "BANG404/openagent",
    });
    expect(notes.match(/\| \[Download\]\(/g)).toHaveLength(10);
    expect(notes).toContain("OpenAgent_1.2.3_x64-setup.exe)");
    expect(notes).not.toContain("openagent_1.2.2_x64-setup.exe)");
    expect(notes).not.toContain("other_1.2.3_x64-setup.exe)");
  });

  test("helpers and older installers cannot replace a missing current Windows installer", () => {
    expect(() =>
      createReleaseNotes({
        manifest: { version: "1.2.3", tag: "v1.2.3", channel: "stable", previousTag: "v1.2.2" },
        changelog,
        assetNames: [
          ...nativeAssets.filter((name) => name !== "openagent_1.2.3_x64-setup.exe"),
          "openagent_1.2.2_x64-setup.exe",
        ],
        repository: "BANG404/openagent",
      }),
    ).toThrow("Expected one windows-standard release asset, found 0");
  });

  test.each([
    [{ frontend: true, runtime: false, nativeShell: false }, "frontend"],
    [{ frontend: false, runtime: true, nativeShell: false }, "Agent Runtime"],
  ])("links current installers when only %s changes", (components, updated) => {
    const notes = createReleaseNotes({
      manifest: {
        version: "1.2.3",
        tag: "v1.2.3-beta.1",
        channel: "beta",
        previousTag: "v1.2.2",
        components,
      },
      changelog,
      assetNames: nativeAssets,
      repository: "BANG404/openagent",
    });

    expect(notes).toContain(`Updated components: ${updated}.`);
    expect(notes.match(/\| \[Download\]\(/g)).toHaveLength(10);
    expect(notes).toContain("/v1.2.3-beta.1/openagent_1.2.3_x64-setup.exe)");
  });

  test("blocks a component release that has only resources or older installers", () => {
    expect(() =>
      createReleaseNotes({
        manifest: {
          version: "1.2.3",
          tag: "v1.2.3-beta.1",
          channel: "beta",
          previousTag: "v1.2.2",
          components: { frontend: true, runtime: false, nativeShell: false },
        },
        changelog,
        assetNames: [
          "openagent-frontend.tar.gz",
          ...nativeAssets.map((name) => name.replace("1.2.3", "1.2.2")),
        ],
        repository: "BANG404/openagent",
      }),
    ).toThrow("Expected one windows-standard release asset, found 0");
  });

  test("fails native publication when a quick-download asset is missing", () => {
    expect(() =>
      createReleaseNotes({
        manifest: {
          version: "1.2.3",
          tag: "v1.2.3",
          channel: "stable",
          previousTag: "v1.2.2",
          components: { frontend: true, runtime: true, nativeShell: true },
        },
        changelog,
        assetNames: nativeAssets.filter((name) => !name.endsWith(".rpm")),
        repository: "BANG404/openagent",
      }),
    ).toThrow("Expected one linux-rpm release asset");
  });
});
