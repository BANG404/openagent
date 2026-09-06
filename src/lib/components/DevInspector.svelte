<script lang="ts">
  import { desktopOpenAgent, invoke } from "$lib/openagent/tauriClient";
  import { getVersion } from "@tauri-apps/api/app";
  import { emit } from "$lib/openagent/tauriClient";
  import { check } from "@tauri-apps/plugin-updater";
  import { onDestroy, onMount } from "svelte";
  import InspectorDatabase from "$lib/components/InspectorDatabase.svelte";
  import Tooltip from "$lib/components/Tooltip.svelte";
  import { showToast, updateToast } from "$lib/toast";
  import { summarizeCacheUsage } from "$lib/cacheUsage";
  import {
    DEV_MAIN_DEBUG_VISIBILITY_EVENT,
    readMainDebugComponentsVisible,
    writeMainDebugComponentsVisible,
  } from "$lib/devDebugVisibility";
  import type { ConversationMeta, TaskTrace } from "$lib/types";

  type TimelineKind = "user" | "assistant" | "thinking" | "tool" | "toolset" | "system";
  type TimelineEvent = {
    id: string;
    timestamp: number;
    order: number;
    kind: TimelineKind;
    title: string;
    content: string;
    args?: string;
    result?: string;
  };
  type TraceFilter = "all" | string;
  type InspectorTrace = { id: string; title: string; timestamp: number; task: TaskTrace };
  type ToolDefinition = { name?: unknown; description?: unknown; parameters?: unknown };

  const COLLAPSE_LENGTH = 800;
  const COLLAPSE_LINES = 8;

  let appVersion = $state("loading...");
  let mainDebugComponentsVisible = $state(readMainDebugComponentsVisible());
  let conversations = $state<ConversationMeta[]>([]);
  let taskTraces = $state<TaskTrace[]>([]);
  let traceFilter = $state<TraceFilter>("all");
  let selectedTaskTraceId = $state<string | null>(null);
  let selectedEventId = $state<string | null>(null);
  let expandedEventIds = $state(new Set<string>());
  let activeView = $state<"traces" | "database" | "temporary-ui" | "diagnostics">("traces");
  let downloadPreviewTimer: ReturnType<typeof setInterval> | null = null;
  let loading = $state(false);
  let error = $state<string | null>(null);
  let updateStatus = $state("Not checked");
  let disconnectStatus = $state("Ready. Configure retry attempts in Settings before testing.");
  let disconnecting = $state(false);
  let compactionDiagnosticStatus = $state(
    "Creates a separate conversation, forces one read-only tool call, then compacts immediately before the agent continues after its ToolResult.",
  );
  let creatingCompactionDiagnostic = $state(false);

  const selectedTaskTrace = $derived(
    taskTraces.find((item) => item.id === selectedTaskTraceId) ?? null,
  );
  const requestTraces = $derived(taskTraces.filter((task) => task.task_kind === "chat_request"));
  const sessions = $derived(
    [...new Set(requestTraces.map((task) => task.session_id ?? "legacy"))].sort(),
  );
  const traces = $derived.by<InspectorTrace[]>(() => {
    return requestTraces
      .map((task) => ({
        id: task.id,
        title: task.checkpoint_id
          ? `Checkpoint ${task.checkpoint_id.slice(0, 8)}`
          : "Unlinked request",
        timestamp: task.created_at,
        task,
      }))
      .filter(
        (trace) => traceFilter === "all" || (trace.task.session_id ?? "legacy") === traceFilter,
      )
      .sort((left, right) => right.timestamp - left.timestamp);
  });
  const selectedTrace = $derived(traces.find((item) => item.id === selectedTaskTraceId) ?? null);
  const selectedCacheUsage = $derived(
    selectedTaskTrace?.usage ? summarizeCacheUsage(selectedTaskTrace.usage) : null,
  );
  const messageTimeline = $derived.by(() =>
    selectedTaskTrace ? buildTaskTimeline(selectedTaskTrace) : [],
  );
  const selectedEvent = $derived(
    messageTimeline.find((item) => item.id === selectedEventId) ?? messageTimeline[0] ?? null,
  );

  $effect(() => {
    if (!traces.some((trace) => trace.id === selectedTaskTraceId) && traces[0]) {
      selectTrace(traces[0]);
    }
  });

  function formatTime(seconds: number): string {
    return new Date(seconds * 1000).toLocaleString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function formatDate(seconds: number): string {
    return new Date(seconds * 1000).toLocaleString();
  }

  function formatTokens(tokens: number): string {
    return new Intl.NumberFormat([], { notation: "compact", maximumFractionDigits: 1 }).format(
      tokens,
    );
  }

  function formatPercent(rate: number): string {
    return new Intl.NumberFormat([], { style: "percent", maximumFractionDigits: 1 }).format(rate);
  }

  function buildTaskTimeline(trace: TaskTrace): TimelineEvent[] {
    const base = { timestamp: trace.created_at, order: 0 };
    if (trace.task_kind === "chat_request") {
      try {
        const parsed = JSON.parse(trace.prompt) as { messages?: unknown[] };
        if (Array.isArray(parsed.messages)) {
          return parsed.messages.map((message, order) => {
            const role =
              message && typeof message === "object" && "role" in message
                ? String((message as { role?: unknown }).role)
                : "message";
            const content =
              message && typeof message === "object" && "content" in message
                ? (message as { content?: unknown }).content
                : undefined;
            // Rig represents tool results as a user message containing a
            // `tool_result` content item. Keep the protocol meaning visible
            // instead of presenting that transport wrapper as user input.
            const isToolResult =
              Array.isArray(content) &&
              content.some(
                (part) =>
                  part &&
                  typeof part === "object" &&
                  (part as { type?: unknown }).type === "tool_result",
              );
            const kind: TimelineKind = isToolResult
              ? "tool"
              : role === "assistant"
                ? "assistant"
                : role === "system"
                  ? "system"
                  : "user";
            return {
              id: `${trace.id}-message-${order}`,
              ...base,
              order,
              kind,
              title: isToolResult ? "tool" : role,
              content: stringify(message),
            };
          });
        }
      } catch {
        /* Legacy traces retain their stored request payload below. */
      }
      return [
        {
          id: `${trace.id}-request`,
          ...base,
          kind: "user",
          title: "Request messages",
          content: trace.prompt,
        },
      ];
    }
    const events: TimelineEvent[] = [
      {
        id: `${trace.id}-system`,
        ...base,
        kind: "system",
        title: "System prompt",
        content: trace.system_prompt,
      },
      {
        id: `${trace.id}-tools`,
        ...base,
        order: 1,
        kind: "toolset",
        title: "Available tools",
        content: trace.tools,
      },
      {
        id: `${trace.id}-prompt`,
        ...base,
        order: 2,
        kind: "user",
        title: trace.task_kind === "chat_request" ? "Provider request context" : "Task input",
        content: trace.prompt,
      },
    ];
    if (trace.completion)
      events.push({
        id: `${trace.id}-completion`,
        ...base,
        order: 3,
        kind: "assistant",
        title: "Structured result",
        content: trace.completion,
      });
    if (trace.error)
      events.push({
        id: `${trace.id}-error`,
        ...base,
        order: 4,
        kind: "system",
        title: "Task failed",
        content: trace.error,
      });
    return events;
  }

  function stringify(value: unknown): string {
    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
  }
  function toolDefinitions(value: string): ToolDefinition[] {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((tool): tool is ToolDefinition => tool && typeof tool === "object")
        : [];
    } catch {
      return [];
    }
  }
  function toolsetSummary(value: string): string {
    const tools = toolDefinitions(value);
    return tools.length
      ? `${tools.length} tool${tools.length === 1 ? "" : "s"} available`
      : "Tool definitions unavailable";
  }
  function toolName(tool: ToolDefinition, index: number): string {
    return typeof tool.name === "string" && tool.name ? tool.name : `Tool ${index + 1}`;
  }
  function toolDescription(tool: ToolDefinition): string {
    return typeof tool.description === "string" && tool.description
      ? tool.description
      : "No description provided.";
  }
  function parseJson(value: string | undefined): Record<string, unknown> | null {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  function isLong(value: string): boolean {
    return value.length > COLLAPSE_LENGTH || value.split("\n").length > COLLAPSE_LINES;
  }
  function isExpanded(id: string): boolean {
    return expandedEventIds.has(id);
  }
  function toggleEvent(id: string, event?: MouseEvent): void {
    event?.stopPropagation();
    const next = new Set(expandedEventIds);
    next.has(id) ? next.delete(id) : next.add(id);
    expandedEventIds = next;
  }
  function selectEvent(id: string): void {
    selectedEventId = id;
  }
  function handleEventKeydown(event: KeyboardEvent, id: string): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    selectEvent(id);
  }

  async function loadConversations() {
    loading = true;
    error = null;
    try {
      [conversations, taskTraces] = await Promise.all([
        desktopOpenAgent
          .invokeProduct("get_conversations", { workspace: null })
          .then((value) => value as ConversationMeta[]),
        desktopOpenAgent.invokeProduct("get_task_traces", {}).then((value) => value as TaskTrace[]),
      ]);
    } catch (cause) {
      error = String(cause);
    } finally {
      loading = false;
    }
  }

  function selectTrace(trace: InspectorTrace) {
    selectedTaskTraceId = trace.id;
    selectedEventId = null;
    expandedEventIds = new Set();
  }

  async function checkForUpdate() {
    updateStatus = "Checking configured update endpoint...";
    try {
      const update = await check();
      updateStatus = update ? `Available: ${update.version}` : "No update available";
    } catch (cause) {
      updateStatus = `Check failed: ${String(cause)}`;
    }
  }

  async function disconnectModelRequests() {
    disconnecting = true;
    disconnectStatus = "Disconnecting active model request…";
    try {
      const conversationIds = (await desktopOpenAgent.invokeProduct(
        "debug_disconnect_model_requests",
        {},
      )) as string[];
      disconnectStatus = `Disconnected ${conversationIds.length} request${conversationIds.length === 1 ? "" : "s"}. Normal error and retry handling now owns the request.`;
    } catch (cause) {
      disconnectStatus = String(cause);
    } finally {
      disconnecting = false;
    }
  }

  async function createCompactionDiagnostic() {
    creatingCompactionDiagnostic = true;
    compactionDiagnosticStatus = "Creating diagnostic conversation and starting the agent...";
    try {
      const convId = (await desktopOpenAgent.invokeProduct(
        "debug_create_context_compaction_diagnostic",
        {},
      )) as string;
      compactionDiagnosticStatus =
        "Conversation created. Refreshing its live checkpoint and provider-request trajectory...";
      await loadConversations();
      const trace = traces.find((item) => item.task.conv_id === convId);
      if (trace) selectTrace(trace);
    } catch (cause) {
      compactionDiagnosticStatus = `Diagnostic failed to start: ${String(cause)}`;
    } finally {
      creatingCompactionDiagnostic = false;
    }
  }

  function showUpdatePreview(): void {
    showToast({
      title: "Update available · 99.0.0",
      description: "A preview of the notification shown when OpenAgent finds a new version.",
      durationMs: 0,
      link: {
        label: "View changelog",
        href: "https://github.com/BANG404/openagent/releases/tag/v99.0.0",
        onClick: () => {},
      },
      action: {
        label: "Update and restart",
        onClick: () => {
          showToast({
            title: "Downloading update",
            description: "Preview only — no update will be installed.",
            durationMs: 3500,
          });
        },
      },
    });
  }

  function showDownloadPreview(): void {
    showToast({
      title: "Download complete",
      description: "C:\\Users\\you\\Downloads\\trajectory.json",
      descriptionFromEnd: true,
      variant: "success",
      durationMs: 6000,
      action: {
        label: "Open file",
        onClick: () => {
          showToast({
            title: "Open file",
            description: "Preview action triggered.",
            durationMs: 2500,
          });
        },
      },
    });
  }

  function showDownloadProgressPreview(): void {
    if (downloadPreviewTimer) clearInterval(downloadPreviewTimer);
    let progress = 0;
    const toastId = showToast({
      title: "Downloading OpenAgent",
      description: "Downloading update… 0%",
      durationMs: 0,
    });
    downloadPreviewTimer = setInterval(() => {
      progress = Math.min(progress + 10, 100);
      if (progress < 100) {
        updateToast(toastId, { description: `Downloading update… ${progress}%` });
        return;
      }
      clearInterval(downloadPreviewTimer!);
      downloadPreviewTimer = null;
      updateToast(toastId, {
        title: "Update ready to install",
        description: "Download complete — preview only.",
        action: { label: "Restart now", onClick: () => {} },
      });
    }, 350);
  }

  async function setMainDebugComponentsVisible(visible: boolean): Promise<void> {
    mainDebugComponentsVisible = visible;
    writeMainDebugComponentsVisible(visible);
    await emit(DEV_MAIN_DEBUG_VISIBILITY_EVENT, { visible });
  }

  async function openOnboardingPreview(): Promise<void> {
    await invoke("reveal_onboarding_window");
  }

  onMount(async () => {
    appVersion = await getVersion().catch(() => "unknown");
    await loadConversations();
  });
  onDestroy(() => {
    if (downloadPreviewTimer) clearInterval(downloadPreviewTimer);
  });
