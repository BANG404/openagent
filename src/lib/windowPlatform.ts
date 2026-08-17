export type WindowPlatform = "linux" | "macos" | "windows";

export function resolveWindowPlatform(platform: string): WindowPlatform {
  if (/mac|iphone|ipad|ipod/i.test(platform)) return "macos";
  if (/win/i.test(platform)) return "windows";
  return "linux";
}

export function detectWindowPlatform(): WindowPlatform {
  if (typeof navigator === "undefined") return "windows";
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    "";
  return resolveWindowPlatform(platform);
}
