"""Capture an HWND through PrintWindow, including when another app covers it."""

import argparse
import ctypes
from ctypes import wintypes

from PIL import Image


def capture(handle: int, output: str) -> None:
    user = ctypes.windll.user32
    gdi = ctypes.windll.gdi32
    user.IsWindow.argtypes = [wintypes.HWND]
    user.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
    user.GetWindowDC.argtypes = [wintypes.HWND]
    user.GetWindowDC.restype = wintypes.HDC
    user.PrintWindow.argtypes = [wintypes.HWND, wintypes.HDC, wintypes.UINT]
    user.ReleaseDC.argtypes = [wintypes.HWND, wintypes.HDC]
    gdi.CreateCompatibleDC.argtypes = [wintypes.HDC]
    gdi.CreateCompatibleDC.restype = wintypes.HDC
    gdi.CreateCompatibleBitmap.argtypes = [wintypes.HDC, ctypes.c_int, ctypes.c_int]
    gdi.CreateCompatibleBitmap.restype = wintypes.HBITMAP
    gdi.SelectObject.argtypes = [wintypes.HDC, wintypes.HGDIOBJ]
    gdi.SelectObject.restype = wintypes.HGDIOBJ
    gdi.GetDIBits.argtypes = [
        wintypes.HDC, wintypes.HBITMAP, wintypes.UINT, wintypes.UINT,
        ctypes.c_void_p, ctypes.c_void_p, wintypes.UINT,
    ]
    gdi.DeleteObject.argtypes = [wintypes.HGDIOBJ]
    gdi.DeleteDC.argtypes = [wintypes.HDC]
    bounds = wintypes.RECT()
    if not user.IsWindow(handle) or not user.GetWindowRect(handle, ctypes.byref(bounds)):
        raise ValueError("Native verification window is unavailable")
    width, height = bounds.right - bounds.left, bounds.bottom - bounds.top
    source = user.GetWindowDC(handle)
    target = gdi.CreateCompatibleDC(source)
    bitmap = gdi.CreateCompatibleBitmap(source, width, height)
    previous = gdi.SelectObject(target, bitmap)
    try:
        if not user.PrintWindow(handle, target, 2):
            raise OSError("PrintWindow failed")
        # BITMAPINFOHEADER: top-down, uncompressed 32-bit pixels.
        header = (ctypes.c_long * 10)(40, width, -height, 1 + (32 << 16), 0, 0, 0, 0, 0, 0)
        pixels = ctypes.create_string_buffer(width * height * 4)
        if not gdi.GetDIBits(target, bitmap, 0, height, pixels, ctypes.byref(header), 0):
            raise OSError("GetDIBits failed")
        Image.frombuffer("RGB", (width, height), pixels, "raw", "BGRX", 0, 1).save(output)
    finally:
        gdi.SelectObject(target, previous)
        gdi.DeleteObject(bitmap)
        gdi.DeleteDC(target)
        user.ReleaseDC(handle, source)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hwnd", type=lambda value: int(value, 0), required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    capture(args.hwnd, args.output)
