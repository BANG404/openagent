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
