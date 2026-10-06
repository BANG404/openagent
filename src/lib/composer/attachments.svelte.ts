import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { tick } from "svelte";
import { fromStore } from "svelte/store";
import { t } from "$lib/i18n";
import { showToast } from "$lib/toast";
import type { ChatAttachment } from "$lib/types";
import type { OpenAgentClient } from "$lib/openagent/client";
import { setMarkdownSelection } from "$lib/composerDom";
import { attachmentNameSupported, selectableAttachmentExtensions } from "$lib/attachmentPolicy";
import {
  attachmentsReferencedByText,
  removeAttachmentReference,
  synchronizeAttachmentReferences,
} from "$lib/composerAttachmentReferences";

interface AttachmentOptions {
  value: string;
  attachments: ChatAttachment[];
  readonly editorEl: HTMLDivElement | null;
  readonly disabled: boolean;
  readonly showAttachments: boolean;
  readonly allowImageAttachments: boolean;
  readonly tauriAvailable: boolean;
  readonly client: Pick<OpenAgentClient, "invokeProduct">;
  readonly onUploadAttachments?: (files: File[]) => Promise<ChatAttachment[]>;
  readonly onAttachmentPickerOpenChange?: (open: boolean) => void | Promise<void>;
  insertPastedText(event: ClipboardEvent): void;
}

