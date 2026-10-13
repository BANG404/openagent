import type { AppConfig, DefaultModelBinding } from "$lib/types";

/** Resolve the same model window headroom used by Runtime compaction. */
export function contextCompactionThreshold(
  config: AppConfig,
  binding: DefaultModelBinding,
): number {
  const provider = config.providers.find((item) => item.id === binding.provider_id);
  const threshold =
    provider?.model_context_compaction_thresholds?.[binding.model] ??
    config.context_compaction_threshold;
  const window = provider?.model_context_windows?.[binding.model];
  return window ? Math.min(threshold, Math.floor(window * 0.9)) : threshold;
}
