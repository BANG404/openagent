<script lang="ts">
  import { untrack } from "svelte";
  import { invoke } from "$lib/openagent/tauriClient";
  import { normalizeConfigShape } from "$lib/config";
  import type { AppConfig, DefaultModelBinding } from "$lib/types";
  import { createProviderConfig } from "$lib/settingsConfig";
  import {
    PROVIDER_CATALOG,
    providerDefaultBaseUrl,
    providerRequiresApiKey,
  } from "$lib/providerCatalog";
  import WindowControls from "./WindowControls.svelte";

  let {
    config,
    workspacePath,
    onSave,
    onPickWorkspace,
    onComplete,
    winMinimize,
    winMaximize,
    winClose,
  }: {
    config: AppConfig;
    workspacePath: string;
    onSave: (config: AppConfig) => Promise<AppConfig>;
    onPickWorkspace: () => Promise<void>;
    onComplete: () => void;
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
    const theme = draft.theme;
    document.documentElement.classList.remove("dark", "light");
    const resolved =
      theme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : theme;
    document.documentElement.classList.add(resolved);
  });

  const copy = $derived(
    draft.language === "en"
      ? {
          steps: ["Welcome", "Preferences", "Model service", "Default models", "Ready"],
          welcomeTitle: "Welcome to OpenAgent",
          welcomeBody: "Let’s set up the essentials so your first conversation is ready to run.",
          workspace: "Current workspace",
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
          providerName: "Service name",
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
          saveFailed: "Could not save settings",
        }
      : {
          steps: ["欢迎", "偏好", "模型服务", "默认模型", "完成"],
          welcomeTitle: "欢迎使用 OpenAgent",
          welcomeBody: "用几步完成必要配置，接下来就可以直接开始第一段对话。",
          workspace: "当前工作区",
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
          providerName: "服务名称",
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
          label: `${model} · ${provider.name}`,
          binding: { provider_id: provider.id, model } satisfies DefaultModelBinding,
        })),
      ),
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

