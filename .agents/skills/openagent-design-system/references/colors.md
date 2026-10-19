# Colors and canvases

Use the semantic background/foreground and interaction pairs defined in `src/app.css`. [Semantic themes](semantic-themes.md) owns their naming and composition.

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
shadcn/create composition.
