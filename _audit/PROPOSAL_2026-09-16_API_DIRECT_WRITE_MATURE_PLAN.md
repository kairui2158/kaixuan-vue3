# 2026-09-16 API 直写编辑器成熟化执行方案

## 方案成熟度

**方案成熟度：成熟可执行。**

依据：

1. 根因已定位到服务层硬编码、意图语义、记录层三层，不再依赖猜测。
2. 五个真实开源项目均提供了可对照的源码级机制。
3. 删除矩阵覆盖服务层、UI、测试、脚本、文档和经验文件。
4. 验证矩阵包含主线、支线、支支线、回归、trace 对账、真实 UI 操作和残留扫描。

放行条件：本方案执行时必须先完成“门禁与文档修订”，再动代码。任何一项验证失败即视为未闭环，不允许通过降低断言继续放行。

## 目标产品语义

最终语义只有一套：

1. `discuss / analyze`：只读。可读取编辑器与大纲，可调用 `editor.reveal` 显示位置，不可写入。
2. `edit / generate`：可执行编辑器写入。写入工具只有 `editor.write`。
3. 用户短答复（“使用方案A”“就按这个”“认可”）只有在前一轮 assistant 已提出明确待执行方案时，才继承 `edit/generate` 意图。
4. 生成流水线保持无交互式写入工具。
5. 确认预览链路删除：不再有 `editor.propose_edits`、`pending_user_confirmation`、待确认批次、确认按钮。
6. 直写安全层保留：定位唯一、hash/版本校验、锁定只读、写入上限、undo、批次记录、回滚。

## 执行阶段

### Phase 0：门禁与文档修订

先改规则，再改代码，防止旧经验把旧链路放回来。

1. 修订 `_audit/神意开发经验总结_v5.md`：
   - M9 改为：discuss/analyze 只读；edit/generate 才可 `editor.write`；`editor.propose_edits` 全链路禁止。
   - §8 规则 67 同步改为直写语义。
   - 新增 M20：确认预览残留清零门禁。
   - 新增 M21：意图语料集门禁。
   - 新增 M22：tool-loop 状态机门禁。
   - 新增 M23：turn/API/event 三层工具调用对账门禁。
2. 新建 DEV_LOG 记录本方案执行。
3. `FOLDER_SKILL_SPEC_V1.md` 中关于 `editor.propose_edits` 的教学改为 `editor.write`。

**验证**：

```powershell
rg -n "可调用提案工具|editor.propose_edits|pending_user_confirmation" _audit/神意开发经验总结_v5.md _audit/FOLDER_SKILL_SPEC_V1.md
```

预期：经验文件与 SKILL 规格中不再有“可调用提案工具”“pending_user_confirmation 是成功状态”等旧语义。

### Phase 1：确认预览整链路删除

**服务层**

1. `dialogueFoundation.ts`
   - 删除 `proposeEdits` 权限字段。
   - 删除 `canPropose = true`。
   - 删除 `resolveDialogueToolSurface()` 对 `editor.propose_edits` 的单独放行。
   - `describeDialogueTools()` 写入工具描述从 `editor_write_proposal` 改为 `editor_write`。
2. `editorTools.ts`
   - 删除 `editor.propose_edits` 工具注册。
   - 删除提案批次生成与 `pending_user_confirmation` 返回。
3. `editorEditSession.ts` / `editorBatchRecord.ts`
   - 删除 pending batch 状态、等待用户确认状态、确认应用入口。
   - 保留批次记录、回滚、undo 所需的数据结构。
4. `aiService.ts`
   - 删除 `pending_user_confirmation` 提前返回分支。
   - 删除针对 `editor.propose_edits` 的所有特判。
5. `workspaceSkillEngine.ts`
   - 删除 `proposeEdits` 过滤逻辑，统一改为 `canWrite`。

**UI**

1. `OutlineWorkspace.vue`
   - 删除 pending batch 消息、确认区、批准/拒绝按钮、`applyPendingEdit/applyPendingBatch`。
   - 删除 `PENDING_APPROVAL_MARKERS`、`isShortApprovalInput`、`hasPendingEditorBatch`。
   - 保留 `editor.write` 成功后的写入结果消息、编辑器滚动定位、失败提示。
2. `ChatPanel.vue`
   - 删除旧预览工具调用解析、待确认 UI、确认按钮。
   - 保留直写工具调用展示。

**测试与脚本**

1. 改写所有断言“edit 暴露 propose_edits”的测试为“edit 暴露 editor.write；discuss/analyze 不暴露任何写入工具”。
2. 删除或改写旧提案 E2E 场景，不得用放宽断言让旧链路通过。
3. 更新 `verify-api-direct-write-v2-e2e.mjs`，删除 proposal 场景，新增直写主线与失败支线。

