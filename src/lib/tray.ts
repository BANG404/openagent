import { defaultWindowIcon } from "@tauri-apps/api/app";
import { invoke } from "$lib/openagent/tauriClient";
import { Image } from "@tauri-apps/api/image";
import { Menu } from "@tauri-apps/api/menu";
import { TrayIcon, type TrayIconEvent } from "@tauri-apps/api/tray";
import { getCurrentWindow, type Window } from "@tauri-apps/api/window";

let trayReady = false;
let trayIcon: TrayIcon | null = null;
const trayId = "openagent-tray";

async function showMainWindow(appWindow: Window) {
  await appWindow.unminimize().catch(() => {});
  await appWindow.show();
  await appWindow.setFocus().catch(() => {});
}

function isPrimaryActivate(event: TrayIconEvent) {
  return (
    event.type === "DoubleClick" ||
    (event.type === "Click" &&
      event.button === "Left" &&
      event.buttonState === "Up")
  );
}

async function loadTrayIcon() {
  const defaultIcon = await defaultWindowIcon().catch(() => null);
  if (defaultIcon) return defaultIcon;

  const response = await fetch("/app-icon.png");
  const bytes = await response.arrayBuffer();
  return Image.fromBytes(bytes);
}

export async function initializeTray() {
  if (trayReady) return;
  trayReady = true;

  const appWindow = getCurrentWindow();

  await appWindow.onCloseRequested((event) => {
    event.preventDefault();
    void appWindow.hide();
  });

  const menu = await Menu.new({
    items: [
      {
        id: "show",
        text: "Show OpenAgent",
        action: () => {
          void showMainWindow(appWindow);
        },
      },
      {
        id: "quit",
        text: "Quit",
        action: () => {
          void invoke("quit_app");
        },
      },
    ],
  });

  const icon = await loadTrayIcon().catch((error) => {
    console.warn("Failed to load tray icon", error);
    return null;
  });

  const existingTray = await TrayIcon.getById(trayId).catch(() => null);
  if (existingTray) {
    await TrayIcon.removeById(trayId).catch(() => {});
  }

  trayIcon = await TrayIcon.new({
    id: trayId,
    menu,
    showMenuOnLeftClick: false,
    tooltip: "OpenAgent",
    ...(icon ? { icon } : {}),
    action: (event) => {
      if (isPrimaryActivate(event)) {
        void showMainWindow(appWindow);
      }
    },
  });
}

export function getTrayIcon() {
  return trayIcon;
}
