## Iteration Guide

1. Work on one component or coherent interaction at a time. Read its subsystem
   owner and the matching design reference before changing it.
2. Reuse `src/lib/components/ui/`, Bits UI primitives, and the tokens in
   `src/app.css`. Keep component-specific CSS focused on layout and variants.
3. In workspace `DESIGN.md` files, use named tokens and `{path.to.token}`
   references. Existing application UI uses its established CSS variables.
4. Cover default, hover, focus, active, disabled, loading, and error states where
   the interaction needs them. Keyboard focus must remain visible.
5. Match the application's existing typography and density; use shared application
   font tokens and respect saved user/theme overrides.
6. Keep Settings cards shadowless and use theme-neutral conversation surfaces.
   Apply elevation and native material through their existing shared owners.
7. Verify changed behavior through the module's real-window black-box scenario
   in light/dark and Chinese/English. Record actual evidence in the handoff.

The Chinese application menu labels the Agent entry as “运行”; the English label remains “Agent”.
