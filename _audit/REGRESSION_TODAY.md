# 神意助手回归验证报告

生成时间: 2026-08-16T11:39:10.938Z

## 汇总
|状态|数量|
|---|---|
|PASS|67|
|FAIL|0|
|WARN|0|
|Total|68|

## 详细结果
|ID|名称|状态|详情|
|---|---|---|---|
|P1|页面标题|PASS|标题: 神意助手|
|P2|App根节点|PASS|存在|
|P3|侧边栏(sidebar-nav)|PASS|存在|
|P4|章节树|PASS|存在|
|P5|编辑器|PASS|存在|
|P6|聊天面板|PASS|存在|
|P7|electronAPI|PASS|35 methods|
|P8|Pinia stores|PASS|agent,provider,project,settings,deai,skill,pipeline,editor,theme,chat|
|SB:#btn-outline-workspace|侧边栏#btn-outline-workspace|PASS|可见|
|SB:#btn-pipeline|侧边栏#btn-pipeline|PASS|可见|
|SB:#btn-memory|侧边栏#btn-memory|PASS|可见|
|SB:#btn-plugin-market|侧边栏#btn-plugin-market|PASS|可见|
|SB:#btn-settings|侧边栏#btn-settings|PASS|可见|
|SB:#btn-dashboard|侧边栏#btn-dashboard|PASS|可见|
|SB:#theme-toggle-btn|侧边栏#theme-toggle-btn|PASS|可见|
|SB:#btn-settings-collection|侧边栏#btn-settings-collection|PASS|可见|
|OW:#btn-import-outline|大纲#btn-import-outline|PASS|可见|
|OW:#btn-save-outline|大纲#btn-save-outline|PASS|可见|
|OW:#btn-lock-outline|大纲#btn-lock-outline|PASS|可见|
|OW:#btn-ai-co-create|大纲#btn-ai-co-create|PASS|可见|
|OW:#btn-export-outline-md|大纲#btn-export-outline-md|PASS|可见|
|OW:#btn-export-outline-txt|大纲#btn-export-outline-txt|PASS|可见|
|OW:#btn-generate-outline-skills|大纲#btn-generate-outline-skills|PASS|可见|
|OW:#btn-close-outline-workspace|大纲#btn-close-outline-workspace|PASS|可见|
|PL:step1|流水线第1层|PASS|可见|
|PL:step2|流水线第2层|PASS|可见|
|PL:step3|流水线第3层|PASS|可见|
|PL:step4|流水线第4层|PASS|可见|
|PL:step5|流水线第5层|PASS|可见|
|PL:#btn-pl-confirm-outline|流水线确认大纲|PASS|可见|
|PL:#btn-pl-gen-settings|流水线AI生成设定|PASS|可见|
|PL:#btn-pl-save-settings|流水线保存设定|PASS|可见|
|PL:#btn-pl-confirm-settings|流水线确认设定|PASS|可见|
|PL:#btn-pl-gen-volumes|流水线AI生成全卷|PASS|可见|
|PL:#btn-pl-gen-single-volume|流水线逐卷生成|PASS|可见|
|PL:#btn-pl-create-volumes|流水线自动卷纲|PASS|可见|
|PL:#btn-pl-continue-volumes|流水线续生成|PASS|可见|
|PL:#btn-pl-confirm-volumes|流水线确认卷纲|PASS|可见|
|PL:#btn-pl-gen-chapters|流水线AI生成章节|PASS|可见|
|PL:#btn-pl-autogen-chapters|流水线自动章节|PASS|可见|
|PL:#btn-pl-confirm-chapters|流水线确认章节|PASS|可见|
|PL:#btn-pl-gen-body|流水线AI生成正文|PASS|可见|
|PL:#btn-pl-insert-body|流水线插入编辑器|PASS|可见|
|PL:#btn-pl-confirm-body|流水线确认正文|PASS|可见|
|PL:ai:#btn-ai-names|AI工具#btn-ai-names|PASS|可见|
|PL:ai:#btn-writing-rules|AI工具#btn-writing-rules|PASS|可见|
|PL:ai:#btn-timeline|AI工具#btn-timeline|PASS|可见|
|PL:ai:#btn-batch-review|AI工具#btn-batch-review|PASS|可见|
|PL:ai:#btn-revise|AI工具#btn-revise|PASS|可见|
|PL:ai:#btn-translate|AI工具#btn-translate|PASS|可见|
|PL:ai:#btn-style-convert|AI工具#btn-style-convert|PASS|可见|
|PL:ai:#btn-regenerate|AI工具#btn-regenerate|PASS|可见|
|PL:ai:#btn-modify|AI工具#btn-modify|PASS|可见|
|SC|设定合集面板|PASS|存在|
|PM|项目弹窗|PASS|存在|
|PM:vis|项目弹窗可见|PASS|可见|
|SM|设置弹窗|PASS|存在|
|IDB|IndexedDB数据库|PASS|novel-workshop|
|CHAT|聊天面板按钮|PASS|5 buttons|
|CHAT:copy|聊天-复制|PASS||
|CHAT:regen|聊天-重生成|PASS||
|CHAT:insert|聊天-插入|PASS||
|CHAT:replace|聊天-替换|PASS||
|CTREE|章节树按钮|PASS|10 buttons|
|CTREE:gen|章节树-生成|PASS||
|CTREE:project|章节树-项目|PASS||
|IPC|IPC接口方法数|PASS|33 methods|
|SUMMARY|验证总览|67/67通过|67 PASS, 0 FAIL, 0 WARN, 共67项|

