import { describe, expect, test } from "bun:test";
import { parseInline, serializeInline } from "../src/lib/composerMarkdown";

const MESSAGE_LIST = "../src/lib/components/MessageList.svelte";

const read = (path: string) => Bun.file(new URL(path, import.meta.url)).text();

describe("user transcript markdown", () => {
  test("renders inline formatting", () => {
    const nodes = parseInline("**bold** and `code` and ~~gone~~");
    expect(nodes.map((node) => node.kind)).toEqual(["strong", "text", "code", "text", "del"]);
  });

  test("leaves block markers literal so the bubble can still line-clamp", () => {
    // `-webkit-line-clamp` needs an inline-only flow; block children break it,
    // so block syntax stays literal and the projection is inline + chips only.
    const source = "# head\n> quote\n- [ ] task";
    const nodes = parseInline(source, 0, new Map());
    expect(serializeInline(nodes)).toBe(source);
    for (const node of nodes) expect(["text", "chip"]).toContain(node.kind);
  });

  test("never lets an attachment label become a link", () => {
    const references = new Map([["[Image #1]", "C:/screenshots/example.png"]]);
    const nodes = parseInline("see [Image #1]", 0, references);
    expect(nodes.map((node) => node.kind)).toEqual(["text", "chip"]);
    expect(nodes[1]).toMatchObject({
      raw: "[Image #1]",
      chipKind: "attachment",
      text: "[Image #1]",
    });
    expect(nodes).not.toContain("link");
  });
});

describe("user transcript projection wiring", () => {
  test("projects both bubble states inline and keeps the edit control plain", async () => {
    const source = await read(MESSAGE_LIST);

    // Both the click-to-edit trigger and the read-only bubble render markdown.
    expect(source.match(/use:renderUserContent=/g)).toHaveLength(2);
    expect(source).toContain(
      "renderInlineNodes(node, parseInline(next.content, 0, next.references))",
    );
    // Inline only: block projection would break `-webkit-line-clamp`.
    expect(source).not.toContain("parseBlocks");
    expect(source).not.toContain("renderBlocks");
    // The in-place edit control stays a plain textarea showing raw markdown.
    expect(source).toMatch(/<textarea\s+bind:this=\{editingTextarea\}\s+class="user-content-edit/);
  });

  test("registers attachment labels so the chip renders whole", async () => {
    const source = await read(MESSAGE_LIST);

    expect(source).toMatch(
      /if \(attachment\.referenceLabel\) references\.set\(attachment\.referenceLabel, attachment\.path\);/,
    );
    expect(source).toContain("{@const contentReferences = attachmentReferenceMap(attachments)}");
  });
});
