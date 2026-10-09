import { invoke as nativeInvoke } from "@tauri-apps/api/core";
import { desktopRecordingTransport } from "../openagent/tauriClient";
import { FrontendCapture, CAPTURE_EVENTS } from "./capture";
import type { CaptureAnchor } from "./captureTypes";
import { ReplayError, type Json } from "./types";
import { setFrontendActionObserver } from "./captureObservation";
import { frontendBuildLabel } from "../frontendBuild";

interface CaptureContext {
  snapshot: (conversations: string[]) => Json;
  idle: (conversations: string[]) => boolean;
}
let context: CaptureContext | null = null;
let active: { capture: FrontendCapture; session: Promise<string> } | null = null;

/** Only explicit local developer calls arm private-content capture. No persisted switch. */
export async function startFrontendCapture(options: {
  conversations: string[];
  includePrivateContent: true;
}) {
  if (!import.meta.env.DEV || !context || options.includePrivateContent !== true || active)
    throw new ReplayError("unsupported", "capture-not-available");
  if (!desktopRecordingTransport.idle || !context.idle(options.conversations))
    throw new ReplayError("capture_incomplete", "capture-requires-idle");
  const subscriptions = [...desktopRecordingTransport.subscriptions]
    .filter(([event, count]) => CAPTURE_EVENTS.has(event) && count === 1)
    .map(([event]) => event);
  if ([...CAPTURE_EVENTS].some((event) => !subscriptions.includes(event)))
    throw new ReplayError("capture_incomplete", "capture-requires-subscriptions");
  const anchor: CaptureAnchor = {
    initial: context.snapshot(options.conversations),
    conversations: options.conversations,
    subscriptions,
    scope: "consumer-observed",
    idle: true,
    frontend_build: frontendBuildLabel,
  };
  const capture: FrontendCapture = new FrontendCapture(anchor, {
    append: async (record): Promise<void> =>
      nativeInvoke<void>("append_frontend_capture", {
        sessionId: await session,
        recordJson: JSON.stringify(record),
      }),
  });
  // Activate synchronously at the snapshot cut; buffer observations during native creation.
  desktopRecordingTransport.capture = capture;
  setFrontendActionObserver(recordFrontendAction);
  const session: Promise<string> = nativeInvoke<string>("begin_frontend_capture", {
    anchorJson: JSON.stringify(capture.anchor),
    includePrivateContent: true,
  });
  active = { capture, session };
  try {
    return { session_id: await session, scope: "consumer-observed" };
  } catch {
    capture.invalidate("writer-start-failed");
    desktopRecordingTransport.capture = null;
    setFrontendActionObserver(null);
    active = null;
    throw new ReplayError("capture_incomplete", "writer-start-failed");
  }
}

export async function stopFrontendCapture() {
  if (!active) throw new ReplayError("unsupported", "no-active-capture");
  const current = active;
  active = null;
  desktopRecordingTransport.capture = null;
  setFrontendActionObserver(null);
  const result = await current.capture.stop();
  return nativeInvoke("finish_frontend_capture", {
    sessionId: await current.session,
    resultJson: JSON.stringify(result),
  });
}

export function recordFrontendAction(payload: Record<string, unknown>): void {
  const capture = desktopRecordingTransport.capture;
  if (!capture?.includes(payload.conversation)) return;
  if (payload.action === "insert-user") {
    const message = payload.message as { items?: unknown[] } | undefined;
    if (message?.items?.length === 0) {
      const { items: _emptyItems, ...plain } = message;
      capture.action({ ...payload, message: plain });
      return;
    }
  }
  capture.action(payload);
}

export function invalidateFrontendCapture(reason: string): void {
  desktopRecordingTransport.capture?.invalidate(reason);
}

/** A reload abandons the open manifest. It cannot silently become a full capture. */
export function registerFrontendCaptureContext(value: CaptureContext): () => void {
  context = value;
  if (import.meta.env.DEV && typeof window !== "undefined") {
    Object.defineProperty(window, "openagentFaultCapture", {
      configurable: true,
      value: { start: startFrontendCapture, stop: stopFrontendCapture },
    });
  }
  return () => {
    invalidateFrontendCapture("consumer-reloaded");
    if (active) void active.capture.stop();
    active = null;
    desktopRecordingTransport.capture = null;
    setFrontendActionObserver(null);
    context = null;
    if (typeof window !== "undefined") Reflect.deleteProperty(window, "openagentFaultCapture");
  };
}
