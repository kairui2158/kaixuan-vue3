# Task Ledger: Active Plan Continuation

## 1. 目标原话

用户确认执行跨轮执行计划续接方案：修复 T1 建计划后 `needs_user`、T2 讨论、T3 确认被当成新任务重建计划的断裂；执行计划、授权节选、状态路由、超时策略和双入口必须单源一致。

## 2. 门禁读证

- 已执行 preflight：`git status --short` 为空；分支 `codex/direct-write-negative-verification`；基线提交 `8db068d`。
- 已重新加载 executing-plans、test-driven-development、verification-before-completion 技能。
- 已复核 L0-L4 关键接线：`activeExecutionTaskStore.ts`、`chainIntentRouter.ts`、`longDocumentExecutionPlanner.ts`、`editorTools.ts`、`dialogueToolSurface.ts`、`agentOrchestrator.ts`、`OutlineWorkspace.vue`、`ChatPanel.vue`。
- 硬约束：G0.9/G0.10 禁止新旧链路并存；G0.11 真实 UI 禁注入冒充；G1.10 权限三元组单源；守卫阈值不放宽；无证据不声明完成。

## 3. 路由判定

- 主线：L0 状态单源 -> L1 状态优先路由 -> L2 授权节选守卫 -> L3 计划复用 -> L4 双入口对称 -> 回归 -> Electron 真实 UI。
- 反证：`discuss/analyze` 必须保持只读；确认句只有存在有效 `awaiting_user_plan` 时才路由 edit；文档版本或 hash 变化时旧计划必须失效。

## 4. 影响圈与作者反证

- 影响：任务存储、意图路由、污染守卫、工具面、执行 planner、大纲工作台双入口、首页 ChatPanel、运行 trace、相关测试。
- 反证点：不得恢复预览状态机；不得放宽写入守卫阈值；不得让 SKILL/workflow 覆盖权限；不得出现旧 `active` 路径与新 `awaiting_user_plan` 并存分叉。

## 5. 停止条件

- L0-L4 单元与集成测试红绿完成。
- 定向 vitest、`npm run test:services`、`npm run type-check` 全部有原始通过输出。
- Electron 级真实 UI 三连轮复刻完成并留证据。
- DEV_LOG、经验文件、台账闭环；版本封装等待用户再次确认。

## 6. 执行证据

### 6.1 主线：跨轮 active plan continuation

- Electron 真实 UI 复刻通过：`_audit/verification-api-direct-write-electron/14-outline-active-plan-continuation.png`。
- T1 记录 `active-plan-awaiting-user`，未发生写入；T2 保持只读工具面，未重建计划；T3 复用同一 `planId`，真实执行 `editor.write` 并收敛 `edit-task-task-finished`。
- 服务总套件：`npm run test:services` → `Test Files 133 passed (133)`，`Tests 1562 passed (1562)`。

### 6.2 追加发现与修复：1M 文档 `editor.read_range` 坐标语义缺陷

