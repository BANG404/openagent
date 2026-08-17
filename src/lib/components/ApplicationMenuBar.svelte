<script lang="ts">
  import { DropdownMenu } from "bits-ui";
  import { appUpdateState, checkForAppUpdate } from "$lib/appUpdater";
  import { t } from "$lib/i18n";
  import type { RecentWorkspace } from "$lib/types";
  import type { WindowPlatform } from "$lib/windowPlatform";
  import { isWslWorkspacePath } from "$lib/workspacePath";

  type TextControl = HTMLInputElement | HTMLTextAreaElement;
  type EditCommand = "undo" | "redo" | "cut" | "copy" | "paste" | "delete" | "selectAll";

  interface EditContext {
    target: HTMLElement | null;
    selectionStart: number | null;
    selectionEnd: number | null;
    selectionDirection: "forward" | "backward" | "none" | null;
    range: Range | null;
  }

  let {
    recentWorkspaces,
    workspacePath,
    onNewConversation,
    onNewWindow,
    onPickWorkspace,
    onPickWsl,
    onSelectWorkspace,
    onOpenWorkspaceLocation,
    onOpenMemory,
    onOpenRoles,
    onOpenSkills,
    onOpenSettings,
    onOpenAbout,
    onCloseWindow,
    onQuit,
    platform,
  }: {
    recentWorkspaces: RecentWorkspace[];
    workspacePath: string;
    onNewConversation: () => void;
    onNewWindow: () => void;
    onPickWorkspace: () => void;
    onPickWsl: () => void;
    onSelectWorkspace: (path: string) => void;
    onOpenWorkspaceLocation: () => void;
    onOpenMemory: () => void;
    onOpenRoles: () => void;
    onOpenSkills: () => void;
    onOpenSettings: () => void;
    onOpenAbout: () => void;
    onCloseWindow: () => void;
    onQuit: () => void;
    platform: WindowPlatform;
  } = $props();

  let otherRecent = $derived(recentWorkspaces.filter((item) => item.path !== workspacePath));
  let editContext = $state<EditContext | null>(null);
  let editAvailability = $state<Record<EditCommand, boolean>>({
    undo: false,
    redo: false,
    cut: false,
    copy: false,
    paste: false,
    delete: false,
    selectAll: false,
  });

  const isMac =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent ?? "");
  const primaryModifier = isMac ? "⌘" : "Ctrl";

  function isTextControl(element: Element | null): element is TextControl {
    return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
  }

  function captureEditContext(): void {
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const textControl = isTextControl(active) ? active : null;
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    const target = textControl || active?.isContentEditable ? active : null;
    const selectionStart = textControl?.selectionStart ?? null;
    const selectionEnd = textControl?.selectionEnd ?? null;
    const hasSelection = textControl
      ? selectionStart !== null && selectionEnd !== null && selectionStart !== selectionEnd
      : Boolean(range && !range.collapsed);

    editContext = {
      target,
      selectionStart,
      selectionEnd,
      selectionDirection: textControl?.selectionDirection ?? null,
      range,
    };
    editAvailability = {
      undo: Boolean(target),
      redo: Boolean(target),
      cut: Boolean(target && hasSelection),
      copy: hasSelection,
      paste: Boolean(target),
      delete: Boolean(target && hasSelection),
      selectAll: Boolean(target),
    };
  }

  function restoreEditContext(): void {
    const context = editContext;
    if (!context) return;
    context.target?.focus({ preventScroll: true });
    if (
      isTextControl(context.target) &&
      context.selectionStart !== null &&
      context.selectionEnd !== null
    ) {
      context.target.setSelectionRange(
        context.selectionStart,
        context.selectionEnd,
        context.selectionDirection ?? undefined,
      );
      return;
    }
    if (context.range) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(context.range);
    }
  }

  async function pasteFromClipboard(): Promise<void> {
    const target = editContext?.target;
    if (!target || !navigator.clipboard?.readText) return;
    const text = await navigator.clipboard.readText();
    if (isTextControl(target)) {
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? start;
      target.setRangeText(text, start, end, "end");
      target.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          data: text,
          inputType: "insertFromPaste",
        }),
      );
      return;
    }
    document.execCommand("insertText", false, text);
  }

  async function runEditCommand(command: EditCommand): Promise<void> {
    restoreEditContext();
    const handled = document.execCommand(command);
    if (command === "paste" && !handled) {
      await pasteFromClipboard().catch(() => {});
    }
    editContext = null;
  }

  function runShortcut(event: KeyboardEvent, action: () => void): void {
    event.preventDefault();
    action();
  }

  function handleGlobalShortcut(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.repeat) return;
    const key = event.key.toLowerCase();
    if (event.altKey && !event.ctrlKey && !event.metaKey) {
      const triggerId =
        key === "f"
          ? "application-file-menu"
          : key === "e"
            ? "application-edit-menu"
            : key === "v"
              ? "application-view-menu"
              : key === "h"
                ? "application-help-menu"
                : null;
      if (!triggerId) return;
      if (key === "e") captureEditContext();
      runShortcut(event, () => {
        const trigger = document.getElementById(triggerId);
        trigger?.focus({ preventScroll: true });
        trigger?.click();
      });
      return;
    }
    if (event.key === "F1") {
      runShortcut(event, onOpenAbout);
      return;
    }
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (!event.shiftKey && key === "n") runShortcut(event, onNewConversation);
    else if (event.shiftKey && key === "n") runShortcut(event, onNewWindow);
    else if (!event.shiftKey && key === "o") runShortcut(event, onPickWorkspace);
    else if (!event.shiftKey && key === "w") runShortcut(event, onCloseWindow);
    else if (!event.shiftKey && key === "q") runShortcut(event, onQuit);
    else if (!event.shiftKey && key === ",") runShortcut(event, onOpenSettings);
    else if (event.shiftKey && event.code === "Digit1") runShortcut(event, onOpenMemory);
    else if (event.shiftKey && event.code === "Digit2") runShortcut(event, onOpenRoles);
    else if (event.shiftKey && event.code === "Digit3") runShortcut(event, onOpenSkills);
    else if (event.shiftKey && key === "u") {
      runShortcut(event, () => void checkForAppUpdate(true));
    }
  }
