export function getFaviconSources(href: string): string[] {
  try {
    const url = new URL(href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return [];

    return [
      new URL("/favicon.ico", url.origin).href,
      `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(url.origin)}&sz=32`,
    ];
  } catch {
    return [];
  }
}
