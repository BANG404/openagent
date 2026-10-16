import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { readable } from "svelte/store";
import { tick } from "svelte";

export interface DesktopExitProgress {
  action: "quit" | "restart" | "install";
  stage: "runtime" | "connections" | "windows" | "tools" | "finishing";
  completed: number;
  total: number;
}

/** Native teardown must remain observable after the Runtime connection stops. */
export const desktopExitProgress = readable<DesktopExitProgress | null>(null, (set) => {
  if (!isTauri()) return;
  let disposed = false;
  let receivedEvent = false;
  let unlisten: (() => void) | undefined;
  let presented = false;
  const update = (progress: DesktopExitProgress | null) => {
    if (disposed) return;
    set(progress);
    if (!progress || presented) return;
    presented = true;
    void tick().then(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!disposed) void invoke("desktop_exit_presented").catch(() => {});
        });
      });
    });
  };
  void listen<DesktopExitProgress>("desktop-exit-progress", ({ payload }) => {
    receivedEvent = true;
    update(payload);
  })
    .then(async (stop) => {
      if (disposed) {
        stop();
        return;
      }
      unlisten = stop;
      const current = await invoke<DesktopExitProgress | null>("desktop_exit_progress");
      if (!receivedEvent) update(current);
    })
    .catch((error) => console.error("Failed to observe desktop exit progress", error));
  return () => {
    disposed = true;
    unlisten?.();
  };
});
