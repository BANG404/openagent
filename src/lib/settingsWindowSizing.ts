import type { SettingsWindowKind } from "$lib/settingsWindows";

export const SETTINGS_WINDOW_VIEWPORT_INSET = 48;
export const SETTINGS_WINDOW_MIN_HEIGHT = 400;
export const SETTINGS_WINDOW_MAX_HEIGHT = 820;

const SETTINGS_WINDOW_WIDTHS: Record<SettingsWindowKind, number> = {
  models: 980,
  agent: 920,
  integrations: 980,
  memory: 780,
  automation: 900,
  about: 680,
};

export function resolveSettingsWindowSize(
  kind: SettingsWindowKind,
  contentHeight: number,
  availableWidth: number,
  availableHeight: number,
): { width: number; height: number } {
  const viewportWidth = Math.max(640, Math.floor(availableWidth - SETTINGS_WINDOW_VIEWPORT_INSET));
  const viewportHeight = Math.max(
    SETTINGS_WINDOW_MIN_HEIGHT,
    Math.floor(availableHeight - SETTINGS_WINDOW_VIEWPORT_INSET),
  );

  return {
    width: Math.min(SETTINGS_WINDOW_WIDTHS[kind], viewportWidth),
    height: Math.min(
      Math.max(SETTINGS_WINDOW_MIN_HEIGHT, Math.ceil(contentHeight)),
      SETTINGS_WINDOW_MAX_HEIGHT,
      viewportHeight,
    ),
  };
}

function flowContentHeight(element: HTMLElement): number {
  const elementRect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const paddingTop = Number.parseFloat(style.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
  let contentBottom = paddingTop;

  for (const child of element.children) {
    if (!(child instanceof HTMLElement)) continue;
    const childRect = child.getBoundingClientRect();
    const childStyle = getComputedStyle(child);
    const marginBottom = Number.parseFloat(childStyle.marginBottom) || 0;
    contentBottom = Math.max(
      contentBottom,
      childRect.bottom - elementRect.top + element.scrollTop + marginBottom,
    );
  }

  return Math.ceil(contentBottom + paddingBottom);
}

export function measureSettingsWindowContent(stage: HTMLElement): number {
  const activePanel = stage.querySelector<HTMLElement>(
    '.settings-tab-panel[data-state="active"], .settings-tab-panel:not([hidden])',
  );
  if (!activePanel) return SETTINGS_WINDOW_MIN_HEIGHT;

  const contentRegions = activePanel.querySelectorAll<HTMLElement>(
    ".settings-content-col, .detail-content, .plugins-settings, .provider-list, .channel-settings-list-items",
  );
  let contentHeight = SETTINGS_WINDOW_MIN_HEIGHT;

  for (const region of contentRegions) {
    const detailHeaderHeight = region.classList.contains("detail-content")
      ? (region.parentElement?.querySelector<HTMLElement>(":scope > .detail-top-bar")
          ?.offsetHeight ?? 0)
      : 0;
    contentHeight = Math.max(contentHeight, flowContentHeight(region) + detailHeaderHeight);
  }

  return contentHeight;
}
