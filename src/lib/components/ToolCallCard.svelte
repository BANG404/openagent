<script lang="ts">
  import { useOpenAgentUiCapabilities } from "$lib/openagent/uiCapabilities";
  import HtmlPreview from "$lib/streamdown/components/Html.svelte";
  import MermaidToolPreview from "./MermaidToolPreview.svelte";
  import type { HtmlPreviewConfig, UserInputRequest } from "$lib/types";
  import type { MermaidConfig } from "$lib/mermaidTheme";
  import { t } from "$lib/i18n";
  import { shouldDisplayToolCall, toolCallStatus, type ToolCallItem } from "$lib/toolCallGroups";
  import Tooltip from "./Tooltip.svelte";
  import ToolApprovalActions from "./ToolApprovalActions.svelte";

  interface Props {
    name: string;
    args: string;
    result: string | undefined;
    expanded: boolean;
    argHint: string;
    htmlPreviewConfig?: HtmlPreviewConfig;
    mermaidConfig?: MermaidConfig;
    showRunning?: boolean;
    approval?: {
      request: UserInputRequest;
      state: "pending" | "answered" | "cancelled";
      response?: unknown;
    };
    onApprove?: (requestId: string) => void;
    onDeny?: (requestId: string) => void;
    onToggle: () => void;
  }

  type JsonObject = Record<string, unknown>;
  type DiffLine = { type: "add" | "remove" | "context"; text: string };
  type GrepMatch = { file: string; line: number; content: string };
  const capabilities = useOpenAgentUiCapabilities();

  let {
    name,
    args,
    result,
    expanded,
    argHint,
    htmlPreviewConfig,
    mermaidConfig,
    showRunning = false,
    approval,
    onApprove,
    onDeny,
    onToggle,
  }: Props = $props();

  const focusedTools = new Set(["read_file", "write_file", "edit_file", "glob", "grep"]);

  const parsedArgs = $derived.by((): JsonObject | null => {
    try {
      const parsed = JSON.parse(args);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as JsonObject)
        : null;
    } catch {
      return null;
    }
  });

  const htmlArgs = $derived.by(() => {
    if (name !== "render_html") return null;
    return parsedArgs;
  });
  const mermaidArgs = $derived.by(() => {
    if (name !== "render_mermaid") return null;
    return parsedArgs;
  });

  const isFocusedTool = $derived(focusedTools.has(name) && parsedArgs !== null);
  const displayName = $derived(
    name === "dispatch_role"
      ? $t("dispatchRoleTool")
      : name === "search_roles"
        ? $t("searchRolesTool")
        : name,
  );
  const filePath = $derived(getString(parsedArgs, "file_path") || getString(parsedArgs, "path"));
  const pattern = $derived(getString(parsedArgs, "pattern"));
  const globFilter = $derived(getString(parsedArgs, "glob"));
  const resultText = $derived(result ?? "");
  const status = $derived(
    toolCallStatus({ type: "tool_call", name, args, result } satisfies ToolCallItem, showRunning),
  );
  const shouldDisplay = $derived(
    shouldDisplayToolCall(
      { type: "tool_call", name, args, result } satisfies ToolCallItem,
      showRunning,
    ),
  );
  const statusText = $derived(
    $t(
      status === "success"
        ? "toolStatusSuccess"
        : status === "failed"
          ? "toolStatusFailed"
          : status === "running"
            ? "toolStatusRunning"
            : "toolStatusPending",
    ),
  );
  const resultSummary = $derived.by(() => summarizeResult(name, resultText));
  const writeContent = $derived(getString(parsedArgs, "content"));
  const oldString = $derived(getString(parsedArgs, "old_string"));
  const newString = $derived(getString(parsedArgs, "new_string"));
  const editDiff = $derived(buildReplacementDiff(oldString, newString));
  const readPreviewLines = $derived(parseReadResult(resultText));
  const globResults = $derived(parseStringArrayResult(resultText));
  const grepResults = $derived(parseGrepResult(resultText));

  function getString(obj: JsonObject | null, key: string): string {
    const value = obj?.[key];
    return typeof value === "string" ? value : "";
  }

  function getNumber(obj: JsonObject | null, key: string): number | null {
    const value = obj?.[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  function getBool(obj: JsonObject | null, key: string): boolean {
    return obj?.[key] === true;
  }

  function shortPath(path: string): string {
    const parts = path.split(/[/\\]/).filter(Boolean);
    if (parts.length <= 3) return path;
    return "..." + parts.slice(-3).join("/");
  }

  function lineCount(text: string): number {
    if (!text) return 0;
    return text.split("\n").length;
  }

  function trimPreview(text: string, max = 2400): string {
    if (text.length <= max) return text;
    return text.slice(0, max) + "\n...";
  }

  function summarizeResult(toolName: string, text: string): string {
    if (text === "") return "";
    if (toolName === "glob") {
      const files = parseStringArrayResult(text);
      return files ? `${files.length} file${files.length === 1 ? "" : "s"}` : "";
    }
    if (toolName === "grep") {
      const matches = parseGrepResult(text);
      return matches ? `${matches.length} match${matches.length === 1 ? "" : "es"}` : "";
    }
    const lines = text.split("\n").filter((line) => line.length > 0).length;
    return `${lines} line${lines === 1 ? "" : "s"}`;
  }

  function parseStringArrayResult(text: string): string[] | null {
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) && parsed.every((item) => typeof item === "string")
        ? (parsed as string[])
        : null;
    } catch {
      return null;
    }
  }

  function parseGrepResult(text: string): GrepMatch[] | null {
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) return null;
      const matches = parsed
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const row = item as JsonObject;
          const file = typeof row.file === "string" ? row.file : "";
          const line = typeof row.line === "number" ? row.line : 0;
          const content = typeof row.content === "string" ? row.content : "";
          return file && line > 0 ? { file, line, content } : null;
        })
        .filter((item): item is GrepMatch => item !== null);
      return matches;
    } catch {
      return null;
    }
  }

  function parseReadResult(text: string): Array<{ line: string; content: string }> {
    return text
      .split("\n")
      .slice(0, 220)
      .map((line) => {
        const match = /^(\d+)\|\s?(.*)$/.exec(line);
        return match ? { line: match[1], content: match[2] } : { line: "", content: line };
      });
  }

  function buildReplacementDiff(oldText: string, newText: string): DiffLine[] {
    if (!oldText && !newText) return [];
    const oldLines = oldText.split("\n");
    const newLines = newText.split("\n");
    let prefix = 0;
    while (
      prefix < oldLines.length &&
      prefix < newLines.length &&
      oldLines[prefix] === newLines[prefix]
    ) {
      prefix += 1;
    }

    let oldSuffix = oldLines.length - 1;
    let newSuffix = newLines.length - 1;
    while (
      oldSuffix >= prefix &&
      newSuffix >= prefix &&
      oldLines[oldSuffix] === newLines[newSuffix]
    ) {
      oldSuffix -= 1;
      newSuffix -= 1;
    }

    const lines: DiffLine[] = [];
    for (let i = Math.max(0, prefix - 2); i < prefix; i += 1) {
      lines.push({ type: "context", text: "  " + oldLines[i] });
    }
    for (let i = prefix; i <= oldSuffix; i += 1) {
      lines.push({ type: "remove", text: "- " + oldLines[i] });
    }
    for (let i = prefix; i <= newSuffix; i += 1) {
      lines.push({ type: "add", text: "+ " + newLines[i] });
    }
    for (let i = newSuffix + 1; i < Math.min(newLines.length, newSuffix + 3); i += 1) {
      lines.push({ type: "context", text: "  " + newLines[i] });
    }
    return lines;
  }

  async function openPath(path: string, event?: MouseEvent) {
    event?.stopPropagation();
    if (!path) return;
    try {
      await capabilities.openPath(path);
    } catch (e) {
      console.warn("open_path failed", e);
      const msg = typeof e === "string" ? e : ((e as { message?: string })?.message ?? String(e));
      alert(msg);
    }
  }

  function parentPath(path: string): string {
    const normalized = path.replace(/\\/g, "/");
    const index = normalized.lastIndexOf("/");
    if (index <= 0) return ".";
    if (/^[A-Za-z]:$/.test(normalized.slice(0, index))) return normalized.slice(0, index + 1);
    return normalized.slice(0, index);
  }

  async function openContainingFolder(path: string, event?: MouseEvent) {
    await openPath(parentPath(path), event);
  }
