import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

test("standalone transport recovers after startup and disconnect without fallback", async () => {
  const probe = fileURLToPath(new URL("./fixtures/tauriTransportProbe.ts", import.meta.url));
  const child = Bun.spawn([Bun.argv[0], probe], { stdout: "pipe", stderr: "pipe", timeout: 10000 });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code, stderr).toBe(0);
  expect(stdout).toContain("recovers without a mode cache");
});
