// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, mock, spyOn, test } from "bun:test";
import {
  AgentCompletionNotifier,
  notifyAgentReplyCompleted,
  shouldNotifyAgentReplyCompleted,
} from "../src/lib/agentCompletionNotification";

function notificationApi(permissionGranted: boolean, requested: NotificationPermission = "denied") {
  return {
    isPermissionGranted: mock(async () => permissionGranted),
    requestPermission: mock(async () => requested),
    sendNotification: mock(() => {}),
  };
}

describe("Agent completion notifications", () => {
  test("only notifies for a live successful reply in an inactive Tauri window", () => {
    const context = {
      status: "completed",
      windowFocused: false,
      tauriAvailable: true,
      wasStreaming: true,
    } as const;

    expect(shouldNotifyAgentReplyCompleted(context)).toBe(true);
    expect(shouldNotifyAgentReplyCompleted({ ...context, windowFocused: true })).toBe(false);
    expect(shouldNotifyAgentReplyCompleted({ ...context, tauriAvailable: false })).toBe(false);
    expect(shouldNotifyAgentReplyCompleted({ ...context, wasStreaming: false })).toBe(false);
    expect(shouldNotifyAgentReplyCompleted({ ...context, status: "interrupted" })).toBe(false);
    expect(shouldNotifyAgentReplyCompleted({ ...context, status: "cancelled" })).toBe(false);
    expect(shouldNotifyAgentReplyCompleted({ ...context, status: "failed" })).toBe(false);
  });

  test("sends a generic notification when permission is already granted", async () => {
    const api = notificationApi(true);

    expect(await notifyAgentReplyCompleted("Agent 已完成回复", api)).toBe(true);
    expect(api.requestPermission).not.toHaveBeenCalled();
    expect(api.sendNotification).toHaveBeenCalledWith({
      title: "OpenAgent",
      body: "Agent 已完成回复",
    });
  });

  test("requests permission before the first notification", async () => {
    const api = notificationApi(false, "granted");

    expect(await notifyAgentReplyCompleted("Agent finished responding", api)).toBe(true);
    expect(api.requestPermission).toHaveBeenCalledTimes(1);
    expect(api.sendNotification).toHaveBeenCalledTimes(1);
  });

  test("does not send when notification permission is denied", async () => {
    const api = notificationApi(false, "denied");

    expect(await notifyAgentReplyCompleted("Agent finished responding", api)).toBe(false);
    expect(api.sendNotification).not.toHaveBeenCalled();
  });

  test("contains plugin failures without affecting stream finalization", async () => {
    const api = notificationApi(true);
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    api.sendNotification.mockImplementation(() => {
      throw new Error("unavailable");
    });

    expect(await notifyAgentReplyCompleted("Agent finished responding", api)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  test("checks native focus at completion and suppresses active-window notifications", async () => {
    const api = notificationApi(true);
    const notifier = new AgentCompletionNotifier(api);
    const windowApi = { isFocused: mock(async () => true) };

    expect(
      await notifier.notifyIfInactive(
        {
          replyId: "reply-active",
          status: "completed",
          tauriAvailable: true,
          wasStreaming: true,
        },
        windowApi,
        "Agent finished responding",
      ),
    ).toBe(false);
    expect(windowApi.isFocused).toHaveBeenCalledTimes(1);
    expect(api.sendNotification).not.toHaveBeenCalled();
  });

  test("deduplicates racing terminal and fallback completion paths by reply ID", async () => {
    const api = notificationApi(true);
    const notifier = new AgentCompletionNotifier(api);
    const windowApi = { isFocused: mock(async () => false) };
    const request = {
      replyId: "reply-race",
      status: "completed",
      tauriAvailable: true,
      wasStreaming: true,
    } as const;

    expect(
      await Promise.all([
        notifier.notifyIfInactive(request, windowApi, "Agent finished responding"),
        notifier.notifyIfInactive(request, windowApi, "Agent finished responding"),
      ]),
    ).toEqual([true, false]);
    expect(windowApi.isFocused).toHaveBeenCalledTimes(1);
    expect(api.sendNotification).toHaveBeenCalledTimes(1);
  });

  test("fails closed when native focus state cannot be read", async () => {
    const api = notificationApi(true);
    const notifier = new AgentCompletionNotifier(api);
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const windowApi = {
      isFocused: mock(async () => {
        throw new Error("unavailable");
      }),
    };

    expect(
      await notifier.notifyIfInactive(
        {
          replyId: "reply-focus-error",
          status: "completed",
          tauriAvailable: true,
          wasStreaming: true,
        },
        windowApi,
        "Agent finished responding",
      ),
    ).toBe(false);
    expect(api.sendNotification).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
