import { describe, expect, test } from "bun:test";
import { hydrateMcpToolImages, toolImageAttachments } from "../src/lib/toolImageAttachments";

const locator = `sha256:${"a".repeat(64)}`;

describe("tool image attachment projection", () => {
  test("keeps blob references without embedding bytes and rejects other locators", () => {
    const images = toolImageAttachments([
      { blob_id: locator, mime_type: "image/png" },
      { blob_id: "file:///private/image.png", mime_type: "image/png" },
      { blob_id: "sha256:wrong", mime_type: "image/png" },
    ]);
    expect(images).toEqual([
      { src: locator, blobId: locator, mimeType: "image/png", name: "tool-image.png" },
    ]);
  });

  test("hydrates only referenced MCP images, preserving order and image parameters", async () => {
    const calls: string[] = [];
    const content = [
      { type: "text", text: "before" },
      {
        type: "image",
        data: { type: "attachment", blob_id: locator, mime_type: "image/png" },
        detail: "high",
        provider_field: "retained",
      },
      { type: "json", value: { after: true } },
    ];
    const hydrated = await hydrateMcpToolImages(content, async (id, name) => {
      calls.push(`${id}/${name}`);
      return { data_url: "data:image/png;base64,Ynl0ZXM=" };
    });
    expect(calls).toEqual([`${locator}/tool-image.png`]);
    expect(hydrated).toEqual([
      content[0],
      { ...content[1], data: { type: "base64", value: "Ynl0ZXM=" } },
      content[2],
    ]);
    expect(content[1].data?.type).toBe("attachment");
  });

  test("preserves original raw source kind and refuses absent previews", async () => {
    const content = [
      {
        type: "image",
        data: { type: "attachment", blob_id: locator, mime_type: "image/png", source_kind: "raw" },
      },
    ];
    const hydrated = await hydrateMcpToolImages(content, async () => ({
      data_url: "data:image/png;base64,YWJj",
    }));
    expect(hydrated).toEqual([{ type: "image", data: { type: "raw", value: [97, 98, 99] } }]);
    await expect(hydrateMcpToolImages(content, async () => ({}))).rejects.toThrow(
      "Tool image preview unavailable",
    );
  });
});
