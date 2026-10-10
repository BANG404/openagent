<div class="plugin-skeleton-container" aria-hidden="true">
  <main class="plugin-skeleton-content">
    <div class="plugin-skeleton-heading">
      <span class="block heading"></span>
      <span class="block tabs"></span>
    </div>
    <div class="plugin-skeleton-store">
      <div class="plugin-skeleton-toolbar">
        <span class="block search"></span>
        <span class="block category"></span>
        <span class="block filter"></span>
      </div>
      <div class="plugin-skeleton-grid">
        {#each Array(6) as _, index (index)}
          <article class="plugin-skeleton-card">
            <div class="card-heading">
              <div class="card-title-row">
                <span class="block title"></span><span class="block badge"></span>
              </div>
              <span class="block id"></span>
            </div>
            <div class="description">
              <span class="block line"></span><span class="block line short"></span>
            </div>
            <span class="block languages"></span>
            <span class="block metadata"></span>
            <span class="block action"></span>
          </article>
        {/each}
      </div>
    </div>
  </main>
</div>

<style>
  .plugin-skeleton-container {
    width: 100%;
    min-width: 0;
    container: plugin-skeleton / inline-size;
  }
  .plugin-skeleton-content {
    padding: var(--settings-content-padding);
    padding-inline: max(
      var(--settings-content-padding),
      calc((100% - var(--plugin-content-max-width)) / 2)
    );
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
  .plugin-skeleton-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: var(--plugin-header-height);
    margin-bottom: var(--plugin-header-gap);
  }
  .heading {
    width: 72px;
    height: 18px;
  }
  .tabs {
    width: 160px;
    height: var(--plugin-header-height);
    margin-left: auto;
    border-radius: 7px;
  }
  .plugin-skeleton-store {
    display: grid;
    gap: var(--plugin-store-gap);
  }
  .plugin-skeleton-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
  .search,
  .category,
  .filter {
    height: var(--plugin-control-height);
  }
  .search {
    flex: 1;
    min-width: 0;
  }
  .category {
    width: 150px;
  }
  .filter {
    width: 210px;
    height: var(--plugin-header-height);
    border-radius: 7px;
  }
  .plugin-skeleton-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--plugin-grid-min-width)), 1fr));
    gap: var(--plugin-grid-gap);
  }
  .plugin-skeleton-card {
    display: grid;
    min-width: 0;
    min-height: var(--plugin-card-min-height);
    gap: 12px;
    padding: var(--plugin-card-padding);
    border: 1px solid var(--mica-divider);
    border-radius: var(--plugin-card-radius);
    background: var(--mica-surface);
  }
  .card-heading {
    display: grid;
    gap: 2px;
    min-height: 42px;
  }
  .card-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .title {
    width: 45%;
    height: 14px;
  }
  .badge {
    width: 60px;
    height: 20px;
    border-radius: 9999px;
  }
  .id {
    width: 38%;
    height: 10px;
  }
  .description {
    display: grid;
    gap: 7px;
    align-content: center;
    min-height: 34px;
  }
  .line {
    width: 100%;
    height: 10px;
  }
  .short {
    width: 76%;
  }
  .languages {
    width: 68%;
    height: 17px;
  }
  .metadata {
    width: 88%;
    height: 20px;
  }
  .action {
    width: 70px;
    height: 30px;
    margin-left: auto;
    border-radius: 9999px;
  }
  @container plugin-skeleton (max-width: 640px) {
    .plugin-skeleton-toolbar {
      flex-direction: column;
      align-items: stretch;
    }
    .search {
      flex: none;
    }
    .category,
    .filter {
      width: 100%;
    }
  }
  @keyframes shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: -100% 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .block {
      animation: none;
    }
  }
</style>
