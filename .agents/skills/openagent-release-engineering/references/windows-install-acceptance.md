# Local Windows installer acceptance

The manual acceptance path executes locally built bytes in separate, fresh
`windows-2025` jobs for online and offline installation. It never publishes a
release, advances update channels, or requires production signing credentials.

## Build identity and isolation

Use an isolated, clean, committed build worktree prepared with Bun 1.3.14 and
the exact pinned Runtime source. Install `tauri-pilot` 0.7.2 on the build machine.
Run `bun scripts/build-windows-acceptance.mjs --output <empty-directory>`.
The script mutates only ignored build resources and uses its own Cargo target.
Keep the directory for submission and diagnostics until the tests finish.

Both NSIS installers use one Release shell with the explicit
`.cargo/acceptance.toml` configuration, preserving Release optimization,
bootstrap, resource activation and Runtime supervision. Only
`tauri-plugin-pilot` gets debug assertions to enable automation.
The separate `acceptance` feature embeds the build's ephemeral Minisign public
key and permits a loopback HTTP distribution source for online testing.
Ordinary builds retain production trust and have no endpoint override or Pilot
server. Never enable debug assertions for the entire host to produce this package.

Acceptance installs as `OpenAgent Acceptance`, identifier
`com.iumm.openagent.acceptance`, and defaults to `~/.openagent-acceptance`.
Every test sets a new temporary `OPENAGENT_HOME` and an empty `TEMP`/`TMP`;
it never uses release or debug user data or recursively prepares a developer's
shared temp cache for sandbox writes. The fixture lives outside the system temp
root so its outside-workspace write probe is not implicitly allowed.
Runtime remains the unmodified pinned Release binary. Resource
signatures and digests are verified normally against the fixed acceptance key.
The private key exists only in the build process and is not exported.

`windows-acceptance.json` records source/Runtime SHAs, version, public key,
build configuration, installers, and all file digests. The complete package bundles
Runtime, frontend, model, helpers, Node, terminal tools and offline WebView2;
the online package bundles only shell identity, Node and terminal tools, then
downloads its signed distribution. The CLI is transferred beside the installers
as a test driver, not installed as an application resource.

## Submit and inspect

Run `bun scripts/submit-windows-acceptance.mjs --artifacts <directory>
--reports <new-report-directory>`. It verifies the candidate, uploads a ZIP to
a uniquely named draft release, dispatches `windows-install-acceptance.yml`,
waits for its exact run, and downloads both reports. The VM checks the supplied
ZIP SHA-256 before extraction and verifies all candidate resources before
executing installers. The workflow token needs `contents: write` to read a draft
release; it is exposed only to the download step. Application
tests receive no production secrets. Successful runs remove their transfer
draft unless `--keep-transfer` is set. Failed transfers remain for diagnosis.
Never publish these drafts or use acceptance packages in production channels.

Each mode installs into a new directory and starts with empty application data.
Offline tests block non-loopback outbound traffic from shell, Runtime and bundled Node with task-scoped
Windows Firewall rules and require zero resource-server requests. Normalize
absolute executable paths to native Windows separators before Firewall
rule creation; hosted runner temp paths can mix separators.
Online tests
first return HTTP 503, require the real failure state and UI Retry, then serve
the same signed resource bytes. Both modes execute bundled tools, complete
the welcome wizard, render light/dark and Chinese/English screenshots, submit
through the real composer to a deterministic loopback model service, verify
streaming, restart without network resources, confirm history/settings restore,
and uninstall while retaining data. Product setup uses the bundled shared SDK;
ordinary input continues through the UI's normal SDK route.
The model fixture also requests a real managed terminal call: installed Node
and `rg` must run through the normal shell command chain in the workspace,
while a write outside it must fail. Node identity uses file identity because
Windows may expose the executable with a verbatim path prefix.
This gate does not qualify nested Node child-process creation; a local
restricted-token probe returned `EPERM` for Node `spawnSync`, while the shell
command chain succeeded. Keep that limitation separate from installer success.

Native tests require an interactive Windows session and administrator rights
for their scoped Firewall rules. Session 0 fails explicitly. Hosted runners
contain preinstalled dependencies and run elevated; these checks do not prove
SmartScreen, standard-user UAC, or an absent-WebView2 installation on a pristine
Windows client. These require a separate client-VM qualification.
Screenshots and reports contain only synthetic fixture content. Runtime logs,
fixture homes, credentials and private compiler output are never CI artifacts.

The acceptance bridge changes the shell binary. Final production installers
still need the existing uninstrumented installation/startup/restart gate.
