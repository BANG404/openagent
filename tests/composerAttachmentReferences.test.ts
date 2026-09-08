// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import {
  attachmentsReferencedByText,
  removeAttachmentReference,
  synchronizeAttachmentReferences,
} from "../src/lib/composerAttachmentReferences";

describe("composer attachment references", () => {
  const image = { path: "C:/screenshots/one.png", name: "one.png", kind: "image" as const };
  const file = { path: "C:/notes/one.txt", name: "one.txt", kind: "document" as const };

  test("assigns per-kind sequence labels and inserts them into the draft", () => {
    const first = synchronizeAttachmentReferences("Compare", [image, file]);
    expect(first.value).toBe("Compare [Image #1] [File #1] ");
    expect(first.attachments.map((attachment) => attachment.referenceLabel)).toEqual([
      "[Image #1]",
      "[File #1]",
    ]);

    const second = synchronizeAttachmentReferences(first.value, [
      ...first.attachments,
      { path: "C:/screenshots/two.png", name: "two.png", kind: "image" },
    ]);
    expect(second.value).toBe("Compare [Image #1] [File #1] [Image #2] ");
  });

  test("renumbers later labels when an earlier attachment is removed", () => {
    const attachments = [
      { ...image, referenceLabel: "[Image #1]" },
      {
        path: "C:/screenshots/two.png",
        name: "two.png",
        kind: "image" as const,
        referenceLabel: "[Image #2]",
      },
    ];
    const synchronized = synchronizeAttachmentReferences("Use [Image #2] ", [attachments[1]]);
    expect(synchronized.attachments[0].referenceLabel).toBe("[Image #1]");
    expect(synchronized.value).toBe("Use [Image #1] ");

    const appended = synchronizeAttachmentReferences(synchronized.value, [
      ...synchronized.attachments,
      { path: "C:/screenshots/three.png", name: "three.png", kind: "image" },
    ]);
    expect(appended.attachments[1].referenceLabel).toBe("[Image #2]");
  });

  test("renumbers adjacent references without replacement collisions", () => {
    const attachments = [2, 3].map((number) => ({
      path: `C:/screenshots/${number}.png`,
      name: `${number}.png`,
      kind: "image" as const,
      referenceLabel: `[Image #${number}]`,
    }));
    const synchronized = synchronizeAttachmentReferences(
      "Compare [Image #2] with [Image #3]",
      attachments,
    );
    expect(synchronized.value).toBe("Compare [Image #1] with [Image #2]");
    expect(synchronized.attachments.map((attachment) => attachment.referenceLabel)).toEqual([
      "[Image #1]",
      "[Image #2]",
    ]);
  });

  test("removes metadata when its text reference is deleted", () => {
    const attachments = [{ ...image, referenceLabel: "[Image #1]" }];
    expect(attachmentsReferencedByText("describe this", attachments)).toEqual([]);
    expect(attachmentsReferencedByText("describe [Image #1]", attachments)).toEqual(attachments);
  });

  test("removes all matching text references with their adjacent separator", () => {
    expect(removeAttachmentReference("Compare [Image #1] and [Image #1]", "[Image #1]")).toBe(
      "Compare and",
    );
  });
});
