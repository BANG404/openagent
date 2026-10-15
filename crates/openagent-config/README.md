# OpenAgent configuration

Public settings types, product defaults, normalization, version compatibility,
atomic replacement and cross-process file locking. Permission declarations and
MCP launch identities are data; process sandbox enforcement remains in Runtime.
This crate contains no provider client or conversation database implementation.

Product code and the Runtime consume this one implementation. A running
application routes settings changes through its authoritative configuration
writer rather than racing independent writes to `config.toml`.
