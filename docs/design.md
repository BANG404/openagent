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
- **Application-only aurora:** low-contrast, blurred multicolor light is permitted behind the chat composer and empty-conversation greeting. It is an ambient status layer, never content chrome; the conversation sidebar remains a flat surface.
- **Settings cards:** align each section title with its supporting copy and align each card row's label with its description. Use one softly elevated surface for the card itself; controls nested inside that card use a 1px hairline border without a second shadow.
- **Desktop application shell:** keep one compact, continuous top chrome across
  sidebar and conversation surfaces. The leading controls collapse the sidebar
  and traverse application history; File owns workspace-opening commands while
  the centered environment label is display-only. Window controls follow macOS
  traffic-light placement or Windows trailing minimize/maximize/close geometry.
  The sidebar groups workspace-owned conversations under Projects and shows one
  cross-workspace, newest-first Recents list. New-conversation composers expose
  the workspace switcher beside approval mode; existing workspace conversations
  hide it because their workspace is durable context. Each project row exposes
  its own new-conversation action and menu for pinning, opening the project
  folder, or removing the project from Projects without deleting its files or
  conversation history. The Projects heading retains only global conversation
  search.

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

### Application Aurora (Contextual Exception)
The desktop application's conversational surfaces use a deliberately restrained aurora layer. This is a contextual feedback treatment, not a second brand palette or a general-purpose gradient system: keep it behind readable content and use it only in the four established placements.

- **Spectrum:** Google-blue `rgba(66, 133, 244, …)`, violet `rgba(161, 66, 244, …)`, green `rgba(52, 168, 83, …)`, with red `rgba(234, 67, 53, …)` and yellow `rgba(251, 188, 5, …)` added only to the composer; color stops remain translucent (approximately 0.04–0.34 alpha before the layer opacity).
- **Treatment:** overlap large elliptical radial gradients, blur heavily (26–72px), and apply modest saturation (1.08–1.45). Feather the outer edges with masks or transparent stops; the effect must never resolve into distinct blobs, bands, or a hard boundary.
- **Hierarchy:** content, inputs, and list rows always sit above the aurora. The aurora has `pointer-events: none`, never carries information, and must not reduce text contrast.
- **Theme adaptation:** retain the colored light in both themes, but veil the composer with the active canvas color: parchment in light mode and deep ink in dark mode. The effect is atmosphere behind the surface, not a replacement for the surface.

## Typography