/** Own file selection, uploads, and synchronization with canonical Markdown. */
export function createAttachmentController(options: AttachmentOptions) {
  const translate = fromStore(t);
  let browserFileInput = $state<HTMLInputElement | null>(null);
  let referencedAttachmentPaths = new Set<string>();
  const maxAttachments = 8;
  const maxAttachmentBytes = 20 * 1024 * 1024;
  const attachmentExtensions = $derived(
    selectableAttachmentExtensions(options.allowImageAttachments),
  );
  const browserAttachmentAccept = $derived(
    attachmentExtensions.map((extension) => `.${extension}`).join(","),
  );
  function attachmentKind(path: string): ChatAttachment["kind"] {
    return /\.(png|jpe?g|gif|webp)$/i.test(path) ? "image" : "document";
  }

  function appendAttachments(paths: string[], pasted = false) {
    const known = new Set(options.attachments.map((item) => item.path));
    const added = paths
      .filter((path) => !known.has(path))
      .map((path) => ({
        path,
        name: pasted
          ? (path
              .split(/[/\\]/)
              .pop()
              ?.replace(/^[0-9a-f-]{36}-/i, "") ?? path)
          : (path.split(/[/\\]/).pop() ?? path),
        kind: attachmentKind(path),
      }));
    setAttachments([...options.attachments, ...added].slice(0, maxAttachments));
  }

  function appendAttachmentRecords(items: ChatAttachment[]) {
    const known = new Set(options.attachments.map((item) => item.path));
    setAttachments(
      [...options.attachments, ...items.filter((item) => !known.has(item.path))].slice(
        0,
        maxAttachments,
      ),
    );
  }

  function setAttachments(nextAttachments: ChatAttachment[]) {
    const synchronized = synchronizeAttachmentReferences(options.value, nextAttachments);
    options.attachments = synchronized.attachments;
    options.value = synchronized.value;
    const limit = synchronized.value.length;
    void tick().then(() => {
      if (!options.editorEl) return;
      options.editorEl.focus();
      setMarkdownSelection(options.editorEl, limit);
    });
  }

  async function pickAttachments() {
    if (options.disabled) return;
    if (!options.tauriAvailable) {
      browserFileInput?.click();
      return;
    }
    await options.onAttachmentPickerOpenChange?.(true);
    try {
      const selected = await openDialog({
        multiple: true,
        directory: false,
        filters: [
          {
            name: "Multimodal files",
            extensions: attachmentExtensions,
          },
        ],
      });
      const paths = typeof selected === "string" ? [selected] : (selected ?? []);
      const accepted = paths.filter((path) => isSupportedAttachment(path));
      const unsupported = paths.find((path) => !isSupportedAttachment(path));
      if (unsupported) {
        const unsupportedName = unsupported.split(/[/\\]/).pop() ?? unsupported;
        showToast({
          title: translate.current("attachmentPasteFailed"),
          description: `${unsupportedName}: ${translate.current("attachmentUnsupported")}`,
          variant: "error",
        });
      }
      appendAttachments(accepted);
    } finally {
      await options.onAttachmentPickerOpenChange?.(false);
    }
  }

  async function uploadBrowserFiles(files: File[]) {
    if (!options.onUploadAttachments || files.length === 0) return;
    const availableSlots = Math.max(0, maxAttachments - options.attachments.length);
    if (availableSlots === 0) {
      showToast({ title: translate.current("attachmentLimitReached"), variant: "error" });
      return;
    }
    const accepted = files.slice(0, availableSlots).filter((file) => {
      if (file.size > maxAttachmentBytes) {
        showToast({
          title: translate.current("attachmentPasteFailed"),
          description: `${file.name || "Attachment"}: ${translate.current("attachmentTooLarge")}`,
          variant: "error",
        });
        return false;
      }
      if (!isSupportedAttachment(file.name)) {
        showToast({
          title: translate.current("attachmentPasteFailed"),
          description: `${file.name}: ${translate.current("attachmentUnsupported")}`,
          variant: "error",
        });
        return false;
      }
      return true;
    });
    try {
      appendAttachmentRecords(await options.onUploadAttachments(accepted));
    } catch (error) {
      showToast({
        title: translate.current("attachmentPasteFailed"),
        description: String(error),
        variant: "error",
      });
    }
    if (files.length > availableSlots) {
      showToast({ title: translate.current("attachmentLimitReached"), variant: "error" });
    }
  }

  function handleBrowserFileSelection(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    void uploadBrowserFiles(Array.from(input.files ?? []));
    input.value = "";
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") {
          reject(new Error("Unable to read pasted attachment"));
          return;
        }
        resolve(result.slice(result.indexOf(",") + 1));
      };
      reader.onerror = () => reject(reader.error ?? new Error("Unable to read pasted attachment"));
      reader.readAsDataURL(file);
    });
  }

  function pastedFileName(file: File, index: number): string {
    if (file.name.trim()) return file.name;
    const extension =
      file.type === "image/jpeg"
        ? "jpg"
        : file.type === "image/svg+xml"
          ? "svg"
          : file.type.split("/")[1] || "png";
    return `pasted-${Date.now()}-${index + 1}.${extension}`;
  }

  function isSupportedAttachment(name: string): boolean {
    return attachmentNameSupported(name, options.allowImageAttachments);
  }

  async function handlePaste(event: ClipboardEvent) {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length === 0) {
      options.insertPastedText(event);
      return;
    }
    if (!options.showAttachments) return;
    event.preventDefault();
    if (options.disabled) return;

    if (!options.tauriAvailable) {
      await uploadBrowserFiles(files);
      return;
    }

    const availableSlots = Math.max(0, maxAttachments - options.attachments.length);
    if (availableSlots === 0) {
      showToast({ title: translate.current("attachmentLimitReached"), variant: "error" });
      return;
    }

    const accepted = files
      .slice(0, availableSlots)
      .map((file, index) => ({ file, name: pastedFileName(file, index) }));
    const oversized = accepted.find(({ file }) => file.size > maxAttachmentBytes);
    if (oversized) {
      showToast({
        title: translate.current("attachmentPasteFailed"),
        description: `${oversized.file.name || "Attachment"}: ${translate.current("attachmentTooLarge")}`,
        variant: "error",
      });
    }
    const unsupported = accepted.find(({ name }) => !isSupportedAttachment(name));
    if (unsupported) {
      showToast({
        title: translate.current("attachmentPasteFailed"),
        description: `${unsupported.name}: ${translate.current("attachmentUnsupported")}`,
        variant: "error",
      });
    }

    const results = await Promise.allSettled(
      accepted
        .filter(({ file, name }) => file.size <= maxAttachmentBytes && isSupportedAttachment(name))
        .map(async ({ file, name }) => {
          const contentBase64 = await fileToBase64(file);
          return options.client.invokeProduct("save_pasted_attachment", { name, contentBase64 });
        }),
    );
    const paths = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    appendAttachments(paths, true);
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") {
      showToast({
        title: translate.current("attachmentPasteFailed"),
        description: String(failed.reason),
        variant: "error",
      });
    }
    if (files.length > availableSlots) {
      showToast({ title: translate.current("attachmentLimitReached"), variant: "error" });
    }
  }

  function removeAttachment(path: string) {
    const removed = options.attachments.find((item) => item.path === path);
    if (removed?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(removed.previewUrl);
    const nextValue = removeAttachmentReference(options.value, removed?.referenceLabel);
    const synchronized = synchronizeAttachmentReferences(
      nextValue,
      options.attachments.filter((item) => item.path !== path),
    );
    options.attachments = synchronized.attachments;
    options.value = synchronized.value;
  }

  $effect(() => {
    const hasNewAttachment = options.attachments.some(
      (attachment) => !referencedAttachmentPaths.has(attachment.path),
    );
    if (hasNewAttachment || options.attachments.some((attachment) => !attachment.referenceLabel)) {
      const synchronized = synchronizeAttachmentReferences(options.value, options.attachments);
      referencedAttachmentPaths = new Set(
        synchronized.attachments.map((attachment) => attachment.path),
      );
      if (
        synchronized.attachments.some(
          (attachment, index) => attachment !== options.attachments[index],
        )
      ) {
        options.attachments = synchronized.attachments;
      }
      if (synchronized.value !== options.value) options.value = synchronized.value;
      return;
    }

    const retainedAttachments = attachmentsReferencedByText(options.value, options.attachments);
    for (const attachment of options.attachments) {
      if (!retainedAttachments.includes(attachment) && attachment.previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    }
    const synchronized = synchronizeAttachmentReferences(options.value, retainedAttachments);
    if (
      synchronized.value !== options.value ||
      synchronized.attachments.length !== options.attachments.length ||
      synchronized.attachments.some(
        (attachment, index) => attachment !== options.attachments[index],
      )
    ) {
      options.attachments = synchronized.attachments;
      options.value = synchronized.value;
    }
    referencedAttachmentPaths = new Set(
      synchronized.attachments.map((attachment) => attachment.path),
    );
  });

  return {
    get browserFileInput() {
      return browserFileInput;
    },
    set browserFileInput(next: HTMLInputElement | null) {
      browserFileInput = next;
    },
    get browserAttachmentAccept() {
      return browserAttachmentAccept;
    },
    pickAttachments,
    handleBrowserFileSelection,
    handlePaste,
    removeAttachment,
    uploadBrowserFiles,
  };
}
