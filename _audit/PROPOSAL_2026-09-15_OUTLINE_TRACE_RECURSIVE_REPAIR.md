# PROPOSAL 2026-09-15: Outline Trace 多轮递归修复方案

状态：待审核（第三轮研磨版：正推/反推验证完成）  
来源：`C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-outline-20260914-223048-deep/`  
项目版本：v3.43.0  
本次只出方案，不动代码。

## 执行摘要

本方案经过五轮递归分析：意图路由 → 工具面 → 批次解析 → 服务权限 → 批次执行 → trace/诊断 → 上下文/历史 → 主页同款链路 → 与经验文件 M8/M9/M10/M11 对账。

本次事故不是单一意图分类错误，而是三个问题叠加：

1. `discuss` 误判把合法写入批次挡在 UI 解析门外。
2. `discuss` 同时把写入工具从工具面剥离，导致模型只剩下文本协议，而文本协议又被第 1 条挡住。
3. 被挡批次没有产生 `blocked` 诊断，只留下误导性的“模型未调用编辑工具”，SKILL 层因此无法判断真实归责。

另有一个独立成本问题：长文大纲在 system prompt 中重复注入，导致请求体积逐轮膨胀。

## 反推审计（2026-09-15 补充）

以下分析在初版方案完成后追加。目的：从用户需要的最终体验倒推最小改动，再正推每处改动可能产生的新 BUG 和爆炸半径。

### 目标倒推

| 用户要什么 | 最小改动 | 正推新 BUG 风险 |
|---|---|---|
| "确认"后批次能执行 | 存在 pending 批次时，"确认"升级为 edit | 用户确认的是分析结论而非写入，误触发 |
| 粘贴长素材不丢 | 模型输出合法批次时始终解析，不依赖意图标签 | 纯聊天中的 JSON 协议示例被误解析成真批次 |
| discuss 不丢写入能力 | `editor.propose_edits` 保持可见 | 模型在纯聊天时频繁提交提案，UI 噪音 |
| 批次失败能看到原因 | parse 返回结构化 reason | 正常纯文本回复触发 blocked 噪音 |
| 请求体积不膨胀 | 大纲全文只注入一次 | SKILL 路径模板变量 `{{outlineContent}}` 断裂 |

### 爆炸半径矩阵

| 修复项 | 半径 | 会砸到谁 |
|---|---|---|
| P1-1 去重系统提示 | 最高 | workspaceSkillEngine 模板变量、fallback、续生成快照、ChatPanel 独立 system prompt、dialogueFoundationContract.spec |
| P0-1 解析门解耦 | 高 | 4 个入口（Outline SKILL/plain + ChatPanel 两处）、所有调用 classifyPlainDialogueIntent 后做分支的代码 |
| 批准词扩容 | 中 | classifyChainIntent + routeChainIntent 两个入口必须同步（M11），short-circuit 顺序影响所有后续判定 |
| P0-2 discuss 保留提案工具 | 中 | dialogueFoundation.ts 共享底座，两个 spec 文件需同步 |
| P1-3 续生成瘦身 | 中 | 磁盘旧快照反序列化兼容 |
| P0-3 trace 补全 | 低 | 纯新增 |
| P1-2 历史补 recordTurn | 低 | 只加调用点 |

### 初版方案修正

#### 修正 1：解析门解耦的精度提升

初版写的是"意图只决定工具面，不再拦截解析"。反推后发现太粗：如果完全去掉 intent 门，纯聊天中的 JSON 示例会被误解析。

修正为：**解析器先跑，但只有解析结果是合法批次才创建 pending 预览**。这本身是结构化校验，比概率意图门更安全。不需要先过 intent 再 parse。

补充限制条件：
- 只在模型响应的顶层（非嵌套在解释性代码块内）提取批次。
- 如果响应包含 `editor_edit_batch` 字符串但出现在 backtick 包裹的示例说明中，跳过解析。

#### 修正 2：长文本意图加权降级

初版把"长文本含写入动词时升权 edit"列为 P0。反推后：既然解析门不再依赖 intent，长文本分类错误就不再阻断批次。加权只是改善路由到 SKILL 的选择精度，不是写入存活的关键路径。

降级为 P2。

