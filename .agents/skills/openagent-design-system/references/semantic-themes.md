# Semantic themes and shadcn/create

`src/app.css` owns the semantic contract: background/foreground, card,
popover, primary, secondary, muted, accent and their foreground pairs;
destructive, border, input, ring, sidebar pairs and chart-1 through chart-5.
Expose colors and the radius scale through Tailwind `@theme inline`.
Components consume these names; never add new uses of legacy bg/text/surface
names. Filled primary actions use primary-foreground, and themed surfaces use
their matching foreground. Focus uses ring. Shape dimensions derive from radius;
circles, pills, zero and native window geometry retain their own constraints.
Sidebar hover uses `--sidebar-accent` / `--sidebar-accent-foreground`.
Selected projects, conversations, child conversations and recent conversations
use `--sidebar-selected` / `--sidebar-selected-foreground`, including while hovered
or focused. These default to the hover pair; packages may override either selected
token independently. Rhea explicitly references the hover pair in both modes,
retaining the same colors for hover and selection.
The other nine published collection packages strengthen their sidebar hover
and selected fill together: OKLCH lightness 0.90 in light mode and 0.36 in dark
mode, retaining each palette's chroma and hue. These are package-owned overrides
documented in their READMEs; the upstream snapshot and generic composition
remain exact upstream values. Keep explicit selected-token aliases in packages
that intentionally share hover and selection colors.
Run `bun run test:blackbox:sidebar-selection --collection` to apply all ten
source manifests to the native desktop sidebar fixture in light/dark and
English/Chinese. It checks project/root/child/recent selection, focused hover,
equal hover/selected colors, and captures each combination. For the nine adjusted
packages it also checks highlight/background contrast of at least 1.25:1 light
and 1.45:1 dark, and foreground/fill contrast of at least 7:1. These highlight
bounds are collection regression guards, not accessibility conformance claims.
The default command retains the Rhea and independent-selection override checks.
Native material, composer geometry and motion remain OpenAgent extensions.
Desktop workspace cards retain their own 12px radius (`--workspace-card-radius`)
and 8px gutters when a theme changes control radius, density or typography.
The workspace canvas defaults to sidebar color for built-in and plugin themes,
including palettes whose sidebar and card colors coincide. Do not substitute
another surface or add a foreground tint to force separation. Preserve explicit
package `--workspace-canvas` values. Saved background overrides restore the canvas to
their derived sidebar color. Paint it below the title-bar padding only, avoiding
duplicate compositing of translucent chrome.
The built-in opaque canvas uses the sidebar color in both light and dark modes,
without an additional foreground tint. The native canvas remains transparent.

`themeTokens.ts` normalizes installed theme-v1 legacy names at the input
boundary, with explicit semantic names winning. Existing packages remain
supported for theme-v1; remove that adapter only with a protocol transition.
Application consumers use the semantic contract even for those packages.
Standard theme surfaces derive Mica, floating and control surfaces unless the
package explicitly supplies them. A package background wins over native canvas
transparency. Defaults, selected enabled package, then saved user overrides are
the precedence order; removing an overlay restores exact previous inline values.
Hex user accents choose a black/white foreground by WCAG luminance contrast.
User body-font overrides update font-sans and app-font-family together, so
inherited headings follow them. Explicit package heading fonts stay independent.

## Compose independently installable packages

Use Bun from the project root:

```sh
bun scripts/create-theme-plugin.ts --list
bun run theme:collection --owner GITHUB_OWNER
bun scripts/create-theme-plugin.ts --id openagent-theme-nova --preset nova
bun scripts/create-theme-plugin.ts --id openagent-theme-garden --preset maia --base-color olive --theme emerald --chart-color violet --font figtree --font-heading lora --radius large --menu-accent bold --menu-color default-translucent --repository https://github.com/OWNER/openagent-theme-garden
```

`--preset` accepts the eight named presets, official versioned preset codes,
or HTTPS ui.shadcn.com/create and /init URLs. Explicit CLI options override the
preset. Unknown options fail. Existing output directories are never overwritten.
Default candidates live at `plugins/<id>`; `--output` chooses an explicit path.
Each contains portable plugin.json, the complete recipe, pinned upstream
provenance, MIT license and installation instructions. Publish each candidate
through its independent repository and ordinary verified plugin release flow.
The host subscription/catalog references that repository; it does not own the
package source. Package naming and release version must agree with its manifest.

