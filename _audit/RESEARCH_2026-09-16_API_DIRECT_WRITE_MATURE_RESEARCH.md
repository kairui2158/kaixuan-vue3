# 2026-09-16 API 直写编辑器成熟化调研与根因对账

## 结论先行

**方案成熟度：当前实现为“不成熟”，不允许继续在现有链路上打补丁。**

本轮结论不是猜测，而是由三层证据交叉得出：

1. 客户实测 trace：`run-trace-outline-20260916-025429-deep/run-trace.json`。
2. 本仓库源码与测试契约：`src/services/*`、`src/components/*`、`scripts/verify-*`。
3. 五个真实开源项目的源码级调研：semantic-router、roo-code、cline、openhands、continue。全部为真实拉取源码，路径见下文；aider 克隆失败，已如实记录，不作为依据。

当前实现不是“工具不可用”，而是三条链路同时存在旧确认预览路线、直写路线、以及记录层分叉。继续补词或换文案无法解决，必须整链路收敛。

## 客户实测 Trace 对账

### 基本事实

Trace 共 8 个用户轮次、61 个事件、7 条 API 调用记录。所有轮次 `writeMode=direct`，但工具面暴露情况如下：

| 轮次 | 用户请求 | 意图 | 工具面 | 问题 |
|---|---|---|---|---|
| 1 | 和你讨论女主角背景补全 | discuss | 含 `editor.propose_edits` | 旧预览工具在 direct 模式残留 |
| 2 | “好的先定沈萤，你有什么建议？” | edit | 空，mode=approval，duration=1ms | 短答复/批准链异常路径 |
| 3 | 继续讨论补全 | discuss | 含 `editor.propose_edits` | 同第 1 轮 |
| 4 | 要求聚焦沈萤补充草案 | discuss | 含 `editor.propose_edits` | 同第 1 轮 |
| 5 | 询问脚踝伤是否写入 | edit | 含 `editor.write` 与 `editor.propose_edits` | 两个写入工具同面竞争 |
| 6 | “使用方案A” | discuss | 不含 `editor.write` | 短答复未继承上一轮写入语境 |
| 7 | 质疑理解偏差 | discuss | 不含 `editor.write` | 正常只读面，但缺少写入意图切换提示 |
| 8 | “把钩子2去掉” | discuss | 含 `editor.propose_edits`，无 `editor.write` | 写入口语漏判 |

### 新发现的记录层缺陷

第 8 轮事件层记录了两次工具完成：

- `editor.locate`
- `editor.propose_edits`

但同一 turn 的 `toolCalls` 字段为空。也就是说：

1. 模型确实调用了旧预览工具。
2. `editor.propose_edits` 执行后，`aiService` 因 `pending_user_confirmation` 提前返回，工具调用没有回填到 turn 级 `toolCalls`。
3. API 对话框因此无法展示“工具已执行，等待用户确认预览”的真实阶段。
4. SKILL 调试方读取 turn 级数据时会误判为“没有工具调用”。

这证实存在第三层分叉：**入口声明工具面 / 真实请求工具面 / turn-API-event 三层工具调用事实**没有对齐。M19 只解决了前两层，还没解决第三层。

## 本仓库源码根因

### 根因一：旧确认预览工具没有被关闭

`src/services/dialogueFoundation.ts`:

```ts
export function resolveDialoguePermission(intent, writeMode) {
  const normalized = intent === 'auto' ? 'discuss' : intent
  const canWrite = normalized === 'edit' || normalized === 'generate'
  void writeMode
  const canPropose = true
  return { intent: normalized, readTarget: true, proposeEdits: canPropose }
}
```

问题：

1. `canPropose = true` 表示所有意图都能看到 `editor.propose_edits`。
2. `void writeMode` 表示直写/预览模式已经不影响权限。
3. `resolveDialogueToolSurface()` 对 `editor.propose_edits` 单独放行，绕过 `canDirectWrite`。
4. `describeDialogueTools()` 仍把写入工具描述为 `editor_write_proposal`。

结论：这不是漏参数，而是旧产品语义被硬编码保留。

### 根因二：意图路由词库不成熟，且缺少评估机制

`src/services/chainIntentRouter.ts`:

```ts
const EXPLICIT_WRITE_DIRECTIVE_PATTERN =
  /(?:把.{0,80}?(写入|写进|插入|追加|替换|重写|修改|删除|删掉)|(?:请|帮我)(?:写入|写进|插入|追加|替换|重写|修改|删除|删掉)|(?:请|帮我)?(?:写入|写进|插入|追加|替换|重写|修改|删除|删掉).{0,12}内容|(?:请|帮我)?(?:直写|直接写入|直接修改|直接替换|直接追加))/
```