</script>

<svelte:window onkeydown={handleGlobalShortcut} />

<nav class="application-menu-bar" aria-label={$t("applicationMenu")}>
  <DropdownMenu.Root>
    <DropdownMenu.Trigger id="application-file-menu" class="application-menu-trigger" accesskey="f"
      >{$t("fileMenu")}</DropdownMenu.Trigger
    >
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        class="desktop-menu-panel application-menu-content"
        sideOffset={2}
        align="start"
      >
        <DropdownMenu.Item class="application-menu-item" onSelect={onNewConversation}>
          <span>{$t("newChat")}</span><span class="application-menu-shortcut"
            >{primaryModifier}+N</span
          >
        </DropdownMenu.Item>
        <DropdownMenu.Item class="application-menu-item" onSelect={onNewWindow}>
          <span>{$t("newWindow")}</span><span class="application-menu-shortcut"
            >{primaryModifier}+Shift+N</span
          >
        </DropdownMenu.Item>
        <DropdownMenu.Separator class="application-menu-separator" />
        <DropdownMenu.Item class="application-menu-item" onSelect={onPickWorkspace}>
          <span>{$t("openFolder")}</span><span class="application-menu-shortcut"
            >{primaryModifier}+O</span
          >
        </DropdownMenu.Item>
        {#if platform === "windows"}
          <DropdownMenu.Item class="application-menu-item" onSelect={onPickWsl}
            >{$t("openWslFolder")}</DropdownMenu.Item
          >
        {/if}
        {#if workspacePath}
          <DropdownMenu.Item class="application-menu-item" onSelect={onOpenWorkspaceLocation}
            >{$t("openCurrentWorkspaceLocation")}</DropdownMenu.Item
          >
        {/if}
        {#if otherRecent.length > 0}
          <DropdownMenu.Separator class="application-menu-separator" />
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger class="application-menu-item application-submenu-trigger">
              <span>{$t("recentWorkspaces")}</span>
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m6 4 4 4-4 4" /></svg
              >
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                class="desktop-menu-panel application-menu-content application-recent-menu"
                sideOffset={5}
                alignOffset={-5}
              >
                {#each otherRecent as item (item.path)}
                  <DropdownMenu.Item
                    class="application-menu-item application-workspace-item"
                    onSelect={() => onSelectWorkspace(item.path)}
                  >
                    {#if isWslWorkspacePath(item.path)}<span class="application-wsl-badge">WSL</span
                      >{/if}
                    <span>{item.path}</span>
                  </DropdownMenu.Item>
                {/each}
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
        {/if}
        <DropdownMenu.Separator class="application-menu-separator" />
        <DropdownMenu.Item class="application-menu-item" onSelect={onCloseWindow}>
          <span>{$t("closeWindow")}</span><span class="application-menu-shortcut"
            >{primaryModifier}+W</span
          >
        </DropdownMenu.Item>
        <DropdownMenu.Item class="application-menu-item" onSelect={onQuit}>
          <span>{$t("quit")}</span><span class="application-menu-shortcut">{primaryModifier}+Q</span
          >
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>

  <DropdownMenu.Root
    onOpenChange={(open) => {
      if (open && !editContext) captureEditContext();
      if (!open) editContext = null;
    }}
  >
    <DropdownMenu.Trigger
      class="application-menu-trigger"
      id="application-edit-menu"
      accesskey="e"
      onpointerdown={captureEditContext}>{$t("editMenu")}</DropdownMenu.Trigger
    >
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        class="desktop-menu-panel application-menu-content"
        sideOffset={2}
        align="start"
      >
        <DropdownMenu.Item
          class="application-menu-item"
          disabled={!editAvailability.undo}
          onSelect={() => void runEditCommand("undo")}
        >
          <span>{$t("undo")}</span><span class="application-menu-shortcut">{primaryModifier}+Z</span
          >
        </DropdownMenu.Item>
        <DropdownMenu.Item
          class="application-menu-item"
          disabled={!editAvailability.redo}
          onSelect={() => void runEditCommand("redo")}
        >
          <span>{$t("redo")}</span><span class="application-menu-shortcut"
            >{primaryModifier}+{isMac ? "Shift+Z" : "Y"}</span
          >
        </DropdownMenu.Item>
        <DropdownMenu.Separator class="application-menu-separator" />
        <DropdownMenu.Item
          class="application-menu-item"
          disabled={!editAvailability.cut}
          onSelect={() => void runEditCommand("cut")}
        >
          <span>{$t("cut")}</span><span class="application-menu-shortcut">{primaryModifier}+X</span>
        </DropdownMenu.Item>
        <DropdownMenu.Item
          class="application-menu-item"
          disabled={!editAvailability.copy}
          onSelect={() => void runEditCommand("copy")}
        >
          <span>{$t("copy")}</span><span class="application-menu-shortcut">{primaryModifier}+C</span
          >
        </DropdownMenu.Item>
        <DropdownMenu.Item
          class="application-menu-item"
          disabled={!editAvailability.paste}
          onSelect={() => void runEditCommand("paste")}
        >
          <span>{$t("paste")}</span><span class="application-menu-shortcut"
            >{primaryModifier}+V</span
          >
        </DropdownMenu.Item>
        <DropdownMenu.Item
          class="application-menu-item"
          disabled={!editAvailability.delete}
          onSelect={() => void runEditCommand("delete")}
        >
          <span>{$t("delete")}</span><span class="application-menu-shortcut">Del</span>
        </DropdownMenu.Item>
        <DropdownMenu.Separator class="application-menu-separator" />
        <DropdownMenu.Item
          class="application-menu-item"
          disabled={!editAvailability.selectAll}
          onSelect={() => void runEditCommand("selectAll")}
        >
          <span>{$t("selectAll")}</span><span class="application-menu-shortcut"
            >{primaryModifier}+A</span
          >
        </DropdownMenu.Item>
        <DropdownMenu.Separator class="application-menu-separator" />
        <DropdownMenu.Item class="application-menu-item" onSelect={onOpenSettings}>
          <span>{$t("settings")}</span><span class="application-menu-shortcut"
            >{primaryModifier}+,</span
          >
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>

  <DropdownMenu.Root>
    <DropdownMenu.Trigger id="application-view-menu" class="application-menu-trigger" accesskey="v"
      >{$t("viewMenu")}</DropdownMenu.Trigger
    >
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        class="desktop-menu-panel application-menu-content"
        sideOffset={2}
        align="start"
      >
        <DropdownMenu.Item class="application-menu-item" onSelect={onOpenMemory}>
          <span>{$t("memory")}</span><span class="application-menu-shortcut"
            >{primaryModifier}+Shift+1</span
          >
        </DropdownMenu.Item>
        <DropdownMenu.Item class="application-menu-item" onSelect={onOpenRoles}>
          <span>{$t("roles")}</span><span class="application-menu-shortcut"
            >{primaryModifier}+Shift+2</span
          >
        </DropdownMenu.Item>
        <DropdownMenu.Item class="application-menu-item" onSelect={onOpenSkills}>
          <span>{$t("skills")}</span><span class="application-menu-shortcut"
            >{primaryModifier}+Shift+3</span
          >
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>

  <DropdownMenu.Root>
    <DropdownMenu.Trigger id="application-help-menu" class="application-menu-trigger" accesskey="h"
      >{$t("helpMenu")}</DropdownMenu.Trigger
    >
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        class="desktop-menu-panel application-menu-content"
        sideOffset={2}
        align="start"
      >
        <DropdownMenu.Item
          class="application-menu-item"
          disabled={$appUpdateState !== "idle"}
          onSelect={() => void checkForAppUpdate(true)}
        >
          <span
            >{$appUpdateState === "checking"
              ? $t("checkingForUpdates")
              : $t("checkForUpdates")}</span
          >
          <span class="application-menu-shortcut">{primaryModifier}+Shift+U</span>
        </DropdownMenu.Item>
        <DropdownMenu.Separator class="application-menu-separator" />
        <DropdownMenu.Item class="application-menu-item" onSelect={onOpenAbout}>
          <span>{$t("about")}</span><span class="application-menu-shortcut">F1</span>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
</nav>

<style>
  .application-menu-bar {
    display: flex;
    align-items: center;
    gap: 1px;
    height: 100%;
  }

  :global(.application-menu-trigger) {
    height: 28px;
    padding: 0 9px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    font-size: 12px;
    line-height: 28px;
    cursor: default;
    outline: none;
  }

  :global(.application-menu-trigger:hover),
  :global(.application-menu-trigger:focus-visible),
  :global(.application-menu-trigger[data-state="open"]) {
    background: var(--surface2);
    color: var(--text);
  }

  :global(.application-menu-trigger:focus-visible) {
    box-shadow: var(--focus-ring);
  }

  :global(.application-menu-content) {
    min-width: 230px;
    max-width: min(460px, calc(100vw - 24px));
    z-index: 240;
  }

  :global(.application-menu-item) {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    min-height: var(--menu-item-min-height);
    box-sizing: border-box;
    padding: var(--menu-item-padding-block) var(--menu-item-padding-inline);
    border-radius: var(--menu-item-radius);
    color: var(--text);
    font-size: var(--menu-item-font-size);
    line-height: var(--menu-item-line-height);
    cursor: default;
    outline: none;
  }

  :global(.application-menu-item + .application-menu-item) {
    margin-top: var(--menu-item-stack-gap);
  }

  :global(.application-menu-item[data-highlighted]),
  :global(.application-menu-item:hover) {
    background: var(--bg);
  }

  :global(.application-menu-item[data-disabled]) {
    opacity: 0.42;
  }

  :global(.application-menu-shortcut) {
    flex: 0 0 auto;
    color: var(--text-muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  :global(.application-submenu-trigger svg) {
    width: 12px;
    height: 12px;
    color: var(--text-muted);
  }

  :global(.application-submenu-trigger path) {
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  :global(.application-menu-separator) {
    height: 1px;
    margin: var(--menu-separator-margin);
    background: var(--border);
  }

  :global(.application-recent-menu) {
    max-height: min(320px, calc(100vh - 96px));
    overflow-y: auto;
  }

  :global(.application-workspace-item) {
    min-width: 0;
    justify-content: flex-start;
    gap: var(--menu-item-gap);
  }

  :global(.application-workspace-item > span:last-child) {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .application-wsl-badge {
    flex: 0 0 auto;
    padding: 1px 4px;
    border: 1px solid color-mix(in srgb, var(--primary) 42%, transparent);
    border-radius: 4px;
    color: var(--primary);
    font-size: 9px;
    font-weight: 700;
  }
</style>
