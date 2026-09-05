# Permissions

Read `docs/configuration.md` section `Tool permissions` for approval mode,
permission profiles, path matching, symlink handling, network restrictions,
platform sandbox backends, helper verification, and in-process file tools.

Approval controls review; the permission profile controls capability. Do not
add a host-delegated bypass or weaker fallback when a selected backend cannot
enforce the requested boundary.
