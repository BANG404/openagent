### Inputs & Forms

**`search-input`** — The accessories search input. Background `{colors.canvas}`, text `{colors.ink}` in `{typography.body}` (17px), 1px solid `rgba(0, 0, 0, 0.08)` border, rounded `{rounded.pill}` (full pill — search is also pill-shaped, matching the CTA grammar), padding 12px × 20px, height 44px. Leading icon: search glyph at 14px, muted tint.

**`application-input-surface`** — Shared desktop-application treatment for text inputs, textareas, select/combobox triggers, and the chat composer. Use the theme-aware Mica surface, border, shadow, 24px backdrop blur, restrained saturation, and the component's established radius. The shared focus ring expands outside the control boundary instead of consuming its content area or replacing the neutral Mica border. Select and dropdown triggers remain geometrically stable when pressed; their open-state fill and caret rotation provide interaction feedback without scaling the control. The chat composer's shell is the exception: focusing its textarea or entering streaming state leaves the neutral Mica perimeter and shadow unchanged, while embedded toolbar controls retain their own focus rings. While a response streams, an empty composer uses its primary circular control to pause output; the paused state shows resume until the user enters text, adds an attachment, or adds quoted context, when that same control becomes send. Stop remains a separate terminal control. Model, reasoning-effort, and approval triggers embedded in the composer are surface-free toolbar controls; they must not inherit the standalone Select background, border, blur, or shadow. Text selected inside an assistant answer exposes a compact floating Add-to-chat action. Pending quoted excerpts sit above the textarea as removable, primary-railed context rows; durable excerpts use the same visual grammar above the corresponding user-authored message. User-message bubbles are the embedded transcript exception: use the shadowless `var(--user-message-bg)` treatment in both display and edit states, map that token to the centralized Tailwind `bg-conversation-component` theme color, and add only `var(--focus-ring)` for keyboard focus. The component surface is fixed at light gray in the light theme and dark gray in the dark theme so it remains distinct from the conversation canvas. Attachment-card variants use that same component surface for their card and thumbnail base. Transcript-owned tool-call groups and cards, user-input cards and summaries, and retry attachment cards reuse that background so the conversation has one component surface in both themes, including over transparent native-window material. Fenced Markdown code cards and Markdown table headers use the same component surface, while Markdown row hover uses the shared interaction fill. Long user-message copy collapses after a fixed number of complete rendered lines; bubble padding stays outside the clamp so a partial trailing line is never exposed. User-message loading placeholders retain the same shadowless treatment. Searchable dropdown inputs follow the shared control treatment.

**`application-tooltip`** — Application-owned hover and keyboard-focus hints use the shared portal-backed tooltip component instead of native HTML `title` attributes. Keep the surface dark in both themes, with white 12px text, a 6px radius, 5px by 9px padding, a soft raised shadow, and a 280px viewport-bounded maximum width that wraps long paths anywhere. Preserve semantic `title` attributes whose purpose is accessibility metadata rather than a hover hint, such as an iframe title.

**`application-book-reader`** — A completed Agent reply offers a book-mode action beside its other reply actions. The reader uses the same fixed full-viewport footprint, 16px outer inset, and rounded inner hairline frame as Mermaid fullscreen; it does not duplicate native window controls. Both fullscreen surfaces retain a continuous native-window drag strip from the outermost top edge through their header, stopping before interactive controls. Only two dedicated page-turn buttons sit at the left and right vertical center of the framed reading surface. One complete Agent reply flows continuously from the left column into the right and then onto later spreads: internal context-compaction continuations stay in sequence at their original position, and process records retain their normal collapsed summary and expandable details. Expanded process content fragments as a block across columns while atomic records remain intact; book-page records disable viewport content culling so WebView2 cannot invalidate an offscreen column and snap a page turn backward. Markdown tables fragment only between complete rows. Atomic rich content—including images, video, charts, Mermaid, code, and HTML previews—stays within the usable page height and uses containment or internal scrolling instead of being clipped. General settings owns the persisted reading font size; every font, window, expansion, or embedded-media load change recalculates the real overflow-column count using a cancellable animation-frame update and immediate position correction, while smooth scrolling is reserved for explicit page turns. Resize observation never synchronously writes layout back to the observed page, and unchanged geometry is not written again, so dragging the native window cannot create a WebView2 reflow feedback loop. The reading surface uses theme tokens in both light and dark modes and falls back to one column on narrow windows.

