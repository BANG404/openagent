import { expect, test } from "bun:test";
import { generateReleaseIndex, projectRelease, repositoryPath } from "./plugin-release-index.mjs";

const registry = { plugins: [{ repository: "https://github.com/Example/Plugin.git" }] };
const stable = {
  draft: false,
  prerelease: false,
  tag_name: "v2.0.0",
  html_url: "https://github.com/Example/Plugin/releases/tag/v2.0.0",
  body: 'Release notes\n<!-- openagent-plugin {"plugin_protocol":{"min":1,"max":2}} -->',
  assets: [
    {
      name: "plugin.zip",
      browser_download_url: "https://github.com/Example/Plugin/releases/download/v2.0.0/plugin.zip",
      digest: `sha256:${"a".repeat(64)}`,
    },
  ],
};

test("publishes stable release history with digests and protocol ranges using only server credentials", async () => {
  /** @type {{ url: string; token: string | null }[]} */
  const requests = [];
  const fetcher = /** @type {typeof fetch} */ (
    async (url, init) => {
      requests.push({ url: String(url), token: new Headers(init?.headers).get("Authorization") });
      return Response.json([
        stable,
        { ...stable, prerelease: true },
        { ...stable, draft: true },
        { ...stable, tag_name: "v1.0.0", assets: [{ ...stable.assets[0], digest: null }] },
      ]);
    }
  );
  const index = await generateReleaseIndex(registry, {
    token: "fixture-token",
    fetcher,
    now: 5000,
  });
  expect(requests).toEqual([
    {
      url: "https://api.github.com/repos/example/plugin/releases?per_page=100",
      token: "Bearer fixture-token",
    },
  ]);
  expect(index.generated_at).toBe(5);
  expect(index.repositories["example/plugin"]).toHaveLength(2);
  expect(index.repositories["example/plugin"][0].assets).toEqual(stable.assets);
  expect(index.repositories["example/plugin"][0].body).toStartWith("<!-- openagent-plugin ");
  expect(index.repositories["example/plugin"][1].assets).toEqual([]);
  expect(JSON.stringify(index)).not.toContain("fixture-token");
});

test("an upstream failure prevents publishing an incomplete successful snapshot", async () => {
  const fetcher = /** @type {typeof fetch} */ (async () => new Response("", { status: 429 }));
  await expect(generateReleaseIndex(registry, { fetcher })).rejects.toThrow("HTTP 429");
});

test("a repository with no releases is still covered by the index", async () => {
  const fetcher = /** @type {typeof fetch} */ (async () => Response.json([]));
  const index = await generateReleaseIndex(registry, { fetcher });
  expect(index.repositories["example/plugin"]).toEqual([]);
});

test("rejects credentials and foreign registry hosts", () => {
  expect(() => repositoryPath("https://token@github.com/example/plugin")).toThrow();
  expect(() => repositoryPath("https://gitlab.com/example/plugin")).toThrow();
});

test("malformed compatibility declarations remain explicit for Runtime rejection", () => {
  const release = projectRelease(
    { ...stable, body: "Notes <!-- openagent-plugin invalid" },
    "example/plugin",
  );
  expect(release?.body).toBe("<!-- openagent-plugin invalid");
});
