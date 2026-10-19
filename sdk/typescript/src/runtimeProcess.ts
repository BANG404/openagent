import { spawn, execFile, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomBytes } from "node:crypto";
import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { OPENAGENT_PROTOCOL_VERSION } from "./contracts.js";
import type { OpenAgentClient } from "./client.js";
import { ensureRuntime, type EnsureRuntimeOptions } from "./runtime.js";
import { connectRuntime, runtimeOrigin } from "./runtimeConnection.js";

export { connectRuntime, type RuntimeConnectionOptions } from "./runtimeConnection.js";

export interface StartRuntimeOptions extends EnsureRuntimeOptions {
  workspace: string;
  /** Use an application-specific data root; never share one with a running desktop. */
  home: string;
  startupTimeoutMs?: number;
}
export interface RunningRuntime {
  client: OpenAgentClient;
  endpoint: string;
  version: string;
  pid: number;
  stop(): Promise<void>;
}

function waitForExit(child: ChildProcessWithoutNullStreams, timeout: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((done, reject) => {
    const timer = setTimeout(() => {
      child.off("exit", exited);
      reject(new Error("Runtime shutdown timed out"));
    }, timeout);
    function exited() {
      clearTimeout(timer);
      done();
    }
    child.once("exit", exited);
  });
}

async function stopChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  child.stdin.end("shutdown\n");
  try {
    await waitForExit(child, 5000);
  } catch {
    child.kill("SIGKILL");
    await waitForExit(child, 5000);
  }
}

/** Inspect persistence admission, then start a supervised authenticated local process. */
export async function startRuntime(options: StartRuntimeOptions): Promise<RunningRuntime> {
  if (!options.home?.trim() || !options.workspace?.trim())
    throw new Error("Explicit Runtime home and workspace are required");
  const installed = await ensureRuntime(options);
  const workspace = await realpath(options.workspace);
  const home = resolve(options.home);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    OPENAGENT_HOME: home,
    OPENAGENT_POLICY_OPERATION: "startup",
  };
  delete env.OPENAGENT_POLICY_PREVIOUS_RUNTIME;
  // Inspection is read-only. Transition/reset/plugin maintenance remains a host decision.
  const inspection = await new Promise<string>((done, reject) => {
    execFile(
      installed.binaryPath,
      ["--desktop-bootstrap", "inspect"],
      { env, windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024 },
      (error, stdout) => (error ? reject(error) : done(stdout)),
    );
  });
  const admission = JSON.parse(inspection) as {
    schema_version: number;
    status: string;
    transition?: unknown;
    compatibility_policy?: { allowed?: boolean; blocked?: boolean; restart_required?: boolean };
  };
  if (
    admission.schema_version !== 1 ||
    admission.status !== "ready" ||
    admission.transition ||
    admission.compatibility_policy?.allowed === false ||
    admission.compatibility_policy?.blocked ||
    admission.compatibility_policy?.restart_required
  )
    throw new Error(`Runtime startup requires host action: ${admission.status}`);
  const token = randomBytes(32).toString("hex");
  const child = spawn(
    installed.binaryPath,
    [
      "--workspace",
      workspace,
      "--listen",
      "127.0.0.1:0",
      "--token-env",
      "OPENAGENT_DESKTOP_RUNTIME_TOKEN",
      "--output",
      "json",
      "--desktop-api",
      "--desktop-primary",
    ],
    {
      env: { ...env, OPENAGENT_DESKTOP_RUNTIME_TOKEN: token },
      windowsHide: true,
      stdio: "pipe",
    },
  );
  child.stderr.resume();
  child.stdin.on("error", () => {});
  try {
    const ready = await new Promise<{
      type: string;
      endpoint: string;
      version: string;
      pid: number;
      protocol: { min: number; max: number };
    }>((done, reject) => {
      let buffer = "";
      const timer = setTimeout(
        () => fail(new Error("Runtime readiness timed out")),
        options.startupTimeoutMs ?? 60000,
      );
      const cleanup = () => {
        clearTimeout(timer);
        child.off("error", fail);
        child.off("exit", exited);
        child.stdout.off("data", data);
      };
      const fail = (error: Error) => {
        cleanup();
        reject(error);
      };
      const exited = () => fail(new Error("Runtime exited before readiness"));
      const data = (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        if (buffer.length > 1024 * 1024) return fail(new Error("Runtime readiness exceeds limit"));
        const end = buffer.indexOf("\n");
        if (end < 0) return;
        try {
          const ready = JSON.parse(buffer.slice(0, end));
          cleanup();
          done(ready);
        } catch {
          fail(new Error("Invalid Runtime readiness JSON"));
        }
      };
      child.once("error", fail);
      child.once("exit", exited);
      child.stdout.on("data", data);
    });
    child.stdout.resume();
    if (
      ready.type !== "ready" ||
      ready.pid !== child.pid ||
      !ready.protocol ||
      ready.protocol.min > OPENAGENT_PROTOCOL_VERSION ||
      ready.protocol.max < OPENAGENT_PROTOCOL_VERSION
    )
      throw new Error("Incompatible Runtime readiness");
    runtimeOrigin(ready.endpoint);
    const client = await connectRuntime({ ...ready, token, release: options.release });
    const onExit = () => {
      child.stdin.destroy();
    };
    process.once("exit", onExit);
    child.once("exit", () => process.off("exit", onExit));
    let stopping: Promise<void> | undefined;
    return {
      client,
      endpoint: ready.endpoint,
      version: ready.version,
      pid: ready.pid,
      stop: () => (stopping ??= stopChild(child)),
    };
  } catch (error) {
    await stopChild(child);
    throw error;
  }
}
