import type { Json, ReplayCase } from "./types";
import { ReplayError } from "./types";
import { object, string } from "./validate";

function refuse(code: string): never {
  throw new ReplayError("unsupported", code);
}

/** This target supports text/tool correlation and terminal/hydration cases only. */
export function admitChatCase(fixture: ReplayCase): void {
  if (fixture.completeness !== "full") refuse("chat-prefix-target");
  admitInitial(fixture.initial);
  for (const record of fixture.records) {
    const payload = object(record.payload);
    if (record.kind === "event.deliver") admitEvent(payload);
    if (record.kind === "request.begin") {
      if (payload.operation !== "product.invoke_desktop") refuse("chat-operation");
      const input = object(payload.input);
      if (
        ![
          "get_renderable_checkpoints",
          "get_active_branch_tip",
          "get_branches",
          "restore_agent_history",
        ].includes(string(input.operation))
      )
        refuse("chat-product-operation");
      string(object(input.args).convId);
    }
    if (record.kind === "action") {
      if (!["hydrate", "insert-user", "start-stream"].includes(string(payload.action)))
        refuse("chat-action");
      string(payload.conversation);
      if (payload.action === "insert-user") {
        const message = object(payload.message);
        string(message.id);
        if (
          message.role !== "user" ||
          typeof message.content !== "string" ||
          message.items ||
          message.ui ||
          message.toolCalls
        )
          refuse("chat-user-message");
      }
    }
    if (record.kind === "request.resolve") {
      const begin = fixture.records.find(
        (prior) => prior.kind === "request.begin" && prior.correlation === record.correlation,
      )!;
      const operation = object(object(begin.payload).input).operation;
      if (operation === "get_renderable_checkpoints") {
        if (!Array.isArray(payload.output)) refuse("checkpoint-output");
        for (const checkpoint of payload.output) {
          const data = object(object(checkpoint).data);
          if (!Array.isArray(data.messages)) refuse("checkpoint-messages");
          for (const raw of data.messages) {
            const message = object(raw);
            if (
              !["user", "assistant"].includes(string(message.role)) ||
              !Array.isArray(message.content)
            )
              refuse("checkpoint-message-kind");
            for (const item of message.content) {
              if (
                !["text", "runtime_interrupted", "runtime_error"].includes(
                  string(object(item).type),
                )
              )
                refuse("checkpoint-content-capability");
            }
          }
        }
      }
    }
  }
}

export function admitInitial(initial: Json): void {
  const input = object(initial);
  if (!Array.isArray(input.conversations) || !Array.isArray(input.streams))
    refuse("chat-initial-state");
  const conversations = new Set<string>();
  for (const raw of input.conversations) {
    const conversation = object(raw);
    const id = string(conversation.id);
    if (
      conversations.has(id) ||
      typeof conversation.title !== "string" ||
      !Array.isArray(conversation.messages)
    )
      refuse("chat-conversation");
    conversations.add(id);
    for (const rawMessage of conversation.messages) {
      const message = object(rawMessage);
      string(message.id);
      if (
        message.role !== "user" ||
        typeof message.content !== "string" ||
        message.items ||
        message.ui ||
        message.toolCalls
      )
        refuse("initial-message-capability");
    }
  }
  for (const raw of input.streams) {
    const stream = object(raw);
    if (!conversations.has(string(stream.conversation))) refuse("stream-without-conversation");
    string(stream.assistant);
  }
}

function admitEvent(payload: Record<string, unknown>): void {
  const event = string(payload.event);
  const data = object(payload.data);
  if (
    ![
      "chat.chunk",
      "chat.thinking_chunk",
      "chat.tool_call",
      "chat.tool_result",
      "chat.checkpoint",
      "chat.done",
      "chat.cancelled",
    ].includes(event)
  )
    refuse("chat-event-family");
  string(data.conv_id);
  if (data.mcp_ui !== undefined) refuse("mcp-ui-capability");
  if (event.endsWith("chunk") && typeof data.text !== "string") refuse("chat-text");
  if (event === "chat.tool_call") {
    string(data.name);
    if (!Object.hasOwn(data, "args")) refuse("tool-arguments");
  }
  if (event === "chat.tool_result" && typeof data.result !== "string") refuse("tool-result");
  if (event === "chat.checkpoint") string(data.checkpoint_id);
  for (const key of ["tool_use_id", "asst_msg_id", "turn_id", "branch_id", "error"]) {
    if (data[key] !== undefined && data[key] !== null && typeof data[key] !== "string")
      refuse("event-field-type");
  }
}
