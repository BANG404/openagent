import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const probe = fileURLToPath(new URL("./fixtures/startup-lifecycle-probe.ts", import.meta.url));

for (const renderer of ["ready", "pending", "failed"]) {
  for (const snapshot of ["ready", "retry", "failed"]) {
    for (const listeners of ["ready", "failed"]) {
      test(`startup progresses with renderer=${renderer}, snapshot=${snapshot}, listeners=${listeners}`, async () => {
        const process = Bun.spawn([Bun.argv[0], probe, renderer, snapshot, listeners], {
          stdout: "pipe",
          stderr: "pipe",
          timeout: 3000,
        });
        const [stdout, stderr, code] = await Promise.all([
          new Response(process.stdout).text(),
          new Response(process.stderr).text(),
          process.exited,
        ]);
        expect(code, stderr).toBe(0);
        const result = JSON.parse(stdout.trim().split(/\r?\n/).at(-1)!) as {
          calls: string[];
          diagnostics: string[];
          loading: boolean;
        };
        expect(result.loading).toBe(false);
        expect(result.calls.filter((call) => call === "snapshot")).toHaveLength(
          snapshot === "ready" ? 1 : 2,
        );
        expect(result.calls.filter((call) => call === "subscribe")).toHaveLength(1);
        expect(result.calls).toContain("reveal_main_window");
        const restoredAt = result.calls.indexOf(snapshot === "failed" ? "restore" : "apply");
        expect(restoredAt).toBeGreaterThan(-1);
        expect(result.calls.indexOf("subscribe")).toBeGreaterThan(restoredAt);
        expect(result.calls.indexOf("reveal_main_window")).toBeGreaterThan(
          result.calls.indexOf("subscribe"),
        );
        expect(result.diagnostics.includes("startup_event_delivery_failed")).toBe(
          listeners === "failed",
        );
        expect(result.calls.includes("restore")).toBe(snapshot === "failed");
      });
    }
  }
}
