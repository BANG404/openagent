import { OpenAgentClient } from "./client";
import { isDesktopProductCommand } from "./contracts";
import { TauriTransport } from "./tauriTransport";

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
  return desktopOpenAgent.invokeLocal<Response>(command, args);
}

export function listen<Payload>(
  event: string,
  handler: (event: { payload: Payload }) => void,
): Promise<() => void> {
  return desktopOpenAgent.listenLocal<Payload>(event, handler);
}

export function emit<Payload>(event: string, payload?: Payload): Promise<void> {
  return desktopOpenAgent.emitLocal(event, payload);
}
