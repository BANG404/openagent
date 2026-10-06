import { onMount } from "svelte";
import type { Conversation, ConversationPageCursor } from "$lib/types";
import { fetchConversationPage, fetchConversationMeta } from "$lib/conversationDb";
import { mergeRecentConversationRefresh } from "$lib/sidebarProjects";
import { mergeConversationMetadata } from "./conversationMetadata";
import { DEFAULT_ROLE_KEY as defaultRoleKey } from "./roles.svelte";

type ConversationListOptions = {
  available: boolean;
  workspacePath: string;
  selectedRoleKey: string;
  selectedRoleId: string | null;
  conversations: Conversation[];
};

/** Owns list paging and search; the page keeps the live conversation projection. */
export function createConversationLists(options: ConversationListOptions) {
  let recentConversations = $state<Conversation[]>([]);
  let loadingRecentConversations = $state(false);
  let recentConversationGeneration = 0;
  let recentConversationRoleKey: string | null = null;
  let conversationNextCursor = $state<ConversationPageCursor | null>(null);
  let loadingMoreConversations = $state(false);
  let searchConversations = $state<Conversation[]>([]);
  let searchConversationNextCursor = $state<ConversationPageCursor | null>(null);
  let loadingMoreSearchConversations = $state(false);
  let conversationSearchGeneration = 0;
  let conversationSearchTimer: ReturnType<typeof setTimeout> | null = null;
  let conversationSearchQuery = $state("");

  async function reloadRoleConversations(preserveConversationId?: string | null): Promise<void> {
    if (!options.available) return;
    const preserved = preserveConversationId
      ? (options.conversations.find((conversation) => conversation.id === preserveConversationId) ??
        (await fetchConversationMeta(preserveConversationId).catch(() => null)))
      : null;
    const page = await fetchConversationPage(
      options.workspacePath || null,
      null,
      30,
      null,
      true,
      options.selectedRoleId,
    );
    const current =
      preserved && !options.conversations.some((item) => item.id === preserved.id)
        ? [...options.conversations, preserved]
        : options.conversations;
    options.conversations = mergeConversationMetadata(current, page.conversations);
    conversationNextCursor = page.nextCursor;
  }

  async function ensureConversationLineage(meta: Conversation): Promise<void> {
    const lineage: Conversation[] = [];
    const visited = new Set<string>();
    let current: Conversation | null = meta;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      lineage.push(current);
      const parentId: string | undefined = current.parentConvId;
      if (!parentId) break;
      current =
        options.conversations.find((conversation) => conversation.id === parentId) ??
        (await fetchConversationMeta(parentId).catch(() => null));
    }
    options.conversations = mergeConversationMetadata(options.conversations, lineage);
  }

  async function loadNextConversationPage(): Promise<void> {
    if (!options.available) return;
    const query = conversationSearchQuery.trim();
    if (query) {
      if (loadingMoreSearchConversations || !searchConversationNextCursor) return;
      const generation = conversationSearchGeneration;
      loadingMoreSearchConversations = true;
      try {
        const page = await fetchConversationPage(
          null,
          searchConversationNextCursor,
          30,
          query,
          false,
          null,
        );
        if (generation !== conversationSearchGeneration) return;
        searchConversations = mergeConversationMetadata(searchConversations, page.conversations);
        searchConversationNextCursor = page.nextCursor;
      } catch {
        // Keep the cursor so the observer can retry when it intersects again.
      } finally {
        if (generation === conversationSearchGeneration) {
          loadingMoreSearchConversations = false;
        }
      }
      return;
    }

    if (loadingMoreConversations || !conversationNextCursor) return;
    loadingMoreConversations = true;
    const requestedWorkspace = options.workspacePath;
    try {
      const page = await fetchConversationPage(
        requestedWorkspace || null,
        conversationNextCursor,
        30,
        null,
        true,
        options.selectedRoleId,
      );
      if (requestedWorkspace !== options.workspacePath) return;
      options.conversations = mergeConversationMetadata(options.conversations, page.conversations);
      conversationNextCursor = page.nextCursor;
    } catch {
      // Keep the cursor so the observer can retry when it intersects again.
    } finally {
      if (requestedWorkspace === options.workspacePath) loadingMoreConversations = false;
    }
  }

  async function refreshRecentConversations(): Promise<void> {
    if (!options.available) return;
    const generation = ++recentConversationGeneration;
    const roleKey = options.selectedRoleKey;
    const recentRoleId = roleKey === defaultRoleKey ? null : roleKey;
    const replacingRoleSnapshot = recentConversationRoleKey !== roleKey;
    if (replacingRoleSnapshot) recentConversations = [];
    loadingRecentConversations = replacingRoleSnapshot || recentConversations.length === 0;
    try {
      const page = await fetchConversationPage(null, null, 20, null, true, recentRoleId);
      if (generation !== recentConversationGeneration || roleKey !== options.selectedRoleKey)
        return;
      recentConversations = mergeRecentConversationRefresh(recentConversations, page.conversations);
      recentConversationRoleKey = roleKey;
    } catch (error) {
      console.warn("Failed to load recent conversations across workspaces:", error);
    } finally {
      if (generation === recentConversationGeneration && roleKey === options.selectedRoleKey) {
        loadingRecentConversations = false;
      }
    }
  }

  async function loadProjectConversations(path: string, roleKey: string): Promise<Conversation[]> {
    if (!options.available) return [];
    const roleId = roleKey === defaultRoleKey ? null : roleKey;
    const page = await fetchConversationPage(path, null, 30, null, true, roleId);
    return page.conversations;
  }

  function handleConversationSearch(query: string): void {
    conversationSearchQuery = query;
    conversationSearchGeneration += 1;
    if (conversationSearchTimer) clearTimeout(conversationSearchTimer);
    searchConversations = [];
    searchConversationNextCursor = null;
    loadingMoreSearchConversations = false;
    const normalized = query.trim();
    if (!normalized || !options.available) return;
    const generation = conversationSearchGeneration;
    conversationSearchTimer = setTimeout(async () => {
      loadingMoreSearchConversations = true;
      try {
        const page = await fetchConversationPage(null, null, 30, normalized, false, null);
        if (generation !== conversationSearchGeneration) return;
        searchConversations = page.conversations;
        searchConversationNextCursor = page.nextCursor;
      } catch {
        // Leave an empty result state; a new query or scroll can retry.
      } finally {
        if (generation === conversationSearchGeneration) {
          loadingMoreSearchConversations = false;
        }
      }
    }, 200);
  }

  function resetSearchResults() {
    searchConversations = [];
    searchConversationNextCursor = null;
    conversationSearchGeneration += 1;
  }

  onMount(() => () => {
    conversationSearchGeneration += 1;
    recentConversationGeneration += 1;
    if (conversationSearchTimer) clearTimeout(conversationSearchTimer);
  });

  return {
    get recentConversations() {
      return recentConversations;
    },
    set recentConversations(value: Conversation[]) {
      recentConversations = value;
    },
    get loadingRecentConversations() {
      return loadingRecentConversations;
    },
    set loadingRecentConversations(value: boolean) {
      loadingRecentConversations = value;
    },
    get conversationNextCursor() {
      return conversationNextCursor;
    },
    set conversationNextCursor(value: ConversationPageCursor | null) {
      conversationNextCursor = value;
    },
    get loadingMoreConversations() {
      return loadingMoreConversations;
    },
    set loadingMoreConversations(value: boolean) {
      loadingMoreConversations = value;
    },
    get searchConversations() {
      return searchConversations;
    },
    set searchConversations(value: Conversation[]) {
      searchConversations = value;
    },
    get searchConversationNextCursor() {
      return searchConversationNextCursor;
    },
    set searchConversationNextCursor(value: ConversationPageCursor | null) {
      searchConversationNextCursor = value;
    },
    get loadingMoreSearchConversations() {
      return loadingMoreSearchConversations;
    },
    set loadingMoreSearchConversations(value: boolean) {
      loadingMoreSearchConversations = value;
    },
    get conversationSearchQuery() {
      return conversationSearchQuery;
    },
    set conversationSearchQuery(value: string) {
      conversationSearchQuery = value;
    },
    reloadRoleConversations,
    ensureConversationLineage,
    loadNextConversationPage,
    refreshRecentConversations,
    loadProjectConversations,
    handleConversationSearch,
    resetSearchResults,
  };
}
