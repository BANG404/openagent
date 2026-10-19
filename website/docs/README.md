# Documentation presentation

The docs extend the product landing page's visual language: system sans-serif
type, neutral white/gray surfaces, blue accents, quiet borders and rounded,
shadowless cards. `src/styles/custom.css` maps that palette to Starlight's semantic
tokens in both themes and scales headings for long English and Chinese guides.
Keep documentation overrides here rather than importing `../site.css`, whose
global selectors and marketing layouts are intended for the landing page.

`src/components/SiteTitle.astro` links the shared product mark to the homepage and
the localized Docs label to the documentation index. Derive both from the project
base; deep article routes must retain these destinations. Starlight continues to
own responsive navigation, search, theme/locale controls and article structure.

Verify the combined production artifact at `/openagent/`: compare the homepage,
documentation index and an article in English/Chinese and light/dark, including
mobile navigation, keyboard focus, Pagefind results, code/table overflow and the
two brand links. Build and deployment commands are owned by
[GitHub Pages](../../.agents/skills/openagent-release-engineering/references/github-pages.md).
