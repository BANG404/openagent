// @ts-check
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { resolveBlackboxHome } from "./tauri-test-environment.mjs";

if (!process.env.TAURI_PILOT_SOCKET || !process.env.OPENAGENT_HOME)
  throw new Error("Select an isolated OPENAGENT_HOME and TAURI_PILOT_SOCKET");
const home = resolveBlackboxHome(process.env);
if (!home.includes(".openagent-dev")) throw new Error("Use an isolated development home");
const artifacts = join(home, "mcp-approval-artifacts");
mkdirSync(artifacts, { recursive: true });
/** @param {string[]} args */
function pilot(args) {
  const result = spawnSync("tauri-pilot", [...args, "--window", "main"], {
    cwd: artifacts,
    env: process.env,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}
/** @param {string} script */
function evaluate(script) {
  return pilot(["eval", script]);
}
function cleanup() {
  evaluate("(async () => { await window.__mcpApprovalCleanup?.(); return true; })()");
}
pilot(["ping"]);
pilot(["snapshot", "-i"]);
evaluate(
  "window.__mcpApprovalAppearance = {classes:document.documentElement.className,lang:document.documentElement.lang}; true",
);
try {
  for (const language of ["en", "zh"])
    for (const theme of ["light", "dark"]) {
      evaluate(`(async () => { const {setLocale}=await import('/src/lib/i18n.ts'); setLocale(${JSON.stringify(language)});
      document.documentElement.classList.toggle('dark', ${theme === "dark"});
      document.documentElement.classList.toggle('light', ${theme === "light"}); return true; })()`);
      for (const outcome of ["deny", "success", "failure"]) {
        evaluate(
          "(async () => { const fixture=await import('/src/lib/mcpAppApprovalFixture.ts'); window.__mcpApprovalCleanup=fixture.mountApprovalFixture(); return true; })()",
        );
        pilot(["assert", "count", "#mcp-approval-fixture .tool-approval", "1"]);
        pilot(["assert", "count", "#mcp-approval-fixture iframe", "0"]);
        pilot(["snapshot", "-i"]);
        pilot(["screenshot", `${language}-${theme}-initial-${outcome}.png`]);
        pilot([
          "click",
          `#mcp-approval-fixture .tool-approval-${outcome === "deny" ? "deny" : "approve"}`,
        ]);
        pilot(["assert", "count", "#mcp-approval-fixture .tool-approval", "0"]);
        pilot(["assert", "count", "#mcp-approval-fixture iframe", "0"]);
        if (outcome !== "deny") {
          evaluate(
            `window.__mcpApprovalCleanup.completeTool(${JSON.stringify(outcome === "success" ? "Rendered" : "Error: failed")}); true`,
          );
          pilot([
            "assert",
            "count",
            "#mcp-approval-fixture iframe",
            outcome === "success" ? "1" : "0",
          ]);
          pilot(["screenshot", `${language}-${theme}-completed-${outcome}.png`]);
        }
        cleanup();
      }
      process.stdout.write(`Tool approval before MCP UI passed: ${language}/${theme}\n`);
    }
} finally {
  cleanup();
  evaluate(
    "(async () => { const {setLocale}=await import('/src/lib/i18n.ts'); setLocale(window.__mcpApprovalAppearance.lang === 'zh' ? 'zh' : 'en'); document.documentElement.className=window.__mcpApprovalAppearance.classes; return true; })()",
  );
}
process.stdout.write("MCP UI initial tool approval checks passed.\n");