</script>

{#if shouldDisplay}
  {#if htmlArgs}
    <div class="tool-html-preview">
      <HtmlPreview args={htmlArgs} {htmlPreviewConfig} />
    </div>
  {:else if mermaidArgs}
    <MermaidToolPreview args={mermaidArgs} {result} {mermaidConfig} />
  {:else}
    <div class="tool-call-card">
      <div class="tool-call-header">
        <button
          class="tool-toggle"
          aria-expanded={expanded}
          aria-label={`${displayName}: ${statusText}. ${expanded ? $t("toolCallCollapse") : $t("toolCallExpand")}`}
          onclick={onToggle}
        >
          <span class="tool-name">{displayName}</span>
          {#if isFocusedTool}
            {#if filePath}
              <span class="tool-arg-hint">{shortPath(filePath)}</span>
            {:else if pattern}
              <span class="tool-arg-hint">{pattern}</span>
            {/if}
            {#if resultSummary}
              <span class="tool-result-pill">{resultSummary}</span>
            {/if}
          {:else if !expanded && argHint}
            <span class="tool-arg-hint">{argHint}</span>
          {/if}
          <Tooltip text={statusText}>
            <span
              class="tool-status"
              class:tool-done={status === "success"}
              class:tool-failed={status === "failed"}
              class:tool-running={status === "running"}
              class:tool-pending={status === "pending"}
            >
              <span aria-hidden="true"
                >{status === "success"
                  ? "✓"
                  : status === "failed"
                    ? "×"
                    : status === "running"
                      ? "…"
                      : "○"}</span
              >
              <span class="sr-only">{statusText}</span>
            </span>
          </Tooltip>
          <span class="tool-chevron" class:expanded aria-hidden="true">
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M6 4l4 4-4 4" />
            </svg>
          </span>
        </button>
        {#if isFocusedTool && filePath}
          <Tooltip text={$t("openContainingFolder")}>
            {#snippet trigger(props)}
              <button
                {...props}
                class="tool-icon-btn"
                aria-label={$t("openContainingFolder")}
                onclick={(event) => openContainingFolder(filePath, event)}
              >
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M1.8 4.5h4.4l1.2 1.4h6.8v6.6a1 1 0 0 1-1 1H2.8a1 1 0 0 1-1-1z" />
                  <path d="M1.8 6h12.4" />
                </svg>
              </button>
            {/snippet}
          </Tooltip>
        {/if}
      </div>

      {#if approval?.state === "pending"}
        <ToolApprovalActions
          request={approval.request}
          onApprove={(requestId) => onApprove?.(requestId)}
          onDeny={(requestId) => onDeny?.(requestId)}
        />
      {/if}

      {#if expanded}
        {#if isFocusedTool}
          <div class="tool-detail">
            {#if filePath}
              <Tooltip text={filePath}>
                {#snippet trigger(props)}
                  <button
                    {...props}
                    class="path-chip"
                    onclick={(event) => openPath(filePath, event)}
                  >
                    <svg
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path
                        d="M3 2.5h6l4 4V13a.5.5 0 0 1-.5.5h-9A.5.5 0 0 1 3 13V3a.5.5 0 0 1 .5-.5z"
                      />
                      <path d="M9 2.5V6.5h4" />
                    </svg>
                    <span>{filePath}</span>
                  </button>
                {/snippet}
              </Tooltip>
            {/if}

            {#if name === "read_file"}
              <div class="meta-row">
                <span>offset {getNumber(parsedArgs, "offset") ?? 0}</span>
                <span>limit {getNumber(parsedArgs, "limit") ?? 2000}</span>
              </div>
              {#if result !== undefined}
                <div class="code-table">
                  {#each readPreviewLines as row (row.line)}
                    <div class="code-row">
                      <span class="line-no">{row.line}</span>
                      <span class="line-content">{row.content}</span>
                    </div>
                  {/each}
                </div>
              {/if}
            {:else if name === "write_file"}
              <div class="meta-row">
                <span>new file</span>
                <span>{lineCount(writeContent)} line{lineCount(writeContent) === 1 ? "" : "s"}</span
                >
              </div>
              <pre class="code-block">{trimPreview(writeContent)}</pre>
            {:else if name === "edit_file"}
              <div class="meta-row">
                <span>{getBool(parsedArgs, "replace_all") ? "replace all" : "replace one"}</span>
                <span>{lineCount(oldString)} -> {lineCount(newString)} lines</span>
              </div>
              <div class="diff-view">
                {#each editDiff as line, index (`${line.type}-${index}`)}
                  <div class="diff-line diff-{line.type}">{line.text}</div>
                {/each}
              </div>
            {:else if name === "glob"}
              <div class="meta-row">
                <span>pattern {pattern}</span>
                {#if filePath}<span>root {filePath}</span>{/if}
              </div>
              {#if globResults}
                <div class="result-list">
                  {#each globResults.slice(0, 100) as path, index (`${path}-${index}`)}
                    <Tooltip text={path}>
                      {#snippet trigger(props)}
                        <button
                          {...props}
                          class="result-row"
                          onclick={(event) => openPath(path, event)}
                        >
                          <span class="result-path">{path}</span>
                        </button>
                      {/snippet}
                    </Tooltip>
                  {/each}
                </div>
              {:else if result !== undefined}
                <pre class="code-block">{trimPreview(result)}</pre>
              {/if}
            {:else if name === "grep"}
              <div class="meta-row">
                <span>pattern {pattern}</span>
                {#if globFilter}<span>glob {globFilter}</span>{/if}
              </div>
              {#if grepResults}
                <div class="grep-list">
                  {#each grepResults.slice(0, 100) as match, index (`${match.file}:${match.line}:${index}`)}
                    <Tooltip text={`${match.file}:${match.line}`}>
                      {#snippet trigger(props)}
                        <button
                          {...props}
                          class="grep-row"
                          onclick={(event) => openPath(match.file, event)}
                        >
                          <span class="grep-file">{shortPath(match.file)}</span>
                          <span class="grep-line">{match.line}</span>
                          <span class="grep-content">{match.content}</span>
                        </button>
                      {/snippet}
                    </Tooltip>
                  {/each}
                </div>
              {:else if result !== undefined}
                <pre class="code-block">{trimPreview(result)}</pre>
              {/if}
            {/if}
          </div>
        {:else}
          {#if args}
            <div class="tool-args">{args}</div>
          {/if}
          {#if result !== undefined}
            <div class="tool-result">{result.slice(0, 500)}{result.length > 500 ? "..." : ""}</div>
          {/if}
        {/if}
      {/if}
    </div>
  {/if}
{/if}

<style>
  .tool-call-card {
    margin: 2px 0;
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
    font-size: 12px;
    background: transparent;
  }

  .tool-call-header {
    display: flex;
    align-items: stretch;
    background: transparent;
  }

  .tool-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    background: transparent;
    color: var(--text-muted);
    width: 100%;
    border: none;
    cursor: pointer;
    text-align: left;
    font-size: 12px;
    transition: background 0.12s;
    min-width: 0;
    user-select: none;
  }

  .tool-toggle:hover,
  .tool-icon-btn:hover {
    background: var(--interactive-state-bg);
  }

  .tool-toggle:focus-visible,
  .tool-icon-btn:focus-visible {
    box-shadow: var(--focus-ring);
    outline: none;
  }

  .tool-name {
    font-family: "JetBrains Mono", monospace;
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
    flex-shrink: 0;
    white-space: nowrap;
  }

  .tool-arg-hint {
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    flex: 1;
  }

  .tool-result-pill {
    font-size: 10px;
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--primary) 24%, transparent);
    border-radius: 999px;
    padding: 1px 6px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .tool-status {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    font-size: 12px;
    line-height: 1;
  }

  .tool-done {
    color: #22c55e;
  }

  .tool-failed {
    color: var(--danger, #dc2626);
  }

  .tool-running {
    color: var(--primary);
    animation: pulse 1.2s ease-in-out infinite;
  }

  .tool-pending {
    color: var(--text-muted);
  }

  .tool-chevron {
    margin-left: auto;
    flex-shrink: 0;
    color: var(--text-muted);
    transition: transform 0.15s;
    padding-left: 4px;
    width: 14px;
    height: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transform-origin: center;
  }

  .tool-chevron.expanded {
    transform: rotate(90deg);
  }

  .tool-chevron svg {
    width: 12px;
    height: 12px;
  }

  .tool-icon-btn {
    width: 30px;
    border: none;
    border-left: 1px solid var(--border);
    background: transparent;
    color: var(--text-muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
  }

  .tool-icon-btn svg {
    width: 13px;
    height: 13px;
  }

  .tool-detail {
    border-top: 1px solid var(--border);
    background: var(--bg);
  }

  .path-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    width: calc(100% - 16px);
    margin: 8px;
    padding: 5px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    cursor: pointer;
    min-width: 0;
  }

  .path-chip:hover,
  .result-row:hover,
  .grep-row:hover {
    border-color: var(--primary);
    background: var(--interactive-state-bg);
  }

  .path-chip svg {
    width: 13px;
    height: 13px;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .path-chip span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 0 8px 8px;
  }

  .meta-row span {
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 2px 6px;
    color: var(--text-muted);
    background: var(--surface);
    font-family: "JetBrains Mono", monospace;
    font-size: 10px;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .code-table,
  .result-list,
  .grep-list,
  .diff-view {
    max-height: 260px;
    overflow: auto;
    border-top: 1px solid var(--border);
    background: var(--bg);
  }

  .code-row {
    display: grid;
    grid-template-columns: 46px minmax(0, 1fr);
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    line-height: 1.55;
  }

  .line-no {
    color: var(--text-muted);
    text-align: right;
    padding: 0 8px;
    border-right: 1px solid var(--border);
    user-select: none;
  }

  .line-content {
    color: var(--text);
    padding: 0 10px;
    white-space: pre;
    min-width: 0;
  }

  .code-block,
  .tool-args,
  .tool-result {
    margin: 0;
    padding: 6px 10px;
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    color: var(--text-muted);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 220px;
    overflow-y: auto;
    border-top: 1px solid var(--border);
    background: var(--bg);
  }

  .tool-result {
    color: var(--text-muted);
  }

  .result-row,
  .grep-row {
    width: 100%;
    border: none;
    border-bottom: 1px solid var(--border);
    background: transparent;
    color: var(--text);
    cursor: pointer;
    text-align: left;
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    min-width: 0;
  }

  .result-row {
    display: block;
    padding: 4px 10px;
  }

  .result-path {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .grep-row {
    display: grid;
    grid-template-columns: minmax(110px, 0.8fr) 44px minmax(0, 1.2fr);
    gap: 8px;
    padding: 4px 10px;
    align-items: baseline;
  }

  .grep-file,
  .grep-content {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .grep-line {
    color: var(--text-muted);
    text-align: right;
  }

  .diff-line {
    padding: 0 10px;
    white-space: pre;
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    line-height: 1.55;
  }

  .diff-add {
    background: rgba(34, 197, 94, 0.1);
    color: #16a34a;
  }

  .diff-remove {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }

  .diff-context {
    color: var(--text-muted);
  }

  .tool-html-preview {
    margin: 6px 0;
  }

  .tool-html-preview :global(.html-card) {
    margin: 0;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