**`application-follow-up-suggestions`** — Sending a user message starts one background Flash request from all user-authored messages on the selected conversation branch; Agent output is excluded. The three sendable results remain keyed to that turn's preallocated Agent message across navigation and across `ask_user` or approval interruption/resume boundaries; resumed assistant records retain distinct message IDs without restarting the suggestion request. Only the latest complete turn on the currently selected branch renders them below its full-width footer. A newer trailing user message hides older suggestions even before its reply completes.

**`application-new-conversation-surface`** — The fixed empty-conversation greeting is `Where should we start?` across desktop, remote, preview, and every locale. It stays outside localization dictionaries so an immediate locale switch cannot replace it. It uses a compact regular-weight display heading above the composer with locale-aware tracking: Latin copy stays subtly compact while Chinese copy receives open, positive character spacing. Together the greeting and composer form one stable state centered with a small fixed offset below the geometric midpoint, and the greeting never depends on memory or a Flash task. When no generated suggestions are available, raise that complete stack by 24px without positioning the greeting and composer independently. Its composer uses a narrower 760px outer column, while the bottom-anchored composer in an active conversation retains the 900px outer column. When available, exactly three Flash-generated suggestions derived from up to the five most recently updated top-level conversation titles sit below the composer and send immediately when selected. Suggestions persist in `messages.db` per workspace and locale so startup, workspace switching, locale switching, and paired clients restore one shared result rather than WebView-local state. Repeating the new-conversation action while this state is already visible leaves the greeting, composer, suggestions, and loading state unchanged; loading placeholders are reserved for a real restore or data refresh, not for acknowledging an already-selected destination.

Search inputs inside raised selector menus are the compact exception: they stay transparent and shadowless at rest, with only the focus ring appearing during keyboard focus. Apply this consistently to role, model, workspace, and any future searchable dropdown.

**`application-floating-surface`** — Shared treatment for menus, popovers, command palettes, dropdown content, toasts, and compact floating actions. Use the dedicated 90%-opaque, theme-aware `var(--floating-surface)` fill so content beneath the overlay cannot compete with its text. Retain the shared Mica hairline, 18px radius, 24px saturated backdrop blur, and compact raised shadow. Dialogs keep their distinct semantic treatment. Internal dividers may remain when they separate content regions; status colors should use an inset accent or focus ring rather than changing the perimeter.

**`application-danger-panel`** — Destructive settings groups use a low-opacity fill mixed from `var(--danger)` and the shared Mica surface, with a correspondingly restrained tinted Mica border and the normal Mica shadow. Titles and explanatory copy keep the normal text hierarchy; only the destructive action uses `var(--danger)`. This keeps danger emphasis theme-aware without turning the whole panel red or falling back to a flat gray card.

**`application-menu-item`** — Shared compact scale for every click-opened menu, context menu, select, combobox, and download-option row. Floating content uses an 8px radius with a 6px inner inset. A single-line row uses 12px type on a 20px line, a 28px minimum height, 4px vertical and 14px horizontal padding, an 8px content gap, and a 5px row radius. Keep a 3px vertical gap between adjacent option rows so hover fills remain separate instead of merging into one block. Neutral buttons and option rows use the shared `--interactive-state-bg` for hover, open, and selected states, derived from the current text color at 8% opacity so it remains visible over canvas, sidebar, and native Mica surfaces. Selection relies on that neutral fill without adding a left rail, stronger selected fill, checkmark, or selected text color. Primary and destructive actions retain their semantic state colors. Separators keep 7px of space above and below their 1px rule. Rows with descriptions retain the same title scale and horizontal inset but grow vertically to fit 11px secondary copy. Role descriptions are the compact exception: keep them to one line with an ellipsis so every role menu has the same scan rhythm; never compress other descriptive content to force the 28px single-line height.

**`application-popup-list-sizing`** — Every application-owned popup list—including menus, context menus, selects, comboboxes, command palettes, submenus, and editor dropdowns—sizes to its currently visible items instead of reserving space for its maximum item count. Short and filtered result sets must leave no trailing empty area. Cap the floating surface at the lesser of its configured maximum and the live space available inside the window or visual viewport, preserving an 8px viewport inset; when the items exceed that cap, only the item viewport scrolls while any search, header, or footer region remains stable. Recalculate the available space while the popup is open whenever the window or visual viewport resizes or scrolls, the anchor changes size or position, or filtering changes the visible item count. Opening, filtering, or keyboard navigation must not move the trigger or underlying layout, and fixed-height popup lists are not permitted. Platform-native selects may delegate these constraints to the operating system.