**残留扫描**

```powershell
rg -n "editor\.propose_edits|pending_user_confirmation|pendingEditorBatchPlan|pendingBatch|pendingOutlineBatchMessage|outlineBatchMessages|applyPendingEdit|applyPendingBatch|PENDING_APPROVAL_MARKERS|isShortApprovalInput|hasPendingEditorBatch" src scripts _audit
```

通过标准：`src` 与 `scripts` 中命中数为 0。`_audit` 中仅允许历史文档与本次方案中的事实记录，不允许现役规格、教学、门禁继续要求旧链路。

### Phase 2：意图路由成熟化

1. 建立意图语料集：
   - 新增 `src/services/chainIntentCorpus.ts` 或等价单源文件。
   - 四类意图：`analyze`、`edit`、`generate`、`discuss`。
   - 每类包含正样本、负样本、短答复承接样本。
   - 语料按“用户话术、上一轮 assistant 是否提出可执行方案、期望意图”三列组织。
2. 写入口径补全：
   - 新增：去掉、移除、删去、挪走、挪到、放到、改成、换掉、补进、补上、加进、加到、定稿、落实、执行。
   - 明确区分“写入动作”与“位置咨询”：位置咨询仍为只读。
3. 规则单源：
   - `classifyChainIntent()` 与 `routeChainIntent()` 均调用同一语料/规则源。
   - 禁止两个入口各自复制正则。
4. 短答复继承：
   - “好的 / 可以 / 使用方案A / 就按这个 / 认可 / 先定XX”只有在上一轮 assistant 提出明确方案时，归入 `edit/generate`。
   - 上一轮只是提问或讨论时，短答复保持 `discuss`。
5. 每意图阈值与评估：
   - 为每个意图建立最小置信度或规则优先级。
   - 新增评估脚本输出准确率、误判样本、未过阈值样本。
   - 回归测试覆盖本轮 trace 的 8 个轮次，作为固定回归集。

**验证**

```powershell
npx vitest run src/services/chainIntentRouter.spec.ts
node scripts/evaluate-chain-intent-router.mjs
```

通过标准：

1. 本轮 8 轮 trace 语料全部正确分类。
2. 负样本不得误判为 edit。
3. `routeChainIntent()` 与 `classifyChainIntent()` 对同一样本输出一致。

### Phase 3：tool-loop 状态机修正

每个工具调用必须有独立阶段与结果：

| 阶段 | 触发 | UI 呈现 | trace |
|---|---|---|---|
| `reading` | 调用读取工具 | 显示正在读取目标 | `tool_start` |
| `locating` | 调用 locate/search | 显示定位进度 | `tool_start` |
| `write_pending` | `editor.write` 已发起 | 显示正在写入编辑器 | `tool_start` |
| `write_success` | 写入成功 | 显示写入结果、位置、undo 提示 | `tool_call` + write record |
| `write_failed` | 校验失败/执行异常 | 显示失败原因 | `tool_call` + error |
| `permission_denied` | 意图无写权限 | 显示“当前为讨论模式，需要写入请明确指令” | `permission_denied` |
| `write_limit` | 达到写入上限 | 显示已达上限 | `write_budget_exhausted` |
| `tool_missing` | 工具不存在 | 显示不可用 | `tool_not_found` |
| `no_progress` | 连续无正文且无新信息 | 显示具体卡点 | warning + reason |
| `loop_limit` | 达到迭代上限 | 终止并显示下一步 | `tool_loop_limit` |

修正点：

1. “正在查找信息”只能在真实读取/定位时出现。
2. 连续无进展要区分读取、定位失败、权限拒绝、写入失败、无可用工具。
3. 到达上限必须终止，不再继续等待。
4. tool-loop 状态同步到 API 对话框、运行记录、诊断日志。

### Phase 4：三层记录对账

新增对账不变量：

1. turn 级 `toolCalls` 必须包含本轮所有已执行工具调用。
2. API call 级必须记录该次请求的真实工具面与工具调用结果。
3. event 级每个工具必须有 start 与 finish。
4. turn、API call、event 三层用 `turnId + apiCallId + toolCallId` 关联。
5. `actualToolSurface` 与真实请求 tools 逐项一致。

本轮第 8 轮的具体修复目标：

- 事件层有 `editor.locate`、`editor.propose_edits`，turn 级 `toolCalls` 也必须有对应记录。
- 旧工具删除后，同类场景应变为 `editor.locate` + `editor.write`，且三层全部可见。

### Phase 5：递归验证矩阵

#### 主线

