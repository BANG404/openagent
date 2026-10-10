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
deployment. Relevant pushes to `main`, manual dispatches, and release workflow
calls build and deploy the combined artifact. Only the deploy job has Pages
write and OIDC permissions. The Pages job also runs the artifact guard regression
tests. Retain release-manifest inputs and channel fallback; direct platform
buttons select lightweight assets, excluding full bundles.
First-install copy points users to full release assets or model download at setup.
Component-only releases show an explicit no-installer explanation rather than
presenting their version as a new desktop installer.

## Static plugin release feed

The same Pages workflow refreshes daily at 02:23 UTC, on relevant main pushes,
manual dispatch and release calls. `scripts/plugin-release-index.mjs` uses the
job's `GITHUB_TOKEN` to collect the latest 100 releases for every repository in
`src/lib/officialPluginRegistry.json`. It publishes `plugin-releases.json` at the
site root with schema version 1, a Unix-seconds `generated_at`, and a repository
map keyed by lowercase `owner/repo`. Values contain only stable releases, their
protocol metadata, release URLs and archive assets with GitHub SHA-256 digests.
Empty release histories remain explicit covered entries. Never publish a branch
manifest version as a release or include a token in the artifact.

The builder copies the file supplied by `OPENAGENT_PLUGIN_RELEASE_MANIFEST`.
PR builds run deterministic collector tests without authenticated collection or
deployment. Any upstream error stops the entire deployment; the last deployed
snapshot remains intact. Runtime checks and explicit updates consume this feed
without credentials. Covered repositories never fall back to the GitHub API on
failure. Changes to the reviewed registry and collector trigger Pages builds;
do not commit generated `plugin-releases.json`. Collector tests run in Pages and
frontend/automation qualification.

Verify English/Chinese landing-page links, every tutorial route, theme and locale
switching, mobile menu/layout, Pagefind search in a production preview, and the
release-manifest fallback. This is a browser site; no native desktop scenario
is needed unless the desktop UI itself changes.
