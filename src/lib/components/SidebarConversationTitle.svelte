<script lang="ts">
  interface Props {
    text: string;
  }

  let { text }: Props = $props();
  let overflowing = $state(false);

  function trackOverflow(node: HTMLElement) {
    const copy = node.querySelector<HTMLElement>(".sidebar-conversation-title-copy");
    if (!copy) return;

    let updateFrame: number | null = null;
    const update = () => {
      updateFrame = null;
      const overflow = Math.max(0, copy.scrollWidth - node.clientWidth);
      const nextOverflowing = overflow > 2;
      if (nextOverflowing !== overflowing) overflowing = nextOverflowing;
      node.style.setProperty("--title-overflow", `${overflow}px`);
      node.style.setProperty("--title-scroll-duration", `${Math.max(2.8, overflow / 28)}s`);
    };
    const scheduleUpdate = () => {
      if (updateFrame !== null) return;
      updateFrame = requestAnimationFrame(update);
    };

    const resizeObserver = new ResizeObserver(scheduleUpdate);
    const mutationObserver = new MutationObserver(scheduleUpdate);
    resizeObserver.observe(node);
    mutationObserver.observe(copy, { childList: true, characterData: true, subtree: true });
    scheduleUpdate();

    return {
      destroy() {
        if (updateFrame !== null) cancelAnimationFrame(updateFrame);
        resizeObserver.disconnect();
        mutationObserver.disconnect();
      },
    };
  }
</script>

<span
  class="sidebar-conversation-title"
  class:overflowing
  data-overflowing={overflowing}
  use:trackOverflow
>
  <span class="sidebar-conversation-title-copy">{text}</span>
</span>

<style>
  .sidebar-conversation-title {
    min-width: 0;
    flex: 1 1 0;
    overflow: hidden;
    white-space: nowrap;
  }

  .sidebar-conversation-title-copy {
    display: block;
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sidebar-conversation-title.overflowing:hover .sidebar-conversation-title-copy {
    width: max-content;
    min-width: 100%;
    overflow: visible;
    text-overflow: clip;
    animation: sidebar-conversation-title-scroll var(--title-scroll-duration) ease-in-out 0.35s
      forwards;
  }

  @keyframes sidebar-conversation-title-scroll {
    0%,
    12% {
      transform: translateX(0);
    }
    88%,
    100% {
      transform: translateX(calc(-1 * var(--title-overflow)));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sidebar-conversation-title.overflowing:hover .sidebar-conversation-title-copy {
      width: 100%;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      transform: none;
      animation: none;
    }
  }
</style>
