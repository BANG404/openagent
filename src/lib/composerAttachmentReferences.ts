import type { ChatAttachment } from "$lib/types";

function referenceKind(attachment: ChatAttachment): "Image" | "File" {
  return attachment.kind === "image" ? "Image" : "File";
}

function appendReferences(value: string, labels: string[]): string {
  if (labels.length === 0) return value;
  const separator = value.length > 0 && !/\s$/u.test(value) ? " " : "";
  return `${value}${separator}${labels.join(" ")} `;
}

export function synchronizeAttachmentReferences(
  value: string,
  attachments: ChatAttachment[],
): { value: string; attachments: ChatAttachment[] } {
  const nextNumbers: Record<"Image" | "File", number> = { Image: 1, File: 1 };
  const replacements: Array<{ previous: string; placeholder: string; next: string }> = [];
  const synchronized = attachments.map((attachment) => {
    const kind = referenceKind(attachment);
    const referenceLabel = `[${kind} #${nextNumbers[kind]}]`;
    nextNumbers[kind] += 1;
    if (attachment.referenceLabel && attachment.referenceLabel !== referenceLabel) {
      replacements.push({
        previous: attachment.referenceLabel,
        placeholder: `\u0000attachment-reference-${replacements.length}\u0000`,
        next: referenceLabel,
      });
    }
    return referenceLabel === attachment.referenceLabel
      ? attachment
      : { ...attachment, referenceLabel };
  });
  let synchronizedValue = value;
  for (const replacement of replacements) {
    synchronizedValue = synchronizedValue.replaceAll(replacement.previous, replacement.placeholder);
  }
  for (const replacement of replacements) {
    synchronizedValue = synchronizedValue.replaceAll(replacement.placeholder, replacement.next);
  }
  const missingLabels = synchronized.flatMap((attachment) =>
    synchronizedValue.includes(attachment.referenceLabel!) ? [] : [attachment.referenceLabel!],
  );
  return {
    value: appendReferences(synchronizedValue, missingLabels),
    attachments: synchronized,
  };
}

export function attachmentsReferencedByText(
  value: string,
  attachments: ChatAttachment[],
): ChatAttachment[] {
  return attachments.filter(
    (attachment) => !attachment.referenceLabel || value.includes(attachment.referenceLabel),
  );
}

export function removeAttachmentReference(value: string, referenceLabel?: string): string {
  if (!referenceLabel) return value;
  let result = value;
  let index = result.indexOf(referenceLabel);
  while (index !== -1) {
    let start = index;
    let end = index + referenceLabel.length;
    if (result[end] === " ") end += 1;
    else if (start > 0 && result[start - 1] === " ") start -= 1;
    result = `${result.slice(0, start)}${result.slice(end)}`;
    index = result.indexOf(referenceLabel);
  }
  return result;
}
