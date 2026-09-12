<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { isTauri } from "@tauri-apps/api/core";
  import { desktopOpenAgent, listen } from "$lib/openagent/tauriClient";
  import { normalizeConfigShape } from "$lib/config";
  import { applyDocumentTheme } from "$lib/appTheme";
  import type { AppConfig, DefaultModelBinding } from "$lib/types";
  import {
    createProviderConfig,
    providerRequestUrl,
    providerServiceName,
  } from "$lib/settingsConfig";
  import {
    PROVIDER_CATALOG,
    providerDefaultBaseUrl,
    providerRequiresApiKey,
  } from "$lib/providerCatalog";
  import Select from "./ui/Select.svelte";
  import SegmentedControl from "./ui/SegmentedControl.svelte";
  import SettingsActionButton from "./ui/SettingsActionButton.svelte";

  let {
    config,
    workspacePath,
    onSave,
    onPickWorkspace,
    onComplete,
    onThemePreview,
    embeddingPreviewState,
  }: {
    config: AppConfig;
    workspacePath: string;
    onSave: (config: AppConfig) => Promise<AppConfig>;
    onPickWorkspace: () => Promise<void>;
    onComplete: () => void;
    onThemePreview?: (theme: string) => void;
    embeddingPreviewState?: "ready" | "downloading";
  } = $props();

  let draft = $state<AppConfig>(
    normalizeConfigShape($state.snapshot(untrack(() => config)) as AppConfig),
  );
  const resourceOnly = Boolean(draft.onboarding_completed);
  let step = $state(resourceOnly ? 4 : 0);
  let selectedProviderId = $state(draft.providers[0]?.id ?? "");
  let connectionStatus = $state<"idle" | "loading" | "success" | "error">("idle");
  let connectionMessage = $state("");
  let manualModelName = $state("");
  let saving = $state(false);
  let saveError = $state("");
  type EmbeddingResourceStatus = {
    state: "ready" | "missing" | "corrupt";
    model_id: string;
    version: string;
    total_bytes: number;
  };
  type EmbeddingResourceProgress = {
    downloaded_bytes: number;
    total_bytes: number;
    current_file: string;
  };
  let embeddingStatus = $state<EmbeddingResourceStatus | null>(null);
  let embeddingProgress = $state<EmbeddingResourceProgress | null>(null);
  let embeddingPreparing = $state(false);
  let embeddingError = $state("");
  let embeddingReady = $derived(embeddingStatus?.state === "ready");
  let embeddingPercent = $derived(
    embeddingReady
      ? 100
      : embeddingProgress?.total_bytes
        ? Math.min(
            100,
            Math.round((embeddingProgress.downloaded_bytes / embeddingProgress.total_bytes) * 100),
          )
        : 0,
  );

  async function prepareEmbeddingResource() {
    embeddingPreparing = true;
    embeddingError = "";
    try {
      embeddingStatus = await desktopOpenAgent.invokeProduct("prepare_embedding_resource", {});
    } catch (error) {
      embeddingError = `${error}`;
      embeddingStatus = await desktopOpenAgent
        .invokeProduct("get_embedding_resource_status", {})
        .catch(() => embeddingStatus);
    } finally {
      embeddingPreparing = false;
    }
  }

  onMount(() => {
    if (!isTauri()) {
      embeddingStatus = {
        state: embeddingPreviewState === "downloading" ? "missing" : "ready",
        model_id: "all-MiniLM-L6-v2-q",
        version: "1",
        total_bytes: 23_695_490,
      };
      if (embeddingPreviewState === "downloading") {
        embeddingPreparing = true;
        embeddingProgress = {
          downloaded_bytes: 9_478_196,
          total_bytes: 23_695_490,
          current_file: "model_quantized.onnx",
        };
      }
      return;
    }

    let disposed = false;
    let stopListening: (() => void) | undefined;
    void (async () => {
      try {
        stopListening = await listen<EmbeddingResourceProgress>(
          "embedding-resource-progress",
          ({ payload }) => {
            if (!disposed) embeddingProgress = payload;
          },
        );
      } catch (error) {
        console.warn("Failed to listen for embedding resource progress:", error);
      }
      if (!disposed) await prepareEmbeddingResource();
    })();
    return () => {
      disposed = true;
      stopListening?.();
    };
  });

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
          brandTagline: "A calm place to build",
          welcomeTitle: "Welcome to OpenAgent",
          welcomeEyebrow: "Your workspace, with an agent",
          welcomeBody:
            "OpenAgent is a desktop AI agent that can understand projects, edit files, and carry out tasks in the workspace you choose.",
          setupBody:
            "This guide will set your preferences, connect a model service, and choose the models OpenAgent uses. You can change everything later in Settings.",
          welcomeFeatures: [
            {
              title: "Work in context",
              body: "OpenAgent stays grounded in the files and commands of your project.",
            },
            {
              title: "Keep momentum",
              body: "Describe a goal and let the agent plan, execute, and explain each step.",
            },
            {
              title: "Stay in control",
              body: "You choose the workspace and keep your credentials on this device.",
            },
          ],
          stepDescriptions: [
            "Tell us how you work",
            "Set your preferences",
            "Connect your AI service",
            "Pick your defaults",
            "Start building",
          ],
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
          openAiApiMode: "OpenAI API mode",
          responsesApi: "Responses",
          chatCompletionsApi: "Chat Completions",
          baseUrl: "Base URL (optional)",
          requestUrl: "Request URL",
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
          readyBody:
            "OpenAgent can start after its local semantic-memory model is installed and verified.",
          embeddingTitle: "Local embedding model",
          embeddingReady: "Installed and verified",
          embeddingPreparing: "Preparing in the background…",
          embeddingWaiting: "Waiting to start download",
          embeddingRetry: "Retry",
          back: "Back",
          next: "Continue",
          finish: "Start using OpenAgent",
          credentialNote: "Your model credentials stay on this device.",
          saveFailed: "Could not save settings",
        }
      : {
          steps: ["欢迎", "偏好", "模型服务", "默认模型", "完成"],
          stepProgress: "第 {current} 步，共 {total} 步",
          brandTagline: "专注创作的工作空间",
          welcomeTitle: "欢迎使用 OpenAgent",
          welcomeEyebrow: "让 Agent 在你的工作区工作",
          welcomeBody:
            "OpenAgent 是一款桌面 AI Agent，可以在你选择的工作区中理解项目、编辑文件并执行任务。",
          setupBody:
            "接下来将设置界面偏好、连接模型服务并选择 OpenAgent 使用的默认模型；这些配置之后都可以在设置中修改。",
          welcomeFeatures: [
            {
              title: "理解项目上下文",
              body: "OpenAgent 会围绕你项目中的文件和命令展开工作。",
            },
            {
              title: "保持工作节奏",
              body: "描述一个目标，让 Agent 规划、执行并解释每一步。",
            },
            {
              title: "始终由你掌控",
              body: "工作区由你选择，模型凭据也只保存在此设备。",
            },
          ],
          stepDescriptions: [
            "先了解你的工作方式",
            "设置界面偏好",
            "连接 AI 服务",
            "选择默认模型",
            "开始创作",
          ],
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
          openAiApiMode: "OpenAI 接口模式",
          responsesApi: "Responses",
          chatCompletionsApi: "Chat Completions",
          baseUrl: "服务地址（可选）",
          requestUrl: "请求地址",
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
          readyBody: "本地语义记忆模型安装并校验完成后，即可开始使用 OpenAgent。",
          embeddingTitle: "本地 Embedding 模型",
          embeddingReady: "已安装并通过校验",
          embeddingPreparing: "正在后台准备…",
          embeddingWaiting: "等待开始下载",
          embeddingRetry: "重试",
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
  let openAiApiModeOptions = $derived([
    { value: "responses", label: copy.responsesApi },
    { value: "chat_completions", label: copy.chatCompletionsApi },
  ]);
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
          : embeddingReady),
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

  function setOpenAiApiMode(value: string) {
    if (!selectedProvider || selectedProvider.provider !== "openai") return;
    selectedProvider.openai_api_mode = value === "chat_completions" ? value : "responses";
    resetConnection();
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
      const models = await desktopOpenAgent.invokeProduct("fetch_provider_models", {
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
      const currentResource = isTauri()
        ? await desktopOpenAgent.invokeProduct("get_embedding_resource_status", {})
        : embeddingStatus;
      if (currentResource?.state !== "ready") {
        throw new Error(embeddingError || copy.embeddingPreparing);
      }
      if (!resourceOnly) {
        await onSave({
          ...($state.snapshot(draft) as AppConfig),
          workspace: workspacePath,
          onboarding_completed: true,
        });
      }
      onComplete();
    } catch (error) {
      saveError = `${copy.saveFailed}: ${error}`;
    } finally {
      saving = false;
    }
  }
</script>

<div class="application-settings-scope onboarding-panel">
  <div class="onboarding-drag-region" data-tauri-drag-region aria-hidden="true"></div>
  <div class="onboarding-body">
    <aside class="onboarding-visual">
      <div class="onboarding-brand">
        <img class="onboarding-brand-icon" src="/app-icon.png" alt="" aria-hidden="true" />
        <div>
          <strong>OpenAgent</strong>
          <span>{copy.brandTagline}</span>
        </div>
      </div>
      <div class="onboarding-progress">
        <div class="progress-heading">
          <p>
            {copy.stepProgress
              .replace("{current}", String(step + 1))
              .replace("{total}", String(copy.steps.length))}
          </p>
          <span>{String(step + 1).padStart(2, "0")}</span>
        </div>
        <nav aria-label={draft.language === "en" ? "Setup steps" : "设置步骤"}>
          {#each copy.steps as label, index (index)}
            <div
              class="onboarding-step"
              class:active={index === step}
              class:complete={index < step}
            >
              <button
                class="onboarding-nav-item"
                aria-current={index === step ? "step" : undefined}
                aria-label={`${index + 1}. ${label}`}
                disabled={index > step}
                onclick={() => {
                  if (index < step) step = index;
                }}
              >
                <span aria-hidden="true">{index + 1}</span>
              </button>
              <div class="onboarding-step-copy">
                <strong>{label}</strong>
                {#if index === step}<small>{copy.stepDescriptions[index]}</small>{/if}
              </div>
            </div>
          {/each}
        </nav>
      </div>
      <p class="nav-note">{copy.credentialNote}</p>
    </aside>

    <main class="application-settings-surface step-content" aria-label={copy.steps[step]}>
      <div class="step-scroll" class:welcome-scroll={step === 0}>
        {#if step === 0}
          <p class="welcome-eyebrow">{copy.welcomeEyebrow}</p>
          <h1 class="welcome-title">{copy.welcomeTitle}</h1>
          <p class="lead">{copy.welcomeBody}</p>
          <p class="setup-description">{copy.setupBody}</p>
          <div class="welcome-features">
            {#each copy.welcomeFeatures as feature, index (feature.title)}
              <div class="welcome-feature">
                <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{feature.title}</strong>
                  <p>{feature.body}</p>
                </div>
              </div>
            {/each}
          </div>
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
                <small class="request-url-preview">
                  {copy.requestUrl}: {providerRequestUrl(selectedProvider)}
                </small>
              </label>
              {#if selectedProvider.provider === "openai"}
                <div class="api-mode-field">
                  <span>{copy.openAiApiMode}</span>
                  <SegmentedControl
                    value={selectedProvider.openai_api_mode}
                    items={openAiApiModeOptions}
                    ariaLabel={copy.openAiApiMode}
                    onValueChange={setOpenAiApiMode}
                  />
                </div>
              {/if}
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
          <div class="application-settings-surface embedding-card" aria-live="polite">
            <div class="embedding-heading">
              <span>{copy.embeddingTitle}</span>
              <strong>{embeddingReady ? copy.embeddingReady : `${embeddingPercent}%`}</strong>
            </div>
            <div
              class="embedding-meter"
              role="progressbar"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={embeddingPercent}
            >
              <span style={`width: ${embeddingPercent}%`}></span>
            </div>
            {#if !embeddingReady}
              <div class="embedding-detail">
                <p>
                  {embeddingPreparing ? copy.embeddingPreparing : copy.embeddingWaiting}
                  {#if embeddingProgress?.current_file}
                    · {embeddingProgress.current_file}
                  {/if}
                </p>
                {#if !embeddingPreparing}
                  <SettingsActionButton
                    label={copy.embeddingRetry}
                    onclick={() => void prepareEmbeddingResource()}
                  />
                {/if}
              </div>
            {/if}
            {#if embeddingError}<p class="error">{embeddingError}</p>{/if}
          </div>
          {#if saveError}<p class="error">{saveError}</p>{/if}
        {/if}
      </div>

      <footer>
        <SettingsActionButton
          label={copy.back}
          onclick={() => (step -= 1)}
          disabled={step === 0 || saving || resourceOnly}
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
            disabled={saving || !embeddingReady}
          />
        {/if}
      </footer>
    </main>
  </div>
</div>

<style>
  .onboarding-panel {
    position: relative;
    display: flex;
    height: 100vh;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    overflow: hidden;
    background: var(--app-chrome-bg);
    color: var(--text);
  }
  .onboarding-drag-region {
    position: absolute;
    z-index: 2;
    inset: 0 0 auto;
    height: 32px;
    -webkit-app-region: drag;
  }
  .onboarding-body {
    display: grid;
    grid-template-columns: 34% minmax(0, 66%);
    min-width: 0;
    min-height: 0;
    flex: 1;
    overflow: hidden;
    padding: 8px;
  }
  .onboarding-visual {
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    min-width: 0;
    padding: 42px 30px 24px;
    background: transparent;
  }
  .onboarding-brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .onboarding-brand-icon {
    display: block;
    width: 30px;
    height: 30px;
    border-radius: 9px;
    object-fit: cover;
  }
  .onboarding-brand div {
    display: grid;
    gap: 2px;
  }
  .onboarding-brand strong {
    font-size: 14px;
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .onboarding-brand span:not(.brand-mark) {
    color: var(--text-muted);
    font-size: 10px;
  }
  .onboarding-progress {
    width: 100%;
    margin: auto 0 0;
  }
  .progress-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 14px;
  }
  .progress-heading p {
    margin: 0;
    color: var(--text-muted);
    font-size: 11px;
    letter-spacing: 0.02em;
  }
  .progress-heading > span {
    color: var(--primary);
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.06em;
  }
  .onboarding-progress nav {
    display: grid;
    gap: 2px;
  }
  .onboarding-step {
    position: relative;
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    gap: 12px;
    align-items: start;
    min-height: 42px;
  }
  .onboarding-step:not(:last-child)::after {
    position: absolute;
    top: 28px;
    left: 13px;
    width: 2px;
    height: 16px;
    background: var(--mica-divider);
    content: "";
  }
  .onboarding-step.complete:not(:last-child)::after {
    background: color-mix(in srgb, var(--primary) 48%, var(--mica-divider));
  }
  .onboarding-nav-item {
    position: relative;
    z-index: 1;
    display: grid;
    align-items: center;
    justify-content: center;
    width: 28px;
    min-width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid var(--mica-divider);
    border-radius: 50%;
    background: var(--mica-surface);
    color: var(--text-muted);
    cursor: pointer;
    font: inherit;
    font-size: 11px;
  }
  .onboarding-nav-item:hover:not(:disabled) {
    background: var(--interactive-state-bg);
    color: var(--text);
  }
  .onboarding-step.active .onboarding-nav-item {
    background: var(--primary);
    border-color: var(--primary);
    color: #fff;
    font-weight: 600;
  }
  .onboarding-nav-item:disabled {
    cursor: default;
    opacity: 0.55;
  }
  .onboarding-step.complete .onboarding-nav-item {
    color: var(--primary);
  }
  .onboarding-step-copy {
    display: grid;
    gap: 3px;
    min-width: 0;
    padding-top: 3px;
  }
  .onboarding-step-copy strong {
    font-size: 13px;
    font-weight: 600;
  }
  .onboarding-step:not(.active) .onboarding-step-copy strong {
    color: var(--text-muted);
    font-weight: 400;
  }
  .onboarding-step-copy small {
    color: var(--text-muted);
    font-size: 10px;
    line-height: 1.45;
  }
  .nav-note {
    max-width: 210px;
    margin: 32px 0 0;
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
    padding: 28px 40px 20px;
  }
  .step-scroll.welcome-scroll {
    overflow-y: hidden;
    padding-bottom: 0;
  }
  .welcome-scroll .setup-description {
    margin-bottom: 14px;
  }
  .welcome-scroll .welcome-features {
    gap: 7px;
    margin-bottom: 10px;
  }
  h1 {
    margin: 0 0 10px;
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.035em;
    line-height: 1.16;
  }
  .welcome-eyebrow {
    margin: 0 0 9px;
    color: var(--primary);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .welcome-title {
    max-width: 430px;
    margin-bottom: 12px;
    font-size: 32px;
    letter-spacing: -0.045em;
    line-height: 1.1;
  }
  .lead {
    max-width: 520px;
    margin: 0 0 12px;
    color: var(--text-muted);
    font-size: 14px;
    line-height: 1.6;
  }
  .setup-description {
    max-width: 520px;
    margin: 0 0 22px;
    color: var(--text);
    font-size: 13px;
    line-height: 1.6;
  }
  .welcome-features {
    display: grid;
    gap: 10px;
    margin: 0 0 20px;
  }
  .welcome-feature {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    gap: 10px;
    align-items: start;
  }
  .welcome-feature > span {
    padding-top: 1px;
    color: var(--primary);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
  }
  .welcome-feature strong {
    display: block;
    margin-bottom: 2px;
    font-size: 12px;
    font-weight: 600;
  }
  .welcome-feature p {
    margin: 0;
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.45;
  }
  .workspace-card,
  .summary {
    padding: 14px;
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
    gap: 16px;
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
  .api-mode-field {
    display: grid;
    gap: 7px;
  }
  .form-grid label > span,
  .api-mode-field > span {
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 600;
  }
  .request-url-preview {
    overflow-wrap: anywhere;
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.45;
  }
  .provider-tabs {
    display: flex;
    gap: 6px;
    margin: -6px 0 16px;
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
  .embedding-card {
    display: grid;
    gap: 10px;
    margin-top: 14px;
    padding: 14px;
    border-radius: 8px;
    background: var(--mica-surface);
  }
  .embedding-heading,
  .embedding-detail {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .embedding-heading span,
  .embedding-detail p {
    margin: 0;
    color: var(--text-muted);
    font-size: 11px;
  }
  .embedding-heading strong {
    font-size: 12px;
  }
  .embedding-meter {
    height: 6px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--surface2);
  }
  .embedding-meter span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--accent);
    transition: width 160ms ease-out;
  }
  .embedding-card > .error {
    margin: 0;
    font-size: 11px;
    line-height: 1.45;
  }
  footer {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    flex: none;
    padding: 16px 38px 20px;
  }

  @media (max-width: 700px) {
    .onboarding-body {
      grid-template-columns: 1fr;
      padding: 4px;
      overflow-y: auto;
    }
    .onboarding-visual {
      padding: 36px 24px 0;
    }
    .onboarding-progress {
      margin-top: 24px;
    }
    .onboarding-progress nav {
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 8px;
    }
    .onboarding-step {
      display: flex;
      min-height: 0;
      flex-direction: column;
      align-items: center;
      gap: 5px;
      text-align: center;
    }
    .onboarding-step::after {
      display: none;
    }
    .onboarding-step-copy {
      padding-top: 0;
    }
    .onboarding-step-copy strong {
      overflow: hidden;
      max-width: 100%;
      font-size: 10px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .onboarding-step-copy small {
      display: none;
    }
    .nav-note {
      max-width: none;
      margin: 18px 0 12px;
    }
    .step-content {
      margin-block: 4px;
    }
    .step-scroll {
      padding: 24px 24px 20px;
    }
    footer {
      padding: 14px 24px 16px;
    }
  }

  @media (max-width: 520px) {
    .onboarding-brand span:not(.brand-mark),
    .onboarding-step-copy {
      display: none;
    }
    .onboarding-visual {
      padding-inline: 18px;
    }
    .onboarding-progress {
      margin-top: 18px;
    }
    .onboarding-step {
      display: grid;
      place-items: center;
    }
    .welcome-title {
      font-size: 28px;
    }
    .two {
      grid-template-columns: 1fr;
    }
    footer,
    .workspace-card,
    .connection-row {
      align-items: stretch;
    }
    footer {
      gap: 8px;
    }
    footer :global(.settings-action) {
      flex: 1;
    }
  }
</style>
