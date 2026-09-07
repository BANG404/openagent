import { decodeModelBinding } from "$lib/modelBinding";
import type { AppConfig } from "$lib/types";

export function modelSupportsVision(
  config: AppConfig | null | undefined,
  encodedBinding: string,
): boolean {
  const binding = decodeModelBinding(encodedBinding);
  if (!binding) return false;
  return (
    config?.providers.find((provider) => provider.id === binding.providerId)
      ?.model_vision_enabled?.[binding.model] === true
  );
}
