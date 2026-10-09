import { describe, expect, test } from "bun:test";
import { parseBlocks, parseInline, serializeBlocks } from "../src/lib/composerMarkdown";

const USER_MESSAGE_ROW = "../src/lib/components/transcript/UserMessageRow.svelte";
const USER_CONTENT = "../src/lib/transcript/userContent.ts";

const read = (path: string) => Bun.file(new URL(path, import.meta.url)).text();

describe("user transcript markdown", () => {
  test("renders inline formatting", () => {
    const nodes = parseInline("**bold** and `code` and ~~gone~~");
    expect(nodes.map((node) => node.kind)).toEqual(["strong", "text", "code", "text", "del"]);
  });

  test("preserves heading, quote, task and literal fenced code through projection", () => {
    const source = "# head\n> quote\n- [ ] task\n```md\n# **literal**\n```";
    const blocks = parseBlocks(source);
    expect(blocks.map((block) => block.kind)).toEqual([
      "heading",
      "quote",
      "listItem",
      "codeBlock",
      "codeBlock",
      "codeBlock",
    ]);
    expect(blocks[0].inline[0].text).toBe("head");
    expect(blocks[4].inline[0].text).toBe("# **literal**");
    expect(serializeBlocks(blocks)).toBe(source);
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
  test("projects both bubble states as blocks and keeps the edit control plain", async () => {
    const source = (await Promise.all([read(USER_MESSAGE_ROW), read(USER_CONTENT)])).join("\n");

    // Both the click-to-edit trigger and the read-only bubble render markdown.
    expect(source.match(/use:renderUserContent=/g)).toHaveLength(2);
    expect(source).toContain("renderBlocks(node, parseBlocks(next.content, next.references))");
    expect(source).toContain("max-height: calc(var(--user-message-collapse-lines) * 1.47em)");
    expect(source).not.toContain("-webkit-line-clamp");
    // The in-place edit control stays a plain textarea showing raw markdown.
    expect(source).toMatch(
      /<textarea\s+bind:this=\{edit\.editingTextarea\}\s+class="user-content-edit/,
    );
  });

  test("registers attachment labels so the chip renders whole", async () => {
    const source = (await Promise.all([read(USER_MESSAGE_ROW), read(USER_CONTENT)])).join("\n");

    expect(source).toMatch(
      /if \(attachment\.referenceLabel\) references\.set\(attachment\.referenceLabel, attachment\.path\);/,
    );
    expect(source).toContain(
      "let contentReferences = $derived(attachmentReferenceMap(attachments))",
    );
  });
});
