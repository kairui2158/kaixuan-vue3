# API 直写权限与运行记录完整性修复方案（基于经验 v5.1）

> 日期：2026-09-14  
> 依据：`神意开发经验总结_v5.md` v5.1（M1、M6、M8、M9、M10、规则 26/69）  
> 范围：API 直写权限矩阵、统一授权执行门、入口接入、运行记录与诊断日志、测试契约与 E2E  
> 状态：待审核，未执行

## 结论先行

当前直写 V2 的写入安全器（定位唯一、hash/版本校验、锁定只读、写入上限、回滚）是存在的，但权限模型有结构性缺陷：`writeMode === 'direct'` 会直接把 `proposeEdits` 置为 `true`，导致 discuss/analyze/auto 都能拿到写入工具；共创入口固定 `direct`，plain 入口也存在 `resolveDialogueToolSurface(..., 'direct')` 的绕路；服务层 `callAiWithTools` 只按传入 tools 执行，没有统一授权执行门。也就是说，现在是“入口自觉 + 安全器兜底”，还不是“服务层强制授权”。

## 修复目标

1. 意图决定写权限：`discuss/analyze` 只读，`edit/generate` 才可写，`auto` 先归一为安全默认意图。
2. `writeMode` 只决定执行形态：`proposal` 走提案，`direct` 走直写，不再扩大权限。
3. 服务层成为最终执行门：即使入口误传写工具，也会被拒绝并记录权限拒绝日志。
4. 运行记录与诊断日志完整覆盖权限决策、工具调用、降级、直写呈现与失败现场。
5. 单测与 E2E 改为守护设计契约，不再固化“direct 打穿权限”的现状。

## P0：权限矩阵与统一执行门

### 1. 修正 `dialogueFoundation` 权限矩阵

- 文件：`src/services/dialogueFoundation.ts:61-70`
- 修改：删除 `writeMode === 'direct' ? true : canWrite` 的旁路；`proposeEdits` 一律由归一化后的 intent 决定。`auto` 归一策略先保守为 `discuss`，避免讨论类请求误拿写权限。
- 同步：`resolveDialogueToolSurface` 保持在权限过滤后的工具面，不再因 direct 扩权。

### 2. 增加服务层统一授权执行门

- 文件：`src/services/aiService.ts:1191` 起 `callAiWithTools`
- 新增策略：`toolPolicy` 增加 `intent` 或显式 `allowWrite`，调用 `tool.execute` 前统一校验：
  - 未声明权限元数据：拒绝执行，返回 `permission_denied`，记录 error 级诊断。
  - `discuss/analyze` 请求写工具：拒绝执行，返回 `permission_denied`，写入 runTrace 的 `tool-permission-denied` 事件。
  - pipeline 请求写工具：拒绝执行，返回 `permission_denied`。
  - 只有 `edit/generate` 且入口声明允许写入时才执行。
- 关键点：授权检查必须在工具执行前，安全器只负责写入内容与位置安全，不能替代权限决策。

### 3. 兼容供应商 JSON 直写同样过门

- 文件：`src/services/aiService.ts:238` `executeCompatibilityEditorWrite`
- 修改：执行 `writeTool.execute` 前做与原生工具完全一致的权限校验；事件顺序改为 `onToolStart` 先于执行；`onPhysicalCall.durationMs` 与 `onToolCall.durationMs` 使用真实耗时，不再写 `0`。
- 原因：兼容降级不能成为权限旁路，也不能让运行记录出现“工具实际已执行但开始事件缺失”的假现场。

### 4. 修正主页共创入口

- 文件：`src/components/chat/ChatPanel.vue:820-830`
- 修改：`buildTools` 按请求意图计算工具面，不再只凭 `requestTarget.content` 就固定 `writeMode: 'direct'`；共创发送前显式得到 intent，并把 intent 传入 `toolPolicy`。

### 5. 修正大纲共创入口

- 文件：`src/components/common/OutlineWorkspace.vue:1276-1285`
- 修改：与主页共创同一套 intent 计算；锁定态、只读请求、讨论请求不得暴露写工具。保留大纲特有的 `applyOutlineDirectWrite`、reveal 事件链。

### 6. 修正 plain 对话入口

- 文件：`src/components/chat/ChatPanel.vue:1569`、`ChatPanel.vue:2574`
- 修改：plain 路径不再无条件传 `'direct'`；intent 计算一次、传一次，并写入 `toolPolicy`。`classifyHomeIntent` 抽成共享服务，两个组件禁止各自复制一份。
- 文件：`src/components/common/OutlineWorkspace.vue:2741`、`OutlineWorkspace.vue:2812`、`OutlineWorkspace.vue:2847-2851`
- 修改：plain 对话的 `resolveDialogueToolSurface` 必须显式传 writeMode，工具面与 `toolPolicy` 使用同一个 intent 结果；禁止“工具面按 intent 过滤、toolPolicy 又写死 direct”的语义错位。

### 7. 修正错误测试契约

- 文件：`src/services/dialogueFoundation.spec.ts:98-103、141-146、250-263`
- 修改：删除“direct mode 给所有 intent 写权限”的断言，改为：
  - proposal：discuss/analyze 无写权限，edit/generate 有。
  - direct：discuss/analyze 仍无写权限，edit/generate 有。
  - executeDialogueFoundation 在 discuss+direct 下执行写工具必须被拒。

