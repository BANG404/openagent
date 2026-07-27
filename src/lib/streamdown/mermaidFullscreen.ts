export const MERMAID_EXPANDED_RECORD_ATTRIBUTE = "data-mermaid-expanded";
export const MERMAID_EXPANDED_ATTRIBUTE = "data-expanded";

export type MermaidFullscreenPortal = {
  host: HTMLElement;
  restore: () => void;
};

export function setContainingMessageExpanded(target: Element | null, expanded: boolean): HTMLElement | null {
  const messageRecord = target?.closest<HTMLElement>(".message-record") ?? null;
  if (!messageRecord) return null;
  messageRecord.toggleAttribute(MERMAID_EXPANDED_RECORD_ATTRIBUTE, expanded);
  return messageRecord;
}

export function clearContainingMessageExpanded(messageRecord: HTMLElement | null): void {
  messageRecord?.removeAttribute(MERMAID_EXPANDED_RECORD_ATTRIBUTE);
}

export function portalContainingMermaid(
  target: Element | null,
  portalRoot: HTMLElement = document.body,
): MermaidFullscreenPortal | null {
  const host = target?.closest<HTMLElement>("[data-streamdown-mermaid]") ?? null;
  const parent = host?.parentNode ?? null;
  if (!host || !parent || host === portalRoot) return null;

  const nextSibling = host.nextSibling;
  let restored = false;
  portalRoot.appendChild(host);
  host.setAttribute(MERMAID_EXPANDED_ATTRIBUTE, "true");

  return {
    host,
    restore() {
      if (restored) return;
      restored = true;
      host.setAttribute(MERMAID_EXPANDED_ATTRIBUTE, "false");
      if (nextSibling?.parentNode === parent) {
        parent.insertBefore(host, nextSibling);
      } else {
        parent.appendChild(host);
      }
    },
  };
}
