import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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
  private readonly runtime = new HttpTransport({
    baseUrl: RUNTIME_PROXY_ORIGIN,
    fetch: runtimeProxyFetch as typeof fetch,
  });

  async request<Operation extends OpenAgentOperation>(
    operation: Operation,
    request: OpenAgentOperationMap[Operation]["request"],
  ): Promise<OpenAgentOperationMap[Operation]["response"]> {
    if (operation === "workspace.open_path") {
      const { path } = request as OpenAgentOperationMap["workspace.open_path"]["request"];
      return invoke("open_path", { path }) as Promise<OpenAgentOperationMap[Operation]["response"]>;
    }
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
          await invoke<number>("start_runtime_event_proxy");
          return unsubscribe;
        } catch (error) {
          unsubscribe();
          throw error;
        }
      },
    );
  }
}
