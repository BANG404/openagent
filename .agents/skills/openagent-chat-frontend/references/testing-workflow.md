# Chat testing workflow

Use this workflow when changing streamed transcript, tool lifecycle, composer,
restore, or other chat-owned behavior.

## Start with a behavior contract

Describe the trigger, the precondition, the observable result, and the failure
or recovery behavior. For event-driven code, write the event sequence before
writing assertions. A useful form is:

```text
Given conversation A and B are both streaming
When a duplicate result for A arrives after A is finalized
Then A stays finalized and B is unchanged
```

The assertion should describe a user-visible result or a state invariant, not
an implementation call count.

## Select the smallest sufficient layer

- Pure item or map transformations belong in Bun unit tests.
- Multiple stream events, hydration, cleanup, cancellation, and recovery belong
  in state or stream integration tests.
- Rendering, keyboard interaction, scrolling, theme, locale, and reload in the
  shipped chat UI must be verified in the real Tauri window with a chat-owned
  `tauri-pilot` black-box scenario. Add a scenario and `test:blackbox:chat`
  runner when the changed chat workflow has no coverage yet. A browser preview
  smoke test can supplement this when the state is reproducible there.
- SDK, Tauri, and Harness boundaries belong in their contract or integration
  suites.

Cover the same contract at more than one layer only when the layers prove
different responsibilities.

## Event and edge-case matrix

For stream changes, consider normal, duplicate, out-of-order, missing-id,
conflicting-payload, late-after-cleanup, empty-value, cancellation, reload,
and cross-conversation cases. Keep fixtures deterministic and isolate durable
state, ports, browser sessions, and temporary artifacts.

## Completion criteria

A chat test change is complete when it has a normal path and a failure or
recovery path, strict test typing, a deterministic command, and a matching
verification route. Run the corresponding Tauri black-box command before
handoff for every changed user-facing chat module. Visible changes also cover
light and dark themes, Chinese and English copy, streaming-to-durable
finalization, reload, and branch switching where those states are affected.
Follow the shared setup and isolation rules in the desktop-host
[`native-verification.md`](../../openagent-desktop-host/references/native-verification.md).
Update this owner reference when a new invariant or test surface becomes part
of the product contract.
