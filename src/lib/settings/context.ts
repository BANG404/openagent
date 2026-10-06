import { getContext, setContext } from "svelte";
import type { SettingsController } from "./controller.svelte";
const key = Symbol("settings");
export function provideSettingsContext(controller: SettingsController): void {
  setContext(key, controller);
}
export function useSettingsContext(): SettingsController {
  return getContext<SettingsController>(key);
}
