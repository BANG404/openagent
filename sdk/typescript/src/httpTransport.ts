import {
  OPENAGENT_PROTOCOL_VERSION,
  type OpenAgentEventMap,
  type OpenAgentOperationMap,
} from "./contracts";
import type {
  OpenAgentEvent as OpenAgentEventName,
  OpenAgentOperation,
  OpenAgentSubscriptionOptions,
  OpenAgentTransport,
  Unsubscribe,
} from "./transport";

interface SessionResponse {
  csrf: string;
  protocol_version: number;
}

export interface EventSourceLike {
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  close(): void;
  onerror: ((event: Event) => void) | null;
}

export interface HttpTransportOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  eventSource?: (url: string) => EventSourceLike;
}

export class HttpTransport implements OpenAgentTransport {
  private csrf = "";
  private readonly baseUrl: string;
  private readonly fetchRequest: typeof fetch;
  private readonly createEventSource: (url: string) => EventSourceLike;

  constructor(options: HttpTransportOptions = {}) {
    this.baseUrl = options.baseUrl?.replace(/\/$/, "") ?? "";
    this.fetchRequest = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.createEventSource =
      options.eventSource ?? ((url) => new EventSource(url) as EventSourceLike);
  }

  async request<Operation extends OpenAgentOperation>( // NOSONAR: the operation map is intentionally exhaustive and keeps protocol dispatch type-safe.
    operation: Operation,
    request: OpenAgentOperationMap[Operation]["request"],
  ): Promise<OpenAgentOperationMap[Operation]["response"]> {
    switch (
      operation // NOSONAR: the typed transport contract intentionally enumerates every operation.
    ) {
      case "product.get_startup_bootstrap":
        return this.read("/api/desktop/bootstrap");
      case "product.invoke_desktop": {
        const input = request as OpenAgentOperationMap["product.invoke_desktop"]["request"];
        return this.write("/api/desktop/operations", input, false);
      }
      case "gateway.restore_session": {
        try {
          const session = await this.read<SessionResponse>("/api/session");
          this.acceptSession(session);
          this.csrf = session.csrf;
          return true as OpenAgentOperationMap[Operation]["response"];
        } catch {
          this.csrf = "";
          return false as OpenAgentOperationMap[Operation]["response"];
        }
      }
      case "gateway.pair": {
        const { code } = request as OpenAgentOperationMap["gateway.pair"]["request"];
        const session = await this.write<SessionResponse>("/api/pair", { code }, false);
        this.acceptSession(session);
        this.csrf = session.csrf;
        return undefined as OpenAgentOperationMap[Operation]["response"];
      }
      case "gateway.list_workspaces":
        return this.read("/api/workspaces");
      case "gateway.list_roles": {
        const { workspaceId } = request as OpenAgentOperationMap["gateway.list_roles"]["request"];
        return this.read(`/api/workspaces/${encodeURIComponent(workspaceId)}/roles`);
      }
      case "gateway.list_workspace_files": {
        const { workspaceId, query } =
          request as OpenAgentOperationMap["gateway.list_workspace_files"]["request"];
        const suffix = query ? `?query=${encodeURIComponent(query)}` : "";
        return this.read(`/api/workspaces/${encodeURIComponent(workspaceId)}/files${suffix}`);
      }
      case "gateway.list_models":
        return this.read("/api/models");
      case "gateway.list_commands":
        return this.read("/api/commands");
      case "gateway.get_preferences":
        return this.read("/api/preferences");
      case "conversation.list_remote": {
        const { workspaceId } =
          request as OpenAgentOperationMap["conversation.list_remote"]["request"];
        return this.read(`/api/workspaces/${encodeURIComponent(workspaceId)}/conversations`);
      }
      case "conversation.create_remote": {
        const { workspaceId, roleId } =
          request as OpenAgentOperationMap["conversation.create_remote"]["request"];
        return this.write("/api/conversations", {
          workspace_id: workspaceId,
          role_id: roleId || null,
        });
      }
      case "conversation.get_remote_state": {
        const { convId } =
          request as OpenAgentOperationMap["conversation.get_remote_state"]["request"];
        return this.read(`/api/conversations/${encodeURIComponent(convId)}`);
      }
      case "conversation.get_input_queue": {
        const { convId } =
          request as OpenAgentOperationMap["conversation.get_input_queue"]["request"];
        return this.read(`/api/conversations/${encodeURIComponent(convId)}/input-queue`);
      }
      case "conversation.mutate_input_queue": {
        const { convId, action } =
          request as OpenAgentOperationMap["conversation.mutate_input_queue"]["request"];
        return this.write(`/api/conversations/${encodeURIComponent(convId)}/input-queue`, action);
      }
      case "conversation.get_remote_history": {
        const { convId } =
          request as OpenAgentOperationMap["conversation.get_remote_history"]["request"];
        return this.read(`/api/conversations/${encodeURIComponent(convId)}/history`);
      }
      case "conversation.read_ui_asset": {
        const { convId, plugin_id, entry } =
          request as OpenAgentOperationMap["conversation.read_ui_asset"]["request"];
        const asset = await this.write<
          OpenAgentOperationMap["conversation.read_ui_asset"]["response"]
        >(`/api/conversations/${encodeURIComponent(convId)}/ui/asset`, { plugin_id, entry });
        return {
          ...asset,
          document_url: asset.document_url ? this.url(asset.document_url) : undefined,
        } as OpenAgentOperationMap[Operation]["response"];
      }
      case "conversation.set_ui_props": {
        const { convId, branchId, messageId, props } =
          request as OpenAgentOperationMap["conversation.set_ui_props"]["request"];
        return this.write(`/api/conversations/${encodeURIComponent(convId)}/ui/state`, {
          branch_id: branchId,
          message_id: messageId,
          props,
        });
      }
      case "conversation.switch_remote_branch": {
        const { convId, checkpointId } =
          request as OpenAgentOperationMap["conversation.switch_remote_branch"]["request"];
        await this.write(`/api/conversations/${encodeURIComponent(convId)}/active-tip`, {
          checkpoint_id: checkpointId,
        });
        return undefined as OpenAgentOperationMap[Operation]["response"];
      }
      case "conversation.fork_remote_run": {
        const input = request as OpenAgentOperationMap["conversation.fork_remote_run"]["request"];
        await this.write(`/api/conversations/${encodeURIComponent(input.convId)}/fork-runs`, {
          text: input.text,
          source_checkpoint_id: input.sourceCheckpointId,
          parent_checkpoint_id: input.parentCheckpointId,
          forked_from_message_id: input.forkedFromMessageId,
          attachments: input.attachments,
          contexts: input.contexts ?? [],
          model_binding: input.modelBinding
            ? { providerId: input.modelBinding.providerId, model: input.modelBinding.model }
            : null,
          user_message_id: input.userMessageId,
          assistant_message_id: input.assistantMessageId,
        });
        return { type: "run_accepted" } as OpenAgentOperationMap[Operation]["response"];
      }
      case "conversation.update_remote": {
        const { convId, patch } =
          request as OpenAgentOperationMap["conversation.update_remote"]["request"];
        await this.write(
          `/api/conversations/${encodeURIComponent(convId)}`,
          { patch },
          true,
          "PATCH",
        );
        return undefined as OpenAgentOperationMap[Operation]["response"];
      }
      case "conversation.delete_remote": {
        const { convId } =
          request as OpenAgentOperationMap["conversation.delete_remote"]["request"];
        await this.write(`/api/conversations/${encodeURIComponent(convId)}`, {}, true, "DELETE");
        return undefined as OpenAgentOperationMap[Operation]["response"];
      }
      case "conversation.cancel_remote": {
        const { convId } =
          request as OpenAgentOperationMap["conversation.cancel_remote"]["request"];
        await this.write(`/api/conversations/${encodeURIComponent(convId)}/cancel`, {});
        return undefined as OpenAgentOperationMap[Operation]["response"];
      }
      case "conversation.set_stream_paused": {
        const { convId, paused } =
          request as OpenAgentOperationMap["conversation.set_stream_paused"]["request"];
        await this.write(`/api/conversations/${encodeURIComponent(convId)}/stream/pause`, {
          paused,
        });
        return undefined as OpenAgentOperationMap[Operation]["response"];
      }
      case "conversation.skip_memory_retrieval": {
        const { convId } =
          request as OpenAgentOperationMap["conversation.skip_memory_retrieval"]["request"];
        await this.write(
          `/api/conversations/${encodeURIComponent(convId)}/memory-retrieval/skip`,
          {},
        );
        return undefined as OpenAgentOperationMap[Operation]["response"];
      }
      case "attachment.upload_remote": {
        const input = request as OpenAgentOperationMap["attachment.upload_remote"]["request"];
        const attachment = await this.write<{
          path: string;
          name: string;
          kind: "image" | "document";
          mime_type: string;
        }>("/api/attachments", {
          name: input.name,
          content_base64: input.contentBase64,
        });
        return {
          path: attachment.path,
          name: attachment.name,
          kind: attachment.kind,
          mimeType: attachment.mime_type,
        } as OpenAgentOperationMap[Operation]["response"];
      }
      case "attachment.get_remote_preview": {
        const { blobId, name } =
          request as OpenAgentOperationMap["attachment.get_remote_preview"]["request"];
        return this.read(
          `/api/attachments/${encodeURIComponent(blobId)}?name=${encodeURIComponent(name)}`,
        );
      }
      case "attachment.repair_blob": {
        const input = request as OpenAgentOperationMap["attachment.repair_blob"]["request"];
        await this.write(`/api/attachments/${encodeURIComponent(input.blobId)}`, {
          name: input.name,
          content_base64: input.contentBase64,
        });
        return undefined as OpenAgentOperationMap[Operation]["response"];
      }
      case "workspace.open_path": {
        const input = request as OpenAgentOperationMap["workspace.open_path"]["request"];
        const convId = this.requireConversationId(input.convId, operation);
        await this.write(`/api/conversations/${encodeURIComponent(convId)}/workspace/open`, {
          path: input.path,
        });
        return undefined as OpenAgentOperationMap[Operation]["response"];
      }
      case "workspace.read_text_snippet": {
        const input = request as OpenAgentOperationMap["workspace.read_text_snippet"]["request"];
        const convId = this.requireConversationId(input.convId, operation);
        const result = await this.write<{ start_line: number; lines: string[] }>(
          `/api/conversations/${encodeURIComponent(convId)}/workspace/text-snippet`,
          { path: input.path, start_line: input.startLine, end_line: input.endLine },
        );
        return {
          startLine: result.start_line,
          lines: result.lines,
        } as OpenAgentOperationMap[Operation]["response"];
      }
      case "workspace.resolve_media": {
        const input = request as OpenAgentOperationMap["workspace.resolve_media"]["request"];
        const convId = this.requireConversationId(input.convId, operation);
        const result = await this.write<{ url: string; mime_type: string }>(
          `/api/conversations/${encodeURIComponent(convId)}/workspace/media`,
          { path: input.path, kind: input.kind },
        );
        return {
          url: this.url(result.url),
          mimeType: result.mime_type,
        } as OpenAgentOperationMap[Operation]["response"];
      }
      case "agent.submit_input": {
        const input = request as OpenAgentOperationMap["agent.submit_input"]["request"];
        if (!input.userMessageId || !input.assistantMessageId) {
          throw new Error("HTTP transport requires userMessageId and assistantMessageId");
        }
        return this.write(`/api/conversations/${encodeURIComponent(input.convId)}/runs`, {
          text: input.text,
          user_message_id: input.userMessageId,
          assistant_message_id: input.assistantMessageId,
          attachments: input.attachments ?? [],
          contexts: input.contexts ?? [],
          model_binding: input.modelBinding
            ? { providerId: input.modelBinding.providerId, model: input.modelBinding.model }
            : null,
        }) as Promise<OpenAgentOperationMap[Operation]["response"]>;
      }
      case "agent.resume_interrupt": {
        const input = request as OpenAgentOperationMap["agent.resume_interrupt"]["request"];
        const response = JSON.parse(input.response) as unknown;
        await this.write(
          `/api/conversations/${encodeURIComponent(input.convId)}/interrupts/${encodeURIComponent(input.interruptId)}`,
          {
            response,
            assistant_message_id: input.assistantMessageId,
            model_binding: input.modelBinding
              ? { providerId: input.modelBinding.providerId, model: input.modelBinding.model }
              : null,
          },
        );
        return undefined as OpenAgentOperationMap[Operation]["response"];
      }
      case "agent.submit_interrupt_response": {
        const input =
          request as OpenAgentOperationMap["agent.submit_interrupt_response"]["request"];
        if (!input.convId) {
          throw new Error("HTTP transport requires convId for a direct interrupt response");
        }
        await this.write(
          `/api/conversations/${encodeURIComponent(input.convId)}/interrupts/${encodeURIComponent(input.interruptId)}/response`,
          { response: JSON.parse(input.response) as unknown },
        );
        return undefined as OpenAgentOperationMap[Operation]["response"];
      }
      default:
        throw new Error(`HTTP transport does not support ${operation}`);
    }
  }

