import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import type { OpenAgentEventMap, OpenAgentOperationMap } from "./contracts";
import { HttpTransport } from "./httpTransport";
import { createRuntimeProxyResponse, type RuntimeProxyResponse } from "./runtimeProxyResponse";
import type {
  OpenAgentEvent,
  OpenAgentOperation,
  OpenAgentTransport,
  OpenAgentSubscriptionOptions,
  Unsubscribe,
} from "./transport";

const commandNames = {
  "product.get_startup_bootstrap": "get_startup_bootstrap",
  "agent.submit_input": "submit_agent_input",
  "agent.resume_interrupt": "resume_interrupted_chat",
  "agent.submit_interrupt_response": "submit_interrupt_response",
  "conversation.skip_memory_retrieval": "skip_memory_retrieval",
  "conversation.set_stream_paused": "set_chat_stream_paused",
  "gateway.list_commands": "get_agent_commands",
  "conversation.read_ui_asset": "read_agent_plugin_asset",
  "conversation.set_ui_props": "set_conversation_ui_props",
} as const satisfies Partial<Record<OpenAgentOperation, string>>;

const eventNames = {
  "chat.input_consumed": "chat-input-consumed",
  "chat.input_queue_changed": "chat-input-queue-changed",
  "plugin.install_progress": "agent-plugin-install-progress",
  "chat.run_started": "chat-run-started",
  "chat.response_started": "chat-response-started",
  "chat.model_usage": "chat-model-usage",
  "chat.memory_retrieval": "chat-memory-retrieval",
  "chat.chunk": "chat-chunk",
  "chat.thinking_chunk": "chat-thinking-chunk",
  "chat.tool_call": "chat-tool-call",
  "chat.tool_result": "chat-tool-result",
  "chat.file_change": "chat-file-change",
  "chat.checkpoint": "chat-checkpoint",
  "chat.retry": "chat-retry",
  "chat.compaction_progress": "context-compaction-progress",
  "chat.done": "chat-done",
  "chat.follow_up_suggestions": "chat-follow-up-suggestions",
  "conversation.new_suggestions": "new-conversation-suggestions-updated",
  "chat.interrupted": "chat-interrupted",
  "chat.cancelled": "chat-cancelled",
} as const satisfies Partial<Record<OpenAgentEvent, string>>;

const RUNTIME_PROXY_ORIGIN = "https://openagent.runtime";
const RUNTIME_ASSET_ORIGIN = "openagent-runtime://localhost";

export function runtimeAssetUrl(source: string): string {
  const url = new URL(source, RUNTIME_PROXY_ORIGIN);
  if (url.origin !== RUNTIME_PROXY_ORIGIN || !url.pathname.startsWith("/api/media-assets/")) {
    throw new Error("Runtime asset URL is outside the supervised asset boundary");
  }
  return `${RUNTIME_ASSET_ORIGIN}${url.pathname}${url.search}`;
}

async function runtimeProxyFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const source = typeof input === "string" || input instanceof URL ? input.toString() : input.url;
  const url = new URL(source, RUNTIME_PROXY_ORIGIN);
  if (url.origin !== RUNTIME_PROXY_ORIGIN || !url.pathname.startsWith("/api/")) {
    throw new Error("Runtime transport rejected a request outside the product API");
  }
  const response = await invoke<RuntimeProxyResponse>("proxy_runtime_request", {
    request: {
      method: (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase(),
      path: `${url.pathname}${url.search}`,
      body: typeof init.body === "string" ? init.body : null,
    },
  });
  return createRuntimeProxyResponse(response);
}

export class TauriTransport implements OpenAgentTransport {
  private runtimeProxyEnabled: Promise<boolean> | null = null;
  private readonly runtime = new HttpTransport({
    baseUrl: RUNTIME_PROXY_ORIGIN,
    fetch: runtimeProxyFetch as typeof fetch,
  });

  emitLocal<Payload>(event: string, payload?: Payload): Promise<void> {
    return emit(event, payload);
  }

  listenLocal<Payload>(
    event: string,
    handler: (event: { payload: Payload }) => void,
  ): Promise<Unsubscribe> {
    return listen<Payload>(event, handler);
  }

  invokeLocal<Response>(command: string, args?: Record<string, unknown>): Promise<Response> {
    return invoke<Response>(command, args);
  }