### Font Family
- **Display**: `SF Pro Display, system-ui, -apple-system, sans-serif` — Apple's proprietary display face, optimized for sizes ≥ 19px. Defines the voice of every headline.
- **Body / UI**: `SF Pro Text, system-ui, -apple-system, sans-serif` — the text-optimized variant used for body copy, captions, buttons, and links below 20px.
- **OpenType features**: `font-variant-numeric: numerator` is enabled on numeric links (pricing tables, spec sheets). Display sizes rely on tight tracking rather than contextual ligatures.

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.hero-display}` | 56px | 600 | 1.07 | -0.28px | Hero headline; the signature "Apple tight" tracking |
| `{typography.display-lg}` | 40px | 600 | 1.10 | 0 | Tile headlines atop every product tile |
| `{typography.display-md}` | 34px | 600 | 1.47 | -0.374px | Section heads (SF Pro Text at display proportions) |
| `{typography.lead}` | 28px | 400 | 1.14 | 0.196px | Product tile subcopy |
| `{typography.lead-airy}` | 24px | 300 | 1.5 | 0 | Environment-page lead paragraphs (the rare weight 300) |
| `{typography.tagline}` | 21px | 600 | 1.19 | 0.231px | Sub-tile tagline; sub-nav category name |
| `{typography.body-strong}` | 17px | 600 | 1.24 | -0.374px | Inline strong emphasis |
| `{typography.body}` | 17px | 400 | 1.47 | -0.374px | Default paragraph |
| `{typography.dense-link}` | 17px | 400 | 2.41 | 0 | Footer / store utility link lists (relaxed leading) |
| `{typography.caption}` | 14px | 400 | 1.43 | -0.224px | Secondary captions, button text |
| `{typography.caption-strong}` | 14px | 600 | 1.29 | -0.224px | Emphasized captions |
| `{typography.button-large}` | 18px | 300 | 1.0 | 0 | Store hero CTAs (the rare weight 300) |
| `{typography.button-utility}` | 14px | 400 | 1.29 | -0.224px | Utility/nav button labels |
| `{typography.fine-print}` | 12px | 400 | 1.0 | -0.12px | Fine-print, footer body |
| `{typography.micro-legal}` | 10px | 400 | 1.3 | -0.08px | Micro legal disclaimers |
| `{typography.nav-link}` | 12px | 400 | 1.0 | -0.12px | Global nav menu items |

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

| Level | Treatment | Use |
|---|---|---|
| Flat | No shadow, no border | Full-bleed tiles, global nav, footer, body sections |
| Soft hairline | 1px `rgba(0, 0, 0, 0.08)` border | Utility cards, sub-nav frosted-glass separator |
| Backdrop blur | `backdrop-filter: blur(N)` on Parchment 80% | Sub-nav and the iPhone buy floating sticky bar |
| Product shadow | `rgba(0, 0, 0, 0.22) 3px 5px 30px 0` | Product renders resting on a surface (the only true "shadow" in the system) |
| Application control | `var(--control-shadow)` with no outer border | Filled inputs, selectors, composer, reusable cards, segmented controls |
| Application Mica | Translucent theme tint, 24px backdrop blur, subtle inner highlight | Quiet grouped settings whose canvas should remain perceptible |
| Application overlay | `var(--raised-shadow)` with no outer border | Dialogs, menus, dropdowns, palettes, toasts, floating previews |

**Shadow philosophy.** On the product-marketing surfaces, Apple uses **exactly one** drop-shadow, and it is applied to photographic product imagery. The desktop application adds a restrained functional exception: a filled interactive surface must not also carry an outer border. Use `--control-shadow` for controls and embedded reusable cards, and `--raised-shadow` for floating layers. Borders remain appropriate for separators, table grids, selection/focus rings, validation, and other state-bearing marks.

### Decorative Depth
- **Atmospheric imagery** on the environment page (photographic vista) supplies mood; no CSS gradient involved.
- **Edge-to-edge tile alternation** creates rhythm without borders or shadows — the color change itself is the divider.
- **Backdrop-filter blur** on `{component.sub-nav-frosted}` and `{component.floating-sticky-bar}` creates a "floating over content" effect that's functional, not decorative.

### Application Aurora Motion

**`aurora-layer`** — A non-interactive pseudo-element behind conversational UI. Compose translucent radial color fields into a generously blurred layer, then slowly translate and scale it with `ease-in-out infinite alternate`. Movement is ambient rather than directional: no looping sweep, flashing, hue cycling, or perceptible jump at either end.

| Placement | Footprint & baseline | Motion | Active streaming state |
|---|---|---|---|
| `{component.input-aurora}` | Centered below the composer; `min(100% + 100px, 1064px)` × 210px; blurred 26px; 56% opacity | 7.5s, three-position drift, scale 1.05–1.12 | Shift x/y by 9%/3%, add 0.2 scale, raise opacity to 72%, blur to 28px, saturation to 1.45. Canvas veil becomes lighter. |
| `{component.empty-state-aurora}` | Centered behind empty-state copy; `min(100% - 96px, 1120px)` × `clamp(260px, 34vh, 420px)`; blurred 72px; 90% opacity | 8s, three-position drift, scale 1.04–1.10 | No separate active state. |
| `{component.memory-note-aurora}` | Centered around the fixed new-conversation greeting; extends 360–720px horizontally and 240–420px vertically beyond it; blurred 56px; 28% opacity | 8s, three-position drift, scale 1.04–1.12 | No separate active state; use an additional very soft canvas glow behind the colored layer for legibility. |

**State transitions.** Register typed custom properties for aurora x-offset, y-offset, and scale so active-state changes interpolate smoothly. Use a 560ms `cubic-bezier(0.16, 1, 0.3, 1)` transition for geometry and filter, and a 420ms ease transition for opacity. Streaming makes the atmosphere feel awake; it must not become a spinner or compete with the streaming indicator. Keep the empty-state light field mounted while moving between existing and new conversations, crossfade it against the composer light field, and fade in the greeting light on the same opacity rhythm; mounting fully visible animated layers causes an additive flash and restarts their drift phase.

**Motion accessibility.** Under `prefers-reduced-motion: reduce`, stop all aurora animations and retain a static, low-contrast composition. The status-dependent opacity and color treatment may remain, but no movement is allowed.

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.none}` | 0px | Full-bleed product tiles (no corner rounding) |
| `{rounded.xs}` | 5px | Inline links when styled as subtle chips (rare) |
| `{rounded.sm}` | 8px | Dark utility buttons (Sign In, Bag), inline card imagery |
| `{rounded.md}` | 11px | White Pearl Button capsules |
| `{rounded.lg}` | 18px | Store utility cards, accessories grid cards |
| `{rounded.pill}` | 9999px | Primary blue pill CTAs, sub-nav buy button, configurator option chips, search input — the signature Apple pill |
| `{rounded.full}` | 9999px / 50% | Circular control chips floating over photography |

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

