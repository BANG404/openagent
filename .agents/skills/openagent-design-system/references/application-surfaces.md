# Application surfaces

Use `docs/design.md` section `Components` for shell, navigation, settings,
conversation, panels, cards, controls, and responsive interaction rules. Use
the nearest component heading as the read boundary.

Keep layout stable under loading and localization, preserve shared Mica and
conversation-surface treatments, and keep native window behavior in
`openagent-desktop-host` rather than duplicating it here.
