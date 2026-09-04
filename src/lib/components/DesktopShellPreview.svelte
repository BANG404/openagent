<script lang="ts">
  import { t } from "$lib/i18n";
  import type {
    AgentRole,
    ApprovalMode,
    ChatAttachment,
    Conversation,
    RecentWorkspace,
    WorkspaceContext,
  } from "$lib/types";
  import type { WindowPlatform } from "$lib/windowPlatform";
  import DesktopSidebar from "./DesktopSidebar.svelte";
  import RoleEditorDialog from "./RoleEditorDialog.svelte";
  import DesktopTitleBar from "./DesktopTitleBar.svelte";
  import MessageInput from "./MessageInput.svelte";

  const query = new URLSearchParams(window.location.search);
  let selectedRoleKey = $state("openagent");
  let activeConversationId = $state<string | null>(
    query.has("desktop-shell-preview-existing") ? "openagent-1" : null,
  );
  let workspacePath = $state("C:\\Projects\\openagent");
  let workspaceSwitchTarget = $state<string | null>(null);
  let draft = $state("");
  let attachments = $state<ChatAttachment[]>([]);
  let approvalMode = $state<ApprovalMode>("auto");
  let roleEditorOpen = $state(false);
  let roleEditorRole = $state<AgentRole | null>(null);
  let searchQuery = $state("");
  const requestedPlatform = query.get("desktop-shell-preview-platform");
  const platformOverride: WindowPlatform | undefined =
    requestedPlatform === "windows" ||
    requestedPlatform === "macos" ||
    requestedPlatform === "linux"
      ? requestedPlatform
      : undefined;
  const windowFocused = query.get("desktop-shell-preview-focused") !== "false";

  const roles: AgentRole[] = [
    {
      id: "reviewer",
      scope: "local",
      name: "Reviewer",
      description: "Review implementation changes",
      skill_ids: ["local:playwright"],
      mcp_server_ids: ["browser-tools"],
      usage_count: 3,
      created_at: 1,
      updated_at: 2,
      last_used_at: 2,
    },
  ];
  let recentWorkspaces = $state<RecentWorkspace[]>([
    { path: "C:\\Projects\\openagent", name: "openagent" },
    { path: "C:\\Projects\\agent-runtime", name: "agent-runtime" },
    { path: "\\\\wsl.localhost\\Ubuntu-24.04\\home\\dev\\math", name: "math" },
    { path: "C:\\Projects\\openagent\\.agents", name: ".agents" },
    { path: "C:\\Projects\\archive", name: "archive" },
    { path: "C:\\Projects\\legacy-ui", name: "legacy-ui" },
    { path: "C:\\Projects\\legacy-runtime", name: "legacy-runtime" },
    { path: "C:\\Projects\\legacy-notes", name: "legacy-notes" },
  ]);
  let pinnedProjectPaths = $state<string[]>([]);
  let allPreviewConversations = $state<Conversation[]>([
    {
      id: "openagent-1",
      title:
        "Title 的文本长度应该基于侧边栏宽度自适应，超出部分显示省略号；悬浮在 title 上时滚动展示完整文本",
      workspace: "C:\\Projects\\openagent",
      messages: [],
      createdAt: 10,
      updatedAt: 50,
    },
    {
      id: "openagent-2",
      title: "支持自适应高度限制",
      workspace: "C:\\Projects\\openagent",
      messages: [],
      createdAt: 9,
      updatedAt: 45,
    },
    {
      id: "runtime-1",
      title: "排查 Rust 进入服务器闪退",
      workspace: "C:\\Projects\\agent-runtime",
      messages: [],
      createdAt: 8,
      updatedAt: 40,
      roleId: "reviewer",
    },
    {
      id: "math-1",
      title: "当前给 WSL 分配了多少内存？",
      workspace: "\\\\wsl.localhost\\Ubuntu-24.04\\home\\dev\\math",
      messages: [],
      createdAt: 7,
      updatedAt: 35,
    },
    {
      id: "archive-1",
      title: "Older project conversation loaded outside Recents",
      workspace: "C:\\Projects\\archive",
      messages: [],
      createdAt: -200,
      updatedAt: -200,
    },
    ...Array.from({ length: 28 }, (_, index): Conversation => ({
      id: `preview-${index + 1}`,
      title: `侧栏最近对话示例 ${index + 1}`,
      workspace: index % 2 === 0 ? "C:\\Projects\\openagent" : "C:\\Projects\\agent-runtime",
      messages: [],
      createdAt: 6 - index,
      updatedAt: 34 - index,
      roleId: index % 4 === 0 ? "reviewer" : undefined,
    })),
  ]);
  let recentConversations = $derived(
    allPreviewConversations.filter((conversation) =>
      selectedRoleKey === "openagent"
        ? !conversation.roleId
        : conversation.roleId === selectedRoleKey,
    ),
  );
  let workspace = $derived<WorkspaceContext>({
    path: workspacePath,
    git_branch: workspacePath.endsWith("openagent") ? "master" : null,
    has_agent_dir: true,
    environment: workspacePath.startsWith("\\\\wsl")
      ? { kind: "wsl", distribution: "Ubuntu-24.04", linux_path: "/home/dev/math" }
      : { kind: "local" },
  });
  let conversations = $derived.by(() => {
    const normalized = searchQuery.trim().toLocaleLowerCase();
    if (normalized) {
      return allPreviewConversations.filter((conversation) =>
        conversation.title.toLocaleLowerCase().includes(normalized),
      );
    }
    return recentConversations.filter((conversation) => conversation.workspace === workspacePath);
  });

  async function selectWorkspace(path: string): Promise<void> {
    if (path === workspacePath || workspaceSwitchTarget) return;
    workspaceSwitchTarget = path;
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    workspacePath = path;
    activeConversationId = null;
    workspaceSwitchTarget = null;
  }
