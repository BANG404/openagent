#!/usr/bin/env bun

import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type Args = { conversation?: string; checkpoint?: string; db?: string; json: boolean; includeContent: boolean };
type Row = Record<string, unknown>;

function parseArgs(argv: string[]): Args {
  const args: Args = { json: false, includeContent: false };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--conversation") args.conversation = argv[++i];
    else if (value === "--checkpoint") args.checkpoint = argv[++i];
    else if (value === "--db") args.db = argv[++i];
    else if (value === "--json") args.json = true;
    else if (value === "--include-content") args.includeContent = true;
    else if (value === "--help" || value === "-h") {
      console.log("Usage: inspect-conversation-records.ts (--conversation ID | --checkpoint ID) [--db PATH] [--json] [--include-content]");
      process.exit(0);
    } else throw new Error(`Unknown argument: ${value}`);
  }
  if (Boolean(args.conversation) === Boolean(args.checkpoint)) throw new Error("Specify exactly one of --conversation or --checkpoint.");
  return args;
}

function defaultDbPath(): string {
  if (process.platform === "win32") return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "openagent", "messages.db");
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "openagent", "messages.db");
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "openagent", "messages.db");
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

function checkpointSummary(row: Row, includeContent: boolean): Row {
  const metadata = parseJson(row.metadata) as Record<string, unknown>;
  const payload = parseJson(row.checkpoint) as Record<string, unknown>;
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  return {
    checkpoint_id: row.checkpoint_id,
    parent_checkpoint_id: row.parent_checkpoint_id,
    created_at: row.created_at,
    phase: metadata?.phase ?? null,
    turn_id: metadata?.turn_id ?? null,
    message_count: messages.length,
    metadata,
    ...(includeContent ? { checkpoint: payload } : {}),
  };
}

function main(): void {
  const args = parseArgs(Bun.argv.slice(2));
  const dbPath = args.db ?? defaultDbPath();
  if (!existsSync(dbPath)) throw new Error(`OpenAgent database not found: ${dbPath}`);
  const db = new Database(dbPath, { readonly: true });
  db.exec("PRAGMA query_only = ON");

  const target = args.checkpoint
    ? (db.query("SELECT * FROM checkpoints WHERE checkpoint_id = ?").get(args.checkpoint) as Row | null)
    : null;
  const convId = args.conversation ?? String(target?.thread_id ?? "");
  if (!convId) throw new Error(`Checkpoint not found: ${args.checkpoint}`);
  const conversation = db.query("SELECT * FROM conversations WHERE id = ?").get(convId) as Row | null;
  const branches = db.query("SELECT * FROM branches WHERE conv_id = ? ORDER BY created_at").all(convId) as Row[];
  const checkpointRows = args.checkpoint
    ? [target!]
    : (db.query("SELECT * FROM checkpoints WHERE thread_id = ? ORDER BY created_at").all(convId) as Row[]);
  const traces = db.query("SELECT id, task_kind, model, status, error, checkpoint_id, created_at FROM task_traces WHERE conv_id = ? ORDER BY created_at").all(convId) as Row[];
  const fileChanges = db.query("SELECT id, checkpoint_id, path, operation, created_at FROM file_changes WHERE conv_id = ? ORDER BY created_at").all(convId) as Row[];
  const report = {
    database: dbPath,
    target: args.checkpoint ? { checkpoint_id: args.checkpoint, conversation_id: convId } : { conversation_id: convId },
    conversation,
    branches,
    checkpoints: checkpointRows.map((row) => checkpointSummary(row, args.includeContent)),
    task_traces: traces,
    file_changes: fileChanges,
  };
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else console.log(JSON.stringify(report, null, 2));
}

main();
