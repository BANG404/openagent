# Plugin configuration and authorization

`extensions.openagent.configuration` is optional, with `version: 1` and at
most 64 `fields`. Require `configuration-v1` in `compatibility.features`
alongside the verified `plugin_protocol` range. Recognized optional features
are `configuration-v1` and `plugin-oauth-v1`; unknown features reject a package.

Each field declares a unique `key`, non-empty `label` and a `type` of `string`,
`boolean`, `integer` or `enum`. Optional members are `description`, `required`,
`secret`, `default`, `options`, `minimum`, `maximum`, `env` and `mcp`.
Enums need 1–64 string options. Integers and bounds must be JavaScript-safe
integers; strings have a 16 KiB UTF-8 limit and cannot contain NUL. Defaults
must match their type and bounds. A secret is a string without a package default.
Required fields are shown as missing until set; a saved false boolean is set.
Packages must keep their setup diagnostics usable before account credentials exist.

Ordinary bindings default to `PLUGIN_CONFIG_<UPPERCASE_KEY>` with hyphens
changed to underscores, or use an explicit uppercase environment name.
Bindings may not overwrite process identity, the Host Bridge, executable lookup
or loader variables. Values are supplied only to the owning plugin's stdio MCP,
commands, hooks and daemon launches. Existing daemons require an explicit restart.
Saving reconnects MCP and reloads hook declarations; it does not broaden permissions.

An alternative `mcp: {server, property}` binding targets a named HTTP server in
that package. Allowed properties are `oauth_client_id`, `oauth_scope` and
`bearer_token`. Only `bearer_token` is secret. An MCP binding cannot also declare
`env`, name an absent server, or repeat another field's server/property pair.
Endpoint URLs and server identity remain owned by `mcp.json`. Changing a bound
parameter disconnects that server's old local OAuth authorization before reconnecting.

User values live separately at `<OPENAGENT_HOME>/plugin-settings/<id>.json`.
They survive package replacement and uninstall. Writes are atomic and serialized
per plugin; opaque revisions reject stale saves. Responses expose ordinary
values, secret presence and invalid/missing field names, never secret values.
An omitted secret patch retains the saved value; explicit null clears it.
If an update narrows a field, settings remains available for repair and process
launch rejects the invalid saved value. Removed fields remain recoverable in storage.
Windows uses current-user DPAPI; Unix creates 0700 directories and 0600 files.
Existing OAuth JSON remains readable and gains protection on its next write.
Filesystem links are rejected. Windows protected state is user-bound and is not
a portable credential export; Unix permissions do not provide encryption at rest.

HTTP connector actions test capability before offering OAuth, open the system
browser and poll status, then reconnect and test the authenticated transport.
Disabled plugins cannot start a connection or authorization, but can disconnect.
Disconnection cancels pending callbacks, removes local tokens and reconnects
without them; a late callback or refresh must not restore a disconnected token.
Provider grant revocation remains in the provider's account controls.
Public client registration and PKCE are supported; confidential client secrets
and Client ID Metadata Documents are not configuration fields.

Translate field labels/descriptions with `configuration.<key>.label` and
`configuration.<key>.description` in every declared plugin locale. Test a real
configuration save/reopen/clear, conflict and repair, OAuth success/denial/cancel,
authenticated primary tool and reconnect with isolated home and mock provider.
Then qualify account-specific operations against the actual provider separately.
Use `test:blackbox:plugin-setup` for the committed native settings scenario in
light/dark and Chinese/English; keep secrets out of captures and reports.
