# Product presentation

OpenAgent is a desktop conversation workspace. Keep its shell compact, its conversation surfaces neutral, and its controls consistent across native and remote views. Theme packages and saved appearance settings can change the palette and typography through the semantic contract.

- **Neutral conversation surfaces:** chat canvases, composers, and empty-conversation greetings use only theme-neutral depth; colored ambient fields are not conversation chrome.
- **Conversation details panel:** the ordinary desktop conversation's resizable right-side card owns generic package-flow status, edited files, and terminals. Its top-level tabs switch between those views; each tab restores its last meaningful selection within the active conversation branch, while the selected tab and collapse request are also branch-scoped. Conditional tab mounting must not erase that state or jump to an arbitrary first item. New package flows and file-only activity open the panel automatically. The title-bar toggle collapses it with the same 180ms width curve as the conversation sidebar and leaves no interactive or visible track behind.
- **Settings cards:** align each section title with its supporting copy and align each card row's label with its description. Every card-like Settings container—including grouped rows, permission controls, shortcut, startup, execution, channel, model-list, Flash Agent, and danger surfaces—uses the shadowless shared `.application-settings-surface` Mica treatment from `app.css`; semantic component classes own only layout and variants. Settings and onboarding roots use `.application-settings-scope`, while equivalent standalone fields use `.application-settings-control`, so nested Select triggers and ordinary form controls receive their complete shadowless `1px solid var(--mica-divider)` border from the global utility instead of component-local border colors. Keep these utilities outside the base CSS layer so component-local default elevation cannot override them; focus and open states retain only the shared focus ring.
  Settings utility-window loading states preserve the geometry of the requested
  destination: multi-section windows retain their 172px navigation column,
  provider/channel/MCP sections also retain the 256px collection column, and
  single-section or About windows use their final content alignment. Each menu
  destination keeps its own content silhouette: provider fields, channel
  credentials, MCP tools, Agent task cards, plugins, schedules, and ordinary
  settings rows must not collapse into one generic loading template.
- **Settings enablement switches:** show the switch alone. Do not repeat its
  enabled or disabled state with adjacent text, dots, or labels; expose the
  control name through its accessible label. When a card has multiple independent
  switches, visibly name their purposes and separate permission controls into
  labeled rows; purpose labels do not repeat the switch's current state.
- **Transient scrollbars:** scrollbars across the application keep their
  layout footprint but hide their thumb while idle. Scrolling within a
  scrollable region reveals its scrollbar temporarily; nested,
  horizontal, textarea, and attachment-strip scrollers follow the same behavior.