#### 修正 3：ContextPack 去重必须分入口

初版写的是"大纲正文只允许一个权威注入源"。反推后发现 SKILL 路径的 `buildTemplateContext()` 独立注入 `outlineContent`，模板用 `{{outlineContent}}` 变量。如果在 `buildOutlineSystemPrompt()` 层面去掉全文，SKILL 模板的变量就断了。

修正为：
- plain 路径：`buildOutlineSystemPrompt()` 去掉全文，ContextPack 是唯一来源。
- SKILL 路径：保持模板变量不动，改 ContextPack 侧不再重复注入大纲正文。
- 两条路径的去重逻辑不能共用一个函数，否则又会破坏 SKILL 变量契约。

### 初版方案漏掉的风险

1. **旧续生成快照兼容**：P1-3 改快照结构后，磁盘上已存在的旧快照反序列化时要能容忍新结构。升级后用户点续生成不能崩。
2. **解析门槛降低后的 UI 噪音**：原来 discuss 下模型输出纯文本 JSON 被静默丢弃，用户看到普通聊天。改完后同一行为会弹出编辑预览框。这是体验变化，需要明确告知。
3. **M11 契约测试交叉覆盖**：如果只改 `classifyChainIntent` 不改 `routeChainIntent`（或反之），分别的单测可能仍然绿，但运行时行为分叉。需要新增交叉测试确保两个入口对同一输入返回同一意图。

## 第三轮研磨（2026-09-15：正推/反推验证）

### 正推验证结论

**结论：最小改动能生效，但必须加两个最小抽取。** 原因如下：

1. **权限单源杠杆（P0-2）**：`resolveDialoguePermission()`（dialogueFoundation.ts:59-70）是唯一权限源。`canPropose = canWrite` 这一行控制了工具面过滤（:153-165）和 SKILL 引擎过滤（workspaceSkillEngine.ts:529-535）两条下游。改一行 `canPropose = writeMode === 'proposal'`（即 discuss/analyze 也允许提案），两处同时放行。**但必须同步修订经验文件 M9 措辞**：M9 原文"discuss/analyze 不得拿到写入工具"字面上与 propose_edits（editorTools.ts:401-402，policy:'write'）冲突。修订为"discuss/analyze 可见并调用提案工具进入预览，不得执行 editor.write 直写"。服务层 aiService.ts:260-274 的权限门不动。

2. **解析门已分叉成 5 处（P0-1 必须抽共享函数）**：OutlineWorkspace.vue:2487-2493（SKILL）、:3033-3039（plain）、ChatPanel.vue:1167-1172（SKILL）、:1657-1662（plain）、:2199-2203（兼容模式）。五处同款 `intent === 'edit' || 'generate'` 门禁已经实际分叉过一次（本次事故就是分叉后果）。如果这次只修语义不抽函数，下一次新增入口还会重演。方案从"四处同款门禁"修正为**抽出共享函数** `parseResponseEditBatch()`，内部统一调用 `extractJsonCandidates()`（jsonExtraction.ts:16-66，括号平衡 + 围栏双路解析），替换 editorEditProtocol.ts:129-176 的裸 `indexOf('{')...lastIndexOf('}')`。五处调用点全部切换到新函数。

3. **plain 路径 toolSurface 确认未传**：OutlineWorkspace.vue:2768-2770 的 `startOutlineRun('direct', ...)` 只传了 `intent`，未传 `toolSurface`。函数签名 :538-541 已支持 options.toolSurface，只是 plain 调用点没传。P0-3 的修复设计保持不变。

4. **兼容直写无冲突**：`executeCompatibilityEditorWrite()`（aiService.ts:281-360）只找 `editor.write`，P0-2 放行 propose_edits 不影响它。

5. **批准词与 pending 信号 plumbing**：
   - `APPROVAL_INPUT_PATTERN`（chainIntentRouter.ts:89）增加裸"确认"。
   - pending 判定（:90-95）当前只认 assistant 文本标记，真实 pending 状态在 UI 侧 `outlineBatchRecord/editorBatchRecord.status === 'pending'`。
   - `ChainRoutingContext` 增加可选字段 `pendingEditorBatch?: boolean`，两个入口（OutlineWorkspace:2240、ChatPanel:595）传入。
   - SKILL 引擎路径经 adapter 传递，在 `WorkspaceSkillEngineAdapter` 上加可选 `hasPendingBatch`。
   - `classifyChainIntent` 与 `routeChainIntent` 共享同一 helper 判定，不重复实现（M11）。

