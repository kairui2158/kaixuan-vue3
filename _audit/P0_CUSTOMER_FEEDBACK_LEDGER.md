# P0 — 客户反馈对账表（重新建立，2026-08-19）

启用时间：2026-08-19
状态：已建立，13 项全部待逐项真实验证
规则引用：C1-C4（工作区清理）、J15-J18（验证边界）、行为等价最高约束
构建：`npx vite build` 通过（151 modules）
Git：`7a6df94`（P10 修复）
启动器：`start-electron.bat`（CDP 9227）

---

| # | 问题 | 本次现状（CDP 实测） | 证据位置 | 结论 |
|---|------|---------------------|---------|------|
| 1 | 项目管理无法全部删除，存在占位项目 | 删除全部项目→列表为空→`暂无项目`→lastProjectId=null→项目键全清→重启无占位，PASS（新建/列出/删除当前/删除最后一个/新旧格式键全清/重启不占位均实测） | `_p1_verify.cjs` 输出 + `_p1_restart.cjs` 输出（verdict: PASS） | ✅ PASS |
| 2 | 大纲文件导入按钮无亮度、仅 TXT | 大纲工作台可打开；导入按钮/accept 需在 P2 实测 | P2 阶段验证记录 | 待验证 |
| 3 | 大纲 AI 共创未连通 API | 真实 POST /chat/completions 捕获；AI 回复 OK；复制/插入/替换/重生成全部生效；outlineChat storeLen=2=storedLen 持久化成功 | `_audit/tmp/p3_ui_verify_result.json` + `_audit/tmp/p3_chat_reply.png` + `_audit/tmp/p3_chat_final.png` | ✅ PASS |
| 4 | 锁定后跳转流水线大纲层+按钮重复 | 锁定后 currentStep=0 自动进入流水线大纲层；大纲层 actions 只有 1 个按钮 `确认字数并进入下一步`；字数 88 万→store bookWordCountChars=880000→设定层显示 `88 万字`→存储持久化 | `_audit/tmp/p4_ui_verify_result.json` + `_audit/tmp/p4_after_confirm.png` | ✅ PASS |
| 5 | 设定层无 API 滚动/进度条 | 点击 AI设定生成：反馈面板可见，进度 10→100，API 日志 4 条实时滚动；AI 返回生成 5 个动态分类（角色/异能/组织/地点/设定类）、10 个设定项；绑定生效并持久化 `isBound=true`；确认该类→`settingsGenerated=true`；确认/保存→`currentStep=2` 卷纲层、步骤 2 完成；项目存储含完整 `settingsCollection` | `_audit/tmp/p5_ui_verify_result.json` + `_audit/tmp/p5_after_generation.png` + `_audit/tmp/p5_after_confirm.png` | ✅ PASS |
| 6 | 卷纲层无卷框内滚动 | 卷框按钮存在：保存并锁定本卷/删除本卷/AI生成全卷/逐卷生成/确认完成下一步 | P6 阶段验证记录 | 待验证 |
| 7 | 卷纲层无字数联动 | 卷纲层当前显示 1 卷；大纲字数联动需 P6 验证 | P6 阶段验证记录 | 待验证 |
| 8 | 卷框无保存/删除 | `btn-pl-save-volume-0`、`btn-pl-delete-volume-0` 存在且 enabled | P6 阶段验证记录 | 待验证 |
| 9 | 卷纲层按钮冗余 | 底部 3 个：AI生成全卷/逐卷生成/确认完成下一步 | P6 阶段验证记录 | 待验证 |
| 10 | 章节层无生成时无章节框 | 章节层 AI生成/自动生成/确认完成全部 disabled | P7 阶段验证记录 | 待验证 |
| 11 | 章节层字数→章节数联动 | 章节层无章节框；需选锁定卷+单章字数后验证 | P7 阶段验证记录 | 待验证 |
| 12 | 正文层生成→编辑器 | AI生成正文 enabled，插入到编辑器/确认完成 disabled | P8 阶段验证记录 | 待验证 |
| 13 | SKILL 模式只留串行/并行 | 各层模式显示：并行/串行 | P9 阶段验证记录 | 待验证 |

---

## P0 实测补充

1. 流水线 5 层全部存在于 DOM，步骤 2-5 内容区 `display:none`，由前置状态驱动显示。
2. 大纲层（step1）当前已有旧测试数据："确认字数并进入下一步" 已 enabled。
3. 卷纲层已存在 1 卷测试数据，卷框按钮齐全。
4. 根目录仍含上一周期提交进 Git 的临时脚本（`cdp_*.js`、`_*.py`、`test_*.js` 等），P12 清理；P0 不改业务代码。

## 执行纪律

1. 按 P1→P2→P3→P4→P5→P6→P7→P8→P8.5→P9→P10→P11→P12 顺序执行。
2. 每阶段：改码→构建→杀进程→start-electron.bat→CDP→DOM/store/持久化→截图+日志→更新对账表→经验文件→Git push。
3. 未通过真实行为验证，不标记完成。
