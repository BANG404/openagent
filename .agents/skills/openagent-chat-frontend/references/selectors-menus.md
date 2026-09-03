# Selectors and menus

- Keep click-opened menus, context menus, selects, comboboxes, and compact
  download choices on one desktop menu scale: 12px labels on a 20px line,
  28px minimum height for single-line items, 4px by 14px item padding, 6px
  content inset, 5px item radius, 8px content radius, a 3px gap between
  adjacent items, and 7px vertical space around separators. The gap must keep
  neighboring hover and selected fills visibly separate. Options with
  descriptions may grow vertically and use 11px secondary copy; do not
  compress them to the single-line height.
- Keep reusable interaction and menu presentation in `src/app.css`: the shared
  hover/open/selected control fill, menu rows, search fields, empty states, and
  separators are application primitives. Components own only their dimensions,
  content layout, and semantic exceptions; do not duplicate the shared state
  declarations in component styles.
- Reuse the shared raised-surface geometry for the composer, file-change banner,
  every desktop menu panel, command/mention palettes, floating text-selection
  actions, and notifications so their hairline perimeter, 18px radius, 24px
  saturated blur, and compact, clearly edged elevation stay identical in both
  themes. Floating content uses the dedicated 90%-opaque theme fill so underlying
  text cannot wash out its content; non-floating input surfaces retain the lighter
  Mica fill. This includes model, role,
  workspace, recent-workspace, application, context, combobox, and compact
  download panels. Their
  dimensions, internal spacing, and content behavior remain component-owned;
  explanatory tooltips and modal dialogs retain their distinct semantics.
- Keep the shared application menu fully operable without a pointer. Expose
  platform-appropriate accelerator labels, preserve access-key and arrow-key
  navigation, and route global application shortcuts through the same actions
  as menu selection. Edit owns Undo, Redo, Cut, Copy, Paste, Delete, and Select
  All against the focused editable context; Help owns the shared, state-aware
  application update check. A separate workspace process may be requested only
  through File -> New window. Show WSL workspace-opening actions in the File
  menu and composer workspace switcher only on Windows; native folder opening
  remains available on every desktop platform.
- Render those floating panels through the shared desktop menu surface, which
  consumes the conversation-input material while retaining the shared 6px menu
  inset. Keep component-specific width, height, scrolling, and item content,
  but do not fork its panel material or neutral hover fill.
- Keep selection signaling consistent across floating option rows and persistent
  navigation lists: neutral buttons, triggers, and option rows use the shared
  theme-aware `--interactive-state-bg` for hover, open, and selected states;
  derive it from the current text color at 8% opacity so the fill remains
  visible over canvas, sidebar, and native Mica surfaces. Static conversation
  components instead use `--component-neutral-bg`, with the shadcn neutral
  palette's `#f4f4f5` light fill and `#27272a` dark fill. Selected rows use the
  interaction fill without a decorative left rail, stronger fill, checkmark, or selected text color. GPUI
  preserves the same row geometry, selected fill, selection semantics,
  accessibility state, and interactions. Primary and destructive actions retain
  their semantic state colors.
- Keep the new-conversation composer's workspace switcher beside approval mode
  and focused on open-folder actions. Hide it once an existing workspace-owned
  conversation is active; the Projects section remains the visible workspace
  context, and the title bar must not duplicate it. The File menu and Projects
  section remain the other workspace-opening entry points.
  Keep the current-folder-location action text-only instead of repeating a
  folder glyph beside it.
  Keep the composer trigger's folder glyph, current folder name, and caret in
  one target; rotate the caret while open and expose the shared focus ring to
  keyboard users. Its rest, hover, and open treatments must match the adjacent
  surface-free model and approval triggers instead of introducing a separate
  filled workspace chip, and its folder name must inherit the trigger's stateful
  foreground instead of retaining the title-bar text color. Keep nested composer
  controls free of the generic `composer` class so conversation-surface Mica
  styling cannot turn them into independent raised cards.
  Place older workspaces in a side-opening recent-workspaces submenu that
  supports hover, click, and keyboard navigation. Show each complete workspace
  path without per-row icons, mark WSL shares explicitly, and keep an overflowing
  list's scrollbar flush with the submenu's right edge.
- Keep the composer slash-command and mention palette on the shared compact
  menu row scale and conversation-input material. Align its width to the
  composer, use the shared 18px radius and 6px inset, and let both surfaces
  follow their visible items up to the lesser of the configured 320px maximum
  and the live space above the composer, retaining an 8px viewport inset. Recalculate that space
  for window, visual-viewport, composer-height, and scroll changes. Only
  overflow scrolls independently, so short result sets leave no trailing empty
  area, constrained windows never clip the palette, and opening or navigating
  them never moves the composer. Keep slash-command rows to the command token
  and description only, without trailing hints or decorative glyphs.
- Keep the localized shared-composer placeholder concise while advertising the
  Enter and Shift+Enter keyboard behavior plus the `/` command and `@` mention
  palette triggers.
- Selecting `/goal` or `/graph` replaces only the active slash trigger with the
  complete command token. Preserve any draft text after the caret as the command
  argument instead of clearing the composer.
