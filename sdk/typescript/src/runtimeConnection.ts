import { OpenAgentClient } from "./client.js";
import { HttpTransport } from "./httpTransport.js";
import { OPENAGENT_PROTOCOL_VERSION } from "./contracts.js";
import type { OpenAgentEventMap } from "./contracts.js";
import type { OpenAgentEvent, OpenAgentSubscriptionOptions, Unsubscribe } from "./transport.js";
import { runtimeEventNames } from "./runtimeEventNames.js";
import { runtimeRelease, type RuntimeRelease } from "./runtimeRelease.js";

/** Readiness record supplied by the process owner, plus its private bearer token. */
export interface RuntimeConnectionOptions {
  endpoint: string;
  token: string;
  protocol: { min: number; max: number };
  version: string;
  pid: number;
  release?: RuntimeRelease;
}

export function assertRuntimeVersion(
  version: string,
  release: RuntimeRelease | null = runtimeRelease,
): void {
  const parsed = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!parsed) throw new Error("Runtime did not report a supported release version");
  if (!release) return;
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?$/.test(release.version))
    throw new Error("Invalid recommended Runtime version");
  const minimum = release.version.split(/[+-]/)[0].split(".").map(Number);
  const actual = parsed.slice(1).map(Number);
  if (
    actual[0] !== minimum[0] ||
    actual[1] < minimum[1] ||
    (actual[1] === minimum[1] && actual[2] < minimum[2])
  )
    throw new Error(`Runtime ${version} is outside the SDK compatibility range`);
}

export function runtimeOrigin(endpoint: string): URL {
  const url = new URL(endpoint);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "[::1]", "localhost"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Runtime endpoint must be a plain loopback HTTP origin");
  }
  return url;
}

/** Local bearer authentication is distinct from the paired browser gateway session. */
class RuntimeTransport extends HttpTransport {
  constructor(private readonly connection: RuntimeConnectionOptions) {
    const origin = runtimeOrigin(connection.endpoint);
    super({
      baseUrl: origin.origin,
      fetch: (input, init = {}) => {
        const url = new URL(
          typeof input === "string" || input instanceof URL ? input.toString() : input.url,
        );
        if (url.origin !== origin.origin || !url.pathname.startsWith("/api/"))
          throw new Error("Runtime request escaped its origin");
        const headers = new Headers(init.headers);
        headers.set("authorization", `Bearer ${connection.token}`);
        return fetch(url, { ...init, headers, redirect: "error" });
      },
    });
  }

  override async subscribe<Event extends OpenAgentEvent>(
    event: Event,
    handler: (payload: OpenAgentEventMap[Event]) => void,
    options?: OpenAgentSubscriptionOptions,
  ): Promise<Unsubscribe> {
    const state = event === "conversation.state";
    const eventName = runtimeEventNames[event as keyof typeof runtimeEventNames];
    if (state ? !options?.conversationId : !eventName)
      throw new Error(`Unsupported Runtime subscription: ${event}`);
    const abort = new AbortController();
    const path = state
      ? `/api/conversations/${encodeURIComponent(options!.conversationId!)}/events`
      : "/api/events";
    const response = await fetch(new URL(path, this.connection.endpoint), {
      headers: { authorization: `Bearer ${this.connection.token}`, accept: "text/event-stream" },
      signal: abort.signal,
      redirect: "error",
    });
    if (!response.ok || !response.body)
      throw new Error(`Runtime event subscription failed: HTTP ${response.status}`);
    const reader = response.body.getReader();
    void (async () => {
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) throw new Error("Runtime event stream closed");
          buffer += decoder.decode(value, { stream: true });
          let delimiter: RegExpExecArray | null;
          while ((delimiter = /\r?\n\r?\n/.exec(buffer))) {
            const frame = buffer.slice(0, delimiter.index);
            buffer = buffer.slice(delimiter.index + delimiter[0].length);
            const lines = frame.split(/\r?\n/);
            if (lines.some((line) => line === `event: ${state ? "state" : "runtime"}`)) {
              const data = lines
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.slice(5).replace(/^ /, ""))
                .join("\n");
              const payload = JSON.parse(data);
              if (state) handler(payload as OpenAgentEventMap[Event]);
              else if (payload.name === eventName)
                handler(payload.payload as OpenAgentEventMap[Event]);
            }
            if (lines.some((line) => line === "event: resync"))
              throw new Error("Runtime event resynchronization required");
          }
          if (buffer.length > 16 * 1024 * 1024)
            throw new Error("Runtime event frame exceeds limit");
        }
      } catch {
        if (!abort.signal.aborted) options?.onError?.();
      } finally {
        await reader.cancel().catch(() => {});
      }
    })();
    return () => abort.abort();
  }
}

/** Connect to an already running local Runtime without taking ownership of its process. */
export async function connectRuntime(options: RuntimeConnectionOptions): Promise<OpenAgentClient> {
  const origin = runtimeOrigin(options.endpoint);
  if (!options.token) throw new Error("Runtime bearer token is required");
  assertRuntimeVersion(options.version, options.release);
  if (
    !options.protocol ||
    !Number.isInteger(options.protocol.min) ||
    !Number.isInteger(options.protocol.max) ||
    options.protocol.min > OPENAGENT_PROTOCOL_VERSION ||
    options.protocol.max < OPENAGENT_PROTOCOL_VERSION ||
    !Number.isSafeInteger(options.pid) ||
    options.pid < 1
  )
    throw new Error("Runtime readiness protocol is incompatible with this SDK");
  const response = await fetch(new URL("/api/desktop/health", origin), {
    headers: { authorization: `Bearer ${options.token}` },
    signal: AbortSignal.timeout(5000),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`Runtime health check failed: HTTP ${response.status}`);
  const health = (await response.json()) as { status: string; pid: number };
  if (health.status !== "ok" || health.pid !== options.pid)
    throw new Error("Runtime health does not match its readiness record");
  return new OpenAgentClient(new RuntimeTransport(options));
}