**`dialog-action-quiet`** — A low-emphasis alternative action in application dialogs. It uses a transparent background, no border, muted text at 13px, and strengthens to the normal text color on hover. Use it for reversible choices such as “Switch this window” and “Cancel” beside a filled primary action; do not render those choices as bordered secondary buttons. Keep destructive actions visually separate from this quiet action and the primary confirmation.

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

**`application-input-surface`** — Shared desktop-application treatment for text inputs, textareas, select/combobox triggers, and the chat composer. Use the theme-aware Mica surface, border, shadow, 24px backdrop blur, restrained saturation, and the component's established radius. The shared focus ring expands outside the control boundary instead of consuming its content area or replacing the neutral Mica border. The chat composer's shell is the exception: focusing its textarea leaves the neutral Mica perimeter and shadow unchanged, while embedded toolbar controls retain their own focus rings. While a response streams, an empty composer uses its primary circular control to pause output; the paused state shows resume until the user enters text, adds an attachment, or adds quoted context, when that same control becomes send. Stop remains a separate terminal control. Model, reasoning-effort, and approval triggers embedded in the composer are surface-free toolbar controls; they must not inherit the standalone Select background, border, blur, or shadow. Text selected inside an assistant answer exposes a compact floating Add-to-chat action. Pending quoted excerpts sit above the textarea as removable, primary-railed context rows; durable excerpts use the same visual grammar above the corresponding user-authored message. User-message bubbles are the embedded transcript exception: retain the lighter `var(--control-surface)` treatment without a shadow in both display and edit states, and add only `var(--focus-ring)` for keyboard focus. Long user-message copy collapses after a fixed number of complete rendered lines; bubble padding stays outside the clamp so a partial trailing line is never exposed. User-message loading placeholders retain this translucent, shadowless treatment. Searchable dropdown inputs follow the shared control treatment.

**`application-tooltip`** — Application-owned hover and keyboard-focus hints use the shared portal-backed tooltip component instead of native HTML `title` attributes. Keep the surface dark in both themes, with white 12px text, a 6px radius, 5px by 9px padding, a soft raised shadow, and a 280px viewport-bounded maximum width that wraps long paths anywhere. Preserve semantic `title` attributes whose purpose is accessibility metadata rather than a hover hint, such as an iframe title.

**`application-book-reader`** — A completed Agent reply offers a book-mode action beside its other reply actions. The reader uses the same fixed full-viewport footprint, 16px outer inset, and rounded inner hairline frame as Mermaid fullscreen; it does not duplicate native window controls. Both fullscreen surfaces retain a continuous native-window drag strip from the outermost top edge through their header, stopping before interactive controls. Only two dedicated page-turn buttons sit at the left and right vertical center of the framed reading surface. One complete Agent reply flows continuously from the left column into the right and then onto later spreads: internal context-compaction continuations stay in sequence at their original position, and process records retain their normal collapsed summary and expandable details. Expanded process content fragments as a block across columns while atomic records remain intact; book-page records disable viewport content culling so WebView2 cannot invalidate an offscreen column and snap a page turn backward. Markdown tables fragment only between complete rows. Atomic rich content—including images, video, charts, Mermaid, code, and HTML previews—stays within the usable page height and uses containment or internal scrolling instead of being clipped. General settings owns the persisted reading font size; every font, window, expansion, or embedded-media load change recalculates the real overflow-column count using immediate position correction, while smooth scrolling is reserved for explicit page turns. The reading surface uses theme tokens in both light and dark modes and falls back to one column on narrow windows.

**`application-new-conversation-surface`** — The fixed localized empty-conversation greeting and composer form one stable centered state; the greeting never depends on memory or a Flash task. Its composer uses a narrower 760px outer column, while the bottom-anchored composer in an active conversation retains the 900px outer column. When available, exactly three Flash-generated suggestions derived from up to the five most recently updated top-level conversation titles sit below the composer and send immediately when selected. Repeating the new-conversation action while this state is already visible leaves the greeting, composer, suggestions, and loading state unchanged; loading placeholders are reserved for a real restore or data refresh, not for acknowledging an already-selected destination.

