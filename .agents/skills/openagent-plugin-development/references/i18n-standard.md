# Plugin internationalization standard

This reference owns language requirements for plugin authoring, presentation,
and release qualification. They apply to official and third-party packages,
including packages without custom UI. Requirements below are acceptance
criteria; the implementation boundary at the end records the shared contract.

## Declare and display supported languages

Every plugin must declare a non-empty, unique supported UI locale list and a
default locale contained in that list as package presentation metadata.
Advertise a language only when every applicable user-visible surface has
complete translations. Translated documentation or a model's ability to answer
in a language does not establish UI support. Packages without custom UI still
cover their host-visible metadata, commands, and notices.

Use the platform's locale identifiers for platform languages. The source of
truth is `src/lib/platformLocales.json`, exposed as `Locale` in
`src/lib/i18n.ts`, currently `zh` (Chinese) and `en`
(English); additional languages use valid BCP 47 tags. Validate declarations
at the package boundary and carry the normalized list and default through the
typed descriptor and marketplace projection. Do not infer support from a
README, repository name, browser language, or unvalidated JSON.

Marketplace and installed-plugin cards must visibly show the complete
supported-language list, including before installation. Show readable language
names, using native names where useful (`中文`, `English`), rather than codes
alone. The surrounding label follows the platform language. Catalog and package
declarations must agree; installation and updates refresh the list from the
validated package. Missing declarations display unknown support, never full
language support.

## Follow the platform locale

The resolved application locale is authoritative, including when the platform
setting follows the system language. Plugins consume it on first mount, every
language change, reopening, re-enablement, and restoration. They must not keep
an independent UI language setting or override host context with
`navigator.language`.

Resolve an exact supported tag, then its supported base language, then the
declared default, consistently across surfaces. A third-party plugin using
fallback must show its actual display language and explain the unsupported
platform language on its card. Fallback does not expand advertised support.

Switch visible text live without restart, reinstall, disable/enable, or loss
of input, selection, scoped state, or package data. Future notices use the
current locale. Historical messages, user content, code, user-authored names,
and protocol identifiers keep their original values.

Use shared versioned host channels:

- Sidebar views request the `locale` capability and consume `locale` from
  `openagent:sidebar-context` version 1 on iframe load and subsequent updates.
  Validate the parent sender, message type, version, and locale.
- MCP Apps consume `hostContext.locale` during initialization and
  `ui/notifications/host-context-changed`; OpenAI-compatible widgets use the
  corresponding host locale and context-change notification.
- Host-rendered descriptions, command labels, sidebar titles, accessibility
  text, empty/loading/error states, and plugin-produced user-visible notices
  follow that same locale. Processes producing notices need the current locale
  through a shared typed host contract; daemon-start environment alone cannot
  provide live updates.

Localize presentation while keeping plugin/command/tool IDs, policy tags,
routing, permissions, and state schemas stable. Model-facing Skills and tool
instructions do not establish UI coverage or authorize translating user data.

## Official release requirements

Official plugins must support **every language the platform supports**,
currently complete `zh` and `en`. Derive the required set from the platform,
not a permanent two-language allowlist. A new platform language requires
translations and qualification for every official package before the
corresponding platform and official-package releases are qualified together.

Coverage includes all applicable host metadata, commands, sidebars, MCP Apps,
dialogs, accessibility labels, validation feedback, and operational notices.
Missing keys, empty translations, raw keys, or cross-language fallback fail
official qualification. Brand names, code, and user content may remain
unchanged. Third-party plugins may support a declared subset with clear fallback.

Verify language lists in both plugin tabs, first-mount propagation, live
switching in both directions for every supported language, reopening,
enable/disable restoration, and third-party unsupported-language fallback.
Check translation-key coverage automatically and inspect applicable surfaces
in the real Tauri window in light/dark themes. Switching must preserve entered
data and scoped state. Record the platform locale set and package revisions;
declarations or key parity alone do not prove usable translated UI.

## Implementation boundary

Declare `extensions.openagent.i18n` with `supported_locales`, `default_locale`,
and `translations`. Each locale maps flat keys to non-empty strings:
`display_name`, `description` when present, `commands.<id>.label`,
`commands.<id>.description`, `sidebar.<id>.title`, and package `notice.<key>`.
All locales carry the same keys and interpolation parameters. Runtime rejects
malformed declarations; missing declarations in older packages remain unknown.
Notice keys include their prefix in the 128-byte UTF-8 limit; each translated
string is limited to 4096 UTF-8 bytes, with at most 256 keys per locale.
The SDK owns validation and typed `AgentPluginI18n` descriptors. The public kit
owns the matching schema, validator, templates, and author instructions.

Installed cards use the package descriptor; uninstalled cards use validated
catalog metadata. Commands carry `plugin_i18n` without changing routing IDs.
Sidebar titles use the same resolver without recreating frames. MCP Apps receive
the application locale at initialization and on live host-context updates.

Sidebar asset reload identity consists only of installed package revision,
view ID and entry path. Localized title changes update accessibility and visible
labels while retaining the same iframe URL, draft and scoped state. Loading and
failure labels use application translations.
Authenticated independent process clients call versioned `locale.get` for current
resolved application language before producing notices. Direct and model-proxied
MCP tool calls receive live transient `_openagent.locale`, so offline tools do
not need process network access to obtain their presentation language.
That context never becomes package data.

Run kit validation with `--require-i18n`; official qualification additionally
passes `--locales=<comma-separated keys from platformLocales.json>`. Adding a
platform locale updates application resolution, SDK process locale resolution,
translations, and native qualification together. Legacy official packages with
unknown declarations remain unqualified under this standard until updated.
[Published sources](published-sources.md) owns repository publication boundaries.
