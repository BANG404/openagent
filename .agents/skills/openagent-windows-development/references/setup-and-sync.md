# Windows Development Performance

Rust builds on Windows can become IO-bound even when CPU usage is low. The
recommended setup keeps build output on local NTFS, uses the LLVM linker, and
limits antivirus scanning to generated dependency/build trees.

## One-time setup

Run this from an elevated PowerShell only when you want to change Defender
settings:

```powershell
.\scripts\windows-dev-setup.ps1 -ApplyDefenderExclusions
```

Without `-ApplyDefenderExclusions`, the script only prints the paths and checks
whether `rust-lld` is available. The exclusions are intentionally limited to:

- `target\` and `sdk\target\`
- `%USERPROFILE%\.cargo\registry\`
- `%USERPROFILE%\.cargo\git\`

These paths contain generated build artifacts or downloaded dependency sources.
The script's fixed list does not cover the ordinary desktop launcher's external
host output under `%LOCALAPPDATA%\OpenAgent\dev-targets\`, nor direct Cargo
output under `src-tauri\target\`. Source development Runtime and Windows helpers
share the host repository's private Cargo cache across OWT worktrees; release
defaults retain `sdk\target\`. These new cache paths are not added to Defender
exclusions automatically.
See the [development Runtime owner](../../openagent-release-engineering/references/development-runtime.md)
for actual target selection and overrides. Preview the script's output before
assuming that it changes scanning for the build directory being used.
Excluding a whole drive or the complete user profile is broader than needed and
reduces protection. To undo the change, run `Remove-MpPreference
-ExclusionPath <path>` for each path shown by the script.

## Linker and filesystem rules

Run native process confinement checks from the signed-in user's interactive
Windows session. The pinned Windows sandbox targets `Winsta0`; a Session 0
service process can launch a child that fails before `main` with
`0xC0000142`. Reproduce the same check in the interactive session before changing
the sandbox policy or interpreting a service-session launch failure as a
Runtime regression.

`.cargo\config.toml` selects Rust's bundled `rust-lld` for the
`x86_64-pc-windows-msvc` target. No separate LLVM installation is required.
Verify it with:

```powershell
rust-lld --version
cargo metadata --no-deps --format-version 1
```

Keep the checkout, Cargo cache, and `target` directories on the same local NTFS
volume. Avoid building from `\\wsl.localhost\...`, mapped network drives, or
cloud-synchronized folders; each adds filesystem translation or file-change
scanning to Cargo's many small reads and writes. WSL workspaces should build
inside the Linux filesystem with the Linux toolchain, or use a native Windows
checkout for the MSVC target.

The runtime also bounds and incrementally drains terminal output, so high-output
commands such as `cargo check` do not accumulate unbounded foreground output or
repeatedly copy a full background output buffer.

## Syncing commits from WSL

The post-commit hook tests prefer the installed `bash.exe` on PATH, with the
standard Git installation directory as a fallback. Keep portable Git Bash
ahead of the Windows WSL launcher on PATH when running Windows preflight.
Set `OPENAGENT_TEST_BASH` to an explicit Git Bash executable when a custom
installation or PATH ordering requires it; this override takes precedence.

The repository Bun suite uses a 30-second per-test timeout. SDK release
exhaustion tests launch bounded Bash subprocess loops; on Windows their mocked
180-attempt paths exceed Bun's five-second default even with network and sleep
stubbed. Keep the assertions and subprocess bounds intact; do not shorten the
release retry policy to satisfy the runner's default timeout.

The WSL checkout and the native Windows checkout should remain separate Git
working trees. Configure the existing Windows checkout as a local source remote
from WSL once. Substitute the actual checkout locations and distribution in these
placeholders; derive them from the existing projects instead of copying a fixed
drive or user directory:

```powershell
Set-Location '<windows-checkout>'
git remote add wsl-source '\\wsl.localhost\<distribution>\<wsl-checkout-path>'
```

Then configure the WSL checkout to run the repository's `post-commit` hook:

```bash
git config --local wsl.windowsCheckout '<windows-checkout>'
git config --local wsl.windowsRemote wsl-source
```

After each WSL commit or merge, the hook requires the Windows checkout to have
the same branch checked out, checks that it is clean, and fast-forwards it from
that branch. A WSL feature branch must never advance whichever branch happens
to be checked out on Windows. If the branch names differ, Windows is detached,
Windows has local changes, the checkout cannot fast-forward, or `git.exe` is
unavailable, the WSL commit is kept and the hook prints a warning. Install the
repository hooks with `bun install` if `.githooks` is not active yet. Keep
`node_modules`, `target`, and other generated directories native to each
operating system.