已知漏词与缺陷：

1. 漏掉“去掉、移除、删去、挪走、挪到、放到、改成、换掉、补进”等高频口语。
2. `discuss` 词库只有“讨论、构思、共创、问答、聊”，无法识别“先定、使用方案A、就这样处理”这类承接写入语境的短答复。
3. `classifyChainIntent()` 与 `routeChainIntent()` 靠两个位置分别匹配同一正则，仍存在语义分叉风险。
4. 没有语料集、负样本、每意图阈值、评估集、回归测试。补词只能修个案，不能证明路由质量。

### 根因三：tool-loop 状态机粗化

`src/services/aiService.ts` 的原生工具循环：

1. 连续两轮“只调用工具、无正文”时统一提示“正在根据工具结果继续查找信息...”。
2. 不区分读取中、定位失败、权限拒绝、写入成功、写入失败、写入上限、无可用工具。
3. 对 `editor.write` 与 `editor.propose_edits` 不区分展示。
4. 到达 `maxToolIterations` 时返回 `tool_loop_limit`，但 UI 无法给出下一步动作。

结果就是客户看到“等待 API 返回”，而真实状态可能是旧预览工具已进入 `pending_user_confirmation`。

### 根因四：测试与验证脚本固化旧产品契约

`rg` 统计出的旧链路残留面：

- 服务层：`editorTools.ts`、`dialogueFoundation.ts`、`aiService.ts`、`chainIntentRouter.ts`、`editorEditSession.ts`、`workspaceSkillEngine.ts`、`editorBatchRecord.ts`
- UI：`OutlineWorkspace.vue`、`ChatPanel.vue`
- 测试：`aiService.spec.ts`、`dialogueFoundation.spec.ts`、`dialogueFoundationContract.spec.ts`、`editorTools.spec.ts`、`runTrace.spec.ts`、`generationValidity.spec.ts`、`workspaceSkillEngine.spec.ts`
- 验证脚本：`verify-api-direct-write-v2-e2e.mjs`、`verify-dialogue-foundation.mjs`、`verify-dialogue-foundation-stage2.mjs`、`verify-outline-compose-folder-repair-v2.mjs`、`verify-outline-cocreation-stage2.mjs`、`verify-outline-cocreation-stage2-skills.mjs`
- 关键标识：`editor.propose_edits`、`pending_user_confirmation`、`pendingEditorBatchPlan`、`pendingBatch`、`pendingOutlineBatchMessage`、`outlineBatchMessages`、`applyPendingEdit`、`applyPendingBatch`、`PENDING_APPROVAL_MARKERS`、`isShortApprovalInput`、`hasPendingEditorBatch`

其中大量断言明确要求“edit 暴露 propose_edits”“discuss 保留 propose_edits fallback”。这些测试守护的是旧设计，不是当前产品决策。

### 根因五：经验文件与产品决策冲突

`_audit/神意开发经验总结_v5.md` M9 仍写：

> discuss/analyze 可调用提案工具进入预览确认

这与你 09-16 已确认的“删除确认预览、走 API 直写编辑器”相反。若不先修订，后续执行者会按旧门禁继续把预览工具放回工具面。

## 社区源码级调研

调研目录：`D:/codex/_research_20260916/`

### 1. semantic-router：意图路由成熟形态

证据文件：`semantic-router/routers/base.py`

- 每条 route 有独立 `score_threshold`（line 354、434-435、646-648）。
- `_score_routes()` 统一给全部候选路由打分（line 1521）。
- 未过阈值返回空 route choice，而不是硬选一个。
- `fit()` 与阈值优化流程支持评估和调参（line 1681 起）。
- line 1676 附近可看到每个 route 的阈值来源为 `route.score_threshold or self.score_threshold or 0.0`。

借鉴结论：意图路由必须有语料集、每意图阈值、负样本和评估集。我们的当前实现是正则补词 + 全局固定阈值，属于初级形态。

### 2. roo-code：工具失败与无进展治理

证据文件：