Search inputs inside raised selector menus are the compact exception: they stay transparent and shadowless at rest, with only the focus ring appearing during keyboard focus. Apply this consistently to role, model, workspace, and any future searchable dropdown.

**`application-floating-surface`** — Shared treatment for dialogs, menus, popovers, command palettes, dropdown content, toasts, and floating previews. Use `var(--control-surface)`, no outer border, `var(--raised-shadow)`, and optional restrained backdrop blur. Internal dividers may remain when they separate content regions; status colors should use an inset accent or focus ring rather than restoring a perimeter border.

**`application-danger-panel`** — Destructive settings groups use a low-opacity fill mixed from `var(--danger)` and the shared Mica surface, with a correspondingly restrained tinted Mica border and the normal Mica shadow. Titles and explanatory copy keep the normal text hierarchy; only the destructive action uses `var(--danger)`. This keeps danger emphasis theme-aware without turning the whole panel red or falling back to a flat gray card.

**`application-menu-item`** — Shared compact scale for every click-opened menu, context menu, select, combobox, and download-option row. Floating content uses an 8px radius with a 6px inner inset. A single-line row uses 12px type on a 20px line, a 28px minimum height, 4px vertical and 14px horizontal padding, an 8px content gap, and a 5px row radius. Keep a 3px vertical gap between adjacent option rows so hover fills remain separate instead of merging into one block. Selection keeps that component's ordinary neutral hover fill and adds a 2px primary-colored left rail with square ends. Do not introduce a stronger selected fill, checkmark, selected text color, or rounded rail endpoints. Separators keep 7px of space above and below their 1px rule. Rows with descriptions retain the same title scale and horizontal inset but grow vertically to fit 11px secondary copy. Role descriptions are the compact exception: keep them to one line with an ellipsis so every role menu has the same scan rhythm; never compress other descriptive content to force the 28px single-line height.

**`application-popup-list-sizing`** — Every application-owned popup list—including menus, context menus, selects, comboboxes, command palettes, submenus, and editor dropdowns—sizes to its currently visible items instead of reserving space for its maximum item count. Short and filtered result sets must leave no trailing empty area. Cap the floating surface at the lesser of its configured maximum and the live space available inside the window or visual viewport, preserving an 8px viewport inset; when the items exceed that cap, only the item viewport scrolls while any search, header, or footer region remains stable. Recalculate the available space while the popup is open whenever the window or visual viewport resizes or scrolls, the anchor changes size or position, or filtering changes the visible item count. Opening, filtering, or keyboard navigation must not move the trigger or underlying layout, and fixed-height popup lists are not permitted. Platform-native selects may delegate these constraints to the operating system.

**`application-list-stack`** — Persistent navigation and collection lists use the same 3px vertical separation between adjacent interactive rows as floating menus whenever hover or focus applies a filled background. The parent list owns the gap through `--list-item-stack-gap`; do not rely on state-specific margins or allow rounded hover fills to touch. Selection follows the menu-row grammar: retain the row's ordinary hover fill and add only a 2px primary left rail with square ends. On entry, refresh, scope change, or deletion, a navigation or detail list whose current selection is missing selects its first available item; an empty-state placeholder is reserved for lists that actually have no items or for an explicit create flow. Single-line application-sidebar actions, conversation rows, and settings navigation share the compact list-row tokens: 30px height, 13px type on an 18px line, 10px horizontal padding, an 8px content gap, and a 7px radius. The workspace role selector at the top of the application sidebar remains a distinct selector control: its trigger follows the visible role name instead of filling the row and omits a redundant caret, while its popup uses a 240px minimum width so role names and descriptions have more room than the trigger while still respecting the application popup viewport inset. The adjacent back and forward buttons traverse the actual window destination history across conversations, the new-conversation surface, and feature views; a new destination reached after going back clears the abandoned forward branch, and deleting a conversation removes its stale destinations. Descriptive role, skill, draft, queue, and inspector rows may grow to fit their content while retaining the shared stack gap. Role-management rows start directly with the role name and description; do not add an initial badge or other decorative leading icon.

