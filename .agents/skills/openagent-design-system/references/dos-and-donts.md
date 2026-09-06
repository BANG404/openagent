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
