---
title: Sidebar and internationalization
description: Build a sandboxed view that follows scoped host context, theme, and locale.
---

## Scaffold the panel

```sh
bun tools/openagent-plugin-kit/scripts/new-plugin.mjs notes-panel --template sidebar-panel --dir plugins
```

The package supplies `ui/panel.html` and a sidebar declaration. Keep the template's complete manifest, then adapt its entry:

```json
{
  "id": "example-panel",
  "title": "Example panel",
  "entry": "ui/panel.html",
  "scope": "conversation",
  "capabilities": ["conversation", "locale", "theme"]
}
```

This fragment is one item in `extensions.openagent.sidebar`; the top-level extension also declares `capabilities: ["sidebar"]`. Use `global`, `workspace`, or `conversation` scope to match your view's state boundary.

## Consume only declared context

The UTF-8 HTML runs in a sandboxed iframe. The host posts version-one `openagent:sidebar-context` messages after load and when context changes. Validate the sender and payload before using them:

```js
addEventListener('message', (event) => {
  const context = event.data;
  if (event.source !== parent || context?.type !== 'openagent:sidebar-context' || context.version !== 1) return;
  if (typeof context.locale !== 'string') return;
  document.documentElement.dataset.hostLocale = context.locale;
  // Resolve your supported locale, update visible strings, and preserve input.
  // Apply context.theme when declared; scope state by context.conversation_id.
});
parent.postMessage({ type: 'openagent:sidebar-ready', version: 1 }, '*');
```

Register the listener before sending the ready notification. The context is an allowlist, not access to the whole application. Do not expect transcript text, model output, private diagnostics, or another plugin's state. The `files` capability, if requested, provides metadata rather than file contents. Request `branch` too when state must follow `branch_id`; conversation scope alone does not identify a branch.

## Choose panel or inline conversation UI

| Surface | Context and lifetime | Interaction |
| --- | --- | --- |
| Sidebar | Scoped workspace/conversation view; `openagent:sidebar-context` | Declared context and the host-mediated package-tool bridge |
| Conversation UI | A persisted checkpoint record; `openagent:conversation-ui-context` | Props updates through its versioned state/result channel |

For package-tool calls, request `workspace` and follow the [sidebar bridge contract](https://github.com/BANG404/openagent-plugin-kit/blob/main/docs/plugin-format.md#sidebar). Calls target the owning plugin's tools and require the active workspace. Never expose a process Host Bridge token to HTML.

For a persistent inline status card, declare `ui_components` with `id`, `version: 1`, `title`, and a contained HTML `entry`. An authenticated process first probes `host.conversation.ui.capabilities()`, then uses `host.conversation.ui.set()` with a stable local record ID, component identity, props, and a nonempty text fallback. Reusing the ID updates its original slot; a new ID appends.

The inline document is self-contained with scripts/styles inside it; its sandbox has no network or host token. Validate source/type/version, consume live locale/theme/props, and wait for a matching successful `openagent:conversation-ui-state-result` before showing a draft as saved. Package removal or an unsupported component shows the persisted fallback. Full declarations and payloads are in the [conversation UI guide](https://github.com/BANG404/openagent-plugin-kit/blob/main/docs/conversation-ui.md).

## Show a panel when its workflow is relevant

Optional sidebar `activation_tools` lists exact exposed tool names. The view appears after a matching assistant tool call on the selected branch, or a matching package-owned flow projection. Other branches do not activate it. Without this declaration, normal scope availability applies. Graph is a useful example of a view associated with its workflow; do not use this field as a permission check.

## Declare real language coverage

Extend `extensions.openagent.i18n` with supported locales, a default in that list, and equivalent translation keys. Sidebar metadata uses `sidebar.example-panel.title`; changing the ID requires changing that key in every locale. Translate panel content, loading, errors, accessibility labels, and future notices as well.

OpenAgent currently uses `en` and `zh` as platform locale IDs. A package may support a subset. Match the host locale exactly, then its base language, then your declared default. Do not override the host with `navigator.language`, add a separate language selector, or advertise translations based only on documentation or a model's language ability.

## Acceptance

```sh
bun tools/openagent-plugin-kit/scripts/validate-plugin.mjs plugins/notes-panel --require-i18n
```

Install the package and open its panel. Switch conversations and verify scope isolation. Switch English/Chinese and light/dark themes while the panel remains open; preserve input, selection, and stored data. Reopen and re-enable the package to check initialization. If a platform language is unsupported, the card must explain the actual fallback language rather than claiming full support.