### 反推验证结论

| 不修会怎样 |
|---|
| P0-1 不修：批次永远静默死。模型输出的合法 JSON 被 5 处意图门挡住，无诊断，用户看到的是"模型没写入"。 |
| P0-2 不修：模型不知道有提案工具可用。discuss 意图下工具面只有 read，模型退化为裸 JSON，又被 P0-1 挡。 |
| P0-3 不修：SKILL 层和用户永远看不到真实死因，每次排查都要人工翻 trace。 |
| P1-1/P1-3 不修：只影响请求体积和上下文膨胀，不阻塞功能。**降级 P2，本轮不碰。** |
| P1-2 不修：只有失败/取消路径缺 recordTurn，成功路径已有。**缩小为只补失败/取消路径。** |

### 优先级修订

| 项 | 初版 | 第三轮修订 |
|---|---|---|
| P0-1 解析门解耦 | P0 | **P0，抽共享函数 + extractJsonCandidates 统一** |
| P0-2 discuss 保留提案工具 | P0 | **P0，改 resolveDialoguePermission 单源一行 + M9 措辞修订** |
| P0-3 trace 补全 | P0 | **P0** |
| P1-1 ContextPack 去重 | P1 | **P2，本轮不碰** |
| P1-2 recordTurn | P1 | **P1，缩小为失败/取消路径** |
| P1-3 续生成快照瘦身 | P1 | **P2，本轮不碰** |

### 为什么不是"只修语义不抽函数"

五处同款代码已经分叉过一次。本次事故的直接原因就是某处修了某处没修。如果这次继续各改各的：

1. 下一个新增的对话入口会复制旧模板，重演静默死。
2. 未来改 JSON 协议时（比如版本号从 1 升 2），要改 5 处而不是 1 处，漏改概率极高。
3. `extractJsonCandidates()` 已经在 parseEditorWriteProtocol 里验证过（editorEditProtocol.ts:240-244），批次解析器不用它是浪费已验证资产。

所以这不是"扩大改造"，是**防止下次再分叉的必要收口**。

### 单测契约同步

| 文件 | 行号 | 需要改的期望 |
|---|---|---|
| dialogueFoundation.spec.ts | :92 | `discuss, 'proposal'` 的 proposeEdits 期望从 false 改为 true |
| dialogueFoundation.spec.ts | :99 | `discuss, 'direct'` 的 proposeEdits 期望从 false 改为 true |
| dialogueFoundationContract.spec.ts | :117 | 集合大小从 2 改为 1（discuss/analyze/edit/generate 都 propose=true） |
| chainIntentRouter.spec.ts | 新增 | pending + "确认" → edit；无 pending + "确认" → discuss |
| workspaceSkillEngine.spec.ts | :204/:229 | discuss 意图下 propose_edits 期望从不可用改为可用 |

## Trace 事实还原

| Turn | 用户意图 | 应用分类 | 实际后果 |
|---|---|---|---|
| 1 | 完善人物背景 | generate | 只调定位，未写入 |
| 2 | 粘贴 4000+ 字前传素材 | discuss | 素材写入意图被误判 |
| 3 | 补齐学习经历 | generate | 纯文本批次被允许解析 |
| 4 | 生成一版 | generate | 纯文本批次被允许解析 |
| 5 | 确认 | discuss | 裸“确认”未被识别为批准，批次死亡 |
| 6 | 为什么不写入 | discuss | 模型自查后承认 JSON 未被接收 |
| 7 | 仍在对话框里显示 | discuss | 模型只能 reveal，无写入通道 |

Trace 关键证据：

- `export.json run.turns[5].intent = discuss`，用户输入是“确认”。
- `payloads/021-response.json`、`025-response.json` 存在合法 `editor_edit_batch`。
- `payloads/045-response.json` 模型道歉并重试。
- `payloads/049-response.json` 模型明确说没有实际写入通道。
- 所有 turn 的 `toolSurface` 均为 `null`。

