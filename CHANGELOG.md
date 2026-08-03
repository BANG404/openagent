# Changelog

All notable changes to this project will be documented in this file.

## [0.33.0-beta.1] - 2026-08-03

### Features
- **sandbox**: Enable native Unix process isolation (#46)
- **sandbox**: Expose process isolation boundary (#37)
- **sandbox**: Add explicit permission profiles (#34)
- **chat**: Add stream pause control (#33)

### Bug Fixes
- **telemetry**: Update SDK OTLP exporter (#39)
- **ui**: Improve update notification details (#38)
- **config**: Unify app home and update feedback (#35)
- **ui**: Keep notifications in tooltip context (#36)
- **sandbox**: Constrain approved file tools (#32)

### Miscellaneous
- **ci**: Pin SDK capability routing (#48)
- **ci**: Pin public SDK dispatch integration (#44)

## [0.32.0-beta.1] - 2026-08-03

### Features
- **telemetry**: Add opt-out diagnostic collection (#23)

### Bug Fixes
- **sidebar**: Pin history controls beside collapse (#28)
- **chat**: Keep virtual row measurements stable (#26)
- **chat**: Stabilize virtual transcript navigation (#24)
- **quick-chat**: Focus composer on shortcut open (#22)
- **chat**: Defer reply actions until completion (#21)

### Miscellaneous
- **deps**: Lock telemetry dependencies (#25)

## [0.31.0-beta.1] - 2026-08-02

### Features
- **chat**: Add sidebar history navigation
- **chat**: Add paginated book reading mode
- **ui**: Nest recent workspaces submenu

### Bug Fixes
- **chat**: Stabilize process record expansion
- **workspace**: Restore recent submenu indicator
- **workspace**: Remove switcher menu icons
- **chat**: Extend fullscreen drag regions
- **chat**: Restore fullscreen window dragging
- **chat**: Stabilize book mode pagination
- **chat**: Clamp long user messages by complete lines
- **chat**: Recognize user compaction boundaries
- **workspace**: Clarify recent workspace paths
- **frontend**: Satisfy Svelte lint rules
- **sidebar**: Widen role selector popup
- **settings**: Constrain content track width
- **chat**: Align loose list markers
- **chat**: Keep command palette within viewport
- **chat**: Size command palette to content
- **chat**: Keep new conversation action idempotent
- **quick-chat**: Adapt selector menu height
- **chat**: Align empty state and message surfaces
- **chat**: Restore backdrop and unify search menus

### Refactoring
- **ui**: Replace native titles with shared tooltips

### Styling
- **ui**: Unify selected row treatment
- **ui**: Standardize compact list spacing
- **chat**: Align command palette sizing
- **ui**: Align menu and danger surfaces
- **ui**: Separate adjacent menu states
- **ui**: Unify compact menu sizing
- **chat**: Align conversation workspace layout

## [0.29.0-beta.1] - 2026-07-31

### Features
- **chat**: Hint editable user messages
- **chat**: Move quick chat into independent window
- **chat**: Make quick chat a conversation launcher
- **memory**: Bundle quantized embedding model
- **settings**: Configure quick chat shortcut
- **chat**: Add global quick chat palette

### Bug Fixes
- **chat**: Remove type-based tool card focus styling
- **chat**: Allow stopping sandbox approval
- **chat**: Separate quick attachments from draft scroll
- **chat**: Size quick composer from content
- **chat**: Contain quick chat composer overflow
- **chat**: Prevent quick chat dropdown jitter
- **chat**: Restore full window after quick submission

## [0.28.2-beta.1] - 2026-07-31

### Bug Fixes
- **chat**: Stabilize double-column rendering

## [0.28.1-beta.1] - 2026-07-31

### Bug Fixes
- **chat**: Paginate process records across columns

## [0.28.0-beta.1] - 2026-07-31

### Features
- **chat**: Collapse process records before final output
- **providers**: Add ChatGPT OAuth session controls
- **providers**: Expose Rig built-in services

### Bug Fixes
- **ci**: Restore frontend quality checks
- **editor**: Localize markdown editor controls
- **chat**: Update title generation runtime
- **settings**: Prevent add-model button wrapping
- **providers**: Align ChatGPT OAuth experience
- **providers**: Surface ChatGPT OAuth login
- **onboarding**: Keep add model label on one line
- **chat**: Stabilize file links in columns

### Miscellaneous
- **agent**: Enforce living documentation updates

## [0.27.0-beta.1] - 2026-07-30

### Features
- **chat**: Show memory retrieval progress
- **chat**: Add completed response actions
- **inspector**: Show prompt cache token usage

### Bug Fixes
- **chat**: Place actions after assistant turns

### Styling
- **frontend**: Fix page formatting

## [0.26.0-beta.1] - 2026-07-30

### Features
- **onboarding**: Add first-run setup flow
- **chat**: Sync external runs in desktop
- **hooks**: Show triggered chats and support editing
- **harness**: Integrate private headless SDK

### Bug Fixes
- **chat**: Keep branch tip backend authoritative
- **ci**: Require selected checks to pass
- **chat**: Repair dark theme rendering
- **assets**: Reuse optimized application icon
- **messages**: Keep stream tail stable on completion
- **chat**: Refresh roles after delegated role creation
- **onboarding**: Preserve the main window shell
- **compaction**: Retain actionable summary context
- **gateway**: Recover stale workspace connections

### Refactoring
- **frontend**: Extract configuration projections
- **charts**: Load modular echarts runtime

### Testing
- **frontend**: Enforce bundle size budgets
- **harness**: Exercise server contract in native CI

### Styling
- **onboarding**: Align setup with native panels

### Miscellaneous
- **deps**: Refresh compatible frontend packages
- **frontend**: Enforce lint and formatting
- **sdk**: Integrate harness release 0.1.1
- **sdk**: Update harness CI revision

## [0.25.2-beta.1] - 2026-07-27

### Bug Fixes
- **chat**: Hide new conversation glow in dark mode
- **chat**: Soften new conversation aurora edges
- **remote**: Refresh rotated pairing code

## [0.25.1-beta.1] - 2026-07-27

### Bug Fixes
- **remote**: Provide packaged frontend assets

## [0.25.0-beta.1] - 2026-07-27

### Features
- **chat**: Add responsive two-column messages
- **remote**: Align remote chat with desktop UI

### Bug Fixes
- **chat**: Keep thinking toggle interactive in columns
- **chat**: Paginate expanded thinking text
- **chat**: Keep interactive pagination atoms intact
- **chat**: Paginate wide responses by rendered content
- **remote**: Show skeleton while switching conversations
- **remote**: Restore branded new chat state
- **remote**: Enable mention suggestions
- **chat**: Improve mention palette loading
- **remote**: Sync flash-generated titles

### Styling
- **settings**: Unify configuration page backgrounds

### Miscellaneous
- **assets**: Remove obsolete openagent_icon_source.png
- **assets**: Remove unused openagent.png
- **repo**: Reset public history

## [0.24.1-beta.8] - 2026-07-27

### Miscellaneous
- **release**: Rotate updater signing key
- Initialize sanitized OpenAgent host shell

## [0.24.1-beta.7] - 2026-07-26

### Bug Fixes
- **chat**: Reconcile abandoned ask user forms

## [0.24.1-beta.6] - 2026-07-26

### Features
- **sidebar**: Move role switcher to header
- **roles**: Support role-scoped conversations and schedules

### Bug Fixes
- **chat**: Serve WSL HTML preview assets
- **chat**: Resolve local HTML preview assets
- **roles**: Show delegated conversations in role views
- **ui**: Constrain long role menus
- **ui**: Match select menu to trigger width
- **sidebar**: Avoid collapsed toggle overlap
- **ui**: Remove workspace switcher icon
- **chat**: Remove tool group outline

### Styling
- **ui**: Unify component focus borders
- **composer**: Restore input focus border
- **chat**: Neutralize tool group border
- **chat**: Restore bordered tool cards
- **chat**: Align tool activity surfaces
- **composer**: Blend model selector into input
- **chat**: Strengthen select item contrast
- **chat**: Refine role selector surfaces
- **ui**: Replace filled surface borders with shadows

## [0.24.1-beta.5] - 2026-07-26

### Features
- **workspace**: Add native WSL environments
- **roles**: Configure delegated output return
- **chat**: Support role mentions in provider prompts

### Bug Fixes
- **chat**: Show memory note loading placeholder
- **wsl**: Build UNC paths portably
- **settings**: Save model compaction threshold
- **agent**: Finalize delegated runs on parent cancel
- **roles**: Use canonical chat runtime
- **roles**: Detach fire-and-forget dispatches
- **agent**: Finalize failed delegated role runs

### Styling
- **workspace**: Match sidebar scrollbar

## [0.24.1-beta.4] - 2026-07-25

### Features
- **settings**: Add model configuration dialog
- **settings**: Add per-model compaction thresholds
- **skills**: Group skill list by category

### Bug Fixes
- **ci**: Embed Windows test controls manifest
- **skills**: Persist background skill categories
- **chat**: Recover streaming after bootstrap failure
- **workspace**: Preserve and recover workspace history
- **window**: Show restore icon when maximized
- **chat**: Improve collapsed new conversation controls
- **chat**: Sync composer model with default
- **chat**: Honor fallback model compaction thresholds

### Performance
- **chat**: Shorten window reveal path
- **app**: Defer MCP startup connections
- **runtime**: Streamline startup conversation restore

### Testing
- **settings**: Adapt model sync fixture

### Styling
- **settings**: Align model dialog cancel action
- **chat**: Align user message focus ring
- **chat**: Refine user bubbles and attachments

## [0.24.1-beta.3] - 2026-07-25

### Features
- **greeting**: Personalize new conversation welcome

### Bug Fixes
- **chat**: Jump to conversation tail on switch
- **settings**: Validate services before enabling
- **mcp**: Report resources when probing servers
- **chat**: Preserve queued user message during reconciliation
- **chat**: Hand off queued input on text delta
- **chat**: Gate queued handoff on completion tools
- **chat**: Flush queued input after final agent turn

## [0.24.1-beta.2] - 2026-07-25

### Features
- **roles**: Add global and project scopes
- **skills**: Add category-based progressive discovery
- **roles**: Add reusable delegated agent roles
- **agui**: Render image and video media
- **prompt**: Prepend runtime system version

### Bug Fixes
- **release**: Use MSI-compatible beta versions
- **messages**: Anchor stream tail through completion
- **messages**: Stabilize thinking state handoff
- **messages**: Preserve scroll position after streaming

### Refactoring
- **messages**: Keep assistant turn mounted on completion

## [0.24.1-beta.1] - 2026-07-24

### Features
- **mermaid**: Add validated direct render tool
- **attachments**: Preview and branch from capsules
- **attachments**: Add rich preview thumbnails

### Bug Fixes
- **sidebar**: Load child conversations on selection
- **mermaid**: Preserve source and portal fullscreen
- **graph**: Stream child node output live
- **messages**: Keep streaming row stable on completion
- **messages**: Collapse long runtime errors
- **multimodal**: Omit optional image detail
- **chat**: Stage attachment edits before resend
- **chat**: Preserve model attempt errors
- **attachments**: Restore previews after reload
- **messages**: Render index target before scrolling
- **messages**: Stabilize virtual index navigation
- **messages**: Avoid freezing on long index jumps
- **chat**: Render new conversation aurora behind text
- **chat**: Remove duplicate interruption badge

### Refactoring
- **goal**: Persist flow state in checkpoints
- **agent-runtime**: Centralize input routing
- **checkpoints**: Persist logical messages and attachment blobs

### CI/CD
- **release**: Publish verified release PR commits
- **checks**: Run changed modules only

### Styling
- **chat**: Match website new conversation aurora
- **chat**: Make new conversation aurora elliptical

## [0.24.0-beta.6] - 2026-07-23

### Features
- **sidebar**: Paginate conversation history

### Bug Fixes
- **checkpoints**: Retain user message attachments
- **checkpoints**: Persist tool result attachments
- **conversations**: Persist new active selection atomically
- **chat**: Resolve tracked files from workspace
- **chat**: Retain file changes through stream completion
- **chat**: Avoid refresh when streaming completes
- **chat**: Show file changes during streaming
- **chat**: Show thinking for each model request

## [0.24.0-beta.5] - 2026-07-23

### Features
- **startup**: Reveal restored workspace atomically
- **loading**: Add non-blocking IO skeleton states

### Bug Fixes
- **loading**: Distinguish restored chat skeletons
- **editor**: Parse plain markdown without html tags

### Styling
- **ui**: Unify selects and user messages

## [0.24.0-beta.4] - 2026-07-23

## [0.24.0-beta.3] - 2026-07-23

### Features
- **settings**: Add update check button

### Bug Fixes
- **updater**: Notify manual update checks
- **release**: Separate beta update channel

### Performance
- **messages**: Virtualize completed history

## [0.24.0-beta.2] - 2026-07-23

## [0.24.0-beta.1] - 2026-07-23

### Features
- **chat**: Animate new conversation aurora to composer
- **sidebar**: Add collapsible navigation
- **streamdown**: Show site icons in URI pills
- **chat**: Group consecutive tool calls
- **chat**: Surface pending responses and flash failures
- **terminal**: Support managed background execution
- **skills**: Use user agents directory by default
- **agui**: Preview referenced file lines
- **chat**: Move workspace picker into title bar
- **workspace**: Open workspaces in dedicated windows

### Bug Fixes
- **memory**: Make new chat greeting conversational
- **tooltip**: Wrap long hover text within viewport
- **runtime**: Persist terminal notices in checkpoints
- **chat**: Layer composer aurora above backdrop
- **chat**: Delay composer aurora until conversation starts
- **mcp**: Prevent duplicate server processes
- **chat**: Preserve composer aurora states
- **sidebar**: Float collapsed toggle over content
- **window**: Enlarge chat drag region
- **workspace**: Focus an already open workspace window
- **release**: Unify master release channels
- **streamdown**: Prevent file preview clipping
- **mermaid**: Escape message containment in fullscreen
- **chat**: Preserve answered ask user cards
- **chat**: Preserve configured turn limit
- **workspace**: Retain action order
- **models**: Delay automatic retries

### Refactoring
- **chat**: Render runtime notices as dividers

### Styling
- **workspace**: Soften current-window action

### Miscellaneous
- **tauri**: Set default-run to openagent in Cargo.toml

## [0.23.0-beta.3] - 2026-07-21

### Bug Fixes
- **chat**: Preserve configured turn limit

## [0.23.0-beta.2] - 2026-07-21

### Features
- **workspace**: Open workspaces in dedicated windows

### Bug Fixes
- **workspace**: Retain action order
- **models**: Delay automatic retries

### Styling
- **workspace**: Soften current-window action

## [0.23.0-beta.1] - 2026-07-21

### Features
- **sidebar**: Add conversation search actions

### Bug Fixes
- **chat**: Allow context compaction cancellation
- **checkpoints**: Preserve original users across compaction

### Refactoring
- **chat**: Persist append-only snapshots

### Styling
- **assets**: Update OpenAgent text logo SVG

## [0.22.0] - 2026-07-20

### Features
- **dev-api**: Add context compaction diagnostic
- **inspector**: Toggle main debug markers
- **dev-api**: Support checkpoint replay testing
- **checkpoints**: Validate frontend renderability
- **dev-api**: Streamline agent debug recovery
- **dev-api**: Expose local chat debug bridge
- **frontend**: Support multi-tool approval UI and precise card mapping
- **backend**: Support sequential multi-tool approval and dangling call resolution
- **chat**: Support real-time stream caching and checkpoint persistence
- **inspector**: Persist database table selection
- **inspector**: Add checkpoint message preview search
- **chat**: Display conversation, branch, and checkpoint IDs in debug mode
- **chat**: Persist active conversation branch
- **checkpoint**: Persist frontend-only hint messages
- **inspector**: Sort database table columns
- **chat**: Harden stream quality and rendering
- **inspector**: Preview individual database cells
- **inspector**: Add structured database record preview
- **inspector**: Trace live agent requests
- **inspector**: Integrate context compaction diagnostic into dev inspector
- **debug**: Add context compaction diagnostic command and force compaction hook
- **inspector**: Add read-only database browser
- **inspector**: Support rendering nested retry events in timeline
- **ui**: Add RetryAttempt component and integrate in MessageList
- **frontend**: Update types and state for structured retry items
- **backend**: Store structured stream items on chat retry
- **inspector**: Inject model request disconnects
- **inspector**: Record provider request traces
- **checkpoint**: Persist before rig completions
- **chat**: Show queued messages
- **chat**: Compact context during agent turns
- **compaction**: Keep summaries in conversation history
- **sidebar**: Animate active conversation threads
- **chat**: Queue messages during streaming
- **pages**: Add GitHub Pages landing site

### Bug Fixes
- **dev-api**: Count compaction system boundaries
- **assets**: Serve text logo
- **compaction**: Persist user before preflight summary
- **chat**: Resume approvals from selected branch
- **goals**: Project slash prompts at request boundary
- **approval**: Remove duplicate lifecycle classifier
- **checkpoints**: Deduplicate compaction replays
- **debug-api**: Persist debug conversation branches
- **approvals**: Serialize batched tool resumes
- **chat**: Preserve compacted checkpoint boundaries
- **branches**: Fork edits from message origin
- **chat**: Refine tool result materialization and approval resume flow
- **approvals**: Defer final multi-tool result checkpointing
- **checkpoints**: Serialize compaction snapshot updates
- **checkpoints**: Persist tool results before compaction
- **checkpoints**: Exclude original system prompt
- **chat**: Preserve stable checkpoint message identities
- **chat**: Remove transient root branch navigation
- **chat**: Retain branch switcher after recovery
- **chat**: Clear edits when switching conversations
- **chat**: Clear edits before branch switch
- **chat**: Retain branch navigation after continuation
- **chat**: Restore active branch on conversation load
- **chat**: Advance tip after partial tool approval
- **chat**: Ignore compacted tool calls on continuation
- **chat**: Retain compaction boundary position
- **chat**: Hide leading compaction divider
- **approval**: Prevent orphaned approval form flash
- **chat**: Resolve cancelled tool calls in checkpoints
- **branches**: Reset context when editing a prompt
- **checkpoints**: Drop duplicated display messages
- **chat**: Keep resumed checkpoints renderable
- **chat**: Preserve compaction boundary across rig rounds
- **frontend**: Prevent conversation flash during tool interruptions
- **ui**: Adjust message footer rendering condition
- **chat**: Preserve message identity during interrupted chat resume
- **chat**: Preserve application snapshot when appending compaction boundary
- **chat**: Replay latest text user prompt after in-flight compaction
- **chat**: Restore textual prompt after compaction
- **compaction**: Drop orphaned tool results
- **checkpoint**: Persist snapshots without parent merge
- **mermaid**: Preserve mindmap indentation
- **checkpoints**: Keep retries renderable
- **checkpoints**: Skip tool results at compaction boundary
- **checkpoints**: Render complete checkpoint snapshots
- **checkpoints**: Retain compaction replay markers
- **checkpoints**: Preserve compaction tags in cache
- **checkpoints**: Retain live history on cancellation
- **checkpoints**: Persist completed streams once
- **history**: Normalize terminal reasoning responses
- **compaction**: Preserve terminal boundary tags
- **compaction**: Persist staged request state
- **compaction**: Prevent duplicate summary retries
- **chat**: Render compacted user messages as dividers
- **compaction**: Persist compacted request boundaries
- **checkpoints**: Retain full history after compaction
- **checkpoints**: Avoid duplicate tool-turn assistant text
- **chat**: Hide checkpoint context messages
- **checkpoints**: Persist compacted system context
- **checkpoint**: Retain user prompt after compaction
- **inspector**: Contain checkpoint preview text
- **inspector**: Truncate checkpoint message previews
- **chat**: Preserve complete history in checkpoints under context compaction
- **ui**: Disable browser context menu in production builds
- **debug**: Compact checkpoint controls
- **chat**: Do not fall back to latest checkpoint for root turns to prevent branch leak
- **checkpoints**: Restore tool results and thinking
- **chat**: Limit rerun to final responses
- **checkpoint**: Preserve latest recovery state
- **inspector**: Format database timestamps
- **checkpoint**: Preserve retry turn message order
- **chat**: Restore ask user forms on branch switch
- **chat**: Avoid refresh after stream completion
- **chat**: Restore pending ask-user forms
- **chat**: Preserve branch selection on reload
- **chat**: Preserve prompt before provider response
- **checkpoint**: Repair legacy frontend hint order
- **checkpoint**: Retain frontend hint order
- **chat**: Restore immediate stream rendering
- **inspector**: Constrain cell preview panel height
- **inspector**: Restore cell preview scrolling
- **compaction**: Summarize boundary tool results
- **inspector**: Label tool result messages
- **chat**: Render legacy compaction boundaries
- **compaction**: Retain summary boundary in final checkpoints
- **backend**: Accurately tag synthetic user summary during context compaction
- **chat**: Render summary checkpoint boundary
- **chat**: Persist compaction boundary placement
- **chat**: Anchor compaction boundaries
- **chat**: Place compaction boundary in stream
- **chat**: Show context compaction boundaries
- **compaction**: Stabilize progress and boundaries
- **chat**: Resume retries from prompt checkpoints
- **logging**: Hide agent trajectories from dev console
- **chat**: Show completed compaction state
- **chat**: Persist context compaction boundaries
- **context**: Preserve tool results and display history
- **sidebar**: Render active thread as tree
- **sidebar**: Stabilize thread selection alignment
- **mermaid**: Target toolbar by class
- **sidebar**: Preserve leaf thread indentation
- **mermaid**: Keep toolbar aligned right
- **mermaid**: Restore toolbar button clicks
- **sidebar**: Align active thread path
- **context**: Resume after runtime compaction
- **sidebar**: Retain thread siblings
- **sidebar**: Expand only selected thread
- **chat**: Persist response timing after completion
- **ui**: Smooth aurora activity transitions
- **chat**: Persist response timing metadata
- **sidebar**: Restore active conversation background
- **sidebar**: Inset active conversation marker
- **sidebar**: Stabilize conversation list visuals

### Refactoring
- **checkpoint**: Remove legacy duplicate cleanup
- **chat**: Unify checkpoint provider projection
- **chat**: Split lifecycle from tool approval
- **checkpoint**: Make snapshots authoritative
- **chat**: Rename lifecycle hook
- **components**: Simplify approval rendering in ToolCallCard
- **chat**: Replace unstructured checkpoint state with typed phase and add memory cache
- **chat**: Enhance history management and checkpoint persistence in send_chat_message_inner
- **chat**: Adapt message construction and agent configuration for rig 0.40
- **agent**: Adapt AgentHook implementation for rig 0.40
- **tools**: Adapt Tool trait implementation for rig 0.40
- **checkpoint**: Store compaction as system context
- **chat**: Send projected history to provider and cache complete history in memory
- **checkpoint**: Decouple provider history projection from full deserialization
- **checkpoint**: Persist atomic message records
- **checkpoint**: Stop persisting retry hints
- **checkpoint**: Remove duplicated recovery metadata
- **checkpoint**: Remove unused token count
- **checkpoint**: Drop request context copies
- **chat**: Separate branches from checkpoints
- **chat**: Derive ask user schema from tool call
- **chat**: Render stream items independently
- **storage**: Remove legacy message compatibility
- **chat**: Remove legacy compaction fallback
- **frontend**: Streamline context compaction boundaries and timeline message trees
- **frontend**: Render new structured messages and handle compaction divider
- **commands**: Adapt commands and tools to structured checkpoint format
- **goal**: Move goal prompt builders to goal module
- **checkpoint**: Flatten checkpoint message stream and remove provider_message
- **checkpoint**: Unify persisted message stream
- **compaction**: Keep summaries in checkpoint chain
- **chat**: Derive compaction from summary message
- **checkpoint**: Tag agent-maintained messages
- **chat**: Render conversations from checkpoints
- **context**: Isolate compaction from rig
- **context**: Archive compacted checkpoints

### Styling
- **assets**: Update logo text SVG asset
- **sidebar**: Use text logo
- **tauri**: Format rust codebase with rustfmt
- Run rustfmt to format codebase
- **chat**: Tighten tool activity spacing
- **ui**: Reduce gap between messages in MessageList
- **frontend**: Wrap assistant text items in assistant-msg inside assistant-sequence
- **rust**: Format command and agent sources
- **sidebar**: Simplify active conversation tint
- **sidebar**: Distinguish active conversation state
- **sidebar**: Soften active conversation background

### Miscellaneous
- **assets**: Add openagent logo text asset
- **tauri**: Remove invalid license-file reference
- **deps**: Upgrade rig dependency from 0.36 to 0.40
- **assets**: Remove obsolete Chinese preview image
- **assets**: Remove obsolete English preview image

## [0.21.1] - 2026-07-13

### Bug Fixes
- **settings**: Prevent provider config overwrite during startup

## [0.21.0] - 2026-07-12

### Miscellaneous
- Promote v0.21.0-beta.1 to the stable release channel

## [0.21.0-beta.1] - 2026-07-12

### Features
- **memory**: Separate new conversation summary task
- **memory**: Rewrite queries for agent memory retrieval
- **inspector**: Filter all task trace kinds
- **inspector**: Trace flash agent tasks
- **inspector**: Overhaul dev inspector UI with tabs, three-column layout, and temporary UI previews
- **updater**: Update existing toast dynamically for download progress
- **toast**: Add updateToast helper to dynamically update existing toast
- **debug**: Unify inspector timeline styling
- **debug**: Add development inspector window

### Bug Fixes
- **inspector**: Render available tool definitions
- **config**: Initialize summary and trace fields
- **inspector**: Persist chat trace context
- **inspector**: Fill trace sidebar at medium widths
- **config**: Default memory retrieval setting
- **chat**: Cascade cancellation to sub-agents
- **inspector**: Trace all structured flash tasks
- **chat**: Make cancellation interrupt streams promptly
- **sandbox**: Use flash decisions without prompts
- **sandbox**: Allow unrestricted network commands
- **debug**: Load inspector from root route

### Styling
- **settings**: Refine memory task layout
- **toast**: Redesign toast component with card layout and updated border-radius

### Miscellaneous
- **web-search**: Remove local browser remnants

## [0.20.1] - 2026-07-12

### Bug Fixes
- **memory**: Use hybrid retrieval for all scopes

## [0.20.0] - 2026-07-11

### Features
- **fetch**: Paginate fetched page content
- **fetch**: Use spider for page retrieval

### Bug Fixes
- **fetch**: Register independently from web search
- **fetch**: Extract readable page text
- **i18n**: Update 'about'
- **fetch**: Request pages directly with spider

## [0.19.0] - 2026-07-11

### Miscellaneous
- Promote v0.19.0-beta.8 to the stable release channel

## [0.19.0-beta.8] - 2026-07-11

### Features
- **tools**: Enforce strict object schemas with additionalProperties false
- **goal**: Improve graph validation and detail errors on parse failure
- **ui**: Add setup guides and block chat operations when no models are configured
- **settings**: Implement debounced auto-save for draft configuration
- **settings**: Support retry queue reordering and localize model settings
- **i18n**: Add translations for model settings and retry queues
- **ui**: Support item descriptions in Select component
- **frontend**: Add UI and type definitions for split retry queues
- **backend**: Support separate retry queues for chat and flash agents
- **tools**: Support label-value objects in ask_user options deserialization
- **approval**: Add configurable approval modes
- **ui**: Display and handle tool call approval in ToolCallCard
- **frontend**: Support tool approval states and resume stream logic
- **backend**: Add tool approval kind and support explicit tool result emit on resume
- **approval**: Review all tool calls
- **ui**: Add memory source viewing and highlighting in the UI
- **context**: Include current local time to the second in memory agent preamble
- **memory**: Track conversation and message source for agent memories
- **security**: Add configurable sandbox mode
- **settings**: Configure terminal approval task
- **terminal**: Require approval for unsafe commands
- **sidebar**: Collapse utility navigation
- **chat**: Measure and display response stream generation timings
- **ui**: Add support for collapsing and expanding long user messages
- **memory**: Implement RRF hybrid search and track memory access lifecycle
- Add ScrollArea component and use it for HTML preview
- Add copy source code button for Mermaid blocks

### Bug Fixes
- **tools**: Hide web tools without configuration
- **approval**: Limit sandbox approval scope
- **terminal**: Restore approval_config in require_terminal_approval
- **ui**: Allow pointer events and text selection on memory notes
- **security**: Reject terminal sandbox escapes automatically
- **settings**: Separate sandbox and terminal approval
- **tauri**: Schedule flash agents after resumed chat

### Refactoring
- **config**: Extract and unify OpenAI base URL normalization
- **ui**: Keep settings button visible when sidebar is collapsed
- **config**: Remove default anthropic provider and support empty config
- **ui**: Remove legacy configuration fallbacks
- **config**: Remove legacy model bindings
- **storage**: Remove legacy persistence paths
- **config**: Tie tool approval enablement to approval mode and remove UI toggle
- **tauri**: Simplify tool approval logic by removing LLM classifier and regex rules

### Documentation
- Update README table of contents and update banner asset
- **i18n**: Update tool approval descriptions and placeholders

### Styling
- **frontend**: Adjust empty state layout in MessageList
- Adjust user message index width in MessageList

### Miscellaneous
- **i18n**: Add translations for empty conversations and model setup
- **license**: Adopt GPL commercial dual licensing
- **providers**: Log raw ask_user arguments before deserialization
- **deps**: Add hnsw_rs dependency

## [0.19.0-beta.7] - 2026-07-09

### Features
- **memory**: Queue pending flash agent runs and schedule execution sequentially
- **tools**: Support objective and persist goal run in CreateGoalGraphTool
- **tools**: Emit goal-run-updated event in UpdateGoalStatusTool
- **tools**: Add CreateGoalTool to track conversation goals

### Refactoring
- **tools**: Deduplicate unix_now_secs and fix mutability warning

## [0.19.0-beta.6] - 2026-07-09

### Features
- Improve message auto-scroll with ResizeObserver and interaction cancellation
- Add user message navigation index sidebar in MessageList

## [0.19.0-beta.5] - 2026-07-09

### Bug Fixes
- **tauri**: Allow flash tools without required choice

### Styling
- **layout**: Introduce --sidebar-width variable and optimize messages container overflow
- **ui**: Enhance new conversation view with aurora background and animations

## [0.19.0-beta.4] - 2026-07-09

### Features
- **frontend**: Implement memory management UI and settings view
- **i18n**: Add translations for memory management
- **api**: Add commands for memory backup, restore, clear, and file reading
- **memory**: Add database query, deletion and insertion for agent memories

## [0.19.0-beta.3] - 2026-07-09

### Features
- **ui**: Display homepage memory reminder and refine input glow styling
- **backend**: Migrate structured output to tool calls

## [0.19.0-beta.2] - 2026-07-08

### Features
- **agent**: Add robust JSON candidate extraction and flexible hook recurrence normalization
- **agent**: Enforce clean JSON outputs in agent preambles

### Testing
- **agent**: Add env-configured structured output integration tests

### Styling
- **sub-agent**: Reorder imports

## [0.19.0-beta.1] - 2026-07-08

### Features
- **ui**: Display memory prompt for new conversations in message list
- **memory**: Fetch and construct agent memory prompts for new conversations
- **message-input**: Add streaming and idle ambient glow animation
- **memory**: Support collapsible and resizable panels in MemoryView
- **frontend**: Integrate auto-updater and check for updates on startup
- **tauri**: Add updater plugin and app restart command
- **chat**: Implement smooth scroll on conversation switch and stabilize auto-scroll
- **assets**: Add new openagent logo, icon, and banner
- **ui**: Rename agents to tasks and enhance compaction settings layout
- **compaction**: Support structured output and custom extra prompt for context compaction
- **tasks**: Migrate flash tasks to structured outputs and deduplicate scheduled hooks
- **memory**: Implement similarity-based filtering and deduplication
- **ui**: Add rich interactive previews for developer tools in ToolCallCard
- **ui**: Support native style rendering and toggleable expanded height in HTML preview
- **frontend**: Add HTML preview settings to config and UI
- **backend**: Add HTML preview config and update system prompt and tool description

### Bug Fixes
- **html-preview**: Improve height calculation for HTML export
- **html-preview**: Improve PNG export layout and scroll restoration

### Refactoring
- **memory**: Centralize AgentMemoryEntry interface in types.ts
- **html-preview**: Remove default expanded configuration option

### Styling
- **message-input**: Adjust layout, z-index, and transitions for layering
- **sidebar**: Improve app icon dragging and selection behavior
- **components**: Replace text chevron with SVG and wrap Tooltip button with snippet trigger

### Miscellaneous
- **assets**: Update application icons and logos

## [0.18.1] - 2026-07-07

### Bug Fixes
- **streamdown**: Improve Mermaid SVG layout sizing and panzoom fitting

### Refactoring
- **streamdown**: Change Mermaid target element from svg to div

### Styling
- **streamdown**: Customize Gantt chart theme configurations and styles
- **streamdown**: Update Mermaid download menu selectors and styles

## [0.18.0] - 2026-07-05

### Features
- **frontend**: Parse and render reasoning processes with collapsible details
- **agent**: Stream reasoning steps and parse inline thinking tags for main & sub agents
- **backend**: Support serialization and persistence of reasoning messages
- **telemetry**: Add tracing instrumentation and GenAI metrics to resume_interrupted_chat
- **chat**: Support run_kind parameter and add tracing instrumentation to chat_run
- **chat**: Capture and persist chat response stream items including tool calls
- **html-preview**: Make HTML preview default to expanded and remove height limits

### Refactoring
- **chat**: Pre-generate assistant message ID and implement sqlite upsert on conflict

## [0.17.0] - 2026-07-05

### Features
- **tauri**: Support multi-turn iteration for graph planning

### Refactoring
- **tauri**: Split commands.rs into submodules
- **tauri**: Clean up redundant loop user messages and optimize prompts in goal and graph node execution

## [0.16.0] - 2026-07-05

### Features
- **goal**: Add validation for goal status updates and goal graph configs
- **frontend**: Display context compaction status and stages in chat interface
- **backend**: Support forced context compaction and emit compaction progress events
- **editor**: Support image pasting via tauri assetProtocol and MDX image plugin

### Refactoring
- **goal**: Extract goal definitions and helper functions into a dedicated module

## [0.15.0] - 2026-07-04

### Features
- **frontend**: Prevent auto scroll-to-bottom when user scrolls up during streaming
- **tauri**: Support specifying tool choice in chat commands

## [0.14.0] - 2026-07-04

### Features
- **ui**: Add rich interactive previews for developer tools in ToolCallCard
- **ui**: Support native style rendering and toggleable expanded height in HTML preview
- **frontend**: Add HTML preview settings to config and UI
- **backend**: Add HTML preview config and update system prompt and tool description
- **frontend**: Load and preview local HTML files in Html component
- **backend**: Add support for rendering local HTML files in render_html tool
- **ui**: Add visual icons for flow types in conversation list and mention list
- **graph**: Execute goal graph directly from tool with node iteration
- **chat**: Add fallback model retry queue and message deletion on retry

### Documentation
- **prompt**: Update system instructions to prefer workspace file path for render_html

### Styling
- **components**: Replace text chevron with SVG and wrap Tooltip button with snippet trigger

### Miscellaneous
- **config**: Change default model retry count to 3
- **license**: Update package metadata license fields

## [0.13.0] - 2026-07-01

### Features
- **frontend**: Integrate goal/graph run execution and live status updates
- **backend**: Implement goal loop, graph execution, and custom tools
- **database**: Add goal_runs schema and update conversation metadata
- **context**: Inject UI design guidance from DESIGN.md into system prompt

### Miscellaneous
- **license**: Update package metadata license fields

## [0.12.1] - 2026-07-01

### Bug Fixes
- **editor**: Sync external value changes to MDX editor

## [0.12.0] - 2026-06-30

### Features
- **goal**: Add goal command and related translations for goal loop functionality
- **mermaid**: Implement custom local Mermaid component with panzoom

### Styling
- **components**: Remove redundant 'cmd' icon from ToolCallCard

## [0.11.0] - 2026-06-25

### Features
- **frontend**: Inherit theme, enforce security guards, and support image export in Html component

### Refactoring
- **backend**: Update render_html tool definition and system prompt context

## [0.10.0] - 2026-06-25

### Features
- **frontend**: Render html preview in ToolCallCard for render_html tool
- **backend**: Implement and register render_html tool
- **ui**: Replace Card with Html preview component and support slash compact command
- **tauri**: Add compact_conversation command for manual context compaction
- **frontend**: Support conversation compaction and tree rendering in UI
- **backend**: Integrate context compaction and recall_tool_server state
- **tool**: Support lineage-based message recall in SearchConversationMessagesTool
- **db**: Add compacted_from_conv_id to conversations table
- **mention**: Add configuration to toggle global drafts in mention palette
- **ui**: Scroll active item in MentionPalette into view
- **title**: Handle title source precedence and use versioned generation
- **frontend**: Support ignored-aware mentions and drafts
- **frontend**: Integrate UI controls for context compaction and title agent
- **tauri**: Implement context compaction and title flash agent
- **tauri**: Add search_conversation_messages tool for conversation recall

### Bug Fixes
- **frontend**: List scoped drafts in mention palette

### Refactoring
- **components**: Simplify layout of ToolCallCard for HTML previews
- **preview**: Redesign HTML component with auto-height and floating actions
- **context**: Update system prompt to recommend render_html tool over AGUI Html

### Documentation
- Replace Card component with sandboxed Html preview in docs and prompts

### Styling
- **settings**: Enhance execution settings layout
- **mention**: Refine layout and typography of MentionPalette

### Miscellaneous
- Add html-to-image dependency
- Migrate package manager and script runner to Bun

## [0.9.0] - 2026-06-25

### Features
- **frontend**: Add option to open workspace location in file manager
- **frontend**: Support custom dropdown placement in Select component
- **design**: Implement DESIGN.md editing panel and sidebar entry
- **scope**: Support global and local scopes in drafts, memory, and skills
- **select**: Support searchable select and enable it for model choice

### Bug Fixes
- **editor**: Improve paste handling, list styles, and add table support in markdown editor

## [0.8.0] - 2026-06-24

### Features
- **frontend**: Add settings UI and i18n for agent turn limit
- **backend**: Support agent turn limit configuration in chat stream

### Bug Fixes
- **chat**: Ensure checkpoint state reflects current user message and handle cancelled turns correctly

## [0.7.0] - 2026-06-24

### Features
- **attachments**: Implement attachment handling with paste support and size limits
- **chat**: Support multi-model selection and multimodal file attachments

### Bug Fixes
- **drafts**: Ensure project drafts directory exists and fix canonicalization on Windows

## [0.6.0] - 2026-06-23

### Features
- **frontend**: Implement drafts view and integrate sidebar navigation
- **backend**: Implement APIs and localization for project drafts
- **ui**: Add settings panel and i18n for flash agents
- **agent**: Implement hook agent and multi-agent execution
- **config**: Add flash agents configuration schema
- **ui**: Integrate MdxMarkdownEditor into MemoryView and SkillsView
- **editor**: Implement MdxMarkdownEditor component with styling

## [0.5.0] - 2026-06-22

### Features
- **frontend**: Handle assistant message ID from backend in scheduled chat hooks
- **backend**: Persist messages and create new conversation by default for background chat hooks

### Miscellaneous
- Update dependencies

## [0.4.0] - 2026-06-17

### Features
- **workflows**: Enhance release and version workflows for better tagging and triggering

## [0.3.0] - 2026-06-17

### Features
- Add linting for GitHub Actions and update README instructions
- **app**: Restore persisted scheduled chat hooks on application startup
- **commands**: Persist updated scheduled chat hooks upon cancellation
- **tools**: Implement save, load, and restore functionality for scheduled chat hooks
- **autostart**: Add launch on startup support
- **i18n**: Implement internationalization for hooks
- **frontend**: Add scheduled chat hooks UI and handle background trigger events
- **backend**: Implement scheduled chat hooks, agent memory tools, and flash agent renaming
- **frontend**: Implement system tray and hide window on close
- **tauri**: Add quit_app command and config tray capabilities
- **history**: Implement message comparison and history merging functions
- **context**: Add ask_user tool guidance to system prompt for user interactions
- **MessageInput**: Enhance focus management on textarea during mount and state changes
- **i18n**: Support English language for system prompts and memory tasks

### Bug Fixes
- **i18n**: Update Chinese language label from '涓枃' to '中文'
- **tray**: Prevent duplicate tray icon instances

### Refactoring
- **state**: Add serialization and schema for scheduled chat hooks

### Documentation
- Add release process documentation

### CI/CD
- **release**: Add automated version bumping and release flow

### Miscellaneous
- **git**: Add commit-msg hook and message validation

## [0.2.5] - 2026-06-14

### Bug Fixes

- **MessageInput**: Reorder button attributes for better accessibility
- **chat**: Persist stream errors in completion
- **chat**: Surface stream errors in the client
- **backend**: Preserve pre-turn history in checkpoints for cancelled turns

### Features

- **chat**: Collapse agent process details after completion
- **tools**: Validate fetch urls and enforce timeout
- **memory**: Normalize and deduplicate agent memory content
- **frontend**: Persist assistant message stream drafts incrementally
- **backend**: Implement persistent chat interrupt and resume mechanism
- **frontend**: Render ask_user form inline within message stream
- **components**: Add UserInputSummary component and integrate into MessageList
- **backend**: Implement syncAgentHistoryToActivePath function to restore agent history

### Miscellaneous

- **assets**: Add rounded corners to priview_en.png
- **assets**: Add rounded corners to priview_zh.png
- **assets**: Fix dark fringe on rounded corners with supersampled anti-aliasing
- **icons**: Update icon.ico with new design
- **assets**: Replace Windows icon with openagent_transparent.png (10-size ICO)
- **.gitignore**: Add .antigravitycli to ignore list
- **i18n**: Add agent process details label
- **lockfile**: Update bun lockfile metadata

### Refactoring

- **backend**: Preserve high-fidelity rig tool calls/results in checkpoint history

### Styling

- Format codebase with rustfmt
- **UserInputForm**: Remove hand emoji from header

## [0.2.4-beta.1] - 2026-05-19

### Documentation

- **claude**: Document release process and version constraints
- **claude**: Update remote names in release process docs
- **claude**: Remove remotes section and internationalize all Chinese text
- **readme**: Remove all emojis from English README
- **readme**: Remove all emojis from Chinese README
- **readme**: Add preview screenshot to English README
- **readme**: Add preview screenshot to Chinese README

### Miscellaneous

- **version**: Bump in-app version label to 0.2.0-beta.2
- Bump version to 0.2.4-beta.1

### Refactoring

- **settings**: Refresh About tab and trim redundant tab headings

### Styling

- **ui**: Normalize border-radius, padding, and font-size on Select and Combobox
- **settings**: Normalize input and button border-radius, padding, and font-size
- **shell**: Reshape primary buttons to pill and add btn-secondary active and sm variants
- **sidebar**: Compact new-conversation button with left-aligned label
- **ui**: Tighten Select and Combobox item padding and radius
- **workspace**: Tighten dropdown and item padding and radius
- **settings**: Tighten sidebar tab and context menu padding and radius
- **tokens**: Add item-selected design tokens and fix ctx-menu hover/selected overlap
- **ui**: Fix hover/selected overlap in Select and Combobox items
- **mention-palette**: Fix hover/selected overlap in palette rows
- **workspace**: Fix hover/selected overlap in workspace dropdown items
- **settings**: Fix hover/active overlap in nav tabs, provider list, and ctx-menu

## [0.2.0-beta.2] - 2026-05-19

### Bug Fixes

- **sub_agent**: Remove unused embedding_model field from SpawnAgentTool
- **windows**: Suppress console window flash for all subprocesses
- **build**: Revert tauri version to numeric-only for MSI compatibility

### Documentation

- **readme**: Reflect sub-agent, Jina fetch, and CI release changes
- **readme**: Document ask_user interactive prompts and AGUI inline components

### Features

- **settings**: Add right-click delete context menu to MCP server list

### Miscellaneous

- Add @types/node, remove unused CSS class and ts-expect-error
- Bump version to 0.2.0-beta.2
- Update Cargo.lock for v0.2.0-beta.2

### Refactoring

- **workspace**: Rename .agent dir to .agents across all references

## [0.2.0-beta.1] - 2026-05-19

### Bug Fixes

- Correct directory name for local skills path
- **config**: Remove stale 'local' web search provider from frontend
- **config**: Add migrate_raw layer in load_config for schema migrations
- **memory**: Skip memory agent and restore history on cancelled turns
- **subagent**: Show initial task message and prevent title overwrite
- **settings**: Enhance provider item URL styling for better readability
- **i18n**: Add search models translation for zh and en locales
- **subagent**: Persist task and assistant messages as ChatMessageRecord in Rust

### Documentation

- Update UI guidelines to prioritize bits ui
- Update repository activity image in README files

### Features

- **sub-agent**: Add spawn_agent tool with nested sub-conversation UI

### Miscellaneous

- Add 'todo' to .gitignore to exclude temporary task files
- Bump version to 0.2.0

### Refactoring

- **tools**: Replace headless-Chrome fetch/search with Jina Reader and API-only websearch

## [0.1.0-beta.1] - 2026-05-18

### Bug Fixes

- **ui**: Replace sidebar app-icon with openagent_transparent.png
- **icons**: Add squircle alpha mask to icon source for correct macOS Dock display

### CI/CD

- Add GitHub Actions release workflow with alpha/beta/stable channels
- **actions**: Opt into Node.js 24 for all JavaScript actions
- **actions**: Cross-compile x86_64 macOS on arm64 runner

### Documentation

- **readme**: Add Simplified Chinese translation
- **readme**: Remove repo stats badges and preview section

### Features

- **ui**: Move git branch badge to title bar
- **icons**: Regenerate app icons from openagent.png and add logo to title bar

### Miscellaneous

- Initial public release
- **license**: Add LICENSE file
- Update bun.lock
- Move root-level images into assets/ directory
