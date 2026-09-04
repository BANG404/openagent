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
Excluding a whole drive or the complete user profile is broader than needed and
reduces protection. To undo the change, run `Remove-MpPreference
-ExclusionPath <path>` for each path shown by the script.

## Linker and filesystem rules

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

The WSL checkout and the native Windows checkout should remain separate Git
working trees. Configure the existing Windows checkout as a local source remote
from WSL once. Replace `Ubuntu` if the distribution has another name:

```powershell
cd D:\Project\openagent
git remote add wsl-source "\\wsl.localhost\Ubuntu\home\iumm\projects\openagent"
```

Then configure the WSL checkout to run the repository's `post-commit` hook:

```bash
git config --local wsl.windowsCheckout 'D:/Project/openagent'
git config --local wsl.windowsRemote wsl-source
```

After each WSL commit, the hook checks that the Windows checkout is clean and
fast-forwards it from the same branch. If Windows has local changes, the
checkout cannot fast-forward, or `git.exe` is unavailable, the WSL commit is
kept and the hook prints a warning. Install the repository hooks with
`bun install` if `.githooks` is not active yet. Keep `node_modules`, `target`,
and other generated directories native to each operating system.
