# Headless Harness SDK

OpenAgent supports third-party harnesses without publishing its agent runtime.
The desktop application and the headless server embed the same pinned private
SDK revision; external applications use the behavior-free
`@bang404/openagent-harness` client and a checksummed `openagent-server` binary.
The npm package is the only public TypeScript client. OpenAgent's internal
frontend transport remains pinned source and is not published as
`@bang404/openagent-sdk`.

## Security boundary

- The daemon listens on an ephemeral loopback port and rejects LAN listeners.
- A parent process supplies a random token through an environment variable.
- Every `/v1` request and SSE connection requires that Bearer token.
- The daemon authorizes only workspaces supplied when it starts.
- Public run state contains user/assistant display text and actionable
  interrupts. Prompts, reasoning, provider payloads, checkpoint records,
  database schemas, and Inspector traces remain private.
- Third-party tools integrate out of process through MCP rather than linking to
  the core Rust crates.
- Tauri starts the same server with `--desktop-api`. That adds the authenticated
  product `/api` surface without removing the complete Harness `/v1` routes;
  both surfaces execute through the one supervised Runtime process.
- Before starting that process, Tauri invokes the packaged server's versioned
  desktop-bootstrap command to inspect private persistence compatibility and
  obtain behavior-free launch inputs. This short-lived command never starts a
  Runtime or opens the conversation database as a concurrent writer.

## TypeScript usage

```ts
import { spawnOpenAgent } from "@bang404/openagent-harness/node";

const runtime = await spawnOpenAgent({
  workspace: process.cwd(),
  binaryPath: process.env.OPENAGENT_SERVER,
});

try {
  const [workspace] = await runtime.client.listWorkspaces();
  const session = await runtime.client.createSession(workspace.id);
  const accepted = await runtime.client.createRun(session.session_id, {
    input: "Review this workspace and run its tests",
    idempotencyKey: crypto.randomUUID(),
  });

  for await (const event of runtime.client.events(accepted.run_id)) {
    if (event.data.status === "interrupted") {
      // Present event.data.interrupts to the controlling application and call
      // respondToInterrupt with its durable interrupt ID.
    }
    if (["completed", "cancelled", "failed"].includes(event.data.status)) break;
  }
} finally {
  await runtime.stop();
}
```

The thin client and daemon protocol share a release version. The daemon also
reports an explicit protocol range so incompatible clients fail before a run
starts.

SDK releases publish `openagent-sdk-manifest.json` beside the platform server
binaries. Node and Bun callers may use `installOpenAgentBinary` to select the
current target, check the protocol range, verify the byte size and SHA-256, and
atomically install the executable into a versioned directory. Long-running
development hosts may use `spawnReloadableOpenAgent`; after active runs finish
or are cancelled, `reload(newBinaryPath)` restarts on the new process and falls
back to the prior binary if startup fails. Durable conversations remain under
the caller-selected `OPENAGENT_HOME`; in-memory runs do not cross a reload.

## Distribution

The TypeScript client is MIT licensed. The core Rust crates are not published
to a registry and remain in the private SDK repository. Server binary
distribution follows OpenAgent's GPL/commercial dual-license policy; a
proprietary customer distribution requires the applicable commercial
agreement.