## P0-1 意图门禁误杀合法批次

### 现状证据

- `src/services/chainIntentRouter.ts:89`：`APPROVAL_INPUT_PATTERN` 不包含裸“确认”。
- `src/services/chainIntentRouter.ts:95-102`：pending 判定只认 assistant 文本里的“等待批准/【修改预览】”等标记；本场景模型输出的是裸 JSON，没有任何标记。
- `src/services/plainDialogueIntent.ts:5-11`：`auto` 一律降级为 `discuss`。
- `src/components/common/OutlineWorkspace.vue:2487-2493`：SKILL 路径要求 `intent === 'edit' || 'generate'` 才解析批次。
- `src/components/common/OutlineWorkspace.vue:3033-3039`：plain 路径同款门禁。
- `src/components/chat/ChatPanel.vue:1657-1660`、`:2200-2203`：主页同款门禁。

### 问题定性

意图分类是概率系统，批次解析是结构化校验系统。现在让概率系统拥有对结构化合法 JSON 的一票否决权，形成静默失败：

1. 分类器把“确认”判成 `discuss`。
2. UI 不解析批次。
3. 不记录 blocked 原因。
4. 模型与 SKILL 层都看不到真实死因。

### 修复设计

1. UI 解析门与意图门解耦。
   - 模型输出中一旦发现 `editor_edit_batch` / `editor_edit` / `outline_proposal`，一律先进入协议解析。
   - 解析成功后继续走现有 plan、预览、确认、版本校验、undo/rollback。
   - 意图只决定服务层工具执行权限，不再决定“是否允许查看/预览模型已经产出的批次”。
2. `discuss` 不自动执行直写。
   - plain/SKILL 路径的文本批次：discuss 也允许进入 pending 预览。
   - 原生工具 `editor.write`：服务层权限门维持现有拒绝逻辑，discuss 仍不能直接执行。
3. 批准语义补齐。
   - `APPROVAL_INPUT_PATTERN` 增加裸“确认”“好的”“可以”“执行吧”“写入”“就这样执行”。
   - pending 判定不再只依赖 assistant 文本，增加应用侧信号：
     - OutlineWorkspace：读取最近 assistant 消息里的 `outlineBatchRecord.status === 'pending'`。
     - ChatPanel：读取最近 assistant 消息里的 `editorBatchRecord.status === 'pending'`。
   - “确认”优先解释为对最近 pending 批次的批准；若不存在 pending 批次，仍保持 `discuss`。
4. 分类器上下文修正。
   - 短批准词检查必须放在 TF-IDF 判定之前。
   - 长文本输入大于 500 字且包含写入动词片段时，将 edit/generate 权重提高。
   - 不引入新的意图状态，不改变 `ChainIntent` 类型。

## P0-2 discuss 工具面剥离导致写入死亡

### 现状证据

- `src/services/dialogueFoundation.ts:163`：`proposeEdits` 只允许 `edit/generate`。
- `src/services/dialogueFoundation.ts:153-165`：`resolveDialogueToolSurface()` 把 write 工具全部过滤掉。
- `src/components/common/OutlineWorkspace.vue:2849-2857`：plain 路径因此失去 `editor.write` / `editor.propose_edits`。
- `payloads/049-response.json`：模型声明“当前可用工具只有读取、搜索、定位类，没有实际执行写入的通道”。

### 问题定性

“执行权限”和“工具可见性”被混在一起。安全上禁止 discuss 直接写盘是对的，但把写入工具完全藏起来，会让模型在需要提案时退化成裸 JSON，再被 P0-1 的解析门挡死。

### 修复设计

1. `resolveDialogueToolSurface()` 的返回值扩展一个 `blockedTools` 列表。
   - `discuss` 下保留 `editor.propose_edits` 声明。
   - `editor.write` 可继续隐藏；或者声明但通过服务层权限门拒绝。
   - 推荐保守方案：`editor.propose_edits` 可见，`editor.write` 仍隐藏。
2. 服务层权限门保持不变。
   - `aiService.ts:260-274` 继续作为 M9 权限门。
   - discuss 不允许 `editor.write` 真实执行。
