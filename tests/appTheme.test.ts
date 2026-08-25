// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { createNativeThemeSynchronizer } from "../src/lib/appTheme";

describe("native theme synchronization", () => {
  test("restores the native system theme before resolving the WebView theme", async () => {
    let nativeTheme = "dark";
    const events: string[] = [];
    const synchronize = createNativeThemeSynchronizer({
      applyWebTheme: (theme) => {
        events.push(`web:${theme}:${nativeTheme}`);
        return nativeTheme === "dark";
      },
      setNativeTheme: async (theme) => {
        events.push(`native:${theme}`);
        nativeTheme = theme ?? "light";
      },
      onResolvedTheme: (dark) => events.push(`resolved:${dark ? "dark" : "light"}`),
    });

    await synchronize("system");

    expect(events).toEqual(["native:null", "web:system:light", "resolved:light"]);
  });

  test("serializes native updates and leaves the latest rapid selection applied", async () => {
    let releaseFirstNativeUpdate: (() => void) | undefined;
    const nativeThemes: Array<string | null> = [];
    const resolvedThemes: string[] = [];
    const synchronize = createNativeThemeSynchronizer({
      applyWebTheme: (theme) => theme === "dark",
      setNativeTheme: async (theme) => {
        nativeThemes.push(theme);
        if (nativeThemes.length === 1) {
          await new Promise<void>((resolve) => (releaseFirstNativeUpdate = resolve));
        }
      },
      onResolvedTheme: (dark) => resolvedThemes.push(dark ? "dark" : "light"),
    });

    const first = synchronize("dark");
    await Promise.resolve();
    const staleSystem = synchronize("system");
    const latest = synchronize("light");
    releaseFirstNativeUpdate?.();
    await Promise.all([first, staleSystem, latest]);

    expect(nativeThemes).toEqual(["dark", "light"]);
    expect(resolvedThemes.at(-1)).toBe("light");
  });

  test("continues synchronizing after a rejected native update", async () => {
    const errors: unknown[] = [];
    const nativeThemes: Array<string | null> = [];
    const synchronize = createNativeThemeSynchronizer({
      applyWebTheme: (theme) => theme === "dark",
      setNativeTheme: async (theme) => {
        nativeThemes.push(theme);
        if (theme === "dark") throw new Error("rejected");
      },
      onResolvedTheme: () => {},
      onError: (error) => errors.push(error),
    });

    await synchronize("dark");
    await synchronize("light");

    expect(nativeThemes).toEqual(["dark", "light"]);
    expect(errors).toHaveLength(1);
  });
});
