import { invoke as invokeNative } from "@tauri-apps/api/core";
import { emit as emitNative, listen as listenNative } from "@tauri-apps/api/event";
import { OpenAgentClient } from "./client.js";
import { isDesktopProductCommand } from "./contracts.js";
import { TauriTransport } from "./tauriTransport.js";

export const desktopOpenAgent = new OpenAgentClient(new TauriTransport());

/**
 * Explicit bridge for desktop-only capabilities that do not belong in the
 * cross-transport operation contract. Product-domain calls should prefer a
 * named `OpenAgentClient` method.
 */
export function invoke<Response>(
  command: string,
  args?: Record<string, unknown>,
): Promise<Response> {
  if (isDesktopProductCommand(command)) {
    return desktopOpenAgent.invokeProduct(command, (args ?? {}) as never) as Promise<Response>;
  }
  return invokeNative<Response>(command, args);
}

export function listen<Payload>(
  event: string,
  handler: (event: { payload: Payload }) => void,
): Promise<() => void> {
  return listenNative<Payload>(event, handler);
}

export function emit<Payload>(event: string, payload?: Payload): Promise<void> {
  return emitNative(event, payload);
}

/** Live lifecycle state; callers may retry after starting or unavailable. */
export function runtimeTransportStatus(): Promise<
  import("./protocol.generated.js").RuntimeTransportStatus
> {
  return invokeNative("runtime_transport_status");
}
