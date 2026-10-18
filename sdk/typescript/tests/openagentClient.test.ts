// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { runtimeAssetUrl } from "../src/tauriTransport";
import { OpenAgentClient } from "../src/client";
import { OPENAGENT_PROTOCOL_VERSION } from "../src/contracts";

class MockTransport {
  requests = [];
  handlers = new Map();
  unsubscribed = [];

  async request(operation, request) {
    this.requests.push({ operation, request });
    if (operation === "agent.submit_input") return { type: "run_completed" };
  }

  async subscribe(event, handler) {
    this.handlers.set(event, handler);
    return () => this.unsubscribed.push(event);
  }

  emit(event, payload) {
    this.handlers.get(event)?.(payload);
  }

  async invokeLocal(command, args) {
    this.requests.push({ command, args });
    return "local-result";
  }

  async listenLocal(event, handler) {
    this.handlers.set(event, (payload) => handler({ payload }));
    return () => this.unsubscribed.push(event);
  }

  async emitLocal(event, payload) {
    this.requests.push({ event, payload });
  }
}

function chatHandlers(overrides = {}) {
  return {
    onRunStarted() {},
    onResponseStarted() {},
    onModelUsage() {},
    onMemoryRetrieval() {},
    onChunk() {},
    onThinkingChunk() {},
    onToolCall() {},
    onToolResult() {},
    onFileChange() {},
    onCheckpoint() {},
    onRetry() {},
    onCompactionProgress() {},
    onDone() {},
    onFollowUpSuggestions() {},
    onNewConversationSuggestions() {},
    onInterrupted() {},
    onCancelled() {},
    ...overrides,
  };
}

describe("Tauri Runtime asset URLs", () => {
  test("maps only supervised media assets to the private scheme", () => {
    expect(runtimeAssetUrl("https://openagent.runtime/api/media-assets/token")).toBe(
      "openagent-runtime://localhost/api/media-assets/token",
    );
    expect(() => runtimeAssetUrl("/api/desktop/bootstrap")).toThrow();
    expect(() => runtimeAssetUrl("https://example.com/api/media-assets/token")).toThrow();
  });
});