  async request<Operation extends OpenAgentOperation>(
    operation: Operation,
    request: OpenAgentOperationMap[Operation]["request"],
  ): Promise<OpenAgentOperationMap[Operation]["response"]> {
    if (operation === "workspace.open_path") {
      const { path } = request as OpenAgentOperationMap["workspace.open_path"]["request"];
      return invoke("open_path", { path }) as Promise<OpenAgentOperationMap[Operation]["response"]>;
    }
    if (operation === "product.invoke_desktop") {
      const input = request as OpenAgentOperationMap["product.invoke_desktop"]["request"];
      if (await this.usesRuntimeProxy()) {
        return this.runtime.request(operation, request);
      }
      return invoke(input.operation, input.args) as Promise<
        OpenAgentOperationMap[Operation]["response"]
      >;
    }
    if (await this.usesRuntimeProxy()) {
      const response = await this.runtime.request(operation, request);
      if (operation === "workspace.resolve_media") {
        const media = response as OpenAgentOperationMap["workspace.resolve_media"]["response"];
        return {
          ...media,
          url: runtimeAssetUrl(media.url),
        } as OpenAgentOperationMap[Operation]["response"];
      }
      if (operation === "conversation.read_ui_asset") {
        const asset = response as OpenAgentOperationMap["conversation.read_ui_asset"]["response"];
        // The desktop renders srcdoc; gateway document URLs belong to the paired browser origin.
        return {
          content: asset.content,
          mime: asset.mime,
        } as OpenAgentOperationMap[Operation]["response"];
      }
      return response;
    }
    if (operation === "attachment.repair_blob") {
      const input = request as OpenAgentOperationMap["attachment.repair_blob"]["request"];
      return invoke("repair_attachment_blob_content", {
        blobId: input.blobId,
        name: input.name,
        contentBase64: input.contentBase64,
      }) as Promise<OpenAgentOperationMap[Operation]["response"]>;
    }
    if (operation === "gateway.get_preferences") {
      return invoke<{ theme?: string; language?: string }>("get_settings").then((config) => ({
        theme: config.theme === "light" || config.theme === "dark" ? config.theme : "system",
        language: config.language === "en" ? "en" : "zh",
      })) as Promise<OpenAgentOperationMap[Operation]["response"]>;
    }
    if (operation === "workspace.read_text_snippet") {
      const input = request as OpenAgentOperationMap["workspace.read_text_snippet"]["request"];
      return invoke<{ start_line: number; lines: string[] }>("read_workspace_text_snippet", {
        path: input.path,
        startLine: input.startLine,
        endLine: input.endLine,
      }).then((result) => ({
        startLine: result.start_line,
        lines: result.lines,
      })) as Promise<OpenAgentOperationMap[Operation]["response"]>;
    }
    if (operation === "workspace.resolve_media") {
      const input = request as OpenAgentOperationMap["workspace.resolve_media"]["request"];
      return invoke<{ path: string; mime_type: string }>("resolve_workspace_media_source", {
        path: input.path,
        kind: input.kind,
      }).then((result) => ({
        url: convertFileSrc(result.path),
        mimeType: result.mime_type,
      })) as Promise<OpenAgentOperationMap[Operation]["response"]>;
    }
    const command = commandNames[operation as keyof typeof commandNames];
    if (!command) {
      throw new Error(`Tauri transport does not support ${operation}`);
    }
    return invoke<OpenAgentOperationMap[Operation]["response"]>(
      command,
      request as unknown as Record<string, unknown>,
    );
  }

  subscribe<Event extends OpenAgentEvent>(
    event: Event,
    handler: (payload: OpenAgentEventMap[Event]) => void,
    _options?: OpenAgentSubscriptionOptions,
  ): Promise<Unsubscribe> {
    const eventName = eventNames[event as keyof typeof eventNames];
    if (!eventName) {
      return Promise.reject(new Error(`Tauri transport does not support ${event}`));
    }
    return listen<OpenAgentEventMap[Event]>(eventName, ({ payload }) => handler(payload)).then(
      async (unsubscribe) => {
        try {
          if (await this.usesRuntimeProxy()) {
            await invoke<number>("start_runtime_event_proxy");
          }
          return unsubscribe;
        } catch (error) {
          unsubscribe();
          throw error;
        }
      },
    );
  }

  private usesRuntimeProxy(): Promise<boolean> {
    this.runtimeProxyEnabled ??= invoke<"embedded" | "external">("runtime_transport_mode").then(
      (mode) => mode === "external",
    );
    return this.runtimeProxyEnabled;
  }
}
