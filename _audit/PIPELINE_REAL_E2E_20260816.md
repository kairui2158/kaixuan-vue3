# 神意助手生成流水线实时端到端验证报告 2026-08-16

> 本节补录：正文「插入到编辑器」真实链路验证 + 项目恢复后 UI 项目名为空问题修复。

## 1. 修复对账

| # | 问题 | 根因 | 修复 | 验证 | 状态 |
|---|------|------|------|------|------|
| 1 | 正文「插入到编辑器」之前 E2E 报告 tabs:[] | 验证脚本选择器写成 `.editor-tab/[data-editor-tab]`，真实 DOM 是 `.chapter-tabs .tab` | 应用无需改；更新验证方法读取 editorStore + `.chapter-tabs .tab` | CDP 真实点击后 editorStore 第一章 tab `isDirty:false→true`，DOM 显示 `第一章：黑雾拾荒*x` | ✅ |
| 2 | 上次项目恢复后左侧树显示「未打开项目」 | 项目 JSON 里 `projectName` 为空；`handleImport` 和 `handleLockOutline` 只在该项目 ID 为空时设名字 | 新增 `nameFromOutline`/`readProjectName` 兜底；`handleImport` 从文件名或 outline 首行取项目名；`loadProject` 无 projectName 时回写保存 | store `projectName:"测试大纲txt内容"`，DOM `.tree-header` 文本同步，项目 JSON 已回写 `projectName` | ✅ |
| 3 | 长轮询等待生成时超时 | E2E 脚本 `waitForFunction` 默认 30s 覆盖传入 150s | 后续验证改用手动轮询（part2 已用对） | part2 完整跑通五层 | ✅ |

## 2. CDP 操作日志

连接方式：`chromium.connectOverCDP('http://127.0.0.1:9227')`

```text
[CONNECT] ok
[PAGE] file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html
[UI] #btn-pipeline visible=true
[OPENING] pipeline panel
[PIPELINE BTN] count=1 -> click
[BTN #btn-pl-insert-body] count=1, disabled=false -> click
[EVENTS insert-text] captured 4 events, each hasText=true, textLen=4062, chapterId="ch----------001", title="第一章：黑雾拾荒"
[editorStore] before: tabs=3, activeTabId="tab-ch----------001", activeTabLen=4062, isDirty=false
[editorStore] after:  tabs=3, activeTabId="tab-ch----------001", activeTabLen=4062, isDirty=true
[DOM .chapter-tabs .tab] before="第一章：黑雾拾荒x" after="第一章：黑雾拾荒*x"
```

项目恢复 UI 验证（重启源文件启动器后）：

```text
[PINIA project] currentProjectId="prj_msbtqnpe_q24wr3"
[PINIA project] projectName="测试大纲txt内容"
[DOM #current-project-name .project-name]="测试大纲txt内容"
[DOM hasUnopenedText]=false
[DISK wa_project_prj_msbtqnpe_q24wr3.json] projectName="测试大纲txt内容"
```

## 3. 存储实际数据

本项目为 Electron 文件存储（JSON），不是 IndexedDB。关键字段来自
`C:\Users\凯瑞\AppData\Roaming\shenyi-assistant\data\wa_project_prj_msbtqnpe_q24wr3.json`：

```json
{
  "projectName": "测试大纲txt内容",
  "outlineText": "（9字符）",
  "outlineLocked": true,
  "volumesConfirmed": true,
  "chaptersConfirmed": true,
  "settingsGenerated": true,
  "volumes": 4,
  "settings": 7,
  "chapters": { "第一卷：雾渊觉醒": 15 }
}
```

编辑器 tab（editorStore）真实数据：

```json
[
  { "id": "tab-ch----------001", "title": "第一章：黑雾拾荒", "chapterId": "ch----------001", "len": 4062, "isDirty": false },
  { "id": "tab-ch----------002", "title": "第二章：幽晶心跳", "chapterId": "ch----------002", "len": 0 },
  { "id": "tab-ch----------003", "title": "第三章：异端之影", "chapterId": "ch----------003", "len": 0 }
]
```

## 4. 结论

- 正文生成 → 插入编辑器链路完整：`PipelinePanel.insertToEditor()` dispatch `insert-text` → `App.vue handleInsertText` → `editorStore.openTab` / `updateContent`。
- 项目恢复后不再只是数据层有值，左侧章节树 UI 实际显示项目名，未再出现「未打开项目」。
- 截图：`_audit/project_ui_verified.png`。
