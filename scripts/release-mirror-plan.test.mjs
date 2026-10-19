import { expect, test } from "bun:test";
import {
  buildMirrorPlan,
  githubReleasePath,
  mirrorCapacity,
  mirrorKey,
  selectMirrorReleases,
} from "./release-mirror-plan.mjs";
import { downloadChannel } from "./pages-downloads.mjs";

/** @param {string} name @param {string} [tag] */
function asset(name, tag = "v1.0.0-beta.2") {
  return {
    name,
    size: 100,
    digest: `sha256:${"a".repeat(64)}`,
    browser_download_url: `https://github.com/BANG404/openagent/releases/download/${tag}/${name}`,
  };
}
/** @param {string} tag @param {string[]} names @param {boolean} [draft] */
function release(tag, names, draft = false) {
  return { tag_name: tag, draft, published_at: tag, assets: names.map((name) => asset(name, tag)) };
}

test("website selects the complete installer without WebView2 regardless of asset order", () => {
  const current = release("v1.0.0-beta.2", [
    "OpenAgent_1.0.0-beta.2_x64-setup.exe",
    "OpenAgent_1.0.0-beta.2_x64-full-setup.exe",
    "OpenAgent_1.0.0-beta.2_x64-full-no-webview-setup.exe",
  ]);
  expect(downloadChannel(current)?.assets.windows).toEndWith("_x64-full-no-webview-setup.exe");
  const key = mirrorKey(current.tag_name, current.assets[2].name);
  expect(downloadChannel(current, [key])?.assets.windows).toBe(
    `https://dl-openagent.ibat.ac.cn/${key}`,
  );
  expect(downloadChannel(current, [])?.assets.windows).toStartWith("https://github.com/");
  expect(
    downloadChannel({ ...current, assets: [current.assets[0]] })?.assets.windows,
  ).toBeUndefined();
  expect(downloadChannel({ ...current, draft: true })).toBeNull();
});

test("mirror follows update manifests and signatures without uploading offline or build caches", async () => {
  const tag = "v1.0.0-beta.2";
  const current = release(tag, [
    "OpenAgent_x64-full-no-webview-setup.exe",
    "OpenAgent_x64-full-setup.exe",
    "shell-build-windows-x64.tar.gz",
    "latest.json",
    "OpenAgent_x64-setup.exe",
    "OpenAgent_x64-setup.exe.sig",
    "openagent-sdk-manifest.json",
    "openagent-sdk-manifest.json.sig",
    "openagent-server-windows-x64.exe",
    "codex-command-runner.exe",
  ]);
  const plan = await buildMirrorPlan([current], async (entry) =>
    entry.name === "latest.json"
      ? {
          platforms: {
            windows: { url: asset("OpenAgent_x64-setup.exe", tag).browser_download_url },
          },
        }
      : {
          artifacts: { windows: { file: "openagent-server-windows-x64.exe" } },
          helpers: { runner: { file: "codex-command-runner.exe" } },
        },
  );
  const names = plan.map((entry) => entry.asset.name);
  expect(names).toContain("OpenAgent_x64-full-no-webview-setup.exe");
  expect(names).toContain("OpenAgent_x64-setup.exe.sig");
  expect(names).toContain("openagent-sdk-manifest.json.sig");
  expect(names).toContain("codex-command-runner.exe");
  expect(names).not.toContain("OpenAgent_x64-full-setup.exe");
  expect(names).not.toContain("shell-build-windows-x64.tar.gz");
});

test("missing, unsigned, corrupted-descriptor, draft or escaping dependencies fail closed", async () => {
  const current = release("v1.0.0-beta.2", [
    "openagent-sdk-manifest.json",
    "openagent-sdk-manifest.json.sig",
  ]);
  await expect(
    buildMirrorPlan([current], async () => ({ artifact: { file: "missing.exe" } }), [current]),
  ).rejects.toThrow("Missing published");
  await expect(
    buildMirrorPlan([{ ...current, assets: current.assets.slice(0, 1) }], async () => ({}), [
      current,
    ]),
  ).rejects.toThrow("signature");
  await expect(
    buildMirrorPlan(
      [{ ...current, assets: current.assets.map((entry) => ({ ...entry, digest: undefined })) }],
      async () => ({}),
      [current],
    ),
  ).rejects.toThrow("SHA-256");
  await expect(
    buildMirrorPlan([{ ...current, draft: true }], async () => ({}), [current]),
  ).rejects.toThrow("published");
  for (const url of [
    "https://example.com/file",
    "https://github.com/BANG404/openagent/releases/download/tag/%2e%2e",
    "https://github.com/BANG404/openagent/releases/download/tag/file?secret=x",
  ])
    expect(() => githubReleasePath(url)).toThrow();
});

test("retention keeps each channel's recent installers and rolling manifests, never drafts or dev kits", () => {
  const names = ["OpenAgent_x64-full-no-webview-setup.exe"];
  const tags = [
    "v1.0.0-beta.1",
    "v1.0.0-beta.2",
    "v1.0.0-beta.3",
    "v1.0.0",
    "runtime-beta",
    "runtime-dev-123",
  ];
  const chosen = selectMirrorReleases([
    ...tags.map((tag) => release(tag, names)),
    release("v9.0.0", names, true),
  ]).map((entry) => entry.tag_name);
  expect(chosen).toEqual(["v1.0.0-beta.3", "v1.0.0-beta.2", "v1.0.0", "runtime-beta"]);
});

test("capacity guard accounts for upload overlap before old live resources are retired", () => {
  const plan = [{ key: "new", asset: asset("new") }];
  expect(() => mirrorCapacity([{ key: "old", size: 150 }], plan, 200)).toThrow(
    "exceed byte budget",
  );
  expect(mirrorCapacity([{ key: "new", size: 100 }], plan, 200)).toEqual({
    peak: 100,
    retained: 100,
  });
});
