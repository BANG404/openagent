# OpenAgent TypeScript SDK

Public typed, behavior-free clients and browser/Tauri transports, maintained in
`sdk/typescript` in the OpenAgent repository. Runtime execution, prompts,
providers, persistence, and checkpoints remain in the private `runtime/`
submodule and the supervised Runtime process.

```ts
import { OpenAgentClient } from "./src/client";
import { HttpTransport } from "./src/httpTransport";

const client = new OpenAgentClient(new HttpTransport());
```

Frontends use the source in their host checkout via `@openagent/client`.
Root type, lint, format, and Bun test commands cover this package without
private source access; trusted preflight also verifies the Runtime pin.
The package remains private to prevent accidental npm
publication; its source is public under MIT.