3. 工具声明同步提示。
   - `editor.propose_edits` 的 description 说明“提交受限批次，进入预览确认，不直接写盘”。

## P0-3 trace 诊断缺失

### 现状证据

- `OutlineWorkspace.vue:2500-2506`：被挡批次只记 `proposal-missing`，detail 写“模型未调用”，误导归责。
- `editorEditProtocol.ts:129-130`：超过 80000 字符静默返回 null。
- `export.json`：所有 turn 的 `toolSurface = null`。
- OutlineWorkspace plain 路径 `startOutlineRun()` 只传 `intent`，未传 `toolSurface`。

### 修复设计

1. 新增 trace 事件：`editor-batch-blocked`。
   - 字段：`intent`、`reason`、`batchCommandCount`、`rawLength`、`sourcePath`。
   - 至少四种 reason：`intent-gate`、`raw-too-long`、`json-invalid`、`protocol-invalid`。
2. `parseEditorEditBatch()` 改为返回结构化结果或新增 `parseEditorEditBatchWithReason()`。
   - 旧函数保留兼容，内部调用新函数。
   - 失败不再无诊断静默返回。
3. `startOutlineRun()` 与主页 `startHomeRun()` 必须传 `toolSurface`。
   - 记录最终工具面，包括被过滤掉的写入工具。
4. API call 记录补 `intent` 与 `toolSurface`。
5. 对 `parseEditorEditCommand()`、`parseOutlineProposal()` 同步补失败原因，避免同类静默失败。

## P2-1 系统提示重复注入（第三轮降级，本轮不碰）

### 现状证据

- `OutlineWorkspace.vue:756-782`：`buildOutlineSystemPrompt()` 注入大纲全文或结构地图 + 焦点全文。
- `conversationContextService.ts:197-219`：ContextPack 又注入结构地图 + 焦点全文。
- `conversationContextService.ts:79-93`：ContextPack 在无选区时把整个大纲作为“焦点全文”。
- `payloads/023-request.json` 实测同一条请求内出现 `当前大纲 ContextPack` 1 次、`结构地图` 7 次、`当前焦点全文` 1 次。
- 请求体积从 `004=564KB` 递增到 `052=632KB`。

### 修复设计

1. 大纲正文只允许一个权威注入源。
   - 推荐：plain 与 SKILL 统一走 ContextPack。
   - `buildOutlineSystemPrompt()` 只保留角色说明、写作规则、编辑协议，不再携带全文。
2. ContextPack 保持结构地图 + 选区/焦点局部全文。
   - 无选区且文档过长时，焦点全文改为结构地图 + 开头局部，禁止再次塞全文。
   - 需要其他区域时由模型调用只读工具读取。
3. 设定与记忆保持去重。
   - 同一轮 system prompt 中同一来源只出现一次。
4. 目标指标。
   - 7 轮会话的请求体积不应再逐轮线性膨胀。
   - trace 中新增 `context-source-count` 或在 prompt snapshot 中记录每个来源字符数。

## P1-1 历史链路漂移（第三轮范围缩小）

### 现状证据

- `OutlineWorkspace.vue:1197-1209`：意图分类从 `messages.value` 取历史。
- 成功路径已有 `recordTurn()`：OutlineWorkspace plain :3049、ChatPanel :1629/:1185、workspaceSkillEngine :646/:803。
- 失败与取消路径缺 `recordTurn()`，导致意图分类历史与 UI 历史在异常轮后漂移。

### 后果

plain 首轮后，UI 历史与 ContextService 历史开始漂移。分类器拿到的 `recentHistory` 不再与下一轮请求实际使用的会话上下文一致，导致意图判定的上下文基础不稳定。

### 修复设计

1. 成功路径已有 `recordTurn()`，不需要重复补。
2. **只补失败与取消路径**：中断、API 错误、批次解析失败、用户取消时也调用 `recordTurn()`，assistant 内容为结构化错误摘要，避免模型把失败当作事实继承。
3. 意图分类历史与请求构建历史必须来自同一来源：
   - 短期方案：统一用 `messages.value`。
   - 稳定方案：统一用 ConversationContextService。
4. 本次先采用短期方案，降低影响圈；后续统一底座时再收敛到单一来源。

