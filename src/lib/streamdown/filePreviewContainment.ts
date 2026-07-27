export const FILE_PREVIEW_OPEN_RECORD_ATTRIBUTE = "data-file-preview-open";

export function setContainingFilePreviewOpen(target: Element | null): HTMLElement | null {
  const messageRecord = target?.closest<HTMLElement>(".message-record") ?? null;
  messageRecord?.setAttribute(FILE_PREVIEW_OPEN_RECORD_ATTRIBUTE, "true");
  return messageRecord;
}

export function clearContainingFilePreviewOpen(messageRecord: HTMLElement | null): void {
  messageRecord?.removeAttribute(FILE_PREVIEW_OPEN_RECORD_ATTRIBUTE);
}
