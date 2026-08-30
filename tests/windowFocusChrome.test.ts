// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { applyWindowFocusEvent } from "../src/lib/windowFocus";

const componentsUrl = new URL("../src/lib/components/", import.meta.url);

describe("window focus chrome", () => {
  test("issues a new composer request for every native activation event", () => {
    const initial = { focused: true, composerFocusRequest: 0 };
    const repeatedFocus = applyWindowFocusEvent(initial, true);
    const blurred = applyWindowFocusEvent(repeatedFocus, false);
    const refocused = applyWindowFocusEvent(blurred, true);

    expect(repeatedFocus).toEqual({ focused: true, composerFocusRequest: 1 });
    expect(blurred).toEqual({ focused: false, composerFocusRequest: 1 });
    expect(refocused).toEqual({ focused: true, composerFocusRequest: 2 });
  });

  test("drives chrome and composer behavior from one window focus state", async () => {
    const route = await readFile(new URL("../src/routes/+page.svelte", import.meta.url), "utf8");
    const conversationSurface = await readFile(
      new URL("ConversationSurface.svelte", componentsUrl),
      "utf8",
    );
    const sidebar = await readFile(new URL("DesktopSidebar.svelte", componentsUrl), "utf8");
    const historyControls = await readFile(
      new URL("SidebarHistoryControls.svelte", componentsUrl),
      "utf8",
    );
    const titleBar = await readFile(new URL("DesktopTitleBar.svelte", componentsUrl), "utf8");
    const preview = await readFile(new URL("DesktopShellPreview.svelte", componentsUrl), "utf8");
    const input = await readFile(new URL("MessageInput.svelte", componentsUrl), "utf8");
    const nativeHost = await readFile(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
    const nativeManifest = await readFile(
      new URL("../src-tauri/Cargo.toml", import.meta.url),
      "utf8",
    );

    expect(route).toContain(".onFocusChanged(({ payload: focused }) =>");
    expect(route).toContain("handleWindowFocusEvent(focused)");
    expect(route).toContain("listen(DESKTOP_WINDOW_ACTIVATED_EVENT");
    expect(route).toMatch(
      /workspace-window-open-request[\s\S]*?await revealMemorySource[\s\S]*?finally\(\(\) => handleWindowFocusEvent\(true\)\)/,
    );
    expect(route).toContain('window.addEventListener("blur", handleBlur)');
    expect(route).toMatch(
      /window\.addEventListener\("focus", handleFocus\);[\s\S]*?if \(appWindow\)/,
    );
    expect(route.match(/\{windowFocused\}/g)).toHaveLength(2);
    expect(route).toContain("focusRequest={composerFocusRequest}");
    expect(conversationSurface).toContain("focusRequest: number;");
    expect(conversationSurface).toContain(
      "focusRequest={focusRequest + localComposerFocusRequest}",
    );
    expect(input).toContain(
      "if (focusRequest > 0) void focusInputAfterWindowActivation(focusRequest);",
    );
    expect(input).toMatch(
      /focusInputAfterWindowActivation[\s\S]*?setTimeout\(resolve, 100\)[\s\S]*?focusRequest !== request[\s\S]*?textareaEl\.focus/,
    );
    expect(input).toContain("textareaEl.focus({ preventScroll: true });");
    expect(nativeHost).toMatch(
      /tauri_plugin_single_instance::init[\s\S]*?window\.unminimize\(\)[\s\S]*?window\.show\(\)[\s\S]*?window\.set_focus\(\)[\s\S]*?window\.emit\(DESKTOP_WINDOW_ACTIVATED_EVENT/,
    );
    expect(nativeHost).toMatch(
      /fn activate_workspace_window[\s\S]*?window\.set_focus\(\)[\s\S]*?workspace-window-open-request[\s\S]*?window[\s\S]*?emit\(DESKTOP_WINDOW_ACTIVATED_EVENT/,
    );
    expect(nativeHost).not.toContain("register_webview_focus_handoff");
    expect(nativeHost).not.toContain("focus_webview_host");
    expect(nativeManifest).toContain("[patch.crates-io]");
    expect(nativeManifest).toContain(
      'tauri = { git = "https://github.com/tauri-apps/tauri", rev = "08acfb3fa04945a6a4f822d66c7556111d9385aa" }',
    );
    expect(nativeHost).toMatch(
      /fn show_desktop_window[\s\S]*?window\.set_focus\(\)[\s\S]*?window\.emit\(DESKTOP_WINDOW_ACTIVATED_EVENT/,
    );
    expect(sidebar).toContain("class:window-inactive={!windowFocused}");
    expect(sidebar).toMatch(/\.sidebar\.window-inactive \.sidebar-top \{\s*opacity: 0\.55;/);
    expect(historyControls).toMatch(
      /button:disabled \{\s*color: color-mix\(in srgb, var\(--text-muted\) 62%, transparent\);/,
    );
    expect(titleBar).toContain("class:window-inactive={!windowFocused}");
    expect(titleBar).toMatch(
      /\.title-bar\.window-inactive \.title-bar-menu,[\s\S]*?opacity: 0\.55;/,
    );
    expect(titleBar).toContain("background: var(--app-chrome-bg)");
    expect(preview).toContain('query.get("desktop-shell-preview-focused") !== "false"');
    expect(preview.match(/\{windowFocused\}/g)).toHaveLength(2);
  });
});
