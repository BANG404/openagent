# Plugin conversation UI standard

Conversation UI is an optional plugin-protocol-1 capability. Probe
`conversation.ui.capabilities`; a version-1 response advertises built-ins and
payload bounds. Handle unsupported-operation errors when connected to an older
Runtime. Portable message policy declarations continue to work; display-only
notices now use the common UI record rather than authored user messages.

Declare custom components under `extensions.openagent.ui_components`:

```json
[{"id":"status","version":1,"title":"Status","entry":"ui/status.html"}]
```

Each entry requires only those four fields. IDs are unique portable IDs,
version is 1 and entry is contained HTML/HTM. A bad component disables only that
component. Put scripts/styles inside the document; its frame cannot fetch assets.
Use `conversation.ui.set` from the authenticated process Host Bridge:

```json
{"conv_id":"conversation","branch_id":"branch","id":"progress","ui":{"version":1,"component":"plugin:demo:status","props":{"progress":50},"fallback":"Progress: 50%"}}
```

The same ID updates the original slot; another ID appends. Runtime assigns
owner and asset entry. `builtin.divider` accepts string title/detail/tone;
`builtin.notice` accepts string title/text/tone. Tone is neutral or danger.
Props are a JSON object, the envelope is at most 64 KiB, and nonempty fallback
is at most 4096 UTF-8 bytes. Runtime stores component identity and props in
checkpoint format 2 and excludes UI from the provider projection.

An opaque-origin iframe receives `openagent:conversation-ui-context` with
version 1, message_id, conversation_id, branch_id, component, props, locale
and theme. Verify `event.source === parent` and the type/version before using
context. A ready notification requests context again after frame bootstrap.
Host sends live locale/theme/props updates without remounting. The frame replies
with version 1 and the current message_id:

- `openagent:conversation-ui-ready`: request current context.
- `openagent:conversation-ui-resize`: finite height, clamped to 80–720px.
- `openagent:conversation-ui-state`: string request_id (at most 128 characters)
  and replacement object props. Wait for `openagent:conversation-ui-state-result`
  with matching request_id and `ok` before displaying a saved state.

No bridge token, network, parent DOM, local storage, popups or native capability
is granted to the document. State writes use the typed product operation and
the same Runtime checkpoint path. Missing/disabled packages and unsupported
component versions show persisted fallback; uninstall never erases UI history.
Plugins should keep component IDs and compatible prop schemas across updates.
Test save, reload, selected/sibling branches, cancellation, package removal,
fallback and every advertised locale. Publish authoring schema and examples in
Plugin Kit alongside the Runtime contract.
