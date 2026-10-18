import { describe, expect, test } from "bun:test";
import { getSchema, resolveExtensions } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { composerExtensions, protocolDocument, textPositions } from "../src/lib/composer/tiptap";

const references = new Map([["[Image #1]", "image.png"]]);
const extensions = composerExtensions(() => references);
const markdown = new MarkdownManager({
  extensions: resolveExtensions(extensions).filter((extension) => extension.name !== "starterKit"),
});
const schema = getSchema(extensions);

describe("Tiptap composer Markdown boundary", () => {
  test("exports valid Markdown while live marks contain leading and trailing spaces", () => {
    for (const type of ["bold", "italic", "strike"]) {
      const doc = {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: " 测试效果 ", marks: [{ type }] }] },
        ],
      };
      const output = markdown.serialize(doc);
      const restored = schema.nodeFromJSON(markdown.parse(output));
      expect(restored.textContent.trim()).toBe("测试效果");
      expect(
        restored.firstChild?.content.content.some((node) =>
          node.marks.some((mark) => mark.type.name === type),
        ),
      ).toBe(true);
    }
  });

  test("preserves command identifiers, quoted mentions and attachment labels literally", () => {
    const value = '/my_command @"some path/a_b.md" [Image #1]';
    const doc = markdown.parse(value);
    expect(markdown.serialize(protocolDocument(doc, references))).toBe(value);
    const content = schema.nodeFromJSON(doc);
    expect(textPositions(content).value).toBe(value);
    expect(content.firstChild?.lastChild?.type.name).toBe("composerToken");
  });

  test("does not interpret tokens or Markdown inside inline and fenced code", () => {
    for (const value of ["`@agent **literal**`", "```md\n@agent **literal**\n```"]) {
      const doc = markdown.parse(value);
      expect(markdown.serialize(protocolDocument(doc, references))).toBe(value);
      expect(JSON.stringify(doc)).not.toContain('"composerToken"');
    }
  });

  test("imports raw HTML as visible text", () => {
    const doc = schema.nodeFromJSON(markdown.parse("<b>literal</b>"));
    expect(doc.textContent).toBe("<b>literal</b>");
    expect(doc.firstChild?.firstChild?.marks).toHaveLength(0);
  });

  test("maps suggestion offsets through formatted lists, empty blocks and atomic references", () => {
    const doc = schema.nodeFromJSON(markdown.parse("**bold**\n\n- @agent\n- [Image #1]"));
    const { value, positions } = textPositions(doc);
    expect(value).toBe("bold\n@agent\n[Image #1]");
    expect(doc.resolve(positions[0]).parent.type.name).toBe("paragraph");
    expect(doc.nodeAt(positions[value.indexOf("@")])?.type.name).toBe("composerToken");
    expect(doc.resolve(positions.at(-1)!).nodeBefore?.attrs.label).toBe("[Image #1]");
  });
});
