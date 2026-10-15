---
name: terminal-file-tools
description: Use rg (ripgrep), fd, and bat for terminal text search, file and directory discovery, and file reading. Check the actual execution environment and install only missing tools needed by the task, or repair PATH and platform naming issues.
---

# Terminal file tools

Use `rg` to search text, `fd` to find files and directories, and `bat` to read
files when those operations are needed. Keep using the available file creation
and editing tools for writes. These commands do not replace them.

## Check the task's execution environment

Check each needed command in the same shell and environment that will perform
the work. Windows, WSL distributions, containers, and SSH hosts have separate
binaries and PATHs. Availability on the host does not establish availability
inside a container or remote shell.

- PowerShell: resolve executable paths with `Get-Command rg, fd, bat
  -CommandType Application -ErrorAction SilentlyContinue`.
- POSIX shells: use `command -v rg`, `command -v fd`, and `command -v bat`.
- Run the needed executable with `--version` to verify it works. Inspect
  `--help` when the task requires an option that may depend on its version.
- On Debian/Ubuntu, also check `fdfind` and `batcat`. Verify them and use those
  names directly when `fd` or `bat` is missing. Interactive aliases may be
  unavailable in the agent's noninteractive shell.

Check only what the task needs. A conversational answer needs no installation;
a text search may need only `rg`. Reuse working installations without upgrading
them or installing all three automatically.

## Install missing tools when needed

Select an installation supported by the actual OS and CPU architecture. Prefer
an existing package manager, within the user's authorization and runtime
permissions. Proceed with an authorized user-scoped installation needed for the
task; system changes or elevation follow the existing approval boundary. Do not
bypass sandbox restrictions by changing installation methods.

These are package identifiers, not a requirement to install everything:

| Existing manager | rg | fd | bat |
| --- | --- | --- | --- |
| Windows WinGet | `BurntSushi.ripgrep.MSVC` | `sharkdp.fd` | `sharkdp.bat` |
| Windows Scoop | `ripgrep` | `fd` | `bat` |
| macOS Homebrew | `ripgrep` | `fd` | `bat` |
| Debian/Ubuntu apt | `ripgrep` | `fd-find` | `bat` |
| Fedora dnf | `ripgrep` | `fd-find` | `bat` |
| Arch pacman | `ripgrep` | `fd` | `bat` |

For WinGet, use an exact match such as
`winget install --id sharkdp.fd --exact --source winget`; select user scope when
supported. With Homebrew, install only the missing package, for example
`brew install ripgrep`. Verify current package availability and supported scope
before executing because package identifiers and platform coverage can change.

If no suitable package manager exists, use upstream release assets:

- [ripgrep](https://github.com/BurntSushi/ripgrep/releases)
- [fd](https://github.com/sharkdp/fd/releases)
- [bat](https://github.com/sharkdp/bat/releases)

Choose an explicit release and matching OS/architecture; on Linux also check
libc compatibility. Verify a published checksum when available. Extract the
executable and retain license notices in a dedicated user-writable tool directory
outside the repository. Preserve existing executables. Do not bootstrap Rust,
Homebrew, or another package manager just to obtain one utility. If download or
execution is blocked, report the concrete requirement and continue with permitted
available tools where the task allows it.

## Verify availability after installation

Resolve and run the executable in the original execution environment. New
terminals may inherit a changed PATH while the current process retains its old
value. Use the verified absolute executable path or add its directory to the
current process PATH while preserving existing entries. Persist PATH changes
only when future user-terminal availability is part of the task; report the
setting changed and do not overwrite shell profiles.

Do not reinstall a working executable merely because its directory is absent
from PATH. Distinguish missing commands, runtime dependencies, unsupported
architecture, and permission failures before retrying. After a failed install,
resolve its cause before trying again.

## Use predictable output

- `rg --line-number --color never -- 'pattern' <path>` searches text. Exit code
  1 means no matches; 2 indicates an error. Default searches omit hidden and
  ignored files; include them explicitly only when the task requires them.
- `fd --color never -- 'pattern' <root>` finds names; use `--type f` or
  `--type d` as needed. Hidden and ignored entries require explicit flags too.
- `bat --style=plain --paging=never --color=never -- <path>` reads files without
  paging or decoration. Bound large reads with `--line-range <start>:<end>`.

Quote paths and patterns for the active shell. Briefly report installed tools,
the execution environment, verified versions, and any PATH repair, then resume
the user's original task.
