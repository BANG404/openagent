<script lang="ts">
  import { useOpenAgentUiCapabilities } from "$lib/openagent/uiCapabilities";
  import HtmlPreview from "$lib/streamdown/components/Html.svelte";
  import MermaidToolPreview from "./MermaidToolPreview.svelte";
  import type { ChatToolImage, HtmlPreviewConfig, UserInputRequest } from "$lib/types";
  import type { MermaidConfig } from "$lib/mermaidTheme";
  import { t } from "$lib/i18n";
  import {
    parseApplyPatchPreview,
    summarizePatchChanges,
    type ToolPatchFilePreview,
  } from "$lib/toolCallPatch";
  import { shouldDisplayToolCall, toolCallStatus, type ToolCallItem } from "$lib/toolCallGroups";
  import FileDiffView from "./FileDiffView.svelte";
  import Tooltip from "./Tooltip.svelte";
  import ToolApprovalActions from "./ToolApprovalActions.svelte";

  interface Props {
    name: string;
    args: string;
    result: string | undefined;
    images?: ChatToolImage[];
    expanded: boolean;
    argHint: string;
    htmlPreviewConfig?: HtmlPreviewConfig;
    conversationId?: string;
    mermaidConfig?: MermaidConfig;
    showRunning?: boolean;
    approval?: {
      request: UserInputRequest;
      state: "pending" | "answered" | "cancelled" | "unanswered";
      response?: unknown;
    };
    onApprove?: (requestId: string) => void;
    onDeny?: (requestId: string) => void;
    onToggle: () => void;
  }

  type JsonObject = Record<string, unknown>;
  type TerminalResult = {
    output: string;
    status?: string;
    session_id?: string;
    exit_code?: number;
    truncated?: boolean;
    temporary?: boolean;
  };
  const capabilities = useOpenAgentUiCapabilities();

  let {
    name,
    args,
    result,
    images = [],
    expanded,
    argHint,
    htmlPreviewConfig,
    conversationId,
    mermaidConfig,
    showRunning = false,
    approval,
    onApprove,
    onDeny,
    onToggle,
  }: Props = $props();

  const focusedTools = new Set(["exec_command", "write_stdin", "apply_patch", "view_image"]);

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
    if (name !== "render_web") return null;
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
            : status === "unanswered"
              ? "toolStatusUnanswered"
              : status === "cancelled"
                ? "toolStatusCancelled"
                : "toolStatusWaiting",
    ),
  );
  const patchText = $derived(getString(parsedArgs, "patch"));
  const applyPatchPreviews = $derived(parseApplyPatchPreview(patchText));
  const patchSummary = $derived(summarizePatchChanges(applyPatchPreviews));
  const filePath = $derived(
    getString(parsedArgs, "file_path") ||
      getString(parsedArgs, "path") ||
      getString(parsedArgs, "workdir") ||
      applyPatchPreviews[0]?.path ||
      "",
  );
  let selectedPatchPath = $state("");
  const selectedPatch = $derived<ToolPatchFilePreview | undefined>(
    applyPatchPreviews.find((preview) => preview.path === selectedPatchPath) ??
      applyPatchPreviews[0],
  );
  const terminalResult = $derived(parseTerminalResult(resultText));
  const command = $derived(getString(parsedArgs, "cmd"));
  const sessionId = $derived(getString(parsedArgs, "session_id"));
  const stdinChars = $derived(getString(parsedArgs, "chars"));
  const resultSummary = $derived.by(() =>
    status === "success"
      ? name === "apply_patch" && patchSummary.files > 0
        ? `${patchSummary.files} ${$t(patchSummary.files === 1 ? "toolFile" : "toolFiles")} · +${patchSummary.additions} -${patchSummary.removals}`
        : name === "exec_command" || name === "write_stdin"
          ? summarizeTerminalResult(terminalResult)
          : summarizeResult(resultText)
      : "",
  );

  $effect(() => {
    if (!applyPatchPreviews.some((preview) => preview.path === selectedPatchPath)) {
      selectedPatchPath = applyPatchPreviews[0]?.path ?? "";
    }
  });

  function getString(obj: JsonObject | null, key: string): string {
    const value = obj?.[key];
    return typeof value === "string" ? value : "";
  }

  function shortPath(path: string): string {
    const parts = path.split(/[/\\]/).filter(Boolean);
    if (parts.length <= 3) return path;
    return "..." + parts.slice(-3).join("/");
  }

  function trimPreview(text: string, max = 2400): string {
    if (text.length <= max) return text;
    return text.slice(0, max) + "\n...";
  }

  function summarizeResult(text: string): string {
    if (text === "") return "";
    const lines = text.split("\n").filter((line) => line.length > 0).length;
    return `${lines} ${$t(lines === 1 ? "toolLine" : "toolLines")}`;
  }

  function parseTerminalResult(text: string): TerminalResult | null {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      const value = parsed as JsonObject;
      if (typeof value.output !== "string") return null;
      return {
        output: value.output,
        status: typeof value.status === "string" ? value.status : undefined,
        session_id: typeof value.session_id === "string" ? value.session_id : undefined,
        exit_code: typeof value.exit_code === "number" ? value.exit_code : undefined,
        truncated: value.truncated === true,
        temporary: value.temporary === true,
      };
    } catch {
      return null;
    }
  }

  function summarizeTerminalResult(value: TerminalResult | null): string {
    if (!value) return summarizeResult(resultText);
    const outputLines = value.output.split("\n").filter(Boolean).length;
    if (value.temporary) return value.session_id ? $t("toolTerminalRunning") : "";
    if (value.exit_code !== undefined) {
      return `${$t("toolTerminalExit")} ${value.exit_code}${outputLines ? ` · ${outputLines} ${$t(outputLines === 1 ? "toolLine" : "toolLines")}` : ""}`;
    }
    return outputLines ? `${outputLines} ${$t(outputLines === 1 ? "toolLine" : "toolLines")}` : "";
  }

  function patchOperationLabel(operation: ToolPatchFilePreview["operation"]): string {
    return $t(
      operation === "add"
        ? "toolPatchAdded"
        : operation === "delete"
          ? "toolPatchDeleted"
          : "toolPatchUpdated",
    );
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
      <HtmlPreview args={htmlArgs} {htmlPreviewConfig} {conversationId} />
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
            {#if filePath && name !== "apply_patch"}
              <span class="tool-arg-hint">{shortPath(filePath)}</span>
            {:else if getString(parsedArgs, "session_id")}
              <span class="tool-arg-hint">{getString(parsedArgs, "session_id")}</span>
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
              class:tool-pending={status === "waiting"}
              class:tool-unanswered={status === "unanswered"}
              class:tool-cancelled={status === "cancelled"}
            >
              <span aria-hidden="true"
                >{status === "success"
                  ? "✓"
                  : status === "failed"
                    ? "×"
                    : status === "running"
                      ? "…"
                      : status === "unanswered"
                        ? "—"
                        : status === "cancelled"
                          ? "×"
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
        {#if isFocusedTool && filePath && name !== "apply_patch"}
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
            <div class="detail-section-label">{$t("toolInvocation")}</div>
            {#if filePath && name !== "apply_patch"}
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

            {#if name === "exec_command"}
              <pre class="command-block"><span aria-hidden="true">$</span> {command}</pre>
              {#if getString(parsedArgs, "shell")}
                <div class="meta-row"><span>{getString(parsedArgs, "shell")}</span></div>
              {/if}
              {#if result !== undefined}
                <div class="detail-section-label result-label">{$t("toolResult")}</div>
                <div class="meta-row">
                  {#if terminalResult?.exit_code !== undefined}
                    <span>{$t("toolTerminalExit")} {terminalResult.exit_code}</span>
                  {/if}
                  {#if terminalResult?.session_id}
                    <span>{$t("toolTerminalSession")} {terminalResult.session_id}</span>
                  {/if}
                  {#if terminalResult?.truncated}<span>{$t("toolResultTruncated")}</span>{/if}
                </div>
                <pre class="terminal-output">{trimPreview(
                    terminalResult?.output ?? resultText,
                    12_000,
                  )}</pre>
              {/if}
            {:else if name === "write_stdin"}
              <div class="meta-row">
                <span>{$t("toolTerminalSession")} {sessionId}</span>
                <span>{stdinChars ? $t("toolTerminalInput") : $t("toolTerminalPoll")}</span>
              </div>
              {#if stdinChars}<pre class="command-block">{stdinChars}</pre>{/if}
              {#if result !== undefined}
                <div class="detail-section-label result-label">{$t("toolResult")}</div>
                <div class="meta-row">
                  {#if terminalResult?.exit_code !== undefined}
                    <span>{$t("toolTerminalExit")} {terminalResult.exit_code}</span>
                  {/if}
                  {#if terminalResult?.session_id}
                    <span>{$t("toolTerminalSession")} {terminalResult.session_id}</span>
                  {/if}
                  {#if terminalResult?.truncated}<span>{$t("toolResultTruncated")}</span>{/if}
                </div>
                <pre class="terminal-output">{trimPreview(
                    terminalResult?.output ?? resultText,
                    12_000,
                  )}</pre>
              {/if}
            {:else if name === "apply_patch"}
              <div class="patch-summary">
                <span
                  >{patchSummary.files}
                  {$t(patchSummary.files === 1 ? "toolFile" : "toolFiles")}</span
                >
                <span class="additions">+{patchSummary.additions}</span>
                <span class="removals">-{patchSummary.removals}</span>
              </div>
              <div class="detail-section-label changes-label">{$t("toolChanges")}</div>
              {#if applyPatchPreviews.length > 0}
                <div class="patch-tabs" role="tablist" aria-label={$t("toolAffectedFiles")}>
                  {#each applyPatchPreviews as preview (preview.path)}
                    <Tooltip text={preview.path} side="bottom">
                      {#snippet trigger(props)}
                        <button
                          {...props}
                          class="patch-tab"
                          class:active={selectedPatch?.path === preview.path}
                          type="button"
                          role="tab"
                          aria-selected={selectedPatch?.path === preview.path}
                          onclick={() => (selectedPatchPath = preview.path)}
                        >
                          <span class="patch-operation"
                            >{patchOperationLabel(preview.operation)}</span
                          >
                          <span class="patch-path">{shortPath(preview.path)}</span>
                        </button>
                      {/snippet}
                    </Tooltip>
                  {/each}
                </div>
                {#if selectedPatch}
                  <div class="tool-diff-host" role="tabpanel">
                    <FileDiffView lines={selectedPatch.lines} compact />
                  </div>
                {/if}
              {:else}
                <pre class="code-block">{trimPreview(patchText, 12_000)}</pre>
              {/if}
              {#if result !== undefined}
                <div class="detail-section-label result-label">{$t("toolResult")}</div>
                <pre class="tool-result result-output">{trimPreview(resultText)}</pre>
              {/if}
            {:else if name === "view_image"}
              {#if result !== undefined && resultText && resultText !== "[image]"}
                <div class="detail-section-label result-label">{$t("toolResult")}</div>
                <pre class="tool-result result-output">{trimPreview(resultText)}</pre>
              {/if}
            {/if}
            {#if images.length > 0}
              <div class="tool-image-results">
                {#each images as image (image.src)}
                  <img
                    src={image.src}
                    alt={name === "view_image" ? "Viewed workspace image" : "Tool result image"}
                  />
                {/each}
              </div>
            {/if}
          </div>
        {:else}
          {#if args}
            <div class="tool-args">{args}</div>
          {/if}
          {#if result !== undefined}
            <div class="tool-result">{result.slice(0, 500)}{result.length > 500 ? "..." : ""}</div>
          {/if}
          {#if images.length > 0}
            <div class="tool-image-results">
              {#each images as image (image.src)}
                <img
                  src={image.src}
                  alt={name === "view_image" ? "Viewed workspace image" : "Tool result image"}
                />
              {/each}
            </div>
          {/if}
        {/if}
      {/if}
    </div>
  {/if}
{/if}

<style>
  .tool-call-card {
    margin: 0;
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
    min-height: 32px;
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
    color: var(--text-muted);
    font-family: "JetBrains Mono", monospace;
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

  .tool-unanswered,
  .tool-cancelled {
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

  .path-chip:hover {
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

  .detail-section-label {
    padding: 8px 10px 0;
    color: var(--text-muted);
    font-size: 10px;
    font-weight: 600;
    line-height: 1.4;
  }

  .result-label,
  .changes-label {
    border-top: 1px solid var(--border);
  }

  .command-block,
  .terminal-output {
    margin: 0;
    padding: 7px 10px;
    overflow: auto;
    background: color-mix(in srgb, var(--surface) 88%, var(--bg));
    color: var(--text);
    font:
      400 11px/1.55 "JetBrains Mono",
      monospace;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  .command-block {
    margin: 0 8px 8px;
    border-radius: 6px;
  }

  .command-block span {
    color: var(--text-muted);
    user-select: none;
  }

  .terminal-output {
    max-height: 280px;
    border-top: 1px solid var(--border);
  }

  .patch-summary {
    display: flex;
    gap: 8px;
    padding: 0 10px 8px;
    color: var(--text-muted);
    font-size: 11px;
  }

  .patch-summary .additions {
    color: color-mix(in srgb, #18794e 85%, var(--text));
  }

  .patch-summary .removals {
    color: color-mix(in srgb, #b42318 82%, var(--text));
  }

  .patch-tabs {
    display: flex;
    min-width: 0;
    overflow-x: auto;
    padding: 5px 6px 0;
    border-bottom: 1px solid var(--border);
  }

  .patch-tab {
    position: relative;
    display: flex;
    min-width: 120px;
    max-width: 220px;
    height: 33px;
    flex: 1 0 136px;
    align-items: center;
    gap: 6px;
    padding: 0 9px;
    border: 0;
    border-radius: 6px 6px 0 0;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 10px;
  }

  .patch-tab:hover,
  .patch-tab:focus-visible {
    background: var(--interactive-state-bg);
    color: var(--text);
    outline: none;
  }

  .patch-tab:focus-visible {
    box-shadow: inset var(--focus-ring);
  }

  .patch-tab.active {
    background: var(--surface2);
    color: var(--text);
  }

  .patch-tab.active::after {
    position: absolute;
    inset: auto 0 -1px;
    height: 2px;
    background: var(--primary);
    content: "";
  }

  .patch-operation {
    flex: 0 0 auto;
    font-weight: 600;
  }

  .patch-path {
    overflow: hidden;
    min-width: 0;
    flex: 1;
    font-family: "JetBrains Mono", monospace;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tool-diff-host {
    display: flex;
    min-width: 0;
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

  .result-output {
    max-height: 96px;
  }

  .tool-image-results {
    display: grid;
    gap: 8px;
    padding: 8px;
    border-top: 1px solid var(--border);
    background: var(--bg);
  }

  .tool-image-results img {
    display: block;
    max-width: 100%;
    max-height: 420px;
    object-fit: contain;
    border-radius: 6px;
    background: var(--surface);
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
