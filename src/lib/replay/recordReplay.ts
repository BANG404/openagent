import { FrontendCapture, CAPTURE_EVENTS } from "./capture";
import type { CaptureAnchor, CaptureSink } from "./captureTypes";
import { createChatReplayTarget } from "./chatTarget";
import { replayCase, type ReplayTargetFactory } from "./runner";
import { RecordingTransport } from "./recordingTransport";
import { validateReplayCase, object, string } from "./validate";
import type { Json, ReplayRecord, ReplayStep } from "./types";

/** Synthetic qualification: record actual consumer callbacks, not fixture copies. */
export async function recordFrontendReplay(
  input: unknown,
  sink: CaptureSink,
  options: {
    anchor?: (anchor: CaptureAnchor) => Promise<void>;
    observe?: (state: Json) => void;
  } = {},
) {
  const source = validateReplayCase(input);
  const initial = object(source.initial);
  const primary = string(initial.active_conversation);
  const existingStreams = initial.streams as Array<{ conversation: string; assistant: string }>;
  const streams = existingStreams.filter((stream) => stream.conversation === primary);
  const starts: ReplayRecord[] = streams.map((stream, index) => ({
    record_id: `capture-start-${index}`,
    producer: "capture-start",
    epoch: 0,
    seq: index + 1,
    kind: "action",
    correlation: `capture-start-${index}`,
    caused_by: [],
    monotonic_offset_us: 0,
    payload: {
      action: "start-stream",
      conversation: stream.conversation,
      assistant: stream.assistant,
    },
  }));
  const steps: ReplayStep[] = starts.map((record, index) => ({
    step: `capture-start-step-${index}`,
    do: "action",
    record: record.record_id,
    after: index ? [`capture-start-step-${index - 1}`] : [],
  }));
  // Existing sibling activity is an initial observation, outside the selected run.
  initial.streams = existingStreams.filter((stream) => stream.conversation !== primary);
  source.records = [...starts, ...source.records];
  source.schedule = [...steps, ...source.schedule];
  const anchor: CaptureAnchor = {
    initial: source.initial,
    conversations: [primary],
    subscriptions: [...CAPTURE_EVENTS],
    scope: "consumer-observed",
    idle: true,
  };
  await options.anchor?.(anchor);
  let capture: FrontendCapture | undefined;
  let result: ReturnType<FrontendCapture["stop"]> | undefined;
  const factory: ReplayTargetFactory = async (initial, transport, fixture) => {
    const recording = new RecordingTransport(transport);
    const target = await createChatReplayTarget(initial, transport, fixture, recording);
    capture = new FrontendCapture(anchor, sink);
    recording.capture = capture;
    const wrapped = {
      ...target,
      action(name: string, payload: Record<string, unknown>) {
        if (capture!.includes(payload.conversation)) capture!.action(payload);
        target.action(name, payload);
      },
      close() {
        // Stop observation before intentionally disposing this qualified consumer.
        recording.capture = null;
        result = capture!.stop();
        options.observe?.(target.observe());
        target.close();
      },
    };
    return wrapped;
  };
  const report = await replayCase(source, factory);
  if (report.status !== "passed") capture?.invalidate("source-run-failed");
  return {
    anchor,
    report,
    result: result
      ? await result
      : { reasons: ["target-not-created"], records: 0, committed_seq: 0 },
  };
}
