import type { ChatAttachment } from "$lib/types";
import { parseInline } from "$lib/composerMarkdown";
import { renderInlineNodes } from "$lib/composerDom";

export const USER_MESSAGE_COLLAPSE_LINES = 8;
const USER_MESSAGE_COLLAPSE_LENGTH = 800;

export function isLongUserMessage(content: string) {
  return (
    content.length > USER_MESSAGE_COLLAPSE_LENGTH ||
    content.split("\n").length > USER_MESSAGE_COLLAPSE_LINES
  );
}

export function attachmentReferenceMap(attachments: ChatAttachment[]): ReadonlyMap<string, string> {
  const references = new Map<string, string>();
  for (const attachment of attachments) {
    if (attachment.referenceLabel) references.set(attachment.referenceLabel, attachment.path);
  }
  return references;
}

/**
 * Projects the user's own markdown inline. Block children would break the
 * `-webkit-line-clamp` collapse on `.user-content-text`, so only the inline
 * projection is drawn and block markers stay literal in the bubble.
 */
export function renderUserContent(
  node: HTMLElement,
  params: { content: string; references: ReadonlyMap<string, string> },
) {
  const draw = (next: { content: string; references: ReadonlyMap<string, string> }) => {
    node.replaceChildren();
    renderInlineNodes(node, parseInline(next.content, 0, next.references));
  };
  draw(params);
  return { update: draw };
}