  async subscribe<EventName extends OpenAgentEventName>(
    event: EventName,
    handler: (payload: OpenAgentEventMap[EventName]) => void,
    options?: OpenAgentSubscriptionOptions,
  ): Promise<Unsubscribe> {
    if (event !== "conversation.state" || !options?.conversationId) {
      throw new Error(`HTTP transport does not support ${event} without a conversation scope`);
    }
    const source = this.createEventSource(
      this.url(`/api/conversations/${encodeURIComponent(options.conversationId)}/events`),
    );
    source.addEventListener("state", (message) => {
      handler(JSON.parse(message.data) as OpenAgentEventMap[EventName]);
    });
    source.onerror = () => options.onError?.();
    return () => source.close();
  }

  private read<T>(path: string): Promise<T> {
    return this.send<T>(path);
  }

  private acceptSession(session: SessionResponse): void {
    if (session.protocol_version !== OPENAGENT_PROTOCOL_VERSION) {
      throw new Error(
        `OpenAgent protocol mismatch: server ${session.protocol_version}, client ${OPENAGENT_PROTOCOL_VERSION}`,
      );
    }
  }

  private write<T>(
    path: string,
    body: Record<string, unknown>,
    csrf = true,
    method = "POST",
  ): Promise<T> {
    return this.send<T>(path, {
      method,
      headers: csrf ? { "x-openagent-csrf": this.csrf } : undefined,
      body: JSON.stringify(body),
    });
  }

