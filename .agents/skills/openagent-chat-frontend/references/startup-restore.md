# Startup and restore

- Use the synchronous per-workspace restore hint only for first render, then
  reconcile through the unified bootstrap IPC.
- Prepare current-window workspace switches in the background while keeping the
  mounted sidebar, transcript, and composer visible. Make the existing shell
  inert and busy during that transition, then commit the target workspace
  context, roles, conversation page, and fully hydrated active conversation as
  one state change. Never clear the current workspace first or route workspace
  switches initiated by the new-conversation composer through a restored active
  conversation: prepare and commit the target workspace directly on its
  new-conversation surface so no intermediate transcript is painted.
  transition state through the sidebar, transcript, or composer skeletons.
  Build the target checkpoint tree, selected branch, pending input, file changes,
  and transcript before changing the visible workspace identity. Do not clear
  the global loaded-conversation set during a switch; visited conversation trees,
  messages, drafts, and transient stream state remain keyed by conversation.
  Retain each visited workspace's conversation transcript snapshot so switching
  away from an active Turn cannot discard its optimistic user message or make a
  terminal event look like it belongs to a deleted conversation. When that
  workspace is revisited during streaming, reconcile its durable checkpoint
  while preserving cached messages that the checkpoint has not yet recorded.
- Derive setup-window visibility from the normalized bootstrap config and the
  SDK-owned embedding-resource status. Persist configuration completion in the
  versioned config beneath `OPENAGENT_HOME`, but keep the main shell hidden
  until the resource is verified. A configured repair opens directly on the
  final resource step without rewriting settings.
- Render first-run onboarding in its own undecorated Tauri window while the main
  window remains hidden. Completing the flow hands the selected workspace back
  to the already-bootstrapped main window before revealing it. The development
  inspector reopens that same window without clearing durable completion. On
  Windows, pre-create the centered onboarding WebviewWindow during native setup
  and let it initialize while hidden; revealing it must only unminimize, show,
  and focus that existing top-level window. Do not dynamically construct it from
  a command handler or make visibility depend on frontend readiness or WebView
  window APIs. Completing or dismissing a debug revisit must hide rather than
  destroy the preloaded window so later inspector invocations reuse the same
  initialized instance. Keep its compact title bar free of a visible setup
  label and match the main application chrome height. Keep the onboarding
  canvas fixed at 960 × 640px and omit its maximize affordance. Pair one quiet,
  product-owned setup illustration with compact numbered progress controls in
  the native-material column, then lead directly with the current step's
  display heading inside the inset, borderless content canvas. The welcome step
  must explain the product, summarize the upcoming configuration, and describe
  how the workspace is used before asking a first-time user to continue. Dense
  step content scrolls inside that form column without resizing the window; keep
  its scrollbar flush with the trailing canvas edge while preserving the content
  inset. Separate both columns through spacing and neutral selection fill instead
  of divider lines. The right-side setup canvas and its nested summary cards use
  the same bordered, shadowless Mica surface as grouped Settings cards. Reuse the
  shared Settings action button for ordinary onboarding actions; its secondary
  treatment carries the same restrained divider-colored perimeter as Settings
  inputs, while primary actions remain filled.
  Start embedding preparation in the background when onboarding mounts. The
  final step shows stable progress and retry states and keeps completion
  disabled until a fresh backend status read confirms readiness.
  Render a layout-stable loading skeleton until its
  configuration is ready. Keep the development-only `onboarding-preview` query with
  `onboarding-preview-theme=light|dark` and `onboarding-preview-locale=zh|en`
  parameters so the surface remains browser-verifiable without native state.
  Add `onboarding-preview-resource=ready|downloading` to open the configured-
  user repair state directly on the final model card.
  Preview every onboarding theme change through the page shell so the WebView
  palette and the native window material switch together instead of compositing
  a dark translucent canvas over a light native backdrop.
- Persist a newly created conversation and active-workspace selection
  atomically before its first turn. Apply the optimistic user message before
  awaiting that persistence so the visible surface moves directly from the
  centered new-conversation composer to the populated transcript. An active
  conversation with no renderable messages must not fall back to the
  new-conversation greeting during creation, hydration, or navigation. Delay
  the generic awaiting-output label briefly and cancel it on real output so a
  fast response never paints a one-frame waiting status.
- Keep the main window hidden until the bootstrap snapshot is applied; retain
  the failure watchdog.
- Use transcript-shaped and composer skeletons during history loading. A new
  conversation's greeting and composer skeletons belong to the same measured
  centered stack so their placeholders cannot overlap. Skeleton user bubbles
  mirror the translucent composer surface instead of introducing a separate
  opaque message treatment.
- Keep the conversation sidebar background flat and free of decorative glow;
  communicate active streaming through the conversation row indicator only.
