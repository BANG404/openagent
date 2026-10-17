# Semantic themes and shadcn/create

`src/app.css` owns the semantic contract: background/foreground, card,
popover, primary, secondary, muted, accent and their foreground pairs;
destructive, border, input, ring, sidebar pairs and chart-1 through chart-5.
Expose colors and the radius scale through Tailwind `@theme inline`.
Components consume these names; never add new uses of legacy bg/text/surface
names. Filled primary actions use primary-foreground, and themed surfaces use
their matching foreground. Focus uses ring. Shape dimensions derive from radius;
circles, pills, zero and native window geometry retain their own constraints.
Native material, composer geometry and motion remain OpenAgent extensions.

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
fonts are independent. Latin WOFF2 resources are bundled for offline use under
src/lib/assets/fonts/shadcn with package versions, hashes and individual licenses;
CJK text uses local font fallbacks. Never load fonts from a remote service.
`theme-font-resources.mjs` emits every font license and its provenance under
`licenses/theme-fonts/` in both production and shell bootstrap artifacts.
When updating fonts, verify those emitted notices as well as source hashes.

Verify cross-axis composition and exact upstream palette values in
`tests/themeComposition.test.ts`. Verify installed selection, switch/removal,
user precedence and native light/dark + English/Chinese through the plugin
presentation black-box runner. Confirm actual rendered control foregrounds,
radius, font loading, menus and chart palettes, not just root variable strings.
`bun run test:blackbox:semantic-themes` installs the collection from
`plugins/<id>` into an explicit isolated `plugin-presentation` home and Pilot
socket. It checks all ten packages in light/dark and English/Chinese, captures
native screenshots, and restores settings/removes its packages on exit. On
Windows supply the verified main HWND as `BLACKBOX_NATIVE_WINDOW_ID`.
Pass `--release` to install the public repository releases instead of local
source directories and repeat the same actual selection/rendering assertions.
The runner warms optional dependencies before fixture changes so the initial
Vite dependency reload cannot erase its saved settings or cleanup state.
