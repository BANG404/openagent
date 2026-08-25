// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const sharedSurfaceComponents = [
  "../src/lib/components/LoadingSkeleton.svelte",
  "../src/lib/components/MessageList.svelte",
  "../src/lib/components/RetryAttempt.svelte",
];

test("keeps transcript-owned user surfaces on the fixed component-neutral fill", async () => {
  const appCss = await readFile(new URL("../src/app.css", import.meta.url), "utf8");
  expect(appCss.match(/--component-neutral-bg: #f4f4f5;/g)).toHaveLength(2);
  expect(appCss.match(/--component-neutral-bg: #27272a;/g)).toHaveLength(2);
  expect(appCss).toContain("--user-message-bg: var(--component-neutral-bg);");

  const sources = await Promise.all(
    sharedSurfaceComponents.map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  for (const source of sources) {
    expect(source).toContain("var(--user-message-bg)");
  }
});

test("keeps every attachment card off the white surface", async () => {
  const source = await readFile(
    new URL("../src/lib/components/AttachmentPreview.svelte", import.meta.url),
    "utf8",
  );

  for (const selector of [
    /\.attachment-preview\s*\{[^}]*background: var\(--component-neutral-bg\);/s,
    /\.thumbnail\s*\{[^}]*background: var\(--component-neutral-bg\);/s,
    /\.thumbnail\.image\s*\{[^}]*background: var\(--component-neutral-bg\);/s,
    /\.message-capsule\s*\{[^}]*background: var\(--component-neutral-bg\);/s,
    /\.composer-card\s*\{[^}]*background: var\(--component-neutral-bg\);/s,
    /\.message-capsule \.preview-trigger \.thumbnail\s*\{[^}]*background: var\(--component-neutral-bg\);/s,
  ]) {
    expect(source).toMatch(selector);
  }
  expect(source).toMatch(/\.composer-card \.thumbnail\s*\{[^}]*background: transparent;/s);
});

test("keeps static Markdown cards on the component-neutral fill", async () => {
  const source = await readFile(
    new URL("../src/lib/components/ConversationSurface.svelte", import.meta.url),
    "utf8",
  );

  expect(source).toMatch(
    /:global\(\[data-streamdown-thead\]\)\s*\{[^}]*background: var\(--component-neutral-bg\);/s,
  );
  expect(source).toMatch(
    /:global\(\[data-streamdown-code\]\)\s*\{[^}]*background: var\(--component-neutral-bg\);/s,
  );
  expect(source).toMatch(
    /:global\(\[data-streamdown-tbody\] \[data-streamdown-tr\]:hover\)\s*\{[^}]*background: var\(--interactive-state-bg\);/s,
  );
});

test("keeps ask-user forms and summaries in the compact transparent tool grammar", async () => {
  const [source, summarySource] = await Promise.all([
    readFile(new URL("../src/lib/components/UserInputForm.svelte", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/components/UserInputSummary.svelte", import.meta.url), "utf8"),
  ]);

  expect(source).toContain("rounded-lg border border-[var(--border)] bg-transparent");
  expect(source).not.toContain("shadow-[0_1px_3px_rgba(0,0,0,0.04)]");
  expect(source).not.toContain("bg-[var(--user-message-bg)]");
  expect(summarySource).toMatch(
    /\.user-input-summary\s*\{[^}]*border: 1px solid var\(--border\);[^}]*background: transparent;[^}]*box-shadow: none;/s,
  );
  expect(summarySource).not.toContain("var(--user-message-bg)");
});

test("keeps grouped tool calls on the transcript canvas", async () => {
  const [source, cardSource] = await Promise.all([
    readFile(new URL("../src/lib/components/ToolCallGroup.svelte", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/components/ToolCallCard.svelte", import.meta.url), "utf8"),
  ]);

  expect(source).not.toContain("var(--user-message-bg)");
  expect(source).toContain(".tool-call-group-toggle {");
  expect(source).toContain("border: 1px solid var(--border);");
  expect(source).toContain(".status.success span:last-child {");
  expect(source).toContain("padding-top: 4px;");
  expect(source.match(/background: transparent;/g)).toHaveLength(3);
  expect(cardSource).toMatch(/\.tool-call-card\s*\{[^}]*background: transparent;/s);
  expect(cardSource).toMatch(/\.tool-call-header\s*\{[^}]*background: transparent;/s);
  expect(cardSource).toMatch(/\.tool-toggle\s*\{[^}]*min-height: 32px;/s);
  expect(cardSource).not.toContain("background: var(--user-message-bg);");
});