**`application-list-stack`** — Persistent navigation and collection lists use the same 3px vertical separation between adjacent interactive rows as floating menus whenever hover or focus applies a filled background. The parent list owns the gap through `--list-item-stack-gap`; do not rely on state-specific margins or allow rounded hover fills to touch. Selection follows the menu-row grammar and relies on the row's ordinary neutral fill without adding a left rail. On entry, refresh, scope change, or deletion, a navigation or detail list whose current selection is missing selects its first available item; an empty-state placeholder is reserved for lists that actually have no items or for an explicit create flow. Single-line application-sidebar actions, conversation rows, and settings navigation share the compact list-row tokens: 30px height, 13px type on an 18px line, 10px horizontal padding, an 8px content gap, and a 7px radius. The permanently expanded application sidebar remains resizable. Its header owns role selection and back/forward history controls. Saved-role creation and editing live in the Role application menu and open one singleton utility window for scope, name, system prompt, Skills, and MCP associations; the sidebar has no persistent Settings action. History traverses the actual window destination history across conversations and the new-conversation surface; a new destination reached after going back clears the abandoned forward branch, and deleting a conversation removes its stale destinations. The shared top chrome uses the application icon as its non-interactive leading mark instead of a sidebar-collapse action. The sidebar resize target begins below the shared top chrome and never paints its active indicator through the menu bar. Descriptive draft, queue, and inspector rows may grow to fit their content while retaining the shared stack gap.

**`application-settings-surface`** — General Settings, Model, Agent execution, integration, memory, automation, and About domains use independently focusable singleton utility windows opened from the application menu; reopening a domain focuses its existing window and selects the requested section. General contains only appearance, launcher, startup, diagnostics, and presentation preferences. Both ordinary settings pages and the rightmost provider/detail pane remain full-width scroll owners so their scrollbars stay against the outer edge, while symmetric responsive inline padding limits each inner settings track to 680px on wide windows. This same track applies to standalone settings content such as Agent Plugins; do not cap its responsive gutter at a fixed maximum or put `max-width` on a scrolling element itself. Empty right-detail placeholders sit directly on the pane canvas without a filled background, radius, or shadow; only their inner content alignment and spacing distinguish the empty state. Settings and role-editor window roots remain transparent over their owning native material. Controls and interaction states may retain their own surfaces, but nested layout regions must not stack the translucent theme tint or add perimeter dividers. Opening General Settings does not replace or unmount chat state. Channel, model-provider, and MCP detail headings share one compact status-and-enable control: a status-dot pill followed by a labeled switch pill, both on the secondary surface. MCP details render discovered tools as ordinary divided Mica rows with the complete tool name and one trailing switch; this list belongs below connection testing so disabling a tool reads as capability policy rather than a transport setting. Settings collection panes use the model-provider list's 256px width and row geometry so moving between settings areas does not shift the information hierarchy. Model-provider and MCP collection rows use the shared neutral interaction fill on hover and selection without an additional rail or selected text treatment. Their compact filter affordances stay transparent at rest and reveal the shared neutral fill only while interactive; collection-footer add actions use the ordinary theme-aware control material instead of a primary accent pill. Onboarding reuses the same application Select triggers and floating menu grammar as Settings for language, theme, provider, and default-model choices.

**`application-menu-bar`** — File, Edit, Agent, Integrations, Automation, and Help share the compact desktop menu scale and remain available on every ordinary application surface. Agent owns saved-role creation and configuration plus entry points for model, execution, Flash task, and memory management. Role creation and configuration use one independently focusable singleton utility window; reopening it retargets the existing editor. Integrations owns Channels, MCP, and Agent Plugins; Automation owns scheduled tasks. Configuration entries open their domain's singleton utility window and may select a specific section. Access keys, arrow navigation, and platform-labeled accelerators invoke the same actions as pointer selection. Edit preserves the focused editable context for Undo, Redo, Cut, Copy, Paste, Delete, Select All, and General Settings; Help exposes About and the shared updater state. Workspace and conversation navigation always reuse the current window. File -> New window immediately creates an independent window for the current workspace without opening a folder picker; targeted workspace and conversation navigation still reuses the registered workspace process. File also exposes Close Window (`Ctrl/⌘+W`) using the normal window-close behavior and Quit (`Ctrl/⌘+Q`) using the native application-exit command. Disabled back and forward controls retain enough contrast in both themes to remain visibly present in the conversation sidebar header. When the native window loses focus, keep the full-width top chrome transparent, borderless, geometrically stable, and available while reducing the opacity of its application icon, sidebar role and history controls, menu labels, centered workspace identity, status actions, and window controls; restoring focus returns them to full opacity from the same shell-owned focus state. Keep `desktop-shell-preview-focused=false` available to verify the inactive top chrome without native window state.

