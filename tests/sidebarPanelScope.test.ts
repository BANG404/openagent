// @ts-nocheck -- legacy fixture typing is tracked separately from the strict test surface.
import { describe, expect, test } from "bun:test";
import {
  conversationBranchScopeKey,
  effectiveRightSidebarCollapsed,
  RightSidebarScopeStore,
  terminalSessionInScope,
} from "../src/lib/sidebarPanelScope";

function session(conv_id: string | null, branch_id: string | null) {
  return { conv_id, branch_id };
}

describe("conversationBranchScopeKey", () => {
  test("distinguishes a missing branch from a branch named like the fallback", () => {
    expect(conversationBranchScopeKey("conv", null)).not.toBe(
      conversationBranchScopeKey("conv", "root"),
    );
  });

  test("cannot collide when an id contains the separator", () => {
    // A printable separator would map ("a:b", "c") and ("a", "b:c") to one key.
    expect(conversationBranchScopeKey("a:b", "c")).not.toBe(conversationBranchScopeKey("a", "b:c"));
  });

  test("keeps the new-conversation scope distinct from a real conversation", () => {
    expect(conversationBranchScopeKey(null, null)).not.toBe(
      conversationBranchScopeKey("new", "root"),
    );
  });
});

describe("terminalSessionInScope", () => {
  test("keeps a session owned by the active conversation branch", () => {
    expect(terminalSessionInScope(session("conv-1", "branch-1"), "conv-1", "branch-1")).toBe(true);
  });

  test("hides a sibling branch of the active conversation", () => {
    expect(terminalSessionInScope(session("conv-1", "branch-2"), "conv-1", "branch-1")).toBe(false);
  });

  test("hides another conversation", () => {
    expect(terminalSessionInScope(session("conv-2", "branch-1"), "conv-1", "branch-1")).toBe(false);
  });

  test("keeps an unattributed session so a running process stays reachable", () => {
    expect(terminalSessionInScope(session(null, null), "conv-1", "branch-1")).toBe(true);
  });

  test("keeps a session whose branch is unknown across that conversation's branches", () => {
    // A /graph background run knows its conversation but has no branch.
    expect(terminalSessionInScope(session("conv-1", null), "conv-1", "branch-1")).toBe(true);
    expect(terminalSessionInScope(session("conv-1", null), "conv-1", "branch-2")).toBe(true);
  });

  test("hides an unknown-branch session from a different conversation", () => {
    expect(terminalSessionInScope(session("conv-2", null), "conv-1", "branch-1")).toBe(false);
  });
});

describe("effectiveRightSidebarCollapsed", () => {
  test("collapses an expanded request once the last view is empty", () => {
    // The empty panel users reported: availability is false, so no request can
    // keep the sidebar on screen — and the title-bar entry that could close it
    // is hidden by the same flag.
    expect(effectiveRightSidebarCollapsed(false, false)).toBe(true);
  });

  test("keeps a collapsed request closed while views have content", () => {
    expect(effectiveRightSidebarCollapsed(true, true)).toBe(true);
  });

  test("renders an expanded request while a view has content", () => {
    expect(effectiveRightSidebarCollapsed(false, true)).toBe(false);
  });

  test("stays collapsed for a collapsed request with no content", () => {
    expect(effectiveRightSidebarCollapsed(true, false)).toBe(true);
  });

  test("cannot render a restored expanded request whose views have emptied", () => {
    // The reported empty panel: switching back to a branch keeps that branch's
    // expanded request, and the panel must still not appear while none of its
    // views has content — the title-bar entry that could close it is hidden by
    // the same availability flag.
    const store = new RightSidebarScopeStore();
    store.save("branch-b", { panel: "status", collapsed: false });
    const restored = store.switchScope(
      "branch-a",
      { panel: "files", collapsed: false },
      "branch-b",
      { panel: "status", collapsed: true },
    );
    expect(restored.collapsed).toBe(false);
    expect(effectiveRightSidebarCollapsed(restored.collapsed, false)).toBe(true);
  });
});

describe("RightSidebarScopeStore", () => {
  test("restores each scope's own tab and collapsed state", () => {
    const store = new RightSidebarScopeStore();
    const fallback = { panel: "status", collapsed: true };
    const first = store.switchScope("a", { panel: "files", collapsed: false }, "b", fallback);
    expect(first).toEqual(fallback);

    const second = store.switchScope("b", { panel: "terminal", collapsed: false }, "a", fallback);
    expect(second).toEqual({ panel: "files", collapsed: false });

    expect(store.switchScope("a", second, "b", fallback)).toEqual({
      panel: "terminal",
      collapsed: false,
    });
  });

  test("does not alias the stored state to a later mutation", () => {
    const store = new RightSidebarScopeStore();
    const fallback = { panel: "status", collapsed: true };
    const state = { panel: "terminal", collapsed: false };
    store.save("a", state);
    state.panel = "files";
    expect(store.activate("a", fallback)).toEqual({ panel: "terminal", collapsed: false });
  });
});
