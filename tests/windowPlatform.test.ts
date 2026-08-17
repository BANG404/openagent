// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { resolveWindowPlatform } from "../src/lib/windowPlatform";

const componentsUrl = new URL("../src/lib/components/", import.meta.url);

describe("desktop platform capabilities", () => {
  test("distinguishes Windows from macOS and Linux hosts", () => {
    expect(resolveWindowPlatform("Win32")).toBe("windows");
    expect(resolveWindowPlatform("Windows")).toBe("windows");
    expect(resolveWindowPlatform("MacIntel")).toBe("macos");
    expect(resolveWindowPlatform("Linux x86_64")).toBe("linux");
  });

  test("renders WSL workspace actions only on Windows", async () => {
    for (const component of ["ApplicationMenuBar.svelte", "WorkspaceSwitcher.svelte"]) {
      const source = await readFile(new URL(component, componentsUrl), "utf8");
      const windowsOnlyBlock = source.match(
        /{#if platform === "windows"}[\s\S]*?openWslFolder[\s\S]*?{\/if}/,
      );

      expect(windowsOnlyBlock).not.toBeNull();
    }

    const preview = await readFile(new URL("StandaloneDevPreview.svelte", componentsUrl), "utf8");
    expect(preview).toContain("query.get(`${prefix}-platform`)");
    expect(preview).toContain("{platformOverride}");
  });
});