On Linux, including WSLg, the window manager owns the main window's outer frame,
resize edge, and minimize/maximize/close controls; the application menu bar stays
inside that frame without duplicating window controls. Windows and macOS retain
their frameless platform-specific product chrome.

**`application-mica-surface`** — A Windows-Mica-inspired content material shared by application inputs, the conversation composer, grouped settings, model lists, execution-permission controls, and Agent Plugin cards. Use the theme-aware `--mica-surface`, `--mica-border`, and `--mica-divider` tokens with a 24px backdrop blur and restrained saturation. Raised controls and floating surfaces also use the appropriate shared shadow token; grouped Settings cards and the main conversation workspace remain shadowless. The material stays inside the web content layer: it must not require a transparent native window or change the WebView composition contract. Standalone setting controls use the same standard card-row treatment as grouped settings. Rows inside one material remain transparent rather than introducing gray bands; add the low-contrast `--mica-divider` hairline inset 16px from the leading edge only between adjacent rows, never above the first row. Preserve text contrast in both themes and do not add decorative color fields or motion to simulate wallpaper.

Application controls and floating menus take their hover, open, and selected
fill from the shared `app.css` interaction primitives. The neutral gray is
semi-transparent and derived from the current text color, so it retains one
opacity while adapting to canvas, sidebar, and Mica surfaces. Menu row geometry,
search fields, empty states, and separators are also global primitives; feature
components retain only their own dimensions, content layout, and semantic
exceptions.

Roles and Skills collection sidebars share one compact control grammar: the title and scope selector occupy the same toolbar rhythm, standalone search and footer controls use the theme-aware control material, and selected rows use the shared selected-state fill. A segmented selector carries elevation only on its outer surface; its active segment is distinguished by fill rather than a nested shadow. When the application theme changes, apply the resolved light or dark mode to both the WebView and the native window as one ordered transition so Windows Mica cannot retain a different palette beneath translucent canvases. Returning to the system theme clears the native override before the WebView resolves its system preference. Keep `core:window:allow-set-theme` in every capability used by a native-material application window; without it Tauri removes or rejects the native theme command and the translucent WebView can silently diverge from its backdrop.

The composer slash-command and mention palette uses the same compact row scale. Its floating surface follows the composer width and uses a 14px radius with a 6px inset. Let both palettes size to their visible items up to the lesser of the configured 320px maximum and the live space above the composer, retaining an 8px viewport inset. Recalculate that space when the window, visual viewport, composer height, or scroll position changes. Only overflow scrolls independently, so short result sets have no trailing empty area, constrained windows never clip the palette, and opening or navigating the list never moves the composer.

Pending attachments in the ordinary composer use 112px square preview cards in
one horizontal row. Image and supported text content fill the preview region,
the filename remains anchored at the bottom, and the remove action stays in the
top-right corner. Overflow scrolls horizontally without wrapping; its scrollbar
uses the shared transient activity treatment. The fixed-height quick-chat launcher keeps its separate 28px compact
attachment strip. Opening a card or restored attachment uses a full-window
preview frame consistent with Mermaid fullscreen: the attachment stays centered
inside the inset canvas and controls remain in the top-right. Images open fitted
to the viewport and provide zoom out, fit, zoom in, and close actions;
pointer-anchored wheel zoom keeps the image beneath the cursor stable while
zoomed overflow remains scrollable. Lightweight text formats open as bounded
plain-text previews with normal scrolling and no zoom controls or wheel
interception. PDF remains uploadable but has no content preview. Preview opening
uses an explicit extension whitelist; unsupported formats stay visible as
attachments but are not clickable.

Long secondary collections should not make a primary action menu scroll. The workspace switcher keeps open-folder actions in its root menu and renders its trigger, root items, and older-workspace rows without decorative icons; the current-folder-location row remains text-only, while WSL is communicated with an explicit text badge. Older workspaces appear in a side-opening “Recent workspaces” submenu; its entry retains a right-pointing chevron as the submenu indicator and must support pointer hover, click, and keyboard navigation, keep its scrollbar flush with the right edge, and reuse the shared menu density.

