# Selectors and menus

- Shared interactive controls are not text-selectable. The application
  primitive in `src/app.css` covers native buttons/selects, disclosure
  summaries, menu and option rows, tabs, toggles, and ARIA button surfaces so
  pointer clicks do not leave accidental text selections. Keep text selection
  enabled for inputs, textareas, contenteditable fields, and message/code
  content because editing, copying, and assistant-message quoting depend on
  those surfaces.

- Keep click-opened menus, context menus, selects, comboboxes, and compact
  download choices on one desktop menu scale: 12px labels on a 20px line,
  28px minimum height for single-line items, 4px by 14px item padding, 6px
  content inset, 5px item radius, 8px content radius, a 3px gap between
  adjacent items, and 7px vertical space around separators. The gap must keep
  neighboring hover and selected fills visibly separate. Options with
  descriptions may grow vertically and use 11px secondary copy; do not
  compress them to the single-line height.
- Route application-owned single-choice fields through the shared `Select`
  component, including workspace dialogs, `ask_user` forms, and development
  utilities. Preserve each field's validation, change callback, and established
  trigger treatment at the caller boundary; `ask_user` keeps the same compact
  input styling as its neighboring fields while its popup uses the shared menu
  surface. Do not fall back to a browser-native `<select>` that forks the menu
  surface, density, and keyboard behavior.
- Keep reusable interaction and menu presentation in `src/app.css`: the shared
  hover/open/selected control fill, menu rows, search fields, empty states, and
  separators are application primitives. Components own only their dimensions,
  content layout, and semantic exceptions; do not duplicate the shared state
  declarations in component styles.
- Reuse the shared raised-surface geometry for the composer, remote file-change
  banner, every desktop menu panel, command/mention palettes, floating text-selection
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
  application update check. Settings-window entries use the contiguous primary
  modifier + Shift + 1 through 8 sequence in their visible top-menu order, and
  their keyboard routes target the same window and section as menu selection.
  A separate workspace process may be requested only
  through File -> New window. Show WSL workspace-opening actions in the File
  menu and composer workspace switcher only on Windows; native folder opening
  remains available on every desktop platform.
  Help includes an entry that opens the current desktop application's local
  rotating log directory in the file manager.
- Keep the application menu, platform window controls, sidebar top region,
  resize boundary, and main-content inset on the shared
  `--desktop-titlebar-height` token. The desktop-shell browser preview accepts
  `desktop-shell-preview-platform=windows|macos|linux` so each platform's
  title-bar geometry remains directly verifiable.
- Open role creation and editing from the application menu on the shared
  `FullscreenSurface` management-window chrome. The role editor content fills
  that surface below its title bar so its close, drag, theme, and platform
  window-control behavior stays aligned with Settings windows.
- Keep background terminals on the right conversation-details panel as their
  single primary entry point. Do not add a duplicate terminal toggle to the
  desktop title bar.
- Render those floating panels through the shared desktop menu surface, which
  consumes the conversation-input material while retaining the shared 6px menu
  inset. Keep component-specific width, height, scrolling, and item content,
  but do not fork its panel material or neutral hover fill.
- Keep selection signaling consistent across floating option rows and persistent
  navigation lists: neutral buttons, triggers, and option rows use the shared
  theme-aware `--interactive-state-bg` for hover, open, and selected states;
  derive it from the current text color at 8% opacity so the fill remains
  visible over canvas, sidebar, and native Mica surfaces. Static conversation
  components instead use the centralized Tailwind `bg-conversation-component`
  theme color: it uses the fixed `#f4f4f5` fill over the white conversation
  surface in light mode and the `#27272a` component fill in dark mode. Selected rows use the
  interaction fill without a decorative left rail, stronger fill, checkmark, or selected text color. GPUI
  preserves the same row geometry, selected fill, selection semantics,
  accessibility state, and interactions. Primary and destructive actions retain
  their semantic state colors.
- Keep role switching in the conversation sidebar header beside the window
  history controls. The top application menu owns role creation and editing;
  configuring a role targets the currently selected saved role and is disabled
  for the default OpenAgent role. Do not add a persistent Settings row to the
  sidebar. Switching roles retains role-scoped conversation filtering and
  starts on that role's new-conversation surface.
