// @ts-check
import { spawnSync } from "node:child_process";

/**
 * WebView capture can omit composited settings content. Windows visual runs
 * supply the verified main HWND and capture its unobscured screen rectangle.
 *
 * @param {(args: string[]) => unknown} pilot
 * @param {string} artifact
 */
export function captureBlackboxScreenshot(pilot, artifact) {
  const windowId = process.env.BLACKBOX_NATIVE_WINDOW_ID;
  if (process.platform === "win32" && windowId) {
    const capture = spawnSync(
      process.env.PYTHON_BIN || "python",
      [
        "-c",
        `import ctypes, sys, time
from ctypes import wintypes
from PIL import ImageGrab
u = ctypes.windll.user32
u.SetWindowPos.argtypes = [wintypes.HWND, wintypes.HWND, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, wintypes.UINT]
u.SetWindowPos.restype = wintypes.BOOL
u.WindowFromPoint.argtypes = [wintypes.POINT]
u.WindowFromPoint.restype = wintypes.HWND
u.GetAncestor.argtypes = [wintypes.HWND, wintypes.UINT]
u.GetAncestor.restype = wintypes.HWND
hwnd = int(sys.argv[1])
title = ctypes.create_unicode_buffer(512)
u.GetWindowTextW(hwnd, title, 512)
if not u.IsWindow(hwnd) or title.value != 'OpenAgent':
    raise RuntimeError('Expected the verified OpenAgent main window HWND')
u.ShowWindow(hwnd, 9)
thread = ctypes.windll.kernel32.GetCurrentThreadId()
foreground_thread = u.GetWindowThreadProcessId(u.GetForegroundWindow(), None)
attached = thread != foreground_thread and u.AttachThreadInput(thread, foreground_thread, True)
try:
    u.BringWindowToTop(hwnd)
    u.SetForegroundWindow(hwnd)
finally:
    if attached:
        u.AttachThreadInput(thread, foreground_thread, False)
was_topmost = bool(u.GetWindowLongW(hwnd, -20) & 8)
try:
    rect = wintypes.RECT()
    u.GetWindowRect(hwnd, ctypes.byref(rect))
    deadline = time.monotonic() + 3
    while True:
        if not u.SetWindowPos(hwnd, ctypes.c_void_p(-1), 0, 0, 0, 0, 0x13):
            raise ctypes.WinError()
        time.sleep(0.2)
        hit = u.WindowFromPoint(wintypes.POINT((rect.left + rect.right) // 2, (rect.top + rect.bottom) // 2))
        if not u.IsIconic(hwnd) and u.GetAncestor(hit, 2) == hwnd:
            break
        if time.monotonic() >= deadline:
            raise RuntimeError('Verified OpenAgent main window is obscured')
    ImageGrab.grab(bbox=(rect.left, rect.top, rect.right, rect.bottom), all_screens=True).save(sys.argv[2])
finally:
    if not was_topmost:
        u.SetWindowPos(hwnd, ctypes.c_void_p(-2), 0, 0, 0, 0, 0x13)`,
        windowId,
        artifact,
      ],
      { encoding: "utf8" },
    );
    if (capture.error) throw capture.error;
    if (capture.status !== 0) throw new Error(capture.stderr || "Native window capture failed");
    return;
  }
  pilot(["screenshot", artifact]);
}
