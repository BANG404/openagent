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
  });

  test("explains component-only releases without inventing installer links", () => {
    const notes = createReleaseNotes({
      manifest: {
        version: "1.2.3",
        tag: "v1.2.3-beta.1",
        channel: "beta",
        previousTag: "v1.2.2",
        components: { frontend: true, runtime: false, nativeShell: false },
      },
      changelog,
      assetNames: ["openagent-frontend.tar.gz"],
      repository: "BANG404/openagent",
    });

    expect(notes).toContain("Updated components: frontend.");
    expect(notes).toContain("Desktop installers are unchanged");
    expect(notes).not.toContain("| Platform | Architecture |");
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
