# Shared product-host contract

- Treat Tauri/Svelte and GPUI as product hosts over the same public SDK facade.
  GPUI must consume the SDK startup bootstrap, runtime event stream, settings,
  workspaces, roles/models, conversations, and durable checkpoints; it must not
  duplicate the runtime state machine, transport definitions, configuration or
  database ownership, flow selection, or slash-command parsing.
- Restore the complete durable host snapshot before subscribing to runtime
  events. Treat events as lossy live projections rather than an authoritative
  store or replay log. On terminal and checkpoint events, reload and reconcile
  the relevant durable conversation/checkpoint state; do not infer final state
  from event delivery or compensate with a host-local runtime state machine.
  The external desktop Runtime proxy stops delivery when its SSE subscriber
  lags or disconnects, emits `runtime-resync-required`, and resumes the stream
  only after the route has restored and applied a fresh startup bootstrap.
- Submit every ordinary chat message and slash command from either host through
  `submit_agent_input` so runtime routing and command semantics remain shared.
- When the route is loaded from a versioned production frontend resource,
  confirm the exact `frontend-version` with the host immediately after mount.
  Confirmation is a resource-health handshake, not durable chat restoration;
  normal bootstrap still restores the complete snapshot before event use.
- Product pages must not create or own the system tray. The native desktop host
  owns tray lifetime, Show, close-to-hide, and Quit so hidden or reloaded
  WebViews cannot leave a visible tray whose actions no longer have a live
  JavaScript channel.
- Use Tauri/Svelte as GPUI's visual and functional parity source. GPUI
  intentionally omits the decorative aurora glow while preserving shared
  geometry, neutral selection fill, semantics, accessibility, and pointer and
  keyboard interactions.
