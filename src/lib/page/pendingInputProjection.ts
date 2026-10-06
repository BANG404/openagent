import type { ChatMessage, UserInputRequest } from "$lib/types";
import type { fetchRenderableCheckpoints } from "$lib/conversationDb";
import { askUserRequestFromToolUse } from "$lib/checkpointTree";
import { appendUserInput } from "$lib/chatStream";

/**
 * `chat-user-input-request` is an ephemeral Tauri event. When the webview is
 * recreated, recover a still-pending form from the active checkpoint instead
 * of waiting for an event that has already been emitted.
 */
export function restorePendingUserInputFromCheckpoint(
  convId: string,
  messages: ChatMessage[],
  checkpoints: Awaited<ReturnType<typeof fetchRenderableCheckpoints>>,
): { messages: ChatMessage[]; pendingRequest?: UserInputRequest } {
  const assistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.checkpointId);
  if (!assistant?.checkpointId) return { messages };

  const checkpoint = checkpoints.find(({ meta }) => meta.checkpoint_id === assistant.checkpointId);
  if (!checkpoint) return { messages };
  const requests = pendingUserInputRequestsFromCheckpoint(convId, checkpoint);
  if (requests.length === 0) return { messages };
  // Each persisted tool use is rendered as its own assistant message. Attach
  // an approval across the complete timeline by toolUseId; limiting this to
  // the final assistant message turns earlier calls in a batch into detached
  // forms.
  let restored = messages;
  for (const request of requests) {
    let matched = false;
    restored = restored.map((message) => {
      const items = message.items;
      if (
        !items?.some((item) => item.type === "tool_call" && item.toolUseId === request.request_id)
      ) {
        return message;
      }
      matched = true;
      const withoutAskUserCard =
        request.kind === "ask_user"
          ? items.filter(
              (item) => item.type !== "tool_call" || item.toolUseId !== request.request_id,
            )
          : items;
      return { ...message, items: appendUserInput(withoutAskUserCard, request) };
    });
    // A legacy checkpoint can lack the provider ID on an ask_user card. Its
    // form is still safe to render independently; approvals never use this
    // fallback because that would risk authorizing the wrong tool.
    if (!matched && request.kind === "ask_user") {
      restored = restored.map((message) =>
        message.id === assistant.id
          ? { ...message, items: appendUserInput(message.items ?? [], request) }
          : message,
      );
    }
  }
  return { messages: restored, pendingRequest: requests[0] };
}

/**
 * Rebuild an interrupted ask_user form from the self-contained checkpoint.
 * Its phase says that input is pending; the final tool_use is the durable
 * form schema. No opaque checkpoint state is required.
 */
export function pendingUserInputRequestsFromCheckpoint(
  convId: string,
  checkpoint: Awaited<ReturnType<typeof fetchRenderableCheckpoints>>[number],
): UserInputRequest[] {
  if (checkpoint.data.phase !== "interrupted") return [];
  const resolved = new Set(
    checkpoint.data.messages
      .filter((message) => message.role === "user")
      .flatMap((message) => message.content)
      .filter((content) => content.type === "tool_result")
      .map((content) => String(content.tool_use_id)),
  );
  // An interrupted checkpoint can contain several tool calls from one
  // provider turn. Only the first unresolved call is currently waiting for
  // input; later calls have not run yet and must not be presented as
  // approvals. This matters when the model emits ask_user alongside an
  // ordinary tool: restoring every unresolved call incorrectly creates an
  // approval card for the sibling tool even when approval mode is off.
  const pending = checkpoint.data.messages
    .filter((message) => message.role === "assistant")
    .flatMap((message) => message.content)
    .find((content) => content.type === "tool_use" && !resolved.has(String(content.id)));
  return pending
    ? [pending].flatMap((content) => {
        const toolUse = content as { id: string; name: string; input?: unknown };
        if (toolUse.name === "render_mermaid") return [];
        if (toolUse.name === "ask_user") {
          const request = askUserRequestFromToolUse(toolUse as Record<string, unknown>, convId);
          return request ? [request] : [];
        }
        return [
          {
            request_id: toolUse.id,
            conv_id: convId,
            kind: "tool_approval" as const,
            title: "Approve tool call",
            description: `Review the exact tool call before allowing it:\n\n${toolUse.name}\n${JSON.stringify(toolUse.input, null, 2)}`,
            fields: [
              {
                type: "confirm" as const,
                name: "approved",
                label: "Approve this tool call once",
                default: false,
              },
            ],
            submit_label: "Approve and continue",
            cancel_label: "Deny",
          },
        ];
      })
    : [];
}