- Organize the conversation sidebar as Projects followed by Recent conversations,
  with independently collapsible sections. Projects initially expands the current
  workspace with its paged conversation hierarchy and exposes recent workspaces as
  project groups. Clicking any expanded project row collapses its conversation
  hierarchy without changing the selected workspace or unmounting that project's
  keyed list. Clicking a collapsed selected project expands it in place; clicking
  a collapsed project for a different workspace selects that workspace and
  expands its hierarchy. Keep project groups in their
  persisted first-save order when the current workspace changes so keyed rows
  retain their DOM position; pinned
  groups may remain ahead without otherwise reordering either group. Do not cap
  the project group count: startup omits persisted paths whose directories no
  longer exist, recovers every existing workspace represented by durable
  conversations, and rejects a path that disappears before a later switch. Keep
  the same keyed `ConversationList` mounted beneath every project with five
  conversations initially visible. Show more only when loaded conversations remain hidden or
  the current workspace reports another page. Selection may change its
  pagination capability, but every role keeps one per-workspace conversation
  snapshot so changing the selected workspace never swaps a project's list data
  source or discards the previous workspace's keyed rows. Independently load the
  first role-filtered page for every visible inactive project instead of treating
  the bounded global Recent projection as that project's complete history. Keep
  its cached rows mounted while refreshing, show a compact layout-stable skeleton
  before the first project load completes, and use a muted, indented `No chats`
  row without a persistent group background only after an authoritative empty page. Reserve the project
  row's trailing action space at rest so focus, pending selection, and active
  styles never change its geometry. Its focused name search
  ranks exact, prefix, name, and path
  matches ahead of the unchanged remainder instead of hiding unmatched projects.
  Render every child conversation without a leading kind or role icon, including
  delegated role, Goal, and Graph conversations. Indent each child title beyond
  its parent title and increase that inset at every deeper active-branch level.
  Recent conversations is one newest-first projection of the 20 most recently
  updated top-level conversations across workspace metadata for the selected role;
  child conversations appear only inside their owning project hierarchy. Keep
  that projection independent from the selected workspace's conversation page,
  and retain the loaded role snapshot during a same-role background refresh so
  workspace switching only updates keyed rows in place. Keep it in the sidebar's
  ordinary scroll flow without its own scroll container or pagination query.
  Preserve the owning workspace on every global conversation.
  Sidebar conversation search covers every workspace
  and role only while its input retains focus; focus leaving the search control
  clears the query and restores the ordinary sidebar. Selecting any result or
  recent conversation switches the current window to its owning workspace before
  opening that exact conversation.
  Keep project-specific actions on each project row instead of the Projects
  heading: expose a direct new-conversation action plus a compact menu for
  pinning, opening the folder, and removing the project from the project list.
  Let the project-row shell alone paint the shared hover, focus, and selected
  fill while its inner row stays transparent; painting both layers compounds
  the translucent neutral state into a darker gray.
  Project pins are durable sidebar presentation preferences. Removing a project
  must not delete its folder or conversations; its conversations remain
  reachable from Recents. Keep global conversation search with the primary
  new-conversation action below the role selector, not on a section heading.
  Deleting a conversation from any project, Recents-backed snapshot, or global
  search result must carry its owning workspace through the shared callback and
  remove it immediately from every cached sidebar projection; never mutate only
  the currently selected workspace list. Desktop menu action labels are not
  selectable text, while editable fields inside menu panels retain ordinary
  text selection.
- Keep the conversation sidebar permanently expanded and resizable from its trailing edge between
  220px and 360px so row labels and trailing actions cannot overlap. Persist the
  chosen width across reload, keep the default at that lower bound,
  and normalize narrower saved values when they load. Disable width animation
  while dragging, and expose the same bounds to keyboard users.
  Size every project and Recent conversation title from the live space remaining
  in its row, truncate overflow with an ellipsis, and scroll only overflowing copy
  when the pointer rests on the title. Recompute that overflow whenever the
  sidebar or neighboring row controls change width.
  The resize hit target and active indicator begin below the shared title bar so
  a sidebar drag never draws a separator through application chrome.
- Keep the sidebar's role trigger above Projects and size it to its
  visible role name without a redundant caret. Keep the full-width new-conversation
  and global conversation-search actions immediately below it; the new action
  uses the window's selected workspace, while project-row actions may explicitly
  select another workspace first. Do not add a persistent Settings action to the
  sidebar. Keep the back and forward
  controls right-aligned in the same row as the sidebar role trigger. Keep the
  application icon in the leading slot of the shared top chrome; it is branding,
  not an interactive sidebar-collapse control.
  On macOS, reserve the native traffic-light footprint before the application
  icon and title-bar menu;
  on Windows, keep minimize, maximize/restore, and close at the trailing edge
  with platform-standard hit targets and close affordance. Tie history controls
  to the window's real destination history: conversations, the
  new-conversation surface, and Settings all participate; visiting a new
  destination after going back discards the abandoned forward branch, and
  deleting a conversation removes its stale destinations.
