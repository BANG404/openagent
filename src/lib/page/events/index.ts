import { listen } from "$lib/openagent/tauriClient";
import { registerSurfaceEvents } from "./surfaceEvents";
import { subscribePageChatEvents } from "./chatEvents";
import type { PageEventOptions, RegisterPageEvent } from "./context";

/** Registers both event surfaces before startup marks event delivery ready. */
export async function installPageEvents(options: PageEventOptions): Promise<void> {
  if (!options.tauriAvailable) return;
  const registrations: Array<Promise<() => void>> = [];
  const register: RegisterPageEvent = (event, handler) => {
    registrations.push(listen(event, handler));
  };
  registerSurfaceEvents(options, register);
  const chatEventRegistration = subscribePageChatEvents(options);
  await Promise.all([...registrations, chatEventRegistration]);
}
