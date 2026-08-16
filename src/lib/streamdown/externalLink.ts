export type ExternalUrlOpener = (url: string) => Promise<void>;

const WEB_PROTOCOLS = new Set(["http:", "https:"]);

export function normalizeExternalLinkUrl(href: string): string | null {
  try {
    const parsed = new URL(href);
    return WEB_PROTOCOLS.has(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

export async function openExternalLink(
  href: string,
  openUrl: ExternalUrlOpener,
  warn: (message: string, error: unknown) => void = console.warn,
): Promise<boolean> {
  const normalized = normalizeExternalLinkUrl(href);
  if (!normalized) return false;

  try {
    await openUrl(normalized);
    return true;
  } catch (error) {
    warn("openUrl failed", error);
    return false;
  }
}

export function handleExternalLinkClick(event: MouseEvent, openUrl: ExternalUrlOpener): boolean {
  if (event.defaultPrevented) return false;

  const target = event.target;
  const element =
    target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  const anchor = element?.closest<HTMLAnchorElement>("a[href]");
  const owner = event.currentTarget;
  if (!anchor || !(owner instanceof Node) || !owner.contains(anchor)) return false;

  event.preventDefault();
  void openExternalLink(anchor.getAttribute("href") ?? "", openUrl);
  return true;
}

export function externalLinks(node: HTMLElement, initialOpenUrl: ExternalUrlOpener) {
  let openUrl = initialOpenUrl;
  const handleClick = (event: MouseEvent) => handleExternalLinkClick(event, openUrl);
  node.addEventListener("click", handleClick);

  return {
    update(nextOpenUrl: ExternalUrlOpener) {
      openUrl = nextOpenUrl;
    },
    destroy() {
      node.removeEventListener("click", handleClick);
    },
  };
}
