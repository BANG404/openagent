<script lang="ts">
  import MessageInput from "./MessageInput.svelte";
  import UserMessageRow from "./transcript/UserMessageRow.svelte";
  import { createUserMessageEditor } from "$lib/transcript/userEditor.svelte";
  import { USER_MESSAGE_COLLAPSE_LINES } from "$lib/transcript/userContent";
  import { t, type Locale } from "$lib/i18n";
  import type { ChatAttachment, ChatMessage } from "$lib/types";

  let { locale }: { locale: Locale } = $props();
  let value = $state("");
  let msg = $state<ChatMessage | null>(null);
  let editable = $state(true);
  const attachments: ChatAttachment[] = [
    {
      path: "preview://example.png",
      name: "example.png",
      kind: "image",
      referenceLabel: "[Image #1]",
      previewUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=",
    },
  ];
  const edit = createUserMessageEditor({
    activeConvId: "user-markdown-preview",
    get editable() {
      return editable;
    },
    isStreaming: false,
    onCommitEdit: (_convId, _index, content, retained) => {
      if (msg)
        msg = {
          ...msg,
          content,
          items: retained.map((attachment) => ({ type: "attachment", attachment })),
        };
    },
    onSwitchBranch: () => {},
  });

  function send() {
    msg = {
      id: "user-markdown-message",
      role: "user",
      content: value,
      timestamp: 1,
      items: attachments.map((attachment) => ({ type: "attachment", attachment })),
    };
    value = "";
  }
</script>

<main
  class="user-markdown-preview bg-conversation-surface"
  style={`--user-message-collapse-lines: ${USER_MESSAGE_COLLAPSE_LINES}`}
>
  <button class="preview-readonly" type="button" onclick={() => (editable = !editable)}>
    {locale === "zh" ? "切换只读" : "Toggle read-only"}
  </button>
  {#if msg}
    <UserMessageRow
      {msg}
      msgIdx={0}
      activeConvId="user-markdown-preview"
      activeTree={undefined}
      isStreaming={false}
      {editable}
      debugMode={false}
      {edit}
      attachmentPreviewLoader={async () => ({ kind: "file" })}
    />
  {/if}
  <MessageInput
    bind:value
    {attachments}
    selectedModel=""
    modelOptions={[]}
    placeholder={$t("inputPlaceholder")}
    disabled={false}
    isStreaming={false}
    sendDisabled={!value.trim()}
    sendTitle={$t("send")}
    showAttachments={false}
    showModelSelector={false}
    enableMentions={false}
    onSend={send}
    onStop={() => {}}
  />
</main>

<style>
  .user-markdown-preview {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 800px;
    margin: 32px auto;
    padding: 24px;
  }
</style>
