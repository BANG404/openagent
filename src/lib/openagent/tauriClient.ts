import { OpenAgentClient } from "@openagent/client/index";
import { TauriTransport } from "@openagent/client/tauriTransport";
import { isDesktopProductCommand } from "@openagent/client/contracts";
import { RecordingTransport } from "$lib/replay/recordingTransport";

/** One shared client; the inactive observer adds no payload serialization. */
export const desktopRecordingTransport = new RecordingTransport(new TauriTransport());
export const desktopOpenAgent = new OpenAgentClient(desktopRecordingTransport);
export function invoke<Response>(
  command: string,
  args?: Record<string, unknown>,
): Promise<Response> {
  if (isDesktopProductCommand(command))
    return desktopOpenAgent.invokeProduct(command, (args ?? {}) as never) as Promise<Response>;
  return desktopOpenAgent.invokeLocal(command, args);
}
export function listen<Payload>(
  event: string,
  handler: (event: { payload: Payload }) => void,
): Promise<() => void> {
  return desktopOpenAgent.listenLocal(event, handler);
}
export function emit<Payload>(event: string, payload?: Payload): Promise<void> {
  return desktopOpenAgent.emitLocal(event, payload);
}
