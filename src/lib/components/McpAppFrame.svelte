<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import { desktopOpenAgent } from "$lib/openagent/tauriClient";
  import { useOpenAgentUiCapabilities } from "$lib/openagent/uiCapabilities";
  import { t, locale } from "$lib/i18n";
  import type { McpUiInvocation } from "$lib/types";

  let { invocation }: { invocation: McpUiInvocation } = $props();

  let frame = $state<HTMLIFrameElement | null>(null);
  let modalFrame = $state<HTMLIFrameElement | null>(null);
  let height = $state(280);
  let width = $state<number | null>(null);
  let initialized = $state(false);
  let displayMode = $state<"inline" | "fullscreen" | "pip">("inline");
  let modal = $state<{
    content: string;
    title?: string;
    html?: boolean;
    params?: unknown;
    checkout?: { id: unknown; session: unknown };
  } | null>(null);
  let closed = $state(false);
  let openInAppUrl = $state<string | null>(null);
  let widgetState = $state<unknown>(null);
  let _modelContextUpdate = $state<unknown>(undefined);
  let hostContextVersion = $state(0);
  let requestId = 1;
  let viewAvailableDisplayModes: string[] = ["inline", "fullscreen", "pip"];
  let pendingCheckout: { id: unknown; session: unknown } | null = null;
  const requestTargets = new Map<unknown, Window>();
  const uiCapabilities = useOpenAgentUiCapabilities();

  const availableDisplayModes = ["inline", "fullscreen", "pip"] as const;

  function hostContext(): Record<string, unknown> {
    const container = frame?.parentElement;
    return {
      theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
      displayMode,
      availableDisplayModes,
      locale: $locale,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      platform: /android|iphone|ipad/i.test(navigator.userAgent) ? "mobile" : "desktop",
      deviceCapabilities: {
        touch: "ontouchstart" in window || navigator.maxTouchPoints > 0,
        hover: window.matchMedia("(hover: hover)").matches,
      },
      userAgent: navigator.userAgent,
      maxHeight: 720,
      safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
      containerDimensions: {
        width: container?.clientWidth ?? 0,
        maxHeight: 720,
      },
      toolInfo: { tool: { name: invocation.descriptor.tool_name } },
      openInAppUrl,
      styles: { variables: {}, css: { fonts: "" } },
      version: hostContextVersion,
    };
  }

  function resourceMetadata(): Record<string, unknown> {
    return (invocation.resource?.meta as Record<string, unknown> | null) ?? {};
  }

  function resourceUiMetadata(): Record<string, unknown> {
    const meta = resourceMetadata();
    const standard = (meta.ui as Record<string, unknown> | undefined) ?? {};
    const legacyCsp = (meta["openai/widgetCSP"] as Record<string, unknown> | undefined) ?? {};
    const legacyUi = (meta["openai/ui"] as Record<string, unknown> | undefined) ?? {};
    const csp = (standard.csp as Record<string, unknown> | undefined) ?? {};
    return {
      ...standard,
      prefersBorder: standard.prefersBorder ?? meta["openai/widgetPrefersBorder"],
      domain: standard.domain ?? meta["openai/widgetDomain"],
      availableDisplayModes: legacyUi.availableDisplayModes ?? standard.availableDisplayModes,
      csp: {
        ...csp,
        connectDomains: csp.connectDomains ?? legacyCsp.connect_domains,
        resourceDomains: csp.resourceDomains ?? legacyCsp.resource_domains,
        frameDomains: csp.frameDomains ?? legacyCsp.frame_domains,
        baseUriDomains: csp.baseUriDomains ?? legacyCsp.base_uri_domains,
        redirectDomains: legacyCsp.redirect_domains,
      },
    };
  }

  function htmlContent(): string {
    const resource = invocation.resource;
    if (!resource) return "";
    if (resource.text) return resource.text;
    if (!resource.blob) return "";
    try {
      const binary = atob(resource.blob);
      const bytes = Uint8Array.from(binary, (value) => value.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    } catch {
      return "";
    }
  }

  function cspMeta(): string {
    const ui = resourceUiMetadata();
    const csp = ui.csp as Record<string, unknown> | undefined;
    const domains = (key: string) =>
      (Array.isArray(csp?.[key]) ? csp[key] : []).filter(
        (value): value is string => typeof value === "string" && /^https?:\/\//.test(value),
      );
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

  function modalDocumentSource(content: string, params: unknown): string {
    const escaped = JSON.stringify(params ?? null).replace(/<\//g, "<\\/");
    // Keep the closing tag out of the Svelte source so it cannot terminate this
    // component's outer script block during compilation.
    const scriptClose = "<" + "/script>";
    const prelude = `<script>window.__openagentModalParams=${escaped};${scriptClose}`;
    const withMeta = content.includes("</head>")
      ? content.replace("</head>", cspMeta() + prelude + "</head>")
      : cspMeta() + prelude + content;
    const bridge = openAiBridgeScript();
    return withMeta.includes("</body>")
      ? withMeta.replace("</body>", bridge + "</body>")
      : withMeta + bridge;
  }

  function openAiBridgeScript(): string {
    // Keep a literal closing tag out of the Svelte source so it cannot end this
    // component's script block, and keep any backslash out of the emitted
    // document so the WebView actually ends the injected script element.
    const scriptClose = "<" + "/script>";
    return `<script>
(function () {
  var pending = new Map();
  var nextId = 1000000;
  var toolInput = window.__openagentModalParams;
  var toolOutput;
  var toolResponseMetadata;
  var widgetState = null;
  var hostContext = {};
  function request(method, params) {
    var id = nextId++;
    window.parent.postMessage({ jsonrpc: "2.0", id: id, method: method, params: params || {} }, "*");
    return new Promise(function (resolve, reject) { pending.set(id, { resolve: resolve, reject: reject }); });
  }
  function bytesToBase64(bytes) {
    var binary = "";
    var chunk = 0x8000;
    for (var offset = 0; offset < bytes.length; offset += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunk));
    }
    return btoa(binary);
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
          hostContext = Object.assign({}, hostContext, message.result.hostContext);
        }
        if (message.result && Object.prototype.hasOwnProperty.call(message.result, "widgetState")) {
          widgetState = message.result.widgetState;
        }
        call.resolve(message.result);
      }
      return;
    }
    if (message.method === "ui/notifications/tool-input") {
      toolInput = message.params && Object.prototype.hasOwnProperty.call(message.params, "arguments")
        ? message.params.arguments
        : message.params;
    }
    if (message.method === "ui/notifications/tool-result") {
      toolOutput = message.params && message.params.structuredContent;
      toolResponseMetadata = message.params || null;
    }
    if (message.method === "ui/notifications/tool-cancelled") {
      toolResponseMetadata = message.params || null;
    }
    if (message.method === "ui/notifications/host-context-changed") {
      hostContext = Object.assign({}, hostContext, message.params || {});
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
    listPrompts: function () { return request("prompts/list", {}); },
    getPrompt: function (name, args) { return request("prompts/get", { name: name, arguments: args || {} }); },
    listResources: function () { return request("resources/list", {}); },
    listResourceTemplates: function () { return request("resources/templates/list", {}); },
    sendFollowUpMessage: function (message) {
      var value = typeof message === "string" ? { prompt: message } : (message || {});
      return request("ui/message", {
        role: "user",
        content: { type: "text", text: value.prompt || "" },
        scrollToBottom: value.scrollToBottom !== false
      });
    },
    requestDisplayMode: function (value) {
      return request("ui/request-display-mode", typeof value === "string" ? { mode: value } : value || {});
    },
    requestModal: function (value, options) {
      if (typeof value === "string") return request("ui/request-modal", { content: value, options: options || {} });
      return request("ui/request-modal", value || {});
    },
    requestClose: function () { return request("ui/request-close", {}); },
    notifyIntrinsicHeight: function (height) {
      window.parent.postMessage({ jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { height: height, width: document.documentElement.clientWidth } }, "*");
    },
    openExternal: function (value) {
      var href = typeof value === "string" ? value : value && value.href;
      return request("ui/open-link", { url: href, redirectUrl: typeof value === "object" ? value.redirectUrl : undefined });
    },
    setOpenInAppUrl: function (value) {
      var href = typeof value === "string" ? value : value && value.href;
      return request("ui/set-open-in-app-url", { href: href });
    },
    uploadFile: async function (file, options) {
      if (!file || typeof file.arrayBuffer !== "function") throw new Error("uploadFile requires a File or Blob");
      var bytes = new Uint8Array(await file.arrayBuffer());
      return request("ui/upload-file", {
        name: file.name || "attachment",
        mimeType: file.type || "application/octet-stream",
        contentBase64: bytesToBase64(bytes),
        library: !!(options && options.library)
      });
    },
    selectFiles: function () { return request("ui/select-files", {}); },
    getFileDownloadUrl: function (value) { return request("ui/get-file-download-url", value || {}); },
    requestCheckout: function (session) { return request("ui/request-checkout", session || {}); },
    get widgetState() { return widgetState; },
    setWidgetState: function (state) {
      widgetState = state;
      void request("ui/set-widget-state", { state: state });
    }
  };
})();
${scriptClose}`;
  }

  function permissions(): string | undefined {
    const ui = (
      invocation.resource?.meta as { ui?: { permissions?: Record<string, unknown> } } | null
    )?.ui;
    const values = Object.keys(ui?.permissions ?? {})
      .map((value) => (value === "clipboardWrite" ? "clipboard-write" : value))
      .filter((value) =>
        ["camera", "microphone", "geolocation", "clipboard-write"].includes(value),
      );
    return values.length ? values.join("; ") : undefined;
  }

  function sandboxPermissions(): Record<string, Record<string, never>> {
    const ui = resourceUiMetadata();
    const allowed = ["camera", "microphone", "geolocation", "clipboardWrite"] as const;
    return Object.fromEntries(
      allowed
        .filter((value) => Object.prototype.hasOwnProperty.call(ui?.permissions ?? {}, value))
        .map((value) => [value, {}]),
    );
  }

  // `postMessage` structured-clones its payload, and Svelte's `$state` proxies
  // cannot be cloned — passing one throws `DataCloneError` and the frame
  // silently never receives the message. Snapshotting here keeps every send
  // path (state-derived tool arguments, saved widget state) clonable.
  function post(message: Record<string, unknown>): void {
    frame?.contentWindow?.postMessage($state.snapshot(message), "*");
  }

  function response(id: unknown, result: unknown): void {
    const target = requestTargets.get(id) ?? frame?.contentWindow;
    requestTargets.delete(id);
    target?.postMessage($state.snapshot({ jsonrpc: "2.0", id, result }), "*");
  }

  function error(id: unknown, code: number, message: string): void {
    const target = requestTargets.get(id) ?? frame?.contentWindow;
    requestTargets.delete(id);
    target?.postMessage({ jsonrpc: "2.0", id, error: { code, message } }, "*");
  }

  function sendToolState(): void {
    if (!initialized) return;
    post({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-input",
      params: { arguments: invocation.arguments },
    });
    const result: Record<string, unknown> =
      invocation.tool_result && typeof invocation.tool_result === "object"
        ? { ...(invocation.tool_result as Record<string, unknown>) }
        : {
            content: invocation.content,
            structuredContent: invocation.structured_content,
            _meta: invocation.result_meta ?? invocation.meta,
            isError: invocation.is_error ?? false,
          };
    result.content ??= invocation.content;
    if (invocation.structured_content !== undefined)
      result.structuredContent ??= invocation.structured_content;
    result._meta ??= invocation.result_meta ?? invocation.meta;
    result.isError ??= invocation.is_error ?? false;
    post({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: result });
  }

  // MCP Apps protocol dispatch is intentionally centralized so every request
  // shares the same server and iframe authorization boundary.
  // eslint-disable-next-line complexity
  async function handleRequest(message: Record<string, unknown>): Promise<void> {
    const id = message.id;
    const method = typeof message.method === "string" ? message.method : "";
    const params = (message.params ?? {}) as Record<string, unknown>;
    if (method === "ui/initialize" || method === "initialize") {
      const requestedVersion =
        typeof params.protocolVersion === "string" ? params.protocolVersion : "2026-01-26";
      const requestedModes = (
        params.appCapabilities as { availableDisplayModes?: unknown } | undefined
      )?.availableDisplayModes;
      const declaredModes = resourceUiMetadata().availableDisplayModes;
      const supportedModes = Array.isArray(requestedModes) ? requestedModes : declaredModes;
      viewAvailableDisplayModes = Array.isArray(supportedModes)
        ? supportedModes.filter((mode): mode is string =>
            ["inline", "fullscreen", "pip"].includes(String(mode)),
          )
        : ["inline", "fullscreen", "pip"];
      try {
        widgetState = await desktopOpenAgent.invokeProduct("get_mcp_app_state", {
          conversation_id: invocation.conversation_id ?? null,
          server_id: invocation.descriptor.server_id,
          resource_uri: invocation.descriptor.resource_uri,
        });
      } catch {
        widgetState = null;
      }
      const hostCapabilities = {
        openLinks: {},
        serverTools: {},
        serverResources: {},
        logging: {},
        sandbox: {
          permissions: sandboxPermissions(),
        },
      };
      response(id, {
        protocolVersion: requestedVersion,
        hostCapabilities,
        capabilities: hostCapabilities,
        hostInfo: { name: "OpenAgent", version: "0.1.0" },
        hostContext: hostContext(),
        widgetState,
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
    if (
      method === "prompts/list" ||
      method === "resources/list" ||
      method === "resources/templates/list"
    ) {
      const command =
        method === "prompts/list"
          ? "list_mcp_prompts"
          : method === "resources/list"
            ? "list_mcp_resources"
            : "list_mcp_resource_templates";
      try {
        const result = await desktopOpenAgent.invokeProduct(command, {
          server_id: invocation.descriptor.server_id,
        });
        response(id, result);
      } catch (cause) {
        error(id, -32000, String(cause));
      }
      return;
    }
    if (method === "prompts/get") {
      const name = typeof params.name === "string" ? params.name : "";
      if (!name) {
        error(id, -32602, "prompts/get requires a prompt name");
        return;
      }
      try {
        const result = await desktopOpenAgent.invokeProduct("get_mcp_prompt", {
          server_id: invocation.descriptor.server_id,
          name,
          arguments: params.arguments ?? {},
        });
        response(id, result);
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
        const redirect = params.redirectUrl;
        if (typeof redirect === "string") {
          const redirectUrl = new URL(redirect, window.location.href);
          if (!["http:", "https:"].includes(redirectUrl.protocol)) {
            throw new Error("redirectUrl must use http(s)");
          }
          const redirectDomains =
            ((resourceUiMetadata().csp as Record<string, unknown> | undefined)?.redirectDomains as
              unknown[] | undefined) ?? [];
          const allowed = redirectDomains.some(
            (domain) => typeof domain === "string" && redirectUrl.origin === domain,
          );
          if (!allowed) throw new Error("redirectUrl is not allowlisted by the app");
          parsed.searchParams.set("redirectUrl", redirectUrl.toString());
        } else if (redirect !== undefined && redirect !== false) {
          throw new Error("redirectUrl must be a URL or false");
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
      if (requested !== "inline" && requested !== "fullscreen" && requested !== "pip") {
        error(id, -32602, "display mode is not supported by this host");
        return;
      }
      if (
        viewAvailableDisplayModes.length > 0 &&
        !viewAvailableDisplayModes.includes(String(requested))
      ) {
        response(id, { mode: displayMode });
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
      if (id !== undefined) response(id, {});
      return;
    }
    if (method === "ui/download-file") {
      const url = typeof params.url === "string" ? params.url : "";
      try {
        const parsed = new URL(url, window.location.href);
        if (!["http:", "https:", "data:"].includes(parsed.protocol)) {
          throw new Error("only http(s) or data URLs are allowed");
        }
        if (parsed.protocol === "data:") {
          const anchor = document.createElement("a");
          anchor.href = parsed.toString();
          anchor.download = typeof params.fileName === "string" ? params.fileName : "download";
          anchor.click();
        } else {
          await uiCapabilities.openUrl(parsed.toString());
        }
        response(id, {});
      } catch (cause) {
        error(id, -32000, String(cause));
      }
      return;
    }
    if (method === "resources/read") {
      const uri = typeof params.uri === "string" ? params.uri : "";
      if (!uri) {
        error(id, -32602, "resources/read requires a URI");
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
    if (method === "ui/message") {
      const content = params.content;
      const message =
        typeof params.message === "string"
          ? params.message
          : content &&
              typeof content === "object" &&
              (content as { type?: unknown }).type === "text"
            ? String((content as { text?: unknown }).text ?? "")
            : Array.isArray(content)
              ? content
                  .filter(
                    (part) =>
                      part &&
                      typeof part === "object" &&
                      (part as { type?: unknown }).type === "text",
                  )
                  .map((part) => String((part as { text?: unknown }).text ?? ""))
                  .join("\n")
              : "";
      if (!message.trim() || !invocation.conversation_id) {
        error(id, -32602, "ui/message requires a conversation and text content");
        return;
      }
      try {
        const result = await desktopOpenAgent.submitInput({
          convId: invocation.conversation_id,
          text: message,
        });
        response(id, result);
      } catch (cause) {
        error(id, -32000, String(cause));
      }
      return;
    }
    if (method === "ui/update-model-context") {
      _modelContextUpdate = params;
      try {
        await desktopOpenAgent.invokeProduct("update_mcp_app_model_context", {
          conversation_id: invocation.conversation_id ?? "",
          content: params.content,
          structured_content: params.structuredContent,
        });
        response(id, {});
      } catch (cause) {
        error(id, -32000, String(cause));
      }
      return;
    }
    if (method === "ui/set-open-in-app-url") {
      const href = typeof params.href === "string" ? params.href : "";
      if (href) {
        try {
          const parsed = new URL(href);
          if (!["http:", "https:"].includes(parsed.protocol))
            throw new Error("only http(s) links are allowed");
          openInAppUrl = parsed.toString();
        } catch (cause) {
          error(id, -32602, String(cause));
          return;
        }
      }
      response(id, {});
      return;
    }
    if (method === "ui/request-modal" || method === "ui/request-close") {
      if (method === "ui/request-close") {
        modal = null;
        closed = true;
        response(id, {});
        return;
      }
      const template = typeof params.template === "string" ? params.template : "";
      let content = typeof params.content === "string" ? params.content : htmlContent();
      let html = Boolean(template) || typeof params.content !== "string";
      if (template) {
        try {
          const resource = (await desktopOpenAgent.invokeProduct("read_mcp_resource", {
            server_id: invocation.descriptor.server_id,
            uri: template,
          })) as {
            contents?: Array<{
              text?: unknown;
              blob?: unknown;
              mimeType?: unknown;
              mime_type?: unknown;
            }>;
          };
          const item = resource.contents?.[0];
          if (typeof item?.text === "string") {
            content = item.text;
            html = true;
          } else if (typeof item?.blob === "string") {
            const binary = atob(item.blob);
            content = new TextDecoder().decode(
              Uint8Array.from(binary, (value) => value.charCodeAt(0)),
            );
            html = true;
          }
        } catch (cause) {
          error(id, -32000, String(cause));
          return;
        }
      }
      if (!content && !template) {
        error(id, -32602, "ui/request-modal requires content or template");
        return;
      }
      const options = (params.options ?? {}) as { title?: unknown };
      modal = {
        content,
        html,
        params: params.params,
        title: typeof options.title === "string" ? options.title : undefined,
      };
      response(id, {});
      return;
    }
    if (method === "ui/select-files") {
      try {
        const selected = await openDialog({
          multiple: true,
          directory: false,
          title: $t("selectFiles"),
        });
        const paths = selected ? (Array.isArray(selected) ? selected : [selected]) : [];
        const files = [];
        for (const path of paths) {
          files.push(await desktopOpenAgent.invokeProduct("mcp_app_import_file", { path }));
        }
        response(id, files);
      } catch (cause) {
        error(id, -32000, String(cause));
      }
      return;
    }
    if (method === "ui/upload-file") {
      try {
        const file = await desktopOpenAgent.invokeProduct("mcp_app_upload_file", {
          name: typeof params.name === "string" ? params.name : "attachment",
          mime_type:
            typeof params.mimeType === "string" ? params.mimeType : "application/octet-stream",
          content_base64: typeof params.contentBase64 === "string" ? params.contentBase64 : "",
        });
        response(id, { fileId: file.fileId });
      } catch (cause) {
        error(id, -32000, String(cause));
      }
      return;
    }
    if (method === "ui/get-file-download-url") {
      try {
        const fileId = typeof params.fileId === "string" ? params.fileId : "";
        const result = await desktopOpenAgent.invokeProduct("mcp_app_get_file_download_url", {
          file_id: fileId,
        });
        response(id, { downloadUrl: result.downloadUrl });
      } catch (cause) {
        error(id, -32000, String(cause));
      }
      return;
    }
    if (method === "ui/set-widget-state") {
      try {
        widgetState = params.state;
        await desktopOpenAgent.invokeProduct("set_mcp_app_state", {
          conversation_id: invocation.conversation_id ?? null,
          server_id: invocation.descriptor.server_id,
          resource_uri: invocation.descriptor.resource_uri,
          widget_state: params.state,
        });
        response(id, {});
      } catch (cause) {
        error(id, -32000, String(cause));
      }
      return;
    }
    if (method === "ui/request-checkout") {
      pendingCheckout = { id, session: params };
      modal = {
        content: JSON.stringify(params, null, 2),
        title: $t("checkout"),
        checkout: pendingCheckout,
      };
      return;
    }
    if (method === "ui/resource-teardown") {
      response(id, {});
      return;
    }
    error(id, -32601, "Unsupported MCP Apps method: " + method);
  }

  function onMessage(event: MessageEvent): void {
    if (event.source !== frame?.contentWindow && event.source !== modalFrame?.contentWindow) return;
    const message = event.data as Record<string, unknown> | null;
    if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") return;
    if (message.id !== undefined && event.source && event.source instanceof Window) {
      requestTargets.set(message.id, event.source);
    }
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
        const size = message.params as { height?: unknown; width?: unknown } | undefined;
        const value = size?.height;
        if (typeof value === "number" && Number.isFinite(value)) {
          height = Math.max(120, Math.min(720, Math.ceil(value)));
        }
        if (typeof size?.width === "number" && Number.isFinite(size.width)) {
          width = Math.max(240, Math.min(1402, Math.ceil(size.width)));
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
    $locale;
    if (initialized) {
      untrack(() => {
        hostContextVersion += 1;
        post({
          jsonrpc: "2.0",
          method: "ui/notifications/host-context-changed",
          params: hostContext(),
        });
      });
    }
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
  class:closed
  class:fullscreen={displayMode === "fullscreen"}
  class:pip={displayMode === "pip"}
  class="mcp-app-frame"
  style={"height: " + height + "px" + (width ? "; width: " + width + "px" : "")}
  aria-label={$t("mcpApp")}
>
  <iframe
    title={$t("mcpApp")}
    srcdoc={documentSource()}
    bind:this={frame}
    sandbox="allow-scripts"
    allow={permissions()}
    referrerpolicy="no-referrer"
    onload={onLoad}
  ></iframe>
</section>

{#if modal}
  <div class="mcp-app-modal-backdrop" role="presentation">
    <div
      class="mcp-app-modal"
      role="dialog"
      aria-modal="true"
      aria-label={modal.title ?? $t("mcpApp")}
      tabindex="-1"
    >
      <div class="mcp-app-modal-header">
        <strong>{modal.title ?? $t("mcpApp")}</strong>
        <button type="button" aria-label={$t("close")} onclick={() => (modal = null)}
          >{$t("close")}</button
        >
      </div>
      {#if modal.html}
        <iframe
          title={modal.title ?? $t("mcpAppDialog")}
          srcdoc={modalDocumentSource(modal.content, modal.params)}
          bind:this={modalFrame}
          sandbox="allow-scripts"
        ></iframe>
      {:else}
        <pre>{modal.content}</pre>
      {/if}
      {#if modal.checkout}
        <div class="mcp-app-modal-actions">
          <button
            type="button"
            onclick={async () => {
              const checkout = pendingCheckout;
              if (!checkout) return;
              try {
                const result = await desktopOpenAgent.invokeProduct("call_mcp_tool", {
                  server_id: invocation.descriptor.server_id,
                  tool_name: "complete_checkout",
                  arguments: checkout.session,
                });
                response(checkout.id, result);
              } catch (cause) {
                error(checkout.id, -32000, String(cause));
              } finally {
                pendingCheckout = null;
                modal = null;
              }
            }}>{$t("confirm")}</button
          >
          <button
            type="button"
            onclick={() => {
              if (pendingCheckout) error(pendingCheckout.id, -32000, $t("checkoutCancelled"));
              pendingCheckout = null;
              modal = null;
            }}>{$t("cancel")}</button
          >
        </div>
      {/if}
    </div>
  </div>
{/if}

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
  .mcp-app-frame.closed {
    display: none;
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
  .mcp-app-frame.pip {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 1000;
    width: min(360px, calc(100vw - 32px));
    height: 240px !important;
    margin: 0;
    box-shadow: 0 12px 32px rgb(0 0 0 / 22%);
  }
  iframe {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
  }
  .mcp-app-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1100;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgb(0 0 0 / 42%);
  }
  .mcp-app-modal {
    width: min(640px, 100%);
    max-height: min(720px, 90vh);
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    box-shadow: 0 18px 48px rgb(0 0 0 / 28%);
  }
  .mcp-app-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
  }
  .mcp-app-modal-header button {
    border: 0;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
  }
  .mcp-app-modal pre {
    margin: 0;
    padding: 16px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .mcp-app-modal iframe {
    width: 100%;
    min-height: 240px;
    border: 0;
  }
  .mcp-app-modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
  }
</style>
