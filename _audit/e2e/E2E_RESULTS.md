# E2E Verification Report

**App**: 神意助手  
**Time**: 2026-08-13T23:06:15.907Z  
**CDP Port**: 9228

| Step | Operation | Status | Detail | Screenshot |
|------|-----------|--------|--------|------------|
| E-01 | Connect | PASS | Title: 神意助手 | - |
| E-02 | Initial screenshot | PASS | Page loaded | ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e02_initial.png) |
| E-02 | Scan buttons | INFO | Buttons: , , , , , , , , , , 生成, 项目, 新建, 打开, 树生成, +卷, , , 生成, 保存, 导出, 去AI味, AI命名, 写作规则, 时间线, 批量审阅, 修订, 变量, , ×, 刷新, 导出, 清空 | - |
| E-02 | Click first button | PASS | Text:  | - |
| E-02 | Check modal | WARN | Modals: 0 | ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e02_after_click.png) |
| E-02 | Done | PASS | Final state | ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e02_final.png) |
| E-03 | Click outline | WARN | Not found | - |
| E-03 | Outline screen | PASS | Screenshot | ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e03_import.png) |
| E-04 | Confirm outline | WARN | Not found | - |
| E-04 | After confirm | PASS | Screenshot | ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e04_confirm.png) |
| E-04 | IndexedDB projects | WARN | ERROR: Failed to execute 'transaction' on 'IDBDatabase': A version change transaction is running. | - |
| E-05 | Generate setting | WARN | Not found | - |
| E-05 | After generate | PASS | Screenshot | ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e05_setting.png) |
| E-06 | Generate volume | PASS | Screenshot | ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e06_volume.png) |
| E-07 | Generate chapter | PASS | Screenshot | ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e07_chapter.png) |
| E-08 | Generate content | PASS | Screenshot | ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e08_content.png) |
| E-08 | IndexedDB chapters | WARN | ERROR: Failed to execute 'transaction' on 'IDBDatabase': One of the specified object stores was not found. | - |
| E-09 | Context menu | WARN | Menu: none | - |
| E-09 | Context screenshot | PASS | Screenshot | ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e09_context.png) |
| E-10 | Open settings | WARN | Not found | - |
| E-10 | Settings screen | PASS | Screenshot | ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e10_settings.png) |
| E-11 | Sidebar nav | PASS | SIDEBAR:  | - |
| E-11 | Sidebar screenshot | PASS | Screenshot | ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e11_sidebar.png) |
| E-12 | Open pipeline | WARN | Not found | - |
| E-12 | Pipeline state | PASS | Screenshot | ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e12_pipeline.png) |
| E-13 | Open chat | PASS | Text: AI 对话默认自动[edit]开始对话在下方输入框输入消息，与 AI 助手开始创作技能区▼AI默认自 | - |
| E-13 | Chat panel | PASS | Screenshot | ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e13_chat.png) |
| E-14 | Open plugins | WARN | Not found | - |
| E-14 | Plugin market | PASS | Screenshot | ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e14_plugin.png) |
| E-15 | Open memory | WARN | Not found | - |
| E-15 | Memory panel | PASS | Screenshot | ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e15_memory.png) |
| E-15 | IndexedDB memory | WARN | ERROR: Failed to execute 'transaction' on 'IDBDatabase': One of the specified object stores was not found. | - |
| E-15 | IndexedDB settings | WARN | ERROR: Failed to execute 'transaction' on 'IDBDatabase': One of the specified object stores was not found. | - |
| E-16 | Click exit | WARN | Not found | - |
| E-16 | Exit confirm | PASS | Screenshot | ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e16_exit.png) |
| E-16 | Final state | PASS | Screenshot | ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e16_final.png) |

## Summary

- Total: 36
- PASS: 21
- WARN: 14
- INFO: 1
- ERROR: 0
- Pass Rate: 58%

## CDP Log

```
[CDP] 1: Page.enable
[CDP] 2: Runtime.enable
[CDP] 3: Runtime.evaluate
[CDP] 4: Page.captureScreenshot
[CDP] 5: Runtime.evaluate
[CDP] 6: Runtime.evaluate
[CDP] 7: Input.dispatchMouseEvent
[CDP] 8: Input.dispatchMouseEvent
[CDP] 9: Page.captureScreenshot
[CDP] 10: Runtime.evaluate
[CDP] 11: Page.captureScreenshot
[CDP] 12: Runtime.evaluate
[CDP] 13: Page.captureScreenshot
[CDP] 14: Runtime.evaluate
[CDP] 15: Page.captureScreenshot
[CDP] 16: Runtime.evaluate
[CDP] 17: Runtime.evaluate
[CDP] 18: Page.captureScreenshot
[CDP] 19: Page.captureScreenshot
[CDP] 20: Page.captureScreenshot
[CDP] 21: Page.captureScreenshot
[CDP] 22: Runtime.evaluate
[CDP] 23: Runtime.evaluate
[CDP] 24: Runtime.evaluate
[CDP] 25: Page.captureScreenshot
[CDP] 26: Runtime.evaluate
[CDP] 27: Page.captureScreenshot
[CDP] 28: Runtime.evaluate
[CDP] 29: Page.captureScreenshot
[CDP] 30: Runtime.evaluate
[CDP] 31: Page.captureScreenshot
[CDP] 32: Runtime.evaluate
[CDP] 33: Input.dispatchMouseEvent
[CDP] 34: Input.dispatchMouseEvent
[CDP] 35: Page.captureScreenshot
[CDP] 36: Runtime.evaluate
[CDP] 37: Page.captureScreenshot
[CDP] 38: Runtime.evaluate
[CDP] 39: Page.captureScreenshot
[CDP] 40: Runtime.evaluate
[CDP] 41: Runtime.evaluate
[CDP] 42: Runtime.evaluate
[CDP] 43: Page.captureScreenshot
[CDP] 44: Page.captureScreenshot
```

## IndexedDB Data

- projects: see E-04
- chapters: see E-08
- memory: see E-15
- settings: see E-15


## Screenshots

- ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e02_after_click.png)
- ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e02_final.png)
- ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e02_initial.png)
- ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e03_import.png)
- ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e04_confirm.png)
- ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e05_setting.png)
- ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e06_volume.png)
- ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e07_chapter.png)
- ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e08_content.png)
- ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e09_context.png)
- ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e10_settings.png)
- ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e11_sidebar.png)
- ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e12_pipeline.png)
- ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e13_chat.png)
- ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e14_plugin.png)
- ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e15_memory.png)
- ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e16_exit.png)
- ![](D:/codex/novel-workshop-vue3/_audit/e2e/screenshots/e16_final.png)
