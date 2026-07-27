// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { classifyMediaSource, mediaDisplayName } from "../src/lib/streamdown/mediaSource";
import { parseComponentAt } from "../src/lib/streamdown/parser";
import { evalArgs } from "../src/lib/streamdown/runtime";

describe("classifyMediaSource", () => {
  test("accepts HTTP and HTTPS URLs", () => {
    expect(classifyMediaSource("https://cdn.example.com/image.png")).toEqual({
      kind: "remote",
      value: "https://cdn.example.com/image.png",
    });
    expect(classifyMediaSource(" http://localhost:14221/demo.mp4 ")).toEqual({
      kind: "remote",
      value: "http://localhost:14221/demo.mp4",
    });
  });

  test("treats relative, POSIX, and Windows paths as local", () => {
    expect(classifyMediaSource("assets/demo.webp").kind).toBe("local");
    expect(classifyMediaSource("/workspace/assets/demo.mp4").kind).toBe("local");
    expect(classifyMediaSource("C:\\workspace\\assets\\demo.mp4").kind).toBe("local");
  });

  test("rejects empty and non-web URI schemes", () => {
    expect(classifyMediaSource("")).toEqual({ kind: "invalid", value: "" });
    expect(classifyMediaSource("file:///tmp/demo.png").kind).toBe("invalid");
    expect(classifyMediaSource("javascript:alert(1)").kind).toBe("invalid");
    expect(classifyMediaSource("data:image/png;base64,aW1hZ2U=").kind).toBe("invalid");
  });
});

describe("mediaDisplayName", () => {
  test("extracts names from URLs and cross-platform paths", () => {
    expect(mediaDisplayName("https://example.com/media/clip.mp4?token=1")).toBe("clip.mp4");
    expect(mediaDisplayName("assets\\images\\preview.png")).toBe("preview.png");
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
});
