export function normalizeBrowserAddress(value: string): string | null {
  const address = value.trim();
  if (!address) return null;

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(address)
    ? address
    : /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?(?:[/?#]|$)/i.test(address)
      ? `http://${address}`
      : `https://${address}`;

  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
