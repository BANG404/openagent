# Loading skeleton contract

Loading skeletons are layout contracts, not decorative approximations. A
skeleton must preserve the geometry of the destination it replaces: column
widths, content insets, row heights, control heights, section spacing, and the
presence or absence of cards. When the real surface changes, update its
skeleton in the same change and keep shared geometry in application-level CSS
tokens rather than copying numeric values into one side.

For Settings surfaces, `SettingsWindowSkeleton.svelte` and `SettingsView.svelte`
share the `--settings-*` tokens in `src/app.css`. Keep each destination's
silhouette explicit: Provider fields are a continuous form, collection panes
retain their 256px column, and ordinary settings cards retain their row rhythm.
Do not replace a destination-specific skeleton with a generic list.

Review checklist:

- Compare the loading DOM with the settled component at desktop and the narrow
  responsive breakpoint; verify columns, scroll owners, and the first viewport
  do not jump when content mounts.
- Verify light and dark themes and both Chinese and English, especially where
  localized labels change wrapping.
- When changing a shared token or component surface, inspect every skeleton
  that consumes that token and update focused skeleton tests when the
  destination mapping changes.
- Use the browser preview route or native debug surface to capture loading and
  settled states when the change affects visible geometry.