- Keep desktop conversation rows at a compact 30px height. Ellipsize long
  titles at rest, reveal their complete text with a measured horizontal scroll
  on pointer hover, retain the static ellipsis under reduced motion, and do not
  add a tooltip to conversation titles. Keep a 3px parent-owned gap between
  adjacent conversation rows so hover and active fills remain visibly separate
  at every nesting depth and in search results.
  Keep Goal, Graph, and Graph-node conversation titles free of leading flow
  glyphs; hierarchy, active state, and streaming state already communicate their
  sidebar structure without a decorative workflow badge.
  Keep the new-conversation and search actions, conversation rows, expanded
  sidebar navigation, and settings navigation on the same single-line scale:
  30px height, 13px type on an 18px line, 10px horizontal padding, an 8px
  content gap, a 7px radius, and a 3px parent-owned row gap. Align project-owned
  conversation labels and their show-more action with the project name after its
  folder icon. The workspace role selector at the top of the sidebar remains a
  distinct selector control.
- Paint the sidebar and complete shared title bar with one opaque application-
  chrome background in both themes. Preserve the operating system's native
  window outline, rounded corners, and shadow around that web content. Keep the
  two chrome segments visually continuous without a border between them or
  beneath the title bar. Present chat as its own clipped, rounded canvas directly
  against the title bar's lower edge, with 8px gutters at the sides and bottom
  plus compact, clearly edged elevation; use that spatial layer rather than
  shell divider lines to separate conversation from navigation.
- Use the theme canvas for the workspace surface. Keep the new-conversation
  greeting and composer, as well as the bottom-anchored composer, on neutral
  theme surfaces without an ambient color field or animated glow. On a new
  conversation, treat the greeting and composer as one vertical stack whose
  measured total height is centered with a small fixed offset below the geometric
  center. When no generated suggestions are available, raise that complete stack
  by 24px without positioning the greeting and composer independently. Constrain
  that composer to a 760px outer column. Give its compact
  textarea more single-line height than the bottom-anchored composer, and keep
  the loading skeleton at the same expanded height. Do not position the greeting
  and composer independently. Ordinary conversations keep the composer anchored
  to the bottom in the wider 900px outer column. The shared composer and its
  loading skeleton use the application Mica surface in both positions.
  Keep the model, reasoning-effort, and approval triggers inside that composer
  surface-free at rest; standalone Select material must not leak into the
  toolbar. Keep the composer shell's neutral Mica perimeter unchanged when its
  textarea receives focus; embedded toolbar controls retain their own focus
  rings, which expand outside each control boundary instead of inset.
- Let the conversation shell own the custom title-bar clearance. Keep the
  ordinary transcript's own top inset compact so it does not stack a second
  header-sized gap above the first message or debug context. Tint the translucent
  conversation-canvas veil from the shared application background in both themes
  so neutral regions match the title bar. Reserve Mica for raised chat controls
  such as the composer and flow panel.
- An explicitly empty durable active-conversation marker restores the centered
  new-conversation surface, even when older conversations exist. Never fall
  back to the newest conversation.
- Treat the new-conversation action as idempotent while that surface is already
  visible. Do not reload its greeting or suggestions, rewrite its durable active marker,
  or toggle its loading skeleton on a repeated click.
- The new-conversation greeting is the fixed prompt `Where should we start?`
  across desktop, remote, preview, and every locale. Keep it outside the
  localization dictionaries so an immediate locale switch cannot replace it.
  It uses a compact, regular-weight display heading treatment above the
  centered composer. Keep its tracking locale-aware: Latin copy remains subtly
  compact while Chinese copy uses open, positive character spacing. It must not
  depend on memory or a Flash task. Show exactly three optional Flash-generated
  suggestions derived from up to the five most recently updated top-level
  conversation titles below the composer. Restore them from `messages.db`
  through the SDK bootstrap and product operation, keyed by workspace and
  locale; WebView local storage is not an authority. Selecting one sends it
  immediately through the shared user-message path.
- Keep the development-only `follow-up-suggestions-preview` query available
  with `-theme=light|dark` and `-locale=zh|en` parameters so both suggestion
  placements, logical-Turn hosting across multiple assistant records, and their
  direct-send interaction remain browser-verifiable. In
  the centered new-conversation placement, reserve the leading suggestion-icon
  track inside the composer gutter: align the icon with the composer shell and
  the suggestion copy with the textarea copy instead of centering the copy
  without accounting for the icon.
- Keep the right-side user-message index on one shared tooltip surface. Its
  hover and focus treatment may extend the marker line but must not paint a
  gray button background. Do not render a second inline message preview for
  the same index marker.
- Do not render approval controls for a switched branch until its active tip is
  durable.
- Route ordinary desktop branch switches and edited-message forks through the
  same SDK Runtime operations as the paired browser. The Runtime must atomically
  own branch creation, selected checkpoint restoration, provider history, and
  file-change reversal or replay; the page must not recreate that transition
  from independent desktop commands. Freeze the selected branch-head checkpoint
  together with the edited message and its fork parent, and send all three in
  the Runtime fork request so validation cannot drift to a separately changing
  active tip. While that fork is streaming, keep its optimistic transcript
  authoritative until the durable selected branch contains the fork's new user
  message; an accepted run must not hydrate the abandoned branch suffix back
  ahead of the new message. Derive the selected durable tip from the active
  checkpoint-tree node, resolve branch identity only by an exact head match,
  and clear a cached branch id when no exact match exists. Never guess from
  branch creation order or pass a null checkpoint to the active-tip command.
