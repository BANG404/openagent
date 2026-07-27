<script lang="ts">
  let { name }: { name: string } = $props();
</script>

<span class="skel" aria-label="loading {name}">
  <span class="dot"></span>
  <span class="dot"></span>
  <span class="dot"></span>
  <span class="lbl">{name}</span>
</span>

<style>
  .skel {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 6px;
    background: var(--surface2);
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 12px;
    vertical-align: baseline;
  }
  .lbl {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
  }
  .dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.4;
    animation: pulse 1.2s infinite ease-in-out;
  }
  .dot:nth-child(2) { animation-delay: 0.15s; }
  .dot:nth-child(3) { animation-delay: 0.3s; }
  @keyframes pulse {
    0%, 80%, 100% { opacity: 0.2; transform: scale(0.9); }
    40% { opacity: 1; transform: scale(1.1); }
  }
</style>
