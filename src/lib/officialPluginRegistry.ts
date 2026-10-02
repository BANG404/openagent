/**
 * Official Agent Plugin registry.
 *
 * The registry is deliberately a small data contract. It contains download
 * addresses and integrity metadata, while package validation and process
 * policy remain owned by the Runtime's marketplace installer.
 */

import bundledRegistry from "./officialPluginRegistry.json";

export const OFFICIAL_PLUGIN_REGISTRY_SCHEMA =
  "https://openagent.dev/schemas/plugin-registry/v1" as const;

const PLUGIN_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/i;
const MAX_REGISTRY_ENTRIES = 256;

export interface OfficialPluginRegistryEntry {
  id: string;
  displayName: string;
  description?: string;
  repository: string;
  homepage?: string;
  sourceUrl: string;
  version?: string;
  sha256?: string;
}

export interface OfficialPluginRegistry {
  schemaVersion: 1;
  generatedAt?: string;
  plugins: OfficialPluginRegistryEntry[];
}

export interface OfficialMarketplaceDocument {
  name: "openagent-official";
  interface: { displayName: "OpenAgent Official Plugins" };
  plugins: Array<{
    name: string;
    interface: { displayName: string };
    source: { source: "url"; url: string };
    policy: {
      installation: "AVAILABLE";
      authentication: "ON_INSTALL";
      products: ["CODEX"];
    };
  }>;
}

export const OFFICIAL_PLUGIN_REGISTRY_MAX_BYTES = 2 * 1024 * 1024;
export const OFFICIAL_PLUGIN_REGISTRY_TIMEOUT_MS = 8_000;

export type OfficialPluginRegistryFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

/** The reviewed catalog shipped with this OpenAgent build. */
export const BUNDLED_OFFICIAL_PLUGIN_REGISTRY = parseOfficialPluginRegistry(bundledRegistry);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string, entryId?: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    const suffix = entryId ? ` for '${entryId}'` : "";
    throw new Error(`official plugin registry requires a non-empty '${field}'${suffix}`);
  }
  return value.trim();
}

function optionalString(value: unknown, field: string, entryId: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  return requiredString(value, field, entryId);
}

function validateHttpsUrl(value: string, field: string, entryId: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`official plugin '${entryId}' has an invalid ${field} URL`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) {
    throw new Error(
      `official plugin '${entryId}' ${field} must use HTTPS without credentials or fragments`,
    );
  }
  return parsed.href;
}

function parseEntry(value: unknown, index: number): OfficialPluginRegistryEntry {
  if (!isRecord(value)) {
    throw new Error(`official plugin registry entry ${index} must be an object`);
  }
  const id = requiredString(value.id, "id");
  if (!PLUGIN_ID_PATTERN.test(id)) {
    throw new Error(`official plugin registry entry '${id}' has an invalid id`);
  }
  const displayName = requiredString(value.display_name ?? value.displayName, "display_name", id);
  const repository = validateHttpsUrl(
    requiredString(value.repository, "repository", id),
    "repository",
    id,
  );
  const sourceUrl = validateHttpsUrl(
    requiredString(value.source_url ?? value.sourceUrl, "source_url", id),
    "source_url",
    id,
  );
  const homepageValue = optionalString(value.homepage, "homepage", id);
  const sha256 = optionalString(value.sha256, "sha256", id);
  if (sha256 && !SHA256_PATTERN.test(sha256)) {
    throw new Error(`official plugin '${id}' has an invalid sha256 digest`);
  }
  return {
    id,
    displayName,
    description: optionalString(value.description, "description", id),
    repository,
    homepage: homepageValue ? validateHttpsUrl(homepageValue, "homepage", id) : undefined,
    sourceUrl,
    version: optionalString(value.version, "version", id),
    sha256: sha256?.toLowerCase(),
  };
}

/** Parse and validate untrusted registry JSON before it reaches the installer. */
export function parseOfficialPluginRegistry(input: unknown): OfficialPluginRegistry {
  if (!isRecord(input)) throw new Error("official plugin registry root must be an object");
  const schemaVersion = input.schema_version ?? input.schemaVersion;
  if (schemaVersion !== 1) {
    throw new Error("official plugin registry schema_version must be 1");
  }
  if (!Array.isArray(input.plugins)) {
    throw new Error("official plugin registry requires a plugins array");
  }
  if (input.plugins.length > MAX_REGISTRY_ENTRIES) {
    throw new Error(`official plugin registry contains more than ${MAX_REGISTRY_ENTRIES} entries`);
  }
  const plugins = input.plugins.map(parseEntry);
  const ids = new Set<string>();
  for (const plugin of plugins) {
    if (!ids.add(plugin.id)) throw new Error(`official plugin registry duplicates '${plugin.id}'`);
  }
  const generatedAt = optionalString(
    input.generated_at ?? input.generatedAt,
    "generated_at",
    "registry",
  );
  if (generatedAt && Number.isNaN(Date.parse(generatedAt))) {
    throw new Error("official plugin registry generated_at must be an ISO date");
  }
  return { schemaVersion: 1, generatedAt, plugins };
}

export function findOfficialPlugin(
  registry: OfficialPluginRegistry,
  id: string,
): OfficialPluginRegistryEntry | undefined {
  return registry.plugins.find((plugin) => plugin.id === id);
}

/**
 * Fetch a registry document over HTTPS. No GitHub headers or user credentials
 * are attached; the endpoint is a public catalog and may be served by a CDN.
 */
export async function fetchOfficialPluginRegistry(
  url: string,
  options: {
    fetchImpl?: OfficialPluginRegistryFetcher;
    timeoutMs?: number;
  } = {},
): Promise<OfficialPluginRegistry> {
  const endpoint = validateHttpsUrl(url, "registry", "registry");
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? OFFICIAL_PLUGIN_REGISTRY_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(endpoint, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`official plugin registry returned HTTP ${response.status}`);
    const length = response.headers.get("content-length");
    if (length && Number(length) > OFFICIAL_PLUGIN_REGISTRY_MAX_BYTES) {
      throw new Error("official plugin registry exceeds the 2 MiB limit");
    }
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > OFFICIAL_PLUGIN_REGISTRY_MAX_BYTES) {
      throw new Error("official plugin registry exceeds the 2 MiB limit");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("official plugin registry returned invalid JSON");
    }
    return parseOfficialPluginRegistry(parsed);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Convert the registry into the existing marketplace shape. The Runtime still
 * validates the downloaded package and owns installation permissions.
 */
export function toOfficialMarketplaceDocument(
  registry: OfficialPluginRegistry,
): OfficialMarketplaceDocument {
  return {
    name: "openagent-official",
    interface: { displayName: "OpenAgent Official Plugins" },
    plugins: registry.plugins.map((plugin) => ({
      name: plugin.id,
      interface: { displayName: plugin.displayName },
      source: { source: "url", url: plugin.sourceUrl },
      policy: {
        installation: "AVAILABLE",
        authentication: "ON_INSTALL",
        products: ["CODEX"],
      },
    })),
  };
}
