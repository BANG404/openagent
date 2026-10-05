import { describe, expect, test } from "bun:test";
import {
  AgentPluginHostAccessQueue,
  pluginRequestsHostAccess,
} from "../src/lib/agentPluginHostAccess";
import { AgentPluginInstallQueue } from "../src/lib/agentPluginInstallQueue";
import type { AgentPluginSummary } from "../src/lib/types";

function plugin(id: string, capabilities = ["desktop-control"]): AgentPluginSummary {
  return {
    id,
    name: id,
    capabilities,
    builtin: false,
    enabled: true,
    version: "1.0.0",
    description: null,
    path: id,
    repository: null,
    homepage: null,
    license: null,
    author: null,
    keywords: [],
    commands: [],
    command_specs: [],
    message_policies: [],
    skills: [],
    mcp_servers: [],
    sidebar_views: [],
    automation_hooks: [],
    warnings: [],
    error: null,
  };
}

describe("installation host access authorization", () => {
  test("uses capability declarations for all plugins, without treating network as host access", () => {
    for (const capability of ["desktop-control", "HOST-ACCESS", "computer-use"]) {
      expect(pluginRequestsHostAccess(plugin("third-party", [capability]))).toBe(true);
    }
    expect(pluginRequestsHostAccess(plugin("ordinary", ["network", "mcp"]))).toBe(false);
  });

  test("serializes concurrent prompts and ignores stale decisions for another plugin", async () => {
    const queue = new AgentPluginHostAccessQueue();
    const first = queue.request(plugin("first"));
    const second = queue.request(plugin("second"));
    expect(queue.request(plugin("first"))).toBe(first);
    queue.answer("second", true);
    expect(queue.snapshot().map((item) => item.id)).toEqual(["first", "second"]);
    queue.answer("first", false);
    expect(await first).toBe(false);
    queue.answer("first", true);
    expect(queue.snapshot()[0].id).toBe("second");
    queue.answer("second", true);
    expect(await second).toBe(true);
    expect(queue.snapshot()).toEqual([]);
  });

  test("a reopened Settings surface retains the pending prompt without granting access", async () => {
    const queue = new AgentPluginHostAccessQueue();
    let visible: AgentPluginSummary[] = [];
    const close = queue.subscribe((plugins) => {
      visible = plugins;
    });
    const answer = queue.request(plugin("desktop"));
    expect(visible[0].id).toBe("desktop");
    close();
    const reopen = queue.subscribe((plugins) => {
      visible = plugins;
    });
    expect(visible[0].id).toBe("desktop");
    queue.answer("desktop", false);
    expect(await answer).toBe(false);
    expect(visible).toEqual([]);
    reopen();
  });

  test("activation waits for authorization; deferring keeps installation and records the requirement", async () => {
    for (const granted of [false, true]) {
      const installs = new AgentPluginInstallQueue();
      const prompts = new AgentPluginHostAccessQueue();
      let activated = false;
      const run = installs.run({
        key: "local:desktop",
        pluginId: null,
        label: "Desktop",
        subscribe: async () => () => {},
        install: async () => plugin("desktop"),
        activate: async (installed, progress) => {
          progress({ plugin_id: installed.id, stage: "connecting" });
          if (!(await prompts.request(installed))) return "host-access-required";
          activated = true;
        },
      });
      await Promise.resolve();
      expect(activated).toBe(false);
      expect(installs.isInstalling("local:desktop")).toBe(true);
      prompts.answer("desktop", granted);
      await run;
      expect(activated).toBe(granted);
      expect(installs.snapshot()[0].status).toBe("success");
      expect(installs.snapshot()[0].hostAccessRequired).toBe(!granted);
    }
  });
});
