import type { StreamItem } from "$lib/types";

type RuntimeNotice = Extract<StreamItem, { type: "runtime_notice" }>;

const DEFAULT_INTERRUPTED_REASON = "The agent run was interrupted.";

export function runtimeNoticeDetail(
  item: RuntimeNotice,
  localizedTitle: string,
): string | undefined {
  const reason = item.reason.trim();
  if (!reason) return undefined;

  if (
    item.kind === "interrupted" &&
    (reason === localizedTitle.trim() || reason === DEFAULT_INTERRUPTED_REASON)
  ) {
    return undefined;
  }

  return item.reason;
}
