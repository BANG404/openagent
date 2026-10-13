// @ts-check
import assert from "node:assert/strict";
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const home = resolve(process.env.OPENAGENT_HOME || "");
assert(home.startsWith(resolve(tmpdir()) + "/") || home.startsWith(resolve(tmpdir()) + "\\"));
assert(home.includes("trace-export-storage"), "select an empty, stopped storage fixture");
const db = new Database(join(home, "messages.db"));
try {
  for (const table of ["conversations", "checkpoints", "task_traces"])
    assert.equal(
      db.query(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n,
      0,
      "fixture must be empty",
    );
  const workspace = join(home, "workspace");
  mkdirSync(workspace, { recursive: true });
  const conv = "native-storage-history";
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHUlEQVR4nGPUrPz/n4ECwESJ5lEDRg0YNWAwGQAA55ICwMeKXAUAAAAASUVORK5CYII=";
  const user = {
    id: "native-user",
    role: "user",
    content: [{ type: "text", text: "Stored screenshot request" }],
    timestamp: 1000,
  };
  db.transaction(() => {
    db.query(
      "INSERT INTO conversations(id,title,workspace,created_at,updated_at,is_last_active,active_tip_checkpoint_id) VALUES (?,?,?,?,?,1,?)",
    ).run(conv, "Native storage branches", workspace, 1, 2, "native-tip-b");
    for (const variant of ["a", "b"]) {
      const id = `native-tip-${variant}`;
      const response = `native-response-${variant}`;
      const tool = `native-tool-${variant}`;
      const data = {
        format_version: 2,
        phase: "final_completed",
        file_change_ids: [],
        messages: [
          user,
          {
            id: `native-call-${variant}`,
            role: "assistant",
            timestamp: 2000,
            content: [{ type: "tool_use", id: tool, name: "screenshot", input: {} }],
          },
          {
            id: `native-result-${variant}`,
            role: "user",
            timestamp: 2001,
            content: [
              {
                type: "tool_result",
                tool_use_id: tool,
                content: [
                  { type: "text", text: "Stored screenshot" },
                  { type: "image", data: { type: "base64", value: png } },
                ],
              },
            ],
          },
          {
            id: response,
            role: "assistant",
            timestamp: 2002,
            content: [
              { type: "text", text: `Branch ${variant.toUpperCase()} preserved screenshot` },
            ],
          },
        ],
      };
      const metadata = {
        step: 1,
        tools_used: ["screenshot"],
        turn: {
          id: `native-turn-${variant}`,
          input_message_id: user.id,
          response_message_id: response,
          status: "completed",
          started_at: 1000,
          completed_at: 2002,
        },
      };
      db.query(
        "INSERT INTO checkpoints(thread_id,checkpoint_id,parent_checkpoint_id,metadata,checkpoint,created_at) VALUES (?,?,NULL,?,?,?)",
      ).run(conv, id, JSON.stringify(metadata), JSON.stringify(data), variant === "a" ? 1 : 2);
      db.query(
        "INSERT INTO branches(id,conv_id,head_checkpoint_id,created_at,updated_at) VALUES (?,?,?,?,?)",
      ).run(`native-branch-${variant}`, conv, id, 1, 2);
    }
    for (let index = 0; index < 105; index++)
      db.query(
        "INSERT INTO task_traces(id,conv_id,session_id,task_kind,model,system_prompt,tools,prompt,completion,status,created_at) VALUES (?,?,?,'chat_request','fixture',?,'[]',?,?,'completed',?)",
      ).run(
        `native-trace-${String(index).padStart(3, "0")}`,
        conv,
        "storage-fixture",
        "Synthetic system prompt",
        JSON.stringify([{ role: "user", content: `Synthetic trace ${index}` }]),
        JSON.stringify({ content: `Synthetic result ${index}` }),
        index,
      );
    // Exercise the real backed-up migration at the next SDK startup. This
    // stopped fixture is synthetic and verified empty before any mutation.
    db.exec(
      "DROP TABLE task_trace_payloads; DROP TABLE checkpoint_messages; DROP TABLE checkpoint_message_versions; DROP TABLE checkpoint_content; PRAGMA user_version=10;",
    );
  })();
  console.log(`Synthetic schema-10 branches and trace pages ready: ${home}`);
} finally {
  db.close();
}
