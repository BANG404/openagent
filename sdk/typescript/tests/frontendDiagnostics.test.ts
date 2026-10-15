import { expect, test } from "bun:test";
import { OpenAgentClient } from "../src/client";
import { isDesktopProductCommand } from "../src/contracts";
import { HttpTransport } from "../src/httpTransport";

test("frontend diagnostics enter the Runtime product transport", async () => {
  const calls: { url: string; body: unknown }[] = [];
  const client = new OpenAgentClient(
    new HttpTransport({
      baseUrl: "https://openagent.runtime",
      fetch: (async (url, init) => {
        calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        return Response.json(null);
      }) as typeof fetch,
    }),
  );
  expect(isDesktopProductCommand("report_frontend_diagnostic")).toBe(true);
  await client.invokeProduct("report_frontend_diagnostic", {
    eventName: "frontend_uncaught_error",
    component: "window",
    errorKind: "TypeError",
  });
  expect(calls).toEqual([
    {
      url: "https://openagent.runtime/api/desktop/operations",
      body: {
        operation: "report_frontend_diagnostic",
        args: {
          eventName: "frontend_uncaught_error",
          component: "window",
          errorKind: "TypeError",
        },
      },
    },
  ]);
});

test("explicit support reports carry only the selected conversation ID to Runtime", async () => {
  const bodies: unknown[] = [];
  const client = new OpenAgentClient(
    new HttpTransport({
      baseUrl: "https://openagent.runtime",
      fetch: (async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return Response.json({ reportId: "fixture-receipt" });
      }) as typeof fetch,
    }),
  );
  expect(isDesktopProductCommand("submit_problem_report")).toBe(true);
  for (const convId of [null, "selected-conversation"]) {
    expect(
      await client.invokeProduct("submit_problem_report", { description: "fixture", convId }),
    ).toEqual({ reportId: "fixture-receipt" });
  }
  expect(bodies).toEqual(
    [null, "selected-conversation"].map((convId) => ({
      operation: "submit_problem_report",
      args: { description: "fixture", convId },
    })),
  );
});
