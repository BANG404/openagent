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
