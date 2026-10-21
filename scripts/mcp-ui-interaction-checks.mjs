// @ts-check
import assert from "node:assert/strict";

/** @param {{evaluate:(script:string)=>string, until:(script:string)=>Promise<void>, capture:(label:string)=>void}} driver */
export async function checkMcpUiInteractions({ evaluate, until, capture }) {
  evaluate(
    `window.__mcpTestReplies=new Map();window.addEventListener('message',e=>{if(e.source===document.querySelector('.mcp-app-frame iframe')?.contentWindow&&e.data?.type==='mcp-test-response')window.__mcpTestReplies.set(e.data.id,e.data);});true`,
  );
  /** @param {string} action @param {unknown} [value] @returns {Promise<any>} */
  async function widget(action, value) {
    const id = crypto.randomUUID();
    evaluate(
      `document.querySelector('.mcp-app-frame iframe').contentWindow.postMessage(${JSON.stringify({ type: "mcp-test-request", id, action, value })},'*');true`,
    );
    await until(`window.__mcpTestReplies.has(${JSON.stringify(id)})`);
    const reply = JSON.parse(
      evaluate(`JSON.stringify(window.__mcpTestReplies.get(${JSON.stringify(id)}))`),
    );
    assert(!reply.error, reply.error);
    return reply.result;
  }
  /** @returns {any} */
  const geometry = () =>
    JSON.parse(
      evaluate(
        `(()=>{const f=document.querySelector('.mcp-app-frame');return JSON.stringify({rect:f.getBoundingClientRect().toJSON(),parent:f.parentElement.getBoundingClientRect().toJSON(),viewport:[innerWidth,innerHeight],same:f.querySelector('iframe')===window.__mcpOriginalFrame,hit:document.elementFromPoint(innerWidth/2,innerHeight/2)?.tagName});})()`,
      ),
    );
  const initial = await widget("inspect");
  assert.equal(initial.presentation.editorOpen, false, "Source editing starts collapsed");
  assert.equal(
    initial.presentation.statusHidden,
    true,
    "Successful diagrams keep the canvas clear",
  );
  assert.deepEqual(
    initial.presentation.controls,
    ["fit", "plus", "minus", "expand", "copy", "download"],
    "Use the AGUI diagram toolbar",
  );
  evaluate(
    `window.__mcpPreviousDownload=window.__OPENAGENT_DOWNLOAD__;window.__mcpDownloads=[];window.__OPENAGENT_DOWNLOAD__=file=>{window.__mcpDownloads.push({name:file.filename,mime:file.mimeType,size:file.content.length});};true`,
  );
  try {
    for (const format of ["svg", "png"]) {
      await widget("click", "download");
      await widget("click", `download-${format}`);
      await until(
        `window.__mcpDownloads.some(file=>file.name==='mermaid-diagram.${format}' && file.size>100)`,
      );
    }
  } finally {
    evaluate(
      `window.__OPENAGENT_DOWNLOAD__=window.__mcpPreviousDownload;delete window.__mcpPreviousDownload;true`,
    );
  }
  assert(
    initial.svg?.width > 50 && initial.svg?.height > 20,
    "The diagram must have visible geometry",
  );
  await widget("click", "plus");
  const zoomed = await widget("inspect");
  assert(
    parseFloat(zoomed.transform.slice(6)) > parseFloat(initial.transform.slice(6)),
    "Zoom in must enlarge the diagram",
  );
  await widget("click", "minus");
  await widget("click", "fit");
  const failures = [];
  const originalWidth = geometry().rect.width;
  await widget("size", { width: 50000, height: 50000 });
  let g = geometry();
  assert(
    g.rect.height <= 720,
    "App height requests must stay bounded even when the app reports a new intrinsic size",
  );
  if (g.rect.width > g.parent.width + 1)
    failures.push("An app width request overflows the transcript");
  await widget("size", { width: originalWidth, height: 558 });
  await widget("click", "expand");
  await until(`document.querySelector('.mcp-app-frame').classList.contains('fullscreen')`);
  g = geometry();
  if (
    Math.abs(g.rect.x) > 1 ||
    Math.abs(g.rect.y) > 1 ||
    Math.abs(g.rect.width - g.viewport[0]) > 1 ||
    Math.abs(g.rect.height - g.viewport[1]) > 1
  )
    failures.push("Fullscreen is constrained by the transcript instead of filling the window");
  if (g.hit !== "IFRAME") failures.push("The composer or sidebar paints above fullscreen");
  assert.notEqual(
    evaluate(`getComputedStyle(document.querySelector('.mcp-app-frame')).backgroundColor`),
    "rgba(0, 0, 0, 0)",
    "Fullscreen must paint an opaque surface above native Mica",
  );
  await widget("modal");
  await until(`!!document.querySelector('.mcp-app-modal')`);
  if (
    evaluate(
      `document.elementFromPoint(innerWidth/2,innerHeight/2)?.closest('.mcp-app-modal')!==null`,
    ) !== "true"
  )
    failures.push("The app modal is hidden behind fullscreen");
  evaluate(`document.querySelector('.mcp-app-modal-header button').click();true`);
  await widget("escape");
  await new Promise((done) => setTimeout(done, 100));
  if (
    evaluate(`document.querySelector('.mcp-app-frame').classList.contains('fullscreen')`) === "true"
  ) {
    failures.push("Escape inside the widget cannot leave fullscreen");
    await widget("click", "expand");
  }
  await widget("mode", "pip");
  await until(`document.querySelector('.mcp-app-frame').classList.contains('pip')`);
  g = geometry();
  if (
    g.rect.width > 361 ||
    g.rect.right > g.viewport[0] ||
    g.rect.bottom > g.viewport[1] ||
    g.rect.x < 0 ||
    g.rect.y < 0
  )
    failures.push("Picture in picture is outside its viewport bounds");
  evaluate(`document.querySelector('.mcp-app-chrome button').click();true`);
  await until(`!document.querySelector('.mcp-app-frame').classList.contains('pip')`);
  assert.equal(geometry().same, true, "Mode changes must retain the original iframe");
  assert.equal(
    (await widget("inspect")).source,
    initial.source,
    "Mode changes must preserve the source",
  );
  const longSource =
    "flowchart TD\n" +
    Array.from(
      { length: 40 },
      (_, i) => `N${i}["步骤 ${i}: Verify the complete workflow"] --> N${i + 1}`,
    ).join("\n");
  await widget("input", longSource);
  await widget("click", "render");
  await until(
    `window.__mcpRenderStatus?.status==='ready' && window.__mcpRenderStatus?.source===${JSON.stringify(longSource)}`,
  );
  await widget("click", "fit");
  const long = await widget("inspect");
  if (long.svg.height < long.viewport.height * 0.65 || long.svg.height > long.viewport.height + 1)
    failures.push("Fit makes a tall diagram unnecessarily tiny or clips it");
  if (
    long.svg.top < long.viewport.top ||
    long.svg.bottom > long.viewport.bottom ||
    long.svg.left < long.viewport.left ||
    long.svg.right > long.viewport.right
  )
    failures.push("The fitted diagram is outside the visible canvas");
  const originalWindow = geometry().viewport;
  evaluate(
    `(async()=>{const {getCurrentWindow}=await import('/node_modules/@tauri-apps/api/window.js');const {LogicalSize}=await import('/node_modules/@tauri-apps/api/dpi.js');await getCurrentWindow().setSize(new LogicalSize(${originalWindow[0]},900));return true;})()`,
  );
  await widget("click", "expand");
  await until(`document.querySelector('.mcp-app-frame').classList.contains('fullscreen')`);
  const expanded = await widget("inspect");
  if (expanded.viewport.height <= long.viewport.height + 20)
    failures.push("Fullscreen does not give the diagram more vertical space");
  assert.equal(expanded.source, longSource, "Fullscreen must preserve edited source");
  assert(
    expanded.svg.bottom <= expanded.viewport.bottom && expanded.svg.top >= expanded.viewport.top,
    "Fullscreen must keep a fitted diagram visible",
  );
  capture("tall-fullscreen");
  await widget("escape");
  await until(`!document.querySelector('.mcp-app-frame').classList.contains('fullscreen')`);
  evaluate(
    `(async()=>{const {getCurrentWindow}=await import('/node_modules/@tauri-apps/api/window.js');const {LogicalSize}=await import('/node_modules/@tauri-apps/api/dpi.js');await getCurrentWindow().setSize(new LogicalSize(${originalWindow[0]},${originalWindow[1]}));return true;})()`,
  );
  const originalClasses = evaluate(`document.documentElement.className`);
  evaluate(`document.documentElement.classList.toggle('dark');true`);
  await until(`window.__mcpRenderStatus?.status==='ready'`);
  const recolored = await widget("inspect");
  assert.equal(recolored.source, longSource, "A live theme change must preserve source edits");
  assert.notEqual(recolored.dark, initial.dark, "The widget must follow a live theme change");
  evaluate(`document.documentElement.className=${JSON.stringify(originalClasses)};true`);
  const otherLanguage = initial.language === "en" ? "zh" : "en";
  evaluate(
    `(async()=>{const {setLocale}=await import('/src/lib/i18n.ts');setLocale(${JSON.stringify(otherLanguage)});return true;})()`,
  );
  assert.equal(
    (await widget("inspect")).language,
    otherLanguage,
    "The mounted widget must follow live locale changes",
  );
  evaluate(
    `(async()=>{const {setLocale}=await import('/src/lib/i18n.ts');setLocale(${JSON.stringify(initial.language)});return true;})()`,
  );
  // Shrink the real transcript container to exercise geometry without replacing the iframe.
  evaluate(`document.querySelector('main').style.width='420px';true`);
  const narrow = await widget("inspect");
  assert(
    narrow.svg.right <= narrow.viewport.right && narrow.svg.left >= narrow.viewport.left,
    "Refit a narrow transcript",
  );
  evaluate(`document.querySelector('main').style.width='';true`);
  const wideSource = longSource.replace("flowchart TD", "flowchart LR");
  await widget("input", wideSource);
  await widget("click", "render");
  await until(
    `window.__mcpRenderStatus?.status==='ready' && window.__mcpRenderStatus?.source===${JSON.stringify(wideSource)}`,
  );
  const wide = await widget("inspect");
  assert(
    wide.svg.width >= wide.viewport.width * 0.65 &&
      wide.svg.right <= wide.viewport.right &&
      wide.svg.left >= wide.viewport.left,
    "A very wide diagram must fit inside the visible canvas",
  );
  await widget("click", "plus");
  assert(
    (await widget("inspect")).canvasScrollWidth > wide.viewport.width,
    "Zoomed diagrams must reserve scrollable canvas space",
  );
  await widget("click", "fit");
  await widget("input", "this is invalid Mermaid");
  await widget("click", "render");
  await until(`window.__mcpRenderStatus?.status==='failed'`);
  assert.equal((await widget("inspect")).repairHidden, false, "Syntax failures must offer repair");
  await widget("input", "");
  await widget("click", "render");
  await until(`window.__mcpRenderStatus?.status==='empty'`);
  const empty = await widget("inspect");
  assert.equal(
    empty.repairHidden,
    true,
    "Clearing invalid source must clear the stale repair action",
  );
  assert(!empty.svg, "Clearing source must clear the stale diagram");
  await widget("click", "reset");
  await until(
    `window.__mcpRenderStatus?.status==='ready' && window.__mcpRenderStatus?.source===${JSON.stringify(initial.source)}`,
  );
  assert.deepEqual(failures, [], "MCP App interaction failures");
  console.log(
    "Passed MCP UI geometry, zoom, tall/wide fit, fullscreen, modal, Escape, PIP, live appearance, resize, editing and error recovery",
  );
  return { widget };
}
