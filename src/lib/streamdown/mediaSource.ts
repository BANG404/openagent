export type MediaSource =
  | { kind: "remote"; value: string }
  | { kind: "inline"; value: string }
  | { kind: "local"; value: string }
  | { kind: "invalid"; value: string };

const WEB_URL_PROTOCOLS = new Set(["http:", "https:"]);
const URI_SCHEME = /^[a-z][a-z\d+.-]*:/i;
const WINDOWS_ABSOLUTE_PATH = /^[a-z]:[\\/]/i;
const IMAGE_MEDIA_TYPE = /^image\/[a-z\d][a-z\d.+-]*$/i;

function fileUrlPath(url: URL): string | null {
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }

  if (url.hostname && url.hostname !== "localhost") {
    return `//${url.hostname}${pathname}`;
  }
  if (/^\/[a-z]:\//i.test(pathname)) {
    return pathname.slice(1);
  }
  return pathname || null;
}

function isImageDataUrl(value: string): boolean {
  const mediaType = /^data:([^;,]+)(?:;[^,]*)?,/i.exec(value)?.[1]?.trim();
  return mediaType ? IMAGE_MEDIA_TYPE.test(mediaType) : false;
}

/**
 * AGUI media accepts HTTP(S) URLs or workspace-confined filesystem paths. Images
 * additionally accept file URLs (resolved through the same workspace boundary)
 * and inline image data URLs. Other URI schemes stay invalid instead of being
 * misinterpreted as local files.
 */
export function classifyMediaSource(source: unknown, mediaKind: "image" | "video"): MediaSource {
  if (typeof source !== "string") return { kind: "invalid", value: "" };
  const value = source.trim();
  if (!value) return { kind: "invalid", value };

  if (WINDOWS_ABSOLUTE_PATH.test(value)) {
    return { kind: "local", value };
  }

  if (URI_SCHEME.test(value)) {
    try {
      const url = new URL(value);
      if (WEB_URL_PROTOCOLS.has(url.protocol)) {
        return { kind: "remote", value: url.href };
      }
      if (mediaKind === "image" && url.protocol === "file:") {
        const path = fileUrlPath(url);
        return path ? { kind: "local", value: path } : { kind: "invalid", value };
      }
      if (mediaKind === "image" && url.protocol === "data:" && isImageDataUrl(value)) {
        return { kind: "inline", value };
      }
      return { kind: "invalid", value };
    } catch {
      return { kind: "invalid", value };
    }
  }

  return { kind: "local", value };
}

export function mediaDisplayName(source: string): string {
  if (/^data:image\//i.test(source)) return "Embedded image";
  const withoutQuery = source.split(/[?#]/, 1)[0];
  const name = withoutQuery.split(/[\\/]/).filter(Boolean).at(-1);
  return name || source;
}
