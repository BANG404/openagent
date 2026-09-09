<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import { desktopOpenAgent as openAgent } from "$lib/openagent/tauriClient";
  import type { BackgroundTerminalSession } from "$lib/openagent";
  import { t } from "$lib/i18n";
  import LoadingSkeleton from "./LoadingSkeleton.svelte";
  import Tooltip from "./Tooltip.svelte";

  let {
    collapsed = $bindable(true),
    enabled = true,
    onSummaryChange = () => {},
    previewSessions = null,
    previewOutputs = {},
  }: {
    collapsed?: boolean;
    enabled?: boolean;
    onSummaryChange?: (runningCount: number) => void;
    previewSessions?: BackgroundTerminalSession[] | null;
    previewOutputs?: Record<string, string>;
  } = $props();

  let sessions = $state<BackgroundTerminalSession[]>(untrack(() => previewSessions ?? []));
  let selectedSessionId = $state<string | null>(null);
  let output = $state("");
  let outputCursor = $state(0);
  let outputTruncated = $state(false);
  let input = $state("");
  let loading = $state(untrack(() => previewSessions === null));
  let refreshing = $state(false);
  let reading = false;
  let submitting = $state(false);
  let error = $state<string | null>(null);
  let outputError = $state<string | null>(null);
  let confirmKillSessionId = $state<string | null>(null);
  let outputElement = $state<HTMLElement | null>(null);
  const previewStatuses: Record<string, string> = {};
  let previewOutputBySession = $state(untrack(() => ({ ...previewOutputs })));
  const maxRenderedOutputChars = 512 * 1024;

  let selectedSession = $derived(
    sessions.find((session) => session.session_id === selectedSessionId) ?? null,
  );

  function isRunning(session: BackgroundTerminalSession | null): boolean {
    return session?.status === "running";
  }

  function statusLabel(status: string): string {
    if (status === "running") return $t("backgroundTerminalRunning");
    if (status === "killed") return $t("backgroundTerminalKilled");
    if (status.startsWith("exited:")) {
      return `${$t("backgroundTerminalExited")} ${status.slice("exited:".length)}`;
    }
    if (status.startsWith("failed:")) return $t("backgroundTerminalFailed");
    return status;
  }

  function applyStatus(sessionId: string, status: string): void {
    sessions = sessions.map((session) =>
      session.session_id === sessionId ? { ...session, status } : session,
    );
    onSummaryChange(sessions.filter((session) => session.status === "running").length);
  }

  function boundOutput(value: string): string {
    if (value.length <= maxRenderedOutputChars) return value;
    outputTruncated = true;
    return value.slice(-maxRenderedOutputChars);
  }

  async function refreshSessions(): Promise<BackgroundTerminalSession[]> {
    if (refreshing) return sessions;
    refreshing = true;
    try {
      const next = previewSessions
        ? previewSessions.map((session) => ({
            ...session,
            status: previewStatuses[session.session_id] ?? session.status,
          }))
        : await openAgent.listBackgroundTerminals();
      sessions = next;
      error = null;
      onSummaryChange(next.filter((session) => session.status === "running").length);
      if (!selectedSessionId || !next.some((session) => session.session_id === selectedSessionId)) {
        const preferred = next.find((session) => session.status === "running") ?? next[0] ?? null;
        await selectSession(preferred?.session_id ?? null);
      }
      return next;
    } catch (cause) {
      error = String(cause);
      return sessions;
    } finally {
      loading = false;
      refreshing = false;
    }
  }

  async function readOutput(sessionId: string): Promise<void> {
    if (collapsed || sessionId !== selectedSessionId || reading) return;
    reading = true;
    try {
      if (previewSessions) {
        output = boundOutput(previewOutputBySession[sessionId] ?? output);
        outputCursor = output.length;
        outputError = null;
        return;
      }
      const wasAtBottom = outputElement
        ? outputElement.scrollHeight - outputElement.scrollTop - outputElement.clientHeight < 28
        : true;
      const result = await openAgent.readBackgroundTerminal(sessionId, outputCursor);
      if (sessionId !== selectedSessionId) return;
      output = boundOutput(result.truncated ? result.output : output + result.output);
      outputCursor = result.next_cursor;
      outputTruncated ||= result.truncated;
      outputError = null;
      applyStatus(sessionId, result.status);
      if (wasAtBottom) {
        await tick();
        outputElement?.scrollTo({ top: outputElement.scrollHeight });
      }
    } catch (cause) {
      if (sessionId === selectedSessionId) outputError = String(cause);
    } finally {
      reading = false;
    }
  }

  async function selectSession(sessionId: string | null): Promise<void> {
    if (selectedSessionId === sessionId && outputCursor > 0) return;
    selectedSessionId = sessionId;
    output = sessionId && previewSessions ? (previewOutputBySession[sessionId] ?? "") : "";
    outputCursor = 0;
    outputTruncated = false;
    outputError = null;
    confirmKillSessionId = null;
    if (sessionId && !collapsed) await readOutput(sessionId);
  }

  async function poll(): Promise<void> {
    const next = await refreshSessions();
    const selected = next.find((session) => session.session_id === selectedSessionId);
    if (!collapsed && selected) await readOutput(selected.session_id);
  }

  async function submitInput(): Promise<void> {
    const sessionId = selectedSessionId;
    const data = input;
    if (!sessionId || !data || !isRunning(selectedSession) || submitting) return;
    submitting = true;
    try {
      if (previewSessions) {
        output = boundOutput(output + `${output.endsWith("\n") || !output ? "" : "\n"}> ${data}\n`);
        previewOutputBySession = { ...previewOutputBySession, [sessionId]: output };
      } else {
        const result = await openAgent.writeBackgroundTerminal(sessionId, data);
        applyStatus(sessionId, result.status);
      }
      input = "";
      outputError = null;
      await readOutput(sessionId);
    } catch (cause) {
      outputError = String(cause);
    } finally {
      submitting = false;
    }
  }

  async function killSession(sessionId: string): Promise<void> {
    if (confirmKillSessionId !== sessionId || submitting) {
      confirmKillSessionId = sessionId;
      return;
    }
    submitting = true;
    try {
      const status = previewSessions
        ? "killed"
        : (await openAgent.killBackgroundTerminal(sessionId)).status;
      if (previewSessions) previewStatuses[sessionId] = status;
      applyStatus(sessionId, status);
      confirmKillSessionId = null;
      outputError = null;
      await readOutput(sessionId);
    } catch (cause) {
      outputError = String(cause);
    } finally {
      submitting = false;
    }
  }

  onMount(() => {
    if (!enabled && previewSessions === null) return;
    void poll();
    const interval = window.setInterval(() => void poll(), 1500);
    return () => window.clearInterval(interval);
  });

  $effect(() => {
    const sessionId = collapsed ? null : selectedSessionId;
    if (sessionId) void untrack(() => readOutput(sessionId));
  });
