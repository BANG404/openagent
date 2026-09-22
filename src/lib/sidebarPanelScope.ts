import type { BackgroundTerminalSession } from "./openagent";
import type { RightSidebarPanel } from "./rightSidebar";

/**
 * One canonical key for a conversation-plus-branch scope. NUL joins the parts
 * because conversation and branch ids are opaque: a printable separator would
 * let ("a:b", "c") and ("a", "b:c") collapse onto the same key. Write it
 * as an escape so the file stays text for diffs and grep.
 */
export function conversationBranchScopeKey(
  conversationId: string | null,
  branchId: string | null,
): string {
  return `${conversationId ?? ""}\u0000${branchId ?? ""}`;
}

/**
 * Whether a background terminal session belongs to the given scope.
 *
 * A missing owner is not a third scope: the runtime reports `null` when it
 * could not attribute a session (an unscoped caller, or the `/graph`
 * background run), and hiding such a session would make a running process
 * unreachable from every view. A session is therefore hidden only when it
 * positively belongs elsewhere — another conversation, or another branch of
 * this conversation — so an unknown branch stays visible in every branch of
 * its own conversation.
 */
export function terminalSessionInScope(
  session: Pick<BackgroundTerminalSession, "conv_id" | "branch_id">,
  conversationId: string | null,
  branchId: string | null,
): boolean {
  // A known conversation that is not the active one owns the session
  // elsewhere, where it stays reachable.
  if (session.conv_id !== null && session.conv_id !== conversationId) return false;
  if (session.conv_id === null || session.branch_id === null) return true;
  return session.branch_id === branchId;
}

/**
 * The collapse state the desktop renders.
 *
 * A scope's own request cannot keep the panel on screen once its last view
 * empties: an expanded panel with nothing to show is indistinguishable from a
 * sidebar that appeared by itself, and the title-bar entry that could close it
 * is hidden at the same moment. Projecting the request instead of overwriting
 * it makes that invariant structural — no effect ordering can leave the panel
 * open — and keeps an availability collapse from being recorded as the user's
 * choice for the scope they were in.
 */
export function effectiveRightSidebarCollapsed(
  requestedCollapsed: boolean,
  available: boolean,
): boolean {
  return requestedCollapsed || !available;
}

export interface RightSidebarScopeState {
  panel: RightSidebarPanel;
  collapsed: boolean;
}

/**
 * Remembers the right sidebar's selected tab and its own collapse request
 * per conversation branch, so switching scope restores that scope's own
 * view instead of carrying the previous one across. The request is what the
 * scope asked for; `effectiveRightSidebarCollapsed` is what gets rendered.
 *
 * A scope with no record falls back to the caller's default, which keeps the
 * persisted cross-session preference meaningful without seeding a record for
 * every scope the user merely visits.
 */
export class RightSidebarScopeStore {
  readonly #states = new Map<string, RightSidebarScopeState>();

  activate(key: string, fallback: RightSidebarScopeState): RightSidebarScopeState {
    return this.#states.get(key) ?? fallback;
  }

  save(key: string, state: RightSidebarScopeState): RightSidebarScopeState {
    const saved = { panel: state.panel, collapsed: state.collapsed };
    this.#states.set(key, saved);
    return saved;
  }

  switchScope(
    fromKey: string,
    state: RightSidebarScopeState,
    toKey: string,
    fallback: RightSidebarScopeState,
  ): RightSidebarScopeState {
    this.save(fromKey, state);
    return this.activate(toKey, fallback);
  }
}

/**
 * Keeps each tab's own selection separate from the sidebar's active tab.
 * Components are mounted conditionally, so this small store prevents a tab
 * switch from turning a user's last file, group, or draft back into defaults.
 */
export interface RightSidebarPanelState {
  fileSelectedId: string | null;
  groupSelectedId: string | null;
  groupDraft: string;
}

export class RightSidebarPanelStateStore {
  readonly #states = new Map<string, RightSidebarPanelState>();

  activate(key: string, fallback: RightSidebarPanelState): RightSidebarPanelState {
    return this.#states.get(key) ?? { ...fallback };
  }

  save(key: string, state: RightSidebarPanelState): RightSidebarPanelState {
    const saved = { ...state };
    this.#states.set(key, saved);
    return saved;
  }

  switchScope(
    fromKey: string | null,
    state: RightSidebarPanelState,
    toKey: string,
    fallback: RightSidebarPanelState,
  ): RightSidebarPanelState {
    if (fromKey !== null) this.save(fromKey, state);
    return this.activate(toKey, fallback);
  }
}
