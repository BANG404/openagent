# OpenAgent product composition

Public product policies and supervision for the standalone Runtime binary.
The library has no Tauri or private execution dependency. Desktop hosts inject
their resource environment into the shared process supervisor; CLI hosts can
use the same lifecycle, paths, configuration and authenticated HTTP client.
Product bootstrap also owns bundled skill seeding, resource verification and
transition decisions. A storage-maintenance port keeps database access inside
the engine while the public policy enforces backup before reset.

`openagent-config` owns shared settings and `openagent-protocol` owns wire
contracts. Conversation storage and model/tool execution remain in Runtime.
