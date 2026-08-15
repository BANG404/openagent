// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const routeUrl = new URL("../src/routes/+page.svelte", import.meta.url);
const componentsUrl = new URL("../src/lib/components/", import.meta.url);

describe("desktop navigation chrome", () => {
  test("keeps one shared title bar above every ordinary desktop surface", async () => {
    const route = await readFile(routeUrl, "utf8");

    expect(route.match(/<DesktopTitleBar\b/g)).toHaveLength(1);
    expect(route.indexOf("<DesktopTitleBar")).toBeLessThan(route.indexOf("{#if memoryOpen"));

    for (const component of [
      "MemoryView.svelte",
      "RolesView.svelte",
      "SkillsView.svelte",
      "SettingsView.svelte",
    ]) {
      const source = await readFile(new URL(component, componentsUrl), "utf8");
      expect(source).not.toContain("WindowControls");
      expect(source).not.toContain("data-tauri-drag-region");
    }
  });

  test("keeps primary actions below the role and Settings at the sidebar bottom", async () => {
    const sidebar = await readFile(new URL("DesktopSidebar.svelte", componentsUrl), "utf8");
    const resizeHandle = await readFile(
      new URL("SidebarResizeHandle.svelte", componentsUrl),
      "utf8",
    );

    expect(sidebar.indexOf("<RoleSelector")).toBeLessThan(
      sidebar.indexOf("<SidebarPrimaryActions"),
    );
    expect(sidebar.indexOf("<SidebarPrimaryActions")).toBeLessThan(
      sidebar.indexOf("<SidebarWorkspaceBrowser"),
    );
    expect(sidebar.indexOf("<SidebarWorkspaceBrowser")).toBeLessThan(
      sidebar.indexOf("<SidebarSettingsAction"),
    );
    expect(sidebar).toContain("onNew={() => void onNew()}");
    expect(resizeHandle).toMatch(/\.sidebar-resize-shell\s*{[^}]*top: 40px;/s);
  });

  test("uses one opaque chrome color and keeps the composer workspace trigger surface-free", async () => {
    const sidebar = await readFile(new URL("DesktopSidebar.svelte", componentsUrl), "utf8");
    const titleBar = await readFile(new URL("DesktopTitleBar.svelte", componentsUrl), "utf8");
    const workspaceSwitcher = await readFile(
      new URL("WorkspaceSwitcher.svelte", componentsUrl),
      "utf8",
    );
    expect(sidebar).toContain("background: var(--app-chrome-bg)");
    expect(titleBar).toContain("background: var(--app-chrome-bg)");
    expect(titleBar).not.toContain("backdrop-filter");
    expect(workspaceSwitcher).toMatch(
      /\.composer-workspace-btn\)\s*{[^}]*padding: 5px 8px;[^}]*color: var\(--text-muted\);/s,
    );
    expect(workspaceSwitcher).toMatch(
      /\.workspace-btn\[data-state="open"\]\)\s*{[^}]*background: var\(--border\);/s,
    );
  });

  test("searches every workspace and reserves new processes for File new window", async () => {
    const route = await readFile(routeUrl, "utf8");
    const openConversation = route.slice(
      route.indexOf("async function openSidebarConversation"),
      route.indexOf("async function addToRecentWorkspaces"),
    );

    expect(route).toContain("fetchConversationPage(null, null, 30, normalized, false, null)");
    expect(route).toContain("null,\n          searchConversationNextCursor");
    expect(openConversation).toContain(
      "await applyWorkspace(conversationWorkspace, conversation.id)",
    );
    expect(openConversation).not.toContain("openWorkspaceInNewWindow");
    expect(route.match(/await openWorkspaceInNewWindow\(/g)).toHaveLength(1);
    expect(route).toContain("onNewWindow={pickWorkspaceInNewWindow}");
  });

  test("keeps role-scoped recents paged and restores sections after search focus leaves", async () => {
    const route = await readFile(routeUrl, "utf8");
    const sidebar = await readFile(new URL("DesktopSidebar.svelte", componentsUrl), "utf8");
    const primaryActions = await readFile(
      new URL("SidebarPrimaryActions.svelte", componentsUrl),
      "utf8",
    );
    const workspaceBrowser = await readFile(
      new URL("SidebarWorkspaceBrowser.svelte", componentsUrl),
      "utf8",
    );

    expect(route).toContain("fetchConversationPage(null, null, 30, null, true, recentRoleId)");
    expect(route).toContain("recentConversationNextCursor");
    expect(route).toContain("onLoadMoreRecent={loadNextRecentConversationPage}");
    expect(sidebar).toContain("onChange={changeRole}");
    expect(primaryActions).toContain("onfocusout={handleSearchFocusout}");
    expect(workspaceBrowser).toContain("projectsCollapsed");
    expect(workspaceBrowser).toContain("recentsCollapsed");
    expect(workspaceBrowser).toContain("projectSearchRank");
    expect(workspaceBrowser).toContain('root: recentListElement, rootMargin: "80px 0px"');
  });

  test("prepares workspace switches without replacing the mounted application shell", async () => {
    const route = await readFile(routeUrl, "utf8");
    const loadingState = route.slice(
      route.indexOf("let mainContentLoading"),
      route.indexOf("let newConversationLayout"),
    );
    const applyWorkspace = route.slice(
      route.indexOf("async function applyWorkspace"),
      route.indexOf("async function openWorkspaceInNewWindow"),
    );

    expect(loadingState).not.toContain("workspaceLoading");
    expect(route).toContain("loading={initialLoading}");
    expect(route).toContain("inert={workspaceLoading}");
    expect(applyWorkspace.indexOf("const prepared =")).toBeLessThan(
      applyWorkspace.indexOf("workspacePath = path"),
    );
    expect(applyWorkspace).not.toContain("conversations = []");
  });

  test("exposes keyboard edit commands and the shared update check", async () => {
    const menu = await readFile(new URL("ApplicationMenuBar.svelte", componentsUrl), "utf8");

    for (const command of ["undo", "redo", "cut", "copy", "paste", "delete", "selectAll"]) {
      expect(menu).toContain(`runEditCommand("${command}")`);
    }
    expect(menu).toContain("checkForAppUpdate(true)");
    expect(menu).toContain("event.altKey && !event.ctrlKey && !event.metaKey");
  });

  test("controls the checkpoint flow panel from the trailing title bar", async () => {
    const route = await readFile(routeUrl, "utf8");
    const titleBar = await readFile(new URL("DesktopTitleBar.svelte", componentsUrl), "utf8");
    const panel = await readFile(new URL("CheckpointFlowStatus.svelte", componentsUrl), "utf8");

    expect(route).toContain("bind:checkpointFlowPanelCollapsed");
    expect(titleBar).toContain("<CheckpointFlowToggleButton");
    expect(titleBar.indexOf("<CheckpointFlowToggleButton")).toBeLessThan(
      titleBar.lastIndexOf("<WindowControls {platform}"),
    );
    expect(panel).not.toContain("peek-button");
    expect(panel).not.toContain("collapse-button");
    expect(panel).not.toContain("flow-panel-placeholder");
  });
});
