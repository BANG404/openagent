import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve("plugins/codex-v2-message-board");
type RpcResult = {
  serverInfo?: { name?: string };
  tools?: unknown[];
  structuredContent?: Record<string, unknown>;
};
type RpcResponse = { result?: RpcResult };

function request(process: ReturnType<typeof spawn>, message: Record<string, unknown>) {
  return new Promise<RpcResponse>((resolveRequest, reject) => {
    const timer = setTimeout(() => {
      process.stdout?.off("data", onData);
      reject(new Error("message-board response timed out"));
    }, 2000);
    const onData = (chunk: Buffer) => {
      const line = chunk.toString().split(/\r?\n/).find(Boolean);
      if (!line) return;
      process.stdout?.off("data", onData);
      clearTimeout(timer);
      resolveRequest(JSON.parse(line));
    };
    process.stdout?.on("data", onData);
    process.stdin?.write(`${JSON.stringify(message)}\n`);
  });
}

describe("Codex V2 message board plugin", () => {
  test("declares a portable MCP package and matching skill", async () => {
    const manifest = JSON.parse(await readFile(join(root, "plugin.json"), "utf8"));
    const mcp = JSON.parse(await readFile(join(root, "mcp.json"), "utf8"));
    expect(manifest.name).toBe("codex-v2-message-board");
    expect(manifest.extensions.openagent.capabilities).toEqual(["workspace"]);
    expect(mcp.mcpServers["message-board"].command).toBe("node");
    expect(mcp.mcpServers["message-board"].args).toEqual(["${PLUGIN_ROOT}/bin/message-board.mjs"]);
    expect(await readFile(join(root, "skills/message-board/SKILL.md"), "utf8")).toContain(
      "request_id",
    );
  });

  test("serves the nine Codex board tools with bounded, idempotent posts", async () => {
    const data = await mkdtemp(join(tmpdir(), "openagent-message-board-"));
    const child = spawn(process.execPath, [join(root, "bin/message-board.mjs")], {
      env: { ...process.env, PLUGIN_DATA: data },
    });
    try {
      const initialized = await request(child, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18" },
      });
      expect(initialized.result?.serverInfo?.name).toBe("codex-v2-message-board");
      const listed = await request(child, { jsonrpc: "2.0", id: 2, method: "tools/list" });
      expect(listed.result?.tools).toHaveLength(9);
      await request(child, {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "create_channel", arguments: { agent_id: "root", channel_name: "build" } },
      });
      const first = await request(child, {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "post",
          arguments: {
            agent_id: "root",
            channel_name: "build",
            text: "hello 子智能体",
            request_id: "r1",
          },
        },
      });
      const firstPost = first.result?.structuredContent as {
        message_id: string;
        thread_id: string;
      };
      const retry = await request(child, {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: {
          name: "post",
          arguments: {
            agent_id: "root",
            channel_name: "build",
            text: "hello 子智能体",
            request_id: "r1",
          },
        },
      });
      const retryPost = retry.result?.structuredContent as { message_id: string };
      expect(retryPost.message_id).toBe(firstPost.message_id);
      const thread = await request(child, {
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: {
          name: "read_thread",
          arguments: { agent_id: "root", thread_id: firstPost.thread_id },
        },
      });
      const threadResult = thread.result?.structuredContent as {
        root_post: { text_preview: string };
      };
      expect(threadResult.root_post.text_preview).toBe("hello 子智能体");
    } finally {
      child.kill();
    }
  });
});
