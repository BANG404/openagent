// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import {
  addWorkspaceToPersistedOrder,
  parsePinnedProjectPaths,
  projectConversationPageSize,
  projectsInPersistedOrder,
  togglePinnedProjectPath,
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
    expect(projectMarkup).toContain("alwaysShowMore");
    expect(projectMarkup).not.toContain("{#if project.path === workspacePath}");
    expect(projectMarkup).not.toContain('class="project-conversations"');
  });
});
