// @ts-check
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";
import { checkMcpUiInteractions } from "./mcp-ui-interaction-checks.mjs";

assert(process.env.TAURI_PILOT_SOCKET, "Select the isolated native window");
const artifacts = mkdtempSync(join(tmpdir(), "openagent-mcp-ui-transcript-"));
const scenario = fileURLToPath(
  new URL("../tests/blackbox/mcp-ui-transcript.toml", import.meta.url),
);
/** @param {string[]} args */
function pilot(args) {
  const result = spawnSync("tauri-pilot", [...args, "--window", "main"], {
    cwd: artifacts,
    env: process.env,
    encoding: "utf8",
    windowsHide: true,
    timeout: 45000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  return result.stdout.trim();
}
/** @param {string} source */
const evaluate = (source) => pilot(["eval", source]);
/** @param {string} expression */
async function until(expression) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (evaluate(expression) === "true") return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`MCP UI assertion timed out: ${expression}`);
}
pilot(["ping"]);
pilot(["snapshot", "-i"]);
const original = pilot(["url"]);
const resourceServer = spawn(
  process.execPath,
  [
    "-e",
    `
  const {createServer}=require('node:http');
  const {readFileSync}=require('node:fs');
  const html=readFileSync(process.argv[1],'utf8').replace('</body>',readFileSync(process.argv[2],'utf8')+'</body>');
  const server=createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html','access-control-allow-origin':'*'});res.end(html);});
  server.listen(0,'127.0.0.1',()=>console.log(server.address().port));
`,
    join(process.cwd(), "plugins/mermaid/ui/app.html"),
    join(process.cwd(), "tests/fixtures/mcp-ui-probe.html"),
  ],
  { windowsHide: true, stdio: ["ignore", "pipe", "inherit"] },
);
const [port] = await once(resourceServer.stdout, "data");
try {
  for (const theme of ["light", "dark"])
    for (const locale of ["en", "zh"]) {
      const url = new URL(original);
      url.search = new URLSearchParams({
        "mcp-ui-transcript-preview": "",
        "mcp-ui-transcript-preview-theme": theme,
        "mcp-ui-transcript-preview-locale": locale,
        "mcp-ui-transcript-preview-resource": `http://127.0.0.1:${String(port).trim()}/`,
      }).toString();
      for (const pass of ["initial", "reload"]) {
        pilot(["navigate", url.href]);
        pilot(["wait", "[data-mcp-result]"]);
        pilot(["snapshot", "-i"]);
        assert.equal(
          evaluate(
            `(()=>{const name=[...document.querySelectorAll('.tool-name')].find(n=>n.textContent==='plugin_mermaid_render_mermaid');return !!name && !name.closest('.tool-call-group,.process-records') && !document.querySelector('.mcp-app-frame');})()`,
          ),
          "true",
        );
        evaluate(
          `window.__mcpRenderStatus=null;window.addEventListener('message',e=>{const frame=document.querySelector('.mcp-app-frame iframe');if(e.source===frame?.contentWindow && e.data?.method==='ui/update-model-context')window.__mcpRenderStatus=e.data.params?.structuredContent?.mermaid;});`,
        );
        pilot(["click", "[data-mcp-result]"]);
        await until(`window.__mcpRenderStatus?.status==='ready'`);
        assert.equal(
          evaluate(
            `(()=>{const frame=document.querySelector('.mcp-app-frame');window.__mcpOriginalFrame=frame.querySelector('iframe');return !frame.closest('.tool-call-group,.process-records') && getComputedStyle(frame).display!=='none';})()`,
          ),
          "true",
        );
        const { widget } = await checkMcpUiInteractions({
          evaluate,
          until,
          capture: (label) =>
            captureBlackboxScreenshot(
              pilot,
              join(artifacts, `${theme}-${locale}-${pass}-${label}.png`),
            ),
        });
        const editedSource = "flowchart LR\nLocalEdit --> Preserved";
        await widget("input", editedSource);
        await widget("click", "render");
        await until(
          `window.__mcpRenderStatus?.status==='ready' && window.__mcpRenderStatus?.source===${JSON.stringify(editedSource)}`,
        );
        pilot(["click", "[data-mcp-finalize]"]);
        await until(`document.querySelector('[data-stage="completed"]')!==null`);
        assert.equal(
          evaluate(
            `(()=>{const frame=document.querySelector('.mcp-app-frame');return frame?.querySelector('iframe')===window.__mcpOriginalFrame && !frame.closest('.tool-call-group,.process-records');})()`,
          ),
          "true",
        );
        assert.equal(
          (await widget("inspect")).source,
          editedSource,
          "Final reconciliation must retain local edits",
        );
        pilot(["snapshot", "-i"]);
        pilot(["run", scenario]);
        captureBlackboxScreenshot(pilot, join(artifacts, `${theme}-${locale}-${pass}.png`));
        await widget("mode", "fullscreen");
        await widget("close");
        await until(
          `document.querySelector('.mcp-app-frame')?.classList.contains('closed') && !document.querySelector(':popover-open')`,
        );
        pilot(["click", "[data-mcp-fail]"]);
        await until(`!document.querySelector('.mcp-app-frame')`);
        assert.equal(
          evaluate(
            `(()=>{const name=[...document.querySelectorAll('.tool-name')].find(n=>n.textContent==='plugin_mermaid_render_mermaid');return !!name && !name.closest('.tool-call-group,.process-records');})()`,
          ),
          "true",
        );
      }
    }
} catch (error) {
  captureBlackboxScreenshot(pilot, join(artifacts, "failure.png"));
  console.error(`MCP UI transcript failed. Artifacts: ${artifacts}`);
  throw error;
} finally {
  resourceServer.kill();
  pilot(["navigate", original]);
}
console.log(`MCP UI transcript black-box passed. Artifacts: ${artifacts}`);
