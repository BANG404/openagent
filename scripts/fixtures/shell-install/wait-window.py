"""Inspect visible installer windows belonging to one fixture process."""

import ctypes
import json
import sys
from ctypes import wintypes

user = ctypes.windll.user32
callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
user.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
user.IsWindowVisible.argtypes = [wintypes.HWND]
user.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
user.EnumWindows.argtypes = [callback_type, wintypes.LPARAM]
user.EnumChildWindows.argtypes = [wintypes.HWND, callback_type, wintypes.LPARAM]
windows = []


@callback_type
def inspect(handle, _):
    owner = wintypes.DWORD()
    user.GetWindowThreadProcessId(handle, ctypes.byref(owner))
    if owner.value == int(sys.argv[1]) and user.IsWindowVisible(handle):
        texts = []

        @callback_type
        def text(child, _):
            value = ctypes.create_unicode_buffer(2048)
            user.GetWindowTextW(child, value, len(value))
            if value.value:
                texts.append(value.value)
            return True

        text(handle, 0)
        user.EnumChildWindows(handle, text, 0)
        windows.append({"handle": int(handle), "text": "\n".join(texts)})
    return True


user.EnumWindows(inspect, 0)
print(json.dumps(windows))
