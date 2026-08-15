// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import {
  addWorkspaceToPersistedOrder,
  parsePinnedProjectPaths,
  projectConversationPageSize,
  projectsInPersistedOrder,
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

  test("starts every project list with five conversations", () => {
    expect(projectConversationPageSize).toBe(5);
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
    expect(projectMarkup).not.toContain('class="project-conversations"');
    expect(source).toContain("padding: 4px 62px 4px var(--list-item-compact-padding-inline)");
    expect(source).not.toContain(".project-row-shell:hover .project-row,");
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
});
