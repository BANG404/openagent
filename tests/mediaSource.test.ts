// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { classifyMediaSource, mediaDisplayName } from "../src/lib/streamdown/mediaSource";
import { parseComponentAt } from "../src/lib/streamdown/parser";
import { evalArgs } from "../src/lib/streamdown/runtime";

describe("classifyMediaSource", () => {
  test("accepts HTTP and HTTPS URLs", () => {
    expect(classifyMediaSource("https://cdn.example.com/image.png", "image")).toEqual({
      kind: "remote",
      value: "https://cdn.example.com/image.png",
    });
    expect(classifyMediaSource(" http://localhost:14221/demo.mp4 ", "video")).toEqual({
      kind: "remote",
      value: "http://localhost:14221/demo.mp4",
    });
  });

  test("treats relative, POSIX, and Windows paths as local", () => {
    expect(classifyMediaSource("assets/demo.webp", "image").kind).toBe("local");
    expect(classifyMediaSource("/workspace/assets/demo.mp4", "video").kind).toBe("local");
    expect(classifyMediaSource("C:\\workspace\\assets\\demo.mp4", "video").kind).toBe("local");
  });

  test("turns image file URLs into workspace-resolved local paths", () => {
    expect(classifyMediaSource("file:///tmp/demo%20image.png", "image")).toEqual({
      kind: "local",
      value: "/tmp/demo image.png",
    });
    expect(classifyMediaSource("file:///C:/workspace/demo.png", "image")).toEqual({
      kind: "local",
      value: "C:/workspace/demo.png",
    });
  });

  test("accepts image data URLs only for the image component", () => {
    expect(classifyMediaSource("data:image/png;base64,aW1hZ2U=", "image")).toEqual({
      kind: "inline",
      value: "data:image/png;base64,aW1hZ2U=",
    });
    expect(
      classifyMediaSource("data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E", "image").kind,
    ).toBe("inline");
    expect(classifyMediaSource("data:text/html,%3Cscript%3E", "image").kind).toBe("invalid");
    expect(classifyMediaSource("data:image/png;base64,aW1hZ2U=", "video").kind).toBe("invalid");
  });

  test("rejects empty, image-only, and unsafe URI schemes for video", () => {
    expect(classifyMediaSource("", "image")).toEqual({ kind: "invalid", value: "" });
    expect(classifyMediaSource("file:///tmp/demo.png", "video").kind).toBe("invalid");
    expect(classifyMediaSource("javascript:alert(1)", "image").kind).toBe("invalid");
  });
});

describe("mediaDisplayName", () => {
  test("extracts names from URLs and cross-platform paths", () => {
    expect(mediaDisplayName("https://example.com/media/clip.mp4?token=1")).toBe("clip.mp4");
    expect(mediaDisplayName("assets\\images\\preview.png")).toBe("preview.png");
    expect(mediaDisplayName("data:image/png;base64,aW1hZ2U=")).toBe("Embedded image");
  });
});

describe("AGUI media component syntax", () => {
  test("parses image and video component arguments through the shared runtime", () => {
    const image = parseComponentAt(
      'Image(src: "assets/preview.png", alt: "Preview", caption: "Local image")',
      0,
    );
    const video = parseComponentAt(
      'Video(src: "https://cdn.example.com/demo.mp4", controls: true, loop: false)',
      0,
    );

    expect(image.ok).toBe(true);
    expect(video.ok).toBe(true);
    if (!image.ok || !video.ok) return;

    expect(image.value.name).toBe("Image");
    expect(evalArgs(image.value.args)).toEqual({
      src: "assets/preview.png",
      alt: "Preview",
      caption: "Local image",
    });
    expect(video.value.name).toBe("Video");
    expect(evalArgs(video.value.args)).toEqual({
      src: "https://cdn.example.com/demo.mp4",
      controls: true,
      loop: false,
    });
  });

  test("preserves an image data URL argument", () => {
    const image = parseComponentAt(
      'Image(src: "data:image/png;base64,aW1hZ2U=", alt: "Embedded")',
      0,
    );

    expect(image.ok).toBe(true);
    if (!image.ok) return;
    expect(evalArgs(image.value.args)).toEqual({
      src: "data:image/png;base64,aW1hZ2U=",
      alt: "Embedded",
    });
  });
});
