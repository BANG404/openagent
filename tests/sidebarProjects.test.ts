// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import {
  addWorkspaceToPersistedOrder,
  mergeRecentConversationRefresh,
  parsePinnedProjectPaths,
  projectRowSelection,
  promoteRecentConversation,
  projectConversationPageSize,
  projectsInPersistedOrder,
  refreshProjectConversationSnapshot,
  removeProjectConversationSnapshot,
  togglePinnedProjectPath,
  updateProjectConversationSnapshots,
} from "../src/lib/sidebarProjects";

describe("sidebar project pins", () => {
  test("loads only unique non-empty paths", () => {
    expect(parsePinnedProjectPaths('["C:/one","","C:/one","C:/two",3]')).toEqual([
      "C:/one",
      "C:/two",
    ]);
    expect(parsePinnedProjectPaths("not json")).toEqual([]);
  });

  test("adds a new pin first and removes an existing pin", () => {
    expect(togglePinnedProjectPath(["C:/one"], "C:/two")).toEqual(["C:/two", "C:/one"]);
    expect(togglePinnedProjectPath(["C:/one", "C:/two"], "C:/one")).toEqual(["C:/two"]);
  });
});

describe("sidebar project order", () => {
  const persisted = [
    { path: "C:/one", name: "one" },
    { path: "C:/two", name: "two" },
    { path: "C:/three", name: "three" },
  ];

  test("keeps the persisted order when the selected workspace changes", () => {
    expect(projectsInPersistedOrder(persisted, "C:/two")).toEqual(persisted);
    expect(projectsInPersistedOrder(persisted, "C:/three")).toEqual(persisted);
  });

  test("only adds a workspace when it is first persisted", () => {
    expect(addWorkspaceToPersistedOrder(persisted, "C:/two")).toBe(persisted);
    expect(addWorkspaceToPersistedOrder(persisted, "C:/four")).toEqual([
      { path: "C:/four", name: "four" },
      ...persisted,
    ]);
  });

  test("places an unpersisted current workspace where its first save will keep it", () => {
    expect(projectsInPersistedOrder(persisted, "C:/four")).toEqual([
      { path: "C:/four", name: "four" },
      ...persisted,
    ]);
  });

  test("keeps every persisted workspace visible without a fixed project cap", () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
      path: `C:/${index}`,
      name: String(index),
    }));

    expect(projectsInPersistedOrder(many, "C:/0")).toEqual(many);
  });

  test("starts every project list with five conversations", () => {
    expect(projectConversationPageSize).toBe(5);
  });

  test("promotes active conversation changes into the cross-workspace recents snapshot", () => {
    const older = {
      id: "older",
      title: "older",
      workspace: "C:/other",
      messages: [],
      createdAt: 1,
      updatedAt: 10,
    };
    const active = {
      id: "active",
      title: "updated title",
      messages: [],
      createdAt: 2,
      updatedAt: 20,
    };

    expect(promoteRecentConversation([older], active, "C:/active")).toEqual([
      { ...active, workspace: "C:/active" },
      older,
    ]);
  });

  test("does not let a slower refresh overwrite a newer optimistic recent entry", () => {
    const optimistic = {
      id: "active",
      title: "new title",
      workspace: "C:/active",
      messages: [],
      createdAt: 1,
      updatedAt: 20,
    };
    const stale = { ...optimistic, title: "old title", updatedAt: 10 };
    const other = { ...optimistic, id: "other", title: "other", updatedAt: 15 };

    expect(mergeRecentConversationRefresh([optimistic], [other, stale])).toEqual([
      optimistic,
      other,
    ]);
  });

  test("keeps one conversation-list component mounted for every project", async () => {
    const source = await readFile(
      new URL("../src/lib/components/SidebarWorkspaceBrowser.svelte", import.meta.url),
      "utf8",
    );
    const eachStart = source.indexOf("{#each projectEntries as project (project.path)}");
    const projectMarkup = source.slice(eachStart, source.indexOf("</section>", eachStart));

    expect(projectMarkup).toContain("<ConversationList");
    expect(projectMarkup).not.toContain("alwaysShowMore");
    expect(projectMarkup).toContain("conversations={conversationsForProject(project.path)}");
    expect(projectMarkup).toContain("workspaceSwitchTarget ?? workspacePath");
    expect(projectMarkup).not.toContain("{#if project.path === workspacePath}");
    expect(projectMarkup).not.toContain("? conversations");
    expect(projectMarkup).toContain('class="project-conversations"');
    expect(projectMarkup).toContain("hidden={!projectExpanded(project.path)}");
    expect(projectMarkup).toContain("loading={projectSnapshotLoading(project.path)}");
    expect(source).toContain("padding: 4px 62px 4px var(--list-item-compact-padding-inline)");
    expect(source).toMatch(
      /\.project-row-shell:hover,\s*\.project-row-shell:focus-within,\s*\.project-row-shell\.active\s*{[^}]*background: var\(--interactive-state-bg\);/s,
    );
    expect(source).not.toContain(".project-row:hover,");
    expect(source).not.toContain(".project-row-shell.active .project-row {");
  });

  test("loads visible inactive projects independently from the global recent projection", async () => {
    const browser = await readFile(
      new URL("../src/lib/components/SidebarWorkspaceBrowser.svelte", import.meta.url),
      "utf8",
    );
    const route = await readFile(new URL("../src/routes/+page.svelte", import.meta.url), "utf8");

    expect(browser).toContain("void loadProjectSnapshot(project.path, roleKey)");
    expect(browser).toContain("await onLoadProjectConversations(path, roleKey)");
    expect(route).toContain("fetchConversationPage(path, null, 30, null, true, roleId)");
  });

  test("renders a compact project-owned empty state after loading completes", async () => {
    const list = await readFile(
      new URL("../src/lib/components/ConversationList.svelte", import.meta.url),
      "utf8",
    );
    const browser = await readFile(
      new URL("../src/lib/components/SidebarWorkspaceBrowser.svelte", import.meta.url),
      "utf8",
    );

    expect(list).toContain('class="project-empty-conversations"');
    expect(list).toContain('$t("projectNoChats")');
    expect(list).toContain('LoadingSkeleton variant="sidebar" rows={2}');
    expect(browser).not.toContain("class:empty");
    expect(browser).not.toContain(".project-group.empty");
  });

  test("renders child conversations as iconless, increasingly indented rows", async () => {
    const list = await readFile(
      new URL("../src/lib/components/ConversationList.svelte", import.meta.url),
      "utf8",
    );

    expect(list).not.toContain("delegatedRoleBadge");
    expect(list).not.toContain('class="role-badge"');
    expect(list).toContain('style:padding-left="calc(var(--conversation-title-inset) + 12px)"');
    expect(list).toContain(
      "style:padding-left={`calc(var(--conversation-title-inset) + ${depth * 12}px)`}",
    );
    expect(list).toContain(".conv-list.embedded {");
    expect(list).toContain("--conversation-title-inset: calc(");
  });

  test("collapses an expanded inactive project without selecting its workspace", () => {
    expect(projectRowSelection("C:/two", "C:/one", [])).toEqual({
      collapsedProjectPaths: ["C:/two"],
      selectWorkspace: false,
    });
  });

  test("expands a collapsed inactive project and selects its workspace", () => {
    expect(projectRowSelection("C:/two", "C:/one", ["C:/two"])).toEqual({
      collapsedProjectPaths: [],
      selectWorkspace: true,
    });
  });

  test("toggles the selected project's mounted conversations without reselecting it", () => {
    expect(projectRowSelection("C:/one", "C:/one", [])).toEqual({
      collapsedProjectPaths: ["C:/one"],
      selectWorkspace: false,
    });
    expect(projectRowSelection("C:/one", "C:/one", ["C:/one"])).toEqual({
      collapsedProjectPaths: [],
      selectWorkspace: false,
    });
  });

  test("keeps project rows wired to their mounted expansion state", async () => {
    const source = await readFile(
      new URL("../src/lib/components/SidebarWorkspaceBrowser.svelte", import.meta.url),
      "utf8",
    );

    expect(source).toContain(
      "projectRowSelection(path, selectedWorkspacePath, collapsedProjectPaths)",
    );
    expect(source).toContain("if (selection.selectWorkspace) onSelectWorkspace(path)");
    expect(source).toContain("aria-expanded={projectExpanded(project.path)}");
    expect(source).not.toContain("ordered.slice(0, 6)");
  });

  test("does not open a conversation after its workspace switch fails", async () => {
    const route = await readFile(new URL("../src/routes/+page.svelte", import.meta.url), "utf8");
    const openStart = route.indexOf("async function openSidebarConversation");
    const openHandler = route.slice(
      openStart,
      route.indexOf("async function persistRecentWorkspaces", openStart),
    );

    expect(openHandler).toContain("const result = await routeWorkspace(conversationWorkspace, {");
    expect(openHandler).toContain("conversationId: conversation.id");
    expect(openHandler).toContain('if (result !== "current") return');
    expect(route).toContain('title: $t("workspaceUnavailable")');
  });

  test("only offers more project conversations when another row or page exists", async () => {
    const source = await readFile(
      new URL("../src/lib/components/ConversationList.svelte", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("alwaysShowMore");
    expect(source).toContain("{#if (compactProject && hasHiddenRoots) || (embedded && hasMore)}");
  });

  test("keeps recents independent from the selected workspace page", async () => {
    const source = await readFile(
      new URL("../src/lib/components/SidebarWorkspaceBrowser.svelte", import.meta.url),
      "utf8",
    );
    const recentsStart = source.indexOf("let allRecentConversations");
    const recentsProjection = source.slice(recentsStart, source.indexOf("let projectEntries"));

    expect(recentsProjection).toContain("[...recentConversations]");
    expect(recentsProjection).not.toContain("conversations.map");
    expect(recentsProjection).not.toContain("for (const item of conversations)");
  });

  test("retains a loaded role's recent snapshot during background refresh", async () => {
    const route = await readFile(new URL("../src/routes/+page.svelte", import.meta.url), "utf8");

    expect(route).toContain("recentConversationRoleKey !== roleKey");
    expect(route).toContain("if (replacingRoleSnapshot) recentConversations = []");
    expect(route).toContain("recentConversationRoleKey = roleKey");
  });

  test("promotes Flash-generated title updates into recent conversations", async () => {
    const route = await readFile(new URL("../src/routes/+page.svelte", import.meta.url), "utf8");
    const handlerStart = route.indexOf(
      'register<{ conv_id: string; title: string }>("conversation-title-updated"',
    );
    const handler = route.slice(handlerStart, route.indexOf("register<{", handlerStart + 1));

    expect(handler).toContain("applyConversationTitleUpdate(conv_id, title)");
    expect(route).toContain("promoteConversationInRecents(updated)");
    expect(route).toContain("await fetchConversationMeta(convId).catch(() => null)");
  });

  test("retains inactive workspace snapshots when the selected workspace changes", () => {
    const one = {
      id: "one",
      title: "one",
      messages: [],
      createdAt: 1,
      updatedAt: 1,
    };
    const two = {
      id: "two",
      title: "two",
      messages: [],
      createdAt: 2,
      updatedAt: 2,
    };
    const initial = updateProjectConversationSnapshots(
      {},
      "C:/one",
      [one],
      [{ ...two, workspace: "C:/two" }],
    );
    const switched = updateProjectConversationSnapshots(initial, "C:/two", [two], []);

    expect(switched["C:/one"].map((conversation) => conversation.id)).toEqual(["one"]);
    expect(switched["C:/two"].map((conversation) => conversation.id)).toEqual(["two"]);
    expect(switched["C:/one"][0].workspace).toBe("C:/one");
    expect(switched["C:/two"][0].workspace).toBe("C:/two");
  });

  test("updates the active workspace snapshot authoritatively", () => {
    const stale = {
      id: "stale",
      title: "stale",
      workspace: "C:/one",
      messages: [],
      createdAt: 1,
      updatedAt: 1,
    };
    const current = {
      id: "current",
      title: "current",
      messages: [],
      createdAt: 2,
      updatedAt: 2,
    };

    const snapshots = updateProjectConversationSnapshots(
      { "C:/one": [stale] },
      "C:/one",
      [current],
      [stale],
    );

    expect(snapshots["C:/one"].map((conversation) => conversation.id)).toEqual(["current"]);
  });

  test("refreshes an inactive project authoritatively without losing newer optimistic data", () => {
    const stale = {
      id: "stale",
      title: "stale",
      workspace: "C:/one",
      messages: [],
      createdAt: 1,
      updatedAt: 1,
    };
    const durable = {
      id: "durable",
      title: "durable",
      messages: [],
      createdAt: 2,
      updatedAt: 2,
    };
    const optimistic = {
      id: "optimistic",
      title: "optimistic",
      workspace: "C:/one",
      messages: [],
      createdAt: 3,
      updatedAt: 3,
    };

    const refreshed = refreshProjectConversationSnapshot(
      [stale, optimistic],
      [durable],
      "C:/one",
      2.5,
    );

    expect(refreshed.map((conversation) => conversation.id)).toEqual(["optimistic", "durable"]);
    expect(refreshed.every((conversation) => conversation.workspace === "C:/one")).toBe(true);
  });

  test("accepts an authoritative empty inactive-project page", () => {
    const stale = {
      id: "stale",
      title: "stale",
      workspace: "C:/one",
      messages: [],
      createdAt: 1,
      updatedAt: 1,
    };

    expect(refreshProjectConversationSnapshot([stale], [], "C:/one", 2)).toEqual([]);
  });

  test("removes a conversation only from its owning workspace snapshot", () => {
    const one = {
      id: "one",
      title: "one",
      workspace: "C:/one",
      messages: [],
      createdAt: 1,
      updatedAt: 1,
    };
    const two = { ...one, id: "two", title: "two", workspace: "C:/two" };

    const snapshots = removeProjectConversationSnapshot(
      { "C:/one": [one], "C:/two": [two] },
      "C:/two",
      "two",
    );

    expect(snapshots["C:/one"]).toEqual([one]);
    expect(snapshots["C:/two"]).toEqual([]);
  });

  test("routes project deletion with its durable workspace owner", async () => {
    const browser = await readFile(
      new URL("../src/lib/components/SidebarWorkspaceBrowser.svelte", import.meta.url),
      "utf8",
    );
    const list = await readFile(
      new URL("../src/lib/components/ConversationList.svelte", import.meta.url),
      "utf8",
    );
    const route = await readFile(new URL("../src/routes/+page.svelte", import.meta.url), "utf8");
    const appCss = await readFile(new URL("../src/app.css", import.meta.url), "utf8");

    expect(browser).toContain("removeProjectConversationSnapshot(snapshots, ownerWorkspace, id)");
    expect(browser).toContain("onDelete(id, ownerWorkspace)");
    expect(list).toContain("onDelete(conv.id, conv.workspace)");
    expect(route).toContain("recentConversations = recentConversations.filter");
    expect(route).toContain("searchConversations = searchConversations.filter");
    expect(appCss).toContain('[role="menuitemcheckbox"]');
    expect(appCss).toContain("user-select: none");
  });
});