| 场景 | 操作 | 期望 |
|---|---|---|
| 大纲明确写入 | “把钩子2去掉” | intent=edit，工具面含 `editor.write`，编辑器内容变化，滚动定位，trace 三层记录 |
| 主页明确写入 | “把这段插入第3段” | intent=edit，`editor.write` 执行，编辑器内容变化 |
| 生成 | “把这段补进大纲” | intent=generate，写入执行 |

#### 支线

| 场景 | 期望 |
|---|---|
| discuss 读取 | 只读工具，无写入工具 |
| analyze 诊断 | 只读工具，无写入工具 |
| 位置咨询 | `editor.reveal` 可用，不写内容 |
| 短答复继承 | 上一轮有方案时继承 edit/generate |
| 短答复孤立 | 上一轮无方案时保持 discuss |
| 加载 SKILL | 权限边界与 plain 对话一致 |
| 不加载 SKILL | 同样经过意图路由与权限门 |
| 兼容模式 | JSON 协议降级写入走同等安全校验 |

#### 支支线

| 场景 | 期望 |
|---|---|
| 空输入 | 不发起 API，提示输入为空 |
| 模糊目标 | 不写编辑器，要求补充定位 |
| 多命中 | 返回 ambiguous_target，拒绝写入 |
| 目标不存在 | 写入失败并提示 |
| hash/版本冲突 | 拒绝写入，提示重读 |
| 编辑器锁定 | 只读，拒绝写入 |
| 写入上限 | 拒绝继续写入，终止循环 |
| 权限拒绝 | UI 明确显示讨论模式不可写 |
| 工具不存在 | 记录 tool_missing，不继续等待 |
| 模型连续只调工具 | 状态区分并最终终止 |
| 达到迭代上限 | 显示 tool_loop_limit 与下一步 |
| 流水线 | 不暴露交互式写入工具 |
| 旧 confirm 输入 | 不再触发隐藏链路 |

#### 回归面

1. 主页编辑器正常对话。
2. 大纲工作台正常对话。
3. plain 对话。
4. folder skill / text skill 调用。
5. 生成流水线各层。
6. 兼容供应商降级。
7. 运行记录导出与深检。

### Phase 6：验证命令与证据

必须全部通过并保留原始输出：

```powershell
npm run type-check
npm run build:vue
npm run test:services
node scripts/evaluate-chain-intent-router.mjs
node scripts/verify-api-direct-write-v2-e2e.mjs
rg -n "editor\.propose_edits|pending_user_confirmation|pendingEditorBatchPlan|pendingBatch|pendingOutlineBatchMessage|outlineBatchMessages|applyPendingEdit|applyPendingBatch|PENDING_APPROVAL_MARKERS|isShortApprovalInput|hasPendingEditorBatch" src scripts
```

真实 UI 验证必须包含：

1. 大纲工作台明确写入：编辑器内容 before/after、滚动定位截图、trace 导出。
2. 主页编辑器明确写入：同上。
3. discuss 只读：请求工具面截图或导出 JSON。
4. 权限拒绝：UI 提示截图。
5. tool-loop 状态：连续工具调用时 API 对话框显示阶段，不再空等。
6. trace 三层对账：turn、API call、event 的工具调用集合一致。
7. 诊断日志覆盖：renderer 与主进程双侧均有对应事件。

## 风险与防跑偏

| 风险 | 防护 |
|---|---|
| 删除旧链路时误伤直写安全器 | 只删确认预览，不删 hash、版本、锁定、上限、undo、回滚、批次记录 |
| 意图补词引入误写 | 语料集必须包含负样本与位置咨询样本 |
| 测试为绿灯固化旧行为 | 先修产品语义，再同步测试契约 |
| 记录层继续分叉 | M19 + M23 双门禁，E2E 同时断言请求、turn、API call、event |
| 修一处坏一处 | 每阶段结束执行 diff 复查、关联链路扫描、回归测试 |
| 假闭环 | 无原始输出、无截图、无 trace 对账不得声称完成 |

## 执行顺序总表

1. 修订经验文件与 SKILL 规格。
2. 建立删除矩阵并逐文件清理。
3. 收敛工具面权限。
4. 意图语料集与路由单源化。
5. tool-loop 状态机。
6. turn/API/event 三层对账。
7. 更新单测与 E2E 契约。
8. 执行递归验证矩阵。
9. 更新 DEV_LOG 与经验文件。
10. 用户确认后封装交付。

## 未纳入本次范围

1. SKILL 模板内容重写：本次只保证应用层工具面与执行链路正确。
2. 新增可视化 diff 面板：沿用现有编辑器写入呈现与 undo。
3. 生成流水线 chain 中间产物压缩：独立任务。
