export const APP_UPDATE_CHECK_TIMEOUT_MS = 15_000;
export const RESOURCE_UPDATE_PREPARE_TIMEOUT_MS = 10 * 60_000;

export class AppUpdateTimeoutError extends Error {
  constructor() {
    super("The update check timed out.");
    this.name = "AppUpdateTimeoutError";
  }
}

export async function withAppUpdateTimeout<T>(
  operation: Promise<T>,
  timeoutMs = APP_UPDATE_CHECK_TIMEOUT_MS,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new AppUpdateTimeoutError()), timeoutMs);
  });

  try {
    return await Promise.race([operation, deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
