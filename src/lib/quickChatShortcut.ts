export const DEFAULT_QUICK_CHAT_SHORTCUT = "CommandOrControl+Shift+Space";
export const QUICK_CHAT_FOCUS_INPUT_EVENT = "quick-chat-focus-input";

const modifierCodes = new Set([
  "AltLeft",
  "AltRight",
  "ControlLeft",
  "ControlRight",
  "MetaLeft",
  "MetaRight",
  "ShiftLeft",
  "ShiftRight",
]);

const namedKeys = new Set([
  "Backquote",
  "Backslash",
  "BracketLeft",
  "BracketRight",
  "Pause",
  "Comma",
  "Equal",
  "Minus",
  "Period",
  "Quote",
  "Semicolon",
  "Slash",
  "Backspace",
  "CapsLock",
  "Enter",
  "Space",
  "Tab",
  "Delete",
  "End",
  "Home",
  "Insert",
  "PageDown",
  "PageUp",
  "PrintScreen",
  "ScrollLock",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "NumLock",
  "NumpadAdd",
  "NumpadDecimal",
  "NumpadDivide",
  "NumpadEnter",
  "NumpadEqual",
  "NumpadMultiply",
  "NumpadSubtract",
]);

function isSupportedKey(code: string): boolean {
  if (/^Key[A-Z]$/.test(code) || /^Digit[0-9]$/.test(code) || /^Numpad[0-9]$/.test(code)) {
    return true;
  }
  const functionKey = /^F([1-9]|1[0-9]|2[0-4])$/.exec(code);
  return Boolean(functionKey) || namedKeys.has(code);
}

export function normalizeQuickChatShortcut(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_QUICK_CHAT_SHORTCUT;
  const tokens = value.split("+");
  if (tokens.length < 2) return DEFAULT_QUICK_CHAT_SHORTCUT;
  const modifiers = tokens.slice(0, -1);
  if (
    new Set(modifiers).size !== modifiers.length ||
    modifiers.some((modifier) => !["CommandOrControl", "Alt", "Shift"].includes(modifier)) ||
    !isSupportedKey(tokens[tokens.length - 1])
  ) {
    return DEFAULT_QUICK_CHAT_SHORTCUT;
  }
  return value;
}

export type QuickChatShortcutCapture =
  | { kind: "pending" }
  | { kind: "error"; reason: "modifier_required" | "unsupported_key" }
  | { kind: "shortcut"; value: string };

export function captureQuickChatShortcut(
  event: Pick<KeyboardEvent, "altKey" | "code" | "ctrlKey" | "metaKey" | "shiftKey">,
): QuickChatShortcutCapture {
  if (modifierCodes.has(event.code)) return { kind: "pending" };
  if (!isSupportedKey(event.code)) return { kind: "error", reason: "unsupported_key" };

  const modifiers: string[] = [];
  if (event.ctrlKey || event.metaKey) modifiers.push("CommandOrControl");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  if (modifiers.length === 0) return { kind: "error", reason: "modifier_required" };
  return { kind: "shortcut", value: [...modifiers, event.code].join("+") };
}

const keyLabels: Record<string, string> = {
  Backquote: "`",
  Backslash: "\\",
  BracketLeft: "[",
  BracketRight: "]",
  Comma: ",",
  Equal: "=",
  Minus: "-",
  Period: ".",
  Quote: "'",
  Semicolon: ";",
  Slash: "/",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
};

function displayKey(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return `Num ${code.slice(6)}`;
  return keyLabels[code] ?? code.replace(/^Numpad/, "Num ");
}

export function formatQuickChatShortcut(
  shortcut: string,
  isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform),
): string {
  const tokens = normalizeQuickChatShortcut(shortcut).split("+");
  return tokens
    .map((token, index) => {
      if (token === "CommandOrControl") return isMac ? "⌘" : "Ctrl";
      if (token === "Alt") return isMac ? "⌥" : "Alt";
      if (token === "Shift") return isMac ? "⇧" : "Shift";
      return index === tokens.length - 1 ? displayKey(token) : token;
    })
    .join(" + ");
}
