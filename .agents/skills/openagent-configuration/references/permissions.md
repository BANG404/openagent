## Tool permissions

Tool approval controls whether an individual call pauses for review;
`permission_profile` independently controls the capabilities available after a
call is allowed. Approval never widens the active permission profile.

The Agent configuration window exposes these as two separate controls under
Execution & Permissions, while the conversation composer provides a shortcut
for approval mode only. Approval has
`manual`, `auto`, and `off` modes and defaults to `off`; it never selects a
sandbox policy. In `auto`, all tool calls proposed in one model turn are
classified by one Flash request with an independent decision for each exact
tool-call ID; incomplete or unreliable results fall back to manual review.
Calls reach manual review only when their exact arguments create a meaningful privacy risk or a dangerous,
destructive, irreversible, security-sensitive, or consequential external
effect. Manual mode requests confirmation for tool calls that are not explicitly
exempted lifecycle controls.
**Execution Permissions & Sandbox** selects `managed` or
`disabled` enforcement. Managed enforcement offers canonical
workspace-writable and read-only presets, plus an advanced editor for ordered
`read`, `write`, and `deny` path rules. Network access is configured separately
as `restricted` or `enabled`. Disabling isolation is an explicit unsafe choice;
the UI warns that tools retain the ambient access of the OpenAgent process.
Opening the advanced editor from a canonical preset does not save an unchanged
profile; the configuration changes only after a path rule is edited, added, or
removed. This keeps the editor open across the settings save cycle while
preserving the original preset until the user makes a substantive change.

The default `managed` profile grants `read` access to the host filesystem and
`write` access to the active workspace; write access includes reading. Broad
writable roots keep `.git`, `.agents`, and `.codex` read-only unless a narrower
explicit write entry reopens a subtree. Managed profiles may contain multiple
filesystem entries using `read`, `write`, or `deny`. The most specific matching
path wins, and `deny` wins when equally specific entries conflict. A path with
no matching entry is rejected. `host_root` names the volume or filesystem root
containing the workspace, workspace entries may name a relative subpath, and
absolute entries name an additional host path. Existing targets and the
nearest existing ancestor of new targets are canonicalized before matching, so
`..` and existing symbolic-link ancestors cannot escape a managed root.

The `disabled` profile explicitly selects ambient host filesystem and network
access; it is not inferred from the approval mode. Managed profiles record
whether network access is `enabled` or `restricted`, defaulting to
`restricted`. The
runtime SDK now provides one shared process-sandbox contract for foreground,
background, resumed-approval, and delegated terminal launches. The desktop
product registers the native backend on every supported platform. Linux uses
Bubblewrap for mount and network namespace isolation. It prefers a compatible
system `bwrap` from `PATH`; that executable and its ancestor directories must
be root-owned and not group- or world-writable. Product bundles also carry the
`codex-bwrap` binary built from the SDK's pinned Codex revision as an offline
fallback. Release builds embed and verify the SHA-256 of the exact stripped
sidecar packaged by Tauri. macOS uses the fixed system `sandbox-exec` executable
and a deny-by-default Seatbelt policy. A managed terminal launch fails before
spawning when the selected backend or its trusted executable cannot enforce the
requested filesystem or restricted-network capability. Windows uses the pinned
Codex wrapper with capability SIDs, ACL overlays, inherited standard I/O, and a
kill-on-close Job Object. Network-enabled profiles use its non-elevated
restricted-token backend. Restricted profiles run under its elevated offline
account with persistent WFP filters. OpenAgent builds and bundles the matching
setup and command-runner helpers from the same immutable Codex revision; the
first restricted launch may request UAC consent for provisioning. Missing
helpers, declined elevation, or failed setup aborts the command without falling
back to a weaker process boundary. Global skill source remains read-only and
executable under managed isolation. Playwright CLI daemon files are redirected
to the sandbox-writable temporary directory by default, rather than widening
write access to the global skill tree or the user's cache; an explicit daemon
directory selected by the caller is preserved.

Built-in read, list, search, create, edit, and file-presentation tools run in
process, but they compile and enforce the same canonical managed filesystem
rules as terminal launches, including symlink and new-path handling. The
authorization match is exhaustive: only an explicit `disabled` profile grants
ambient access, and there is no separate host-delegated profile that can bypass
the file-tool boundary.