**`quick-chat-palette`** — A Raycast-style compact conversation surface opened
with the accelerator configured in General settings
(`CommandOrControl+Shift+Space` by default). The accelerator recorder shows the
platform-native label, requires at least one modifier, applies a captured
combination immediately, and provides a quiet reset action. Shortcut recording
continues after a pointer click even on platforms where buttons do not receive
keyboard focus. Registration
conflicts appear inline and leave the previous accelerator active. The primary
desktop process owns a separate centered 856 × 246px always-on-top transparent
launcher canvas containing a 760px-wide card;
workspace windows never resize or change visibility when it opens. The launcher
is one continuous raised surface with a 14px radius: a large borderless composer
followed by a 48px footer for model, role, and workspace selectors. It has no
title bar, shortcut hint, or window-action row; non-interactive card space remains
draggable. Each shortcut reveal returns keyboard focus to the composer
so typing can begin immediately even though the hidden launcher window and its
input remain mounted between sessions. It has no transcript and remembers its own
model, role, and workspace tuple without changing the primary window's defaults.
Every submission creates a fresh durable conversation, routes the turn to the
selected workspace process, opens or focuses that workspace window, and shows the
new streaming conversation there. Failures keep the launcher and draft visible.
Because a webview cannot render beyond its native bounds, prepare the
transparent launcher window at 856 × 580px before showing it and keep that
native size fixed for the whole visible session. Its 48px horizontal insets let
the card shadow decay naturally before the WebView boundary; the card remains
compact and the menu opens below and outside it without visible-window resize jitter.
Shrink the native window only after hiding it. Clicking the unused transparent
area dismisses the launcher. A native drag records the launcher's physical
screen position. Later reveals restore it only while enough of the expanded
window intersects a current monitor work area; malformed or off-screen history
is discarded and the launcher returns to its centered default.
The card uses a theme-tinted variant of the shared Windows-Mica-inspired
material composited over an opaque theme base, with a clearly visible perimeter
and pronounced but compact raised shadow. Content behind the launcher must not show through;
selector surfaces also remain opaque, and transparency belongs only to the
unused part of the expanded native window. Quick Chat selectors retain the
shared menu perimeter, radius, spacing, and elevation, but replace its
translucent fill and backdrop filter with the opaque theme surface. Selectors
stay below their trigger, align to its start edge, and do not use collision-based
side flipping. The
card's non-interactive space remains a native drag handle, with generous padding
above the composer as its primary grab target; drag-time focus changes must not
close the launcher. Give the launcher card a restrained shadow,
contained by transparent stage padding so it never meets or clips against the
native window boundary; selector content uses the shared raised shadow while its
search field remains shadowless at rest. Separate the composer and selector
toolbar with only the short inset divider, without a second full-width toolbar
border. Selector content follows its items up to a bounded scrollable maximum
height, and role descriptions are limited to one ellipsized line. Selector
triggers include their leading icon in the same hover, focus, open-state, and
pointer target as the label and caret. Model, role, and
workspace selectors update only the launcher's remembered tuple for the next
conversation. Configuration changes refresh the available launcher models and
theme immediately, including while the launcher is hidden, without replacing a
remembered model that remains valid; an unavailable model
falls back to the configured default. Keep the composer and surrounding stage
neutral; controls remain on semantically filled surfaces. The compact
composer grows from its base height using the textarea's measured multi-line
height, and an attachment adds one compact row; content beyond the bounded
maximum scrolls internally. Attachments use a shadowless 28px single-line strip
in normal flow above the textarea, with horizontal overflow instead of a fixed
overlay that text can scroll beneath. Attachment and send controls share a
vertical center at the composer end; the quick-chat textarea has no leading
glyph. Native attachment selection preserves launcher focus just like
workspace selection. The
`quick-chat-preview` development query renders this layout without native
window or shortcut behavior for browser-based light/dark and localization
checks.

The main composer shows a reasoning-effort selector after the model selector
only for ChatGPT OAuth models. Its labels map to the provider values Light =
`low`, Medium = `medium`, High = `high`, Extra High = `xhigh`, and Ultra =
`max`; the Ultra row warns that it consumes usage limits faster. In development,
`?reasoning-effort-preview` renders the interactive selector directly without
onboarding or native runtime state. Add
`reasoning-effort-preview-theme=light|dark` and
`reasoning-effort-preview-locale=zh|en` to verify theme and localization.

Error and validation states were not surfaced in the analyzed pages.
