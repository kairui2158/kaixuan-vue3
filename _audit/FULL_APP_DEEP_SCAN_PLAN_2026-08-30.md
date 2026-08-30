# 全应用深度扫描彻查计划（2026-08-30）

## 基线（本轮实测确认）

| 项目 | 现状 | 证据 |
|---|---|---|
| 版本 | 3.8.3 | package.json |
| 最新提交 | 9de54df fix(exit): 保存退出时无打开章节不再弹出提示窗 | git log |
| 未推送提交 | master 领先 origin/master 6 个提交（Rule 9 违约，P7 处理） | git status -sb |
| 工作区 | 干净 | git status --short |
| 测试 | vitest 13 文件 104 测试（3.8.3 封装时） | DEV_LOG |

## 计划依据

1. 经验文件规则 1-12（行为等价、修复纪律、验证纪律、脚本纪律、UI 统一、链路完整性、GitHub 同步、经验回写、验证作用域、防无限回滚）。
2. 2026-08-26 遗留核销补充规则 11 条（统一入口分语义、安装包不等于安装验证、死代码三面闭包、构建/类型/测试分开记录等）。
3. 错误类型 A-J 全部教训（选择器诊断、computed style、Promise await、启动器生命周期等）。
4. 本轮预扫描新证据：7 处裸 confirm、25 处 alert、useDeAi stream 语义冲突、引擎休眠路径、6 个未推送提交。

## 执行总则

1. P0-P6 全程只读扫描，不改业务代码；P7 仅做仓库卫生（push 属交付动作）。
2. 所有发现先入台账分级，修复需用户审批后按"一次一个闭环"执行（规则 3 + C4）。
3. 台账分级：P0=丢数据/坏功能、P1=客户可感知、P2=体验瑕疵、P3=记录在案。
4. 每项发现必须有 file:line + 命令原始输出；扫描完成后立即写入台账（I4 教训）。
5. 脚本一律只读、try/finally、复杂脚本写文件执行、选择器先诊断后使用（规则 5 + I/J 教训）。
6. 验证走真实 Electron：构建 → 杀进程 → start-electron.bat → CDP → store+DOM 双证据（C2 + 规则 4/6）。

---

## P0 基线冻结与台账建立

- [ ] 记录 git 状态、版本号、最新提交（已完成上表，写入台账确认）。
- [ ] 三项独立基线：`npm run type-check`、`npx vitest run`、`npm run build:vue`，分别记录原始输出（不互相覆盖结论）。
- [ ] 杀进程 → start-electron.bat → CDP 连通 → 主界面基线截图。
- [ ] 建立台账文件 `_audit/FULL_APP_DEEP_SCAN_LEDGER_2026-08-30.md`，预置 P1-P8 全部条目与证据列。

## P1 交互与生命周期链路扫描

扫描点：
- 全局事件监听配对：rg 所有 addEventListener/dispatchEvent，核对 App.vue、EditorPanel、ChatPanel、AiNamingModal 的监听与清理（open-ai-naming、ai-naming-insert、insert-text、editor-save 等）。
- 退出链路复测：finalSave → ExitConfirmModal → editor-save → handleSaveEvent（验证 9de54df 修复），并搜索是否还有同类"保存事件无守卫"的兄弟消费点。
- 章节树联动回归：ChapterTree 打开 5 类标签（正文/卷纲/章概等）→ 编辑器 → ChatPanel 同步芯片（验证 953fe6a 修复无回归；rg 确认 getStepAgents/getStepSkills 无其他同步消费点）。
- 面板开闭：流水线/记忆/设置/大纲工作台的最小化、还原、esc、遮罩、z-index 层级互斥。
- 状态恢复：activeTab 持久化、章节树选中态、面板开闭态重启回读。

验收勾选：
- [ ] 事件监听配对清单（无泄漏、无重复注册）。
- [ ] 退出三路径实测（保存退出 / 不保存退出 / 无章节时保存退出，均无异常弹窗）。
- [ ] 章节树 5 类标签联动 CDP 证据（编辑器标题 + 对话栏宽度 + console 无错）。
- [ ] 发现项全部入台账。

## P2 原生对话框与 alert/confirm 全量清单

