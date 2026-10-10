import { expect, test } from "bun:test";
import { publishReleaseIndex } from "./publish-plugin-release-index.mjs";

const options = {
  repository: "example/host",
  target: "a".repeat(40),
  token: "server-only-token",
  content: JSON.stringify({
    schema_version: 1,
    generated_at: Math.floor(Date.now() / 1000),
    repositories: { "example/plugin": [] },
  }),
};
const previous = { id: 2, name: "plugin-releases.json", size: 9 };
const release = { id: 1, immutable: false, draft: false, prerelease: true, assets: [previous] };

/** @param {(url: string, init: RequestInit) => Response | Promise<Response>} callback */
function fetcher(callback) {
  return /** @type {typeof fetch} */ (
    async (url, init = {}) => {
      expect(new Headers(init.headers).get("Authorization")).toBe(`Bearer ${options.token}`);
      expect(new URL(String(url)).hostname).toMatch(/^(api|uploads)\.github\.com$/);
      return callback(String(url), init);
    }
  );
}

test("creates a draft channel and uploads before publishing as a non-latest prerelease", async () => {
  /** @type {string[]} */
  const calls = [];
  await publishReleaseIndex({
    ...options,
    fetcher: fetcher((url, init) => {
      calls.push(`${init.method ?? "GET"} ${url}`);
      if (url.endsWith("/tags/plugin-index")) return new Response(null, { status: 404 });
      if (url.endsWith("/releases")) {
        expect(JSON.parse(String(init.body))).toMatchObject({
          tag_name: "plugin-index",
          draft: true,
          prerelease: true,
          make_latest: "false",
        });
        return Response.json({ ...release, draft: true, assets: [] });
      }
      if (url.includes("/assets?name=")) {
        expect(init.body).toBe(options.content);
        expect(String(init.body)).not.toContain(options.token);
        return Response.json({ id: 3 });
      }
      expect(JSON.parse(String(init.body))).toEqual({
        draft: false,
        prerelease: true,
        make_latest: "false",
      });
      return Response.json({});
    }),
  });
  expect(calls.map((call) => call.split(" ")[0])).toEqual(["GET", "POST", "POST", "PATCH"]);
});

test("backs up the previous asset before replacing it and preserves the fixed tag", async () => {
  /** @type {string[]} */
  const methods = [];
  await publishReleaseIndex({
    ...options,
    fetcher: fetcher((url, init) => {
      methods.push(init.method ?? "GET");
      if (url.endsWith("/tags/plugin-index")) return Response.json(release);
      if (init.method === "DELETE") return new Response(null, { status: 204 });
      if (url.includes("uploads.github.com")) return Response.json({ id: 3 });
      expect(new Headers(init.headers).get("Accept")).toBe("application/octet-stream");
      return new Response("old-index");
    }),
  });
  expect(methods).toEqual(["GET", "GET", "DELETE", "POST"]);
});

test("restores old bytes and removes a failed starter asset when replacement fails", async () => {
  let uploadCount = 0;
  /** @type {number[]} */
  const deleted = [];
  await expect(
    publishReleaseIndex({
      ...options,
      fetcher: fetcher((url, init) => {
        if (url.endsWith("/tags/plugin-index")) return Response.json(release);
        if (init.method === "DELETE") {
          deleted.push(Number(url.split("/").at(-1)));
          return new Response(null, { status: 204 });
        }
        if (url.includes("uploads.github.com")) {
          if (++uploadCount === 1) return new Response(null, { status: 502 });
          expect(new TextDecoder().decode(/** @type {Uint8Array} */ (init.body))).toBe("old-index");
          return Response.json({ id: 4 });
        }
        if (url.includes("per_page")) return Response.json([{ ...previous, id: 3 }]);
        return new Response("old-index");
      }),
    }),
  ).rejects.toThrow("HTTP 502");
  expect(deleted).toEqual([2, 3]);
  expect(uploadCount).toBe(2);
});

test("an immutable channel or unreadable previous asset fails before deletion", async () => {
  for (const immutable of [true, false]) {
    await expect(
      publishReleaseIndex({
        ...options,
        fetcher: fetcher((url, init) => {
          expect(init.method).toBeUndefined();
          if (url.endsWith("/tags/plugin-index")) return Response.json({ ...release, immutable });
          return new Response(null, { status: 503 });
        }),
      }),
    ).rejects.toThrow(immutable ? "rolling asset updates" : "HTTP 503");
  }
});

test("invalid or expired snapshots cannot begin publication", async () => {
  for (const content of [
    "{}",
    JSON.stringify({ ...JSON.parse(options.content), generated_at: 1 }),
  ]) {
    await expect(
      publishReleaseIndex({
        ...options,
        content,
        fetcher: /** @type {typeof fetch} */ (
          () => {
            throw new Error("Unexpected network request");
          }
        ),
      }),
    ).rejects.toThrow("invalid or expired");
  }
});

test("reports both failures when the previous bytes cannot be restored", async () => {
  await expect(
    publishReleaseIndex({
      ...options,
      fetcher: fetcher((url, init) => {
        if (url.endsWith("/tags/plugin-index")) return Response.json(release);
        if (init.method === "DELETE") return new Response(null, { status: 204 });
        if (url.includes("uploads.github.com")) return new Response(null, { status: 502 });
        if (url.includes("per_page")) return Response.json([]);
        return new Response("old-index");
      }),
    }),
  ).rejects.toThrow("upload and restoration both failed");
});
