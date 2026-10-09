import type { ChatAttachment } from "$lib/types";
import { parseBlocks } from "$lib/composerMarkdown";
import { renderBlocks } from "$lib/composerDom";

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
 * Uses the composer's block and inline projection so sending a message keeps
 * its formatting. The bubble clips long content by height, retaining blocks.
 */
export function renderUserContent(
  node: HTMLElement,
  params: { content: string; references: ReadonlyMap<string, string> },
) {
  const draw = (next: { content: string; references: ReadonlyMap<string, string> }) => {
    renderBlocks(node, parseBlocks(next.content, next.references));
  };
  draw(params);
  return { update: draw };
}
