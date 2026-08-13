import type { ChatAttachment, UserMessageContext } from "$lib/types";

export interface ComposerDraft {
  text: string;
  attachments: ChatAttachment[];
  contexts: UserMessageContext[];
}

export function conversationComposerDraftKey(conversationId: string): string {
  return `conversation:${conversationId}`;
}

export function newConversationComposerDraftKey(workspacePath: string, roleKey: string): string {
  return `new-conversation:${JSON.stringify([workspacePath, roleKey])}`;
}

export function createComposerDraft(): ComposerDraft {
  return { text: "", attachments: [], contexts: [] };
}

/** Keeps pending composer content isolated while the page switches conversations. */
export class ComposerDraftStore {
  readonly #drafts = new Map<string, ComposerDraft>();

  activate(key: string): ComposerDraft {
    const existing = this.#drafts.get(key);
    if (existing) return existing;
    const draft = createComposerDraft();
    this.#drafts.set(key, draft);
    return draft;
  }

  clear(key: string): ComposerDraft {
    const draft = createComposerDraft();
    this.#drafts.set(key, draft);
    return draft;
  }

  remap(fromKey: string, toKey: string): ComposerDraft {
    const draft = this.#drafts.get(fromKey) ?? this.activate(toKey);
    this.#drafts.delete(fromKey);
    this.#drafts.set(toKey, draft);
    return draft;
  }

  delete(key: string): void {
    this.#drafts.delete(key);
  }
}
