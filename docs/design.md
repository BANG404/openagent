## Overview

Apple's web presence is a masterclass in **reverent product photography framed by near-invisible UI**. Every page is a stack of edge-to-edge product "tiles" — alternating light and dark canvases, each centered on a hero headline, a one-line tagline, two tiny blue pill CTAs, and an impossibly crisp product render. Nothing competes with the product. Typography is confident but quiet; color is either pure white, an off-white parchment, or a near-black tile; interactive elements are a single, quiet blue.

Density is unusually low even by contemporary SaaS standards. Each tile occupies roughly one viewport, and there is no decorative chrome — no borders, no gradients, no decorative frames, no shadows on headlines. Elevation appears only when a product image rests on a surface (a single soft `rgba(0, 0, 0, 0.22) 3px 5px 30px` drop for visual weight). The result is a catalog that feels more like a museum gallery: the wall disappears and the artifact takes over.

Store and shop surfaces retain the same chassis but switch modes. The product configurator (iPhone 17 Pro, accessories grid) introduces a tight grid of white utility cards at `{rounded.lg}` (18px) radius with a thin border, paired with a persistent thin sub-nav strip. The environment page leans darker and more editorial. Across all five surfaces the typographic system, spacing rhythm, and the single blue accent are consistent — this is one design language expressed at different volumes.

**Key Characteristics:**

