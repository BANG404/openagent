<script lang="ts">
  import { untrack } from "svelte";
  import { invoke } from "$lib/openagent/tauriClient";
  import { normalizeConfigShape } from "$lib/config";
  import { applyDocumentTheme } from "$lib/appTheme";
  import type { AppConfig, DefaultModelBinding } from "$lib/types";
  import { createProviderConfig, providerServiceName } from "$lib/settingsConfig";
  import {
    PROVIDER_CATALOG,
    providerDefaultBaseUrl,
    providerRequiresApiKey,
  } from "$lib/providerCatalog";
  import Tooltip from "./Tooltip.svelte";
  import Select from "./ui/Select.svelte";
  import SettingsActionButton from "./ui/SettingsActionButton.svelte";
  import WindowControls from "./WindowControls.svelte";

  let {
    config,
    workspacePath,
    onSave,
    onPickWorkspace,
    onComplete,
    onThemePreview,
    winMinimize,
    winMaximize,
    winClose,
  }: {
    config: AppConfig;
    workspacePath: string;
    onSave: (config: AppConfig) => Promise<AppConfig>;
    onPickWorkspace: () => Promise<void>;
    onComplete: () => void;
    onThemePreview?: (theme: string) => void;
    winMinimize: () => void;
    winMaximize: () => void;
    winClose: () => void;
  } = $props();

  let draft = $state<AppConfig>(
    normalizeConfigShape($state.snapshot(untrack(() => config)) as AppConfig),
  );
  let step = $state(0);
  let selectedProviderId = $state(draft.providers[0]?.id ?? "");
  let connectionStatus = $state<"idle" | "loading" | "success" | "error">("idle");
  let connectionMessage = $state("");
  let manualModelName = $state("");
  let saving = $state(false);
  let saveError = $state("");

  $effect(() => {
    const theme = draft.theme ?? "system";
    if (onThemePreview) onThemePreview(theme);
    else applyDocumentTheme(theme);
  });

  const copy = $derived(
    draft.language === "en"
      ? {
          steps: ["Welcome", "Preferences", "Model service", "Default models", "Ready"],
          stepProgress: "Step {current} of {total}",
          welcomeTitle: "Welcome to OpenAgent",
          welcomeBody:
            "OpenAgent is a desktop AI agent that can understand projects, edit files, and carry out tasks in the workspace you choose.",
          setupBody:
            "This guide will set your preferences, connect a model service, and choose the models OpenAgent uses. You can change everything later in Settings.",
          workspace: "Current workspace",
          workspaceDescription:
            "The workspace is the folder where OpenAgent reads files, runs commands, and keeps project context.",
          noWorkspace: "No workspace selected",
          chooseWorkspace: "Choose workspace",
          preferenceTitle: "Make OpenAgent yours",
          preferenceBody: "You can change these preferences at any time in Settings.",
          language: "Language",
          theme: "Theme",
          system: "System",
          light: "Light",
          dark: "Dark",
          providerTitle: "Connect a model service",
          providerBody: "Choose a model service, then verify the connection and load its models.",
          addProvider: "Add service",
          providerName: "Service name (optional)",
          providerType: "Service type",
          baseUrl: "Base URL (optional)",
          apiKey: "API key",
          optionalApiKey: "API key (optional)",
          oauthAccessToken: "Access token (optional; blank uses OAuth)",
          verify: "Verify and load models",
          verifying: "Connecting…",
          modelsLoaded: "Connection succeeded. {count} models loaded.",
          addModel: "Add model",
          modelName: "Model or deployment name",
          chatgptModelCatalogHint:
            "ChatGPT OAuth uses a built-in model list that may be incomplete or outdated. Verify sign-in first, then add model names available to your account manually; verifying again replaces manual entries.",
          defaultTitle: "Choose default models",
          defaultBody:
            "The chat model handles conversations. The flash model handles lightweight background tasks.",
          chatModel: "Chat model",
          flashModel: "Flash model",
          readyTitle: "You’re ready",
          readyBody: "OpenAgent is configured. Start a conversation and give it a real task.",
          back: "Back",
          next: "Continue",
          finish: "Start using OpenAgent",
          credentialNote: "Your model credentials stay on this device.",
          saveFailed: "Could not save settings",
        }
      : {
          steps: ["欢迎", "偏好", "模型服务", "默认模型", "完成"],
          stepProgress: "第 {current} 步，共 {total} 步",
          welcomeTitle: "欢迎使用 OpenAgent",
          welcomeBody:
            "OpenAgent 是一款桌面 AI Agent，可以在你选择的工作区中理解项目、编辑文件并执行任务。",
          setupBody:
            "接下来将设置界面偏好、连接模型服务并选择 OpenAgent 使用的默认模型；这些配置之后都可以在设置中修改。",
          workspace: "当前工作区",
          workspaceDescription: "工作区是 OpenAgent 读取文件、执行命令并保留项目上下文的文件夹。",
          noWorkspace: "尚未选择工作区",
          chooseWorkspace: "选择工作区",
          preferenceTitle: "设置你的使用偏好",
          preferenceBody: "这些选项之后都可以随时在设置中修改。",
          language: "界面语言",
          theme: "外观主题",
          system: "跟随系统",
          light: "浅色",
          dark: "深色",
          providerTitle: "连接模型服务",
          providerBody: "选择模型服务，验证连接并获取可用模型。",
          addProvider: "添加服务",
          providerName: "服务名称（可选）",
          providerType: "服务类型",
          baseUrl: "服务地址（可选）",
          apiKey: "API Key",
          optionalApiKey: "API Key（可选）",
          oauthAccessToken: "访问令牌（可选；留空使用 OAuth）",
          verify: "验证连接并获取模型",
          verifying: "正在连接…",
          modelsLoaded: "连接成功，已获取 {count} 个模型。",
          addModel: "添加模型",
          modelName: "模型或部署名称",
          chatgptModelCatalogHint:
            "ChatGPT OAuth 使用内置模型列表，可能不完整或不是最新版本。请先验证登录，再手动添加账号可用的模型名称；再次验证会替换手动添加的条目。",
          defaultTitle: "选择默认模型",
          defaultBody: "对话模型用于日常任务，Flash 模型用于标题、记忆等轻量后台任务。",
          chatModel: "对话模型",
          flashModel: "Flash 模型",
          readyTitle: "一切就绪",
          readyBody: "OpenAgent 已完成配置。开始一段对话，把真正的任务交给它吧。",
          back: "上一步",
          next: "继续",
          finish: "开始使用 OpenAgent",
          credentialNote: "模型凭据仅保存在此设备。",
          saveFailed: "无法保存设置",
        },
  );

  let selectedProvider = $derived(
    draft.providers.find((provider) => provider.id === selectedProviderId) ?? null,
  );
  let modelBindings = $derived.by(() =>
    draft.providers
      .filter((provider) => provider.enabled)
      .flatMap((provider) =>
        provider.models.map((model) => ({
          value: JSON.stringify([provider.id, model]),
          label: `${model} · ${providerServiceName(provider)}`,
          binding: { provider_id: provider.id, model } satisfies DefaultModelBinding,
        })),
      ),
  );
  let languageOptions = $derived([
    { value: "zh", label: "简体中文" },
    { value: "en", label: "English" },
  ]);
  let themeOptions = $derived([
    { value: "system", label: copy.system },
    { value: "light", label: copy.light },
    { value: "dark", label: copy.dark },
  ]);
  let providerOptions = $derived(
    PROVIDER_CATALOG.map((entry) => ({ value: entry.value, label: entry.label })),
  );
  let canContinue = $derived(
    step < 2 ||
      (step === 2
        ? Boolean(selectedProvider?.enabled && selectedProvider.models.length)
        : step === 3
          ? modelBindings.some(
              (option) => option.value === bindingValue(draft.defaults.chat_model),
            ) &&
            modelBindings.some(
              (option) => option.value === bindingValue(draft.defaults.flash_model),
            )
          : true),
  );

  function addProvider() {
    const provider = createProviderConfig();
    draft.providers = [...draft.providers, provider];
    selectedProviderId = provider.id;
    connectionStatus = "idle";
    connectionMessage = "";
  }

  function resetConnection() {
    if (!selectedProvider) return;
    selectedProvider.enabled = false;
    connectionStatus = "idle";
    connectionMessage = "";
  }

  async function verifyProvider() {
    if (
      !selectedProvider ||
      (providerRequiresApiKey(selectedProvider.provider) && !selectedProvider.api_key.trim())
    )
      return;
    connectionStatus = "loading";
    connectionMessage = "";
    try {
      const models = await invoke<string[]>("fetch_provider_models", {
        request: { provider: $state.snapshot(selectedProvider) },
      });
      const normalized = Array.from(
        new Set(models.map((model) => model.trim()).filter(Boolean)),
      ).sort();
      if (!normalized.length) throw new Error("No models returned");
      selectedProvider.models = normalized;
      selectedProvider.enabled = true;
      const fallback = { provider_id: selectedProvider.id, model: normalized[0] };
      if (!bindingAvailable(draft.defaults.chat_model)) draft.defaults.chat_model = fallback;
      if (!bindingAvailable(draft.defaults.flash_model)) draft.defaults.flash_model = fallback;
      connectionStatus = "success";
      connectionMessage = copy.modelsLoaded.replace("{count}", String(normalized.length));
    } catch (error) {
      selectedProvider.enabled = false;
      connectionStatus = "error";
      connectionMessage = `${error}`;
    }
  }

  function addManualModel() {
    if (!selectedProvider) return;
    const model = manualModelName.trim();
    if (!model) return;
    selectedProvider.models = Array.from(new Set([...selectedProvider.models, model])).sort();
    manualModelName = "";
  }

  function setModel(kind: "chat_model" | "flash_model", value: string) {
    const item = modelBindings.find((option) => option.value === value);
    if (item) draft.defaults[kind] = item.binding;
  }

  function bindingValue(binding: DefaultModelBinding) {
    return binding.model ? JSON.stringify([binding.provider_id, binding.model]) : "";
  }

  function bindingAvailable(binding: DefaultModelBinding) {
    return draft.providers.some(
      (provider) =>
        provider.enabled &&
        provider.id === binding.provider_id &&
        provider.models.includes(binding.model),
    );
  }

  async function finish() {
    saving = true;
    saveError = "";
    try {
      await onSave({
        ...($state.snapshot(draft) as AppConfig),
        onboarding_completed: true,
      });
      onComplete();
    } catch (error) {
      saveError = `${copy.saveFailed}: ${error}`;
    } finally {
      saving = false;
    }
  }