</script>

<aside
  id="background-terminal-panel"
  class="terminal-panel"
  class:collapsed
  aria-label={$t("backgroundTerminals")}
  aria-hidden={collapsed}
>
  <div class="terminal-panel-surface">
    {#if !collapsed}
      <header class="panel-header">
        <span>
          <strong>{$t("backgroundTerminals")}</strong>
          <small
            >{sessions.filter((session) => session.status === "running").length}
            {$t("backgroundTerminalsRunning")}</small
          >
        </span>
        <div class="header-actions">
          <Tooltip text={$t("refresh")}>
            {#snippet trigger(props)}
              <button
                {...props}
                type="button"
                class="icon-button"
                onclick={() => void poll()}
                disabled={refreshing}
              >
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"
                  ><path d="M16 7a6.5 6.5 0 1 0 .1 5.8M16 3v4h-4" /></svg
                >
              </button>
            {/snippet}
          </Tooltip>
          <Tooltip text={$t("close")}>
            {#snippet trigger(props)}
              <button
                {...props}
                type="button"
                class="icon-button"
                onclick={() => (collapsed = true)}
              >
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"
                  ><path d="m6 6 8 8m0-8-8 8" /></svg
                >
              </button>
            {/snippet}
          </Tooltip>
        </div>
      </header>

      {#if loading}
        <LoadingSkeleton variant="sidebar" rows={4} label={$t("loadingContent")} />
      {:else if sessions.length === 0}
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"
            ><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m7 9 3 3-3 3m6 0h4" /></svg
          >
          <strong>{$t("backgroundTerminalsEmpty")}</strong>
          <span>{$t("backgroundTerminalsEmptyDescription")}</span>
        </div>
      {:else}
        <div class="session-list" aria-label={$t("backgroundTerminalSessions")}>
          {#each sessions as session (session.session_id)}
            <button
              type="button"
              class="session-row"
              class:selected={session.session_id === selectedSessionId}
              onclick={() => void selectSession(session.session_id)}
            >
              <span
                class="status-dot"
                class:running={session.status === "running"}
                aria-hidden="true"
              ></span>
              <span class="session-copy">
                <strong>{session.command}</strong>
                <Tooltip text={session.cwd}>
                  {#snippet trigger(props)}
                    <small {...props}>{session.cwd}</small>
                  {/snippet}
                </Tooltip>
              </span>
              <span class="session-meta">
                <small
                  >{new Date(session.started_at * 1000).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}</small
                >
                <span class:running={session.status === "running"}
                  >{statusLabel(session.status)}</span
                >
              </span>
            </button>
          {/each}
        </div>

        {#if selectedSession}
          <section class="terminal-detail">
            <header class="terminal-toolbar">
              <Tooltip text={selectedSession.command}>
                {#snippet trigger(props)}
                  <span {...props}>{selectedSession.command}</span>
                {/snippet}
              </Tooltip>
              {#if isRunning(selectedSession)}
                {#if confirmKillSessionId === selectedSession.session_id}
                  <button
                    type="button"
                    class="cancel-kill"
                    onclick={() => (confirmKillSessionId = null)}>{$t("cancel")}</button
                  >
                  <button
                    type="button"
                    class="confirm-kill"
                    onclick={() => void killSession(selectedSession!.session_id)}
                    disabled={submitting}>{$t("backgroundTerminalConfirmStop")}</button
                  >
                {:else}
                  <Tooltip text={$t("backgroundTerminalStop")}>
                    {#snippet trigger(props)}
                      <button
                        {...props}
                        type="button"
                        class="kill-button"
                        onclick={() => void killSession(selectedSession!.session_id)}
                      >
                        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"
                          ><rect x="6" y="6" width="8" height="8" rx="1" /></svg
                        >
                      </button>
                    {/snippet}
                  </Tooltip>
                {/if}
              {/if}
            </header>
            {#if outputTruncated}<p class="truncated-notice">
                {$t("backgroundTerminalOutputTruncated")}
              </p>{/if}
            <div class="terminal-output" bind:this={outputElement} role="log" aria-live="polite">
              {output || $t("backgroundTerminalWaitingOutput")}
            </div>
            {#if outputError}<p class="panel-error" role="alert">{outputError}</p>{/if}
            {#if isRunning(selectedSession)}
              <form
                class="terminal-input"
                onsubmit={(event) => {
                  event.preventDefault();
                  void submitInput();
                }}
              >
                <input
                  bind:value={input}
                  aria-label={$t("backgroundTerminalInput")}
                  placeholder={$t("backgroundTerminalInputPlaceholder")}
                  autocomplete="off"
                  spellcheck="false"
                  disabled={submitting}
                />
                <Tooltip text={$t("send")}>
                  {#snippet trigger(props)}
                    <button {...props} type="submit" disabled={!input || submitting}>
                      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"
                        ><path d="M4 10h11m-4-4 4 4-4 4" /></svg
                      >
                    </button>
                  {/snippet}
                </Tooltip>
              </form>
            {/if}
          </section>
        {/if}
      {/if}
      {#if error}<p class="panel-error list-error" role="alert">{error}</p>{/if}
    {/if}
  </div>
</aside>

<style>
  .terminal-panel {
    position: relative;
    z-index: 12;
    display: flex;
    width: min(400px, 45%, calc(100% - var(--workspace-card-gap)));
    min-width: min(300px, 45%, calc(100% - var(--workspace-card-gap)));
    max-width: min(480px, 45%, calc(100% - var(--workspace-card-gap)));
    flex: 0 0 auto;
    flex-direction: column;
    margin-left: var(--workspace-card-gap);
    transition:
      width 180ms cubic-bezier(0.16, 1, 0.3, 1),
      min-width 180ms cubic-bezier(0.16, 1, 0.3, 1),
      max-width 180ms cubic-bezier(0.16, 1, 0.3, 1),
      margin 180ms cubic-bezier(0.16, 1, 0.3, 1),
      opacity 120ms ease;
  }

  .terminal-panel.collapsed {
    width: 0;
    min-width: 0;
    max-width: 0;
    margin-left: 0;
    opacity: 0;
    pointer-events: none;
  }

  .terminal-panel-surface {
    display: flex;
    min-width: 0;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    overflow: hidden;
    border-radius: 12px;
    background: var(--surface);
  }

  .panel-header,
  .terminal-toolbar,
  .terminal-input {
    display: flex;
    align-items: center;
  }

  .panel-header {
    min-height: 52px;
    justify-content: space-between;
    gap: 12px;
    padding: 0 10px 0 14px;
    border-bottom: 1px solid var(--border);
  }

  .panel-header > span {
    display: grid;
    min-width: 0;
    gap: 1px;
  }

  .panel-header strong {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0;
  }

  .panel-header small {
    color: var(--text-muted);
    font-size: 10px;
    line-height: 1.3;
  }

  .header-actions {
    display: flex;
    gap: 2px;
  }

  .icon-button,
  .kill-button,
  .terminal-input button {
    display: grid;
    width: 30px;
    height: 30px;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }

  button:hover:not(:disabled),
  button:focus-visible {
    outline: none;
  }

  .icon-button:hover:not(:disabled),
  .icon-button:focus-visible,
  .kill-button:hover,
  .kill-button:focus-visible {
    background: var(--interactive-state-bg);
    color: var(--text);
  }

  button:focus-visible,
  input:focus-visible {
    box-shadow: var(--focus-ring);
  }

  button:active:not(:disabled) {
    transform: scale(0.95);
  }

  button:disabled {
    cursor: default;
    opacity: 0.45;
  }

  svg {
    width: 17px;
    height: 17px;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .empty-state {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    padding: 32px;
    color: var(--text-muted);
    text-align: center;
  }

  .empty-state svg {
    width: 30px;
    height: 30px;
    margin-bottom: 12px;
    opacity: 0.6;
  }

  .empty-state strong {
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
  }

  .empty-state span {
    max-width: 240px;
    margin-top: 5px;
    font-size: 11px;
    line-height: 1.47;
  }

  .session-list {
    max-height: 36%;
    overflow-y: auto;
    padding: 6px;
    border-bottom: 1px solid var(--border);
  }

  .session-row {
    display: grid;
    width: 100%;
    min-height: 50px;
    grid-template-columns: 8px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 7px 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }

  .session-row + .session-row {
    margin-top: 2px;
  }

  .session-row:hover,
  .session-row:focus-visible,
  .session-row.selected {
    background: var(--interactive-state-bg);
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-muted);
    opacity: 0.55;
  }

  .status-dot.running {
    background: var(--primary);
    opacity: 1;
  }

  .session-copy,
  .session-meta {
    display: grid;
    min-width: 0;
  }

  .session-copy {
    gap: 3px;
  }

  .session-copy strong {
    overflow: hidden;
    font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .session-copy small,
  .session-meta small {
    overflow: hidden;
    color: var(--text-muted);
    font-size: 10px;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .session-meta {
    justify-items: end;
    gap: 3px;
    font-size: 10px;
  }

  .session-meta span {
    color: var(--text-muted);
  }

  .session-meta span.running {
    color: var(--primary);
  }

  .terminal-detail {
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
  }

  .terminal-toolbar {
    min-height: 38px;
    gap: 6px;
    padding: 0 8px 0 12px;
    border-bottom: 1px solid var(--border);
  }

  .terminal-toolbar > span {
    flex: 1;
    overflow: hidden;
    color: var(--text-muted);
    font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .kill-button {
    color: var(--danger);
  }

  .cancel-kill,
  .confirm-kill {
    min-height: 28px;
    padding: 0 9px;
    border: 0;
    border-radius: 6px;
    font-size: 11px;
    cursor: pointer;
  }

  .cancel-kill {
    background: transparent;
    color: var(--text-muted);
  }

  .confirm-kill {
    background: color-mix(in srgb, var(--danger) 12%, transparent);
    color: var(--danger);
  }

  .terminal-output {
    min-height: 0;
    flex: 1;
    margin: 0;
    padding: 12px;
    overflow: auto;
    background: var(--component-neutral-bg);
    color: var(--text);
    font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
    font-size: 11px;
    letter-spacing: 0;
    line-height: 1.55;
    outline: none;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .truncated-notice,
  .panel-error {
    margin: 0;
    padding: 6px 10px;
    font-size: 10px;
    line-height: 1.4;
  }

  .truncated-notice {
    background: color-mix(in srgb, var(--primary) 8%, transparent);
    color: var(--text-muted);
  }

  .panel-error {
    background: color-mix(in srgb, var(--danger) 8%, transparent);
    color: var(--danger);
    overflow-wrap: anywhere;
  }

  .list-error {
    border-top: 1px solid color-mix(in srgb, var(--danger) 18%, transparent);
  }

  .terminal-input {
    gap: 6px;
    padding: 8px;
    border-top: 1px solid var(--border);
  }

  .terminal-input input {
    min-width: 0;
    height: 32px;
    flex: 1;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    box-sizing: border-box;
    background: var(--component-neutral-bg);
    color: var(--text);
    font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
    font-size: 11px;
    letter-spacing: 0;
    outline: none;
  }

  .terminal-input button {
    background: var(--primary);
    color: white;
  }

  @media (max-width: 760px) {
    .terminal-panel:not(.collapsed) {
      width: min(400px, 48%, calc(100% - var(--workspace-card-gap)));
      min-width: min(280px, 48%, calc(100% - var(--workspace-card-gap)));
      max-width: min(400px, 48%, calc(100% - var(--workspace-card-gap)));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .terminal-panel {
      transition: none;
    }
  }
</style>
