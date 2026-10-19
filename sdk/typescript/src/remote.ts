import type { UserInputRequest } from "./types.js";
import type { RemoteInterrupt } from "./contracts.js";

export function interruptRequest(
  interrupt: RemoteInterrupt,
  conversationId: string,
): UserInputRequest {
  const args = interrupt.arguments;
  return {
    request_id: interrupt.id,
    conv_id: conversationId,
    kind: interrupt.kind === "ask_user" ? "ask_user" : "tool_approval",
    title: typeof args.title === "string" ? args.title : undefined,
    description: typeof args.description === "string" ? args.description : undefined,
    fields: interrupt.fields,
    submit_label: typeof args.submit_label === "string" ? args.submit_label : undefined,
    cancel_label: typeof args.cancel_label === "string" ? args.cancel_label : undefined,
  };
}