<div class="onboarding-panel">
  <header class="onboarding-header" data-tauri-drag-region>
    <span>{draft.language === "en" ? "Getting started" : "入门设置"}</span>
    <WindowControls onMinimize={winMinimize} onMaximize={winMaximize} onClose={winClose} />
  </header>
  <div class="onboarding-body">
    <aside class="onboarding-nav">
      <nav aria-label={draft.language === "en" ? "Setup steps" : "设置步骤"}>
        {#each copy.steps as label, index (index)}
          <button
            class="onboarding-nav-item"
            class:active={index === step}
            class:complete={index < step}
            disabled={index > step}
            onclick={() => {
              if (index < step) step = index;
            }}
          >
            <span>{index < step ? "✓" : index + 1}</span>
            {label}
          </button>
        {/each}
      </nav>
      <p class="nav-note">
        API Key {draft.language === "en" ? "stays on this device" : "仅保存在本机配置中"}
      </p>
    </aside>

    <main class="step-content" aria-label={copy.steps[step]}>
      {#if step === 0}
        <h1>{copy.welcomeTitle}</h1>
        <p class="lead">{copy.welcomeBody}</p>
        <div class="workspace-card">
          <div>
            <span>{copy.workspace}</span>
            <strong>{workspacePath || copy.noWorkspace}</strong>
          </div>
          <button class="secondary" onclick={() => void onPickWorkspace()}
            >{copy.chooseWorkspace}</button
          >
        </div>
      {:else if step === 1}
        <h1>{copy.preferenceTitle}</h1>
        <p class="lead">{copy.preferenceBody}</p>
        <div class="form-grid two">
          <label>
            <span>{copy.language}</span>
            <select bind:value={draft.language}>
              <option value="zh">简体中文</option>
              <option value="en">English</option>
            </select>
          </label>
          <label>
            <span>{copy.theme}</span>
            <select bind:value={draft.theme}>
              <option value="system">{copy.system}</option>
              <option value="light">{copy.light}</option>
              <option value="dark">{copy.dark}</option>
            </select>
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
              <span class:online={provider.enabled}></span>{provider.name}
            </button>
          {/each}
          <button class="add" onclick={addProvider}>＋ {copy.addProvider}</button>
        </div>
        {#if selectedProvider}
          <div class="form-grid">
            <div class="two">
              <label>
                <span>{copy.providerName}</span>
                <input bind:value={selectedProvider.name} />
              </label>
              <label>
                <span>{copy.providerType}</span>
                <select bind:value={selectedProvider.provider} onchange={resetConnection}>
                  {#each PROVIDER_CATALOG as entry (entry.value)}
                    <option value={entry.value}>{entry.label}</option>
                  {/each}
                </select>
              </label>
            </div>
            <label>
              <span>{copy.baseUrl}</span>
              <input
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
                bind:value={manualModelName}
                placeholder={copy.modelName}
                onkeydown={(event) => {
                  if (event.key === "Enter") addManualModel();
                }}
              />
              <button class="secondary" onclick={addManualModel}>{copy.addModel}</button>
            </div>
            <div class="connection-row">
              <button
                class="verify"
                onclick={verifyProvider}
                disabled={(providerRequiresApiKey(selectedProvider.provider) &&
                  !selectedProvider.api_key.trim()) ||
                  connectionStatus === "loading"}
              >
                {connectionStatus === "loading" ? copy.verifying : copy.verify}
              </button>
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
            <select
              value={bindingValue(draft.defaults.chat_model)}
              onchange={(event) => setModel("chat_model", event.currentTarget.value)}
            >
              {#each modelBindings as option (option.value)}<option value={option.value}
                  >{option.label}</option
                >{/each}
            </select>
          </label>
          <label>
            <span>{copy.flashModel}</span>
            <select
              value={bindingValue(draft.defaults.flash_model)}
              onchange={(event) => setModel("flash_model", event.currentTarget.value)}
            >
              {#each modelBindings as option (option.value)}<option value={option.value}
                  >{option.label}</option
                >{/each}
            </select>
          </label>
        </div>
      {:else}
        <h1>{copy.readyTitle}</h1>
        <p class="lead">{copy.readyBody}</p>
        <div class="summary">
          <span>{copy.chatModel}</span>
          <strong>{draft.defaults.chat_model.model}</strong>
          <span>{copy.workspace}</span>
          <strong>{workspacePath || copy.noWorkspace}</strong>
        </div>
        {#if saveError}<p class="error">{saveError}</p>{/if}
      {/if}

      <footer>
        <button class="secondary" onclick={() => (step -= 1)} disabled={step === 0 || saving}
          >{copy.back}</button
        >
        {#if step < 4}
          <button class="primary" onclick={() => (step += 1)} disabled={!canContinue}
            >{copy.next}<span>→</span></button
          >
        {:else}
          <button class="primary" onclick={finish} disabled={saving}
            >{saving ? "…" : copy.finish}<span>→</span></button
          >
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
    background: var(--bg);
    color: var(--text);
  }
  .onboarding-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 48px;
    flex: none;
    box-sizing: border-box;
    padding: 0 0 0 16px;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
  }
  .onboarding-header > span {
    font-size: 14px;
    font-weight: 600;
  }
  .onboarding-body {
    display: flex;
    min-width: 0;
    min-height: 0;
    flex: 1;
    overflow: hidden;
  }
  .onboarding-nav {
    display: flex;
    width: 172px;
    flex: none;
    flex-direction: column;
    box-sizing: border-box;
    padding: 12px 8px;
    border-right: 1px solid var(--border);
    background: var(--bg);
  }
  .onboarding-nav nav {
    display: flex;
    flex-direction: column;
    gap: var(--list-item-stack-gap);
  }
  .onboarding-nav-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 34px;
    padding: 8px 10px;
    border: 0;
    border-radius: 7px;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
    font: inherit;
    font-size: 13px;
    text-align: left;
  }
  .onboarding-nav-item:hover:not(:disabled) {
    background: var(--interactive-state-bg);
    color: var(--text);
  }
  .onboarding-nav-item.active {
    background: var(--interactive-state-bg);
    color: var(--text);
    font-weight: 500;
  }
  .onboarding-nav-item:disabled {
    cursor: default;
    opacity: 0.55;
  }
  .onboarding-nav-item span {
    width: 16px;
    color: var(--text-muted);
    font-size: 11px;
    text-align: center;
  }
  .onboarding-nav-item.complete span {
    color: var(--primary);
  }
  .nav-note {
    margin: auto 10px 2px;
    color: var(--text-muted);
    font-size: 10px;
    line-height: 1.5;
  }
  .step-content {
    display: flex;
    min-width: 0;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    box-sizing: border-box;
    overflow-y: auto;
    padding: 40px max(24px, calc((100% - 720px) / 2)) 24px;
  }
  h1 {
    margin: 0 0 9px;
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .lead {
    max-width: 600px;
    margin: 0 0 32px;
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.55;
  }
  .workspace-card,
  .summary {
    padding: 16px;
    border: 0;
    border-radius: 8px;
    background: var(--surface);
    box-shadow: var(--control-shadow);
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
  input,
  select {
    box-sizing: border-box;
    width: 100%;
    height: 36px;
    padding: 0 11px;
    border: 0;
    border-radius: 8px;
    outline: none;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 13px;
    box-shadow: var(--control-shadow);
  }
  input:focus,
  select:focus {
    box-shadow: var(--control-shadow), var(--focus-ring);
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
  .provider-tabs .add {
    color: var(--primary);
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
  button {
    min-height: 32px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--bg);
    color: var(--text);
    cursor: pointer;
    font: inherit;
    font-size: 12px;
  }
  button:hover:not(:disabled) {
    background: var(--interactive-state-bg);
  }
  button:disabled {
    cursor: default;
    opacity: 0.5;
  }
  .primary {
    display: flex;
    align-items: center;
    gap: 14px;
    border-color: var(--primary);
    background: var(--primary);
    color: white;
  }
  .primary:hover:not(:disabled) {
    background: var(--primary-hover, var(--primary));
  }
  .primary span {
    font-size: 15px;
  }
  .secondary {
    background: transparent;
  }
  .verify {
    color: var(--primary);
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
    border-left: 3px solid var(--primary);
    border-radius: 0 9px 9px 0;
    padding: 9px 11px;
    background: var(--surface2);
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.5;
  }
  .manual-model-row .secondary {
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
    margin-top: auto;
    padding-top: 30px;
  }
  @media (max-width: 760px) {
    .onboarding-nav {
      width: 52px;
      padding-inline: 7px;
    }
    .onboarding-nav-item {
      justify-content: center;
      padding-inline: 0;
      font-size: 0;
    }
    .nav-note {
      display: none;
    }
    .step-content {
      padding: 28px 16px 20px;
    }
    .two {
      grid-template-columns: 1fr;
    }
  }
</style>
