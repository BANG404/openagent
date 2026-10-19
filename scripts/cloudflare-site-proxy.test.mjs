import { expect, test } from "bun:test";
import { proxySite } from "./cloudflare-site-proxy.mjs";

test("site entry keeps the project base and rejects unrelated paths and writes", async () => {
  const root = await proxySite(new Request("https://openagent.ibat.ac.cn/?lang=zh"));
  expect(root.headers.get("location")).toBe("https://openagent.ibat.ac.cn/openagent/?lang=zh");
  expect((await proxySite(new Request("https://openagent.ibat.ac.cn/other"))).status).toBe(404);
  expect(
    (await proxySite(new Request("https://openagent.ibat.ac.cn/openagent/", { method: "POST" })))
      .status,
  ).toBe(405);
});

test("static reads use a fixed origin, omit credentials and refresh download metadata promptly", async () => {
  const response = await proxySite(
    new Request("https://openagent.ibat.ac.cn/openagent/downloads.json", {
      headers: { Cookie: "private=value", Authorization: "secret" },
    }),
    async (request, options) => {
      expect(request.url).toBe("https://bang404.github.io/openagent/downloads.json");
      expect([...request.headers]).toEqual([]);
      expect(options.cf.cacheTtlByStatus["200-299"]).toBe(60);
      return new Response("{}", {
        headers: { "Content-Type": "application/json", "Set-Cookie": "unwanted=1" },
      });
    },
  );
  expect(await response.text()).toBe("{}");
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(response.headers.get("cache-control")).toBe("no-cache");
});

test("documentation redirects stay on the accelerated domain", async () => {
  const response = await proxySite(
    new Request("https://openagent.ibat.ac.cn/openagent/docs"),
    async () => Response.redirect("https://bang404.github.io/openagent/docs/", 301),
  );
  expect(response.headers.get("location")).toBe("https://openagent.ibat.ac.cn/openagent/docs/");
});
