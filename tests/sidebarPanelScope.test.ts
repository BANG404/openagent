// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import {
  conversationBranchScopeKey,
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
