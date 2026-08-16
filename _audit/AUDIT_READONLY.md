# 神意助手只读审计报告
生成时间: 2026-08-16T11:54:43.191Z
类型: 只读检查（不修改应用状态）

## 汇总
|状态|数量|
|---|---|
|PASS|23|
|FAIL|3|
|SKIP|0|
|Total|27|

## 详细结果
|ID|名称|状态|详情|
|---|---|---|---|
|R01|侧边栏导航|FAIL|sidebar-nav 存在|
|R02|章节树区域|PASS|chapter-tree 存在|
|R03|编辑器面板|PASS|editor-panel 存在|
|R04|聊天面板|PASS|chat-panel 存在|
|R05|大纲工作台按钮|PASS|btn-outline-workspace 存在|
|R06|流水线按钮|PASS|btn-pipeline 存在|
|R07|项目按钮|PASS|btn-open-project 存在|
|R08|设置按钮|PASS|btn-settings 存在|
|R09|流水线面板打开|PASS|pipeline-panel 存在|
|R10|流水线五层均可见|PASS|5层全部可见|
|R11|步骤导航条|PASS|pl-step 数量=5|
|R12|各层选择器|FAIL|0/15 存在|
|R13|AI工具按钮行|PASS|9/9 存在|
|R14|新增设定按钮|PASS|新增设定按钮存在|
|R15|Pinia store 存在|PASS|project/pipeline/editor/chat 全部加载|
|R16|Project store 结构|PASS|{"hasCurrentProjectId":true,"projectName":"回归测试项目","outlineTextLen":60,"outlineLocked":true,"volumesCount":1,"chaptersCount":1,"settingsCount":2,"hasProjectNames":false}|
|R17|Pipeline store 结构|PASS|{"currentStep":1,"hasMaterial":false,"hasSettings":false,"hasSkills":false,"hasAgents":false}|
|R18|Editor store 结构|PASS|{"activeTabId":null,"tabsCount":0,"contentLen":0,"hasRecentFiles":false}|
|R19|Chat store 结构|PASS|{"activeSessionId":"chat_1786830563089_7eorq3","sessionsCount":2}|
|R20|electronAPI 存在|PASS|methods=12|
|R21|持久化存储方法|FAIL|storageRead/Write/Remove 存在|
|R22|设置弹窗打开|PASS|settings-modal 存在|
|R23|设置多标签页|PASS|tabs=6|
|R24|章节树卷节点|PASS|volume-item 存在|
|R25|章节树章节点|PASS|chapter-item 存在|
|R26|控制台关键错误|PASS|无|
|RSUM|审计总览|23/26通过|PASS=23 FAIL=3 SKIP=0 TOTAL=26|