import type { ChatToolImage } from "./types";

/** The Runtime publishes references only after their blob write is durable. */
export function toolImageAttachments(value: unknown): ChatToolImage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const image = entry as Record<string, unknown>;
    if (typeof image.blob_id !== "string" || !/^sha256:[a-f0-9]{64}$/.test(image.blob_id)) {
      return [];
    }
    const mimeType =
      typeof image.mime_type === "string" ? image.mime_type : "application/octet-stream";
    const extension = (
      {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/gif": "gif",
        "image/webp": "webp",
      } as Record<string, string>
    )[mimeType];
    return [
      {
        src: image.blob_id,
        blobId: image.blob_id,
        mimeType,
        name: extension ? `tool-image.${extension}` : "tool-image.bin",
      },
    ];
  });
}

/** A mounted MCP App receives its original image envelope only on demand. */
export async function hydrateMcpToolImages(
  content: unknown[],
  load: (locator: string, name: string) => Promise<{ data_url?: string | null }>,
): Promise<unknown[]> {
  return Promise.all(
    content.map(async (entry) => {
      if (!entry || typeof entry !== "object") return entry;
      const image = entry as Record<string, unknown>;
      const data = image.data as Record<string, unknown> | undefined;
      if (image.type !== "image" || data?.type !== "attachment") return entry;
      const reference = toolImageAttachments([data])[0];
      if (!reference?.blobId) throw new Error("Invalid tool image attachment");
      const preview = await load(reference.blobId, reference.name ?? "tool-image.bin");
      const encoded = preview.data_url?.match(
        /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=]*)$/i,
      )?.[1];
      if (!encoded) throw new Error("Tool image preview unavailable");
      const source =
        data.source_kind === "raw"
          ? {
              type: "raw",
              value: Array.from(atob(encoded), (character) => character.charCodeAt(0)),
            }
          : { type: "base64", value: encoded };
      return { ...image, data: source };
    }),
  );
}