The pinned upstream snapshot in `scripts/themes/upstream/` owns all 24 palettes,
seven base colors, eight named presets, 26 font choices and preset-code decoding.
Composition follows upstream base → theme → chart → bold accent merging.
OpenAgent expresses the eight visual grammars as desktop control dimensions,
typography and shape tokens. It keeps Svelte/Bits UI behavior and its icons;
React library/template/icon-library selection is outside a CSS theme's scope.
Menu colors select default/inverted with optional translucency. Body and heading
fonts are independent. Each generated theme ships only its body/heading Latin
WOFF2 faces, individual licenses and hashes under `fonts/`, requiring
`theme-fonts-v1`. The plugin package contract owns descriptor and asset bounds.
CJK text uses local font fallbacks. Never load fonts from a remote service.
Generation inputs live in `scripts/themes/fonts/`; application frontend and
shell bootstrap must not import or distribute that font library. Built-in font
choices use installed/system font stacks. Verify package hashes and notices,
body/heading deduplication, and absence of theme font assets in frontend artifacts. Math renderer fonts remain
owned by the renderer and are excluded from package-face lifecycle assertions.

Verify cross-axis composition and exact upstream palette values in
`tests/themeComposition.test.ts`. Verify installed selection, switch/removal,
user precedence and native light/dark + English/Chinese through the plugin
presentation black-box runner. Confirm actual rendered control foregrounds,
radius, font loading, menus and chart palettes, not just root variable strings.
`bun run test:blackbox:semantic-themes` installs the collection from
`plugins/<id>` into an explicit isolated `plugin-presentation` home and Pilot
socket. It checks all ten packages in light/dark and English/Chinese, captures
native screenshots, asserts that rendered title-bar and sidebar backgrounds and
control foregrounds match, verifies that the workspace canvas follows the sidebar
unless the package explicitly overrides it, and checks conversation/right-sidebar cards,
12px outer corners and unchanged shell geometry against the built-in baseline.
Capture the unobscured shell for every selected theme, including the real right
sidebar with process-free fixture content. It restores settings/removes its
packages on exit. On
Windows supply the verified main HWND as `BLACKBOX_NATIVE_WINDOW_ID`.
Pass `--release` to install the public repository releases instead of local
source directories and repeat the same actual selection/rendering assertions.
The runner warms optional dependencies before fixture changes so the initial
Vite dependency reload cannot erase its saved settings or cleanup state.
Opening/closing a management surface publishes an appearance preview, but an
equivalent preview must retain the exact registered and pending theme fonts.
The font effect depends on selected enabled package identity/path, version and
font descriptors, not the settings object's identity, color mode or unrelated edits.
Explicit `agent-plugins-changed` asset refreshes also retire faces, since local
source refresh can replace bytes at the same manifest path/version.
Retire faces when that selection changes, assets refresh or its owner unmounts.
Native theme synchronization likewise skips an already applied native mode; system
mode still resolves current OS colors without reapplying the window material.
Verify real settings open/close with font-face identities and native theme call
counts, alongside the geometry scenario; a static surface fixture cannot cover
appearance preview lifecycle regressions.
Run `bun run test:blackbox:topbar-stability` against an isolated `topbar-*` home
with an explicit Pilot socket. It installs a temporary licensed font theme and
drives Settings, Models and About through the product menus in all four
theme/locale combinations, asserting loaded face identity and zero redundant
native theme calls while sampling conversation geometry on animation frames.
It also verifies that an explicit package asset refresh replaces the old faces.
On Windows run the fixture and screenshot runner in the signed-in desktop
session and supply its verified main HWND as `BLACKBOX_NATIVE_WINDOW_ID`.
Pause geometry frame sampling only around native screenshot capture, then resume
it before closing the surface: the PrintWindow fallback temporarily changes and
restores window size to refresh composited pixels. Keep interaction sampling and
font/native-theme assertions enabled for the open/close transitions.
For independent native fixtures, select one appearance with `--mode=light|dark`
and `--language=en|zh`. Run all four combinations to retain full coverage.