</script>

<div class="application-settings-scope onboarding-panel">
  <header class="onboarding-header" data-tauri-drag-region>
    <WindowControls
      onMinimize={winMinimize}
      onMaximize={winMaximize}
      onClose={winClose}
      canMaximize={false}
    />
  </header>
  <div class="onboarding-body">
    <aside class="onboarding-visual">
      <img
        class="onboarding-illustration"
        src="/assets/onboarding/openagent-workspace.png"
        alt=""
        aria-hidden="true"
      />
      <div class="onboarding-progress">
        <p>
          {copy.stepProgress
            .replace("{current}", String(step + 1))
            .replace("{total}", String(copy.steps.length))}
        </p>
        <nav aria-label={draft.language === "en" ? "Setup steps" : "设置步骤"}>
          {#each copy.steps as label, index (index)}
            <Tooltip text={label} side="top">
              <button
                class="onboarding-nav-item"
                class:active={index === step}
                class:complete={index < step}
                aria-current={index === step ? "step" : undefined}
                aria-label={`${index + 1}. ${label}`}
                disabled={index > step}
                onclick={() => {
                  if (index < step) step = index;
                }}
              >
                <span aria-hidden="true">{index + 1}</span>
              </button>
            </Tooltip>
          {/each}
        </nav>
        <strong>{copy.steps[step]}</strong>
        <p class="nav-note">{copy.credentialNote}</p>
      </div>
    </aside>

    <main class="application-settings-surface step-content" aria-label={copy.steps[step]}>
      <div class="step-scroll">
        {#if step === 0}
          <h1>{copy.welcomeTitle}</h1>
          <p class="lead">{copy.welcomeBody}</p>
          <p class="setup-description">{copy.setupBody}</p>
          <div class="application-settings-surface workspace-card">
            <div>
              <span>{copy.workspace}</span>
              <strong>{workspacePath || copy.noWorkspace}</strong>
              <p>{copy.workspaceDescription}</p>
            </div>
            <SettingsActionButton
              label={copy.chooseWorkspace}
              onclick={() => void onPickWorkspace()}
            />
          </div>
        {:else if step === 1}
          <h1>{copy.preferenceTitle}</h1>
          <p class="lead">{copy.preferenceBody}</p>
          <div class="form-grid two">
            <label>
              <span>{copy.language}</span>
              <Select
                bind:value={draft.language}
                items={languageOptions}
                ariaLabel={copy.language}
                triggerClass="application-settings-control"
              />
            </label>
            <label>
              <span>{copy.theme}</span>
              <Select
                bind:value={draft.theme}
                items={themeOptions}
                ariaLabel={copy.theme}
                triggerClass="application-settings-control"
              />
            </label>
          </div>
        {:else if step === 2}
          <h1>{copy.providerTitle}</h1>
          <p class="lead">{copy.providerBody}</p>
          <div class="provider-tabs">
            {#each draft.providers as provider (provider.id)}
              <button
                class:active={provider.id === selectedProviderId}
                onclick={() => (selectedProviderId = provider.id)}
              >
                <span class:online={provider.enabled}></span>{providerServiceName(provider)}
              </button>
            {/each}
            <SettingsActionButton
              label={copy.addProvider}
              icon="add"
              tone="primary"
              onclick={addProvider}
            />
          </div>
          {#if selectedProvider}
            <div class="form-grid">
              <div class="two">
                <label>
                  <span>{copy.providerName}</span>
                  <input
                    class="application-settings-control"
                    bind:value={selectedProvider.name}
                    placeholder={providerServiceName(selectedProvider)}
                  />
                </label>
                <label>
                  <span>{copy.providerType}</span>
                  <Select
                    bind:value={selectedProvider.provider}
                    items={providerOptions}
                    ariaLabel={copy.providerType}
                    onValueChange={resetConnection}
                    triggerClass="application-settings-control"
                  />
                </label>
              </div>
              <label>
                <span>{copy.baseUrl}</span>
                <input
                  class="application-settings-control"
                  bind:value={selectedProvider.base_url}
                  oninput={resetConnection}
                  placeholder={providerDefaultBaseUrl(selectedProvider.provider) ||
                    "https://your-resource.openai.azure.com"}
                />
              </label>
              <label>
                <span>
                  {providerRequiresApiKey(selectedProvider.provider)
                    ? copy.apiKey
                    : selectedProvider.provider === "chatgpt"
                      ? copy.oauthAccessToken
                      : copy.optionalApiKey}
                </span>
                <input
                  class="application-settings-control"
                  type="password"
                  bind:value={selectedProvider.api_key}
                  oninput={resetConnection}
                  placeholder="••••••••••••••••"
                />
              </label>
              {#if selectedProvider.provider === "chatgpt"}
                <p class="chatgpt-model-catalog-hint" role="note">
                  {copy.chatgptModelCatalogHint}
                </p>
              {/if}
              <div class="manual-model-row">
                <input
                  class="application-settings-control"
                  bind:value={manualModelName}
                  placeholder={copy.modelName}
                  onkeydown={(event) => {
                    if (event.key === "Enter") addManualModel();
                  }}
                />
                <SettingsActionButton label={copy.addModel} onclick={addManualModel} />
              </div>
              <div class="connection-row">
                <SettingsActionButton
                  label={connectionStatus === "loading" ? copy.verifying : copy.verify}
                  onclick={verifyProvider}
                  disabled={(providerRequiresApiKey(selectedProvider.provider) &&
                    !selectedProvider.api_key.trim()) ||
                    connectionStatus === "loading"}
                />
                {#if connectionMessage}<p
                    class:success={connectionStatus === "success"}
                    class:error={connectionStatus === "error"}
                  >
                    {connectionMessage}
                  </p>{/if}
              </div>
            </div>
          {/if}
        {:else if step === 3}
          <h1>{copy.defaultTitle}</h1>
          <p class="lead">{copy.defaultBody}</p>
          <div class="form-grid">
            <label>
              <span>{copy.chatModel}</span>
              <Select
                value={bindingValue(draft.defaults.chat_model)}
                items={modelBindings}
                ariaLabel={copy.chatModel}
                onValueChange={(value) => setModel("chat_model", value)}
                triggerClass="application-settings-control"
              />
            </label>
            <label>
              <span>{copy.flashModel}</span>
              <Select
                value={bindingValue(draft.defaults.flash_model)}
                items={modelBindings}
                ariaLabel={copy.flashModel}
                onValueChange={(value) => setModel("flash_model", value)}
                triggerClass="application-settings-control"
              />
            </label>
          </div>
        {:else}
          <h1>{copy.readyTitle}</h1>
          <p class="lead">{copy.readyBody}</p>
          <div class="application-settings-surface summary">
            <span>{copy.chatModel}</span>
            <strong>{draft.defaults.chat_model.model}</strong>
            <span>{copy.workspace}</span>
            <strong>{workspacePath || copy.noWorkspace}</strong>
          </div>
          {#if saveError}<p class="error">{saveError}</p>{/if}
        {/if}
      </div>

      <footer>
        <SettingsActionButton
          label={copy.back}
          onclick={() => (step -= 1)}
          disabled={step === 0 || saving}
        />
        {#if step < 4}
          <SettingsActionButton
            label={copy.next}
            tone="primary"
            onclick={() => (step += 1)}
            disabled={!canContinue}
          />
        {:else}
          <SettingsActionButton
            label={saving ? "…" : copy.finish}
            tone="primary"
            onclick={finish}
            disabled={saving}
          />
        {/if}
      </footer>
    </main>
  </div>
</div>

<style>
  .onboarding-panel {
    display: flex;
    height: 100vh;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    overflow: hidden;
    background: var(--app-chrome-bg);
    color: var(--text);
  }
  .onboarding-header {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    height: 40px;
    flex: none;
    box-sizing: border-box;
    padding: 0;
    background: var(--app-chrome-bg);
  }
  .onboarding-body {
    display: grid;
    grid-template-columns: 50% minmax(0, 50%);
    min-width: 0;
    min-height: 0;
    flex: 1;
    overflow: hidden;
    padding: 8px;
  }
  .onboarding-visual {
    display: flex;
    flex-direction: column;
    align-items: center;
    box-sizing: border-box;
    min-width: 0;
    padding: 46px 38px 28px;
    background: transparent;
  }
  .onboarding-illustration {
    display: block;
    width: min(100%, 320px);
    height: auto;
    margin: 72px auto 0;
    filter: drop-shadow(0 18px 22px rgba(31, 76, 138, 0.12));
    user-select: none;
    -webkit-user-drag: none;
  }
  .onboarding-progress {
    display: flex;
    width: 100%;
    margin-top: auto;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .onboarding-progress > p:first-child {
    margin: 0 0 10px;
    color: var(--text-muted);
    font-size: 11px;
    letter-spacing: 0.02em;
  }
  .onboarding-progress nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .onboarding-nav-item {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    min-width: 28px;
    min-height: 28px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--surface);
    color: var(--text-muted);
    box-shadow: var(--control-shadow);
    cursor: pointer;
    font: inherit;
    font-size: 11px;
  }
  .onboarding-nav-item:hover:not(:disabled) {
    background: var(--interactive-state-bg);
    color: var(--text);
  }
  .onboarding-nav-item.active {
    background: var(--primary);
    color: #fff;
    box-shadow:
      var(--control-shadow),
      0 0 0 2px color-mix(in srgb, var(--primary) 16%, transparent);
    font-weight: 600;
  }
  .onboarding-nav-item:disabled {
    cursor: default;
    opacity: 0.55;
  }
  .onboarding-nav-item.complete {
    color: var(--primary);
  }
  .onboarding-progress strong {
    margin-top: 12px;
    font-size: 13px;
    font-weight: 600;
  }
  .nav-note {
    max-width: 240px;
    margin: 8px 0 0;
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.5;
  }
  .step-content {
    display: flex;
    min-width: 0;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    box-sizing: border-box;
    margin-block: 8px;
    overflow: hidden;
    border-radius: 8px;
    background: var(--mica-surface);
  }
  .step-scroll {
    min-height: 0;
    flex: 1;
    overflow-y: auto;
    padding: 32px 50px 24px;
  }
  h1 {
    margin: 0 0 12px;
    font-size: 30px;
    font-weight: 600;
    letter-spacing: -0.035em;
    line-height: 1.16;
  }
  .lead {
    max-width: 520px;
    margin: 0 0 14px;
    color: var(--text-muted);
    font-size: 14px;
    line-height: 1.6;
  }
  .setup-description {
    max-width: 520px;
    margin: 0 0 28px;
    color: var(--text);
    font-size: 13px;
    line-height: 1.6;
  }
  .workspace-card,
  .summary {
    padding: 16px;
    border-radius: 8px;
    background: var(--mica-surface);
  }
  .workspace-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
  }
  .workspace-card div {
    display: grid;
    min-width: 0;
    gap: 5px;
  }
  .workspace-card :global(.settings-action) {
    white-space: nowrap;
  }
  .workspace-card span,
  .summary span {
    color: var(--text-muted);
    font-size: 11px;
  }
  .workspace-card strong {
    overflow: hidden;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .workspace-card p {
    margin: 1px 0 0;
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.5;
  }
  .form-grid {
    display: grid;
    gap: 20px;
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  .form-grid label {
    display: grid;
    gap: 7px;
  }
  .form-grid label > span {
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 600;
  }
  .provider-tabs {
    display: flex;
    gap: 6px;
    margin: -10px 0 20px;
    overflow-x: auto;
  }
  .provider-tabs button {
    display: flex;
    align-items: center;
    gap: 7px;
    white-space: nowrap;
  }
  .provider-tabs button.active {
    background: var(--interactive-state-bg);
    color: var(--text);
  }
  .provider-tabs span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-muted);
  }
  .provider-tabs span.online {
    background: #22a06b;
  }
  .provider-tabs button {
    min-height: 34px;
    padding: 0 14px;
    border: 1px solid var(--mica-divider);
    border-radius: 7px;
    background: var(--mica-surface);
    color: var(--text);
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    box-shadow: none;
  }
  .provider-tabs button:hover:not(:disabled) {
    background: var(--interactive-state-bg);
  }
  .provider-tabs button:disabled {
    cursor: default;
    opacity: 0.5;
  }
  .connection-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .manual-model-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
  }
  .chatgpt-model-catalog-hint {
    margin: 0;
    border-radius: 9px;
    padding: 10px 12px;
    background: var(--surface2);
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.5;
  }
  .manual-model-row :global(.settings-action) {
    white-space: nowrap;
  }
  .connection-row p {
    margin: 0;
    color: var(--text-muted);
    font-size: 11px;
  }
  .success {
    color: #16865f !important;
  }
  .error {
    color: #d14343 !important;
  }
  .summary {
    display: grid;
    grid-template-columns: 120px minmax(0, 1fr);
    gap: 11px 18px;
  }
  .summary strong {
    overflow: hidden;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  footer {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    flex: none;
    padding: 20px 48px 24px;
  }
</style>
