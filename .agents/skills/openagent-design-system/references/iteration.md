## Iteration Guide

1. Work on one component or coherent interaction at a time. Read its subsystem
   owner and the matching design reference before changing it.
2. Reuse `src/lib/components/ui/`, Bits UI primitives, and the tokens in
   `src/app.css`. Keep component-specific CSS focused on layout and variants.
3. In workspace `DESIGN.md` files, use named tokens and `{path.to.token}`
   references. Existing application UI uses its established CSS variables.
4. Cover default, hover, focus, active, disabled, loading, and error states where
   the interaction needs them. Keyboard focus must remain visible.
5. Match the application's existing typography and density; the photographic
   website examples in the typography references do not impose a 17px body size
   or a proprietary font on every desktop control.
6. Keep Settings cards shadowless and use theme-neutral conversation surfaces.
   Apply elevation and native material through their existing shared owners.
7. Verify changed behavior through the module's real-window black-box scenario
   in light/dark and Chinese/English. Record actual evidence in the handoff.

## Reference website coverage

The following gaps describe the analyzed website samples. They do not waive
desktop interaction, error-state, or dark-theme requirements.

- Form validation and error states were not surfaced on the analyzed pages; only the neutral search input is documented.
- The homepage's embedded video/player frame uses `{colors.surface-black}`; interior player controls are not documented (they're a platform widget, not a web-design token).
- Some component imagery is dynamic (rotating product hero) and its specific copy varies per surface — component specs name the structure, not the rotating content.
- Dark-mode counterparts for store and accessories utility cards were not surfaced on the analyzed pages; the system documented is the daytime/light-dominant variant Apple ships by default.
- Atmospheric photography (environment page mountain vista) is a content asset, not a design token; the documented `{component.environment-quote-card}` describes the structural surface only.
- The exact backdrop-filter blur radius on `{component.sub-nav-frosted}` and `{component.floating-sticky-bar}` is platform-dependent; production CSS uses `saturate(180%) blur(20px)` as a typical baseline but the value isn't formalized as a token.

The Chinese application menu labels the Agent entry as “运行”; the English label remains “Agent”.
