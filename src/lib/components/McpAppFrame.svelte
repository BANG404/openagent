<script lang="ts">
  import { onDestroy } from "svelte";
  import { desktopOpenAgent } from "$lib/openagent/tauriClient";
  import { useOpenAgentUiCapabilities } from "$lib/openagent/uiCapabilities";
  import type { McpUiInvocation } from "$lib/types";

  let { invocation }: { invocation: McpUiInvocation } = $props();

  let frame = $state<HTMLIFrameElement | null>(null);
  let height = $state(280);
  let initialized = $state(false);
  let displayMode = $state<"inline" | "fullscreen">("inline");
  let _modelContextUpdate = $state<unknown>(undefined);
  let hostContextVersion = $state(0);
  let requestId = 1;
  const uiCapabilities = useOpenAgentUiCapabilities();

  const availableDisplayModes = ["inline", "fullscreen"] as const;

  function hostContext(): Record<string, unknown> {
    const container = frame?.parentElement;
    return {
      theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
      displayMode,
      availableDisplayModes,
      locale: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      maxHeight: 720,
      safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
      containerDimensions: {
        width: container?.clientWidth ?? 0,
        height: container?.clientHeight ?? height,
      },
      toolInfo: { tool: { name: invocation.descriptor.tool_name } },
      styles: { variables: {} },
      version: hostContextVersion,
    };
  }

  function htmlContent(): string {
    const resource = invocation.resource;
    if (!resource) return "";
    if (resource.text) return resource.text;
    if (!resource.blob) return "";
    try {
      return atob(resource.blob);
    } catch {
      return "";
    }
  }

  function cspMeta(): string {
    const ui = (invocation.resource?.meta as { ui?: { csp?: Record<string, string[]> } } | null)
      ?.ui;
    const csp = ui?.csp;
    const domains = (key: string) =>
      (csp?.[key] ?? []).filter((value) => /^https?:\/\//.test(value));
    const connect = domains("connectDomains");
    const resources = domains("resourceDomains");
    const frames = domains("frameDomains");
    const bases = domains("baseUriDomains");
    const policy = [
      "default-src 'none'",
      "script-src 'self' 'unsafe-inline' " + resources.join(" "),
      "style-src 'self' 'unsafe-inline' " + resources.join(" "),
      "img-src 'self' data: " + resources.join(" "),
      "font-src 'self' data: " + resources.join(" "),
      "media-src 'self' data: " + resources.join(" "),
      "connect-src 'self' " + connect.join(" "),
      "frame-src " + (frames.length ? frames.join(" ") : "'none'"),
      "base-uri " + (bases.length ? bases.join(" ") : "'self'"),
      "object-src 'none'",
    ].join("; ");
    return (
      '<meta http-equiv="Content-Security-Policy" content="' + policy.replace(/"/g, "&quot;") + '">'
    );
  }

  function documentSource(): string {
    const html = htmlContent();
    if (!html) return "";
    const meta = cspMeta();
    const bridge = openAiBridgeScript();
    const withMeta = html.includes("</head>")
      ? html.replace("</head>", meta + "</head>")
      : meta + html;
    return withMeta.includes("</body>")
      ? withMeta.replace("</body>", bridge + "</body>")
      : withMeta + bridge;
  }

  function openAiBridgeScript(): string {
    return `<script>
(function () {
  var pending = new Map();
  var nextId = 1000000;
  var toolInput;
  var toolOutput;
  var toolResponseMetadata;
  var widgetState;
  var hostContext = {};
  function request(method, params) {
    var id = nextId++;
    window.parent.postMessage({ jsonrpc: "2.0", id: id, method: method, params: params || {} }, "*");
    return new Promise(function (resolve, reject) { pending.set(id, { resolve: resolve, reject: reject }); });
  }
  function unsupported(name) {
    return Promise.reject(new Error(name + " is not supported by this host"));
  }
  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) return;
    var message = event.data;
    if (!message || message.jsonrpc !== "2.0") return;
    if (message.id !== undefined && pending.has(message.id)) {
      var call = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) call.reject(message.error);
      else {
        if (message.result && message.result.hostContext) {
          hostContext = message.result.hostContext;
        }
        call.resolve(message.result);
      }
      return;
    }
    if (message.method === "ui/notifications/tool-input") toolInput = message.params;
    if (message.method === "ui/notifications/tool-result") {
      toolOutput = message.params;
      toolResponseMetadata = message.params && message.params._meta;
    }
    if (message.method === "ui/notifications/host-context-changed") {
      hostContext = message.params || {};
      window.dispatchEvent(new CustomEvent("openai:host-context-changed", { detail: hostContext }));
    }
  }, { passive: true });
  window.openai = {
    get toolInput() { return toolInput; },
    get toolOutput() { return toolOutput; },
    get toolResponseMetadata() { return toolResponseMetadata; },
    get theme() { return hostContext.theme; },
    get locale() { return hostContext.locale; },
    get displayMode() { return hostContext.displayMode || "inline"; },
    get maxHeight() { return hostContext.maxHeight; },
    get safeArea() { return hostContext.safeAreaInsets; },
    get view() { return hostContext.view; },
    get userAgent() { return hostContext.userAgent; },
    callTool: function (name, args) { return request("tools/call", { name: name, arguments: args || {} }); },
    sendFollowUpMessage: function (message) { return request("ui/message", { message: message }); },
    requestDisplayMode: function (mode) { return request("ui/request-display-mode", { mode: mode }); },
    requestModal: function (content, options) { return request("ui/request-modal", { content: content, options: options || {} }); },
    requestClose: function () { return request("ui/request-close", {}); },
    notifyIntrinsicHeight: function (height) {
      window.parent.postMessage({ jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { height: height } }, "*");
    },
    openExternal: function (url) { return request("ui/open-link", { url: url }); },
    setOpenInAppUrl: function (url) { return request("ui/set-open-in-app-url", { url: url }); },
    uploadFile: function () { return unsupported("uploadFile"); },
    selectFiles: function () { return unsupported("selectFiles"); },
    getFileDownloadUrl: function () { return unsupported("getFileDownloadUrl"); },
    get widgetState() { return widgetState; },
    setWidgetState: function (state) {
      widgetState = state;
      window.parent.postMessage({ jsonrpc: "2.0", method: "ui/update-model-context", params: { content: state } }, "*");
    }
  };
})();
<\\/script>`;
  }

  function permissions(): string | undefined {
    const ui = (
      invocation.resource?.meta as { ui?: { permissions?: Record<string, unknown> } } | null
    )?.ui;
    const values = Object.keys(ui?.permissions ?? {}).filter((value) =>
      ["camera", "microphone", "geolocation", "clipboard-write"].includes(value),
    );
    return values.length ? values.join("; ") : undefined;
  }

  function post(message: Record<string, unknown>): void {
    frame?.contentWindow?.postMessage(message, "*");
  }

  function response(id: unknown, result: unknown): void {
    post({ jsonrpc: "2.0", id, result });
  }

  function error(id: unknown, code: number, message: string): void {
    post({ jsonrpc: "2.0", id, error: { code, message } });
  }

  function sendToolState(): void {
    if (!initialized) return;
    post({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-input",
      params: { arguments: invocation.arguments },
    });
    if (invocation.structured_content !== undefined || invocation.content.length > 0) {
      post({
        jsonrpc: "2.0",
        method: "ui/notifications/tool-result",
        params: {
          content: invocation.content,
          structuredContent: invocation.structured_content,
          _meta: invocation.meta,
        },
      });
    }
  }

  async function handleRequest(message: Record<string, unknown>): Promise<void> {
    const id = message.id;
    const method = typeof message.method === "string" ? message.method : "";
    const params = (message.params ?? {}) as Record<string, unknown>;
    if (method === "ui/initialize" || method === "initialize") {
      const requestedVersion =
        typeof params.protocolVersion === "string" ? params.protocolVersion : "2026-01-26";
      response(id, {
        protocolVersion: requestedVersion,
        hostCapabilities: {
          openLinks: {},
          serverTools: {},
          requestDisplayMode: {},
        },
        capabilities: {
          openLinks: {},
          serverTools: {},
          requestDisplayMode: {},
        },
        hostInfo: { name: "OpenAgent", version: "0.1.0" },
        hostContext: hostContext(),
      });
      return;
    }
    if (method === "ping") {
      response(id, {});
      return;
    }
    if (method === "tools/call") {
      const name = typeof params.name === "string" ? params.name : "";
      if (!name) {
        error(id, -32602, "tools/call requires a tool name");
        return;
      }
      try {
        const result = await desktopOpenAgent.invokeProduct("call_mcp_tool", {
          server_id: invocation.descriptor.server_id,
          tool_name: name,
          arguments: params.arguments ?? {},
        });
        response(id, result);
        post({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: result });
      } catch (cause) {
        error(id, -32000, String(cause));
      }
      return;
    }
    if (method === "ui/open-link") {
      const url = typeof params.url === "string" ? params.url : "";
      try {
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol)) {
          throw new Error("only http(s) links are allowed");
        }
        await uiCapabilities.openUrl(parsed.toString());
        response(id, {});
      } catch (cause) {
        error(id, -32602, String(cause));
      }
      return;
    }
    if (method === "ui/request-display-mode") {
      const requested = params.mode;
      if (requested !== "inline" && requested !== "fullscreen") {
        error(id, -32602, "display mode is not supported by this host");
        return;
      }
      displayMode = requested;
      hostContextVersion += 1;
      response(id, { mode: displayMode });
      post({
        jsonrpc: "2.0",
        method: "ui/notifications/host-context-changed",
        params: hostContext(),
      });
      return;
    }
    if (method === "notifications/message") {
      response(id, {});
      return;
    }
    if (method === "resources/read") {
      const uri = typeof params.uri === "string" ? params.uri : "";
      if (uri !== invocation.descriptor.resource_uri) {
        error(id, -32602, "resource URI is outside the active MCP App");
        return;
      }
      try {
        const result = await desktopOpenAgent.invokeProduct("read_mcp_resource", {
          server_id: invocation.descriptor.server_id,
          uri,
        });
        response(id, result);
      } catch (cause) {
        error(id, -32000, String(cause));
      }
      return;
    }
    if (method === "ui/update-model-context" || method === "ui/message") {
      if (method === "ui/update-model-context") {
        _modelContextUpdate = params.content;
      }
      response(id, {});
      return;
    }
    if (method === "ui/set-open-in-app-url") {
      error(id, -32601, "setOpenInAppUrl is not supported by this host");
      return;
    }
    if (method === "ui/request-modal" || method === "ui/request-close") {
      error(id, -32601, method + " is not supported by this host");
      return;
    }
    if (method === "ui/resource-teardown") {
      response(id, {});
      return;
    }
    error(id, -32601, "Unsupported MCP Apps method: " + method);
  }

  function onMessage(event: MessageEvent): void {
    if (event.source !== frame?.contentWindow) return;
    const message = event.data as Record<string, unknown> | null;
    if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") return;
    if (message.id === undefined) {
      if (message.method === "ui/notifications/initialized") {
        initialized = true;
        post({
          jsonrpc: "2.0",
          method: "ui/notifications/host-context-changed",
          params: hostContext(),
        });
        sendToolState();
      }
      if (message.method === "ui/notifications/size-changed") {
        const value = (message.params as { height?: unknown } | undefined)?.height;
        if (typeof value === "number" && Number.isFinite(value)) {
          height = Math.max(120, Math.min(720, Math.ceil(value)));
        }
      }
      return;
    }
    void handleRequest(message);
  }

  function onLoad(): void {
    initialized = false;
    sendToolState();
  }

  $effect(() => {
    invocation.resource?.uri;
    invocation.arguments;
    invocation.structured_content;
    if (initialized) sendToolState();
  });

  $effect(() => {
    window.addEventListener("message", onMessage);
    const observer = new MutationObserver(() => {
      if (!initialized) return;
      hostContextVersion += 1;
      post({
        jsonrpc: "2.0",
        method: "ui/notifications/host-context-changed",
        params: hostContext(),
      });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      observer.disconnect();
      window.removeEventListener("message", onMessage);
    };
  });

  onDestroy(() => {
    if (frame?.contentWindow && initialized) {
      frame.contentWindow.postMessage(
        {
          jsonrpc: "2.0",
          id: requestId++,
          method: "ui/resource-teardown",
          params: { reason: "unmounted" },
        },
        "*",
      );
    }
  });
</script>

<section
  class:fullscreen={displayMode === "fullscreen"}
  class="mcp-app-frame"
  style={"height: " + height + "px"}
  aria-label="MCP App"
>
  <iframe
    title="MCP App"
    srcdoc={documentSource()}
    bind:this={frame}
    sandbox="allow-scripts"
    allow={permissions()}
    referrerpolicy="no-referrer"
    onload={onLoad}
  ></iframe>
</section>

<style>
  .mcp-app-frame {
    width: 100%;
    min-height: 120px;
    margin: 6px 0;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
  }
  .mcp-app-frame.fullscreen {
    position: fixed;
    inset: 0;
    z-index: 1000;
    height: 100dvh !important;
    margin: 0;
    border-radius: 0;
    background: var(--background);
  }
  iframe {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
  }
</style>