- Photography-first presentation; UI recedes so the product can speak.
- Alternating full-bleed tile sections: white/parchment ↔ near-black, with the color change itself acting as the section divider.
- Single blue accent (`{colors.primary}` — #0066cc) carries every interactive element. No second brand color exists.
- Two button grammars: tiny blue pill CTAs (`{rounded.pill}`) and compact utility rects (`{rounded.sm}`).
- SF Pro Display + SF Pro Text — negative letter-spacing at display sizes for the signature "Apple tight" headline feel.
- Whisper-soft elevation used only when a product image needs to breathe — exactly one drop-shadow in the entire system.
- Tight two-row nav: slim `{component.global-nav}` + product-specific `{component.sub-nav-frosted}` with persistent right-aligned primary CTA.
- Section rhythm across multiple pages: light hero → dark product tile → light utility tile → dark tile → parchment footer — a predictable pulse.
- **Neutral conversation surfaces:** chat canvases, composers, and empty-conversation greetings use only theme-neutral depth; colored ambient fields are not conversation chrome.
- **Conversation details panel:** the ordinary desktop conversation's resizable right-side card owns both durable Goal/Graph status and edited files. Its top-level tabs switch between status and files; the files view uses a horizontal file-tab strip and a scrollable line-numbered diff, including all-added content for a newly created text file. The path, change kind, and revert action adapt to the live panel width without overlapping, while long code remains contained by the diff scroller. Desktop file changes never occupy the composer stack. Newly created flows and file-only activity open the panel automatically, while the title-bar toggle collapses it with the same 180ms width curve as the conversation sidebar and leaves no interactive or visible track behind.
- **Settings cards:** align each section title with its supporting copy and align each card row's label with its description. Every card-like Settings container—including grouped rows, permission controls, shortcut, startup, execution, channel, model-list, Flash Agent, and danger surfaces—uses the shadowless shared `.application-settings-surface` Mica treatment from `app.css`; semantic component classes own only layout and variants. Settings and onboarding roots use `.application-settings-scope`, while equivalent standalone fields use `.application-settings-control`, so nested Select triggers and ordinary form controls receive their complete shadowless `1px solid var(--mica-divider)` border from the global utility instead of component-local border colors. Keep these utilities outside the base CSS layer so component-local default elevation cannot override them; focus and open states retain only the shared focus ring.
- **Settings enablement switches:** show the switch alone. Do not repeat its
  enabled or disabled state with adjacent text, dots, or labels; expose the
  control name through its accessible label.
- **Transient scrollbars:** scrollbars across the application keep their
  layout footprint but hide their thumb while idle. Scrolling or moving the
  pointer within a scrollable region reveals its scrollbar temporarily; nested,
  horizontal, textarea, and attachment-strip scrollers follow the same behavior.
- **Desktop application shell:** keep one compact, continuous top chrome across
  the sidebar, conversation, and Settings surfaces. Settings does not render a
  second title bar. Match VS Code's compact desktop geometry: the shared title
  bar is 35px tall, its application icon is 16px square, and every shell-owned
  top inset or resize boundary derives from that same height token. The leading
  controls collapse
  the sidebar and traverse application history; File owns workspace-opening and
  explicit new-window commands. The File menu follows the forward control with
  the same compact optical rhythm as the other leading controls, without an
  extra separator gap. Keep the center free of workspace names and Git branches
  so it remains a quiet, unobstructed drag region. Window controls
  follow macOS traffic-light placement or Windows trailing minimize/maximize/close
  geometry. Windows controls fill the title-bar
  height; the close hover uses the platform red and follows the outer 7px window
  corner while restored, then becomes square when maximized. The dedicated
  onboarding window omits the custom title bar and window controls so its setup
  body fills the complete frameless canvas. The centered onboarding window is a
  fixed, non-maximizable 960 × 640px canvas. Its Windows 11 OOBE-inspired body
  pairs a quiet illustration and
  compact numbered progress controls on the native-material side with the
  current setup form in a slightly narrower, near-even content canvas with a
  small vertical inset.
  The welcome step first explains
  what OpenAgent does, what the setup will configure, and how the selected
  workspace scopes file and command activity, so a first-time user can make an
  informed choice before continuing. The right-side setup canvas and its nested
  summary cards use the same bordered, shadowless Mica surface as grouped
  Settings cards, while spacing rather than divider lines separates the two
  columns. Dense provider content scrolls inside the form column without changing
  the native window geometry, and its scrollbar stays flush with the trailing
  edge of the inset canvas while the content keeps its reading inset.
  Embedding preparation begins in the background as soon as this window mounts.
  The final step keeps the primary action disabled and presents a layout-stable
  progress card until the local model is installed and verified; failures keep
  an actionable retry in the same card. A configured installation that needs
  resource repair opens directly on this final step instead of repeating model-
  provider configuration.
  Every native window canvas, including onboarding, Settings, and role editing,
  remains fully transparent over the native window material without a theme-
  color tint: Windows prefers Mica with Acrylic and Blur fallbacks, while macOS
  uses Vibrancy. The inset conversation stage uses the opaque theme surface so
  its light appearance is consistently white. Content-bearing controls and
  cards retain their own surfaces. Browser previews use the same conversation
  surface because they have no native material.
  The operating system retains the native window outline, rounded corners, and
  exterior shadow.
  Do not draw a border between those two chrome segments or beneath the title
  bar. Separate chat from navigation through an inset rounded conversation canvas
  directly against the title bar's lower edge, with 8px side and bottom gutters
  and compact, clearly edged elevation instead of shell divider lines.
  The sidebar groups workspace-owned conversations under Projects and shows one
  cross-workspace, newest-first Recent conversations list of top-level chats for
  the selected role. Child conversations remain in their project hierarchy and
  do not appear as separate Recent entries.
  Project groups retain their persisted first-save order across workspace
  selection changes, with pinned groups kept ahead without otherwise changing
  order. Projects does not impose a fixed item cap: every available persisted or
  conversation-recovered workspace remains present in the sidebar. Workspaces
  whose directories were deleted or renamed are omitted during startup, and a
  directory that disappears while the app is running cannot become the active
  workspace; opening it reports the unavailable path instead. Every project keeps
  the same conversation-list structure mounted, starts
  with five visible conversations, and loads its own role-filtered first page even
  while inactive; the global Recent projection is not a substitute for project
  history. An inactive project keeps cached rows during refresh, uses a compact
  skeleton before its first load, and shows a muted, indented `No chats` row
  without a persistent group background only after an authoritative empty result. It
  retains its Show more action across selection changes so row styling and DOM
  identity do not flicker. Child conversation rows, including delegated role,
  Goal, and Graph conversations, omit leading icons and indent their titles
  beyond the parent title, with deeper active-branch levels receiving additional
  inset. Clicking an
  expanded project collapses it without first selecting that workspace; clicking
  a collapsed project expands it and selects its workspace only when needed.
  Both sections collapse independently. Project-name search temporarily ranks
  matching projects ahead of the remaining list, while Recent conversations
  remains a bounded newest-first projection in the sidebar's ordinary scroll flow.
  The conversation sidebar header contains the role selector beside history
  controls; selecting a role filters conversation history and exposes its
  dedicated new-conversation context. Full-width new-conversation and search
  actions follow directly below it.
  The new action uses the workspace already selected by the current window.
  General Settings, model, Agent, integration, memory, automation, and About
  management open from the application menu in modeless singleton utility
  windows. The sidebar has
  no persistent Settings action. Conversation search spans all
  workspaces and roles only while its field retains focus; leaving search
  restores Projects and Recent conversations. Opening a result switches the
  current window to that conversation's workspace. A current-window project
  switch keeps the existing shell and chat mounted while the target workspace
  is prepared, then replaces the workspace state atomically instead of showing
  an application-wide loading reset. New-conversation composers expose the
  workspace switcher beside approval mode; existing workspace conversations hide
  it because their workspace is durable context. The workspace trigger
  follows the same surface-free rest, hover, and open grammar as the adjacent
  composer selectors. Each project row exposes
  its own new-conversation action and menu for pinning, opening the project
  folder, or removing the project from Projects without deleting its files or
  conversation history.
- **Floating application panels:** dropdown menus, searchable selects,
  comboboxes, context and download menus, command/mention palettes, floating
  text-selection actions, and notifications reuse the conversation input's
  Mica fill, hairline perimeter, 18px radius, 24px saturated blur, and compact
  shadow whose short falloff keeps the card edge legible. Individual panels
  retain their compact inset, row scale, size, scrolling, and content layout.
  Small explanatory tooltips and modal dialogs keep their distinct semantic
  treatments.

## Colors

> **Source pages analyzed:** homepage, environment, store, iPhone 17 Pro buy page, accessories index. The color system is identical across all five surfaces; only the surface-mode mix differs.

### Brand & Accent

- **Action Blue** (`{colors.primary}` — #0066cc): The single brand-level interactive color. All text links, all blue pill CTAs ("Learn more", "Buy"), and the focus ring root. This is Apple's quiet but universal "click me" signal. Press state shifts to a slightly darker variant via the active scale transform rather than a hex change.
- **Focus Blue** (`{colors.primary-focus}` — #0071e3): A marginally brighter sibling of Action Blue, reserved for the keyboard focus ring on buttons (`outline: 2px solid`).
- **Sky Link Blue** (`{colors.primary-on-dark}` — #2997ff): A brighter blue used on dark surfaces for in-copy links and inline callouts, where Action Blue would disappear against the tile background.

### Surface

- **Pure White** (`{colors.canvas}` — #ffffff): The dominant canvas. Content, utility cards, store tiles, configurator grids.
- **Parchment** (`{colors.canvas-parchment}` — #f5f5f7): The signature Apple off-white. Used for alternating light tiles, footer region, and the default page canvas in store utility sections. Just different enough from white to create rhythm.
- **Pearl Button** (`{colors.surface-pearl}` — #fafafc): A near-white used as the fill for secondary "ghost" buttons — lighter than the parchment canvas so the button still reads as a button against `{colors.canvas-parchment}`.
- **Near-Black Tile 1** (`{colors.surface-tile-1}` — #272729): The primary dark-tile surface on the homepage product grid.
- **Near-Black Tile 2** (`{colors.surface-tile-2}` — #2a2a2c): A micro-step lighter — used where a dark tile sits directly above or below Tile 1 to create the faintest separation.
- **Near-Black Tile 3** (`{colors.surface-tile-3}` — #252527): A micro-step darker — used at the bottom of the stack and in embedded video/player frames.
- **Pure Black** (`{colors.surface-black}` — #000000): Reserved for true void — video player backgrounds, edge-to-edge photographic overlays, the global nav bar background.
- **Translucent Chip Gray** (`{colors.surface-chip-translucent}` — #d2d2d7): The base hex of the translucent gray chip used over photography for circular control buttons. In production, applied at ~64% alpha as `rgba(210, 210, 215, 0.64)`.

### Text

- **Near-Black Ink** (`{colors.ink}` — #1d1d1f): The voice of every headline, every body paragraph, and the dark utility button's fill. Chosen instead of pure black to keep the page feeling photographic rather than printed.
- **Body** (`{colors.body}` — #1d1d1f): Same hex as ink — Apple uses one near-black tone for all text on light surfaces.
- **Body On Dark** (`{colors.body-on-dark}` — #ffffff): All text on dark tiles and on the global nav bar.
- **Body Muted** (`{colors.body-muted}` — #cccccc): Secondary copy on dark tiles where pure white would be too loud.
- **Ink Muted 80** (`{colors.ink-muted-80}` — #333333): Body text on the white Pearl Button surface — slightly softer than pure black.
- **Ink Muted 48** (`{colors.ink-muted-48}` — #7a7a7a): Disabled button text and legal fine-print.

### Hairlines & Borders

- **Divider Soft** (`{colors.divider-soft}` — #f0f0f0): The "border" tone on secondary buttons — functions as a ring shadow rather than a hard line. In production, often applied as `rgba(0, 0, 0, 0.04)`.
- **Hairline** (`{colors.hairline}` — #e0e0e0): The 1px hairline border on store utility cards and configurator chips.

### Brand Gradient

**No decorative gradients.** Atmospheric depth on product photography (the iPhone 17 Pro camera plate, the Apple Watch bands, AirPods reflections) is inherent to the imagery, not a CSS gradient overlay. The environment page's hero uses photographic atmosphere (mountain vista at dawn) but no gradient tokens are defined. Apple is the rare luxury-brand site with zero gradient-based design tokens.

### Application Conversation Surfaces

The desktop and remote conversational surfaces do not introduce a second brand palette. Paint every conversation stage with the shared Tailwind `bg-conversation-surface` theme color, which is white in light mode, and use the distinct neutral-gray `bg-conversation-component` color for transcript components. Use neutral Mica only for raised controls. Do not place a fade, ambient gradient, glow, or streaming shadow behind the bottom composer.

## Typography

### Font Family

- **Display**: `SF Pro Display, system-ui, -apple-system, sans-serif` — Apple's proprietary display face, optimized for sizes ≥ 19px. Defines the voice of every headline.
- **Body / UI**: `SF Pro Text, system-ui, -apple-system, sans-serif` — the text-optimized variant used for body copy, captions, buttons, and links below 20px.
- **OpenType features**: `font-variant-numeric: numerator` is enabled on numeric links (pricing tables, spec sheets). Display sizes rely on tight tracking rather than contextual ligatures.

### Hierarchy

| Token                         | Size | Weight | Line Height | Letter Spacing | Use                                                    |
| ----------------------------- | ---- | ------ | ----------- | -------------- | ------------------------------------------------------ |
| `{typography.hero-display}`   | 56px | 600    | 1.07        | -0.28px        | Hero headline; the signature "Apple tight" tracking    |
| `{typography.display-lg}`     | 40px | 600    | 1.10        | 0              | Tile headlines atop every product tile                 |
| `{typography.display-md}`     | 34px | 600    | 1.47        | -0.374px       | Section heads (SF Pro Text at display proportions)     |
| `{typography.lead}`           | 28px | 400    | 1.14        | 0.196px        | Product tile subcopy                                   |
| `{typography.lead-airy}`      | 24px | 300    | 1.5         | 0              | Environment-page lead paragraphs (the rare weight 300) |
| `{typography.tagline}`        | 21px | 600    | 1.19        | 0.231px        | Sub-tile tagline; sub-nav category name                |
| `{typography.body-strong}`    | 17px | 600    | 1.24        | -0.374px       | Inline strong emphasis                                 |
| `{typography.body}`           | 17px | 400    | 1.47        | -0.374px       | Default paragraph                                      |
| `{typography.dense-link}`     | 17px | 400    | 2.41        | 0              | Footer / store utility link lists (relaxed leading)    |
| `{typography.caption}`        | 14px | 400    | 1.43        | -0.224px       | Secondary captions, button text                        |
| `{typography.caption-strong}` | 14px | 600    | 1.29        | -0.224px       | Emphasized captions                                    |
| `{typography.button-large}`   | 18px | 300    | 1.0         | 0              | Store hero CTAs (the rare weight 300)                  |
| `{typography.button-utility}` | 14px | 400    | 1.29        | -0.224px       | Utility/nav button labels                              |
| `{typography.fine-print}`     | 12px | 400    | 1.0         | -0.12px        | Fine-print, footer body                                |
| `{typography.micro-legal}`    | 10px | 400    | 1.3         | -0.08px        | Micro legal disclaimers                                |
| `{typography.nav-link}`       | 12px | 400    | 1.0         | -0.12px        | Global nav menu items                                  |

### Principles

- **Negative letter-spacing at display sizes.** Every headline at 17px and up carries a slight tracking tighten (`-0.12 → -0.374px`). This produces the iconic "Apple tight" headline cadence. Never used at 12px or below.
- **Body copy at 17px, not 16px.** Apple breaks the SaaS convention and runs paragraph text at 17px. The extra pixel gives the page an unmistakable "reading, not scanning" pace.
- **Weight 300 is real and rare.** Used deliberately on a handful of large-size reads (`{typography.button-large}` at 18px/300 and `{typography.lead-airy}` at 24px/300). It's not an accident — it's a light-atmosphere cue reserved for moments where the content should feel airy.
- **Weight 600, not 700, for headlines.** Apple's headlines sit at weight 600. Weight 700 is used sparingly for `{typography.tagline}` (21px) when a touch more assertion is needed.
- **Line-height is context-specific.** Display sizes use 1.07–1.19 (tight). Body uses 1.47. Utility link stacks in the footer/store use an unusually relaxed 2.41 (`{typography.dense-link}`). The 2.41 is not a bug — it's how the footer's dense link columns breathe.
- **Weight 500 is deliberately absent.** The ladder is 300 / 400 / 600 / 700. Mid-weight readings always use 600.

### Note on Font Substitutes

SF Pro is Apple's proprietary system font. When building off-system:

- Use `system-ui, -apple-system, BlinkMacSystemFont` as the first stack entry — on macOS/iOS/Safari this resolves to the real SF Pro.
- For non-Apple platforms, **Inter** (Google Fonts, variable) is the closest open-source equivalent. Inter at weight 600 with `font-feature-settings: "ss03"` approximates SF Pro's rounded "a" character.
- Nudge `letter-spacing` down by `-0.01em` on display sizes to re-create the Apple tight feel; Inter's default tracking runs slightly wider than SF Pro.
- For body text, tighten line-height by `0.03` (from 1.47 → 1.44) when substituting Inter — Inter's taller x-height needs less leading.

## Layout

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

## Elevation & Depth

| Level               | Treatment                                                          | Use                                                                         |
| ------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Flat                | No shadow, no border                                               | Full-bleed tiles, global nav, footer, body sections                         |
| Soft hairline       | 1px `rgba(0, 0, 0, 0.08)` border                                   | Utility cards, sub-nav frosted-glass separator                              |
| Backdrop blur       | `backdrop-filter: blur(N)` on Parchment 80%                        | Sub-nav and the iPhone buy floating sticky bar                              |
| Product shadow      | `rgba(0, 0, 0, 0.22) 3px 5px 30px 0`                               | Product renders resting on a surface (the only true "shadow" in the system) |
| Application control | `var(--control-shadow)` with no outer border                       | Filled inputs, selectors, composer, reusable cards, segmented controls      |
| Application Mica    | Translucent theme tint, 24px backdrop blur, subtle inner highlight | Quiet grouped settings whose canvas should remain perceptible               |
| Application overlay | `var(--raised-shadow)` with no outer border                        | Dialogs, menus, dropdowns, palettes, toasts, floating previews              |

**Shadow philosophy.** On the product-marketing surfaces, Apple uses **exactly one** drop-shadow, and it is applied to photographic product imagery. The desktop application adds a restrained functional exception: a filled interactive surface must not also carry an outer border. Use `--control-shadow` for controls and embedded reusable cards, and `--raised-shadow` for floating layers. Borders remain appropriate for separators, table grids, selection/focus rings, validation, and other state-bearing marks.

### Decorative Depth

- **Atmospheric imagery** on the environment page (photographic vista) supplies mood; no CSS gradient involved.
- **Edge-to-edge tile alternation** creates rhythm without borders or shadows — the color change itself is the divider.
- **Backdrop-filter blur** on `{component.sub-nav-frosted}` and `{component.floating-sticky-bar}` creates a "floating over content" effect that's functional, not decorative.

### Application Chat Depth

Conversation canvases, new-conversation states, and composer backgrounds use only neutral theme surfaces. The main conversation stage uses `bg-conversation-surface`; component-neutral content resolves through the distinct gray `bg-conversation-component`. Both Tailwind theme colors are centralized in `src/app.css`: the light canvas is white while its components use the fixed light-gray surface. Do not place a readability fade, colored radial field, animated ambient glow, or colored streaming shadow behind the composer. Streaming state belongs to the primary action and status indicators rather than the composer perimeter.

## Shapes

### Border Radius Scale

| Token            | Value        | Use                                                                                                            |
| ---------------- | ------------ | -------------------------------------------------------------------------------------------------------------- |
| `{rounded.none}` | 0px          | Full-bleed product tiles (no corner rounding)                                                                  |
| `{rounded.xs}`   | 5px          | Inline links when styled as subtle chips (rare)                                                                |
| `{rounded.sm}`   | 8px          | Dark utility buttons (Sign In, Bag), inline card imagery                                                       |
| `{rounded.md}`   | 11px         | White Pearl Button capsules                                                                                    |
| `{rounded.lg}`   | 18px         | Store utility cards, accessories grid cards                                                                    |
| `{rounded.pill}` | 9999px       | Primary blue pill CTAs, sub-nav buy button, configurator option chips, search input — the signature Apple pill |
| `{rounded.full}` | 9999px / 50% | Circular control chips floating over photography                                                               |

### Photography Geometry

- **Hero imagery**: full-bleed, 21:9 or taller on the homepage; 16:9 on environment and shop pages. Product renders are photographic-realistic, often shot on a tinted surface that becomes the tile background.
- **Product renders**: PNG/WebP with transparency; rest on a surface tile and pick up the system shadow.
- **Accessory grid**: square 1:1 crops at `{rounded.lg}` (18px) radius, light neutral backgrounds, product centered with 20–40px internal padding.
- **No rounded imagery in hero tiles** — images are full-bleed rectangular. Rounding (`{rounded.sm}`, `{rounded.lg}`) appears only on inline card imagery.
- Lazy-loading via responsive `srcset` and `sizes` across all breakpoints; CDN-optimized WebP.

## Components

### Top Navigation

**`global-nav`** — Persistent, ultra-thin black nav bar pinned to the top of every page. Background `{colors.surface-black}`, height 44px, text `{colors.on-dark}` in `{typography.nav-link}` (12px / 400 / -0.12px tracking). Links are quiet, spaced ~20px apart, running edge-to-edge across the top. Right-aligned cluster: Search, Bag icons — always visible. On mobile, collapses to hamburger at ~834px and the Apple logo centers.

**`sub-nav-frosted`** — Surface-specific nav that sticks below the global nav. Background `{colors.canvas-parchment}` at 80% opacity with backdrop-filter blur, creating a frosted-glass effect. Height 52px. Content on left: product category name ("iPhone", "Store", "Accessories") in `{typography.tagline}` (21px / 600). Content right: inline nav links in `{typography.button-utility}` (14px), ending in a persistent `{component.button-primary}` ("Buy") or a utility link.

### Buttons

**`button-primary`** — The signature Apple action. Background `{colors.primary}` (Action Blue #0066cc), text `{colors.on-primary}` in `{typography.body}` (SF Pro Text 17px / 400), rounded `{rounded.pill}` (full pill — capsule-shaped), padding 11px × 22px. The full-pill radius IS the brand action signal.

- Active state: `{component.button-primary-active}` — `transform: scale(0.95)` (the system-wide micro-interaction).
- Focus state: `{component.button-primary-focus}` — 2px solid `{colors.primary-focus}` outline.

**`button-secondary-pill`** — Used as the second CTA when two blue pills appear together ("Learn more" / "Buy"). Background transparent, text `{colors.primary}`, 1px solid `{colors.primary}` border, rounded `{rounded.pill}`, padding 11px × 22px. Reads as a "ghost pill."

**`button-dark-utility`** — Global nav actions (Sign In, Bag, language selector). Background `{colors.ink}` (#1d1d1f), text `{colors.on-dark}` in `{typography.button-utility}` (14px / 400 / -0.224px tracking), rounded `{rounded.sm}` (8px), padding 8px × 15px. Active state shrinks via `transform: scale(0.95)`.

**`button-pearl-capsule`** — Product-card secondary button. Background `{colors.surface-pearl}` (#fafafc), text `{colors.ink-muted-80}` in `{typography.caption}` (14px), 3px solid `{colors.divider-soft}` border (functions as a soft ring rather than a visible line), rounded `{rounded.md}` (11px), padding 8px × 14px.

**`button-store-hero`** — A larger primary CTA used on store hero surfaces. Same Action Blue + Paper White as `{component.button-primary}`, but with `{typography.button-large}` (18px / 300 — note the rare weight 300) and slightly more padding (14px × 28px). Used sparingly on the store landing.

**`button-icon-circular`** — Floats over photography. 44 × 44px, background `{colors.surface-chip-translucent}` at ~64% alpha, icon in `{colors.ink}`, rounded `{rounded.full}`. Used for carousel controls, close buttons, and in-image controls (product image thumbnails on the iPhone buy page).

**`dialog-action-quiet`** — A low-emphasis alternative action in application dialogs. It uses a transparent background, no border, muted text at 13px, and adopts the shared neutral interaction fill plus normal text color on hover. Use it for reversible choices such as “Switch this window” and “Cancel” beside a filled primary action; do not render those choices as bordered secondary buttons. Keep destructive actions visually separate from this quiet action and the primary confirmation.

**Settings actions** — Keep settings-page and onboarding actions on a compact 30px grammar with an icon and explicit semantic hierarchy. Creation actions use a content-sized primary blue pill instead of a full-width gray bar. Ordinary file, test, and navigation actions use an 8px shadowless filled control with the same restrained `--mica-divider` perimeter as Settings inputs; inline row-building actions use a shadowless blue text treatment. Destructive actions use a restrained danger-tinted fill and matching subtle perimeter, especially inside a grouped Settings card. Status text and switches remain flat and must not be wrapped in additional gray capsules.

**`text-link`** — Inline body links in `{colors.primary}` (Action Blue). Underlined or non-underlined per context.

**`text-link-on-dark`** — Inline body links on dark tiles in `{colors.primary-on-dark}` (Sky Link Blue #2997ff) — Action Blue would disappear against `{colors.surface-tile-1}`.

### Cards & Containers

**`product-tile-light`** — Full-bleed light tile. Background `{colors.canvas}` (white), text `{colors.ink}`, rounded `{rounded.none}` (0 — tiles touch edges), vertical padding `{spacing.section}` (80px). Centered stack: product name in `{typography.display-lg}` (40px / 600) → one-line tagline in `{typography.lead}` (28px / 400) → two `{component.button-primary}` CTAs ("Learn more" / "Buy") → product render resting on the surface with the system shadow.

**`product-tile-parchment`** — Same as `{component.product-tile-light}` but on `{colors.canvas-parchment}` (#f5f5f7). Used to break two consecutive white tiles.

**`product-tile-dark`** — Full-bleed dark tile. Background `{colors.surface-tile-1}` (#272729), text `{colors.on-dark}`, rounded `{rounded.none}`, vertical padding `{spacing.section}` (80px). Same content stack as the light tile but with `{component.text-link-on-dark}` for inline copy and `{component.button-primary}` (Action Blue still works on the dark surface). Used on the homepage product grid as the alternating dark band.

**`product-tile-dark-2`** — Variant on `{colors.surface-tile-2}` (#2a2a2c). Used where a dark tile sits directly above or below `{component.product-tile-dark}` to create the faintest separation through micro-step lightness change.

**`product-tile-dark-3`** — Variant on `{colors.surface-tile-3}` (#252527). Used at the bottom of the stack and in embedded video/player frames.

**`store-utility-card`** — Used in store grid and accessories grid. Background `{colors.canvas}` (white), 1px solid `{colors.hairline}` border, rounded `{rounded.lg}` (18px), padding `{spacing.lg}` (24px). Top: product image (1:1 crop with `{rounded.sm}` (8px) inner image radius). Below: product name in `{typography.body-strong}` (17px / 600), price in `{typography.body}` (17px / 400), and a `{component.text-link}` ("Buy" or "Learn more"). No shadow by default; product render itself carries the system product-shadow.

**`configurator-option-chip`** — Pill-shaped tappable cell used in the iPhone 17 Pro buy page. Background `{colors.canvas}`, text `{colors.ink}` in `{typography.caption}`, rounded `{rounded.pill}`, padding 12px × 16px. Contains a small product thumbnail + label + price delta. Arranged in a grid of 4–5 options per row.

**`configurator-option-chip-selected`** — Selected state. Border upgrades to 2px solid `{colors.primary-focus}`. Same shape, same content.

**`environment-quote-card`** — A photographic-canvas hero specific to the environment page. Dark photographic backdrop (mountain vista at dawn) with `{colors.surface-tile-1}` as the fallback color, centered white-text headline in `{typography.display-lg}` (40px), small green "Apple 2030" pictographic logo above the headline, single `{component.button-primary}` below. Padding `{spacing.section}` (80px).

**`floating-sticky-bar`** — Floats at the bottom of the viewport on the iPhone 17 Pro buy page during scroll. Background `{colors.canvas-parchment}` at 80% opacity with `backdrop-filter: blur(N)`, height 64px, padding 12px × 32px. Left: running price total in `{typography.body}`. Right: `{component.button-primary}` ("Add to Bag").

### Inputs & Forms

**`search-input`** — The accessories search input. Background `{colors.canvas}`, text `{colors.ink}` in `{typography.body}` (17px), 1px solid `rgba(0, 0, 0, 0.08)` border, rounded `{rounded.pill}` (full pill — search is also pill-shaped, matching the CTA grammar), padding 12px × 20px, height 44px. Leading icon: search glyph at 14px, muted tint.

**`application-input-surface`** — Shared desktop-application treatment for text inputs, textareas, select/combobox triggers, and the chat composer. Use the theme-aware Mica surface, border, shadow, 24px backdrop blur, restrained saturation, and the component's established radius. The shared focus ring expands outside the control boundary instead of consuming its content area or replacing the neutral Mica border. Select and dropdown triggers remain geometrically stable when pressed; their open-state fill and caret rotation provide interaction feedback without scaling the control. The chat composer's shell is the exception: focusing its textarea or entering streaming state leaves the neutral Mica perimeter and shadow unchanged, while embedded toolbar controls retain their own focus rings. While a response streams, an empty composer uses its primary circular control to pause output; the paused state shows resume until the user enters text, adds an attachment, or adds quoted context, when that same control becomes send. Stop remains a separate terminal control. Model, reasoning-effort, and approval triggers embedded in the composer are surface-free toolbar controls; they must not inherit the standalone Select background, border, blur, or shadow. Text selected inside an assistant answer exposes a compact floating Add-to-chat action. Pending quoted excerpts sit above the textarea as removable, primary-railed context rows; durable excerpts use the same visual grammar above the corresponding user-authored message. User-message bubbles are the embedded transcript exception: use the shadowless `var(--user-message-bg)` treatment in both display and edit states, map that token to the centralized Tailwind `bg-conversation-component` theme color, and add only `var(--focus-ring)` for keyboard focus. The component surface is fixed at light gray in the light theme and dark gray in the dark theme so it remains distinct from the conversation canvas. Attachment-card variants use that same component surface for their card and thumbnail base. Transcript-owned tool-call groups and cards, user-input cards and summaries, and retry attachment cards reuse that background so the conversation has one component surface in both themes, including over transparent native-window material. Fenced Markdown code cards and Markdown table headers use the same component surface, while Markdown row hover uses the shared interaction fill. Long user-message copy collapses after a fixed number of complete rendered lines; bubble padding stays outside the clamp so a partial trailing line is never exposed. User-message loading placeholders retain the same shadowless treatment. Searchable dropdown inputs follow the shared control treatment.

**`application-tooltip`** — Application-owned hover and keyboard-focus hints use the shared portal-backed tooltip component instead of native HTML `title` attributes. Keep the surface dark in both themes, with white 12px text, a 6px radius, 5px by 9px padding, a soft raised shadow, and a 280px viewport-bounded maximum width that wraps long paths anywhere. Preserve semantic `title` attributes whose purpose is accessibility metadata rather than a hover hint, such as an iframe title.

**`application-book-reader`** — A completed Agent reply offers a book-mode action beside its other reply actions. The reader uses the same fixed full-viewport footprint, 16px outer inset, and rounded inner hairline frame as Mermaid fullscreen; it does not duplicate native window controls. Both fullscreen surfaces retain a continuous native-window drag strip from the outermost top edge through their header, stopping before interactive controls. Only two dedicated page-turn buttons sit at the left and right vertical center of the framed reading surface. One complete Agent reply flows continuously from the left column into the right and then onto later spreads: internal context-compaction continuations stay in sequence at their original position, and process records retain their normal collapsed summary and expandable details. Expanded process content fragments as a block across columns while atomic records remain intact; book-page records disable viewport content culling so WebView2 cannot invalidate an offscreen column and snap a page turn backward. Markdown tables fragment only between complete rows. Atomic rich content—including images, video, charts, Mermaid, code, and HTML previews—stays within the usable page height and uses containment or internal scrolling instead of being clipped. General settings owns the persisted reading font size; every font, window, expansion, or embedded-media load change recalculates the real overflow-column count using a cancellable animation-frame update and immediate position correction, while smooth scrolling is reserved for explicit page turns. Resize observation never synchronously writes layout back to the observed page, and unchanged geometry is not written again, so dragging the native window cannot create a WebView2 reflow feedback loop. The reading surface uses theme tokens in both light and dark modes and falls back to one column on narrow windows.

**`application-follow-up-suggestions`** — Sending a user message starts one background Flash request from all user-authored messages on the selected conversation branch; Agent output is excluded. The three sendable results remain keyed to that turn's preallocated Agent message across navigation and across `ask_user` or approval interruption/resume boundaries; resumed assistant records retain distinct message IDs without restarting the suggestion request. Only the latest complete turn on the currently selected branch renders them below its full-width footer. A newer trailing user message hides older suggestions even before its reply completes.

**`application-new-conversation-surface`** — The fixed empty-conversation greeting is `Where should we start?` across desktop, remote, preview, and every locale. It stays outside localization dictionaries so an immediate locale switch cannot replace it. It uses a compact regular-weight display heading above the composer with locale-aware tracking: Latin copy stays subtly compact while Chinese copy receives open, positive character spacing. Together the greeting and composer form one stable state centered with a small fixed offset below the geometric midpoint, and the greeting never depends on memory or a Flash task. When no generated suggestions are available, raise that complete stack by 24px without positioning the greeting and composer independently. Its composer uses a narrower 760px outer column, while the bottom-anchored composer in an active conversation retains the 900px outer column. When available, exactly three Flash-generated suggestions derived from up to the five most recently updated top-level conversation titles sit below the composer and send immediately when selected. Suggestions persist in `messages.db` per workspace and locale so startup, workspace switching, locale switching, and paired clients restore one shared result rather than WebView-local state. Repeating the new-conversation action while this state is already visible leaves the greeting, composer, suggestions, and loading state unchanged; loading placeholders are reserved for a real restore or data refresh, not for acknowledging an already-selected destination.

Search inputs inside raised selector menus are the compact exception: they stay transparent and shadowless at rest, with only the focus ring appearing during keyboard focus. Apply this consistently to role, model, workspace, and any future searchable dropdown.

**`application-floating-surface`** — Shared treatment for menus, popovers, command palettes, dropdown content, toasts, and compact floating actions. Use the dedicated 90%-opaque, theme-aware `var(--floating-surface)` fill so content beneath the overlay cannot compete with its text. Retain the shared Mica hairline, 18px radius, 24px saturated backdrop blur, and compact raised shadow. Dialogs keep their distinct semantic treatment. Internal dividers may remain when they separate content regions; status colors should use an inset accent or focus ring rather than changing the perimeter.

**`application-danger-panel`** — Destructive settings groups use a low-opacity fill mixed from `var(--danger)` and the shared Mica surface, with a correspondingly restrained tinted Mica border and the normal Mica shadow. Titles and explanatory copy keep the normal text hierarchy; only the destructive action uses `var(--danger)`. This keeps danger emphasis theme-aware without turning the whole panel red or falling back to a flat gray card.

**`application-menu-item`** — Shared compact scale for every click-opened menu, context menu, select, combobox, and download-option row. Floating content uses an 8px radius with a 6px inner inset. A single-line row uses 12px type on a 20px line, a 28px minimum height, 4px vertical and 14px horizontal padding, an 8px content gap, and a 5px row radius. Keep a 3px vertical gap between adjacent option rows so hover fills remain separate instead of merging into one block. Neutral buttons and option rows use the shared `--interactive-state-bg` for hover, open, and selected states, derived from the current text color at 8% opacity so it remains visible over canvas, sidebar, and native Mica surfaces. Selection relies on that neutral fill without adding a left rail, stronger selected fill, checkmark, or selected text color. Primary and destructive actions retain their semantic state colors. Separators keep 7px of space above and below their 1px rule. Rows with descriptions retain the same title scale and horizontal inset but grow vertically to fit 11px secondary copy. Role descriptions are the compact exception: keep them to one line with an ellipsis so every role menu has the same scan rhythm; never compress other descriptive content to force the 28px single-line height.

**`application-popup-list-sizing`** — Every application-owned popup list—including menus, context menus, selects, comboboxes, command palettes, submenus, and editor dropdowns—sizes to its currently visible items instead of reserving space for its maximum item count. Short and filtered result sets must leave no trailing empty area. Cap the floating surface at the lesser of its configured maximum and the live space available inside the window or visual viewport, preserving an 8px viewport inset; when the items exceed that cap, only the item viewport scrolls while any search, header, or footer region remains stable. Recalculate the available space while the popup is open whenever the window or visual viewport resizes or scrolls, the anchor changes size or position, or filtering changes the visible item count. Opening, filtering, or keyboard navigation must not move the trigger or underlying layout, and fixed-height popup lists are not permitted. Platform-native selects may delegate these constraints to the operating system.

**`application-list-stack`** — Persistent navigation and collection lists use the same 3px vertical separation between adjacent interactive rows as floating menus whenever hover or focus applies a filled background. The parent list owns the gap through `--list-item-stack-gap`; do not rely on state-specific margins or allow rounded hover fills to touch. Selection follows the menu-row grammar and relies on the row's ordinary neutral fill without adding a left rail. On entry, refresh, scope change, or deletion, a navigation or detail list whose current selection is missing selects its first available item; an empty-state placeholder is reserved for lists that actually have no items or for an explicit create flow. Single-line application-sidebar actions, conversation rows, and settings navigation share the compact list-row tokens: 30px height, 13px type on an 18px line, 10px horizontal padding, an 8px content gap, and a 7px radius. The permanently expanded application sidebar remains resizable. Its header owns role selection and back/forward history controls. Saved-role creation and editing live in the Role application menu and open one singleton utility window for scope, name, system prompt, Skills, and MCP associations; the sidebar has no persistent Settings action. History traverses the actual window destination history across conversations and the new-conversation surface; a new destination reached after going back clears the abandoned forward branch, and deleting a conversation removes its stale destinations. The shared top chrome uses the application icon as its non-interactive leading mark instead of a sidebar-collapse action. The sidebar resize target begins below the shared top chrome and never paints its active indicator through the menu bar. Descriptive draft, queue, and inspector rows may grow to fit their content while retaining the shared stack gap.

**`application-settings-surface`** — General Settings, Model, Agent execution, integration, memory, automation, and About domains use independently focusable singleton utility windows opened from the application menu; reopening a domain focuses its existing window and selects the requested section. General contains only appearance, launcher, startup, diagnostics, and presentation preferences. Both ordinary settings pages and the rightmost provider/detail pane remain full-width scroll owners so their scrollbars stay against the outer edge, while symmetric responsive inline padding limits each inner settings track to 680px on wide windows. This same track applies to standalone settings content such as Agent Plugins; do not cap its responsive gutter at a fixed maximum or put `max-width` on a scrolling element itself. Empty right-detail placeholders sit directly on the pane canvas without a filled background, radius, or shadow; only their inner content alignment and spacing distinguish the empty state. Settings and role-editor window roots remain transparent over their owning native material. Controls and interaction states may retain their own surfaces, but nested layout regions must not stack the translucent theme tint or add perimeter dividers. Opening General Settings does not replace or unmount chat state. Channel, model-provider, and MCP detail headings share one compact status-and-enable control: a status-dot pill followed by a labeled switch pill, both on the secondary surface. MCP details render discovered tools as ordinary divided Mica rows with the complete tool name and one trailing switch; this list belongs below connection testing so disabling a tool reads as capability policy rather than a transport setting. Settings collection panes use the model-provider list's 256px width and row geometry so moving between settings areas does not shift the information hierarchy. Model-provider and MCP collection rows use the shared neutral interaction fill on hover and selection without an additional rail or selected text treatment. Their compact filter affordances stay transparent at rest and reveal the shared neutral fill only while interactive; collection-footer add actions use the ordinary theme-aware control material instead of a primary accent pill. Onboarding reuses the same application Select triggers and floating menu grammar as Settings for language, theme, provider, and default-model choices.

**`application-menu-bar`** — File, Edit, Agent, Integrations, Automation, and Help share the compact desktop menu scale and remain available on every ordinary application surface. Agent owns saved-role creation and configuration plus entry points for model, execution, Flash task, and memory management. Role creation and configuration use one independently focusable singleton utility window; reopening it retargets the existing editor. Integrations owns Channels, MCP, and Agent Plugins; Automation owns scheduled tasks. Configuration entries open their domain's singleton utility window and may select a specific section. Access keys, arrow navigation, and platform-labeled accelerators invoke the same actions as pointer selection. Edit preserves the focused editable context for Undo, Redo, Cut, Copy, Paste, Delete, Select All, and General Settings; Help exposes About and the shared updater state. Workspace and conversation navigation always reuse the current window. File -> New window immediately creates an independent window for the current workspace without opening a folder picker; targeted workspace and conversation navigation still reuses the registered workspace process. File also exposes Close Window (`Ctrl/⌘+W`) using the normal window-close behavior and Quit (`Ctrl/⌘+Q`) using the native application-exit command. Disabled back and forward controls retain enough contrast in both themes to remain visibly present in the conversation sidebar header. When the native window loses focus, keep the full-width top chrome transparent, borderless, geometrically stable, and available while reducing the opacity of its application icon, sidebar role and history controls, menu labels, centered workspace identity, status actions, and window controls; restoring focus returns them to full opacity from the same shell-owned focus state. Keep `desktop-shell-preview-focused=false` available to verify the inactive top chrome without native window state.

On Linux, including WSLg, the window manager owns the main window's outer frame,
resize edge, and minimize/maximize/close controls; the application menu bar stays
inside that frame without duplicating window controls. Windows and macOS retain
their frameless platform-specific product chrome.

**`application-mica-surface`** — A Windows-Mica-inspired content material shared by application inputs, the conversation composer, grouped settings, model lists, execution-permission controls, and Agent Plugin cards. Use the theme-aware `--mica-surface`, `--mica-border`, and `--mica-divider` tokens with a 24px backdrop blur and restrained saturation. Raised controls and floating surfaces also use the appropriate shared shadow token; grouped Settings cards and the main conversation workspace remain shadowless. The material stays inside the web content layer: it must not require a transparent native window or change the WebView composition contract. Standalone setting controls use the same standard card-row treatment as grouped settings. Rows inside one material remain transparent rather than introducing gray bands; add the low-contrast `--mica-divider` hairline inset 16px from the leading edge only between adjacent rows, never above the first row. Preserve text contrast in both themes and do not add decorative color fields or motion to simulate wallpaper.

Application controls and floating menus take their hover, open, and selected
fill from the shared `app.css` interaction primitives. The neutral gray is
semi-transparent and derived from the current text color, so it retains one
opacity while adapting to canvas, sidebar, and Mica surfaces. Menu row geometry,
search fields, empty states, and separators are also global primitives; feature
components retain only their own dimensions, content layout, and semantic
exceptions.

Roles and Skills collection sidebars share one compact control grammar: the title and scope selector occupy the same toolbar rhythm, standalone search and footer controls use the theme-aware control material, and selected rows use the shared selected-state fill. A segmented selector carries elevation only on its outer surface; its active segment is distinguished by fill rather than a nested shadow. When the application theme changes, apply the resolved light or dark mode to both the WebView and the native window as one ordered transition so Windows Mica cannot retain a different palette beneath translucent canvases. Returning to the system theme clears the native override before the WebView resolves its system preference. Keep `core:window:allow-set-theme` in every capability used by a native-material application window; without it Tauri removes or rejects the native theme command and the translucent WebView can silently diverge from its backdrop.

The composer slash-command and mention palette uses the same compact row scale. Its floating surface follows the composer width and uses a 14px radius with a 6px inset. Let both palettes size to their visible items up to the lesser of the configured 320px maximum and the live space above the composer, retaining an 8px viewport inset. Recalculate that space when the window, visual viewport, composer height, or scroll position changes. Only overflow scrolls independently, so short result sets have no trailing empty area, constrained windows never clip the palette, and opening or navigating the list never moves the composer.

Pending attachments in the ordinary composer use 112px square preview cards in
one horizontal row. Image and supported text content fill the preview region,
the filename remains anchored at the bottom, and the remove action stays in the
top-right corner. Overflow scrolls horizontally without wrapping; its scrollbar
uses the shared transient activity treatment. The fixed-height quick-chat launcher keeps its separate 28px compact
attachment strip. Opening a card or restored attachment uses a full-window
preview frame consistent with Mermaid fullscreen: the attachment stays centered
inside the inset canvas and controls remain in the top-right. Images open fitted
to the viewport and provide zoom out, fit, zoom in, and close actions;
pointer-anchored wheel zoom keeps the image beneath the cursor stable while
zoomed overflow remains scrollable. Lightweight text formats open as bounded
plain-text previews with normal scrolling and no zoom controls or wheel
interception. PDF remains uploadable but has no content preview. Preview opening
uses an explicit extension whitelist; unsupported formats stay visible as
attachments but are not clickable.

Long secondary collections should not make a primary action menu scroll. The workspace switcher keeps open-folder actions in its root menu and renders its trigger, root items, and older-workspace rows without decorative icons; the current-folder-location row remains text-only, while WSL is communicated with an explicit text badge. Older workspaces appear in a side-opening “Recent workspaces” submenu; its entry retains a right-pointing chevron as the submenu indicator and must support pointer hover, click, and keyboard navigation, keep its scrollbar flush with the right edge, and reuse the shared menu density.

**`quick-chat-palette`** — A Raycast-style compact conversation surface opened
with the accelerator configured in General settings
(`CommandOrControl+Shift+Space` by default). The accelerator recorder shows the
platform-native label, requires at least one modifier, applies a captured
combination immediately, and provides a quiet reset action. Shortcut recording
continues after a pointer click even on platforms where buttons do not receive
keyboard focus. Registration
conflicts appear inline and leave the previous accelerator active. The primary
desktop process owns a separate centered 856 × 246px always-on-top transparent
launcher canvas containing a 760px-wide card;
workspace windows never resize or change visibility when it opens. The launcher
is one continuous raised surface with a 14px radius: a large borderless composer
followed by a 48px footer for model, role, and workspace selectors. It has no
title bar, shortcut hint, or window-action row; non-interactive card space remains
draggable. Each shortcut reveal returns keyboard focus to the composer
so typing can begin immediately even though the hidden launcher window and its
input remain mounted between sessions. It has no transcript and remembers its own
model, role, and workspace tuple without changing the primary window's defaults.
Every submission creates a fresh durable conversation, routes the turn to the
selected workspace process, opens or focuses that workspace window, and shows the
new streaming conversation there. Failures keep the launcher and draft visible.
Because a webview cannot render beyond its native bounds, prepare the
transparent launcher window at 856 × 580px before showing it and keep that
native size fixed for the whole visible session. Its 48px horizontal insets let
the card shadow decay naturally before the WebView boundary; the card remains
compact and the menu opens below and outside it without visible-window resize jitter.
Shrink the native window only after hiding it. Clicking the unused transparent
area dismisses the launcher. A native drag records the launcher's physical
screen position. Later reveals restore it only while enough of the expanded
window intersects a current monitor work area; malformed or off-screen history
is discarded and the launcher returns to its centered default.
The card uses a theme-tinted variant of the shared Windows-Mica-inspired
material composited over an opaque theme base, with a clearly visible perimeter
and pronounced but compact raised shadow. Content behind the launcher must not show through;
selector surfaces also remain opaque, and transparency belongs only to the
unused part of the expanded native window. Quick Chat selectors retain the
shared menu perimeter, radius, spacing, and elevation, but replace its
translucent fill and backdrop filter with the opaque theme surface. Selectors
stay below their trigger, align to its start edge, and do not use collision-based
side flipping. The
card's non-interactive space remains a native drag handle, with generous padding
above the composer as its primary grab target; drag-time focus changes must not
close the launcher. Give the launcher card a restrained shadow,
contained by transparent stage padding so it never meets or clips against the
native window boundary; selector content uses the shared raised shadow while its
search field remains shadowless at rest. Separate the composer and selector
toolbar with only the short inset divider, without a second full-width toolbar
border. Selector content follows its items up to a bounded scrollable maximum
height, and role descriptions are limited to one ellipsized line. Selector
triggers include their leading icon in the same hover, focus, open-state, and
pointer target as the label and caret. Model, role, and
workspace selectors update only the launcher's remembered tuple for the next
conversation. Configuration changes refresh the available launcher models and
theme immediately, including while the launcher is hidden, without replacing a
remembered model that remains valid; an unavailable model
falls back to the configured default. Keep the composer and surrounding stage
neutral; controls remain on semantically filled surfaces. The compact
composer grows from its base height using the textarea's measured multi-line
height, and an attachment adds one compact row; content beyond the bounded
maximum scrolls internally. Attachments use a shadowless 28px single-line strip
in normal flow above the textarea, with horizontal overflow instead of a fixed
overlay that text can scroll beneath. Attachment and send controls share a
vertical center at the composer end; the quick-chat textarea has no leading
glyph. Native attachment selection preserves launcher focus just like
workspace selection. The
`quick-chat-preview` development query renders this layout without native
window or shortcut behavior for browser-based light/dark and localization
checks.

The main composer shows a reasoning-effort selector after the model selector
only for ChatGPT OAuth models. Its labels map to the provider values Light =
`low`, Medium = `medium`, High = `high`, Extra High = `xhigh`, and Ultra =
`max`; the Ultra row warns that it consumes usage limits faster. In development,
`?reasoning-effort-preview` renders the interactive selector directly without
onboarding or native runtime state. Add
`reasoning-effort-preview-theme=light|dark` and
`reasoning-effort-preview-locale=zh|en` to verify theme and localization.

Error and validation states were not surfaced in the analyzed pages.

### Footer

**`footer`** — Background `{colors.canvas-parchment}` (#f5f5f7), text `{colors.ink-muted-80}`. Link columns in `{typography.dense-link}` (17px / 400 / 2.41 line-height — the relaxed leading is what makes the dense columns scannable). Column headings in `{typography.caption-strong}` (14px / 600). Legal row at the very bottom in `{typography.fine-print}` (12px / 400) with `{colors.ink-muted-48}` text. Vertical padding 64px.

## Do's and Don'ts

### Do

- Use `{colors.primary}` (Action Blue #0066cc) for every interactive element — links, pill CTAs, focus signals — and nothing else. The single accent is non-negotiable.
- Set headlines in `{typography.hero-display}` or `{typography.display-lg}` with negative letter-spacing (`-0.28 → -0.374px`) to get the signature "Apple tight" cadence.
- Run body copy at `{typography.body}` (17px / 400 / 1.47 / -0.374px) — not 16px. The extra pixel defines the brand's reading pace.
- Alternate `{component.product-tile-light}` (or parchment) and `{component.product-tile-dark}` for full-bleed section rhythm. The color change IS the divider.
- Reserve `{rounded.pill}` for the primary blue CTA and any other element that should read as an "action" (configurator chips, search input, sticky bar CTA).
- On marketing surfaces, apply the single product-shadow (`rgba(0, 0, 0, 0.22) 3px 5px 30px`) only to product renders. In the desktop application, use only the shared control and raised shadow tokens for functional surface separation.
- In the desktop application, remove perimeter borders from components that already have a distinct filled background. Preserve borders only when they communicate structure or state.
- Use `transform: scale(0.95)` as the active/press state on ordinary action buttons. Keep select and dropdown triggers at their resting scale so opening a menu does not resize the control.
- Keep the global nav `{colors.surface-black}` (true black) — it's the only place pure black appears on most pages.

### Don't

- Don't introduce a second accent color; every "click me" signal is `{colors.primary}` (Action Blue).
- Don't add ad-hoc shadows to marketing cards, buttons, or text. Desktop-application controls and floating surfaces must use `--control-shadow` or `--raised-shadow`, never a one-off shadow.
- Don't combine a filled application surface with a neutral perimeter border; use surface contrast and the shared shadow tokens instead.
- Don't use gradients as decorative backgrounds; atmosphere comes from photography.
- Don't set body copy at weight 500 — Apple's ladder is 300 / 400 / 600 / 700, with 500 deliberately absent. Body is always 400; strong inline is 600; display is 600.
- Don't round full-bleed tiles — tiles are rectangular and edge-to-edge; the color change is the divider.
- Don't tighten line-height below 1.47 for body copy — the editorial leading is part of the brand.
- Don't mix radii grammars — use `{rounded.sm}` for compact utility, `{rounded.lg}` for utility cards, `{rounded.pill}` for pills, and nothing in between (except the rare `{rounded.md}` Pearl Button).
- Don't use `{colors.primary-on-dark}` (Sky Link Blue) on light surfaces — it's the dark-tile-only variant. Action Blue is for light surfaces.

## Responsive Behavior

### Breakpoints

| Name             | Width       | Key Changes                                                                                               |
| ---------------- | ----------- | --------------------------------------------------------------------------------------------------------- |
| Small phone      | ≤ 419px     | Single-column tiles; sub-nav collapses to category name + primary CTA only; hero typography drops to 28px |
| Phone            | 420–640px   | Single-column stack; product renders scale to 80% of tile width; hero h1 drops to 34px                    |
| Large phone      | 641–735px   | Tiles transition to tighter padding (48px vertical vs 80px); fine-print wraps                             |
| Tablet portrait  | 736–833px   | Global nav collapses to hamburger; sub-nav hides category chips, keeps primary CTA                        |
| Tablet landscape | 834–1023px  | Global nav returns fully expanded; 3-column utility grids become 2-column                                 |
| Small desktop    | 1024–1068px | Product tiles use 2/3 width with margin gutters; hero h1 stays at 40px                                    |
| Desktop          | 1069–1440px | Full layout; 4–5 column store grids; 1440px content max                                                   |
| Wide desktop     | ≥ 1441px    | Content locks at 1440px, margins absorb extra width                                                       |

The structural breakpoints that matter for agents: 1440px (content lock), 1068px (small-desktop), 833px (tablet landscape switch), 734px (tablet portrait), 640px (phone), 480px (small phone).

### Touch Targets

- Minimum 44 × 44px. `{component.button-primary}` lands at ~44 × 100px (with the full-pill radius making the visible hit area more generous than the label suggests).
- `{component.button-icon-circular}` is exactly 44 × 44px.
- Global nav utility links are smaller (~32 × 80px) — they deliberately sit at a tighter target because they're precision desktop actions, and the mobile hamburger replaces them at ≤ 833px.

### Collapsing Strategy

- **Global nav**: full horizontal link row on desktop → collapses to Apple logo + hamburger + bag icon at 834px and below.
- **Sub-nav**: category name + inline links + primary CTA → category name + primary CTA only at mobile; inline links move into a hamburger tray.
- **Product tiles**: stack from 2-column to 1-column at 834px; vertical padding tightens from 80px → 48px at small-phone.
- **Utility grids** (store, accessories): 5-col → 4-col (1440px) → 3-col (1068px) → 2-col (834px) → 1-col (640px).
- **Hero typography**: `{typography.hero-display}` (56px) → `{typography.display-lg}` (40px) at 1068px → 34px at 640px → 28px at 419px.

### Image Behavior

- All product imagery uses responsive `srcset` with breakpoint-matched crops.
- Hero photography may switch art direction at mobile (e.g., the environment page's vista crops to a taller aspect ratio on mobile, framing the subject differently).
- Product renders maintain their 1:1 or 4:3 aspect ratios across breakpoints; only scale changes.
- Lazy-loading is default; the above-fold hero loads eagerly.

## Iteration Guide

1. Focus on ONE component at a time. Reference its YAML key directly (`{component.product-tile-dark}`, `{component.search-input}`).
2. Variants of an existing component (`-active`, `-focus`, `-2`, `-3`) live as separate entries in `components:`.
3. Use `{token.refs}` everywhere — never inline hex.
4. Never document hover. Default and Active/Pressed states only.
5. Display headlines stay SF Pro Display 600 with negative letter-spacing. Body stays SF Pro Text 400 at 17px. The boundary is unbreakable.
6. The single drop-shadow (`rgba(0, 0, 0, 0.22) 3px 5px 30px`) is reserved for product photography only.
7. When in doubt about emphasis: alternate surface (light → dark tile) before adding chrome.

## Known Gaps

- Form validation and error states were not surfaced on the analyzed pages; only the neutral search input is documented.
- The homepage's embedded video/player frame uses `{colors.surface-black}`; interior player controls are not documented (they're a platform widget, not a web-design token).
- Some component imagery is dynamic (rotating product hero) and its specific copy varies per surface — component specs name the structure, not the rotating content.
- Dark-mode counterparts for store and accessories utility cards were not surfaced on the analyzed pages; the system documented is the daytime/light-dominant variant Apple ships by default.
- Atmospheric photography (environment page mountain vista) is a content asset, not a design token; the documented `{component.environment-quote-card}` describes the structural surface only.
- The exact backdrop-filter blur radius on `{component.sub-nav-frosted}` and `{component.floating-sticky-bar}` is platform-dependent; production CSS uses `saturate(180%) blur(20px)` as a typical baseline but the value isn't formalized as a token.

The Chinese application menu labels the Agent entry as “运行”; the English label remains “Agent”.
