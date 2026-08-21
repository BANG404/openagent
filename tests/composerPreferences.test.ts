// @ts-nocheck -- Bun's test runtime and the Svelte rune shim are test-only globals.
import { describe, expect, test } from "bun:test";
import { get } from "svelte/store";
import { normalizeConfigShape } from "../src/lib/config";
import { dismissToast, toasts } from "../src/lib/toast";

const rawSnapshots = new WeakMap<object, object>();
const failingSnapshots = new WeakSet<object>();
globalThis.$state = Object.assign((value: unknown) => value, {
  snapshot(value: unknown) {
    if (typeof value === "object" && value !== null && failingSnapshots.delete(value)) {
      throw new DOMException("state snapshot failed", "DataCloneError");
    }
    const source =
      typeof value === "object" && value !== null ? (rawSnapshots.get(value) ?? value) : value;
    return structuredClone(source);
  },
});

const { ComposerPreferences } = await import("../src/lib/composerPreferences.svelte");

describe("ComposerPreferences approval mode", () => {
  test("snapshots reactive configuration before cloning and saving it", async () => {
    const rawConfig = normalizeConfigShape({ approval_mode: "auto" });
    const reactiveConfig = new Proxy(rawConfig, {});
    rawSnapshots.set(reactiveConfig, rawConfig);
    expect(() => structuredClone(reactiveConfig)).toThrow();

    let currentConfig = reactiveConfig;
    let savedNext;
    let savedBase;
    let resolveSaved: () => void;
    const saved = new Promise<void>((resolve) => (resolveSaved = resolve));
    const preferences = new ComposerPreferences({
      getConfig: () => currentConfig,
      setConfig: (next) => (currentConfig = next),
      loadSettings: async () => {},
      saveSettings: async (next, base) => {
        savedNext = next;
        savedBase = base;
        resolveSaved();
        return next;
      },
      tauriAvailable: true,
    });

    preferences.handleApprovalModeChange("manual");
    await Promise.race([
      saved,
      Bun.sleep(250).then(() => {
        throw new Error("approval mode save was not reached");
      }),
    ]);

    expect(savedBase).toEqual(rawConfig);
    expect(savedBase).not.toBe(reactiveConfig);
    expect(savedNext).toEqual({ ...rawConfig, approval_mode: "manual" });
    expect(currentConfig).toBe(savedNext);
  });

  test("keeps later approval saves usable after a handled snapshot failure", async () => {
    const rawConfig = normalizeConfigShape({ approval_mode: "auto" });
    const reactiveConfig = new Proxy(rawConfig, {});
    rawSnapshots.set(reactiveConfig, rawConfig);
    failingSnapshots.add(reactiveConfig);

    let currentConfig = reactiveConfig;
    let resolveReloaded: () => void;
    const reloaded = new Promise<void>((resolve) => (resolveReloaded = resolve));
    let resolveSaved: () => void;
    const saved = new Promise<void>((resolve) => (resolveSaved = resolve));
    const preferences = new ComposerPreferences({
      getConfig: () => currentConfig,
      setConfig: (next) => (currentConfig = next),
      loadSettings: async () => {
        currentConfig = reactiveConfig;
        resolveReloaded();
      },
      saveSettings: async (next) => {
        resolveSaved();
        return next;
      },
      tauriAvailable: true,
    });

    preferences.handleApprovalModeChange("manual");
    await reloaded;
    preferences.handleApprovalModeChange("off");
    await Promise.race([
      saved,
      Bun.sleep(250).then(() => {
        throw new Error("approval mode queue remained rejected");
      }),
    ]);

    expect(currentConfig.approval_mode).toBe("off");
    for (const toast of get(toasts)) dismissToast(toast.id);
  });
});
