import type { OpenAgentClient, RemoteConversationState } from "$lib/openagent";
import {
  buildTreeFromCheckpoints,
  selectActivePathToCheckpoint,
  ROOT_KEY,
  type ConvTree,
} from "$lib/checkpointTree";
import type { FileChange } from "$lib/types";

interface HistoryOptions {
  client: Pick<
    OpenAgentClient,
    | "getRemoteConversationHistory"
    | "switchRemoteConversationBranch"
    | "getRemoteConversationState"
    | "revertRemoteFileChange"
  >;
  conversation: RemoteConversationState | null;
  readonly running: boolean;
  readonly messagesEl: HTMLElement | null;
  perform: (action: () => Promise<void>) => Promise<void>;
}

/** Branch history is a projection of the selected remote conversation. */
export function createRemoteHistoryController(options: HistoryOptions) {
  let activeTree = $state<ConvTree | undefined>();
  let activeBranchId = $state<string | null>(null);
  let fileChanges = $state<FileChange[]>([]);
  let generation = 0;

  function reset() {
    generation += 1;
    activeTree = undefined;
    activeBranchId = null;
    fileChanges = [];
  }
  async function load(
    convId: string,
    isCurrent: () => boolean = () => options.conversation?.conv_id === convId,
  ) {
    const requestedGeneration = ++generation;
    const history = await options.client.getRemoteConversationHistory(convId);
    if (!isCurrent() || requestedGeneration !== generation) return;
    let tree = buildTreeFromCheckpoints(history.checkpoints, activeTree);
    if (history.active_branch_tip)
      tree = selectActivePathToCheckpoint(tree, history.active_branch_tip);
    activeTree = tree;
    activeBranchId =
      history.branches.find((branch) => branch.head_checkpoint_id === history.active_branch_tip)
        ?.id ?? null;
    fileChanges = history.file_changes;
  }
  async function switchBranch(convId: string, parentKey: string, targetIdx: number) {
    if (options.running || !activeTree || options.conversation?.conv_id !== convId) return;
    const siblings =
      parentKey === ROOT_KEY ? activeTree.rootIds : (activeTree.nodes[parentKey]?.childIds ?? []);
    const checkpointId = siblings[targetIdx];
    if (!checkpointId) return;
    await options.perform(async () => {
      const requestedGeneration = generation;
      await options.client.switchRemoteConversationBranch(convId, checkpointId);
      const state = await options.client.getRemoteConversationState(convId);
      if (generation !== requestedGeneration || options.conversation?.conv_id !== convId) return;
      options.conversation = state;
      await load(convId);
      requestAnimationFrame(() => {
        if (options.conversation?.conv_id === convId && options.messagesEl)
          options.messagesEl.scrollTop = options.messagesEl.scrollHeight;
      });
    });
  }
  async function revertFileChange(changeId: string) {
    const convId = options.conversation?.conv_id;
    if (!convId) return;
    await options.client.revertRemoteFileChange(convId, changeId);
    if (options.conversation?.conv_id === convId) await load(convId);
  }
  return {
    get activeTree() {
      return activeTree;
    },
    get activeBranchId() {
      return activeBranchId;
    },
    get fileChanges() {
      return fileChanges;
    },
    reset,
    load,
    switchBranch,
    revertFileChange,
  };
}
