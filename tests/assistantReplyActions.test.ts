import { describe, expect, test } from "bun:test";
import { transcriptSource } from "./sourceSurfaces";

describe("assistant reply actions", () => {
  test("renders actions for completed turns while a later turn streams", async () => {
    const source = await transcriptSource();

    expect(source).toMatch(
      /turnStatus\s*=\s*assistantTurnStatus\(turnMessages, assistantIsStreaming\).*turnIsTerminal\s*=\s*\["completed", "cancelled", "failed"\]\.includes\(turnStatus\)/s,
    );
    expect(source).toMatch(
      /showAssistantActions\s*=\s*!assistantIsStreaming\s*&&\s*turnIsTerminal\s*&&\s*\(isRerunnable \|\| Boolean\(copyableOutput\) \|\| renderedAssistantItems\.length > 0\)/s,
    );
    expect(source).toMatch(
      /isRerunnable\s*=\s*assistantMsg !== null\s*&&\s*assistantMsgIdx >= 0\s*&&\s*!assistantIsStreaming\s*&&\s*turnIsTerminal/s,
    );
    expect(source).toContain("{#if showAssistantActions}");
    expect(source).toMatch(
      /assistantMsg\?\.checkpointId\s*\?\?\s*\(assistantIsStreaming\s*\?\s*\(pendingCheckpointId\s*\?\?\s*undefined\)\s*:\s*undefined\)/s,
    );
  });
});