**`application-settings-surface`** — Keep the existing application sidebar and settings navigation visible together. Opening settings without an explicit destination selects the first navigation item, General; contextual entry points may still select their requested section. Both ordinary settings pages and the rightmost provider/detail pane remain full-width scroll owners so their scrollbars stay against the outer edge, while symmetric responsive inline padding limits each inner settings track to 680px on wide windows. This same track applies to standalone settings content such as Agent Plugins; do not cap its responsive gutter at a fixed maximum or put `max-width` on a scrolling element itself. Empty right-detail placeholders sit directly on the pane canvas without a filled background, radius, or shadow; only their inner content alignment and spacing distinguish the empty state. Settings columns and the Memory, Roles, and Skills surfaces opened from More use tonal separation rather than perimeter dividers. Roles and Skills share a persisted 220px collection-pane default, resizable from 180px to 360px; the resize seam is the only persistent line between the collection and editor, stays visually quiet at rest, and strengthens only for hover, keyboard focus, or dragging. Keep the development-only `more-management-preview` query available with `-kind=memory|roles|skills`, `-theme=light|dark`, and `-locale=zh|en` parameters so these surfaces and their resizing behavior remain browser-verifiable without native state. The Skills fixture includes representative editable Markdown and a fenced code block. Editor code-block controls occupy their own theme-aware header instead of covering code, and text selection remains visibly accented in both the rich-text canvas and nested code editor. Channel, model-provider, and MCP detail headings share one compact status-and-enable control: a status-dot pill followed by a labeled switch pill, both on the secondary surface. Settings collection panes use the model-provider list's 256px width and row geometry so moving between settings areas does not shift the information hierarchy. Model-provider and MCP collection rows remain transparent on hover and selection; their 2px primary left rail is the sole selected-row background treatment.

**`application-mica-surface`** — A Windows-Mica-inspired content material shared by application inputs, the conversation composer, grouped settings, model lists, execution-permission controls, and Agent Plugin cards. Use the theme-aware `--mica-surface`, `--mica-border`, `--mica-divider`, and `--mica-shadow` tokens with a 24px backdrop blur and restrained saturation. The material stays inside the web content layer: it must not require a transparent native window or change the WebView composition contract. Standalone setting controls use the same standard card-row treatment as grouped settings. Rows inside one material remain transparent rather than introducing gray bands; add the low-contrast `--mica-divider` hairline inset 16px from the leading edge only between adjacent rows, never above the first row. Preserve text contrast in both themes and do not add decorative color fields or motion to simulate wallpaper.

The composer slash-command and mention palette uses the same compact row scale. Its floating surface follows the composer width and uses a 14px radius with a 6px inset. Let both palettes size to their visible items up to the lesser of the configured 320px maximum and the live space above the composer, retaining an 8px viewport inset. Recalculate that space when the window, visual viewport, composer height, or scroll position changes. Only overflow scrolls independently, so short result sets have no trailing empty area, constrained windows never clip the palette, and opening or navigating the list never moves the composer.

Pending attachments in the ordinary composer use 112px square preview cards in
one horizontal row. Image and supported text content fill the preview region,
the filename remains anchored at the bottom, and the remove action stays in the
top-right corner. Overflow scrolls horizontally without wrapping or exposing a
scrollbar. The fixed-height quick-chat launcher keeps its separate 28px compact
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
unused part of the expanded native window. Selectors stay below their trigger,
align to its start edge, and do not use collision-based side flipping. The
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
falls back to the configured default. Use restrained aurora light behind the
composer only; controls remain on semantically filled surfaces. The compact
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
- Use `transform: scale(0.95)` as the active/press state on every button — it's the system-wide micro-interaction.
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

| Name | Width | Key Changes |
|---|---|---|
| Small phone | ≤ 419px | Single-column tiles; sub-nav collapses to category name + primary CTA only; hero typography drops to 28px |
| Phone | 420–640px | Single-column stack; product renders scale to 80% of tile width; hero h1 drops to 34px |
| Large phone | 641–735px | Tiles transition to tighter padding (48px vertical vs 80px); fine-print wraps |
| Tablet portrait | 736–833px | Global nav collapses to hamburger; sub-nav hides category chips, keeps primary CTA |
| Tablet landscape | 834–1023px | Global nav returns fully expanded; 3-column utility grids become 2-column |
| Small desktop | 1024–1068px | Product tiles use 2/3 width with margin gutters; hero h1 stays at 40px |
| Desktop | 1069–1440px | Full layout; 4–5 column store grids; 1440px content max |
| Wide desktop | ≥ 1441px | Content locks at 1440px, margins absorb extra width |

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