describe("OpenAgentClient", () => {
  test("queue change hints expose only their conversation and detach cleanly", async () => {
    const transport = new MockTransport();
    const client = new OpenAgentClient(transport);
    const conversations = [];
    const stop = await client.onInputQueueChanged((convId) => conversations.push(convId));
    transport.emit("chat.input_queue_changed", { conv_id: "queue-conversation" });
    expect(conversations).toEqual(["queue-conversation"]);
    stop();
    expect(transport.unsubscribed).toContain("chat.input_queue_changed");
  });
  test("publishes the current transport contract version", () => {
    expect(OPENAGENT_PROTOCOL_VERSION).toBe(3);
  });

  test("keeps desktop-only capabilities behind the transport boundary", async () => {
    const transport = new MockTransport();
    const client = new OpenAgentClient(transport);

    await expect(client.invokeLocal("open_path", { path: "C:/workspace" })).resolves.toBe(
      "local-result",
    );
    expect(transport.requests).toEqual([{ command: "open_path", args: { path: "C:/workspace" } }]);
    const payloads = [];
    const unsubscribe = await client.listenLocal("skills-updated", ({ payload }) => {
      payloads.push(payload);
    });
    transport.emit("skills-updated", { changed: true });
    expect(payloads).toEqual([{ changed: true }]);
    unsubscribe();
    await client.emitLocal("debug-visibility", { visible: false });
    expect(transport.requests.at(-1)).toEqual({
      event: "debug-visibility",
      payload: { visible: false },
    });
  });

  test("submits typed agent operations through a transport-neutral name", async () => {
    const transport = new MockTransport();
    const client = new OpenAgentClient(transport);
    const request = {
      convId: "conversation-1",
      text: "hello",
      branchId: "branch-1",
      userMessageId: "user-1",
      assistantMessageId: "assistant-1",
    };

    await expect(client.submitInput(request)).resolves.toEqual({ type: "run_completed" });
    expect(transport.requests).toEqual([{ operation: "agent.submit_input", request }]);
  });

  test("routes workspace presentation capabilities through the shared contract", async () => {
    const transport = new MockTransport();
    const client = new OpenAgentClient(transport);

    await client.openWorkspacePath("src/main.ts", "conversation-1");
    await client.readWorkspaceTextSnippet("src/main.ts", 2, 5, "conversation-1");
    await client.resolveWorkspaceMedia("output/chart.png", "image", "conversation-1");
    await client.repairAttachmentBlob("sha256:abc", "file.png", "YWJj");
    await client.listAgentCommands();
    await client.getRemotePreferences();

    expect(transport.requests).toEqual([
      {
        operation: "workspace.open_path",
        request: { path: "src/main.ts", convId: "conversation-1" },
      },
      {
        operation: "workspace.read_text_snippet",
        request: {
          path: "src/main.ts",
          startLine: 2,
          endLine: 5,
          convId: "conversation-1",
        },
      },
      {
        operation: "workspace.resolve_media",
        request: { path: "output/chart.png", kind: "image", convId: "conversation-1" },
      },
      {
        operation: "attachment.repair_blob",
        request: { blobId: "sha256:abc", name: "file.png", contentBase64: "YWJj" },
      },
      {
        operation: "gateway.list_commands",
        request: {},
      },
      {
        operation: "gateway.get_preferences",
        request: {},
      },
    ]);
  });

  test("routes slash-command parsing through the replaceable desktop Runtime", async () => {
    const transport = new MockTransport();
    const client = new OpenAgentClient(transport);

    await client.invokeProduct("resolve_agent_input", { text: "/goal ship it" });

    expect(transport.requests.at(-1)).toEqual({
      operation: "product.invoke_desktop",
      request: { operation: "resolve_agent_input", args: { text: "/goal ship it" } },
    });
  });

  test("routes manual background terminal management through the desktop Runtime", async () => {
    const transport = new MockTransport();
    const client = new OpenAgentClient(transport);

    await client.listBackgroundTerminals();
    await client.readBackgroundTerminal("terminal-1", 42);
    await client.writeBackgroundTerminal("terminal-1", "continue");
    await client.killBackgroundTerminal("terminal-1");

    expect(transport.requests.slice(-4)).toEqual([
      {
        operation: "product.invoke_desktop",
        request: { operation: "list_background_terminals", args: {} },
      },
      {
        operation: "product.invoke_desktop",
        request: {
          operation: "read_background_terminal",
          args: { sessionId: "terminal-1", fromByte: 42 },
        },
      },
      {
        operation: "product.invoke_desktop",
        request: {
          operation: "write_background_terminal",
          args: { sessionId: "terminal-1", data: "continue", appendNewline: true },
        },
      },
      {
        operation: "product.invoke_desktop",
        request: { operation: "kill_background_terminal", args: { sessionId: "terminal-1" } },
      },
    ]);
  });

  test("projects transport event payloads into stable chat handlers", async () => {
    const transport = new MockTransport();
    const client = new OpenAgentClient(transport);
    const chunks = [];
    const retries = [];
    const memoryStages = [];
    const modelUsages = [];
    const starts = [];
    const followUps = [];
    const newConversationSuggestions = [];
    const terminalEvents = [];
    const checkpoints = [];
    const files = [];

    const unsubscribe = await client.subscribeToChatEvents(
      chatHandlers({
        onRunStarted: (event) => starts.push(event),
        onChunk: (...args) => chunks.push(args),
        onMemoryRetrieval: (...args) => memoryStages.push(args),
        onModelUsage: (...args) => modelUsages.push(args),
        onRetry: (...args) => retries.push(args),
        onDone: (...args) => terminalEvents.push(["done", ...args]),
        onFollowUpSuggestions: (...args) => followUps.push(args),
        onNewConversationSuggestions: (...args) => newConversationSuggestions.push(args),
        onCheckpoint: (...args) => checkpoints.push(args),
        onFileChange: (...args) => files.push(args),
        onInterrupted: (...args) => terminalEvents.push(["interrupted", ...args]),
        onCancelled: (...args) => terminalEvents.push(["cancelled", ...args]),
      }),
    );

    const started = {
      conv_id: "conversation-1",
      message: "hello",
      msg_id: "user-1",
      asst_msg_id: "assistant-1",
      workspace: "/workspace",
      title: "Remote conversation",
      created_at: 1,
      updated_at: 1,
      pinned: false,
      source: "remote",
      is_new: true,
    };
    transport.emit("chat.run_started", started);
    transport.emit("chat.chunk", { conv_id: "conversation-1", text: "hello" });
    transport.emit("chat.model_usage", {
      conv_id: "conversation-1",
      turn: 2,
      usage: {
        input_tokens: 101000,
        output_tokens: 500,
        total_tokens: 101500,
        cached_input_tokens: 90000,
        cache_creation_input_tokens: 0,
        tool_use_prompt_tokens: 0,
        reasoning_tokens: 0,
      },
    });
    transport.emit("chat.memory_retrieval", {
      conv_id: "conversation-1",
      stage: "searching",
    });
    transport.emit("chat.retry", {
      conv_id: "conversation-1",
      attempt: 2,
      max_attempts: 3,
      model: "model-a",
      error: "retrying",
      restored_checkpoint: true,
    });
    transport.emit("chat.checkpoint", {
      conv_id: "conversation-1",
      checkpoint_id: "checkpoint-1",
      branch_id: "branch-1",
    });
    const change = {
      id: "live:path",
      conv_id: "conversation-1",
      checkpoint_id: "live",
      path: "live.txt",
      operation: "inferred",
      seq: 0,
      created_at: 1,
    };
    transport.emit("chat.file_change", {
      conv_id: "conversation-1",
      change,
      branch_id: "branch-1",
    });
    transport.emit("chat.follow_up_suggestions", {
      conv_id: "conversation-1",
      asst_msg_id: "assistant-1",
      suggestions: ["one", "two", "three"],
    });
    transport.emit("conversation.new_suggestions", {
      workspace: "/workspace",
      language: "en",
      suggestions: ["alpha", "beta", "gamma"],
    });
    transport.emit("chat.done", {
      conv_id: "conversation-1",
      asst_msg_id: "assistant-1",
      turn_id: "turn-1",
      error: null,
    });
    transport.emit("chat.interrupted", {
      conv_id: "conversation-1",
      request_id: "request-1",
      asst_msg_id: "assistant-2",
      turn_id: "turn-1",
    });
    transport.emit("chat.cancelled", {
      conv_id: "conversation-1",
      asst_msg_id: "assistant-2",
      turn_id: "turn-1",
    });

    expect(starts).toEqual([started]);
    expect(chunks).toEqual([["conversation-1", "hello"]]);
    expect(memoryStages).toEqual([["conversation-1", "searching"]]);
    expect(modelUsages).toEqual([
      [
        "conversation-1",
        {
          input_tokens: 101000,
          output_tokens: 500,
          total_tokens: 101500,
          cached_input_tokens: 90000,
          cache_creation_input_tokens: 0,
          tool_use_prompt_tokens: 0,
          reasoning_tokens: 0,
        },
        2,
      ],
    ]);
    expect(retries).toEqual([["conversation-1", 2, 3, "model-a", "retrying", true]]);
    expect(checkpoints).toEqual([["conversation-1", "checkpoint-1", "branch-1"]]);
    expect(files).toEqual([["conversation-1", change, "branch-1"]]);
    expect(followUps).toEqual([["conversation-1", "assistant-1", ["one", "two", "three"]]]);
    expect(newConversationSuggestions).toEqual([["/workspace", "en", ["alpha", "beta", "gamma"]]]);
    expect(terminalEvents).toEqual([
      ["done", "conversation-1", "assistant-1", null, "turn-1"],
      ["interrupted", "conversation-1", "request-1", "assistant-2", "turn-1"],
      ["cancelled", "conversation-1", "assistant-2", "turn-1"],
    ]);

    unsubscribe();
    expect(transport.unsubscribed).toHaveLength(17);
  });
});
