export interface QuickChatPreferences {
  model: string;
  role: string;
  workspace: string;
}

const storageKey = "openagent.quick-chat-preferences:v1";

export function resolveQuickChatModel(
  preferredModel: string | null | undefined,
  defaultModel: string | null | undefined,
  availableModels: readonly string[],
): string {
  const available = new Set(availableModels);
  if (preferredModel && available.has(preferredModel)) return preferredModel;
  if (defaultModel && available.has(defaultModel)) return defaultModel;
  return availableModels[0] ?? "";
}

export function loadQuickChatPreferences(storage: Storage): Partial<QuickChatPreferences> {
  try {
    const value = JSON.parse(storage.getItem(storageKey) ?? "null");
    if (!value || typeof value !== "object") return {};
    return {
      model: typeof value.model === "string" ? value.model : undefined,
      role: typeof value.role === "string" ? value.role : undefined,
      workspace: typeof value.workspace === "string" ? value.workspace : undefined,
    };
  } catch {
    return {};
  }
}

export function saveQuickChatPreferences(
  storage: Storage,
  preferences: QuickChatPreferences,
): void {
  storage.setItem(storageKey, JSON.stringify(preferences));
}