- `src/core/task/Task.ts` line 2483-2500：`consecutiveMistakeCount` 达到 `consecutiveMistakeLimit` 时触发 `mistake_limit_reached`，并进入用户询问状态。
- `src/core/auto-approval/commands.ts` line 207、224-292：权限决策是三值 `auto_approve / auto_deny / ask_user`，并考虑 allowlist 与 denylist 的最长匹配。
- `src/core/prompts/tools/filter-tools-for-mode.ts`：工具面按 mode 统一过滤。
- `src/core/tools/ToolRepetitionDetector.ts`：重复工具调用检测，达到阈值输出 `mistake_limit_reached`。

借鉴结论：

1. 工具循环需要“无进展计数 + 达限终止 + 用户可见”的独立状态机。
2. 权限决策必须有明确三态：允许、拒绝、需用户处理。
3. 工具面过滤必须单源，不允许每个工具各自判断。

### 3. cline：讨论/执行双模式语义

证据文件：

- `apps/vscode/src/core/controller/models/taskApiModel.ts` line 15：`mode === "plan" ? planModeApiProvider : actModeApiProvider`。
- `providerSwitchNormalization.ts`、`commitModelSelection.ts`、`updateApiConfiguration.ts`：模型选择按 plan/act 双模式归一化与提交。

借鉴结论：

1. 讨论/执行应是清晰的产品模式，不靠一个正则把所有话术混在一个意图桶里。
2. 模式切换后模型、工具面、提示词都要随模式统一变化。
3. 我们应把“只读讨论”和“写入执行”作为对话底座的一等状态，而不是 `discuss` 意图下偷偷带一个写入工具。

### 4. openhands：状态呈现与模式切换

证据文件：

- `src/api/cloud/settings-service.api.ts` line 30、110-111：`confirmation_mode` 是显式配置。
- `src/types/agent-server/core/base/common.ts` line 71：`WAITING_FOR_CONFIRMATION = "waiting_for_confirmation"`。
- `src/utils/constants.ts` line 47-48：`/plan` 命令切换 Plan mode。
- `src/hooks/chat/use-plan-mode-interceptor.ts`：命令拦截、任务直建、运行中吞并命令、测试覆盖分支完整。

借鉴结论：

1. 等待确认/等待用户是一种明确状态，不是普通工具完成日志。
2. 模式切换需要拦截器与测试，而不是只改一个 label。
3. 由于我们已决定删除确认预览，openhands 的确认模式只用于反面参考：它的价值在于“状态必须显式可见”，而不是要求我们保留确认按钮。

### 5. continue：直写呈现与可回退

证据文件：

- `core/index.d.ts` line 1495：`StreamDiffLinesType = "edit" | "apply"`。
- `core/core.ts` line 72：`ApplyAbortManager`。
- `gui/src/components/AcceptRejectDiffButtons.tsx`：接受/拒绝全部 diff。
- `gui/src/redux/thunks/handleApplyStateUpdate.ts`：apply 状态流绑定 `streamId/toolCallId`。
- `gui/src/pages/gui/chat-tests/EditToolScenarios.test.tsx`、`ApplyScenarios.test.tsx`：编辑工具全链路测试，覆盖 ask-first、applying、accept/reject、取消。

借鉴结论：

1. 直写编辑器的成熟形态是“流式/一次呈现 + 可撤销 + 状态绑定到 toolCallId”。
2. 即使用户要求 API 可直写，也需要保留 Undo/回滚/批次记录，这是安全层，不是确认预览层。
3. 编辑器联动应记录目标位置、插入点、滚动与呈现方式，trace 里能看到写入位置。

### 6. aider

GitHub 克隆连接超时，未取得源码。本轮不引用 aider 任何结论，避免虚构依据。

## 成熟化方向判断

1. 意图路由：从“补词”升级为“语料集 + 规则单源 + 每意图阈值 + 评估报告”。
2. 工具面：从“propose_edits 永远可见”升级为“discuss/analyze 只读；edit/generate 才有 editor.write”。
3. 确认预览：整链路删除，不保留兼容分支。
4. tool-loop：为每个工具调用记录阶段、结果、失败原因，并在 UI 与 trace 同步展示。
5. 记录系统：turn、API call、event 三层必须能对账出同一组工具调用事实。
6. 验证：从 mock 执行器验证升级为真实入口路径 + 真实请求工具面 + 编辑器内容变化 + trace 对账。

## 本轮调研诚实声明

1. 本轮只做取证与方案，不改业务代码。
2. 上述开源项目均为真实源码目录检索，不是高星数据堆砌。
3. aider 拉取失败已如实记录。
4. 当前方案执行前，仓库中旧确认预览残留必须先建立删除矩阵，否则任何“部分删除”都会继续制造分叉。
