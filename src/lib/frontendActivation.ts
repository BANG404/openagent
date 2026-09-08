export type FrontendActivationConfirmer = (version: string) => Promise<void>;

type FrontendActivationRetryOptions = {
  attempts?: number;
  delayMs?: number;
  wait?: (delayMs: number) => Promise<void>;
};

let confirmedVersion: string | null = null;

export async function confirmFrontendActivationWithRetry(
  version: string,
  confirm: FrontendActivationConfirmer,
  options: FrontendActivationRetryOptions = {},
): Promise<void> {
  const attempts = Math.max(1, options.attempts ?? 5);
  const delayMs = Math.max(0, options.delayMs ?? 150);
  const wait =
    options.wait ?? ((duration) => new Promise((resolve) => setTimeout(resolve, duration)));
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await confirm(version);
      confirmedVersion = version;
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(delayMs);
    }
  }

  throw lastError;
}

export function frontendActivationWasConfirmed(version: string): boolean {
  return confirmedVersion === version;
}
