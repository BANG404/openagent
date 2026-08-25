import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

interface NotificationOptions {
  title: string;
  body: string;
}

export interface AgentCompletionNotificationApi {
  isPermissionGranted(): Promise<boolean>;
  requestPermission(): Promise<NotificationPermission>;
  sendNotification(options: NotificationOptions): void;
}

interface AgentReplyCompletionContext {
  status: "running" | "completed" | "interrupted" | "cancelled" | "failed";
  windowFocused: boolean;
  tauriAvailable: boolean;
  wasStreaming: boolean;
}

interface AgentReplyCompletionRequest {
  replyId: string;
  status: AgentReplyCompletionContext["status"];
  tauriAvailable: boolean;
  wasStreaming: boolean;
}

export interface AgentCompletionWindowApi {
  isFocused(): Promise<boolean>;
}

const notificationApi: AgentCompletionNotificationApi = {
  isPermissionGranted,
  requestPermission,
  sendNotification,
};

export function shouldNotifyAgentReplyCompleted({
  status,
  windowFocused,
  tauriAvailable,
  wasStreaming,
}: AgentReplyCompletionContext): boolean {
  return status === "completed" && !windowFocused && tauriAvailable && wasStreaming;
}

export async function notifyAgentReplyCompleted(
  body: string,
  api: AgentCompletionNotificationApi = notificationApi,
): Promise<boolean> {
  try {
    let permissionGranted = await api.isPermissionGranted();
    if (!permissionGranted) {
      permissionGranted = (await api.requestPermission()) === "granted";
    }
    if (!permissionGranted) return false;

    api.sendNotification({ title: "OpenAgent", body });
    return true;
  } catch (error) {
    console.warn("Failed to send Agent completion notification:", error);
    return false;
  }
}

export class AgentCompletionNotifier {
  private readonly handledReplyIds = new Set<string>();

  constructor(
    private readonly api: AgentCompletionNotificationApi = notificationApi,
    private readonly historyLimit = 512,
  ) {}

  async notifyIfInactive(
    request: AgentReplyCompletionRequest,
    windowApi: AgentCompletionWindowApi | null,
    body: string,
  ): Promise<boolean> {
    if (
      request.status !== "completed" ||
      !request.tauriAvailable ||
      !request.wasStreaming ||
      !windowApi ||
      this.handledReplyIds.has(request.replyId)
    ) {
      return false;
    }

    // Claim the reply before awaiting native focus state. The terminal event and
    // submit fallback may race, but one logical reply must produce at most one
    // notification attempt.
    this.rememberHandledReply(request.replyId);

    try {
      const windowFocused = await windowApi.isFocused();
      if (!shouldNotifyAgentReplyCompleted({ ...request, windowFocused })) return false;
      return notifyAgentReplyCompleted(body, this.api);
    } catch (error) {
      // A failed native focus read is not evidence that the window is inactive.
      console.warn("Failed to read window focus for Agent completion notification:", error);
      return false;
    }
  }

  private rememberHandledReply(replyId: string): void {
    this.handledReplyIds.add(replyId);
    if (this.handledReplyIds.size <= this.historyLimit) return;
    const oldestReplyId = this.handledReplyIds.values().next().value;
    if (oldestReplyId) this.handledReplyIds.delete(oldestReplyId);
  }
}
