import type { AgentPluginI18n } from "@openagent/client/types";

export type { AgentPluginI18n };

// RFC 5646 language tags, normalized case-insensitively at every package boundary.
const LANGUAGE_TAG =
  /^(?:(?:[a-z]{2,3}(?:-[a-z]{3}){0,3}|[a-z]{4}|[a-z]{5,8})(?:-[a-z]{4})?(?:-[a-z]{2}|-\d{3})?(?:-(?:[a-z0-9]{5,8}|\d[a-z0-9]{3}))*(?:-[0-9a-wy-z](?:-[a-z0-9]{2,8})+)*(?:-x(?:-[a-z0-9]{1,8})+)?|x(?:-[a-z0-9]{1,8})+)$/i;
const GRANDFATHERED = new Set(
  "art-lojban cel-gaulish en-gb-oed i-ami i-bnn i-default i-enochian i-hak i-klingon i-lux i-mingo i-navajo i-pwn i-tao i-tay i-tsu no-bok no-nyn sgn-be-fr sgn-be-nl sgn-ch-de zh-guoyu zh-hakka zh-min zh-min-nan zh-xiang".split(
    " ",
  ),
);
const UTF8 = new TextEncoder();
const METADATA_TRANSLATION_KEYS = new Set(["display_name", "description"]);
const COMPONENT_TRANSLATION_KEY =
  /^(commands\.[a-z0-9.-]+\.(label|description)|sidebar\.[a-z0-9.-]+\.title)$/;
const LANGUAGE_NAMES = new Map<string, Intl.DisplayNames | null>();

export function normalizePluginLocale(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 128 ||
    (!LANGUAGE_TAG.test(value) && !GRANDFATHERED.has(value.toLowerCase()))
  )
    throw new Error("invalid BCP 47 locale");
  const tag = value.toLowerCase();
  const seen = new Set<string>();
  let extension = false;
  for (const part of tag.split("-").slice(1)) {
    if (part === "x") break;
    if (part.length === 1 || (!extension && (part.length >= 5 || /^\d.{3}$/.test(part)))) {
      if (seen.has(part)) throw new Error("duplicate locale subtag");
      seen.add(part);
    }
    if (part.length === 1) extension = true;
  }
  return tag;
}

export function parsePluginI18n(
  value: unknown,
  requiredKeys = ["display_name"],
): AgentPluginI18n | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid plugin i18n");
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (key) => !["supported_locales", "default_locale", "translations"].includes(key),
    ) ||
    !Array.isArray(input.supported_locales) ||
    input.supported_locales.length < 1 ||
    input.supported_locales.length > 32
  )
    throw new Error("invalid supported locales");
  const supported_locales = input.supported_locales.map(normalizePluginLocale);
  const default_locale = normalizePluginLocale(input.default_locale);
  if (
    new Set(supported_locales).size !== supported_locales.length ||
    !supported_locales.includes(default_locale)
  )
    throw new Error("duplicate locale or unsupported default");
  if (
    !input.translations ||
    typeof input.translations !== "object" ||
    Array.isArray(input.translations)
  )
    throw new Error("invalid plugin translations");
  const translations: Record<string, Record<string, string>> = Object.create(null);
  let keys: string | undefined;
  let parameters: string | undefined;
  for (const [rawTag, messages] of Object.entries(input.translations)) {
    const tag = normalizePluginLocale(rawTag);
    if (
      !supported_locales.includes(tag) ||
      Object.hasOwn(translations, tag) ||
      !messages ||
      typeof messages !== "object" ||
      Array.isArray(messages)
    )
      throw new Error("invalid translation locale");
    const entries = Object.entries(messages);
    const current = entries.map(([key]) => key).sort();
    const currentKeys = new Set(current);
    if (
      entries.length > 256 ||
      requiredKeys.some((key) => !currentKeys.has(key)) ||
      entries.some(
        ([key, text]) =>
          (!METADATA_TRANSLATION_KEYS.has(key) &&
            !COMPONENT_TRANSLATION_KEY.test(key) &&
            !(key.startsWith("notice.") && key.length > 7 && UTF8.encode(key).byteLength <= 128)) ||
          typeof text !== "string" ||
          !text.trim() ||
          UTF8.encode(text).byteLength > 4096,
      ) ||
      (keys !== undefined && keys !== JSON.stringify(current))
    )
      throw new Error("incomplete plugin translations");
    keys = JSON.stringify(current);
    const currentParameters = JSON.stringify(
      current.map((key) => [
        key,
        [...String((messages as Record<string, unknown>)[key]).matchAll(/\{([A-Za-z0-9_]+)\}/g)]
          .map((match) => match[1])
          .sort(),
      ]),
    );
    if (parameters !== undefined && parameters !== currentParameters)
      throw new Error("translation placeholders must match");
    parameters = currentParameters;
    translations[tag] = Object.fromEntries(entries) as Record<string, string>;
  }
  if (Object.keys(translations).length !== supported_locales.length)
    throw new Error("missing translation locale");
  return { supported_locales, default_locale, translations };
}

export function pluginDisplayLocale(i18n: AgentPluginI18n, requested: string): string {
  const tag = requested.toLowerCase();
  const base = tag.split("-")[0];
  return (
    i18n.supported_locales.find((value) => value === tag) ??
    i18n.supported_locales.find((value) => value === base) ??
    i18n.default_locale
  );
}
export function pluginText(
  i18n: AgentPluginI18n | null | undefined,
  requested: string,
  key: string,
  fallback: string,
): string {
  return i18n?.translations[pluginDisplayLocale(i18n, requested)]?.[key] ?? fallback;
}
export function pluginLocaleFallback(
  i18n: AgentPluginI18n | null | undefined,
  requested: string,
): string | null {
  if (!i18n) return null;
  const tag = requested.toLowerCase();
  const base = tag.split("-")[0];
  return i18n.supported_locales.includes(tag) || i18n.supported_locales.includes(base)
    ? null
    : pluginDisplayLocale(i18n, requested);
}
export function pluginLanguageName(tag: string): string {
  if (tag === "zh") return "中文";
  if (tag === "en") return "English";
  const key = tag.toLowerCase();
  if (!LANGUAGE_NAMES.has(key)) {
    try {
      LANGUAGE_NAMES.set(key, new Intl.DisplayNames([tag], { type: "language" }));
    } catch {
      LANGUAGE_NAMES.set(key, null);
    }
  }
  try {
    return LANGUAGE_NAMES.get(key)?.of(tag) ?? tag;
  } catch {
    return tag;
  }
}

export function pluginCommandText(
  spec: { name: string; plugin_i18n?: AgentPluginI18n | null },
  requested: string,
  field: "label" | "description",
  fallback: string,
): string {
  return pluginText(
    spec.plugin_i18n,
    requested,
    `commands.${spec.name.split(":").at(-1)}.${field}`,
    fallback,
  );
}
