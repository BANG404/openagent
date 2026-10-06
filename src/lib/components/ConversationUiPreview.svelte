<script lang="ts">
  import { checkpointRecordsToMessages } from "$lib/checkpointTree";
  import {
    provideOpenAgentUiCapabilities,
    useOpenAgentUiCapabilities,
  } from "$lib/openagent/uiCapabilities";
  import type { CheckpointMessage, ConversationUi } from "$lib/types";
  import ConversationUiRecord from "./ConversationUiRecord.svelte";

  const storageKey = "openagent-conversation-ui-preview";
  const seed: ConversationUi[] = [
    {
      version: 1,
      component: "builtin.divider",
      props: { label_key: "compactionCompleted" },
      fallback: "Context compacted",
    },
    {
      version: 1,
      component: "builtin.notice",
      props: { text: "Saved notice / 已保存提示" },
      fallback: "Saved notice",
    },
    {
      version: 1,
      component: "plugin:ui-preview:counter",
      plugin_id: "ui-preview",
      entry: "ui/counter.html",
      props: { count: 0 },
      fallback: "Saved counter / 已保存计数器",
    },
    {
      version: 1,
      component: "plugin:missing:card",
      plugin_id: "missing",
      entry: "ui/card.html",
      props: {},
      fallback: "Unavailable plugin fallback / 插件不可用时的回退",
    },
    {
      version: 99,
      component: "future",
      props: {},
      fallback: "Unknown version fallback / 未知版本回退",
    },
  ];
  const makeRecord = (ui: ConversationUi, index: number): CheckpointMessage => ({
    id: `ui-preview-${index}`,
    role: "ui",
    content: [{ type: "ui", ui }],
    status: "completed",
    timestamp: index + 1,
    first_token_at: null,
    completed_at: null,
    tags: [],
    system_prompt: null,
    tools: null,
  });
  let records = $state<CheckpointMessage[]>(
    JSON.parse(sessionStorage.getItem(storageKey) || "null") || seed.map(makeRecord),
  );
  const messages = $derived(checkpointRecordsToMessages(records, "preview-checkpoint"));
  let saveCount = $state(0);
  let rejectSave = $state(false);
  let probe = $state("");
  let result = $state("");
  const documentContent = `<!doctype html><html><head><style>
    body{font:14px system-ui;margin:12px;color:#222}body.dark{color:#eee}button{font:inherit;padding:8px 16px;border-radius:10px;border:1px solid #888;background:transparent;color:inherit}
    </style></head><body><button id="increment">Increment / 加一</button><p id="status"></p><script>
    let context; let count=0; let request=0;
    const render=()=>document.querySelector('#status').textContent='Count: '+count;
    document.querySelector('#increment').onclick=()=>{ count++;render();parent.postMessage({type:'openagent:conversation-ui-state',version:1,message_id:context.message_id,request_id:String(++request),props:{count}},'*'); };
    addEventListener('message',event=>{
      const data=event.data;
      if(data.type==='openagent:conversation-ui-context'){context=data;count=data.props.count;document.body.className=data.theme;render();parent.postMessage({type:'fixture:context',message_id:data.message_id,count,locale:data.locale,theme:data.theme},'*');}
      if(data.type==='fixture:click')document.querySelector('#increment').click();
      if(data.type==='openagent:conversation-ui-state-result')parent.postMessage({type:'fixture:result',message_id:data.message_id,count,ok:data.ok},'*');
    });
    </${"script"}></body></html>`;
  const inherited = useOpenAgentUiCapabilities();
  provideOpenAgentUiCapabilities({
    ...inherited,
    async readPluginUiAsset(pluginId) {
      if (pluginId !== "ui-preview") throw new Error("Plugin unavailable");
      return { mime: "text/html", content: documentContent };
    },
    async setConversationUiProps(convId, branchId, messageId, props) {
      if (convId !== "ui-preview" || branchId !== "ui-preview-branch")
        throw new Error("Invalid scope");
      saveCount++;
      if (rejectSave) throw new Error("Fixture storage failure");
      records = records.map((record) =>
        record.id === messageId
          ? { ...record, content: [{ type: "ui", ui: { ...seed[2], props } }] }
          : record,
      );
      sessionStorage.setItem(storageKey, JSON.stringify(records));
    },
  });
  function receive(event: MessageEvent) {
    const frame = document.querySelector<HTMLIFrameElement>(".conversation-ui-preview iframe");
    if (
      event.source !== frame?.contentWindow ||
      event.data?.message_id !== "ui-preview-2" ||
      !event.data?.type?.startsWith("fixture:")
    )
      return;
    if (event.data.type === "fixture:context") probe = JSON.stringify(event.data);
    else result = JSON.stringify(event.data);
  }
</script>

<svelte:window onmessage={receive} />
<main
  class="conversation-ui-preview"
  data-save-count={saveCount}
  data-probe={probe}
  data-result={result}
>
  <div class="controls">
    <button onclick={() => location.reload()}>Restore checkpoint / 恢复 checkpoint</button>
    <button id="ui-preview-fail" onclick={() => (rejectSave = !rejectSave)}
      >Storage failure: {rejectSave}</button
    >
    <button
      id="ui-preview-reset"
      onclick={() => {
        sessionStorage.removeItem(storageKey);
        location.reload();
      }}>Reset fixture</button
    >
  </div>
  {#each messages as message (message.id)}
    {#if message.ui}<ConversationUiRecord
        ui={message.ui}
        messageId={message.id}
        conversationId="ui-preview"
        branchId="ui-preview-branch"
      />{/if}
  {/each}
</main>

<style>
  main {
    display: grid;
    gap: 20px;
    max-width: 880px;
    padding: 32px;
    margin: 0 auto;
    color: var(--text);
  }
  .controls {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }
  button {
    font: inherit;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    border-radius: var(--app-radius);
    padding: 8px 12px;
  }
</style>