</script>

<svelte:head><title>OpenAgent Dev Inspector</title></svelte:head>

<main>
  <header>
    <div>
      <p class="eyebrow">DEVELOPMENT ONLY</p>
      <h1>Inspector</h1>
      <p class="muted">OpenAgent {appVersion} · read-only trace diagnostics</p>
    </div>
    <nav class="view-tabs" aria-label="Inspector categories">
      <button class:active={activeView === "traces"} onclick={() => (activeView = "traces")}
        >Traces</button
      >
      <button class:active={activeView === "database"} onclick={() => (activeView = "database")}
        >Database</button
      >
      <button
        class:active={activeView === "temporary-ui"}
        onclick={() => (activeView = "temporary-ui")}>Temporary UI</button
      >
      <button
        class:active={activeView === "diagnostics"}
        onclick={() => (activeView = "diagnostics")}>Diagnostics</button
      >
    </nav>
    <div class="header-actions">
      <span class:loading>{loading ? "Loading…" : `${traces.length} traces`}</span><button
        onclick={loadConversations}
        disabled={loading}>Refresh</button
      >
    </div>
  </header>

  {#if error}<p class="error">{error}</p>{/if}

  {#if activeView === "traces"}
    <section class="inspector" aria-label="Request trace inspector">
      <aside class="trace-list">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">LIVE REQUEST TRACES</p>
            <h2>Agent-entry messages</h2>
          </div>
          <select bind:value={traceFilter} aria-label="Filter request session"
            ><option value="all">All sessions</option>{#each sessions as session (session)}<option
                value={session}
                >Session {session === "legacy" ? "(legacy)" : session.slice(0, 8)}</option
              >{/each}</select
          >
        </div>
        <div class="conversation-list">
          {#each traces as trace (trace.id)}
            <Tooltip text={trace.id}>
              {#snippet trigger(props)}
                <button
                  {...props}
                  class:active={trace.id === selectedTaskTraceId}
                  onclick={() => selectTrace(trace)}
                >
                  <strong>{trace.title}</strong><span
                    >{trace.task.session_id
                      ? `session ${trace.task.session_id.slice(0, 8)}`
                      : "legacy session"} · {trace.task.model} · {formatDate(trace.timestamp)}</span
                  >
                </button>
              {/snippet}
            </Tooltip>
          {:else}<p class="muted empty">No traces match this filter.</p>{/each}
        </div>
      </aside>

      <section class="trajectory-panel">
        <div class="panel-heading trajectory-heading">
          <div>
            <p class="eyebrow">ACTUAL PROVIDER REQUEST</p>
            <h2>{selectedTrace?.title || "Message trajectory"}</h2>
            <p class="muted">
              {selectedTaskTrace
                ? `session ${selectedTaskTrace.session_id ?? "legacy"} · checkpoint ${selectedTaskTrace.checkpoint_id ?? "unlinked"}`
                : "Select a request to inspect its entry messages."}
            </p>
          </div>
          <div class="trace-stats">
            <span>{messageTimeline.length} events</span>
            {#if selectedTaskTrace?.usage}
              <span
                >{formatTokens(selectedTaskTrace.usage.input_tokens)} input · {formatTokens(
                  selectedTaskTrace.usage.output_tokens,
                )} output</span
              >
              {#if selectedCacheUsage?.kind === "available"}
                <span
                  >{formatPercent(selectedCacheUsage.readRate)} cache hit · {formatTokens(
                    selectedTaskTrace.usage.cached_input_tokens,
                  )} cached
                  {#if selectedTaskTrace.usage.cache_creation_input_tokens > 0}
                    · {formatPercent(selectedCacheUsage.writeRate)} written
                  {/if}</span
                >
              {:else if selectedCacheUsage?.kind === "no_activity"}
                <span>No cache activity reported</span>
              {:else}
                <span
                  >Cache rate unavailable · {formatTokens(
                    selectedTaskTrace.usage.cached_input_tokens,
                  )} cached
                  {#if selectedTaskTrace.usage.cache_creation_input_tokens > 0}
                    · {formatTokens(selectedTaskTrace.usage.cache_creation_input_tokens)} written
                  {/if}</span
                >
              {/if}
            {/if}
          </div>
        </div>
        <div class="message-timeline">
          {#each messageTimeline as event, index (event.id)}
            {@const expanded = isExpanded(event.id)}
            {@const collapsible = event.kind !== "toolset" && isLong(event.content)}
            <div
              class="timeline-event {event.kind}"
              class:selected={selectedEvent?.id === event.id}
              role="button"
              tabindex="0"
              onclick={() => selectEvent(event.id)}
              onkeydown={(key) => handleEventKeydown(key, event.id)}
            >
              <div class="event-rail">
                <span class="event-dot"></span>{#if index < messageTimeline.length - 1}<span
                    class="event-line"
                  ></span>{/if}
              </div>
              <div class="event-body">
                <div class="event-meta">
                  <div class="event-label">
                    <span class="kind-badge"
                      >{event.kind === "toolset"
                        ? "TOOLS"
                        : event.kind === "tool"
                          ? "TOOL"
                          : event.kind.toUpperCase()}</span
                    ><strong>{event.title}</strong>
                  </div>
                  <time>{formatTime(event.timestamp)}</time>
                </div>
                <div class:clamped={collapsible && !expanded} class="event-content">
                  {event.kind === "toolset"
                    ? toolsetSummary(event.content)
                    : event.content || "(empty)"}
                </div>
                {#if collapsible}<button
                    class="text-button"
                    onclick={(click) => toggleEvent(event.id, click)}
                    >{expanded ? "Show less" : "Show more"}</button
                  >{/if}
                {#if event.kind === "tool"}<div class="tool-summary">
                    <span
                      >{event.args
                        ? `${Object.keys(parseJson(event.args) ?? {}).length} input fields`
                        : "No input"}</span
                    ><span class:success={event.result !== undefined}
                      >{event.result === undefined ? "running" : "completed"}</span
                    >
                  </div>{/if}
              </div>
            </div>
          {:else}<p class="muted empty">Select a request to inspect its entry messages.</p>{/each}
        </div>
      </section>

      <aside class="detail-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">EVENT INSPECTOR</p>
            <h2>{selectedEvent?.title || "No event selected"}</h2>
          </div>
          {#if selectedEvent}<span class="kind-badge"
              >{selectedEvent.kind === "toolset" ? "tools" : selectedEvent.kind}</span
            >{/if}
        </div>
        {#if selectedEvent}
          <div class="event-details">
            <div class="detail-row">
              <span>Timestamp</span><time>{formatDate(selectedEvent.timestamp)}</time>
            </div>
            {#if selectedEvent.kind === "toolset"}
              {@const tools = toolDefinitions(selectedEvent.content)}
              <section class="data-section">
                <h3>Available tools ({tools.length})</h3>
                {#if tools.length}
                  <div class="tool-definition-list">
                    {#each tools as tool, index (toolName(tool, index))}<details
                        class="tool-definition"
                      >
                        <summary
                          ><code>{toolName(tool, index)}</code><span>{toolDescription(tool)}</span
                          ></summary
                        >
                        <div class="tool-definition-body">
                          <h3>Parameters</h3>
                          <pre>{tool.parameters === undefined
                              ? "No parameter schema"
                              : stringify(tool.parameters)}</pre>
                        </div>
                      </details>{/each}
                  </div>
                {:else}<pre>{selectedEvent.content || "No tool definitions captured"}</pre>
                {/if}
              </section>
            {:else if selectedEvent.kind === "tool"}
              <section class="data-section">
                <h3>Input</h3>
                {#if parseJson(selectedEvent.args)}<dl>
                    {#each Object.entries(parseJson(selectedEvent.args) ?? {}) as [key, value] (key)}<div
                      >
                        <dt>{key}</dt>
                        <dd>{stringify(value)}</dd>
                      </div>{/each}
                  </dl>{:else}<pre>{selectedEvent.args || "No arguments"}</pre>{/if}
              </section>
              <section class="data-section">
                <h3>Output</h3>
                <pre>{selectedEvent.result ?? "Awaiting result"}</pre>
              </section>
            {:else}
              <section class="data-section">
                <h3>Content</h3>
                <pre>{selectedEvent.content || "(empty)"}</pre>
              </section>
            {/if}
          </div>
        {:else}<p class="muted empty">
            Choose an event from the trajectory to see its full details.
          </p>{/if}
      </aside>
    </section>
  {:else if activeView === "database"}
    <InspectorDatabase />
  {:else if activeView === "temporary-ui"}
    <section class="utility-view" aria-label="Temporary UI previews">
      <div class="utility-heading">
        <p class="eyebrow">COMPONENT PREVIEWS</p>
        <h2>Temporary UI</h2>
        <p class="muted">
          Render transient main-interface components without performing their real actions.
        </p>
      </div>
      <div class="preview-grid">
        <article>
          <div>
            <h3>Main window debug markers / 主界面调试标记</h3>
            <p>
              Show or hide branch IDs and checkpoint labels in the main window. /
              显示或隐藏主界面的分支 ID 与 checkpoint 标记。
            </p>
          </div>
          <label class="toggle-control">
            <input
              type="checkbox"
              checked={mainDebugComponentsVisible}
              onchange={(event) => setMainDebugComponentsVisible(event.currentTarget.checked)}
            />
            <span>{mainDebugComponentsVisible ? "Visible / 显示" : "Hidden / 隐藏"}</span>
          </label>
        </article>
        <article>
          <div>
            <h3>Onboarding flow / 新手引导</h3>
            <p>
              Open the real onboarding flow in its setup window without clearing saved settings. /
              在独立配置窗口中打开真实引导流程，不清除已保存设置。
            </p>
          </div>
          <button onclick={openOnboardingPreview}>Open onboarding</button>
        </article>
        <article>
          <div>
            <h3>Update notification</h3>
            <p>Persistent update notice with a simulated update action.</p>
          </div>
          <button onclick={showUpdatePreview}>Show update notice</button>
        </article>
        <article>
          <div>
            <h3>Download notification</h3>
            <p>Successful download toast with a simulated open-file action.</p>
          </div>
          <button onclick={showDownloadPreview}>Show download notice</button>
        </article>
        <article>
          <div>
            <h3>Download progress</h3>
            <p>Simulate the update download from 0% through installation readiness.</p>
          </div>
          <button onclick={showDownloadProgressPreview}>Show download progress</button>
        </article>
      </div>
    </section>
  {:else}
    <section class="utility-view" aria-label="Diagnostics">
      <div class="utility-heading">
        <p class="eyebrow">DEVELOPMENT DIAGNOSTICS</p>
        <h2>Diagnostics</h2>
        <p class="muted">
          Inspect persisted state and inject failures into active development requests.
        </p>
      </div>
      <div class="diagnostic-grid">
        <article>
          <h3>SQLite snapshot</h3>
          <p>{conversations.length} conversations · {requestTraces.length} provider requests</p>
        </article>
        <article>
          <h3>Model request fault injection</h3>
          <p>{disconnectStatus}</p>
          <button onclick={disconnectModelRequests} disabled={disconnecting}
            >{disconnecting ? "Disconnecting…" : "Disconnect active model request"}</button
          >
        </article>
        <article>
          <h3>ToolResult → compaction → agent</h3>
          <p>{compactionDiagnosticStatus}</p>
          <button onclick={createCompactionDiagnostic} disabled={creatingCompactionDiagnostic}
            >{creatingCompactionDiagnostic ? "Creating…" : "Create compaction diagnostic"}</button
          >
        </article>
        <article>
          <h3>Update endpoint</h3>
          <p>{updateStatus}</p>
          <button onclick={checkForUpdate}>Check endpoint</button>
        </article>
      </div>
    </section>
  {/if}
</main>

<style>
  main {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    padding: 18px;
    background: var(--bg);
    color: var(--text);
  }
  h1,
  h2,
  h3,
  p {
    margin: 0;
  }
  h1 {
    font-size: 22px;
    letter-spacing: -0.02em;
  }
  h2 {
    font-size: 14px;
  }
  h3 {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
  }
  p {
    font-size: 12px;
    line-height: 1.45;
  }
  header,
  .header-actions,
  .panel-heading,
  .event-meta,
  .event-label,
  .detail-row,
  summary,
  .tool-summary {
    display: flex;
    align-items: center;
  }
  .panel-heading,
  .event-meta,
  .detail-row,
  summary {
    justify-content: space-between;
    gap: 12px;
  }
  header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    width: min(100%, 1680px);
    flex: none;
    align-items: center;
    margin: 0 auto 16px;
  }
  .header-actions {
    justify-self: end;
  }
  .eyebrow {
    color: var(--primary);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.12em;
  }
  .muted,
  time {
    color: var(--text-muted);
  }
  .loading {
    color: var(--primary);
  }
  button {
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 7px 10px;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font: inherit;
    font-size: 12px;
  }
  button:hover:not(:disabled) {
    border-color: var(--primary);
    background: var(--item-selected-hover-bg);
  }
  button:disabled {
    cursor: default;
    opacity: 0.65;
  }
  .view-tabs {
    display: flex;
    flex: none;
    gap: 3px;
    padding: 3px;
    width: fit-content;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
  }
  .view-tabs button {
    border-color: transparent;
    background: transparent;
  }
  .view-tabs button.active {
    color: var(--primary);
    border-color: color-mix(in srgb, var(--primary) 25%, var(--border));
    background: var(--item-selected-bg);
  }
  .inspector {
    display: grid;
    grid-template-columns: minmax(210px, 0.8fr) minmax(420px, 1.7fr) minmax(300px, 1fr);
    width: min(100%, 1680px);
    flex: 1;
    min-height: 0;
    margin: 0 auto;
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
    background: var(--surface);
    box-shadow: 0 4px 18px var(--shadow);
  }
  .trace-list,
  .trajectory-panel,
  .detail-panel {
    min-width: 0;
    min-height: 0;
  }
  .trace-list,
  .trajectory-panel {
    border-right: 1px solid var(--border);
  }
  .trace-list,
  .trajectory-panel {
    display: flex;
    flex-direction: column;
  }
  .panel-heading {
    flex: none;
    padding: 14px 15px;
    min-height: 58px;
    border-bottom: 1px solid var(--border);
  }
  .panel-heading > span,
  .trace-stats span,
  summary > span:last-child {
    color: var(--text-muted);
    font-size: 11px;
  }
  .conversation-list {
    display: grid;
    flex: 1;
    min-height: 0;
    gap: var(--list-item-stack-gap);
    overflow: auto;
    padding: 7px;
  }
  .conversation-list button {
    border-color: transparent;
    text-align: left;
    background: transparent;
  }
  .conversation-list button.active {
    background: var(--item-selected-bg);
    border-color: color-mix(in srgb, var(--primary) 30%, var(--border));
  }
  .conversation-list strong,
  .conversation-list span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .conversation-list span {
    margin-top: 4px;
    font-size: 10px;
    color: var(--text-muted);
  }
  .trajectory-heading {
    align-items: flex-start;
  }
  .trace-stats {
    display: grid;
    gap: 4px;
    text-align: right;
    white-space: nowrap;
  }
  .message-timeline {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 14px 18px 30px 14px;
  }
  .timeline-event {
    position: relative;
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    cursor: pointer;
  }
  .event-rail {
    position: relative;
    display: grid;
    justify-items: center;
  }
  .event-dot {
    width: 9px;
    height: 9px;
    margin-top: 13px;
    border: 2px solid var(--surface);
    border-radius: 50%;
    background: var(--text-muted);
    box-shadow: 0 0 0 1px var(--border);
    z-index: 1;
  }
  .event-line {
    position: absolute;
    top: 22px;
    bottom: -4px;
    width: 1px;
    background: var(--border);
  }
  .event-body {
    min-width: 0;
    margin-bottom: 10px;
    padding: 10px 11px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--bg);
    transition:
      border-color 0.12s,
      background 0.12s;
  }
  .timeline-event:hover .event-body,
  .timeline-event.selected .event-body {
    border-color: color-mix(in srgb, var(--primary) 45%, var(--border));
    background: var(--item-selected-bg);
  }
  .timeline-event.user .event-dot {
    background: var(--primary);
  }
  .timeline-event.tool .event-dot,
  .timeline-event.toolset .event-dot {
    background: #9b6de3;
  }
  .timeline-event.thinking .event-dot {
    background: #e39b36;
  }
  .timeline-event.system .event-dot {
    background: #6c7a89;
  }
  .event-label {
    gap: 7px;
    min-width: 0;
  }
  .event-label strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }
  .kind-badge {
    padding: 2px 5px;
    border-radius: 4px;
    background: var(--surface2);
    color: var(--text-muted);
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.06em;
    white-space: nowrap;
  }
  .tool .kind-badge,
  .toolset .kind-badge {
    color: #8b5cd1;
  }
  .event-meta time {
    flex: none;
    font-size: 10px;
    white-space: nowrap;
  }
  .event-content {
    margin-top: 7px;
    overflow-wrap: anywhere;
    font-size: 12px;
    line-height: 1.55;
    white-space: pre-wrap;
  }
  .event-content.clamped {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 5;
    line-clamp: 5;
  }
  .text-button {
    margin-top: 6px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--primary);
    font-size: 11px;
  }
  .text-button:hover:not(:disabled) {
    background: transparent;
  }
  .tool-summary {
    justify-content: space-between;
    gap: 8px;
    margin-top: 8px;
    padding-top: 7px;
    border-top: 1px solid var(--border);
    color: var(--text-muted);
    font:
      10px ui-monospace,
      SFMono-Regular,
      Menlo,
      monospace;
  }
  .tool-summary .success {
    color: #22a06b;
  }
  .tool-definition-list {
    display: grid;
    gap: 7px;
  }
  .tool-definition {
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
  }
  .tool-definition summary {
    display: grid;
    grid-template-columns: minmax(110px, auto) minmax(0, 1fr);
    justify-content: initial;
    padding: 9px;
    gap: 9px;
    font-weight: 400;
  }
  .tool-definition summary::before {
    display: none;
  }
  .tool-definition summary code {
    color: var(--primary);
    font:
      11px/1.45 ui-monospace,
      SFMono-Regular,
      Menlo,
      monospace;
    overflow-wrap: anywhere;
  }
  .tool-definition summary span {
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.45;
  }
  .tool-definition-body {
    display: grid;
    gap: 7px;
    padding: 0 9px 9px;
  }
  .detail-panel {
    display: flex;
    flex-direction: column;
    background: var(--surface);
  }
  .event-details {
    display: grid;
    gap: 14px;
    padding: 14px;
    overflow: auto;
  }
  .detail-row {
    color: var(--text-muted);
    font-size: 11px;
  }
  .detail-row time {
    font-size: 11px;
    text-align: right;
  }
  .data-section {
    display: grid;
    gap: 7px;
  }
  dl {
    display: grid;
    gap: 5px;
    margin: 0;
  }
  dl div {
    display: grid;
    grid-template-columns: minmax(90px, 0.7fr) minmax(0, 1.3fr);
    gap: 8px;
    padding: 7px 8px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--bg);
    font:
      11px/1.45 ui-monospace,
      SFMono-Regular,
      Menlo,
      monospace;
  }
  dt {
    color: var(--primary);
    overflow-wrap: anywhere;
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
  pre {
    max-height: 290px;
    margin: 0;
    overflow: auto;
    padding: 9px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--bg);
    color: var(--text);
    font:
      11px/1.5 ui-monospace,
      SFMono-Regular,
      Menlo,
      monospace;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  details {
    border-top: 1px solid var(--border);
  }
  summary {
    padding: 12px 14px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    list-style: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary::before {
    content: "›";
    margin-right: 7px;
    color: var(--text-muted);
    transition: transform 0.15s;
  }
  details[open] summary::before {
    transform: rotate(90deg);
  }
  .utility-view {
    box-sizing: border-box;
    width: min(100%, 980px);
    flex: 1;
    min-height: 0;
    margin: 0 auto;
    padding: 28px;
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
    background: var(--surface);
    box-shadow: 0 4px 18px var(--shadow);
  }
  .utility-heading {
    display: grid;
    gap: 5px;
    padding-bottom: 20px;
    border-bottom: 1px solid var(--border);
  }
  .utility-heading h2 {
    font-size: 18px;
  }
  .preview-grid,
  .diagnostic-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin-top: 18px;
  }
  .preview-grid article,
  .diagnostic-grid article {
    display: grid;
    gap: 14px;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
  }
  .preview-grid article {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
  }
  .preview-grid h3,
  .diagnostic-grid h3 {
    color: var(--text);
    font-size: 13px;
    text-transform: none;
    letter-spacing: 0;
  }
  .preview-grid p,
  .diagnostic-grid p {
    margin-top: 5px;
    color: var(--text-muted);
  }
  .preview-grid button,
  .diagnostic-grid button {
    width: fit-content;
  }
  .toggle-control {
    display: grid;
    justify-items: center;
    gap: 6px;
    min-width: 88px;
    color: var(--text-muted);
    font-size: 11px;
    cursor: pointer;
  }
  .toggle-control input {
    width: 18px;
    height: 18px;
    accent-color: var(--primary);
    cursor: pointer;
  }
  .empty {
    padding: 20px 8px;
  }
  .error {
    max-width: 1680px;
    margin: 0 auto 12px;
    padding: 10px;
    border-radius: 7px;
    color: #b42318;
    background: color-mix(in srgb, #b42318 12%, var(--surface));
  }
  @media (max-width: 1050px) {
    .inspector {
      grid-template-columns: 220px minmax(0, 1fr);
    }
    .trace-list {
      grid-row: 1 / span 2;
    }
    .detail-panel {
      grid-column: 2;
      border-top: 1px solid var(--border);
    }
    .trajectory-panel {
      border-right: 0;
    }
  }
  @media (max-width: 700px) {
    main {
      padding: 10px;
    }
    header {
      grid-template-columns: 1fr;
      gap: 10px;
    }
    .header-actions {
      justify-self: start;
    }
    .view-tabs {
      width: 100%;
    }
    .view-tabs button {
      flex: 1;
      padding-inline: 5px;
    }
    .inspector {
      display: block;
      overflow: auto;
    }
    .trace-list,
    .trajectory-panel {
      border-right: 0;
      border-bottom: 1px solid var(--border);
    }
    .conversation-list {
      max-height: 210px;
    }
    .message-timeline {
      max-height: none;
    }
    .utility-view {
      padding: 18px;
    }
    .preview-grid,
    .diagnostic-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
