<script lang="ts">
  import { untrack } from "svelte";
  import { invoke } from "$lib/openagent/tauriClient";
  import { normalizeConfigShape } from "$lib/config";
  import type { AppConfig, DefaultModelBinding, ProviderConfig } from "$lib/types";

  let {
    config,
    workspacePath,
    onSave,
    onPickWorkspace,
    onComplete,
  }: {
    config: AppConfig;
    workspacePath: string;
    onSave: (config: AppConfig) => Promise<void>;
    onPickWorkspace: () => Promise<void>;
    onComplete: () => void;
  } = $props();

  let draft = $state<AppConfig>(
    normalizeConfigShape($state.snapshot(untrack(() => config)) as AppConfig),
  );
  let step = $state(0);
  let selectedProviderId = $state(draft.providers[0]?.id ?? "");
  let connectionStatus = $state<"idle" | "loading" | "success" | "error">("idle");
  let connectionMessage = $state("");
  let saving = $state(false);
  let saveError = $state("");

  $effect(() => {
    const theme = draft.theme;
    document.documentElement.classList.remove("dark", "light");
    const resolved = theme === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : theme;
    document.documentElement.classList.add(resolved);
  });

  const copy = $derived(draft.language === "en" ? {
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
    providerBody: "Add an OpenAI-compatible or Anthropic endpoint, then verify the connection and load its models.",
    addProvider: "Add service",
    providerName: "Service name",
    providerType: "Service type",
    baseUrl: "Base URL (optional)",
    apiKey: "API key",
    verify: "Verify and load models",
    verifying: "Connecting…",
    modelsLoaded: "Connection succeeded. {count} models loaded.",
    defaultTitle: "Choose default models",
    defaultBody: "The chat model handles conversations. The flash model handles lightweight background tasks.",
    chatModel: "Chat model",
    flashModel: "Flash model",
    readyTitle: "You’re ready",
    readyBody: "OpenAgent is configured. Start a conversation and give it a real task.",
    back: "Back",
    next: "Continue",
    finish: "Start using OpenAgent",
    saveFailed: "Could not save settings",
  } : {
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
    providerBody: "添加 OpenAI 兼容或 Anthropic 服务，验证连接并获取可用模型。",
    addProvider: "添加服务",
    providerName: "服务名称",
    providerType: "服务类型",
    baseUrl: "服务地址（可选）",
    apiKey: "API Key",
    verify: "验证连接并获取模型",
    verifying: "正在连接…",
    modelsLoaded: "连接成功，已获取 {count} 个模型。",
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
  });

  let selectedProvider = $derived(
    draft.providers.find((provider) => provider.id === selectedProviderId) ?? null,
  );
  let modelBindings = $derived.by(() =>
    draft.providers
      .filter((provider) => provider.enabled)
      .flatMap((provider) => provider.models.map((model) => ({
        value: JSON.stringify([provider.id, model]),
        label: `${model} · ${provider.name}`,
        binding: { provider_id: provider.id, model } satisfies DefaultModelBinding,
      }))),
  );
  let canContinue = $derived(
    step < 2
      || (step === 2
        ? Boolean(selectedProvider?.enabled && selectedProvider.models.length)
        : step === 3
          ? modelBindings.some((option) => option.value === bindingValue(draft.defaults.chat_model))
            && modelBindings.some((option) => option.value === bindingValue(draft.defaults.flash_model))
          : true),
  );

  function addProvider() {
    const provider: ProviderConfig = {
      id: crypto.randomUUID(),
      name: "OpenAI Compatible",
      provider: "openai",
      api_key: "",
      base_url: "",
      enabled: false,
      models: [],
      model_context_compaction_thresholds: {},
    };
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
    if (!selectedProvider || !selectedProvider.api_key.trim()) return;
    connectionStatus = "loading";
    connectionMessage = "";
    try {
      const models = await invoke<string[]>("fetch_provider_models", {
        request: { provider: $state.snapshot(selectedProvider) },
      });
      const normalized = Array.from(new Set(models.map((model) => model.trim()).filter(Boolean))).sort();
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

  function setModel(kind: "chat_model" | "flash_model", value: string) {
    const item = modelBindings.find((option) => option.value === value);
    if (item) draft.defaults[kind] = item.binding;
  }

  function bindingValue(binding: DefaultModelBinding) {
    return binding.model ? JSON.stringify([binding.provider_id, binding.model]) : "";
  }

  function bindingAvailable(binding: DefaultModelBinding) {
    return draft.providers.some((provider) =>
      provider.enabled
      && provider.id === binding.provider_id
      && provider.models.includes(binding.model)
    );
  }

  async function finish() {
    saving = true;
    saveError = "";
    try {
      await onSave($state.snapshot(draft) as AppConfig);
      onComplete();
    } catch (error) {
      saveError = `${copy.saveFailed}: ${error}`;
    } finally {
      saving = false;
    }
  }
</script>

<div class="onboarding-shell">
  <div class="aurora" aria-hidden="true"></div>
  <main class="onboarding-card" aria-label={copy.steps[step]}>
    <aside class="step-rail">
      <div class="brand">
        <span class="brand-mark">O</span>
        <strong>OpenAgent</strong>
      </div>
      <ol>
        {#each copy.steps as label, index}
          <li class:active={index === step} class:complete={index < step}>
            <span>{index < step ? "✓" : index + 1}</span>
            <p>{label}</p>
          </li>
        {/each}
      </ol>
      <p class="privacy">API Key 仅保存在本机配置中<br />Keys stay on this device</p>
    </aside>

    <section class="step-content">
      {#if step === 0}
        <div class="hero-icon">✦</div>
        <p class="eyebrow">OPENAGENT</p>
        <h1>{copy.welcomeTitle}</h1>
        <p class="lead">{copy.welcomeBody}</p>
        <div class="workspace-card">
          <div>
            <span>{copy.workspace}</span>
            <strong>{workspacePath || copy.noWorkspace}</strong>
          </div>
          <button class="secondary" onclick={() => void onPickWorkspace()}>{copy.chooseWorkspace}</button>
        </div>
      {:else if step === 1}
        <p class="eyebrow">01 · PREFERENCES</p>
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
        <p class="eyebrow">02 · PROVIDER</p>
        <h1>{copy.providerTitle}</h1>
        <p class="lead">{copy.providerBody}</p>
        <div class="provider-tabs">
          {#each draft.providers as provider}
            <button class:active={provider.id === selectedProviderId} onclick={() => selectedProviderId = provider.id}>
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
                  <option value="openai">OpenAI Compatible</option>
                  <option value="anthropic">Anthropic</option>
                </select>
              </label>
            </div>
            <label>
              <span>{copy.baseUrl}</span>
              <input bind:value={selectedProvider.base_url} oninput={resetConnection} placeholder={selectedProvider.provider === "openai" ? "https://api.openai.com/v1" : "https://api.anthropic.com"} />
            </label>
            <label>
              <span>{copy.apiKey}</span>
              <input type="password" bind:value={selectedProvider.api_key} oninput={resetConnection} placeholder="••••••••••••••••" />
            </label>
            <div class="connection-row">
              <button class="verify" onclick={verifyProvider} disabled={!selectedProvider.api_key.trim() || connectionStatus === "loading"}>
                {connectionStatus === "loading" ? copy.verifying : copy.verify}
              </button>
              {#if connectionMessage}<p class:success={connectionStatus === "success"} class:error={connectionStatus === "error"}>{connectionMessage}</p>{/if}
            </div>
          </div>
        {/if}
      {:else if step === 3}
        <p class="eyebrow">03 · MODELS</p>
        <h1>{copy.defaultTitle}</h1>
        <p class="lead">{copy.defaultBody}</p>
        <div class="form-grid">
          <label>
            <span>{copy.chatModel}</span>
            <select value={bindingValue(draft.defaults.chat_model)} onchange={(event) => setModel("chat_model", event.currentTarget.value)}>
              {#each modelBindings as option}<option value={option.value}>{option.label}</option>{/each}
            </select>
          </label>
          <label>
            <span>{copy.flashModel}</span>
            <select value={bindingValue(draft.defaults.flash_model)} onchange={(event) => setModel("flash_model", event.currentTarget.value)}>
              {#each modelBindings as option}<option value={option.value}>{option.label}</option>{/each}
            </select>
          </label>
        </div>
      {:else}
        <div class="hero-icon ready">✓</div>
        <p class="eyebrow">ALL SET</p>
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
        <button class="secondary" onclick={() => step -= 1} disabled={step === 0 || saving}>{copy.back}</button>
        {#if step < 4}
          <button class="primary" onclick={() => step += 1} disabled={!canContinue}>{copy.next}<span>→</span></button>
        {:else}
          <button class="primary" onclick={finish} disabled={saving}>{saving ? "…" : copy.finish}<span>→</span></button>
        {/if}
      </footer>
    </section>
  </main>
</div>

<style>
  .onboarding-shell { position: relative; display: grid; place-items: center; min-height: 100vh; overflow: hidden; padding: 32px; box-sizing: border-box; background: var(--bg); color: var(--text); }
  .aurora { position: absolute; inset: -30%; background: radial-gradient(circle at 25% 25%, color-mix(in srgb, var(--primary) 18%, transparent), transparent 28%), radial-gradient(circle at 80% 75%, color-mix(in srgb, #7c3aed 12%, transparent), transparent 30%); filter: blur(24px); pointer-events: none; }
  .onboarding-card { position: relative; display: grid; grid-template-columns: 230px minmax(0, 650px); width: min(880px, 100%); min-height: 590px; overflow: hidden; border: 1px solid var(--border); border-radius: 20px; background: var(--surface); box-shadow: 0 28px 80px color-mix(in srgb, #000 18%, transparent); }
  .step-rail { display: flex; flex-direction: column; padding: 28px 24px; border-right: 1px solid var(--border); background: color-mix(in srgb, var(--surface2) 60%, var(--surface)); }
  .brand { display: flex; align-items: center; gap: 10px; font-size: 15px; }.brand-mark { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 9px; background: var(--primary); color: white; font-weight: 800; }
  ol { display: grid; gap: 2px; margin: 46px 0 0; padding: 0; list-style: none; } li { display: flex; align-items: center; gap: 11px; min-height: 42px; color: var(--text-muted); } li > span { display: grid; place-items: center; width: 24px; height: 24px; flex: none; border: 1px solid var(--border); border-radius: 50%; font-size: 11px; } li p { margin: 0; font-size: 12px; font-weight: 600; } li.active { color: var(--text); } li.active > span { border-color: var(--primary); background: var(--primary); color: white; } li.complete > span { border-color: color-mix(in srgb, var(--primary) 50%, var(--border)); color: var(--primary); }
  .privacy { margin: auto 0 0; color: var(--text-muted); font-size: 10px; line-height: 1.6; }
  .step-content { display: flex; flex-direction: column; padding: 64px 64px 34px; min-width: 0; } h1 { margin: 8px 0 12px; font-size: 30px; letter-spacing: -.035em; } .eyebrow { margin: 0; color: var(--primary); font-size: 10px; font-weight: 800; letter-spacing: .16em; }.lead { max-width: 540px; margin: 0 0 34px; color: var(--text-muted); font-size: 14px; line-height: 1.65; }
  .hero-icon { display: grid; place-items: center; width: 58px; height: 58px; margin-bottom: 18px; border: 1px solid color-mix(in srgb, var(--primary) 35%, var(--border)); border-radius: 18px; background: color-mix(in srgb, var(--primary) 10%, var(--surface)); color: var(--primary); font-size: 25px; }.hero-icon.ready { border-radius: 50%; background: var(--primary); color: white; }
  .workspace-card, .summary { padding: 17px 18px; border: 1px solid var(--border); border-radius: 12px; background: var(--bg); }.workspace-card { display: flex; align-items: center; justify-content: space-between; gap: 18px; }.workspace-card div { display: grid; min-width: 0; gap: 5px; }.workspace-card span, .summary span { color: var(--text-muted); font-size: 11px; }.workspace-card strong { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
  .form-grid { display: grid; gap: 18px; }.two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }.form-grid label { display: grid; gap: 7px; }.form-grid label > span { color: var(--text-muted); font-size: 11px; font-weight: 600; } input, select { box-sizing: border-box; width: 100%; height: 39px; padding: 0 11px; border: 1px solid var(--border); border-radius: 8px; outline: none; background: var(--bg); color: var(--text); font: inherit; font-size: 12px; } input:focus, select:focus { border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 12%, transparent); }
  .provider-tabs { display: flex; gap: 6px; margin: -12px 0 20px; overflow-x: auto; }.provider-tabs button { display: flex; align-items: center; gap: 7px; white-space: nowrap; }.provider-tabs button.active { border-color: var(--primary); color: var(--primary); }.provider-tabs .add { border-style: dashed; }.provider-tabs span { width: 6px; height: 6px; border-radius: 50%; background: var(--text-muted); }.provider-tabs span.online { background: #22a06b; }
  button { min-height: 36px; padding: 0 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); cursor: pointer; font: inherit; font-size: 12px; font-weight: 600; } button:hover:not(:disabled) { border-color: var(--primary); } button:disabled { cursor: default; opacity: .45; }.primary { display: flex; align-items: center; gap: 18px; border-color: var(--primary); background: var(--primary); color: white; }.primary span { font-size: 16px; }.secondary { background: transparent; }.verify { border-color: color-mix(in srgb, var(--primary) 50%, var(--border)); color: var(--primary); }
  .connection-row { display: flex; align-items: center; gap: 12px; }.connection-row p { margin: 0; color: var(--text-muted); font-size: 11px; }.success { color: #16865f !important; }.error { color: #d14343 !important; }
  .summary { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 11px 18px; }.summary strong { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
  footer { display: flex; justify-content: space-between; gap: 12px; margin-top: auto; padding-top: 30px; }
  @media (max-width: 720px) { .onboarding-shell { padding: 0; }.onboarding-card { grid-template-columns: 1fr; min-height: 100vh; border: 0; border-radius: 0; }.step-rail { padding: 18px 22px; border: 0; border-bottom: 1px solid var(--border); }.step-rail ol { display: flex; justify-content: center; margin: 16px 0 0; }.step-rail li p, .privacy { display: none; }.step-content { padding: 36px 24px 24px; }.two { grid-template-columns: 1fr; } }
</style>
