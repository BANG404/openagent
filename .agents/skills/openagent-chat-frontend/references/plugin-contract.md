# Shared Runtime Types

The shared `src/lib/types.ts` file also carries non-transcript Runtime
contracts such as Agent Plugin update summaries. Extending those contracts
must preserve the existing message, checkpoint, and streaming fields so chat
projection code continues to receive the same shapes.
