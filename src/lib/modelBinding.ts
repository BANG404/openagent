export interface ModelBindingKey {
  providerId: string;
  model: string;
}

export function encodeModelBinding(providerId: string, model: string): string {
  return JSON.stringify([providerId, model]);
}

export function decodeModelBinding(value: string): ModelBindingKey | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [providerId, model] = parsed;
    if (typeof providerId !== "string" || typeof model !== "string") return null;
    return { providerId, model };
  } catch {
    return null;
  }
}
