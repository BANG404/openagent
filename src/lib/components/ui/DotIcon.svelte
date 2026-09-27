<script lang="ts">
  type IconName =
    | "add"
    | "arrow-up"
    | "attach"
    | "check"
    | "chevron-down"
    | "chevron-right"
    | "close"
    | "copy"
    | "download"
    | "expand"
    | "external-link"
    | "file"
    | "folder"
    | "menu"
    | "minimize"
    | "maximize"
    | "restore"
    | "edit"
    | "pause"
    | "pin"
    | "play"
    | "quote"
    | "refresh"
    | "search"
    | "send"
    | "settings"
    | "sparkles"
    | "stop"
    | "terminal"
    | "thinking"
    | "trash"
    | "undo"
    | "redo"
    | "info"
    | "warning"
    | (string & {});

  interface Props {
    name: IconName;
    size?: number;
    label?: string;
    animated?: boolean;
    active?: boolean;
    class?: string;
  }

  let {
    name,
    size = 16,
    label,
    animated = true,
    active = false,
    class: className = "",
  }: Props = $props();

  const patterns: Record<string, string[]> = {
    add: ["00100", "00100", "11111", "00100", "00100"],
    "arrow-up": ["00100", "01110", "10101", "00100", "00100"],
    attach: ["00110", "01001", "10001", "10010", "01100"],
    check: ["00001", "00010", "10100", "01000", "00000"],
    "chevron-down": ["00000", "10001", "01010", "00100", "00000"],
    "chevron-right": ["10000", "11000", "01100", "00110", "00011"],
    close: ["10001", "01010", "00100", "01010", "10001"],
    copy: ["01110", "01010", "01110", "00100", "01110"],
    download: ["00100", "00100", "10101", "01110", "11111"],
    expand: ["11000", "10100", "00011", "00101", "00000"],
    "external-link": ["00001", "00010", "00100", "01010", "11111"],
    file: ["11110", "10010", "10110", "10010", "11110"],
    folder: ["11100", "10010", "11111", "10001", "11111"],
    menu: ["11111", "00000", "11111", "00000", "11111"],
    minimize: ["00000", "00000", "11111", "00000", "00000"],
    maximize: ["11111", "10001", "10001", "10001", "11111"],
    restore: ["01110", "01010", "01110", "00100", "01110"],
    edit: ["00011", "00110", "01100", "11000", "10000"],
    pause: ["11011", "11011", "11011", "11011", "11011"],
    pin: ["01110", "11111", "01110", "00100", "00100"],
    play: ["10000", "11000", "11100", "11000", "10000"],
    quote: ["01100", "01100", "00000", "00110", "00110"],
    refresh: ["01110", "11001", "10000", "10011", "01110"],
    search: ["01110", "10001", "10101", "10010", "01101"],
    send: ["00100", "01110", "10101", "00100", "00100"],
    settings: ["00100", "10101", "01110", "10101", "00100"],
    sparkles: ["00100", "10101", "01110", "00100", "00000"],
    stop: ["11111", "10001", "10001", "10001", "11111"],
    terminal: ["11111", "10010", "10100", "10001", "11111"],
    thinking: ["00100", "01010", "10101", "01010", "00100"],
    trash: ["01110", "00100", "11111", "10101", "11111"],
    undo: ["00110", "01001", "11111", "01000", "00111"],
    redo: ["01100", "10010", "11111", "00010", "11100"],
    info: ["00100", "00000", "01110", "00100", "01110"],
    warning: ["00100", "01010", "01010", "10001", "11111"],
  };

  const matrix = $derived(patterns[name] ?? patterns.sparkles);
  const dotCount = $derived(
    matrix.reduce((total, row) => total + [...row].filter((cell) => cell === "1").length, 0),
  );
</script>

<span
  class={`dot-icon ${className}`}
  class:animated
  class:active
  class:thinking={name === "thinking"}
  role={label ? "img" : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : "true"}
  style={`--dot-icon-size:${size}px;--dot-icon-columns:${matrix[0]?.length ?? 5};--dot-icon-count:${dotCount}`}
>
  {#each matrix as row, rowIndex (rowIndex)}
    {#each [...row] as cell, columnIndex (columnIndex)}
      <span
        class:filled={cell === "1"}
        style={`--dot-index:${rowIndex * (matrix[0]?.length ?? 5) + columnIndex}`}
      ></span>
    {/each}
  {/each}
</span>

<style>
  .dot-icon {
    --dot-icon-gap: calc(var(--dot-icon-size) * 0.11);
    display: inline-grid;
    grid-template-columns: repeat(var(--dot-icon-columns), 1fr);
    grid-template-rows: repeat(5, 1fr);
    gap: var(--dot-icon-gap);
    width: var(--dot-icon-size);
    height: var(--dot-icon-size);
    flex: 0 0 var(--dot-icon-size);
    place-content: center;
    vertical-align: middle;
    color: currentColor;
    contain: layout paint;
  }

  .dot-icon > span {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: currentColor;
    opacity: 0;
    transform: scale(0.2);
    transition:
      opacity var(--motion-fast) var(--ease-standard),
      transform var(--motion-fast) var(--ease-standard),
      background-color var(--motion-fast) var(--ease-standard);
  }

  .dot-icon > span.filled {
    opacity: 0.92;
    transform: scale(1);
  }

  .dot-icon.animated:hover > span.filled,
  .dot-icon.animated:focus-visible > span.filled {
    animation: dot-icon-hover 520ms var(--ease-standard) both;
    animation-delay: calc(var(--dot-index) * 9ms);
  }

  .dot-icon.animated:active > span.filled,
  .dot-icon.active > span.filled {
    animation: dot-icon-press 220ms var(--ease-standard) both;
    animation-delay: calc(var(--dot-index) * 5ms);
  }

  .dot-icon.thinking > span.filled {
    animation: dot-icon-thinking 1.25s ease-in-out infinite;
    animation-delay: calc(var(--dot-index) * 21ms);
  }

  @keyframes dot-icon-hover {
    0% {
      transform: scale(1);
    }
    45% {
      transform: scale(1.65);
      opacity: 1;
    }
    100% {
      transform: scale(1);
    }
  }

  @keyframes dot-icon-press {
    0% {
      transform: scale(1);
    }
    45% {
      transform: scale(0.45);
      opacity: 0.68;
    }
    100% {
      transform: scale(1);
    }
  }

  @keyframes dot-icon-thinking {
    0%,
    100% {
      transform: scale(0.7);
      opacity: 0.35;
    }
    45% {
      transform: scale(1.25);
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dot-icon > span,
    .dot-icon.animated:hover > span.filled,
    .dot-icon.animated:focus-visible > span.filled,
    .dot-icon.animated:active > span.filled,
    .dot-icon.active > span.filled,
    .dot-icon.thinking > span.filled {
      animation: none;
      transition: none;
    }
  }
</style>