## P2-2 续生成快照二次携带完整大纲（第三轮降级，本轮不碰）

### 现状证据

- `OutlineWorkspace.vue:735-740`：`buildOutlineFallbackMessages()` 将大纲全文放入 user 消息。
- `OutlineWorkspace.vue:2569`：续生成断点优先保存 `lastWorkspaceSkillMeta?.requestMessages`，没有时使用 fallback。
- 因此截断续生成快照可能保存完整 system 大纲 + ContextPack + 完整大纲 user 消息。

### 修复设计

1. 创建续生成快照前做 system 消息去重。
2. 大纲正文只保留 ContextPack 或只读工具可恢复的引用，不保留双份全文。
3. fallback 只在历史为空时作为最后手段。
4. trace 记录 `continuation-snapshot-size`。

## P2-3 批次上限与长内容

### 现状

`maxCommandLength = 20000`、`maxBatchContentLength = 60000`、`maxBatchRawLength = 80000` 是合理安全上限，不建议放宽。

### 修复

1. 不提高上限。
2. 超限必须返回结构化错误并给出“拆分成多个批次”的模型提示。
3. trace 必须能区分超限批次与解析失败。

## P2-4 reveal 参数自纠

### 现状

Turn 7 中模型先错误调用 reveal 参数，之后自纠。这是模型行为，不构成应用阻塞。

### 修复

1. 保留工具层结构化错误。
2. 在 trace 中统计同一工具的失败/重试次数。
3. 不为 reveal 增加自动重写逻辑，避免隐藏真实质量问题。

## 明确不改的安全资产

以下机制本次全部保留，禁止绕过：

1. `planEditorEditBatch()` 的唯一性、版本校验、all-or-nothing 设计。
2. `applyOutlineDirectWrite()` 的锁定校验、内容版本校验、结构完整性校验、undo。
3. `editorBatchRecord` 的 pending/applied/rejected/expired/rolled_back 状态机。
4. 服务层 M9 权限门：discuss 不允许 `editor.write` 直接执行。
5. 流水线隔离：pipeline 不注册交互式写入工具。
6. 批次大小上限。

## 修复顺序

按依赖关系执行，不做并行大改：

1. Trace 与解析诊断先行。
   - `parseEditorEditBatchWithReason()`
   - `editor-batch-blocked`
   - `toolSurface` / `intent` 补全
2. 批准语义与 pending 信号。
   - 裸“确认”识别
   - 从消息记录读取 pending 批次
3. 解析门与意图门解耦。
   - OutlineWorkspace SKILL/plain 两条路径
   - ChatPanel 两处同款路径
4. 工具面可见性调整。
   - discuss 保留 `editor.propose_edits`
   - 服务层权限门不动
5. 权限单源修正。
   - `resolveDialoguePermission()` 的 `canPropose` 与 `canWrite` 解耦
   - discuss/analyze 在 proposal 模式下放行 `editor.propose_edits`
   - 同步修订经验文件 M9 措辞
   - 同步更新 dialogueFoundation / dialogueFoundationContract / workspaceSkillEngine 三个 spec
6. 历史链路补齐失败/取消路径 `recordTurn()`。
7. 长文本意图加权、ContextPack 去重、续生成快照瘦身移到下一轮 P2，本轮不碰。

## E2E 测试矩阵

每个用例都必须产出 trace 断言，不得只用 UI 成功/失败做结论。

