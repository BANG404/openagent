export const DESKTOP_WINDOW_ACTIVATED_EVENT = "desktop-window-activated";

export interface WindowFocusState {
  focused: boolean;
  composerFocusRequest: number;
}

/**
 * Native activation is an event, not merely a boolean transition. Windows can
 * focus an existing WebView without the frontend first observing a blur, so
 * every focused event must issue a fresh composer request.
 */
export function applyWindowFocusEvent(state: WindowFocusState, focused: boolean): WindowFocusState {
  return {
    focused,
    composerFocusRequest: focused ? state.composerFocusRequest + 1 : state.composerFocusRequest,
  };
}
