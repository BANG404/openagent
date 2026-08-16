export interface BrowserWindowProxy {
  opener: unknown;
}

export type BrowserWindowOpener = (
  url: string,
  target: string,
  features: string,
) => BrowserWindowProxy | null;

export function openBrowserUrl(
  url: string,
  openWindow: BrowserWindowOpener = (href, target, features) => window.open(href, target, features),
): void {
  const opened = openWindow(url, "_blank", "noopener,noreferrer");
  if (opened) opened.opener = null;
}

export async function openSurfaceUrl(
  url: string,
  tauriAvailable: boolean,
  openNative: (href: string) => Promise<void>,
  openWindow?: BrowserWindowOpener,
): Promise<void> {
  if (tauriAvailable) {
    await openNative(url);
    return;
  }

  openBrowserUrl(url, openWindow);
}
