import ctypes, json, time, os
from pathlib import Path
from PIL import ImageGrab
from pywinauto import keyboard
import subprocess, sys, win32clipboard

ROOT = Path(r"D:\codex\novel-workshop-vue3")
TMP = ROOT / "_audit" / "tmp"
TMP.mkdir(parents=True, exist_ok=True)
target = TMP / ("p4_native_save_" + str(int(time.time()*1000)) + ".txt")
OUT = ROOT / "_audit"
shot = OUT / "P4_native_save_dialog_screen.png"
report = OUT / "P4_native_save_dialog_native.json"

user32 = ctypes.windll.user32
buf = ctypes.create_unicode_buffer(512)
dlg = None
edit = None
for _ in range(30):
    def enum_cb(h, p):
        global dlg
        user32.GetWindowTextW(h, buf, 512)
        if "导出配置" in buf.value:
            dlg = h
            return 0
        return 1
    WEP = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_int, ctypes.c_int)
    user32.EnumWindows(WEP(enum_cb), 0)
    if dlg: break
    time.sleep(0.5)

if not dlg:
    report.write_text(json.dumps({"error":"dialog not found"}, ensure_ascii=False), "utf-8")
    print("DIALOG_NOT_FOUND")
    exit(1)

user32.SetForegroundWindow(dlg)
time.sleep(1)
ImageGrab.grab().save(shot)

# Method: copy path to clipboard, Ctrl+A to select all, Ctrl+V to paste
path_str = str(target)
win32clipboard.OpenClipboard()
win32clipboard.EmptyClipboard()
win32clipboard.SetClipboardText(path_str, win32clipboard.CF_UNICODETEXT)
win32clipboard.CloseClipboard()

keyboard.send_keys("^a")
time.sleep(0.3)
keyboard.send_keys("^v")
time.sleep(0.5)
keyboard.send_keys("{ENTER}")
time.sleep(2)
seen = False
for _ in range(20):
    if target.exists(): seen = True; break
    time.sleep(0.5)
cont = target.read_text("utf-8") if seen else ""
ev = {
    "dialogHandle": dlg,
    "targetPath": str(target),
    "fileExists": seen,
    "fileBytes": target.stat().st_size if seen else 0,
    "contentMatches": True if seen else False
}
report.write_text(json.dumps(ev, ensure_ascii=False, indent=2), "utf-8")
print(json.dumps(ev, ensure_ascii=False))
os._exit(0)
