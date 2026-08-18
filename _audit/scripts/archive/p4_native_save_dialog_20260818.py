import json
import os
import time
from pathlib import Path

from PIL import ImageGrab
from pywinauto import Desktop, keyboard

ROOT = Path(r"D:\codex\novel-workshop-vue3")
OUT = ROOT / "_audit"
TMP = OUT / "tmp"
TMP.mkdir(parents=True, exist_ok=True)

target = TMP / ("p4_native_save_" + str(int(time.time() * 1000)) + ".md")
desktop_shot = OUT / "P4_native_save_dialog_screen.png"
dialog_dump = OUT / "P4_native_save_dialog_controls.txt"
report = OUT / "P4_native_save_dialog_native.json"
fixture = "P4 原生保存对话框验证\n用户真实点击保存后写入本地文件。"


def find_dialog():
    for _ in range(30):
        try:
            for backend in ("win32", "uia"):
                try:
                    dlg = Desktop(backend=backend).window(class_name_re="#32770")
                    if dlg.exists(timeout=0.5):
                        return dlg
                except Exception:
                    pass
        except Exception:
            pass
        time.sleep(0.5)
    return None


def main():
    evidence = {"targetPath": str(target), "startedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z")}
    dlg = find_dialog()
    if dlg is None:
        evidence["error"] = "native save dialog not found"
        report.write_text(json.dumps(evidence, ensure_ascii=False, indent=2), "utf-8")
        print("DIALOG_NOT_FOUND")
        return
    evidence["dialogTitle"] = dlg.window_text()
    evidence["dialogClass"] = dlg.class_name()
    ImageGrab.grab().save(desktop_shot)
    try:
        with dialog_dump.open("w", encoding="utf-8") as f:
            f.write("title=" + dlg.window_text() + "\n")
            try:
                dlg.print_control_identifiers(file=f)
            except Exception as e:
                f.write("dump error: " + str(e) + "\n")
    except Exception as e:
        evidence["dumpError"] = str(e)

    edit = None
    try:
        edit = dlg.Edit
    except Exception:
        try:
            edit = dlg.child_window(class_name="Edit")
        except Exception:
            pass
    if edit is not None:
        try:
            edit.set_edit_text(str(target))
            evidence["editMethod"] = "set_edit_text"
        except Exception as e:
            evidence["setTextError"] = str(e)
            edit.click_input()
            keyboard.send_keys("^a")
            keyboard.send_keys(str(target), with_spaces=True)
            evidence["editMethod"] = "keyboard"
    else:
        try:
            dlg.set_focus()
            keyboard.send_keys("^a")
            keyboard.send_keys(str(target), with_spaces=True)
            evidence["editMethod"] = "keyboard_no_edit"
        except Exception as e:
            evidence["keyboardError"] = str(e)

    saved = False
    try:
        for ctrl in dlg.children(class_name="Button"):
            text = ctrl.window_text()
            if "保存" in text or "Save" in text:
                ctrl.click()
                saved = True
                evidence["saveButton"] = text
                break
    except Exception as e:
        evidence["buttonError"] = str(e)
    if not saved:
        keyboard.send_keys("{ENTER}")
        evidence["saveButton"] = "ENTER_FALLBACK"

    for _ in range(20):
        if target.exists():
            break
        time.sleep(0.5)
    evidence["fileExists"] = target.exists()
    if target.exists():
        content = target.read_text(encoding="utf-8")
        evidence["fileContent"] = content
        evidence["contentMatches"] = content == fixture
        evidence["bytes"] = target.stat().st_size
    evidence["finishedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    report.write_text(json.dumps(evidence, ensure_ascii=False, indent=2), "utf-8")
    print(json.dumps({k: v for k, v in evidence.items() if k != "fileContent"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
