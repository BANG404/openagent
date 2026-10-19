import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const home = process.env.OPENAGENT_HOME!;
const scenario = basename(home);
mkdirSync(home, { recursive: true });
if (process.argv.includes("--desktop-bootstrap")) {
  console.log(
    JSON.stringify({
      schema_version: 1,
      status: scenario === "transition" ? "transition_required" : "ready",
      ...(scenario === "transition" ? { transition: { reset_conversations: true } } : {}),
    }),
  );
  process.exit(0);
}
writeFileSync(join(home, "started"), String(process.pid));
if (scenario === "exit") process.exit(17);
process.stdin.on("data", (bytes) => {
  if (bytes.toString().includes("shutdown")) {
    writeFileSync(join(home, "stopped"), "graceful");
    process.exit(0);
  }
});
if (scenario === "invalid-json") console.log("not a ready record");
else if (scenario !== "silent") {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.headers.authorization !== `Bearer ${process.env.OPENAGENT_DESKTOP_RUNTIME_TOKEN}`) {
      response.writeHead(401).end();
      return;
    }
    response.end(
      JSON.stringify(
        request.url === "/api/desktop/health"
          ? { status: "ok", pid: process.pid }
          : { fixture: true },
      ),
    );
  });
  server.listen(0, "127.0.0.1", () => {
    const address = server.address() as { port: number };
    console.log(
      JSON.stringify({
        type: "ready",
        endpoint: `http://127.0.0.1:${address.port}`,
        version: "4.0.0",
        pid: process.pid,
        protocol: {
          min: scenario === "bad-protocol" ? 2 : 3,
          max: scenario === "bad-protocol" ? 2 : 3,
        },
      }),
    );
  });
}