- 复刻失败现场：1M 场景中 `editor.read_range` 对 `section-1` 与 `section-20000` 返回 `invalid_range: offset 0 超出节内容长度 0`，写入批次为 0。
- TDD 红测：`npm run test:services -- src/services/editorDocumentMap.spec.ts` → `1 failed | 13 passed`；失败用例 `read_range reads a heading-only section as addressable content`，`result.ok` 为 false。
- 根因：[editorDocumentMap.ts](D:/codex/novel-workshop-vue3/src/services/editorDocumentMap.ts:311) 与 [editorDocumentMap.ts](D:/codex/novel-workshop-vue3/src/services/editorDocumentMap.ts:341) 使用 `section.charCount`（不含标题的正文长度）校验 offset，但实际读取坐标是 `section.start` 到 `section.end`（标题 + 正文）。标题独占节 `charCount=0`，被误判不可读；尾部分页 offset 超过正文长度后也被误拒。
- 修复：`read_range` 两个入口统一使用 `Math.max(0, section.end - section.start)` 作为节内可读长度；未修改 `outlineStructure.charCount` 语义，未放宽任何写入安全阈值。
- 定向测试转绿：`npm run test:services -- src/services/editorDocumentMap.spec.ts` → `Test Files 1 passed (1)`，`Tests 14 passed (14)`。
- 回归：`npm run test:services` → 133 files / 1562 tests 全绿。
- 类型：第一次 `npm run type-check` 抓到测试文件 `result.data` 为 `unknown` 的 3 处类型错误；修正测试类型收窄后，`npm run type-check` 通过。
- 构建：`npm run build:vue` 通过；输出仅含既有登记的 Node externals、chunk size 与 Vite native config warning。
- Electron 真实 UI 全量复刻：`node scripts/verify-api-direct-write-electron.mjs` → `===== API DIRECT WRITE ELECTRON STRESS E2E PASSED =====`；1M 场景截图 `_audit/verification-api-direct-write-electron/13-outline-million-document-edit-task.png`，其中整篇替换被 `document_too_large_for_whole_replacement` 正确拒绝，分批路径完成。

### 6.3 回头看补漏（本轮追加）

- 复查 `PlainDialogueIntent = analyze | edit | generate | discuss` 与 planner 的只读意图归一逻辑：`analyze` 会归一为 `discussion`，等待计划保留判定天然覆盖；已新增 `activePlanContinuation.spec.ts` 断言，防止后续改动破坏该分支。
- 授权摘录补齐 `analyze`：`ChatPanel.vue` 与 `OutlineWorkspace.vue` 的讨论后摘录条件从 `discuss` 扩为 `discuss | analyze`，双入口一致。
- 按新旧并存清零原则删除无生产调用点的 `markStatus`，并更新对应测试。
- 验证：定向 6 个 spec `178/178` 通过；全量服务测试与 type-check 见本轮最终记录。

### 6.4 回头看二轮（本轮追加）

- 大纲入口自锁回归：`outlineSendStarting` 被并入 `outlineInputBlocked` 后，`askAi` 在同一次发送内被自己拦截，出现 `[OUTLINE TIMEOUT]` 且无 API 请求。修复为新增 `outlineExecutionLocked` 只看生成态；`outlineInputBlocked` 仅负责 UI 防重复提交。首页补 `homeSendStarting` 防重复提交，无对称自锁路径；`directWriteWiring.spec.ts` 增加双入口守卫并完成红灯验证。
- Electron 验证脚本 `respond()` 旧引用已删除的 `scenarioCount`，会抛 `ReferenceError`；修复为读取本轮请求记录内的 `requestCount`，并修正每个 scenario/turn 的计数语义。
- 首个格式编辑场景文案被本地 `normalize` 转换分流，未走 API 直写；场景改为 `请把第二章内容替换成新的第二章大纲`，mock 分类器同步补词。
- 验证：`npm run test:services` → `Test Files 133 passed (133)`、`Tests 1565 passed (1565)`；`npm run type-check` 通过；`node scripts/verify-api-direct-write-electron.mjs` 连续两轮输出 `===== API DIRECT WRITE ELECTRON STRESS E2E PASSED =====`。脚本中 cancel、integrity_failed、物理请求预算耗尽为刻意负路径，最终收敛 PASS。

## 7. 缺口清单

- 本轮修复范围内无登记缺陷缺口：坐标修复、测试、类型、构建与 Electron 1M 全量复刻均已闭环；回头看补漏已完成 `analyze` 覆盖、授权摘录与旧接口清理。
- 版本号保持 3.77.0，未执行重新封装；按用户前序要求，升级版本与封装需用户再次确认。
- Vite 构建仍有既有登记 warning（Node externals、chunk size、`__dirname` native config 提示），不属于本轮新增缺陷。
- 工作区还包含本任务前序已确认的未提交改动；本轮只叠加 `editorDocumentMap.ts` 与其测试，不回滚、不清理无关文件。
