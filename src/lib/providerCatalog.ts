import type { ProviderType } from "$lib/types";

export type ProviderGroup = "closed" | "compatible" | "local" | "auth";

export interface ProviderCatalogEntry {
  value: ProviderType;
  label: string;
  group: ProviderGroup;
  defaultBaseUrl: string;
  requiresApiKey: boolean;
  badge: string;
}

export const PROVIDER_CATALOG: readonly ProviderCatalogEntry[] = [
  {
    value: "anthropic",
    label: "Anthropic Claude",
    group: "closed",
    defaultBaseUrl: "https://api.anthropic.com",
    requiresApiKey: true,
    badge: "A",
  },
  {
    value: "openai",
    label: "OpenAI",
    group: "closed",
    defaultBaseUrl: "https://api.openai.com/v1",
    requiresApiKey: true,
    badge: "O",
  },
  {
    value: "azure",
    label: "Azure OpenAI",
    group: "closed",
    defaultBaseUrl: "",
    requiresApiKey: true,
    badge: "Az",
  },
  {
    value: "gemini",
    label: "Google Gemini",
    group: "closed",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    requiresApiKey: true,
    badge: "G",
  },
  {
    value: "mistral",
    label: "Mistral AI",
    group: "closed",
    defaultBaseUrl: "https://api.mistral.ai",
    requiresApiKey: true,
    badge: "M",
  },
  {
    value: "cohere",
    label: "Cohere",
    group: "closed",
    defaultBaseUrl: "https://api.cohere.ai",
    requiresApiKey: true,
    badge: "C",
  },
  {
    value: "xai",
    label: "xAI (Grok)",
    group: "closed",
    defaultBaseUrl: "https://api.x.ai",
    requiresApiKey: true,
    badge: "x",
  },
  {
    value: "perplexity",
    label: "Perplexity",
    group: "closed",
    defaultBaseUrl: "https://api.perplexity.ai",
    requiresApiKey: true,
    badge: "P",
  },
  {
    value: "deepseek",
    label: "DeepSeek",
    group: "closed",
    defaultBaseUrl: "https://api.deepseek.com",
    requiresApiKey: true,
    badge: "D",
  },
  {
    value: "groq",
    label: "Groq",
    group: "compatible",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    requiresApiKey: true,
    badge: "Gr",
  },
  {
    value: "together",
    label: "Together AI",
    group: "compatible",
    defaultBaseUrl: "https://api.together.xyz",
    requiresApiKey: true,
    badge: "T",
  },
  {
    value: "openrouter",
    label: "OpenRouter",
    group: "compatible",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    requiresApiKey: true,
    badge: "OR",
  },
  {
    value: "hyperbolic",
    label: "Hyperbolic",
    group: "compatible",
    defaultBaseUrl: "https://api.hyperbolic.xyz",
    requiresApiKey: true,
    badge: "H",
  },
  {
    value: "moonshot",
    label: "Moonshot (Kimi)",
    group: "compatible",
    defaultBaseUrl: "https://api.moonshot.ai/v1",
    requiresApiKey: true,
    badge: "K",
  },
  {
    value: "minimax",
    label: "MiniMax",
    group: "compatible",
    defaultBaseUrl: "https://api.minimax.io/v1",
    requiresApiKey: true,
    badge: "MM",
  },
  {
    value: "zai",
    label: "Z.ai (GLM)",
    group: "compatible",
    defaultBaseUrl: "https://api.z.ai/api/paas/v4",
    requiresApiKey: true,
    badge: "Z",
  },
  {
    value: "xiaomimimo",
    label: "Xiaomi MiMo",
    group: "compatible",
    defaultBaseUrl: "https://api.xiaomimimo.com/v1",
    requiresApiKey: true,
    badge: "Mi",
  },
  {
    value: "mira",
    label: "Mira",
    group: "compatible",
    defaultBaseUrl: "https://api.mira.network",
    requiresApiKey: true,
    badge: "Mr",
  },
  {
    value: "doubleword",
    label: "Doubleword",
    group: "compatible",
    defaultBaseUrl: "https://api.doubleword.ai/v1",
    requiresApiKey: true,
    badge: "Dw",
  },
  {
    value: "ollama",
    label: "Ollama",
    group: "local",
    defaultBaseUrl: "http://localhost:11434",
    requiresApiKey: false,
    badge: "Ol",
  },
  {
    value: "llamafile",
    label: "Llamafile",
    group: "local",
    defaultBaseUrl: "http://localhost:8080",
    requiresApiKey: false,
    badge: "Lf",
  },
  {
    value: "huggingface",
    label: "Hugging Face Inference",
    group: "local",
    defaultBaseUrl: "https://router.huggingface.co",
    requiresApiKey: true,
    badge: "HF",
  },
  {
    value: "chatgpt",
    label: "ChatGPT / Codex OAuth",
    group: "auth",
    defaultBaseUrl: "https://chatgpt.com/backend-api/codex",
    requiresApiKey: false,
    badge: "CG",
  },
] as const;

const PROVIDER_ICON_FILES: Record<ProviderType, string> = {
  anthropic: "anthropic.svg",
  openai: "openai.svg",
  azure: "azureai.svg",
  gemini: "google.svg",
  mistral: "mistral.svg",
  cohere: "cohere.svg",
  xai: "grok.svg",
  perplexity: "perplexity.svg",
  deepseek: "deepseek.svg",
  groq: "groq.svg",
  together: "together.svg",
  openrouter: "openrouter.svg",
  hyperbolic: "hyperbolic.svg",
  moonshot: "moonshot.svg",
  minimax: "minimax.svg",
  zai: "z-ai.svg",
  xiaomimimo: "xiaomimimo.svg",
  mira: "mira.png",
  doubleword: "doubleword.png",
  ollama: "ollama.svg",
  llamafile: "llamafile.png",
  huggingface: "huggingface.svg",
  chatgpt: "openai.svg",
};

export function providerCatalogEntry(provider: ProviderType): ProviderCatalogEntry {
  return PROVIDER_CATALOG.find((entry) => entry.value === provider) ?? PROVIDER_CATALOG[1];
}

export function providerDefaultBaseUrl(provider: ProviderType): string {
  return providerCatalogEntry(provider).defaultBaseUrl;
}

export function providerRequiresApiKey(provider: ProviderType): boolean {
  return providerCatalogEntry(provider).requiresApiKey;
}

export function providerIconPath(provider: ProviderType): string {
  return `/assets/providers/${PROVIDER_ICON_FILES[provider]}`;
}
