import type { PaletteItem } from "$lib/components/MentionPalette.svelte";
import type { Locale } from "$lib/i18n";

export function previewMentionItems(query: string, locale: Locale): PaletteItem[] {
  return Array.from({ length: 24 }, (_, index) => ({
    id: `role:preview-${index + 1}`,
    label: `${locale === "zh" ? "角色" : "Role"} ${String(index + 1).padStart(2, "0")}`,
    hint: locale === "zh" ? "角色" : "Role",
    detail: locale === "zh" ? "候选角色描述" : "Preview role description",
  })).filter((item) => item.label.toLowerCase().includes(query.toLowerCase()));
}