| 编号 | 入口 | 输入 | 预期 |
|---|---|---|---|
| A1 | Outline plain | 模型输出合法批次，用户说“确认” | 批次进入 pending，批准后写入，undo 可用 |
| A2 | Outline SKILL | 同上 | 同上 |
| A3 | Home editor | 同上 | 同上 |
| B1 | Outline plain | 粘贴 4000+ 字素材并要求补充 | 意图判定或批次通道不丢弃素材 |
| B2 | Outline plain | discuss 聊天且模型主动输出批次 | 只进入预览，不直接写入 |
| B3 | Outline plain | discuss 聊天且模型只回答 | 不出现写入 UI，不出现误报 |
| C1 | Outline plain | 纯聊天 | trace 记录 discuss、read-only 工具面 |
| C2 | Outline SKILL | 模型调用 `editor.propose_edits` | 工具调用、结果、批次全部进 trace |
| C3 | 任一入口 | 超长批次 | `editor-batch-blocked`，reason 为超限 |
| C4 | 任一入口 | JSON 损坏 | `editor-batch-blocked`，reason 为 json-invalid |
| D1 | 下一轮 P2 | 7 轮长会话 | 请求体积不逐轮线性膨胀 |
| D2 | 下一轮 P2 | 截断后续生成 | 快照不二次携带完整大纲 |
| D3 | Home editor | 同款门禁回归 | 主页行为与大纲工作台一致 |
| E1 | Pipeline | 模拟 discuss/edit 输入 | 交互式写入工具仍不可用 |
| E2 | Any | 模型无批次 | 不出现误导性 `proposal-missing` |
| F1 | Any | 版本变化后确认批次 | 拒绝写入，记录 version_changed |
| F2 | Any | 编辑器锁定后写入 | 拒绝写入，记录 locked |
| F3 | Any | 批次应用后撤销 | undo 成功，record 变为 rolled_back |

## 单测契约

1. `classifyPlainDialogueIntent`
   - pending 批次 + “确认” → edit
   - 无 pending 批次 + “确认” → discuss
   - 长文本加权移到下一轮 P2，本轮不断言
2. `resolveDialogueToolSurface`
   - discuss 返回 `editor.propose_edits`
   - discuss 不返回或不能执行 `editor.write`
   - pipeline 永远无写入工具
3. `parseEditorEditBatchWithReason`
   - 合法、JSON 损坏、超长、协议非法、命令数非法分别有 reason
4. `recordTurn`
   - plain、SKILL 的失败和取消路径写入
5. trace
   - blocked 事件必含 intent/reason/rawLength
   - turn.toolSurface 不为 null

## 经验文件门禁对账

| 门禁 | 本方案对应 |
|---|---|
| M1 影响圈 | 只动大纲/主页对话解析链与 trace，不动 pipeline 写入隔离 |
| M8 日志覆盖同步 | 新增 blocked、toolSurface、intent、快照体积、失败路径记录 |
| M9 权限执行门 | 服务层 `editor.write` 权限门不动；discuss 可见并调用提案工具进入预览，不能直写。经验文件 M9 的"不得拿到写入工具"在本方案执行时同步修订为"不得拿到直写工具"，否则提案工具与字面条款冲突 |
| M10 测试契约 | E2E 覆盖成功与拒绝路径，不为绿灯固化错误行为 |
| M11 意图单源 | 批准词与 pending 判定在 classify/route 两个入口同步修 |

## 风险与回滚

| 变更 | 风险 | 缓解 |
|---|---|---|
| 解析门解耦 | discuss 意图下出现更多预览 | 仍需用户确认，服务层不直写 |
| 批准词扩容 | 用户闲聊“可以”被误判 | 只在 pending 批次存在时生效 |
| 工具面保留提案工具 | 模型更频繁提案 | write budget 仍限制每轮 1 次 |
| 历史补记录 | 失败信息进入上下文 | 只写结构化摘要，明确失败状态 |
| 解析器切换 extractJsonCandidates | 与旧解析器边界差异 | 单测覆盖围栏 / 多 JSON / 字符串内括号 / 超长 |

## 验收定义

1. Turn 5 场景复现：模型输出合法批次 + 用户说“确认” → 应用必须进入批次预览，确认后写入，undo 可用。
2. Turn 2 场景复现：长素材不会因为“没有显式写入祈使句”被静默丢弃。
3. Turn 7 场景复现：discuss 下模型可调用 `editor.propose_edits`，结果可预览。
4. 任何批次死亡都能在 trace 中看到真实 reason。
5. 7 轮会话请求体积不再逐轮线性膨胀（本轮降 P2，不验收）。
6. 本轮范围内的 E2E 用例通过，且拒绝路径有 trace 证据。

## 本方案不覆盖

1. 生成流水线的 chain 上下文滚雪球问题。
2. 模型温度、供应商选择与长输出截断问题。
3. Editor 样式与呈现层重构。
4. Folder skill 协议升级。
5. ContextPack 去重与续生成快照瘦身（本轮降 P2，下一轮处理）。
