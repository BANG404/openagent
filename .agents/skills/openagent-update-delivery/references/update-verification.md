# Update failure verification

Update tests must assert the recoverable state left by a failure, not only that
an error occurred. Keep installed bytes, active selections, pending records,
running children and the ability to retry in the acceptance criteria.

| Boundary           | Failure/recovery coverage                                                                                                                                                                                                                                     | Primary proof                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Transfer           | Refused connection and mid-body disconnect keep partial bytes; a retry resumes the received prefix; ignored Range restarts; wrong Range, length, status or HTTP error preserves the prefix; corrupt download cannot enter the cache; a clean retry repairs it | `resource_download::tests`                                                               |
| Download commit    | Completed verified partial bytes survive interruption and are admitted without network; offline verified caches work without their original source                                                                                                            | `resource_download::tests`                                                               |
| Shell plan         | Same-target retry; strictly newer target after interrupted install; downgrade refusal; beta/RC/stable ordering; reached-but-unconfirmed protection; next release after confirmation                                                                           | `component_updates::handoff::tests`                                                      |
| Durable plan       | Malformed JSON, unsupported schema, invalid version and oversized record stay intact; Windows file lock leaves the old plan and no staging debris, then unlock permits retry                                                                                  | `component_updates::handoff::tests`                                                      |
| Signed preparation | Missing distribution, damaged signature and checksum-mismatched helper preserve the prior plan; valid replacement and repeat preparation leave Runtime running                                                                                                | Native `shell-handoff-*` scenarios in `test:blackbox:shell-resources`                    |
| Frontend           | Signed HTTP installation; manifest bounds/protocol/path admission; tampered/unsigned selections refused; pending activation survives process exit; confirmation timeout rollback; stale deadline cannot discard a newer activation                            | `frontend_resource::tests`                                                               |
| Runtime            | Signed HTTP installation; helper integrity; corrupt immutable cache repair; protocol and bootstrap admission; version ordering                                                                                                                                | `runtime_resource::tests`, `runtime_process::tests`, `component_updates::runtime::tests` |
| Startup            | Retry after failed download; signed offline import; same-window onboarding; cache-only shell continuation and confirmation; ordinary startup without preparation; missing resource repair                                                                     | `test:blackbox:shell-resources`, light/dark and English/Chinese                          |
| Windows installer  | Delayed image exit, temporary resource lock, permission failure, 30-second timeout, manual maintenance, scoped uninstall and unrelated installation preservation; legacy embedding file links and forbidden reparse points                                    | `test:blackbox:shell-install`, real NSIS fixtures                                        |
| Desktop teardown   | Runtime and children are stopped before installer handoff; preparation and restart form one idempotent exit                                                                                                                                                   | Native `shell-install.toml`, `desktop_exit::tests`                                       |

For changes to plan persistence or transfer behavior, first run the relevant
focused host cases. Once they pass, qualify the host library as a whole:

```bash
cargo test --manifest-path src-tauri/Cargo.toml --lib component_updates::handoff::tests
cargo test --manifest-path src-tauri/Cargo.toml --lib resource_download::tests
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

Run `bun run preflight` for the selected source tree, then run
`bun run test:blackbox:shell-resources`. Shell installation changes also run
`bun run test:blackbox:shell-install`. Prepare the exact native sidecars first;
the shell runners use temporary data and never the installed production home.

On Windows, the Bash automation tests need Git Bash ahead of the WSL launcher on
the task process's PATH. Plugin provenance tests require checkout bytes without
automatic CRLF conversion; do not change recorded hashes to accept conversion.

This matrix records specific assertions, not exhaustive coverage of every OS,
network or release artifact. The local fixtures do not qualify a published
installer's signature/relaunch on macOS or Linux, nor a full online coupled
update with an active real Agent run. Those remain packaged-release acceptance
scenarios; a successful local fixture must not be reported as their result.
