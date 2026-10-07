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

Install the site package without initializing private SDK or plugin submodules:

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
deployment. Relevant pushes to `master`, manual dispatches, and release workflow
calls build and deploy the combined artifact. Only the deploy job has Pages
write and OIDC permissions. The Pages job also runs the artifact guard regression
tests. Retain release-manifest inputs and channel fallback; direct platform
buttons select lightweight assets, excluding full bundles.
First-install copy points users to full release assets or model download at setup.
Component-only releases show an explicit no-installer explanation rather than
presenting their version as a new desktop installer.

Verify English/Chinese landing-page links, every tutorial route, theme and locale
switching, mobile menu/layout, Pagefind search in a production preview, and the
release-manifest fallback. This is a browser site; no native desktop scenario
is needed unless the desktop UI itself changes.
