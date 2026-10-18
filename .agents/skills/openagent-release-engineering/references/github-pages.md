# GitHub Pages and plugin tutorials

`website/index.html`, `site.css`, and `site.js` own the bilingual product and
download landing page. `website/docs/` is an independent Astro Starlight package
with a dedicated Bun lockfile; its dependencies do not enter the desktop app.
English content lives in `src/content/docs/`, Chinese in the matching `zh-cn/`
paths. The deployed routes are `/openagent/` and `/openagent/docs/` respectively.
Starlight owns search, sidebar navigation, theme, locale switching, and its sitemap.

The landing page's tutorial links carry `data-doc-path` and follow its selected
language. Retain the tutorial navigation on mobile. Keep both dictionaries and
the initial English HTML aligned. Product copy distinguishes Runtime Multi-Agent
V2 from independently installed Goal, Graph, Chat Groups, Cua Driver, Message Board,
and Plugin Developer packages. Check public Plugin Kit templates and references
before changing tutorial examples; do not publish private SDK implementation.
Installation tutorials use the current Integrations -> Plugins menu. Scheduling
copy describes continuations arranged and managed through the Agent's hook tools.

## Build and preview

Install the site package without initializing the private SDK or independent plugin checkouts:

```sh
cd website/docs
bun install --frozen-lockfile
bun run dev
```

From the repository root, `bun run build:pages` builds Starlight, copies only its
generated `dist/` into `dist-pages/docs/`, copies the landing page and assets,
generates release-driven `downloads.json` and `.nojekyll`, then checks every
local HTML link and asset against the GitHub project base. Sources, dependencies,
and lockfiles must never enter the deployment artifact. Serve `dist-pages` at
`/openagent/` when verifying the combined artifact; Starlight dev alone does not
serve the product homepage. Do not edit generated site output.

`.github/workflows/pages.yml` installs the dedicated frozen lockfile with Bun
and a compatible Node runtime. PRs build and verify their merge SHA without
deployment. Relevant pushes to `main`, manual dispatches, and release workflow
calls build and deploy the combined artifact. Only the deploy job has Pages
write and OIDC permissions. The Pages job also runs the artifact guard regression
tests. Retain release-manifest inputs and channel fallback; direct platform
buttons select lightweight assets, excluding full bundles.
First-install copy points users to full release assets or model download at setup.
Component-only releases show an explicit no-installer explanation rather than
presenting their version as a new desktop installer.

Plugin update metadata is published independently as a rolling Release asset;
see [plugin release index](plugin-release-index.md). Pages builds do not collect
or publish it.

The landing page's `#plugins` official store is rendered at build time from
`src/lib/officialPluginRegistry.json` through `scripts/pages-plugin-store.mjs`.
Registry and shared `src/lib/pluginDiscoveryCategories.ts` changes trigger Pages
deployment. The website uses reviewed `discovery_category` purposes independently
of manifest categories, matching desktop discovery. Keep this reviewed directory as the
single discovery source; do not initialize independent plugin checkouts, request
per-plugin release APIs, or present discovery entries as installed/compatible
versions. Cards contain escaped English/Chinese metadata and source/Release links,
and remain browsable without JavaScript. Website search matches either language
and plugin IDs, intersects with category buttons, and retains both filters when
the locale changes. Category controls remain available with empty results.
Installation happens in the desktop app's Integrations → Plugins store; README
setup requirements and actual release availability remain package-owned.
Verify all catalog cards, combined search/category filters, empty-result recovery,
locale switching with retained filters, mobile navigation/layout, and no-script
card/link availability in the combined production artifact. Do not publish the
registry's unrelated runtime/tool translation keys as website assets.

Verify English/Chinese landing-page links, every tutorial route, theme and locale
switching, mobile menu/layout, Pagefind search in a production preview, and the
release-manifest fallback. This is a browser site; no native desktop scenario
is needed unless the desktop UI itself changes.
