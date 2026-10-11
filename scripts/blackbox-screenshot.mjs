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
from PIL import Image, ImageGrab
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
    try:
        capture = ImageGrab.grab(bbox=(rect.left, rect.top, rect.right, rect.bottom), all_screens=True)
    except OSError:
        # A disconnected desktop cannot be grabbed, but the verified window
        # can still render its own native pixels, including WebView surfaces.
        # Refresh the compositor; otherwise PrintWindow can return a cached
        # WebView frame. Restore the exact bounds before reading its pixels.
        width, height = rect.right - rect.left, rect.bottom - rect.top
        if not u.SetWindowPos(hwnd, None, 0, 0, width + 1, height, 0x16):
            raise ctypes.WinError()
        try:
            time.sleep(0.2)
        finally:
            if not u.SetWindowPos(hwnd, None, 0, 0, width, height, 0x16):
                raise ctypes.WinError()
        time.sleep(0.3)
        g = ctypes.windll.gdi32
        u.GetDC.argtypes = [wintypes.HWND]
        u.GetDC.restype = wintypes.HDC
        u.ReleaseDC.argtypes = [wintypes.HWND, wintypes.HDC]
        u.PrintWindow.argtypes = [wintypes.HWND, wintypes.HDC, wintypes.UINT]
        g.CreateCompatibleDC.argtypes = [wintypes.HDC]
        g.CreateCompatibleDC.restype = wintypes.HDC
        g.CreateCompatibleBitmap.argtypes = [wintypes.HDC, ctypes.c_int, ctypes.c_int]
        g.CreateCompatibleBitmap.restype = wintypes.HBITMAP
        g.SelectObject.argtypes = [wintypes.HDC, wintypes.HGDIOBJ]
        g.SelectObject.restype = wintypes.HGDIOBJ
        g.GetDIBits.argtypes = [wintypes.HDC, wintypes.HBITMAP, wintypes.UINT, wintypes.UINT, ctypes.c_void_p, ctypes.c_void_p, wintypes.UINT]
        g.DeleteObject.argtypes = [wintypes.HGDIOBJ]
        g.DeleteDC.argtypes = [wintypes.HDC]
        width, height = rect.right - rect.left, rect.bottom - rect.top
        dc = u.GetDC(hwnd)
        memory = g.CreateCompatibleDC(dc)
        bitmap = g.CreateCompatibleBitmap(dc, width, height)
        previous = g.SelectObject(memory, bitmap)
        try:
            if not u.PrintWindow(hwnd, memory, 2):
                raise RuntimeError('Native PrintWindow capture failed')
            class Header(ctypes.Structure):
                _fields_ = [('size', wintypes.DWORD), ('width', wintypes.LONG), ('height', wintypes.LONG), ('planes', wintypes.WORD), ('bits', wintypes.WORD), ('compression', wintypes.DWORD), ('image_size', wintypes.DWORD), ('x_resolution', wintypes.LONG), ('y_resolution', wintypes.LONG), ('colors', wintypes.DWORD), ('important', wintypes.DWORD)]
            header = Header()
            header.size, header.width, header.height = ctypes.sizeof(Header), width, -height
            header.planes, header.bits = 1, 32
            pixels = ctypes.create_string_buffer(width * height * 4)
            if g.GetDIBits(memory, bitmap, 0, height, pixels, ctypes.byref(header), 0) != height:
                raise RuntimeError('Native window pixels could not be read')
            capture = Image.frombuffer('RGB', (width, height), pixels.raw, 'raw', 'BGRX', 0, 1)
            if all(low == high for low, high in capture.getextrema()):
                raise RuntimeError('Native window capture is blank')
        finally:
            g.SelectObject(memory, previous)
            g.DeleteObject(bitmap)
            g.DeleteDC(memory)
            u.ReleaseDC(hwnd, dc)
    capture.save(sys.argv[2])
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