扫描点（本轮预扫描已定位）：
- 裸 `confirm()` 7 处：ChapterTree.vue:252,253（删除卷/章）、ChatPanel.vue:716（替换整章确认）、MemoryPanel.vue:242,278,286（删记忆/覆盖导入/合并导入）、ProjectModal.vue:83（删项目）。ai-naming 日志已证实 contextIsolation 下 confirm 可能失效，同模式风险。
- `alert()` 25 处：MemoryPanel 13、AppearanceSettings 6、EditorPanel 4、OutlineWorkspace 1、ProjectModal 1。
- 原生文件对话框：全部导入/导出入口逐个核（J15：句柄 + 控件识别 + 截图三类证据）。

验收勾选：
- [ ] 32 处逐条台账（文件/行号/触发条件/文案/风险等级）。
- [ ] Electron 下裸 confirm 至少实测 1 处（复现失效或排除风险，附证据）。
- [ ] 修复建议清单：window.confirm 统一替换 vs 自研确认弹窗，成本与行为等价对比。

## P3 AI 调用收敛与语义复查

扫描点：
- 直连绕过：rg 全仓 `fetch(`、`chat/completions`，排除 aiService.ts 本体与 spec，要求 0 直连或逐条豁免说明。
- stream 语义判定表：
  - `useDeAi.ts:30` rewrite 用途传 stream:false —— 与收敛规则"生成/重写默认流式"冲突，判定是否故意（分块重写场景）并给结论。
  - `ChatPanel.vue:538-551` 三处 stream:false —— 聊天场景语义判定（引擎预处理阶段合理 / 最终输出应流式）。
  - `useAiTools.ts:75` @deprecated 死代码 —— 三面闭包后建议删除或保留。
  - namingService / EditorPanel 记忆抽取 —— JSON 场景非流式合理。
- 引擎休眠路径三面闭包：PipelinePanel.vue:2054-2064 的 split-merge/multi-step 引擎分支在 UI 模式归一化（:2856 只留 chain/compose）后 UI 不可达；但 ChatPanel.vue:515-552 仍按 skill.executionMode 消费 split-merge/multi-step。按 2026-08-26 规则 3 出保留/删除结论。
- config-exchange 导入校验：bindings.modes 是否校验合法值，能否注入 split-merge/multi-step 绕过 UI 限制。
- purpose 路由对齐：逐调用点核对 meta.source 与 purpose（generate/rewrite/verify/detect/image/video）。
- 模型获取 / 插件市场 / MCP 与生成调用语义分离（不强行合并）。

验收勾选：
- [ ] 直连点清单 = 0 或逐条豁免。
- [ ] stream 语义判定表逐行结论。
- [ ] 引擎休眠路径三面闭包结论。
- [ ] config-exchange 模式白名单测试证据。
- [ ] purpose 对照表（调用点/文件/行号/purpose/meta）。

## P4 数据一致性与持久化

扫描点：
- 记忆导入双模式回归：merge 走 mergeImportedMemory + recordMemoryChange 版本记录，replace 显式确认且同样有版本记录（MemoryPanel.vue:264-293）；确认后项目 JSON diff 只动 memories 字段。
- 项目 JSON 差异核对：导入记忆 / 生成章节 / 退出保存 三个操作的前后快照 diff（目标字段变化、非目标字段不动，C1）。
- aiNaming 收藏/历史跨进程恢复（3.8.0 日志标记 UNVERIFIED，本轮补验）。
- 卷绑定 isBound/boundTo 与章节层锁定联动持久化（volume-P4/P5 修复回归）。
- 旧配置兼容：skillAgentBindings 旧 index 键迁移（skillAgentBinding.ts migrate）、bookWordCount 默认值、wa_pipeline_step_config 缺失容错。
- 存储 API Promise 消费复查：rg 所有 storageRead/storageWrite 调用点确认 await（J1 教训，防 [object Promise] 类键名）。

验收勾选：
- [ ] 每项持久化操作有 before/after JSON 证据。
- [ ] 重启恢复清单（杀进程 → start-electron.bat → 回读一致）。
- [ ] 兼容迁移测试证据（旧键 → 新键映射正确）。

## P5 声明与实现差距

