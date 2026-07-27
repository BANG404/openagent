<script lang="ts">
  import InspectorJsonValue from "./InspectorJsonValue.svelte";

  let { value, label = "value", depth = 0 }: { value: unknown; label?: string; depth?: number } = $props();

  const isObject = (candidate: unknown): candidate is Record<string, unknown> =>
    typeof candidate === "object" && candidate !== null && !Array.isArray(candidate);
  const isContainer = (candidate: unknown) => Array.isArray(candidate) || isObject(candidate);
  const childEntries = $derived(Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : isObject(value) ? Object.entries(value) : []);
  const summary = $derived(Array.isArray(value)
    ? `Array · ${value.length} item${value.length === 1 ? "" : "s"}`
    : isObject(value) ? `Object · ${Object.keys(value).length} field${Object.keys(value).length === 1 ? "" : "s"}`
    : "");
  const open = $derived(depth < 2);

  function displayPrimitive(candidate: unknown): string {
    if (candidate === null) return "null";
    if (typeof candidate === "string") return candidate;
    return String(candidate);
  }
</script>

{#if isContainer(value)}
  <details class="json-container" {open}>
    <summary><code>{label}</code><span>{summary}</span></summary>
    <div class="json-children">
      {#each childEntries as [key, child] (key)}
        <div class="json-child"><InspectorJsonValue value={child} label={key} depth={depth + 1} /></div>
      {/each}
    </div>
  </details>
{:else}
  <div class="json-primitive" class:json-null={value === null}>
    <code>{label}</code>
    <span>{displayPrimitive(value)}</span>
  </div>
{/if}

<style>
  .json-container { border: 1px solid var(--border); border-radius: 5px; background: var(--bg); }
  .json-child + .json-child { margin-top: 5px; }
  summary { display: flex; align-items: center; gap: 8px; padding: 7px 8px; cursor: pointer; list-style: none; }
  summary::-webkit-details-marker { display: none; }
  summary::before { width: 10px; color: var(--text-muted); content: "›"; font-size: 15px; line-height: 1; transform: rotate(0deg); transition: transform .12s ease; }
  details[open] > summary::before { transform: rotate(90deg); }
  code { flex: none; color: var(--primary); font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; }
  summary span { overflow: hidden; color: var(--text-muted); font: 10px ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }
  .json-children { margin: 0 8px 8px 18px; padding-left: 8px; border-left: 1px solid var(--border); }
  .json-primitive { display: grid; grid-template-columns: minmax(80px, max-content) minmax(0, 1fr); gap: 9px; align-items: start; padding: 7px 8px; border: 1px solid var(--border); border-radius: 5px; background: var(--bg); }
  .json-primitive span { min-width: 0; color: var(--text); font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; white-space: pre-wrap; }
  .json-null span { color: var(--text-muted); font-style: italic; }
</style>
