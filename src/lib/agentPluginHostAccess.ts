import type { AgentPluginSummary } from "$lib/types";

export function pluginRequestsHostAccess(
  plugin: Pick<AgentPluginSummary, "capabilities">,
): boolean {
  return plugin.capabilities.some((capability) =>
    ["desktop-control", "host-access", "computer-use"].includes(capability.toLowerCase()),
  );
}

/** Installation prompts survive Settings remounts and serialize concurrent requests. */
export class AgentPluginHostAccessQueue {
  private readonly pending: {
    plugin: AgentPluginSummary;
    promise: Promise<boolean>;
    resolve: (granted: boolean) => void;
  }[] = [];
  private readonly observers = new Set<(plugins: AgentPluginSummary[]) => void>();

  snapshot(): AgentPluginSummary[] {
    return this.pending.map(({ plugin }) => plugin);
  }

  subscribe(changed: (plugins: AgentPluginSummary[]) => void): () => void {
    this.observers.add(changed);
    changed(this.snapshot());
    return () => {
      this.observers.delete(changed);
    };
  }

  request(plugin: AgentPluginSummary): Promise<boolean> {
    const existing = this.pending.find((request) => request.plugin.id === plugin.id);
    if (existing) return existing.promise;
    let resolve!: (granted: boolean) => void;
    const promise = new Promise<boolean>((settle) => {
      resolve = settle;
    });
    this.pending.push({ plugin, promise, resolve });
    this.publish();
    return promise;
  }

  answer(pluginId: string, granted: boolean): void {
    // A stale dialog callback cannot authorize the next plugin in the queue.
    if (this.pending[0]?.plugin.id !== pluginId) return;
    const request = this.pending.shift()!;
    request.resolve(granted);
    this.publish();
  }

  private publish(): void {
    for (const changed of this.observers) changed(this.snapshot());
  }
}

export const desktopPluginHostAccessQueue = new AgentPluginHostAccessQueue();
