import { expect, spyOn, test } from "bun:test";
import { desktopOpenAgent } from "../src/lib/openagent/tauriClient";
import { createCheckpointController } from "../src/lib/page/checkpoints";
import type { FileChange, RenderableCheckpoint } from "../src/lib/types";

const checkpoint = (id: string, parent: string | null): RenderableCheckpoint => ({
  meta: {
    thread_id: "conv",
    checkpoint_id: id,
    parent_checkpoint_id: parent,
    created_at: 1,
    metadata: "{}",
  },
  data: { messages: [], file_change_ids: [], phase: "final_completed" },
});
const file = (id: string): FileChange => ({
  id,
  checkpoint_id: id,
  conv_id: "conv",
  path: "live.txt",
  operation: "write",
  seq: 0,
  created_at: 1,
});

function fixture() {
  const options: Parameters<typeof createCheckpointController>[0] = {
    tauriAvailable: true,
    activeConvId: "conv",
    conversations: [],
    chatStreams: {
      streamingConversationIds: { conv: true },
      pausedConversationIds: {},
      itemsByConversation: { conv: [{ type: "text", content: "still streaming" }] },
      assistantMessageIds: {},
      startedAt: {},
      firstTokenAt: {},
      awaitingOutput: {},
      memoryRetrievalStages: {},
      memoryRetrievalSkippable: {},
      recoveredConversationIds: {},
      startTiming() {},
      resumeTiming() {},
      recordFirstResponse() {},
      clearAwaitingOutput() {},
      clearMemoryRetrieval() {},
      cleanup() {},
    },
    pendingForkUserMessageIds: {},
    convTrees: {},
    loadingConversationIds: {},
    checkpointLoadErrors: {},
    loadedConvIds: new Set(),
    liveCheckpointRefreshVersions: new Map(),
    branchSelectionVersions: new Map(),
    activeBranchIds: { conv: "branch" },
    liveCheckpointFlowProjections: {},
    liveFileChangesPerConv: {},
    fileChangesPerConv: { conv: [file("saved")] },
    pendingUserInputs: {},
    checkpointFlowPanelAutoOpenKey: null,
    rightSidebarPanel: "files",
    rightSidebarCollapseRequested: false,
    mergeDurableFollowUpSuggestions() {},
    restoreMermaidRenderRequests() {},
    async refreshTaskUsagesForConversation() {},
    findConversationLocation: () => null,
  };
  return { options, controller: createCheckpointController(options) };
}

test("history timeout releases loading, preserves other conversations and allows retry", async () => {
  const { options, controller } = fixture();
  options.chatStreams.streamingConversationIds = {};
  let timedOut = true;
  const invoke = spyOn(desktopOpenAgent, "invokeProduct").mockImplementation((operation) => {
    if (operation === "get_checkpoint_view") {
      return (
        timedOut
          ? Promise.reject(new Error("Runtime history read timed out after 10 seconds"))
          : Promise.resolve([])
      ) as never;
    }
    if (operation === "get_branches") return Promise.resolve([]) as never;
    if (operation === "get_active_branch_tip") return Promise.resolve(null) as never;
    if (operation === "restore_agent_history") return Promise.resolve(undefined) as never;
    throw new Error(`Unexpected operation: ${operation}`);
  });
  try {
    await controller.loadMessagesForConv("conv");
    expect(options.loadingConversationIds.conv).toBeUndefined();
    expect(options.loadedConvIds.has("conv")).toBe(false);
    expect(options.checkpointLoadErrors.conv).toContain("10");
    expect(options.convTrees.conv).toBeUndefined();
    timedOut = false;
    await controller.loadMessagesForConv("other");
    expect(options.loadedConvIds.has("other")).toBe(true);
    expect(options.checkpointLoadErrors.conv).toContain("10");
    await controller.loadMessagesForConv("conv");
    expect(options.loadedConvIds.has("conv")).toBe(true);
    expect(options.checkpointLoadErrors.conv).toBeUndefined();
  } finally {
    invoke.mockRestore();
  }
});

test("live checkpoint files refresh before completion and reject stale or off-branch replies", async () => {
  const { options, controller } = fixture();
  const checkpoints = [checkpoint("first", null), checkpoint("second", "first")];
  const pending: Array<(files: FileChange[]) => void> = [];
  let failFiles = false;
  const requestedTips: Array<string | undefined> = [];
  const invoke = spyOn(desktopOpenAgent, "invokeProduct").mockImplementation(
    (operation, params) => {
      if (operation === "get_checkpoint_view") {
        expect(params).toMatchObject({ convId: "conv" });
        const tip = (params as { checkpointId?: string }).checkpointId;
        requestedTips.push(tip);
        return Promise.resolve(
          checkpoints.map((checkpoint) => ({
            ...checkpoint,
            data_loaded: checkpoint.meta.checkpoint_id === tip,
          })),
        ) as never;
      }
      if (operation === "get_file_changes") {
        if (failFiles) return Promise.reject(new Error("offline")) as never;
        return new Promise<FileChange[]>((resolve) => pending.push(resolve)) as never;
      }
      throw new Error(`Unexpected operation: ${operation}`);
    },
  );
  try {
    const older = controller.refreshLiveCheckpointTip("conv", "first", "branch");
    const newer = controller.refreshLiveCheckpointTip("conv", "second", "branch");
    pending[1]([file("second")]);
    await newer;
    expect(options.fileChangesPerConv.conv).toEqual([file("second")]);
    expect(options.chatStreams.streamingConversationIds.conv).toBe(true);
    expect(options.chatStreams.itemsByConversation.conv).toEqual([
      { type: "text", content: "still streaming" },
    ]);
    pending[0]([file("first")]);
    await older;
    expect(options.fileChangesPerConv.conv).toEqual([file("second")]);

    const offBranch = controller.refreshLiveCheckpointTip("conv", "first", "branch");
    options.activeBranchIds.conv = "sibling";
    options.branchSelectionVersions.set("conv", 1);
    pending[2]([file("first")]);
    await offBranch;
    expect(options.fileChangesPerConv.conv).toEqual([file("second")]);

    options.activeBranchIds.conv = "branch";
    failFiles = true;
    await controller.refreshLiveCheckpointTip("conv", "second", "branch");
    expect(options.fileChangesPerConv.conv).toEqual([file("second")]);
    expect(requestedTips).toEqual(["first", "second", "first", "second"]);
  } finally {
    invoke.mockRestore();
  }
});