- **Desktop application shell:** keep one compact, continuous top chrome across
  the sidebar, conversation, and Settings surfaces. Settings does not render a
  second title bar. Match VS Code's compact desktop geometry: the shared title
  bar is 35px tall, its application icon is 16px square, and every shell-owned
  top inset or resize boundary derives from that same height token. The leading
  controls collapse
  the sidebar and traverse application history; File owns workspace-opening and
  explicit new-window commands. The File menu follows the forward control with
  the same compact optical rhythm as the other leading controls, without an
  extra separator gap. Keep the center free of workspace names and Git branches
  so it remains a quiet, unobstructed drag region. Window controls
  follow macOS traffic-light placement or Windows trailing minimize/maximize/close
  geometry. Windows controls fill the title-bar
  height; the close hover uses the platform red and follows the outer 7px window
  corner while restored, then becomes square when maximized. The dedicated
  onboarding window omits the custom title bar and window controls so its setup
  body fills the complete frameless canvas. The centered onboarding window is a
  compact, fixed, non-maximizable 840 × 560px canvas. Its Windows 11
  OOBE-inspired body uses a quiet, image-free 34% brand and numbered progress
  rail beside a wider 66% setup canvas, preserving confident heading scale and
  fixed footer actions without leaving oversized empty regions.
  The welcome step first explains
  what OpenAgent does, what the setup will configure, and how the selected
  workspace scopes file and command activity, so a first-time user can make an
  informed choice before continuing. Initial resource preparation, retry and
  offline import render inside this same welcome component and step rail.
  Preparation enables Continue in that same window; preserve its footer and
  layout across the resource-to-preferences handoff. The embedded welcome
  receives native progress props, while the product page injects its SDK client.
  The right-side setup canvas and its nested
  summary cards use the same bordered, shadowless Mica surface as grouped
  Settings cards, while spacing rather than divider lines separates the two
  columns. Dense provider content scrolls inside the form column without changing
  the native window geometry, and its scrollbar stays flush with the trailing
  edge of the inset canvas while the content keeps its reading inset.
  Welcome shows its three introduction features before one compact application
  resource card. The card summarizes interface, Runtime/SDK and local embedding
  readiness, with development sources explicitly labeled as development rather
  than signed installations. Query embedding status before preparing; prepare
  only missing or corrupt resources. Continue and Finish require all resource
  results. Failures retain retry in that card. Compact introduction type and
  spacing keep the ready card visible at the default window size in both locales.
  Welcome content can scroll while the footer stays fixed. Workspace selection
  belongs in Preferences beside language and
  theme; Welcome contains the introduction and resource status. Remount the
  scroll area on step changes so both forward and back navigation start at the
  heading. Ready contains the configuration summary, without a resource card.
  A configured installation needing repair uses this Welcome step with a single
  step rail and the Start action, preserving existing provider configuration.
  Product onboarding uses `/app-icon.png`, served by SvelteKit in development
  and the frontend bundle in production. The embedded shell supplies its bundled
  asset URL through `brandIconUrl`; do not import a public-directory asset in the
  product component, where Vite's development URL would include `/static/`.
  Every native window canvas, including onboarding, Settings, and role editing,
  remains fully transparent over the native window material without a theme-
  color tint: Windows prefers Mica with Acrylic and Blur fallbacks, while macOS
  uses Vibrancy. The inset conversation stage uses the opaque theme surface so
  its light appearance is consistently white. Content-bearing controls and
  cards retain their own surfaces. Browser previews use the same conversation
  surface because they have no native material.
  The operating system retains the native window outline, rounded corners, and
  exterior shadow.
  On macOS, transparent Tauri WebViews clip their outer content to a 12px
  radius so the title chrome and native outline retain the same Apple-style
  window edge.
  Do not draw a border between those two chrome segments or beneath the title
  bar. Separate chat from navigation through an inset rounded conversation canvas
  directly against the title bar's lower edge, with 8px side and bottom gutters
  and compact, clearly edged elevation instead of shell divider lines.
  The sidebar groups workspace-owned conversations under Projects and shows one
  cross-workspace, newest-first Recent conversations list of top-level chats for
  the selected role. Child conversations remain in their project hierarchy and
  do not appear as separate Recent entries.
  Project groups retain their persisted first-save order across workspace
  selection changes, with pinned groups kept ahead without otherwise changing
  order. Projects does not impose a fixed item cap: every available persisted or
  conversation-recovered workspace remains present in the sidebar. Workspaces
  whose directories were deleted or renamed are omitted during startup, and a
  directory that disappears while the app is running cannot become the active
  workspace; opening it reports the unavailable path instead. Every project keeps
  the same conversation-list structure mounted, starts
  with five visible conversations, and loads its own role-filtered first page even
  while inactive; the global Recent projection is not a substitute for project
  history. An inactive project keeps cached rows during refresh, uses a compact
  skeleton before its first load, and shows a muted, indented `No chats` row
  without a persistent group background only after an authoritative empty result. It
  retains its Show more action across selection changes so row styling and DOM
  identity do not flicker. Child conversation rows, including delegated role,
  package-owned workflow conversations omit leading icons and indent their titles
  beyond the parent title, with deeper active-branch levels receiving additional
  inset. Clicking an
  expanded project collapses it without first selecting that workspace; clicking
  a collapsed project expands it and selects its workspace only when needed.
  Both sections collapse independently. Project-name search temporarily ranks
  matching projects ahead of the remaining list, while Recent conversations
  remains a bounded newest-first projection in the sidebar's ordinary scroll flow.
  The conversation sidebar header contains the role selector beside history
  controls; selecting a role filters conversation history and exposes its
  dedicated new-conversation context. Full-width new-conversation and search
  actions follow directly below it.
  The new action uses the workspace already selected by the current window.
  General Settings, model, Agent, integration, memory, automation, and About
  management open from the application menu in a centered, resizable in-window
  settings surface with a compact default size and an explicit expanded state.
  Direct utility-window routes remain modeless singleton windows. The sidebar has
  no persistent Settings action. Conversation search spans all
  workspaces and roles only while its field retains focus; leaving search
  restores Projects and Recent conversations. Opening a result switches the
  current window to that conversation's workspace. A current-window project
  switch keeps the existing shell and chat mounted while the target workspace
  is prepared, then replaces the workspace state atomically instead of showing
  an application-wide loading reset. New-conversation composers expose the
  workspace switcher beside approval mode; existing workspace conversations hide
  it because their workspace is durable context. The workspace trigger
  follows the same surface-free rest, hover, and open grammar as the adjacent
  composer selectors. Each project row exposes
  its own new-conversation action and menu for pinning, opening the project
  folder, or removing the project from Projects without deleting its files or
  conversation history.
- **Floating application panels:** dropdown menus, searchable selects,
  comboboxes, context and download menus, command/mention palettes, floating
  text-selection actions, and notifications reuse the conversation input's
  Mica fill, hairline perimeter, 18px radius, 24px saturated blur, and compact
  shadow whose short falloff keeps the card edge legible. Individual panels
  retain their compact inset, row scale, size, scrolling, and content layout.
  Small explanatory tooltips and modal dialogs keep their distinct semantic
  treatments.
