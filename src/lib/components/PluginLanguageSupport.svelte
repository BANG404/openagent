<script lang="ts">
  import { locale, t } from "$lib/i18n";
  import { pluginLanguageName, pluginLocaleFallback, type AgentPluginI18n } from "$lib/pluginI18n";
  let { i18n }: { i18n?: AgentPluginI18n | null } = $props();
  const fallback = $derived(pluginLocaleFallback(i18n, $locale));
</script>

<span
  class="detail-hint plugin-languages"
  data-supported-locales={i18n?.supported_locales.join(",") ?? "unknown"}
>
  {$t("pluginSupportedLanguages")}: {i18n
    ? i18n.supported_locales.map(pluginLanguageName).join(" · ")
    : $t("pluginLanguagesUnknown")}
  {#if fallback}<span class="plugin-locale-fallback">
      — {$t("pluginLanguageFallback").replace("{language}", pluginLanguageName(fallback))}</span
    >{/if}
</span>
