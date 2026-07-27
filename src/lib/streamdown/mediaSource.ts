export type MediaSource =
  | { kind: "remote"; value: string }
  | { kind: "local"; value: string }
  | { kind: "invalid"; value: string };

const WEB_URL_PROTOCOLS = new Set(["http:", "https:"]);
const URI_SCHEME = /^[a-z][a-z\d+.-]*:/i;
const WINDOWS_ABSOLUTE_PATH = /^[a-z]:[\\/]/i;

/**
 * AGUI media accepts HTTP(S) URLs or workspace-confined filesystem paths.
 * Other URI schemes stay invalid instead of being misinterpreted as local files.
 */
export function classifyMediaSource(source: unknown): MediaSource {
  if (typeof source !== "string") return { kind: "invalid", value: "" };
  const value = source.trim();
  if (!value) return { kind: "invalid", value };

  if (WINDOWS_ABSOLUTE_PATH.test(value)) {
    return { kind: "local", value };
  }

  if (URI_SCHEME.test(value)) {
    try {
      const url = new URL(value);
      return WEB_URL_PROTOCOLS.has(url.protocol)
        ? { kind: "remote", value: url.href }
        : { kind: "invalid", value };
    } catch {
      return { kind: "invalid", value };
    }
  }

  return { kind: "local", value };
}

export function mediaDisplayName(source: string): string {
  const withoutQuery = source.split(/[?#]/, 1)[0];
  const name = withoutQuery.split(/[\\/]/).filter(Boolean).at(-1);
  return name || source;
}
