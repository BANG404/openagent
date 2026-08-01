<script lang="ts">
  import { t } from "$lib/i18n";

  interface Props {
    designOpen: boolean;
    draftsOpen: boolean;
    memoryOpen: boolean;
    rolesOpen: boolean;
    skillsOpen: boolean;
    settingsOpen: boolean;
    onToggleDesign: () => void;
    onToggleDrafts: () => void;
    onToggleMemory: () => void;
    onToggleRoles: () => void;
    onToggleSkills: () => void;
    onToggleSettings: () => void;
  }
  let {
    designOpen,
    draftsOpen,
    memoryOpen,
    rolesOpen,
    skillsOpen,
    settingsOpen,
    onToggleDesign,
    onToggleDrafts,
    onToggleMemory,
    onToggleRoles,
    onToggleSkills,
    onToggleSettings,
  }: Props = $props();

  let expanded = $state(false);
</script>

<div class="sidebar-bottom">
  {#if expanded}
    <button class="sidebar-btn {designOpen ? 'active' : ''}" onclick={onToggleDesign}>
      {#if designOpen}
        <svg
          class="sidebar-icon"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"><path d="M10 8H3M6 5l-3 3 3 3" /></svg
        >
      {:else}
        <svg
          class="sidebar-icon"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          ><path d="M3 13h10M4 10.5 10.8 3.7a1.4 1.4 0 0 1 2 2L6 12.5H3.5z" /><path
            d="m9.8 4.7 1.5 1.5"
          /></svg
        >
      {/if}
      {designOpen ? $t("backToChat") : $t("design")}
    </button>
    <button class="sidebar-btn {draftsOpen ? 'active' : ''}" onclick={onToggleDrafts}>
      {#if draftsOpen}
        <svg
          class="sidebar-icon"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"><path d="M10 8H3M6 5l-3 3 3 3" /></svg
        >
      {:else}
        <svg
          class="sidebar-icon"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          ><path
            d="M3 3.5A1.5 1.5 0 0 1 4.5 2h5.8L13 4.7v7.8a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 12.5v-9z"
          /><path d="M10 2v3h3" /><path d="M5.5 8h5M5.5 10.5h4" /></svg
        >
      {/if}
      {draftsOpen ? $t("backToChat") : $t("drafts")}
    </button>
    <button class="sidebar-btn {memoryOpen ? 'active' : ''}" onclick={onToggleMemory}>
      {#if memoryOpen}
        <svg
          class="sidebar-icon"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"><path d="M10 8H3M6 5l-3 3 3 3" /></svg
        >
      {:else}
        <svg
          class="sidebar-icon"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          ><ellipse cx="8" cy="4" rx="5" ry="1.8" /><path
            d="M3 4v8c0 1 2.2 1.8 5 1.8s5-.8 5-1.8V4"
          /><path d="M3 8c0 1 2.2 1.8 5 1.8s5-.8 5-1.8" /></svg
        >
      {/if}
      {memoryOpen ? $t("backToChat") : $t("memory")}
    </button>
    <button class="sidebar-btn {rolesOpen ? 'active' : ''}" onclick={onToggleRoles}>
      {#if rolesOpen}
        <svg
          class="sidebar-icon"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"><path d="M10 8H3M6 5l-3 3 3 3" /></svg
        >
      {:else}
        <svg
          class="sidebar-icon"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          ><circle cx="8" cy="5" r="2.5" /><path
            d="M3.5 13c.4-3 1.9-4.5 4.5-4.5s4.1 1.5 4.5 4.5"
          /><path d="m12.2 2.2.45.95.95.45-.95.45-.45.95-.45-.95-.95-.45.95-.45z" /></svg
        >
      {/if}
      {rolesOpen ? $t("backToChat") : $t("roles")}
    </button>
    <button class="sidebar-btn {skillsOpen ? 'active' : ''}" onclick={onToggleSkills}>
      {#if skillsOpen}
        <svg
          class="sidebar-icon"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"><path d="M10 8H3M6 5l-3 3 3 3" /></svg
        >
      {:else}
        <svg
          class="sidebar-icon"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          ><path d="M8 2L2 5.5v5L8 14l6-3.5v-5L8 2z" /><path d="M2 5.5l6 3.5 6-3.5" /><path
            d="M8 9v5"
          /></svg
        >
      {/if}
      {skillsOpen ? $t("backToChat") : $t("skills")}
    </button>
  {/if}

  <button
    class="sidebar-btn sidebar-toggle"
    onclick={() => (expanded = !expanded)}
    aria-expanded={expanded}
  >
    <svg
      class="sidebar-icon sidebar-chevron"
      class:expanded
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="m5 6 3 3 3-3" />
    </svg>
    {expanded ? $t("collapseSection") : $t("more")}
  </button>

  <button class="sidebar-btn {settingsOpen ? 'active' : ''}" onclick={onToggleSettings}>
    {#if settingsOpen}
      <svg
        class="sidebar-icon"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"><path d="M10 8H3M6 5l-3 3 3 3" /></svg
      >
    {:else}
      <svg
        class="sidebar-icon"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        ><circle cx="8" cy="8" r="2.5" /><path
          d="M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.06 1.06M11.54 11.54l1.06 1.06M3.4 12.6l1.06-1.06M11.54 4.46l1.06-1.06"
        /></svg
      >
    {/if}
    {settingsOpen ? $t("backToChat") : $t("settings")}
  </button>
</div>

<style>
  .sidebar-bottom {
    padding: 8px 6px;
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: var(--list-item-stack-gap);
  }

  .sidebar-btn {
    display: flex;
    align-items: center;
    gap: var(--list-item-compact-content-gap);
    width: 100%;
    height: var(--list-item-compact-height);
    background: none;
    border: none;
    border-radius: var(--list-item-compact-radius);
    padding: 4px var(--list-item-compact-padding-inline);
    font: inherit;
    font-size: var(--list-item-compact-font-size);
    line-height: var(--list-item-compact-line-height);
    color: var(--text-muted);
    cursor: pointer;
    text-align: left;
    transition:
      background 0.12s,
      color 0.12s;
  }

  .sidebar-btn:hover {
    background: var(--surface2);
    color: var(--text);
  }

  .sidebar-icon {
    width: 15px;
    height: 15px;
    flex-shrink: 0;
  }

  .sidebar-chevron {
    transition: transform 0.12s ease;
  }

  .sidebar-chevron.expanded {
    transform: rotate(180deg);
  }
</style>