</script>

<div class="desktop-shell-preview">
  <DesktopSidebar
    {roles}
    {selectedRoleKey}
    canGoBack={false}
    canGoForward={false}
    {workspacePath}
    {workspaceSwitchTarget}
    {recentWorkspaces}
    {pinnedProjectPaths}
    {searchQuery}
    {conversations}
    {recentConversations}
    {activeConversationId}
    streamingConversationIds={{ "openagent-2": true }}
    hasMore={false}
    loadingMore={false}
    loadingRecentConversations={false}
    loading={false}
    onRoleChange={(role) => {
      selectedRoleKey = role;
    }}
    onBack={() => {}}
    onForward={() => {}}
    onNew={() => {
      activeConversationId = null;
    }}
    onNewProjectConversation={(path) => {
      selectWorkspace(path);
      activeConversationId = null;
    }}
    onLoadProjectConversations={async (path, roleKey) =>
      allPreviewConversations.filter(
        (conversation) =>
          conversation.workspace === path &&
          (roleKey === "openagent" ? !conversation.roleId : conversation.roleId === roleKey),
      )}
    onSearch={(query) => {
      searchQuery = query;
    }}
    onLoadMore={() => {}}
    onSelect={(id) => {
      activeConversationId = id;
    }}
    onOpenConversation={(conversation) => {
      if (conversation.workspace) workspacePath = conversation.workspace;
      selectedRoleKey = conversation.roleId ?? "openagent";
      activeConversationId = conversation.id;
    }}
    onTogglePin={() => {}}
    onDelete={(id) => {
      allPreviewConversations = allPreviewConversations.filter(
        (conversation) => conversation.id !== id,
      );
      if (activeConversationId === id) activeConversationId = null;
    }}
    onSelectWorkspace={selectWorkspace}
    onToggleProjectPin={(path) => {
      pinnedProjectPaths = pinnedProjectPaths.includes(path)
        ? pinnedProjectPaths.filter((item) => item !== path)
        : [path, ...pinnedProjectPaths];
    }}
    onOpenProjectFolder={() => {}}
    onRemoveProject={(path) => {
      recentWorkspaces = recentWorkspaces.filter((item) => item.path !== path);
      pinnedProjectPaths = pinnedProjectPaths.filter((item) => item !== path);
    }}
    {platformOverride}
    {windowFocused}
  />
  <section class="desktop-shell-main">
    <DesktopTitleBar
      {workspacePath}
      {recentWorkspaces}
      {roles}
      {selectedRoleKey}
      tauriAvailable
      memorySyncing={false}
      conversationDetailsAvailable={false}
      checkpointFlowPanelCollapsed={true}
      onPickWorkspace={() => selectWorkspace("C:\\Projects\\new-project")}
      onPickWsl={() => selectWorkspace(recentWorkspaces[2].path)}
      onSelectWorkspace={selectWorkspace}
      onNewConversation={() => {
        activeConversationId = null;
      }}
      onNewWindow={() => {}}
      onOpenSettings={() => {}}
      onCreateRole={() => {
        roleEditorRole = null;
        roleEditorOpen = true;
      }}
      onConfigureRole={(role) => {
        roleEditorRole = role;
        roleEditorOpen = true;
      }}
      onOpenAbout={() => {}}
      onQuit={() => {}}
      onToggleCheckpointFlowPanel={() => {}}
      onMinimize={() => {}}
      onMaximize={() => {}}
      onClose={() => {}}
      {platformOverride}
      {windowFocused}
    />
    <main class="desktop-shell-content">
      {#if activeConversationId}
        <div class="existing-conversation">
          <p>Existing conversation</p>
          <strong
            >{allPreviewConversations.find((item) => item.id === activeConversationId)
              ?.title}</strong
          >
        </div>
      {:else}
        <div class="new-conversation-heading">
          <h1>{$t("ready")}</h1>
          <p>{$t("readyHint")}</p>
        </div>
      {/if}
      <div class:new-conversation-composer={!activeConversationId} class="preview-composer">
        <MessageInput
          bind:value={draft}
          bind:attachments
          selectedModel="preview"
          modelOptions={[{ value: "preview", label: "gpt-5.6" }]}
          placeholder={$t("inputPlaceholder")}
          disabled={false}
          isStreaming={false}
          sendDisabled={!draft.trim()}
          sendTitle={$t("send")}
          showApprovalMode
          {approvalMode}
          onApprovalModeChange={(mode) => (approvalMode = mode)}
          showWorkspaceSwitcher={!activeConversationId}
          {workspace}
          {workspacePath}
          {recentWorkspaces}
          workspaceTauriAvailable
          workspaceBrowserModeNotice=""
          onPickWorkspace={() => selectWorkspace("C:\\Projects\\new-project")}
          onPickWslWorkspace={() => selectWorkspace(recentWorkspaces[2].path)}
          onSelectWorkspace={selectWorkspace}
          onSend={() => {}}
          onStop={() => {}}
        />
      </div>
    </main>
  </section>
</div>

<RoleEditorDialog
  bind:open={roleEditorOpen}
  role={roleEditorRole}
  skills={[
    {
      name: "Playwright",
      description: "Browser automation and visual verification",
      dir_name: "playwright",
      path: "C:\\Projects\\openagent\\.agents\\skills\\playwright",
      scope: "local",
    },
    {
      name: "Release checks",
      description: "Qualify release artifacts and workflows",
      dir_name: "release-checks",
      path: "C:\\Users\\dev\\.agents\\skills\\release-checks",
      scope: "global",
    },
  ]}
  mcpServers={[
    {
      id: "browser-tools",
      name: "Browser tools",
      enabled: true,
      transport: "stdio",
      url: "",
      bearer_token: "",
      headers: {},
      command: "bunx",
      args: [],
      env: {},
    },
  ]}
  loadingResources={false}
  saving={false}
  onSave={() => {
    roleEditorOpen = false;
  }}
  onDelete={() => {
    roleEditorOpen = false;
  }}
/>

<style>
  .desktop-shell-preview {
    display: flex;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: var(--bg);
  }

  .desktop-shell-main {
    min-width: 0;
    flex: 1;
    height: 100%;
  }

  .desktop-shell-content {
    position: relative;
    display: flex;
    height: calc(100vh - var(--desktop-titlebar-height) - 16px);
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    margin: var(--desktop-titlebar-height) 8px 8px;
    padding: 32px;
    overflow: hidden;
    border-radius: 12px;
    background: var(--surface);
  }

  .new-conversation-heading {
    position: absolute;
    top: calc(50% - 112px);
    z-index: 1;
    text-align: center;
  }

  .new-conversation-heading h1,
  .new-conversation-heading p {
    margin: 0;
  }

  .new-conversation-heading h1 {
    color: var(--text);
    font-size: 24px;
  }

  .new-conversation-heading p {
    margin-top: 8px;
    color: var(--text-muted);
    font-size: 13px;
  }

  .preview-composer {
    position: absolute;
    right: 24px;
    bottom: 20px;
    left: 24px;
    z-index: 2;
    width: min(900px, calc(100% - 48px));
    margin: 0 auto;
  }

  .preview-composer.new-conversation-composer {
    top: calc(50% - 28px);
    bottom: auto;
    width: min(760px, calc(100% - 48px));
  }

  .existing-conversation {
    align-self: flex-start;
    width: min(760px, 100%);
    margin-top: 72px;
    color: var(--text);
  }

  .existing-conversation p {
    color: var(--text-muted);
    font-size: 12px;
  }
</style>
