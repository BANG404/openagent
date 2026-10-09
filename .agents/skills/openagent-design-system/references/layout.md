## Layout

### Embedded surface titles

Give each visible surface name one owner. When a selected sidebar tab or
management surface chrome already names its content, embedded components start
with useful content, status, or actions instead of another heading with that
name. Keep accessible region, dialog, and iframe names; those labels do not
create an extra visual heading. Distinct section headings, file paths, and task
objectives remain content. Standalone presentations without naming chrome own
their heading explicitly, as the role editor's presentation contract does.

Check both the host and embedded content, including plugin HTML, when reviewing
titles. Verify the composed surface in both themes and languages instead of
judging an isolated component alone.

When the conversation pane is collapsed, an available right sidebar becomes
the sole workspace surface and must occupy the full workspace width. The
sidebar's saved collapse preference remains available when the conversation
pane is restored; it must not leave the workspace empty while the conversation
pane is hidden.

### Spacing System

- **Base unit:** 8px. Sub-base values (2, 4, 5, 6, 7) are used for tight typographic adjustments; structural layout snaps to 8/12/16/20/24.
- **Tokens:** `{spacing.xxs}` 4px · `{spacing.xs}` 8px · `{spacing.sm}` 12px · `{spacing.md}` 17px · `{spacing.lg}` 24px · `{spacing.xl}` 32px · `{spacing.xxl}` 48px · `{spacing.section}` 80px.
- **Section vertical padding:** `{spacing.section}` (80px) inside a product tile; tiles stack edge-to-edge with 0 gap (the color change provides the break).
- **Card padding:** `{spacing.lg}` (24px) inside utility grid cards.
- **Button padding:** 8–11px vertical, 15–22px horizontal.
- **Universal rhythm constants:** the 17px body line-height multiplier (~25px line) and 21px tagline size show up on every analyzed page.

### Grid & Container

- **Max content width:** ~980px on text-heavy sections (environment), ~1440px on product grids (store, accessories), full-bleed for product tiles (homepage).
- **Column patterns:** 3 to 5 column utility card grid on store/accessories; 2-column side-by-side tiles on homepage occasional sections; single-column centered stack on product tile heroes.
- **Gutters:** 20–24px between cards in a utility grid.

### Whitespace Philosophy

Apple's whitespace is the product's pedestal. Every tile begins with at least 64px of air above its headline and 48–64px below. Product renders are never crowded; the nearest content to a product image is at least 40px away. The footer is the only area that breaks this — there, Apple goes deliberately dense to make the full information architecture visible at a glance.

### Scrollable Surfaces

Application lists that need scrolling use the shared `ui/ScrollArea.svelte`
Bits UI wrapper. Keep the scrollbar in its own gutter and configure transient
visibility through its `scrollHideDelay` prop instead of styling native
scrollbars per feature. This includes conversation transcripts, sidebar
conversation and workspace lists, settings panes, onboarding content, role
resource browsers, and background-terminal sessions. Preserve native scrolling
only for content that is intentionally horizontally scrollable (for example
diffs, code blocks, diagrams, and textareas).

Expanded background-terminal output uses an intrinsic-height ScrollArea with
only a maximum height (`outputMaxHeight`, default `min(280px, 40vh)`). Short
output reserves no blank viewport; long output scrolls inside the session
detail. The shared wrapper accepts `maxHeight` on both root and viewport while
existing definite-height lists retain their explicit `height`.

A surface with side-by-side columns fills its body instead of scrolling it. The
body is a definite-height grid, so each column owns its own scroll window: the
prompt column scrolls only once its own fields stop fitting, and every resource
browser keeps its own bounded scroll area. Never wrap the whole body in one
`ScrollArea`. With a shared body scroll the tallest column decides the height of
the other column, grows the textarea to fit it, and pushes the trailing content
below the fold. The role editor surface is the current example.

Top-bar settings windows place their active section content directly in the
window surface; they do not render a separate left navigation rail.

Installed plugin cards keep the name, installed version and update status in
one wrapping title row, followed by the description and compact language/license
metadata. Enablement stays outside the accordion trigger. Expanded content uses
separate configuration, component summary and sidebar rows with a 20px rhythm.
The MCP mode selector is bounded beside its explanation on wide surfaces and
fills a row on narrow surfaces. The footer separates source/release information
from trailing update and uninstall actions; errors remain readable on their own
lines. Wrap against the management surface width, not the native viewport.
Verify with `bun run test:blackbox:plugin-layout` in the isolated `plugin-layout`
instance; it covers installed cards as well as the marketplace in both themes
and languages.

Memory Management keeps scope and refresh in its toolbar, user-written memory
beside the searchable Agent memory list, and backup/cleanup in a collapsed
disclosure. The editor footer owns saved/unsaved feedback, Save, and Discard.
Do not let expanding maintenance controls push the editor's actions outside
the available body; each content pane retains its own bounded scroll region.
