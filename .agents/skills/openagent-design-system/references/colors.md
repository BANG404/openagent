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

### Installed theme overlays

The selected enabled theme package overrides the current design through document-root CSS
custom properties, including colors and geometry. The default palette resumes
when its tokens are removed. Saved appearance overrides apply last. The Native
background switch selects the default native material or opaque theme canvas.
Explicit plugin `--background` and user background colors always paint the window
canvas, including body and standalone Settings, instead of being hidden by
native transparency. With native background off and no explicit color, retain
the same gray canvas tokens used on Linux in light/dark mode.
The built-in sidebar inherits `--background`, so the title bar and left sidebar
form one continuous canvas with native material both enabled and disabled;
the switch must not change shell geometry or introduce a color seam at the
sidebar width. The title bar always paints `--sidebar` and uses the sidebar
foreground, primary, hover and focus pairs, including when a package or saved
background override supplies a sidebar color different from `--background`.
Do not make the title bar transparent over a different canvas or erase a
package's sidebar color to hide that seam.
The sidebar paints below its title-bar padding (`background-clip: content-box`),
so translucent sidebar colors are composited once on both sides of that edge.
The conversation workspace paints a separate canvas behind its cards so a
package's identical background/card colors cannot erase their outer edges.
The [semantic theme contract](semantic-themes.md) owns this surface derivation
and the fixed desktop card geometry.
Run `bun run test:blackbox:native-background` against an isolated
`native-background` Tauri instance to exercise the Appearance switch off and
back on, persistence after reopening Settings, shell geometry, and surfaced
conversation content in light/dark and English/Chinese.
Typography uses `--app-font-family`, `--app-font-size`, and `--code-font-size` in shared
application/chat/diff styles. [The plugin package contract](../../openagent-plugin-development/references/package-format.md#theme-and-integration-package-types)
owns declaration, validation, precedence and lifecycle behavior.
The [semantic theme contract](semantic-themes.md) owns standard token pairs and
shadcn/create composition; these Apple colors describe the built-in default.
