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
