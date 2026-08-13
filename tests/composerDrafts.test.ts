// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import {
  ComposerDraftStore,
  conversationComposerDraftKey,
  newConversationComposerDraftKey,
} from "../src/lib/composerDrafts";

describe("ComposerDraftStore", () => {
  test("keeps text, attachments, and quoted context isolated by conversation", () => {
    const store = new ComposerDraftStore();
    const firstKey = conversationComposerDraftKey("first");
    const secondKey = conversationComposerDraftKey("second");
    const first = store.activate(firstKey);
    first.text = "first draft";
    first.attachments = [{ path: "C:/first.txt", name: "first.txt", kind: "document" }];
    first.contexts = [{ type: "quote", text: "selected answer", sourceMessageId: "assistant-1" }];

    const second = store.activate(secondKey);
    second.text = "second draft";

    expect(store.activate(firstKey)).toEqual({
      text: "first draft",
      attachments: [{ path: "C:/first.txt", name: "first.txt", kind: "document" }],
      contexts: [{ type: "quote", text: "selected answer", sourceMessageId: "assistant-1" }],
    });
    expect(store.activate(secondKey)).toEqual({
      text: "second draft",
      attachments: [],
      contexts: [],
    });
  });

  test("separates new-conversation drafts by workspace and role", () => {
    expect(newConversationComposerDraftKey("C:/one", "openagent")).not.toBe(
      newConversationComposerDraftKey("C:/two", "openagent"),
    );
    expect(newConversationComposerDraftKey("C:/one", "openagent")).not.toBe(
      newConversationComposerDraftKey("C:/one", "reviewer"),
    );
  });

  test("clears, remaps, and deletes only the targeted draft", () => {
    const store = new ComposerDraftStore();
    const sourceKey = conversationComposerDraftKey("temporary");
    const targetKey = conversationComposerDraftKey("durable");
    store.activate(sourceKey).contexts = [
      { type: "quote", text: "keep me", sourceMessageId: "assistant-2" },
    ];

    expect(store.remap(sourceKey, targetKey).contexts).toHaveLength(1);
    expect(store.clear(targetKey)).toEqual({ text: "", attachments: [], contexts: [] });
    store.delete(targetKey);
    expect(store.activate(targetKey)).toEqual({ text: "", attachments: [], contexts: [] });
  });
});
