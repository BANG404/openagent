import type { AgentPluginInstallProgress } from "$lib/types";

export type PluginInstallTask = {
  key: string;
  pluginId: string | null;
  label: string;
  progress: AgentPluginInstallProgress;
  status: "running" | "success" | "error";
  error?: string;
  hostAccessRequired?: boolean;
};

/** Independent installs share no busy flag, result, or progress subscription. */
export class AgentPluginInstallQueue {
  private tasks: Record<string, PluginInstallTask> = {};
  private readonly observers = new Set<(tasks: PluginInstallTask[]) => void>();

  constructor(changed?: (tasks: PluginInstallTask[]) => void) {
    if (changed) this.observers.add(changed);
  }

  snapshot(): PluginInstallTask[] {
    return Object.values(this.tasks);
  }

  subscribe(changed: (tasks: PluginInstallTask[]) => void): () => void {
    this.observers.add(changed);
    changed(this.snapshot());
    return () => {
      this.observers.delete(changed);
    };
  }

  isInstalling(key: string): boolean {
    return this.tasks[key]?.status === "running";
  }

  dismiss(key: string): void {
    if (!this.tasks[key] || this.isInstalling(key)) return;
    const remaining = { ...this.tasks };
    delete remaining[key];
    this.tasks = remaining;
    for (const changed of this.observers) changed(this.snapshot());
  }

  private publish(task: PluginInstallTask): void {
    this.tasks = { ...this.tasks, [task.key]: task };
    for (const changed of this.observers) changed(this.snapshot());
  }

  async run<T>(options: {
    key: string;
    pluginId: string | null;
    label: string;
    subscribe: (receive: (progress: AgentPluginInstallProgress) => void) => Promise<() => void>;
    install: () => Promise<T>;
    activate: (
      installed: T,
      progress: (value: AgentPluginInstallProgress) => void,
    ) => Promise<"host-access-required" | void>;
  }): Promise<void> {
    if (this.isInstalling(options.key)) return;
    let task: PluginInstallTask = {
      key: options.key,
      pluginId: options.pluginId,
      label: options.label,
      progress: { plugin_id: options.pluginId ?? "", stage: "preparing" },
      status: "running",
    };
    this.publish(task);
    const update = (progress: AgentPluginInstallProgress) => {
      task = { ...task, progress };
      this.publish(task);
    };
    let unlisten: (() => void) | undefined;
    try {
      // Register before starting even a small package. A local folder has no
      // known manifest ID yet: never attribute another install's events to it.
      if (options.pluginId) {
        unlisten = await options.subscribe((progress) => {
          if (progress.plugin_id === options.pluginId) update(progress);
        });
      }
      const installed = await options.install();
      const activation = await options.activate(installed, update);
      this.publish({
        ...task,
        status: "success",
        hostAccessRequired: activation === "host-access-required",
        progress: { ...task.progress, stage: "complete" },
      });
    } catch (error: unknown) {
      this.publish({ ...task, status: "error", error: String(error) });
    } finally {
      unlisten?.();
    }
  }
}

// A Settings dialog can close while Runtime is installing. Its replacement
// observes the same tasks and still blocks duplicate requests in this window.
export const desktopPluginInstallQueue = new AgentPluginInstallQueue();
