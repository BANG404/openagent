<script lang="ts">
  import type { SettingsWindowKind } from "$lib/settingsWindows";
  import { settingsWindowSkeletonSpec } from "$lib/settingsWindowSkeleton";

  let {
    kind,
    initialSection,
    label,
  }: {
    kind: SettingsWindowKind;
    initialSection?: string | null;
    label: string;
  } = $props();

  let spec = $derived(settingsWindowSkeletonSpec(kind, initialSection));
  let contentGroups = $derived(
    spec.section === "general"
      ? [4, 1, 1]
      : spec.section === "execution"
        ? [1, 3, 2]
        : spec.section === "defaults"
          ? [2, 2]
          : spec.section === "memory"
            ? [2, 2, 1]
            : spec.section === "hooks"
              ? [2, 3]
              : [3, 2],
  );
</script>

<div
  class="settings-window-skeleton"
  class:with-navigation={spec.showNavigation}
  class:collection={spec.layout === "collection"}
  class:about={spec.layout === "about"}
  data-settings-skeleton-kind={kind}
  data-settings-skeleton-section={spec.section}
  role="status"
  aria-label={label}
  aria-live="polite"
>
  <span class="sr-only">{label}</span>

  {#if spec.showNavigation}
    <aside class="navigation-skeleton" aria-hidden="true">
      {#each spec.sections as section, index (section)}
        <div class="navigation-row" class:active={section === spec.section}>
          <span class="block navigation-icon"></span>
          <span class="block navigation-label" style={`width:${58 + index * 9}%`}></span>
        </div>
      {/each}
    </aside>
  {/if}

  {#if spec.layout === "collection"}
    <aside class="collection-skeleton" aria-hidden="true">
      {#if spec.section === "providers"}
        <div class="collection-toolbar">
          <span class="block collection-search"></span>
          <span class="block collection-filter"></span>
        </div>
      {/if}
      <div class="collection-list">
        {#each Array(spec.section === "channels" ? 7 : 4) as _, index (index)}
          <div class="collection-row" class:active={index === 0}>
            <span class="block collection-icon"></span>
            <span class="collection-copy">
              <span class="block collection-title" style={`width:${66 + (index % 2) * 12}%`}></span>
              <span class="block collection-subtitle"></span>
            </span>
          </div>
        {/each}
      </div>
      {#if spec.section !== "channels"}<span class="block collection-action"></span>{/if}
    </aside>
  {/if}

  {#if spec.layout === "about"}
    <main class="about-skeleton" aria-hidden="true">
      <span class="block about-logo"></span>
      <span class="block about-title"></span>
      <span class="block about-version"></span>
      <span class="block about-description"></span>
      <span class="block about-description short"></span>
      <span class="block about-link"></span>
      <span class="block about-action"></span>
    </main>
  {:else if spec.layout === "collection"}
    <main class="detail-skeleton" aria-hidden="true">
      <div class="detail-heading">
        <span class="block detail-title"></span>
        <span class="block detail-toggle"></span>
      </div>
      {#each Array(spec.section === "providers" ? 3 : 1) as _, groupIndex (groupIndex)}
        <section class="detail-group">
          <span class="block group-title" style={`width:${96 + groupIndex * 12}px`}></span>
          <div class="application-settings-surface detail-card">
            {#each Array(spec.section === "providers" ? 2 : 4) as _, rowIndex (rowIndex)}
              <div class="detail-row">
                <span class="block row-label" style={`width:${72 + (rowIndex % 2) * 24}px`}></span>
                <span class="block row-control"></span>
              </div>
            {/each}
          </div>
        </section>
      {/each}
    </main>
  {:else}
    <main class="content-skeleton" aria-hidden="true">
      {#each contentGroups as rowCount, groupIndex (groupIndex)}
        <section class="content-group">
          <span class="block group-title" style={`width:${92 + (groupIndex % 2) * 28}px`}></span>
          <div class="application-settings-surface content-card">
            {#each Array(rowCount) as _, rowIndex (rowIndex)}
              <div class="content-row">
                <span class="content-copy">
                  <span class="block row-label" style={`width:${88 + (rowIndex % 3) * 18}px`}
                  ></span>
                  <span class="block row-description"></span>
                </span>
                <span class="block content-control"></span>
              </div>
            {/each}
          </div>
        </section>
      {/each}
    </main>
  {/if}
</div>

<style>
  .settings-window-skeleton {
    display: flex;
    width: 100%;
    height: 100%;
    min-width: 0;
    overflow: hidden;
    box-sizing: border-box;
    pointer-events: none;
  }

  .block {
    display: block;
    border-radius: 5px;
    background: linear-gradient(
      100deg,
      color-mix(in srgb, var(--text) 7%, transparent) 20%,
      color-mix(in srgb, var(--text) 13%, transparent) 38%,
      color-mix(in srgb, var(--text) 7%, transparent) 56%
    );
    background-size: 240% 100%;
    animation: shimmer 1.35s ease-in-out infinite;
  }

  .navigation-skeleton {
    width: 172px;
    flex: 0 0 172px;
    padding: 12px 8px;
    box-sizing: border-box;
  }

  .navigation-row {
    display: flex;
    height: var(--list-item-compact-height);
    align-items: center;
    gap: var(--list-item-compact-content-gap);
    padding: 4px var(--list-item-compact-padding-inline);
    border-radius: var(--list-item-compact-radius);
    box-sizing: border-box;
  }

  .navigation-row + .navigation-row {
    margin-top: var(--list-item-stack-gap);
  }

  .navigation-row.active,
  .collection-row.active {
    background: var(--interactive-state-bg);
  }

  .navigation-icon {
    width: 16px;
    height: 16px;
    flex: 0 0 16px;
    border-radius: 4px;
  }

  .navigation-label {
    height: 9px;
  }

  .collection-skeleton {
    display: flex;
    width: 256px;
    flex: 0 0 256px;
    flex-direction: column;
    min-height: 0;
  }

  .collection-toolbar {
    display: flex;
    gap: 8px;
    padding: 10px 8px;
  }

  .collection-search {
    height: 34px;
    flex: 1;
    border-radius: 6px;
  }

  .collection-filter {
    width: 50px;
    height: 34px;
    border-radius: 6px;
  }

  .collection-list {
    display: grid;
    align-content: start;
    gap: var(--list-item-stack-gap);
    padding: 6px;
  }

  .collection-row {
    display: flex;
    min-height: 48px;
    align-items: center;
    gap: 10px;
    padding: 6px 10px;
    border-radius: 6px;
    box-sizing: border-box;
  }

  .collection-icon {
    width: 32px;
    height: 32px;
    flex: 0 0 32px;
    border-radius: 8px;
  }

  .collection-copy,
  .content-copy {
    display: grid;
    min-width: 0;
    flex: 1;
    gap: 7px;
  }

  .collection-title,
  .row-label {
    height: 9px;
  }

  .collection-subtitle,
  .row-description {
    width: 86%;
    height: 7px;
    opacity: 0.72;
  }

  .collection-action {
    height: 30px;
    margin: auto 8px 10px;
    border-radius: 6px;
  }

  .detail-skeleton,
  .content-skeleton {
    min-width: 0;
    flex: 1;
    overflow: hidden;
  }

  .detail-skeleton {
    padding: 16px 24px 32px;
  }

  .detail-heading {
    display: flex;
    height: 32px;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
  }

  .detail-title {
    width: 112px;
    height: 15px;
  }

  .detail-toggle {
    width: 36px;
    height: 20px;
    border-radius: 9999px;
  }

  .detail-group + .detail-group,
  .content-group + .content-group {
    margin-top: 28px;
  }

  .group-title {
    height: 14px;
    margin: 0 0 14px;
  }

  .detail-card,
  .content-card {
    overflow: hidden;
    border-radius: 8px;
  }

  .detail-row,
  .content-row {
    display: flex;
    align-items: center;
    gap: 18px;
    min-height: 64px;
    padding: 12px 16px;
    box-sizing: border-box;
  }

  .detail-row + .detail-row,
  .content-row + .content-row {
    border-top: 1px solid var(--mica-divider);
  }

  .detail-row {
    align-items: flex-start;
    flex-direction: column;
    gap: 9px;
  }

  .row-control {
    width: 100%;
    height: 34px;
    border-radius: 6px;
  }

  .content-skeleton {
    padding: 22px max(28px, calc((100% - 680px) / 2)) 40px;
  }

  .content-control {
    width: min(248px, 34%);
    height: 34px;
    flex: 0 0 auto;
    border-radius: 6px;
  }

  .about-skeleton {
    display: grid;
    width: min(560px, calc(100% - 64px));
    margin: auto;
    justify-items: center;
    gap: 14px;
  }

  .about-logo {
    width: 64px;
    height: 64px;
    margin-bottom: 6px;
    border-radius: 14px;
  }

  .about-title {
    width: 120px;
    height: 14px;
  }

  .about-version {
    width: 132px;
    height: 10px;
  }

  .about-description {
    width: min(480px, 88%);
    height: 9px;
    margin-top: 2px;
  }

  .about-description.short {
    width: 44%;
    margin-top: -6px;
  }

  .about-link {
    width: 112px;
    height: 9px;
    margin-top: 2px;
  }

  .about-action {
    width: 86px;
    height: 30px;
    margin-top: 4px;
    border-radius: 8px;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @keyframes shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: -100% 0;
    }
  }

  @media (max-width: 720px) {
    .navigation-skeleton {
      width: 148px;
      flex-basis: 148px;
    }

    .collection-skeleton {
      width: 220px;
      flex-basis: 220px;
    }

    .content-skeleton {
      padding-inline: 24px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .block {
      animation: none;
    }
  }
</style>
