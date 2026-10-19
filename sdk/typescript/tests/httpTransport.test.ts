// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { OpenAgentClient } from "../src/client";
import { HttpTransport } from "../src/httpTransport";

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("HttpTransport", () => {
  test("input queue reads and mutations use the same scoped authenticated resource", async () => {
    const calls = [];
    const snapshot = {
      convId: "conv/queue",
      revision: 4,
      paused: false,
      activeRunId: null,
      items: [],
    };
    const client = new OpenAgentClient(
      new HttpTransport({
        baseUrl: "https://agent.test",
        fetch: async (url, init = {}) => {
          calls.push({ url, init });
          if (url.endsWith("/api/session"))
            return json({ csrf: "queue-csrf", protocol_version: 3 });
          return json(snapshot);
        },
      }),
    );
    await client.restoreRemoteSession();
    expect(await client.getInputQueue("conv/queue")).toEqual(snapshot);
    const action = { type: "reorder", ids: ["second", "first"], expectedRevision: 3 };
    expect(await client.mutateInputQueue("conv/queue", action)).toEqual(snapshot);
    expect(calls.slice(1).map((call) => call.url)).toEqual([
      "https://agent.test/api/conversations/conv%2Fqueue/input-queue",
      "https://agent.test/api/conversations/conv%2Fqueue/input-queue",
    ]);
    expect(calls[2].init.method).toBe("POST");
    expect(calls[2].init.headers["x-openagent-csrf"]).toBe("queue-csrf");
    expect(JSON.parse(calls[2].init.body)).toEqual(action);
  });
  test("conversation UI uses scoped routes with paired-session CSRF rather than desktop operations", async () => {
    const calls = [];
    const fetch = async (url, init = {}) => {
      calls.push({ url, init });
      if (url.endsWith("/api/session")) return json({ csrf: "ui-csrf", protocol_version: 3 });
      if (url.endsWith("/ui/asset"))
        return json({
          content: "<p>UI</p>",
          mime: "text/html",
          document_url: "/api/conversations/conv%2F1/ui/frame?plugin_id=demo&entry=ui%2Fcard.html",
        });
      if (url.endsWith("/ui/state")) return json({ id: "ui-record", checkpoint_id: "saved" });
      throw new Error(`unexpected request ${url}`);
    };
    const client = new OpenAgentClient(new HttpTransport({ baseUrl: "https://agent.test", fetch }));
    await client.restoreRemoteSession();
    await expect(client.readConversationUiAsset("conv/1", "demo", "ui/card.html")).resolves.toEqual(
      {
        content: "<p>UI</p>",
        mime: "text/html",
        document_url:
          "https://agent.test/api/conversations/conv%2F1/ui/frame?plugin_id=demo&entry=ui%2Fcard.html",
      },
    );
    await expect(
      client.setConversationUiProps({
        convId: "conv/1",
        branchId: "branch",
        messageId: "ui-record",
        props: { count: 2 },
      }),
    ).resolves.toEqual({ id: "ui-record", checkpoint_id: "saved" });
    for (const call of calls.slice(1)) {
      expect(call.url).toContain("/api/conversations/conv%2F1/ui/");
      expect(call.init.headers["x-openagent-csrf"]).toBe("ui-csrf");
    }
    expect(JSON.parse(calls[2].init.body)).toEqual({
      branch_id: "branch",
      message_id: "ui-record",
      props: { count: 2 },
    });
  });
  test("maps the shared SDK operations to the authenticated gateway API", async () => {
    const calls = [];
    const fetch = async (url, init = {}) => {
      calls.push({ url, init });
      if (url.endsWith("/api/desktop/bootstrap")) {
        return json({ workspace_path: "C:/workspace", conversations: [] });
      }
      if (url.endsWith("/api/session")) return json({ csrf: "csrf-1", protocol_version: 3 });
      if (url.endsWith("/api/workspaces")) return json([{ id: "workspace-1", name: "OpenAgent" }]);
      if (url.endsWith("/roles")) return json([]);
      if (url.endsWith("/files?query=read")) return json(["README.md"]);
      if (url.endsWith("/api/models"))
        return json([
          { provider_id: "p1", provider_name: "Provider", model: "m1", is_default: true },
        ]);
      if (url.endsWith("/api/commands"))
        return json([
          {
            name: "demo:run",
            owner: "runtime",
            argument: "required_text",
            label_key: "",
            description_key: "",
            plugin_id: "demo",
          },
        ]);
      if (url.endsWith("/api/preferences"))
        return json({
          theme: "dark",
          language: "zh",
          message_layout: "responsive_double",
          message_double_column_min_width: 1440,
          book_mode_font_size: 19,
        });
      if (url.endsWith("/conversations") && url.includes("/workspaces/")) return json([]);
      if (url.endsWith("/api/attachments"))
        return json({
          path: "C:/data/file.png",
          name: "file.png",
          kind: "image",
          mime_type: "image/png",
        });
      if (url.includes("/api/attachments/") && init.method === "POST")
        return new Response(null, { status: 204 });
      if (url.includes("/api/attachments/"))
        return json({ kind: "image", data_url: "data:image/png;base64,YWJj" });
      if (url.endsWith("/history"))
        return json({ checkpoints: [], branches: [], active_branch_tip: null, file_changes: [] });
      if (url.endsWith("/workspace/text-snippet"))
        return json({ start_line: 4, lines: ["line 4"] });
      if (url.endsWith("/workspace/media"))
        return json({ url: "/api/media-assets/media-1", mime_type: "image/png" });
      if (url.endsWith("/api/conversations")) {
        return json({ conv_id: "conversation-1", branch_id: "branch-1" });
      }
      if (url.endsWith("/runs") && !url.endsWith("/fork-runs")) {
        const body = JSON.parse(init.body);
        return json(
          body.text === "/compact"
            ? { type: "immediate_command", command: "compact", changed: false }
            : { type: "run_accepted" },
        );
      }
      if (
        url.endsWith("/fork-runs") ||
        url.includes("/interrupts/") ||
        url.endsWith("/cancel") ||
        url.endsWith("/stream/pause") ||
        url.endsWith("/memory-retrieval/skip") ||
        url.endsWith("/active-tip") ||
        url.endsWith("/workspace/open") ||
        url.includes("/file-changes/")
      ) {
        return new Response(null, { status: 202 });
      }
      if (init.method === "PATCH" || init.method === "DELETE")
        return new Response(null, { status: 204 });
      throw new Error(`unexpected request ${url}`);
    };
    const client = new OpenAgentClient(
      new HttpTransport({ baseUrl: "https://agent.test/", fetch }),
    );

    await expect(client.getStartupBootstrap()).resolves.toEqual({
      workspace_path: "C:/workspace",
      conversations: [],
    });
    await expect(client.restoreRemoteSession()).resolves.toBe(true);
    await expect(client.listRemoteWorkspaces()).resolves.toEqual([
      { id: "workspace-1", name: "OpenAgent" },
    ]);
    await expect(client.listRemoteRoles("workspace-1")).resolves.toEqual([]);
    await expect(client.listRemoteWorkspaceFiles("workspace-1", "read")).resolves.toEqual([
      "README.md",
    ]);
    await expect(client.listRemoteModels()).resolves.toHaveLength(1);
    await expect(client.listAgentCommands()).resolves.toEqual([
      {
        name: "demo:run",
        owner: "runtime",
        argument: "required_text",
        label_key: "",
        description_key: "",
        plugin_id: "demo",
      },
    ]);
    await expect(client.getRemotePreferences()).resolves.toEqual({
      theme: "dark",
      language: "zh",
      message_layout: "responsive_double",
      message_double_column_min_width: 1440,
      book_mode_font_size: 19,
    });
    await expect(client.listRemoteConversations("workspace-1")).resolves.toEqual([]);
    await expect(client.createRemoteConversation("workspace-1", null)).resolves.toEqual({
      conv_id: "conversation-1",
      branch_id: "branch-1",
    });
    await expect(
      client.submitInput({
        convId: "conversation-1",
        text: "hello",
        attachments: ["C:/data/file.png"],
        contexts: [{ type: "quote", text: "earlier answer", sourceMessageId: "assistant-0" }],
        modelBinding: { providerId: "p1", model: "m1" },
        userMessageId: "user-1",
        assistantMessageId: "assistant-1",
      }),
    ).resolves.toEqual({ type: "run_accepted" });
    await expect(
      client.submitInput({
        convId: "conversation-1",
        text: "/compact",
        userMessageId: "user-compact",
        assistantMessageId: "assistant-compact",
      }),
    ).resolves.toEqual({
      type: "immediate_command",
      command: "compact",
      changed: false,
    });
    await client.resumeInterrupt({
      convId: "conversation-1",
      interruptId: "interrupt-1",
      response: JSON.stringify({ values: { approved: true } }),
      assistantMessageId: "assistant-resume-1",
      modelBinding: { providerId: "p1", model: "m1" },
    });
    await client.submitInterruptResponse({
      convId: "conversation-1",
      interruptId: "mermaid-1",
      response: JSON.stringify({ ok: true, svg: "<svg />" }),
    });
    await expect(client.uploadRemoteAttachment("file.png", "YWJj")).resolves.toEqual({
      path: "C:/data/file.png",
      name: "file.png",
      kind: "image",
      mimeType: "image/png",
    });
    await expect(client.getRemoteAttachmentPreview("sha256:abc", "file.png")).resolves.toEqual({
      kind: "image",
      data_url: "data:image/png;base64,YWJj",
    });
    await client.repairAttachmentBlob("sha256:abc", "file.png", "YWJj");
    await expect(client.getRemoteConversationHistory("conversation-1")).resolves.toEqual({
      checkpoints: [],
      branches: [],
      active_branch_tip: null,
      file_changes: [],
    });
    await client.switchRemoteConversationBranch("conversation-1", "checkpoint-1");
    await client.openWorkspacePath("src/main.ts", "conversation-1");
    await expect(
      client.readWorkspaceTextSnippet("src/main.ts", 4, 8, "conversation-1"),
    ).resolves.toEqual({ startLine: 4, lines: ["line 4"] });
    await expect(
      client.resolveWorkspaceMedia("output/chart.png", "image", "conversation-1"),
    ).resolves.toEqual({
      url: "https://agent.test/api/media-assets/media-1",
      mimeType: "image/png",
    });
    await expect(
      client.forkRemoteConversationRun({
        convId: "conversation-1",
        text: "edited",
        sourceCheckpointId: "checkpoint-1",
        parentCheckpointId: "checkpoint-0",
        forkedFromMessageId: "message-0",
        attachments: [{ locator: "sha256:abc", name: "file.png" }],
        contexts: [{ type: "quote", text: "earlier answer", sourceMessageId: "assistant-0" }],
        modelBinding: { providerId: "p1", model: "m1" },
        userMessageId: "user-2",
        assistantMessageId: "assistant-2",
      }),
    ).resolves.toEqual({ type: "run_accepted" });
    await client.updateRemoteConversation("conversation-1", { pinned: true });
    await client.skipMemoryRetrieval("conversation-1");
    await client.cancelRemoteConversation("conversation-1");
    await client.setConversationStreamPaused("conversation-1", true);
    await client.deleteRemoteConversation("conversation-1");

    const runCall = calls.find((call) => call.url.endsWith("/runs"));
    expect(runCall).toMatchObject({
      url: "https://agent.test/api/conversations/conversation-1/runs",
      init: {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-openagent-csrf": "csrf-1",
        },
      },
    });
    expect(JSON.parse(runCall.init.body)).toEqual({
      text: "hello",
      user_message_id: "user-1",
      assistant_message_id: "assistant-1",
      attachments: ["C:/data/file.png"],
      contexts: [{ type: "quote", text: "earlier answer", sourceMessageId: "assistant-0" }],
      model_binding: { providerId: "p1", model: "m1" },
    });
    const interruptCall = calls.find((call) => call.url.endsWith("/interrupts/interrupt-1"));
    expect(JSON.parse(interruptCall.init.body)).toEqual({
      response: { values: { approved: true } },
      assistant_message_id: "assistant-resume-1",
      model_binding: { providerId: "p1", model: "m1" },
    });
    const mermaidCall = calls.find((call) => call.url.endsWith("/interrupts/mermaid-1/response"));
    expect(JSON.parse(mermaidCall.init.body)).toEqual({
      response: { ok: true, svg: "<svg />" },
    });
    expect(calls.find((call) => call.init.method === "PATCH")).toMatchObject({
      url: "https://agent.test/api/conversations/conversation-1",
    });
    expect(calls.find((call) => call.init.method === "DELETE")).toMatchObject({
      url: "https://agent.test/api/conversations/conversation-1",
    });
    const forkCall = calls.find((call) => call.url.endsWith("/fork-runs"));
    expect(JSON.parse(forkCall.init.body)).toMatchObject({
      source_checkpoint_id: "checkpoint-1",
      parent_checkpoint_id: "checkpoint-0",
      forked_from_message_id: "message-0",
      contexts: [{ type: "quote", text: "earlier answer", sourceMessageId: "assistant-0" }],
      model_binding: { providerId: "p1", model: "m1" },
    });
    const pauseCall = calls.find((call) => call.url.endsWith("/stream/pause"));
    expect(JSON.parse(pauseCall.init.body)).toEqual({ paused: true });
    const snippetCall = calls.find((call) => call.url.endsWith("/workspace/text-snippet"));
    expect(JSON.parse(snippetCall.init.body)).toEqual({
      path: "src/main.ts",
      start_line: 4,
      end_line: 8,
    });
    const repairCall = calls.find(
      (call) => call.url.endsWith("/api/attachments/sha256%3Aabc") && call.init.method === "POST",
    );
    expect(JSON.parse(repairCall.init.body)).toEqual({
      name: "file.png",
      content_base64: "YWJj",
    });
  });

  test("rejects a server with a different protocol version", async () => {
    const client = new OpenAgentClient(
      new HttpTransport({
        fetch: async () => json({ csrf: "csrf", protocol_version: 99 }),
      }),
    );
    await expect(client.restoreRemoteSession()).resolves.toBe(false);
  });

  test("preserves structured client input errors across HTTP", async () => {
    const client = new OpenAgentClient(
      new HttpTransport({
        fetch: async () =>
          json(
            {
              error: JSON.stringify({
                code: "unexpected_argument",
                command: "settings",
                message: "The /settings command does not accept an argument",
              }),
            },
            400,
          ),
      }),
    );

    try {
      await client.invokeProduct("resolve_agent_input", { text: "/settings now" });
      throw new Error("expected resolve_agent_input to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("The /settings command does not accept an argument");
      expect(error.code).toBe("unexpected_argument");
      expect(error.command).toBe("settings");
    }
  });

  test("subscribes conversation state through scoped SSE", async () => {
    const sources = [];
    const transport = new HttpTransport({
      fetch: async () => json({}),
      eventSource: (url) => {
        const source = {
          url,
          listener: null,
          closed: false,
          onerror: null,
          addEventListener(_type, listener) {
            this.listener = listener;
          },
          close() {
            this.closed = true;
          },
        };
        sources.push(source);
        return source;
      },
    });
    const client = new OpenAgentClient(transport);
    const states = [];
    const unsubscribe = await client.subscribeToConversationState("conversation/1", (state) =>
      states.push(state),
    );
    const state = {
      conv_id: "conversation/1",
      title: "Generated title",
      phase: null,
      checkpoint_id: null,
      messages: [],
      interrupts: [],
    };

    sources[0].listener({ data: JSON.stringify(state) });
    expect(sources[0].url).toBe("/api/conversations/conversation%2F1/events");
    expect(states).toEqual([state]);

    unsubscribe();
    expect(sources[0].closed).toBe(true);
  });

  test("rejects unscoped or unsupported HTTP operations", async () => {
    const transport = new HttpTransport({ fetch: async () => json({}) });
    const client = new OpenAgentClient(transport);
    await expect(
      transport.request("agent.submit_interrupt_response", {
        interruptId: "interrupt-1",
        response: "{}",
      }),
    ).rejects.toThrow("requires convId");
    await expect(client.openWorkspacePath("src/main.ts")).rejects.toThrow(
      "requires convId for workspace.open_path",
    );
  });
});
