import type { BackgroundTerminalSession } from "./openagent";
import type { ChatMessage, StreamItem } from "./types";
import { parseToolResultJson } from "./toolResultJson";

export interface HistoricalTerminalSession extends BackgroundTerminalSession {
  output: string;
  truncated: boolean;
  historical: true;
}

export type TerminalPanelSession = BackgroundTerminalSession | HistoricalTerminalSession;

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Project saved command observations from the selected branch's transcript. */
export function terminalHistory(
  messages: ChatMessage[],
  streamItems: StreamItem[],
  conversationId: string | null,
  branchId: string | null,
): HistoricalTerminalSession[] {
  if (!conversationId) return [];
  const sessions = new Map<string, HistoricalTerminalSession>();
  const seen = new Set<string>();

  function visit(items: StreamItem[]): void {
    for (const item of items) {
      if (item.type === "retry") {
        visit(item.items);
        continue;
      }
      if (item.type !== "tool_call" || !item.result) continue;
      if (item.name !== "exec_command" && item.name !== "write_stdin") continue;
      const result = object(parseToolResultJson(item.result));
      const metadata = object(result?.metadata);
      // A completed exec omits the top-level session_id; its metadata retains
      // the canonical id that also identifies the live Runtime session.
      if (
        metadata?.kind !== "terminal_poll" ||
        typeof metadata.session_id !== "string" ||
        !metadata.session_id ||
        typeof metadata.command !== "string" ||
        typeof metadata.cwd !== "string" ||
        typeof metadata.started_at !== "number" ||
        !Number.isFinite(metadata.started_at) ||
        typeof result?.output !== "string" ||
        typeof result.status !== "string"
      )
        continue;
      const id = metadata.session_id;
      // Hydration and the live stream can carry the same observation. Distinct
      // polls with identical output are still separate when tool ids exist.
      const observation = JSON.stringify([id, item.toolUseId ?? item.args, item.result]);
      if (seen.has(observation)) continue;
      seen.add(observation);
      const previous = sessions.get(id);
      sessions.set(id, {
        session_id: id,
        command: metadata.command,
        cwd: metadata.cwd,
        started_at: metadata.started_at,
        conv_id: conversationId,
        branch_id: branchId,
        // A saved running observation cannot prove the process still exists.
        status: result.status === "running" ? "unavailable" : result.status,
        output: (previous?.output ?? "") + result.output,
        truncated: previous?.truncated === true || result.truncated === true,
        historical: true,
      });
    }
  }

  for (const message of messages) {
    visit(
      message.items ??
        (message.toolCalls ?? []).map((call) => ({
          ...call,
          type: "tool_call" as const,
        })),
    );
  }
  visit(streamItems);
  return [...sessions.values()].sort((a, b) => b.started_at - a.started_at);
}

/** Live sessions supply status and controls; saved observations supply history. */
export function mergeTerminalSessions(
  history: HistoricalTerminalSession[],
  live: BackgroundTerminalSession[],
): TerminalPanelSession[] {
  const sessions = new Map<string, TerminalPanelSession>(
    history.map((session) => [session.session_id, session]),
  );
  for (const session of live) sessions.set(session.session_id, session);
  return [...sessions.values()].sort((a, b) => b.started_at - a.started_at);
}

export function isHistoricalTerminal(
  session: TerminalPanelSession | null,
): session is HistoricalTerminalSession {
  return session !== null && "historical" in session && session.historical === true;
}
