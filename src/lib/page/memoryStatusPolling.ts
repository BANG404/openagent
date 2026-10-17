interface PollingOptions {
  read: () => Promise<boolean>;
  update: (syncing: boolean) => void;
  visibility: Pick<Document, "hidden" | "addEventListener" | "removeEventListener">;
  observeActivity?: (changed: (active: boolean) => void) => Promise<() => void>;
  schedule?: (callback: () => void, milliseconds: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
}

/** Keep the status indicator fresh without waking a hidden or unmounted page. */
export function startMemoryStatusPolling({
  read,
  update,
  visibility,
  observeActivity,
  schedule = setTimeout,
  cancel = clearTimeout,
}: PollingOptions): () => void {
  let stopped = false;
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let windowActive = true;
  let stopActivity: (() => void) | null = null;
  const paused = () => visibility.hidden || !windowActive;
  const clear = () => {
    if (timer !== null) cancel(timer);
    timer = null;
  };
  async function poll() {
    if (stopped || paused() || inFlight) return;
    clear();
    inFlight = true;
    let syncing = false;
    try {
      syncing = await read();
      if (!stopped && !paused()) update(syncing);
    } catch {
      // A failed optional status read must not break the conversation surface.
    } finally {
      inFlight = false;
      if (!stopped && !paused()) timer = schedule(() => void poll(), syncing ? 2_000 : 15_000);
    }
  }
  const onVisibility = () => {
    if (stopped) return;
    clear();
    if (!paused()) void poll();
  };
  visibility.addEventListener("visibilitychange", onVisibility);
  void observeActivity?.((active) => {
    windowActive = active;
    onVisibility();
  })
    .then((dispose) => {
      if (stopped) dispose();
      else stopActivity = dispose;
    })
    .catch(() => {
      // Document visibility still works if the optional native listener fails.
    });
  void poll();
  return () => {
    stopped = true;
    clear();
    visibility.removeEventListener("visibilitychange", onVisibility);
    stopActivity?.();
  };
}