### 8. E2E 增加权限门真断言

- 文件：`scripts/verify-api-direct-write-v2-e2e.mjs` 场景 7
- 修改：mock 强制返回 `editor.write` 工具调用，断言：
  - 编辑器内容不变。
  - 工具结果为 `permission_denied`。
  - runTrace 出现 `tool-permission-denied` 事件。
  - DiagLogger 主进程侧能读到同一拒绝记录。
  - 这才是权限门闭环；mock 不主动写不算证据。

## P1：日志与可观测性补齐

### 9. 运行记录补齐权限语义

- 文件：`src/components/chat/ChatPanel.vue:251`、`src/components/common/OutlineWorkspace.vue:570`
- 修改：`startTurn` 增加本次请求的 `intent`、`writeMode`、工具面快照（工具名+policy）；`user-request` 事件同步记录语义。
- 验收：导出 JSON 后，SKILL 调试方能直接回答“这轮为什么能写/不能写”。

### 10. 主页共创补工具回调

- 文件：`src/components/chat/ChatPanel.vue:824-830`
- 修改：`toolPolicy` 增加 `onToolStart/onToolCall/onToolWarning`，把工具执行、拒绝、限流写入 live stream、runTrace 和 DiagLogger。

### 11. 写入上限从“每次 API 调用”改为“每轮用户请求”

- 文件：`src/services/aiService.ts:1312`
- 修改：同一 turn 内多次 `callAi`（多技能、重试、chain 子步骤）共享写入预算；每轮开始创建新的预算上下文，预算耗尽返回结构化 `write_limit_reached`，并记录轮级事件。

### 12. 权限拒绝与降级进 runTrace

- 新增事件：`tool-permission-denied`、`write-budget-created`、`write-budget-exhausted`。
- 每个事件包含 intent、writeMode、toolName、workspace、targetId、reason、durationMs。
- DiagLogger 与 runTrace 双轨同步，E2E 对账 renderer/main 数量一致。

## P2：收敛重复实现

### 13. 抽共享意图分类服务

- 新建 `src/services/plainDialogueIntent.ts`（或并入现有 dialogueFoundation），统一 `classifyHomeIntent`。
- `ChatPanel.vue:588`、`OutlineWorkspace.vue:2201` 删除本地复制，改为共享实现。
- 保留现有 jieba+TF-IDF 意图路由结果作为优先输入，分类服务只做入口归一，避免两套分类打架。

### 14. 语义路由升级评估

- 先不直接扩模型语义分类。完成 P0/P1 后，用真实请求样本评估现有意图分类在直写场景的误判率；若 discuss 被误判为 edit 的比例影响使用，再立项升级语义路由。

## 执行顺序

1. P0-1/P0-2/P0-3：权限矩阵、服务层执行门、兼容直写过门。
2. P0-4/P0-5/P0-6：三入口接入统一语义。
3. P0-7/P0-8：修正测试契约，补 E2E 权限断言。
4. P1-9/P1-10/P1-11/P1-12：日志与轮级预算。
5. P2-13/P2-14：共享意图服务与评估，不与本轮 P0/P1 混在同一提交。

## 验证矩阵

| 门 | 验证方式 | 通过标准 |
|---|---|---|
| G1 类型与单测 | `npm run type-check`；`npm run test:services -- --run` | exit 0，服务测试全绿，discuss/analyze direct 断言拒绝写入 |
| G2 权限矩阵 | 新增 dialogueFoundation 单测 | proposal/direct 下 discuss/analyze 均无写工具；edit/generate 有 |
| G3 服务层拒绝 | aiService 单测：discuss 传入写工具 | 返回 `permission_denied`，不执行 writeTool，记录事件 |
| G4 真实 UI 权限 | 源 Electron + mock 强制 `editor.write` | discuss 场景编辑器不变、trace 有拒绝事件、诊断双侧一致 |
| G5 入口一致性 | 三入口各跑 discuss/edit/generate | 工具面与 toolPolicy 的 intent 一致，共创与 plain 不再固定 direct |
| G6 日志覆盖对账 | runTrace 导出 + DiagLogger renderer/main | intent/writeMode/工具面/权限拒绝/写入/降级/呈现全量可还原 |
| G7 回归 | 原 14 场景直写 E2E、三入口链路 E2E | 成功路径不回退，锁定/冲突/多目标/限流继续有效 |
| G8 收尾 | diff 自审 + 临时文件清理复核 | 无越界改动，无测试 profile/脚本残留 |

## 不做的事

1. 不改生成流水线的执行语义：pipeline 继续无交互式编辑器写工具。
2. 不改写入安全器本体：唯一定位、hash 校验、锁定态、回滚、undo 隔离保持现状。
3. 不把权限模型复杂化成角色/账号系统：本轮只做意图权限矩阵 + 服务层执行门。
4. 不引入外部依赖或换架构。

## 回滚与风险控制

1. 每个 P 项独立闭环并验证后再进入下一项，防止单点修复扩散污染。
2. 若某入口 intent 分类不稳定，先保守降级为只读并提示用户，不允许为了写入成功率放宽权限。
3. 修复后若 E2E 场景失败，禁止改断言迁就现状；先定位产品或 mock 分支，再修。
