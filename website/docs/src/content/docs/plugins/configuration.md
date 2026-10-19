---
title: Configuration and authorization
description: Add a settings form, bind private values to your own processes, and connect an HTTP MCP service.
---

Use host-rendered configuration for values users must supply after installation. Keep defaults and field definitions in the package; keep user values outside the archive. This chapter builds on [MCP tools](../mcp/).

## Add a settings form

Merge this fragment into `extensions.openagent` of `notes-tools/plugin.json`, preserving its existing capabilities and i18n:

```json
{
  "compatibility": {
    "plugin_protocol": { "min": 1, "max": 1 },
    "features": ["configuration-v1"]
  },
  "configuration": {
    "version": 1,
    "fields": [
      { "key": "api-token", "label": "API token", "type": "string", "secret": true, "required": true },
      { "key": "limit", "label": "Result limit", "type": "integer", "default": 20, "minimum": 1, "maximum": 100 }
    ]
  }
}
```

Add `configuration.api-token.label` and `configuration.limit.label` to **every** declared locale's translations. If a field has a `description`, add `configuration.<key>.description` too. Keep existing required features when extending a package.

Fields support `string`, `boolean`, `integer`, and `enum`. Keys and bindings must be unique, and secrets are strings without package defaults. A required field remains missing until set; a saved `false` is a valid boolean value. See [the configuration reference](https://github.com/BANG404/openagent-plugin-kit/blob/main/docs/configuration.md) for bounds and enum declarations.

## Consume values in your process

The default bindings in this example are `PLUGIN_CONFIG_API_TOKEN` and `PLUGIN_CONFIG_LIMIT`:

```js
const token = process.env.PLUGIN_CONFIG_API_TOKEN;
const limit = Number(process.env.PLUGIN_CONFIG_LIMIT ?? '20');
// Keep setup/status tools usable without a token.
// Return an actionable configuration-required result for account operations.
```

These values go only to this package's stdio MCP, commands, hooks, and daemon launches. Use an explicit `env` only when a library needs another permitted uppercase name. Saving reconnects MCP and reloads hooks; an already running daemon needs an explicit restart.

OpenAgent stores values separately in `plugin-settings/<id>.json` under its active home. Settings survive package replacement and uninstall. Windows protects secrets with current-user DPAPI; Unix uses private directory/file permissions. Never read this file directly from a plugin or ask users to paste credentials into `plugin.json`.

An untouched blank password box preserves its saved secret. **Clear**, followed by **Save**, removes it. Stale saves are rejected so another settings editor cannot silently overwrite a newer value.

## Connect an HTTP service

Declare the service in root `mcp.json`, for example:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  "mcpServers": {
    "service": { "type": "streamable-http", "url": "https://api.example.com/mcp" }
  }
}
```

Replace the illustrative endpoint with your provider's actual MCP endpoint. Use HTTPS; legacy HTTP+SSE is not supported. If the provider requires a user-supplied bearer token, bind a secret string field with `"mcp": {"server": "service", "property": "bearer_token"}` instead of `env`. The server must exist in this package. Allowed HTTP bindings are `bearer_token`, `oauth_client_id`, and `oauth_scope`; only the bearer token is secret.

For browser OAuth, also require `plugin-oauth-v1`. Declare only the provider's necessary discovery/public-client hints (`oauth_resource`, `oauth_authorization_server`, `oauth_client_id`, `oauth_scope`) in its MCP entry. The Runtime owns discovery, browser callback, token storage, refresh, and reconnection. Public-client PKCE and dynamic registration are supported; confidential client secrets and CIMD are not supported configuration fields.

Users test the connection and authorize from the installed plugin's settings. Changing bound client/scope values disconnects the previous local authorization. Local **Disconnect** removes local tokens; revoking the provider grant is a separate action in the provider account.

## Verify setup separately from service behavior

Validate the package, install it, save/reopen/clear its settings, and test missing and invalid values. For OAuth, exercise success, denial, cancellation, disconnect, and reconnect with an isolated mock provider. Then call an authenticated **primary service tool** against the real provider where an account is available.

A successful setup/status tool proves setup diagnostics work. Record real account operations as untested if you have no account. Continue with [commands and hooks](../commands/), or use the [local debugging checklist](../local-development/).
