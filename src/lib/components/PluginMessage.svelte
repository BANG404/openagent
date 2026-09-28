<script lang="ts">
  import { t, tr } from "$lib/i18n";
  import type { ChatMessage } from "$lib/types";

  interface Props {
    message: Pick<ChatMessage, "content" | "pluginTags">;
  }

  let { message }: Props = $props();

  function pluginSource(tags: string[] | undefined): string {
    const tag = tags?.find((value) => value.startsWith("plugin:"));
    if (!tag) return tr("pluginMessageSourceUnknown");
    const [, pluginId] = tag.split(":", 3);
    return pluginId || tr("pluginMessageSourceUnknown");
  }
</script>

<article class="plugin-message message-record" aria-label={$t("pluginMessageAriaLabel")}>
  <header class="plugin-message-header">
    <span class="plugin-message-mark" aria-hidden="true">+</span>
    <span>{$t("pluginMessageFrom")}</span>
    <strong>{pluginSource(message.pluginTags)}</strong>
  </header>
  <div class="plugin-message-content">{message.content}</div>
</article>

<style>
  .plugin-message {
    width: min(100%, 760px);
    margin: 8px 0 16px;
    padding: 10px 14px 12px;
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 6px;
    background: color-mix(in srgb, var(--bg-conversation-component) 88%, var(--accent));
    color: var(--text);
  }
  .plugin-message-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 7px;
    color: var(--text-muted);
    font-size: 11px;
    letter-spacing: 0;
    text-transform: uppercase;
  }
  .plugin-message-header strong {
    color: var(--text);
    font-weight: 650;
    text-transform: none;
  }
  .plugin-message-mark {
    color: var(--accent);
    font-size: 10px;
  }
  .plugin-message-content {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 14px;
    line-height: 1.5;
  }
</style>
