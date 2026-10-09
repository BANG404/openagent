import { describe, expect, test } from "bun:test";
import {
  AgentPluginInstallQueue,
  type PluginInstallTask,
} from "../src/lib/agentPluginInstallQueue";
import type { AgentPluginInstallProgress } from "../src/lib/types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function fixture() {
  let tasks: PluginInstallTask[] = [];
  const listeners = new Set<(progress: AgentPluginInstallProgress) => void>();
  const queue = new AgentPluginInstallQueue((value) => {
    tasks = value;
  });
  const subscribe = async (receive: (progress: AgentPluginInstallProgress) => void) => {
    listeners.add(receive);
    return () => {
      listeners.delete(receive);
    };
  };
  const send = (plugin_id: string, stage: AgentPluginInstallProgress["stage"]) => {
    for (const receive of listeners) receive({ plugin_id, stage });
  };
  const task = (key: string) => tasks.find((item) => item.key === key)!;
  const start = (id: string, install: () => Promise<string>, activate = async () => {}) =>
    queue.run({ key: id, pluginId: id, label: id, subscribe, install, activate });
  return { queue, subscribe, listeners, send, task, start };
}

describe("concurrent plugin installation", () => {
  test("an update shares install duplicate protection and survives reopening through failure and retry", async () => {
    const f = fixture();
    const pending = deferred<string>();
    const start = (install: () => Promise<string>) =>
      f.queue.run({
        key: "graph",
        pluginId: "graph",
        label: "Graph",
        operation: "update",
        subscribe: f.subscribe,
        install,
        activate: async () => {},
      });
    const run = start(() => pending.promise);
    await Promise.resolve();
    let visible: PluginInstallTask[] = [];
    const reopen = f.queue.subscribe((tasks) => {
      visible = tasks;
    });
    expect(visible[0].operation).toBe("update");
    expect(f.queue.isInstalling("graph")).toBe(true);
    await f.start("graph", async () => {
      throw new Error("duplicate install");
    });
    expect(f.task("graph").status).toBe("running");
    pending.reject(new Error("update download failed"));
    await run;
    expect(visible[0].error).toContain("update download failed");
    expect(f.listeners.size).toBe(0);
    await start(async () => "graph");
    expect(visible[0].operation).toBe("update");
    expect(visible[0].status).toBe("success");
    expect(visible[0].error).toBeUndefined();
    reopen();
  });

  test("dismissing a result preserves running work and notifies reopened surfaces", async () => {
    const f = fixture();
    const pending = deferred<string>();
    const run = f.start("graph", () => pending.promise);
    await f.start("goal", async () => "goal");
    f.queue.dismiss("graph");
    expect(f.queue.isInstalling("graph")).toBe(true);
    f.queue.dismiss("goal");
    let visible: PluginInstallTask[] = [];
    const close = f.queue.subscribe((tasks) => {
      visible = tasks;
    });
    expect(visible.map((task) => task.key)).toEqual(["graph"]);
    pending.reject(new Error("download failed"));
    await run;
    expect(visible[0].status).toBe("error");
    f.queue.dismiss("graph");
    expect(visible).toEqual([]);
    close();
  });

  test("a reopened surface observes running tasks and their eventual result", async () => {
    const f = fixture();
    const install = deferred<string>();
    const run = f.start("goal", () => install.promise);
    let visible: PluginInstallTask[] = [];
    const close = f.queue.subscribe((tasks) => {
      visible = tasks;
    });
    expect(visible[0].status).toBe("running");
    close();
    const reopen = f.queue.subscribe((tasks) => {
      visible = tasks;
    });
    expect(visible[0].key).toBe("goal");
    expect(f.queue.isInstalling("goal")).toBe(true);
    install.resolve("goal");
    await run;
    expect(visible[0].status).toBe("success");
    reopen();
  });

  test("starts both requests, routes interleaved phases, and keeps the remaining install busy", async () => {
    const f = fixture();
    const first = deferred<string>();
    const second = deferred<string>();
    const calls: string[] = [];
    const one = f.start("goal", () => {
      calls.push("goal");
      return first.promise;
    });
    const two = f.start("graph", () => {
      calls.push("graph");
      return second.promise;
    });
    await Promise.resolve();
    expect(calls).toEqual(["goal", "graph"]);
    await f.start("goal", async () => {
      throw new Error("duplicate request");
    });
    f.send("goal", "downloading");
    f.send("graph", "installing");
    f.send("unrelated", "complete");
    expect(f.task("goal").progress.stage).toBe("downloading");
    expect(f.task("graph").progress.stage).toBe("installing");
    second.resolve("graph");
    await two;
    expect(f.task("graph").status).toBe("success");
    expect(f.queue.isInstalling("goal")).toBe(true);
    expect(f.listeners.size).toBe(1);
    first.resolve("goal");
    await one;
    expect(f.listeners.size).toBe(0);
  });

  test("isolates failures, allows retry, and waits for activation before releasing the task", async () => {
    const f = fixture();
    const failed = deferred<string>();
    const installed = deferred<string>();
    const activating = deferred<void>();
    const one = f.start("goal", () => failed.promise);
    const two = f.start(
      "graph",
      () => installed.promise,
      () => activating.promise,
    );
    failed.reject(new Error("download failed"));
    await one;
    expect(f.task("goal").error).toContain("download failed");
    installed.resolve("graph");
    await Promise.resolve();
    expect(f.queue.isInstalling("graph")).toBe(true);
    await f.start("goal", async () => "goal");
    expect(f.task("goal").status).toBe("success");
    expect(f.task("goal").error).toBeUndefined();
    activating.resolve();
    await two;
    expect(f.listeners.size).toBe(0);
  });

  test("does not consume foreign progress for a local directory with an unknown manifest ID", async () => {
    const f = fixture();
    const local = deferred<string>();
    const run = f.queue.run({
      key: "local:C:/sample",
      pluginId: null,
      label: "sample",
      subscribe: f.subscribe,
      install: () => local.promise,
      activate: async (_, progress) => {
        progress({ plugin_id: "sample", stage: "connecting" });
      },
    });
    f.send("goal", "complete");
    expect(f.task("local:C:/sample").progress.stage).toBe("preparing");
    local.resolve("sample");
    await run;
    expect(f.task("local:C:/sample").progress.plugin_id).toBe("sample");
  });

  test("cleans up after activation errors and reports subscription failures without installing", async () => {
    const f = fixture();
    await f.start(
      "goal",
      async () => "goal",
      async () => {
        throw new Error("connect failed");
      },
    );
    expect(f.task("goal").status).toBe("error");
    expect(f.listeners.size).toBe(0);
    await f.queue.run({
      key: "graph",
      pluginId: "graph",
      label: "graph",
      subscribe: async () => {
        throw new Error("subscribe failed");
      },
      install: async () => {
        throw new Error("must not install");
      },
      activate: async () => {},
    });
    expect(f.task("graph").error).toContain("subscribe failed");
  });
});
