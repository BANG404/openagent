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
```

The context is an allowlist, not access to the whole application. Do not expect transcript text, model output, private diagnostics, or another plugin's state. The `files` capability, if requested, provides metadata rather than file contents. For persistent conversation controls instead of an iframe, see [conversation UI](https://github.com/BANG404/openagent-plugin-kit/blob/main/docs/conversation-ui.md).

## Declare real language coverage

Extend `extensions.openagent.i18n` with supported locales, a default in that list, and equivalent translation keys. Sidebar metadata uses `sidebar.example-panel.title`; changing the ID requires changing that key in every locale. Translate panel content, loading, errors, accessibility labels, and future notices as well.

OpenAgent currently uses `en` and `zh` as platform locale IDs. A package may support a subset. Match the host locale exactly, then its base language, then your declared default. Do not override the host with `navigator.language`, add a separate language selector, or advertise translations based only on documentation or a model's language ability.

## Acceptance

```sh
bun tools/openagent-plugin-kit/scripts/validate-plugin.mjs plugins/notes-panel --require-i18n
```

Install the package and open its panel. Switch conversations and verify scope isolation. Switch English/Chinese and light/dark themes while the panel remains open; preserve input, selection, and stored data. Reopen and re-enable the package to check initialization. If a platform language is unsupported, the card must explain the actual fallback language rather than claiming full support.
