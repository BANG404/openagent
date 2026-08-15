export type WindowPlatform = "macos" | "windows";

export function detectWindowPlatform(): WindowPlatform {
  if (typeof navigator === "undefined") return "windows";
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    "";
  return /mac|iphone|ipad|ipod/i.test(platform) ? "macos" : "windows";
}
