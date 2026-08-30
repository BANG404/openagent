// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const routeUrl = new URL("../src/routes/+page.svelte", import.meta.url);
const componentsUrl = new URL("../src/lib/components/", import.meta.url);
const appCssUrl = new URL("../src/app.css", import.meta.url);

describe("desktop navigation chrome", () => {
  test("keeps one shared title bar above every ordinary desktop surface", async () => {
    const route = await readFile(routeUrl, "utf8");

    expect(route.match(/<DesktopTitleBar\b/g)).toHaveLength(1);
    expect(route.indexOf("<DesktopTitleBar")).toBeLessThan(route.indexOf("{#if settingsOpen"));

    for (const component of ["SettingsView.svelte"]) {
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

  test("uses continuous chrome, an empty title-bar center, and a surface-free workspace trigger", async () => {
    const sidebar = await readFile(new URL("DesktopSidebar.svelte", componentsUrl), "utf8");
    const titleBar = await readFile(new URL("DesktopTitleBar.svelte", componentsUrl), "utf8");
    const conversationSurface = await readFile(
      new URL("ConversationSurface.svelte", componentsUrl),
      "utf8",
    );
    const settingsAction = await readFile(
      new URL("SidebarSettingsAction.svelte", componentsUrl),
      "utf8",
    );
    const workspaceSwitcher = await readFile(
      new URL("WorkspaceSwitcher.svelte", componentsUrl),
      "utf8",
    );
    expect(sidebar).toContain("background: var(--app-chrome-bg)");
    expect(titleBar).toContain("background: var(--app-chrome-bg)");
    expect(sidebar).not.toContain("border-right:");
    expect(titleBar).not.toContain("border-bottom:");
    expect(titleBar).toMatch(/\.title-bar-menu\s*{[^}]*margin-left: 100px;/s);
    expect(titleBar).toMatch(/\.title-bar\.macos \.title-bar-menu\s*{[^}]*margin-left: 176px;/s);
    expect(settingsAction).not.toContain("border-top:");
    const conversationWorkspace = conversationSurface.match(
      /\.conversation-workspace\s*{([^}]*)}/s,
    )?.[1];
    expect(conversationWorkspace).toContain("margin: 40px 8px 8px");
    expect(conversationWorkspace).toContain("border-radius: 12px");
    expect(conversationWorkspace).toContain("background: var(--surface)");
    expect(conversationWorkspace).not.toContain("box-shadow");
    expect(titleBar).not.toContain("workspace-environment");
    expect(titleBar).not.toContain("workspace-name");
    expect(titleBar).not.toContain("branch-name");
    expect(titleBar).not.toContain("workspace.git_branch");
    expect(titleBar).not.toContain("backdrop-filter");
    expect(workspaceSwitcher).toMatch(
      /\.composer-workspace-btn\)\s*{[^}]*padding: 5px 8px;[^}]*color: var\(--text-muted\);/s,
    );
    expect(workspaceSwitcher).toContain("interactive-control workspace-btn");
  });

  test("keeps native window canvases at roughly seventy percent transparency", async () => {
    const appCss = await readFile(appCssUrl, "utf8");
    const route = await readFile(routeUrl, "utf8");
    const nativeMaterialTokens = appCss.match(/html\.native-window-material\s*{([^}]*)}/s)?.[1];

    expect(nativeMaterialTokens).toContain("--bg: rgba(245, 245, 247, 0.3)");
    expect(nativeMaterialTokens).toContain("--app-chrome-bg: rgba(245, 245, 247, 0.3)");
    expect(nativeMaterialTokens).toContain("--sidebar-bg: rgba(245, 245, 247, 0.3)");
    expect(appCss).toMatch(
      /html\.native-window-material \.conversation-workspace\s*{[^}]*background: var\(--bg\);/s,
    );
    expect(route).toMatch(/\.app\s*{[^}]*background: transparent;/s);

    const settings = await readFile(new URL("SettingsView.svelte", componentsUrl), "utf8");
    const onboarding = await readFile(new URL("OnboardingFlow.svelte", componentsUrl), "utf8");

    expect(settings).toContain("background: var(--bg)");
    expect(onboarding).toContain('class="application-settings-surface step-content"');
    expect(onboarding).toMatch(/\.step-content\s*{[^}]*background: var\(--mica-surface\);/s);

    for (const [component, transparentRegions] of [
      [
        "SettingsView.svelte",
        [
          "settings-nav-col",
          "settings-list-col",
          "detail-top-bar",
          "channel-settings-layout",
          "channel-settings-list",
          "channel-settings-detail",
        ],
      ],
    ] as const) {
      const source = await readFile(new URL(component, componentsUrl), "utf8");
      for (const region of transparentRegions) {
        expect(source).toMatch(
          new RegExp(
            `\\.${region.replaceAll("-", "\\-")}\\)?\\s*\\{[^}]*background: transparent;`,
            "s",
          ),
        );
      }
    }
  });

  test("omits the Configure menu and its retired management surfaces", async () => {
    const route = await readFile(routeUrl, "utf8");
    const menu = await readFile(new URL("ApplicationMenuBar.svelte", componentsUrl), "utf8");
    const titleBar = await readFile(new URL("DesktopTitleBar.svelte", componentsUrl), "utf8");
    const appCss = await readFile(appCssUrl, "utf8");

    expect(menu).not.toContain("application-view-menu");
    expect(menu).not.toContain('t("viewMenu")');
    expect(menu).not.toContain("onOpenMemory");
    expect(menu).not.toContain("onOpenRoles");
    expect(menu).not.toContain("onOpenSkills");
    expect(titleBar).not.toContain("onOpenMemory");
    expect(titleBar).not.toContain("onOpenRoles");
    expect(titleBar).not.toContain("onOpenSkills");
    expect(route).not.toContain("MemoryView.svelte");
    expect(route).not.toContain("RolesView.svelte");
    expect(route).not.toContain("SkillsView.svelte");
    expect(route).not.toContain("more-management-preview");
    expect(appCss).not.toContain("mdx-editor-root");
    expect(appCss).not.toContain("@mdxeditor/editor");
  });

  test("searches every workspace and keeps switching in the current window", async () => {
    const route = await readFile(routeUrl, "utf8");
    const openConversation = route.slice(
      route.indexOf("async function openSidebarConversation"),
      route.indexOf("async function addToRecentWorkspaces"),
    );

    expect(route).toContain("fetchConversationPage(null, null, 30, normalized, false, null)");
    expect(route).toContain("null,\n          searchConversationNextCursor");
    expect(openConversation).toContain("await routeWorkspace(conversationWorkspace, {");
    expect(openConversation).toContain("conversationId: conversation.id");
    expect(openConversation).toContain('if (result !== "current") return');
    expect(route).toContain('openAgent.invokeProduct("set_workspace"');
    expect(route).not.toContain('invoke("open_workspace_window"');
    expect(route).toContain('await invoke("create_workspace_window", { path: workspacePath })');
    expect(route).toContain("onNewWindow={createNewWindow}");
    const createNewWindow = route.slice(
      route.indexOf("async function createNewWindow"),
      route.indexOf("async function switchNewConversationWorkspace"),
    );
    expect(createNewWindow).not.toContain("openDialog");
  });

  test("keeps the first 20 role-scoped recents in the main sidebar flow", async () => {
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

    expect(route).toContain("fetchConversationPage(null, null, 20, null, true, recentRoleId)");
    expect(route).not.toContain("recentConversationNextCursor");
    expect(route).not.toContain("loadNextRecentConversationPage");
    expect(sidebar).toContain("onChange={changeRole}");
    expect(sidebar).not.toContain("onLoadMoreRecent");
    expect(primaryActions).toContain("onfocusout={handleSearchFocusout}");
    expect(workspaceBrowser).toContain("projectsCollapsed");
    expect(workspaceBrowser).toContain("recentsCollapsed");
    expect(workspaceBrowser).toContain("projectSearchRank");
    expect(workspaceBrowser).toContain(".slice(0, 20)");
    expect(workspaceBrowser).not.toContain("IntersectionObserver");
    expect(workspaceBrowser).not.toMatch(/\.recent-conversations\s*{[^}]*overflow-y:/s);
  });

  test("adapts every conversation title to the available sidebar width", async () => {
    const conversations = await readFile(new URL("ConversationList.svelte", componentsUrl), "utf8");
    const workspaceBrowser = await readFile(
      new URL("SidebarWorkspaceBrowser.svelte", componentsUrl),
      "utf8",
    );
    const title = await readFile(new URL("SidebarConversationTitle.svelte", componentsUrl), "utf8");

    expect(conversations).toContain("<SidebarConversationTitle text={title} />");
    expect(workspaceBrowser).toContain("<SidebarConversationTitle text={conversation.title} />");
    expect(title).toMatch(/\.sidebar-conversation-title\s*{[^}]*min-width: 0;[^}]*flex: 1 1 0;/s);
    expect(title).toContain("text-overflow: ellipsis");
    expect(title).toContain("resizeObserver.observe(node)");
    expect(title).toContain(".sidebar-conversation-title.overflowing:hover");
    expect(conversations).toMatch(/\.conv-list\s*{[^}]*width: 100%;[^}]*min-width: 0;/s);
    expect(workspaceBrowser).toMatch(
      /\.project-list,\s*\.recent-conversations\s*{[^}]*width: 100%;[^}]*min-width: 0;[^}]*grid-template-columns: minmax\(0, 1fr\);/s,
    );
  });

  test("prepares workspace switches without replacing the mounted application shell", async () => {
    const route = await readFile(routeUrl, "utf8");
    const loadingState = route.slice(
      route.indexOf("let mainContentLoading"),
      route.indexOf("let newConversationLayout"),
    );
    const applyWorkspace = route.slice(
      route.indexOf("async function applyWorkspace"),
      route.indexOf("async function requestWorkspace"),
    );

    expect(loadingState).not.toContain("workspaceLoading");
    expect(route).toContain("loading={initialLoading}");
    expect(route).toContain("inert={workspaceLoading}");
    expect(applyWorkspace.indexOf("const prepared =")).toBeLessThan(
      applyWorkspace.indexOf("workspacePath = path"),
    );
    expect(applyWorkspace).not.toContain("conversations = []");
    expect(applyWorkspace).toContain("conversations = prepared.conversations");
    expect(applyWorkspace).not.toContain("loadedConvIds.clear()");
    expect(applyWorkspace).not.toContain("await hydrateConversation(");
    expect(route.indexOf("prepareWorkspaceConversationSnapshot(")).toBeLessThan(
      route.indexOf("workspacePath = path"),
    );
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
    expect(route).toContain("shouldAutoOpenCheckpointFlowPanel(previous, next.flow)");
    expect(titleBar).toContain("<CheckpointFlowToggleButton");
    expect(titleBar.indexOf("<CheckpointFlowToggleButton")).toBeLessThan(
      titleBar.lastIndexOf("<WindowControls {platform}"),
    );
    expect(panel).not.toContain("peek-button");
    expect(panel).not.toContain("collapse-button");
    expect(panel).not.toContain("flow-panel-placeholder");
    expect(panel).toContain("width 180ms cubic-bezier(0.16, 1, 0.3, 1)");
    expect(panel).toContain("width: 0;");
    expect(panel).not.toContain("display: none;");
  });
});
