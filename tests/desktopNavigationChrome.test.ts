// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const routeUrl = new URL("../src/routes/+page.svelte", import.meta.url);
const componentsUrl = new URL("../src/lib/components/", import.meta.url);
const appCssUrl = new URL("../src/app.css", import.meta.url);

describe("desktop navigation chrome", () => {
  test("keeps every conversation composer free of backdrop fades", async () => {
    const [conversationSurface, standalonePreview, remoteRoute] = await Promise.all([
      readFile(new URL("ConversationSurface.svelte", componentsUrl), "utf8"),
      readFile(new URL("StandaloneDevPreview.svelte", componentsUrl), "utf8"),
      readFile(new URL("../src/routes/remote/+page.svelte", import.meta.url), "utf8"),
    ]);

    expect(conversationSurface).not.toContain("conversation-input-fade");
    expect(conversationSurface).not.toContain(".input-area::after");
    expect(standalonePreview).not.toContain("conversation-input-fade");
    expect(remoteRoute).not.toContain(".input-area::before");
  });

  test("keeps one shared title bar above every ordinary desktop surface", async () => {
    const route = await readFile(routeUrl, "utf8");

    expect(route.match(/<DesktopTitleBar\b/g)).toHaveLength(1);
    expect(route.indexOf("<DesktopTitleBar")).toBeLessThan(route.indexOf("<Dialog.Root"));

    for (const component of ["SettingsView.svelte"]) {
      const source = await readFile(new URL(component, componentsUrl), "utf8");
      expect(source).not.toContain("WindowControls");
      expect(source).not.toContain("data-tauri-drag-region");
    }
  });

  test("uses the window manager frame for the Linux main window", async () => {
    const [route, titleBar, host] = await Promise.all([
      readFile(routeUrl, "utf8"),
      readFile(new URL("DesktopTitleBar.svelte", componentsUrl), "utf8"),
      readFile(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8"),
    ]);

    expect(host).toMatch(
      /#\[cfg\(target_os = "linux"\)\][\s\S]*?\.find\(\|window\| window\.label == "main"\)[\s\S]*?main_window\.decorations = true;[\s\S]*?main_window\.transparent = false;/,
    );
    expect(titleBar).toContain('{#if platform === "windows"}');
    expect(route).toContain('detectWindowPlatform() !== "linux"');
  });

  test("keeps role selection in the conversation sidebar and role editing in the menu", async () => {
    const route = await readFile(routeUrl, "utf8");
    const sidebar = await readFile(new URL("DesktopSidebar.svelte", componentsUrl), "utf8");
    const menu = await readFile(new URL("ApplicationMenuBar.svelte", componentsUrl), "utf8");
    const resizeHandle = await readFile(
      new URL("SidebarResizeHandle.svelte", componentsUrl),
      "utf8",
    );

    expect(sidebar.indexOf("<SidebarHistoryControls")).toBeLessThan(
      sidebar.indexOf("<SidebarPrimaryActions"),
    );
    expect(sidebar.indexOf("<SidebarPrimaryActions")).toBeLessThan(
      sidebar.indexOf("<SidebarWorkspaceBrowser"),
    );
    expect(sidebar).toContain("RoleSelector");
    expect(sidebar).not.toContain("SidebarSettingsAction");
    expect(route).not.toContain("<RoleSidebar");
    expect(menu).toContain('id="application-role-menu"');
    expect(menu).toContain("onCreateRole");
    expect(menu).toContain("onConfigureRole");
    expect(menu).toContain("disabled={!selectedRole}");
    expect(sidebar).toContain("onNew={() => void onNew()}");
    expect(sidebar).toContain('src="/app-icon.png"');
    expect(sidebar).not.toContain("SidebarCollapseButton");
    expect(sidebar).not.toContain("openagent.sidebar.collapsed");
    expect(route).not.toContain("--role-sidebar-width");
    expect(sidebar).not.toContain("class:collapsed");
    expect(sidebar).not.toContain("{#if !collapsed}");
    expect(route).not.toContain("sidebarCollapsed");
    expect(route).not.toContain("openagent.sidebar.collapsed");
    expect(sidebar).toMatch(/\.sidebar-app-icon\s*{[^}]*width: 16px;[^}]*height: 16px;/s);
    expect(resizeHandle).toMatch(
      /\.sidebar-resize-shell\s*{[^}]*top: var\(--desktop-titlebar-height\);/s,
    );
    expect(resizeHandle).toMatch(
      /\.sidebar-resize-shell\s*{[^}]*right: calc\(-1 \* \(var\(--workspace-card-gap\) \+ 4px\)\);[^}]*bottom: var\(--workspace-card-gap\);[^}]*width: var\(--column-resize-hit-width\);/s,
    );
  });

  test("uses continuous chrome, an empty title-bar center, and a surface-free workspace trigger", async () => {
    const appCss = await readFile(appCssUrl, "utf8");
    const sidebar = await readFile(new URL("DesktopSidebar.svelte", componentsUrl), "utf8");
    const titleBar = await readFile(new URL("DesktopTitleBar.svelte", componentsUrl), "utf8");
    const conversationSurface = await readFile(
      new URL("ConversationSurface.svelte", componentsUrl),
      "utf8",
    );
    const desktopShellPreview = await readFile(
      new URL("DesktopShellPreview.svelte", componentsUrl),
      "utf8",
    );
    const workspaceSwitcher = await readFile(
      new URL("WorkspaceSwitcher.svelte", componentsUrl),
      "utf8",
    );
    expect(appCss).toContain("--desktop-titlebar-height: 35px");
    expect(appCss).toContain("--workspace-card-gap: 8px");
    expect(appCss).toContain("--column-resize-hit-width: 8px");
    expect(appCss).toContain("--column-resize-indicator-width: 2px");
    expect(appCss).toContain("--column-resize-indicator-opacity: 0.7");
    expect(sidebar).toMatch(/\.sidebar\s*{[^}]*background: transparent;/s);
    expect(sidebar).toContain("padding-top: var(--desktop-titlebar-height)");
    expect(titleBar).toMatch(/\.title-bar\s*{[^}]*background: transparent;/s);
    expect(titleBar).toContain("height: var(--desktop-titlebar-height)");
    expect(sidebar).not.toContain("border-right:");
    expect(titleBar).not.toContain("border-bottom:");
    expect(titleBar).toMatch(/\.title-bar-menu\s*{[^}]*margin-left: 39px;/s);
    expect(titleBar).toMatch(/\.title-bar\.macos \.title-bar-menu\s*{[^}]*margin-left: 124px;/s);
    for (const platform of ["windows", "macos", "linux"]) {
      expect(desktopShellPreview).toContain(`requestedPlatform === "${platform}"`);
    }
    expect(desktopShellPreview).toContain(
      "height: calc(100vh - var(--desktop-titlebar-height) - var(--workspace-card-gap))",
    );
    expect(desktopShellPreview).toContain(
      "margin: var(--desktop-titlebar-height) var(--workspace-card-gap) var(--workspace-card-gap)",
    );
    const conversationWorkspace = conversationSurface.match(
      /\.conversation-workspace\s*{([^}]*)}/s,
    )?.[1];
    const conversationStage = conversationSurface.match(/\.conversation-stage\s*{([^}]*)}/s)?.[1];
    expect(conversationWorkspace).toContain(
      "margin: var(--desktop-titlebar-height) var(--workspace-card-gap) var(--workspace-card-gap)",
    );
    expect(conversationWorkspace).toContain("background: transparent");
    expect(conversationWorkspace).not.toContain("box-shadow");
    expect(conversationStage).toContain("border-radius: 12px");
    expect(conversationStage).toContain("background: transparent");
    expect(conversationSurface).not.toContain(".conversation-stage::before");
    expect(conversationStage).not.toContain("box-shadow");
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

  test("keeps native canvases transparent while the flow panel stays opaque", async () => {
    const appCss = await readFile(appCssUrl, "utf8");
    const route = await readFile(routeUrl, "utf8");
    const flowPanel = await readFile(new URL("CheckpointFlowStatus.svelte", componentsUrl), "utf8");
    const nativeMaterialTokens = appCss.match(/html\.native-window-material\s*{([^}]*)}/s)?.[1];

    expect(nativeMaterialTokens).toContain("--bg: rgba(245, 245, 247, 0.3)");
    expect(nativeMaterialTokens).toContain("--app-chrome-bg: rgba(245, 245, 247, 0.3)");
    expect(nativeMaterialTokens).toContain("--sidebar-bg: rgba(245, 245, 247, 0.3)");
    expect(appCss).toMatch(
      /html\.native-window-material \.flow-panel-surface\s*{[^}]*background: var\(--surface\);[^}]*backdrop-filter: none;/s,
    );
    expect(flowPanel).not.toContain("backdrop-filter");
    expect(route).toMatch(/\.app\s*{[^}]*background: transparent;/s);

    const settings = await readFile(new URL("SettingsView.svelte", componentsUrl), "utf8");
    const onboarding = await readFile(new URL("OnboardingFlow.svelte", componentsUrl), "utf8");

    expect(settings).toMatch(/\.settings-panel\s*{[^}]*background: transparent;/s);
    expect(route).toMatch(
      /\.settings-dialog\)\s*{[^}]*background: var\(--floating-surface\);[^}]*backdrop-filter: blur\(24px\) saturate\(1\.5\);/s,
    );
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

  test("routes settings domains to singleton utility windows", async () => {
    const route = await readFile(routeUrl, "utf8");
    const menu = await readFile(new URL("ApplicationMenuBar.svelte", componentsUrl), "utf8");
    const settings = await readFile(new URL("SettingsView.svelte", componentsUrl), "utf8");
    const host = await readFile(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");

    expect(route).toContain("<SettingsWindowSurface");
    expect(route).toContain("onOpenSettingsWindow={openManagementWindow}");
    expect(route).toContain(': ["general"]');
    expect(menu).toContain('onOpenSettingsWindow("models", "providers")');
    expect(menu).toContain('onOpenSettingsWindow("agent", "execution")');
    expect(menu).toContain('onOpenSettingsWindow("integrations", "channels")');
    expect(menu).toContain('onOpenSettingsWindow("automation", "hooks")');
    expect(settings).toContain('<Tabs.Content value="execution"');
    expect(settings).toMatch(
      /if \(visibleSections\.has\("channels"\)\) \{[\s\S]*?wechatStatusTimer = setInterval/,
    );
    expect(host).toContain("async fn open_settings_window(");
    expect(host).toContain("if let Some(window) = app.get_webview_window(spec.label)");
    expect(host).toMatch(/window\s*\.emit\("settings-section-requested", &section\)/s);
  });

  test("keeps settings below notifications and nested configuration dialogs", async () => {
    const route = await readFile(routeUrl, "utf8");
    const toast = await readFile(new URL("Toast.svelte", componentsUrl), "utf8");
    const dialogs = await readFile(new URL("WorkspaceDialogs.svelte", componentsUrl), "utf8");

    expect(route).toMatch(/\.settings-dialog-overlay\)\s*{[^}]*z-index: 80;/s);
    expect(route).toMatch(/\.settings-dialog\)\s*{[^}]*z-index: 81;/s);
    expect(dialogs).toMatch(/\.dialog-overlay\)\s*{[^}]*z-index: 100;/s);
    expect(dialogs).toMatch(/\.dialog\)\s*{[^}]*z-index: 101;/s);
    expect(toast).toMatch(/\.toast-stack\s*{[^}]*z-index: 900;/s);
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
    const applyWorkspace = route.slice(
      route.indexOf("async function applyWorkspace"),
      route.indexOf("type WorkspaceRouteResult"),
    );
    expect(applyWorkspace.indexOf('openAgent.invokeProduct("set_workspace"')).toBeLessThan(
      applyWorkspace.indexOf("prepareWorkspaceSwitch("),
    );
    expect(route).toContain("target.conversationId,\n        !target.newConversation");
    expect(route).toContain('await invoke("create_workspace_window", { path: workspacePath })');
    expect(route).toContain("onNewWindow={createNewWindow}");
    const createNewWindow = route.slice(
      route.indexOf("async function createNewWindow"),
      route.indexOf("async function switchNewConversationWorkspace"),
    );
    expect(createNewWindow).not.toContain("openDialog");
  });

  test("bounds native quit cleanup and keeps an independent process-exit watchdog", async () => {
    const host = await readFile(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
    const workspace = await readFile(
      new URL("../sdk/rust/openagent-runtime/src/commands/workspace.rs", import.meta.url),
      "utf8",
    );
    const quit = host.slice(
      host.indexOf("async fn finish_desktop_quit"),
      host.indexOf("#[tauri::command]\nasync fn quit_app"),
    );

    expect(quit).toContain("timeout(DESKTOP_RUNTIME_STOP_TIMEOUT, supervisor.stop())");
    expect(quit).toContain("timeout(DESKTOP_EVENT_PROXY_STOP_TIMEOUT, proxy.stop())");
    expect(quit).toContain("finish_child_workspace_window_shutdown");
    expect(quit).toContain("tracing_setup::shutdown_tracing()");
    expect(quit).toContain("app.cleanup_before_exit()");
    expect(quit).toContain("std::process::exit(0)");
    expect(quit).toContain("openagent-quit-watchdog");
    expect(quit).toContain("std::thread::sleep(DESKTOP_QUIT_WATCHDOG_TIMEOUT)");
    expect(quit).toContain("for window in app.webview_windows().values()");
    expect(quit).toContain("window.hide()");
    expect(quit.indexOf("supervisor.stop()")).toBeLessThan(quit.indexOf("proxy.stop()"));
    expect(host).toContain("request_child_workspace_window_shutdown()");
    expect(host).toContain("openagent-parent-shutdown-monitor");
    expect(host).toContain("is_parent_controlled_workspace_window_process()");
    expect(workspace).toContain(".arg(PARENT_CONTROLLED_WORKSPACE_WINDOW_ARG)");
    expect(workspace).toContain(".stdin(Stdio::piped())");
    expect(workspace).toContain('stdin.write_all(b"shutdown\\n")');
  });

  test("keeps the system tray and its actions in the native host", async () => {
    const host = await readFile(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
    const route = await readFile(routeUrl, "utf8");

    expect(host).toContain("TrayIconBuilder::with_id(DESKTOP_TRAY_ID)");
    expect(host).toContain('.text(DESKTOP_TRAY_SHOW_ID, "Show OpenAgent")');
    expect(host).toContain('.text(DESKTOP_TRAY_QUIT_ID, "Quit")');
    expect(host).toContain("builder.on_menu_event");
    expect(host).toContain("DESKTOP_TRAY_QUIT_ID => request_desktop_quit(app.clone())");
    expect(route).not.toContain("initializeTray");
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
    expect(workspaceBrowser).toContain("recentSidebarConversations(recentConversations)");
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
    expect(route).toContain("restoreActiveConversation = true");
    expect(route).toContain("restoreActiveConversation\n        ? invoke<string | null>");
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
    const conversationSurface = await readFile(
      new URL("ConversationSurface.svelte", componentsUrl),
      "utf8",
    );
    const panel = await readFile(new URL("CheckpointFlowStatus.svelte", componentsUrl), "utf8");
    const panelShell = panel.match(/\.flow-panel\s*{([^}]*)}/s)?.[1];

    expect(route).toContain("bind:checkpointFlowPanelCollapsed");
    expect(route).toContain(
      "conversationDetailsAvailable(currentCheckpointFlow, currentFileChanges.length)",
    );
    expect(route).toContain(
      "if (!currentCheckpointFlow && key) checkpointFlowPanelCollapsed = false",
    );
    expect(route).toContain("checkpointFlow: currentCheckpointFlow ?? null");
    expect(conversationSurface).toContain(
      "{#if view.activeConvId && conversationDetailsAvailable(view.checkpointFlow, view.fileChanges.length)}",
    );
    expect(route).toContain("shouldAutoOpenCheckpointFlowPanel(previous, next.flow)");
    expect(titleBar).toContain("<CheckpointFlowToggleButton");
    expect(titleBar.indexOf("<CheckpointFlowToggleButton")).toBeLessThan(
      titleBar.lastIndexOf("<WindowControls {platform}"),
    );
    expect(panel).not.toContain("peek-button");
    expect(panel).not.toContain("collapse-button");
    expect(panel).not.toContain("flow-panel-placeholder");
    expect(panel).not.toContain("progress-track");
    expect(panel).not.toContain('role="progressbar"');
    expect(panel).toContain(
      '<span class="flow-count">{progress.completed}/{progress.total}</span>',
    );
    expect(panel).toContain("width 180ms cubic-bezier(0.16, 1, 0.3, 1)");
    expect(panel).toContain("width: 0;");
    expect(panel).not.toContain("display: none;");
    expect(panelShell).toContain("margin-left: var(--workspace-card-gap)");
    expect(panel).toMatch(
      /\.flow-panel-surface\s*{[^}]*border-radius: 12px;[^}]*background: var\(--surface\);/s,
    );
    expect(panelShell).not.toContain("border:");
    expect(panelShell).not.toContain("box-shadow:");
    expect(panel).toMatch(
      /\.resize-handle\s*{[^}]*inset: 0 auto 0 calc\(-1 \* var\(--workspace-card-gap\)\);[^}]*width: var\(--column-resize-hit-width\);/s,
    );
    expect(panel).toMatch(
      /\.resize-handle::after\s*{[^}]*inset: 0 auto 0 3px;[^}]*width: var\(--column-resize-indicator-width\);/s,
    );
    expect(panel).toMatch(/\.graph-viewport\s*{[^}]*overflow-y: auto;/s);
    expect(panel).not.toContain("graphScale");
    expect(panel).not.toContain("--graph-scale");
  });
});