- Keep the role editor as a viewport-bounded horizontal workspace: role identity
  and instructions occupy one column while skills and MCP assignments occupy the
  other. The ordinary dialog body itself does not scroll. Each resource
  collection owns its search field and overflow scrolling, and inner controls
  use flat bordered surfaces rather than nested elevation. The standalone role
  editor window uses the shared `ui/ScrollArea.svelte` body viewport when its
  native window is shorter than the editor canvas. Saved roles have one global scope, so
  the editor has no scope selector and offers only global Skills for association.
  Both columns are exhaustive allowlists: associating nothing runs the role with
  no global Skill and no user MCP server. Workspace Skills and plugin-owned MCP
  servers are the agent capability surface rather than a role selection, so they
  stay available to every role and the editor neither lists them as choices nor
  narrows them. Each column header carries the compact quiet select-all action
  beside its title, toggling to clear once every listed row is selected; it acts
  on the rows currently listed, so an active search narrows the bulk action.
  Both hosted presentations already name the role—the shared management surface
  in its chrome and the utility window in its native title bar—so the editor
  content starts directly with its fields instead of repeating a title,
  description, or divider header; only the dialog presentation, which the
  desktop-shell preview renders without host chrome, keeps its own header.
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
  list's scrollbar flush with the submenu's right edge. Size the submenu to its
  content up to a 320px preferred width and the viewport limit, and size its
  height to the visible rows before enabling scrolling, so short path lists do
  not cover the conversation details panel with an oversized empty surface.
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
- The composer's Markdown string is the single source of truth and the
  contenteditable editor (`src/lib/components/MessageInput.svelte` +
  `src/lib/composerMarkdown.ts` + `src/lib/composerDom.ts`) is only its
  projection over that string. Render formatting with the markup markers
  hidden, map DOM selection back to Markdown offsets for the palette,
  formatting, and attachment-reference synchronization, and never re-render
  during IME composition. Rebuild the projection from the model for every edit
  instead of trusting the browser's DOM mutation, so `/command`, `@"path"`, and
  `[Image #N]` survive byte-for-byte.
- Keep the shared composer text-formatting group backed by Markdown so the
  existing plain-text message contract remains unchanged. The group exposes
  bold, italic, strikethrough, and inline-code actions, keeps the wrapped
  Markdown range selected after each action, and supports the matching
  `Ctrl`/`Cmd` shortcuts. Formatting stays available in compact composer
  variants unless a caller explicitly sets `showFormatting={false}`.
- Never let the browser edit the projected DOM directly. Handle `beforeinput`,
  `paste`, `cut`, and `drop`, cancel the native edit, and replay it as a
  Markdown splice; keep a Markdown-level undo/redo stack with `Ctrl`/`Cmd+Z`
  and `Ctrl`/`Cmd+Shift+Z` (native undo cannot survive re-projection). Paste
  takes `text/plain` only, so rich clipboard HTML cannot desynchronize the
  model.
- Support only closed, non-empty markup pairs. A half-typed marker such as
  `**bo` stays literal until its closing delimiter is typed, so the text does
  not jitter mid-keystroke.
- Keep the shared composer send, queue, and stop actions at a stable 30px square
  geometry with an 8px corner radius so the primary actions read as compact
  rounded-square controls across streaming and idle states.
- Keep the composer context-window indicator derived from the active branch
  tip's latest persisted chat usage and the selected model's configured
  context-compaction threshold (falling back to the global threshold). Hide it
  when either value is unavailable or compaction is disabled; do not estimate
  usage from transcript text or expose Inspector trace data in the normal
  composer. After conversation restore, wait for the hydrated checkpoint tree
  before mapping the usage projection, and place the indicator immediately to
  the left of the send/stop control.
- Style boundary-delimited `@` mention and `#` reference tokens, and the
  `[Image #N]`/`[File #N]` attachment labels, as atomic non-editable chips with
  the shared primary accent. Scan for them before inline Markdown parsing so a
  bracket label can never become a link, and keep their exact source in the
  model so the submitted plain text is unchanged. They share the `.composer-md`
  projection styles in `src/app.css` with the transcript bubble.
- Size the composer from CSS alone. An empty composer holds its single-row
  `min-height`, the editor clamps at a 200px `max-height` and scrolls past it,
  and nothing derives an editor height from `scrollHeight` — WebView2 can report
  a stale expanded value during startup and draft restoration. A standard empty
  composer with its bottom toolbar is 98px tall; keep the editor block-level so
  inline baseline space cannot make that geometry browser-dependent. Compact
  toolbar-free variants retain their own smaller height, while attachments,
  quotes, and multiline text grow normally. When a composer container is narrow
  enough for its localized placeholder to wrap to three lines, give the editor
  enough minimum height for the wrapped copy to remain visible above the send
  control. Keep the composer's loading skeleton on the same tokens instead of
  restating pixel values: the skeleton card reuses the composer border and
  shadow, its text placeholder sits on the editor's first line, its toolbar
  placeholders fill the bottom 38px row, and its send placeholder is the same
  bottom-right 30px rounded square outside the bordered card, so the surface
  cannot resize when the composer mounts.
- Selecting `/goal` or `/graph` replaces only the active slash trigger with the
  complete command token. Preserve any draft text after the caret as the command
  argument instead of clearing the composer.
- Populate the slash-command palette from the shared Runtime command catalog on
  both desktop and remote hosts. Builtin commands use localized label and
  description keys; portable plugin commands use their literal `label` and
  `description` and insert the complete `/plugin-id:command-id` token while
  preserving the remaining draft argument.
