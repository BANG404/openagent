// Streaming-side helpers for pure stream-item manipulation. Transport event
// subscription lives in the OpenAgent client SDK.

import type { ContextCompactionStage, StreamItem, UserInputRequest } from "./types";

export function appendChunk(items: StreamItem[], text: string): StreamItem[] {
  const split = splitThinkingTags(text);
  if (split.length > 1 || split.some((part) => part.type === "thinking")) {
    return split.reduce((next, part) => {
      if (part.type === "thinking") return appendThinkingChunk(next, part.content);
      return appendPlainTextChunk(next, part.content);
    }, items);
  }
  return appendPlainTextChunk(items, text);
}

function appendPlainTextChunk(items: StreamItem[], text: string): StreamItem[] {
  const last = items.at(-1);
  if (last?.type === "text") {
    return [...items.slice(0, -1), { ...last, content: last.content + text }];
  }
  return [...items, { type: "text", content: text.trimStart() }];
}

type TextLikeStreamItem = Extract<StreamItem, { type: "text" | "thinking" }>;

function splitThinkingTags(text: string): TextLikeStreamItem[] {
  const parts: TextLikeStreamItem[] = [];
  let rest = text;
  let inThinking = false;
  while (rest.length > 0) {
    const tag = inThinking ? "</think>" : "<think>";
    const idx = rest.toLowerCase().indexOf(tag);
    if (idx === -1) {
      if (rest.length > 0) {
        parts.push({ type: inThinking ? "thinking" : "text", content: rest });
      }
      break;
    }
    const before = rest.slice(0, idx);
    if (before.length > 0) {
      parts.push({ type: inThinking ? "thinking" : "text", content: before });
    }
    rest = rest.slice(idx + tag.length);
    inThinking = !inThinking;
  }
  return parts;
}

export function appendThinkingChunk(items: StreamItem[], text: string): StreamItem[] {
  const last = items.at(-1);
  if (last?.type === "thinking") {
    return [...items.slice(0, -1), { ...last, content: last.content + text }];
  }
  return [...items, { type: "thinking", content: text.trimStart() }];
}

export function appendToolCall(
  items: StreamItem[],
  name: string,
  args: unknown,
  toolUseId?: string,
): StreamItem[] {
  // ask_user is represented by a dedicated user_input stream item from
  // chat-user-input-request, not by the generic tool-call card.
  if (name === "ask_user") return items;
  const argsStr = typeof args === "string" ? args : JSON.stringify(args, null, 2);
  return [...items, { type: "tool_call", name, args: argsStr, toolUseId }];
}

// Find the latest tool_call without a result and attach `result` to it.
export function attachToolResult(
  items: StreamItem[],
  result: string,
  toolUseId?: string,
): StreamItem[] {
  const next = [...items];
  if (toolUseId) {
    const exact = next.findIndex((item) =>
      item.type === "tool_call" && item.toolUseId === toolUseId && item.result === undefined,
    );
    if (exact >= 0) {
      const item = next[exact];
      if (item.type === "tool_call") next[exact] = { ...item, result };
      return next;
    }
  }
  for (let i = next.length - 1; i >= 0; i--) {
    const it = next[i];
    if (it.type === "tool_call" && it.result === undefined) {
      next[i] = { ...it, result };
      return next;
    }
  }
  return next;
}

export function appendUserInput(
  items: StreamItem[],
  request: UserInputRequest,
): StreamItem[] {
  if (request.kind === "tool_approval") {
    const next = [...items];
    const matchingIndex = next.findIndex((item) =>
      item.type === "tool_call"
      && item.toolUseId === request.request_id
      && item.result === undefined
      && item.approval === undefined,
    );
    if (matchingIndex >= 0) {
      const item = next[matchingIndex];
      if (item.type === "tool_call") {
        next[matchingIndex] = { ...item, approval: { request, state: "pending" } };
        return next;
      }
    }
    // Live approval events do not carry a provider tool-use id. Tools execute
    // in provider order, so pair that provisional event with the first pending
    // card; pairing it with the last card corrupts batched tool responses.
    for (let i = 0; i < next.length; i++) {
      const item = next[i];
      if (item.type === "tool_call" && item.result === undefined && item.approval === undefined) {
        next[i] = { ...item, approval: { request, state: "pending" } };
        return next;
      }
    }
    // The approval event can arrive just before its corresponding tool-call
    // event. Its owner keeps the request pending and attaches it when that
    // card arrives; rendering an orphan form here makes it flash at the
    // bottom of the conversation.
    return items;
  }
  if (items.some((i) => i.type === "user_input" && i.request.request_id === request.request_id)) {
    return items;
  }
  return [...items, { type: "user_input", request, state: "pending" }];
}

export function appendCompactionProgress(
  items: StreamItem[],
  stage: ContextCompactionStage,
  error?: string | null,
): StreamItem[] {
  if (stage === "skipped") {
    return items.filter((item) => item.type !== "compaction");
  }
  if (stage === "done") {
    // A completed compaction is represented by the tagged system boundary
    // persisted in the checkpoint. This progress card is transient;
    // never turn it into an assistant-stream item.
    return items.filter((item) => item.type !== "compaction");
  }
  const existingIndex = items.findIndex((item) => item.type === "compaction");
  const progress: StreamItem = { type: "compaction", stage, error };
  if (existingIndex === -1) return [...items, progress];
  return items.map((item, index) => index === existingIndex ? progress : item);
}

export function resolveUserInput(
  items: StreamItem[],
  requestId: string,
  state: "pending" | "answered" | "cancelled",
  response?: unknown,
): StreamItem[] {
  return items.map((item) => {
    if (item.type === "user_input" && item.request.request_id === requestId) {
      return { ...item, state, response };
    }
    if (item.type === "tool_call" && item.approval?.request.request_id === requestId) {
      return { ...item, approval: { ...item.approval, state, response } };
    }
    return item;
  });
}

export function collapseStreamText(items: StreamItem[]): string {
  return items
    .filter((i): i is Extract<StreamItem, { type: "text" }> => i.type === "text")
    .map((i) => i.content)
    .join("");
}