扫描点：
- SKILL 结构化字段消费对账：outputFormat / inputSchema / outputSchema / validate / retryPolicy 在 skillValidation.ts 与 PipelinePanel 调用边界的实际消费（对照 P5 报告复核，防实现回退）。
- Agent 绑定：`{step}-{skillId}` 稳定键、旧 index 键迁移、per-skill > step > 默认优先级（skillAgentBinding.ts + callApiWithAgent:1976 链路）。
- body/metadata 分离：parseGenerationResult → ch.body / ch.generationMetadata 链路复核；【来源覆盖】类标记是否真的不进正文（实测一次生成）。
- 章节执行包：chapterExecutionPackage 生成 → buildChapterExecutionPrompt 消费闭环。
- 叙事校验边界：结构校验（数量/必填/重复）与语义校验（事件/伏笔/状态）的边界是否在帮助菜单/教学指南中如实声明。
- 帮助菜单 vs 实际功能 diff（c2e2842 新增教学指南，防说明书超前或滞后）。
- 版本四位一致：package.json / 关于页 / UA / 安装包文件名。

验收勾选：
- [ ] 声明-实现对账表逐行勾选（实际消费 / 只存不用 / 不存在）。
- [ ] 帮助菜单 vs 实际功能 diff 清单。
- [ ] 版本一致性核对证据。

## P6 UI 一致性与溢出递归

扫描点：
- 设置页溢出复验（客户反馈：Agent/Skill 导入功能上线后出现文字溢出；检查 SkillSettings、AgentSettings 卡片、导入预览弹窗、绑定弹窗、general 徽标）。
- tokens.css 合规：rg 组件内硬编码色值/字号，按生产入口 / 历史资料 / 测试脚本三面分层（不误删历史基准）。
- 全弹窗递归遍历：设置页全部标签、记忆面板四视图、AI 命名 7 标签、流水线 5 层、大纲工作台，在 1366×768 与 1920×1080 两档视口逐个打开。
- 溢出检测脚本复用前先诊断选择器（J17 教训）；面板类用 getComputedStyle 判可见（I3 教训）。
- 三态完整性：生成中 / 失败 / 空态的显示与布局。

验收勾选：
- [ ] 两档视口全弹窗遍历截图 + overflow 检测原始输出。
- [ ] 硬编码色值清单（分层标注）。
- [ ] 设置页溢出现状判定（复现 / 已修复，附证据）。

## P7 仓库与交付卫生

- [ ] 6 个未推送提交：逐个核对内容 → push → 远程 HEAD 核对（Rule 9 补账）。
- [ ] 工作区 clean + _audit/tmp 残留清理 + 根目录散落文件检查。
- [ ] package.json 与 package-lock.json 版本一致。
- [ ] .gitignore 覆盖 dist / dist-renderer / node_modules 核对。

## P8 真实 Electron 冒烟与收尾

- [ ] 全主流程 CDP 冒烟：新建项目 → 导入大纲 → 大纲工作台 → 确认锁定 → 流水线五层空态 → 设置页 → 记忆面板 → AI 命名弹窗。
- [ ] 安装包人工冒烟清单产出（安装版无 CDP，交付客户手工步骤：启动 / 导入 / 生成 / 重启恢复，逐项可勾选）。
- [ ] 台账汇总：P0-P3 分级统计 + 修复批次建议单（每批一个闭环，待用户审批，不在本轮执行）。
- [ ] 经验文件 + DEV_LOG 回写（含本轮脚本教训，规则 10）。
- [ ] 最终报告 `_audit/FULL_APP_DEEP_SCAN_REPORT_2026-08-30.md`。

---

## 产出物

1. 台账：`_audit/FULL_APP_DEEP_SCAN_LEDGER_2026-08-30.md`（逐条证据）。
2. 报告：`_audit/FULL_APP_DEEP_SCAN_REPORT_2026-08-30.md`（分级结论 + 修复批次建议）。
3. 安装包人工冒烟清单（客户可执行）。
4. 经验文件 + 开发日志回写。

## 执行边界

- 本计划全程只读，不改业务代码；唯一例外 P7 的 git push（仓库卫生）。
- 修复在台账审批后按"一次一个闭环"另起执行，不做批量修改。
- 扫描中如发现 P0 级数据丢失风险，立即暂停上报，不等扫描结束。
