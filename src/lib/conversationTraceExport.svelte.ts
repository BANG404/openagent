import { tr } from "$lib/i18n";
import { showToast } from "$lib/toast";
import type { SavedDownload } from "$lib/openagent/uiCapabilities";

export function createConversationTraceExporter(options: {
  loadTrace: (conversationId: string) => Promise<string>;
  saveFile: (filename: string, content: string) => Promise<SavedDownload>;
}) {
  let exporting = $state(false);
  return {
    get exporting() {
      return exporting;
    },
    async exportTrace(conversationId: string): Promise<void> {
      if (exporting) return;
      exporting = true;
      try {
        const content = await options.loadTrace(conversationId);
        const filename = `openagent-conversation-${conversationId}-${Date.now()}.json`;
        const saved = await options.saveFile(filename, content);
        showToast({
          title: tr("conversationTraceExported"),
          description: saved.location,
          descriptionFromEnd: true,
          variant: "success",
          action: saved.open ? { label: tr("toastOpenFile"), onClick: saved.open } : undefined,
        });
      } catch (error) {
        showToast({
          title: tr("conversationTraceExportFailed"),
          description: String(error),
          variant: "error",
        });
      } finally {
        exporting = false;
      }
    },
  };
}
