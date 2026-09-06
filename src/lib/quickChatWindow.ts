import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { availableMonitors, getCurrentWindow, type Window } from "@tauri-apps/api/window";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";

import { emit } from "$lib/openagent/tauriClient";
import {
  clearQuickChatWindowPosition,
  isQuickChatWindowPositionVisible,
  loadQuickChatWindowPosition,
} from "$lib/quickChatWindowPosition";
import {
  DEFAULT_QUICK_CHAT_SHORTCUT,
  normalizeQuickChatShortcut,
  QUICK_CHAT_FOCUS_INPUT_EVENT,
} from "$lib/quickChatShortcut";

export const QUICK_CHAT_COMPACT_SIZE = { width: 856, height: 246 } as const;
export const QUICK_CHAT_EXPANDED_SIZE = { width: 856, height: 580 } as const;

let registeredShortcut: string | null = null;
let transition: Promise<void> = Promise.resolve();

function isCurrentQuickChatWindow(): boolean {
  return new URLSearchParams(window.location.search).has("quick-chat-window");
}

async function getQuickChatWindow(): Promise<Window | null> {
  return isCurrentQuickChatWindow()
    ? getCurrentWindow()
    : await WebviewWindow.getByLabel("quick-chat");
}

export async function showQuickChatWindow(): Promise<void> {
  const quickWindow = await getQuickChatWindow();
  if (!quickWindow) return;
  await quickWindow.setSize(
    new LogicalSize(QUICK_CHAT_COMPACT_SIZE.width, QUICK_CHAT_COMPACT_SIZE.height),
  );
  const savedPosition = loadQuickChatWindowPosition(window.localStorage);
  await quickWindow.setSize(
    new LogicalSize(QUICK_CHAT_EXPANDED_SIZE.width, QUICK_CHAT_EXPANDED_SIZE.height),
  );
  let restoredPosition = false;
  if (savedPosition) {
    try {
      const [windowSize, monitors] = await Promise.all([
        quickWindow.outerSize(),
        availableMonitors(),
      ]);
      restoredPosition = isQuickChatWindowPositionVisible(
        savedPosition,
        windowSize,
        monitors.map((monitor) => monitor.workArea),
      );
      if (restoredPosition) {
        await quickWindow.setPosition(new PhysicalPosition(savedPosition.x, savedPosition.y));
      }
    } catch {
      restoredPosition = false;
    }
  }
  if (!restoredPosition) {
    clearQuickChatWindowPosition(window.localStorage);
    await quickWindow.setSize(
      new LogicalSize(QUICK_CHAT_COMPACT_SIZE.width, QUICK_CHAT_COMPACT_SIZE.height),
    );
    await quickWindow.center();
    await quickWindow.setSize(
      new LogicalSize(QUICK_CHAT_EXPANDED_SIZE.width, QUICK_CHAT_EXPANDED_SIZE.height),
    );
  }
  await quickWindow.unminimize().catch(() => {});
  await quickWindow.show();
  await quickWindow.setFocus();
  await emit(QUICK_CHAT_FOCUS_INPUT_EVENT);
}

export async function hideQuickChatWindow(): Promise<void> {
  const quickWindow = await getQuickChatWindow();
  if (!quickWindow) return;
  await quickWindow.hide();
  await quickWindow
    .setSize(new LogicalSize(QUICK_CHAT_COMPACT_SIZE.width, QUICK_CHAT_COMPACT_SIZE.height))
    .catch(() => {});
}

function queueTransition(operation: () => Promise<void>): Promise<void> {
  transition = transition
    .catch(() => {})
    .then(operation)
    .catch((error) => {
      console.warn("Quick chat window transition failed", error);
    });
  return transition;
}

export function closeQuickChatWindow(): Promise<void> {
  return queueTransition(hideQuickChatWindow);
}

export async function toggleQuickChatWindow(): Promise<void> {
  const quickWindow = await getQuickChatWindow();
  if (!quickWindow) return;
  const visible = await quickWindow.isVisible();
  return queueTransition(() => (visible ? hideQuickChatWindow() : showQuickChatWindow()));
}

export async function replaceQuickChatShortcut(shortcut: string): Promise<void> {
  const nextShortcut = normalizeQuickChatShortcut(shortcut);
  const previousShortcut = registeredShortcut;
  if (previousShortcut === nextShortcut) return;
  if (previousShortcut) await unregister(previousShortcut);
  try {
    await register(nextShortcut, (event) => {
      if (event.state === "Pressed") void toggleQuickChatWindow();
    });
    registeredShortcut = nextShortcut;
  } catch (error) {
    if (previousShortcut) {
      try {
        await register(previousShortcut, (event) => {
          if (event.state === "Pressed") void toggleQuickChatWindow();
        });
        registeredShortcut = previousShortcut;
      } catch {
        registeredShortcut = null;
      }
    }
    throw error;
  }
}

export async function initializeQuickChatShortcut(shortcut?: string): Promise<void> {
  if (registeredShortcut) return;
  const normalized = normalizeQuickChatShortcut(shortcut ?? DEFAULT_QUICK_CHAT_SHORTCUT);
  await unregister(normalized).catch(() => {});
  await replaceQuickChatShortcut(normalized);
}

export async function disposeQuickChatShortcut(): Promise<void> {
  if (!registeredShortcut) return;
  const shortcut = registeredShortcut;
  registeredShortcut = null;
  await unregister(shortcut).catch(() => {});
}
