import type { OpenAgentClient, RemoteConversationMeta } from "$lib/openagent";
import type { AgentRole } from "$lib/types";
import { tr } from "$lib/i18n";

interface CatalogOptions {
  client: Pick<
    OpenAgentClient,
    | "listRemoteRoles"
    | "listRemoteConversations"
    | "listRemoteWorkspaceFiles"
    | "createRemoteConversation"
    | "updateRemoteConversation"
    | "deleteRemoteConversation"
  >;
  readonly running: boolean;
  activeConversationId: () => string | null;
  resetConversation: () => void;
  connectConversation: (convId: string) => Promise<void>;
  newConversation: () => Promise<void>;
  perform: (action: () => Promise<void>) => Promise<void>;
  onError: (cause: unknown) => void;
}

const defaultRoleKey = "openagent";

/** Workspace-scoped roles, conversation metadata and list actions. */
export function createRemoteCatalogController(options: CatalogOptions) {
  let workspaceId = $state("");
  let roles = $state<AgentRole[]>([]);
  let selectedRoleKey = $state(defaultRoleKey);
  let remoteConversationMetas = $state<RemoteConversationMeta[]>([]);
  let loadingWorkspace = $state(false);
  let loadingConversationId = $state<string | null>(null);
  let workspaceGeneration = 0;
  let listGeneration = 0;

  async function loadWorkspace(nextWorkspaceId: string) {
    workspaceId = nextWorkspaceId;
    loadingWorkspace = true;
    const generation = ++workspaceGeneration;
    listGeneration += 1;
    loadingConversationId = null;
    options.resetConversation();
    try {
      const [nextRoles, conversations] = await Promise.all([
        options.client.listRemoteRoles(nextWorkspaceId),
        options.client.listRemoteConversations(nextWorkspaceId),
      ]);
      if (generation !== workspaceGeneration) return;
      roles = nextRoles;
      remoteConversationMetas = conversations;
      selectedRoleKey = defaultRoleKey;
    } catch (cause) {
      if (generation === workspaceGeneration) options.onError(cause);
    } finally {
      if (generation === workspaceGeneration) loadingWorkspace = false;
    }
  }
  async function refreshConversations() {
    if (!workspaceId) return;
    const workspace = workspaceId;
    const generation = ++listGeneration;
    const conversations = await options.client.listRemoteConversations(workspace);
    if (generation === listGeneration && workspace === workspaceId)
      remoteConversationMetas = conversations;
  }
  async function loadMentionItems(query: string) {
    if (!workspaceId) return [];
    const workspace = workspaceId;
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const roleItems = roles
      .filter(
        (role) =>
          !normalizedQuery ||
          `${role.name}\n${role.description}`.toLocaleLowerCase().includes(normalizedQuery),
      )
      .map((role) => ({
        id: `role:${role.id}`,
        insertText: role.name,
        label: role.name,
        detail: Array.from(role.description).slice(0, 50).join(""),
        hint: tr("mentionRole"),
      }));
    const files = await options.client.listRemoteWorkspaceFiles(workspace, query);
    if (workspace !== workspaceId) return [];
    return [
      ...roleItems,
      ...files.map((path) => ({ id: path, label: path.split("/").pop() ?? path, detail: path })),
    ];
  }
  async function createConversation(): Promise<string> {
    if (!workspaceId) throw new Error(tr("remoteSelectWorkspaceFirst"));
    const created = await options.client.createRemoteConversation(
      workspaceId,
      selectedRoleKey === defaultRoleKey ? null : selectedRoleKey,
    );
    await refreshConversations();
    await options.connectConversation(created.conv_id);
    return created.conv_id;
  }
  async function selectConversation(id: string) {
    if (id === options.activeConversationId() || loadingConversationId) return;
    loadingConversationId = id;
    try {
      await options.perform(() => options.connectConversation(id));
    } finally {
      if (loadingConversationId === id) loadingConversationId = null;
    }
  }
  async function togglePin(id: string) {
    const item = remoteConversationMetas.find((candidate) => candidate.id === id);
    if (!item) return;
    await options.perform(async () => {
      await options.client.updateRemoteConversation(id, { pinned: !item.pinned });
      await refreshConversations();
    });
  }
  async function deleteConversation(id: string) {
    if (!window.confirm(tr("remoteDeleteConversationConfirm"))) return;
    await options.perform(async () => {
      await options.client.deleteRemoteConversation(id);
      if (options.activeConversationId() === id) options.resetConversation();
      await refreshConversations();
    });
  }
  async function changeRole(role: string) {
    selectedRoleKey = role;
    if (options.activeConversationId() && !options.running) await options.newConversation();
  }
  function updateTitle(convId: string, title: string | null) {
    if (!title?.trim()) return;
    const index = remoteConversationMetas.findIndex((item) => item.id === convId);
    if (index !== -1 && remoteConversationMetas[index].title !== title)
      remoteConversationMetas[index] = { ...remoteConversationMetas[index], title };
  }
  function dispose() {
    workspaceGeneration += 1;
    listGeneration += 1;
  }
  return {
    get workspaceId() {
      return workspaceId;
    },
    set workspaceId(value: string) {
      workspaceId = value;
    },
    get roles() {
      return roles;
    },
    get selectedRoleKey() {
      return selectedRoleKey;
    },
    get remoteConversationMetas() {
      return remoteConversationMetas;
    },
    get loadingWorkspace() {
      return loadingWorkspace;
    },
    get loadingConversationId() {
      return loadingConversationId;
    },
    loadWorkspace,
    refreshConversations,
    loadMentionItems,
    createConversation,
    selectConversation,
    togglePin,
    deleteConversation,
    changeRole,
    updateTitle,
    dispose,
  };
}