  private async send<T>(path: string, init: RequestInit = {}): Promise<T> {
    // NOSONAR: response normalization keeps all gateway error states in one boundary.
    const response = await this.fetchRequest(this.url(path), {
      ...init,
      credentials: "same-origin",
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
      let detail: Record<string, unknown> | null = null;
      if (body?.error && typeof body.error === "object") {
        detail = body.error as Record<string, unknown>;
      } else if (typeof body?.error === "string" && body.error.startsWith("{")) {
        try {
          detail = JSON.parse(body.error) as Record<string, unknown>;
        } catch {
          detail = null;
        }
      }
      if (detail) {
        const error = new Error(
          typeof detail.message === "string"
            ? detail.message
            : `${response.status} ${response.statusText}`,
        );
        Object.assign(error, detail);
        throw error;
      }
      throw new Error(
        typeof body?.error === "string" ? body.error : `${response.status} ${response.statusText}`,
      );
    }
    if (response.status === 204) return undefined as T;
    if (response.status === 202 && !response.headers.get("content-type")?.includes("json")) {
      return undefined as T;
    }
    return response.json() as Promise<T>;
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private requireConversationId(convId: string | undefined, operation: string): string {
    if (!convId) throw new Error(`HTTP transport requires convId for ${operation}`);
    return convId;
  }
}