## CDP操作日志
```
=== CDP LOG START ===
page: file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html
[PASS] 页面标题: 标题: 神意助手
[PASS] App根节点: 存在
[PASS] 侧边栏(sidebar-nav): 存在
[PASS] 章节树: 存在
[PASS] 编辑器: 存在
[PASS] 聊天面板: 存在
[PASS] electronAPI: 35 methods
[PASS] Pinia stores: agent,provider,project,settings,deai,skill,pipeline,editor,theme,chat
[PASS] 侧边栏#btn-outline-workspace: 可见
[PASS] 侧边栏#btn-pipeline: 可见
[PASS] 侧边栏#btn-memory: 可见
[PASS] 侧边栏#btn-plugin-market: 可见
[PASS] 侧边栏#btn-settings: 可见
[PASS] 侧边栏#btn-dashboard: 可见
[PASS] 侧边栏#theme-toggle-btn: 可见
[PASS] 侧边栏#btn-settings-collection: 可见
--- Click btn-outline-workspace ---
[PASS] 大纲#btn-import-outline: 可见
[PASS] 大纲#btn-save-outline: 可见
[PASS] 大纲#btn-lock-outline: 可见
[PASS] 大纲#btn-ai-co-create: 可见
[PASS] 大纲#btn-export-outline-md: 可见
[PASS] 大纲#btn-export-outline-txt: 可见
[PASS] 大纲#btn-generate-outline-skills: 可见
[PASS] 大纲#btn-close-outline-workspace: 可见
--- Click btn-pipeline ---
[PASS] 流水线第1层: 可见
[PASS] 流水线第2层: 可见
[PASS] 流水线第3层: 可见
[PASS] 流水线第4层: 可见
[PASS] 流水线第5层: 可见
[PASS] 流水线确认大纲: 可见
[PASS] 流水线AI生成设定: 可见
[PASS] 流水线保存设定: 可见
[PASS] 流水线确认设定: 可见
[PASS] 流水线AI生成全卷: 可见
[PASS] 流水线逐卷生成: 可见
[PASS] 流水线自动卷纲: 可见
[PASS] 流水线续生成: 可见
[PASS] 流水线确认卷纲: 可见
[PASS] 流水线AI生成章节: 可见
[PASS] 流水线自动章节: 可见
[PASS] 流水线确认章节: 可见
[PASS] 流水线AI生成正文: 可见
[PASS] 流水线插入编辑器: 可见
[PASS] 流水线确认正文: 可见
[PASS] AI工具#btn-ai-names: 可见
[PASS] AI工具#btn-writing-rules: 可见
[PASS] AI工具#btn-timeline: 可见
[PASS] AI工具#btn-batch-review: 可见
[PASS] AI工具#btn-revise: 可见
[PASS] AI工具#btn-translate: 可见
[PASS] AI工具#btn-style-convert: 可见
[PASS] AI工具#btn-regenerate: 可见
[PASS] AI工具#btn-modify: 可见
--- Click btn-settings-collection ---
[PASS] 设定合集面板: 存在
--- Click btn-open-project ---
[PASS] 项目弹窗: 存在
[PASS] 项目弹窗可见: 可见
--- Click btn-settings ---
[PASS] 设置弹窗: 存在
--- IndexedDB check ---
[PASS] IndexedDB数据库: novel-workshop
IndexedDB data: {
  "novel-workshop": {}
}
--- Chat panel check ---
[PASS] 聊天面板按钮: 5 buttons
[PASS] 聊天-复制: 
[PASS] 聊天-重生成: 
[PASS] 聊天-插入: 
[PASS] 聊天-替换: 
--- Chapter tree check ---
[PASS] 章节树按钮: 10 buttons
[PASS] 章节树-生成: 
[PASS] 章节树-项目: 
--- IPC methods check ---
[PASS] IPC接口方法数: 33 methods
[67/67通过] 验证总览: 67 PASS, 0 FAIL, 0 WARN, 共67项
=== SUMMARY: PASS=67 FAIL=0 WARN=0 TOTAL=68 ===
```

## IndexedDB数据
```
{
  "novel-workshop": {}
}
```
