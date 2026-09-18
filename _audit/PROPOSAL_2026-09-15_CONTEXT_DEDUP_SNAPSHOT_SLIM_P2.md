# PROPOSAL 2026-09-15: ContextPack 去重 + 续生成快照瘦身（P2 双项）

> 状态：待审核
> 上游方案：`PROPOSAL_2026-09-15_OUTLINE_TRACE_RECURSIVE_REPAIR.md`（第三轮研磨降级项）
> 经验门禁：M12 多轮正推/反推研磨门禁
> 不设预算

---

## 一、目标倒推

| 用户要什么 | 当前痛点 | 最小改动 |
|---|---|---|
| API 对话不越来越慢、模型注意力不被稀释 | 7 轮会话请求体积 564KB→632KB 逐轮膨胀，同一大纲全文在 system prompt 中重复注入 | plain 与 SKILL 两条路径分别去重，大纲正文只保留一个权威注入源 |
| 续生成不携带冗余全文，断点恢复轻量 | 截断续生成快照包含完整 system 大纲 + ContextPack + fallback 大纲 user 消息，持久化到磁盘后体积膨胀 | 保存前对 originalMessages 做 system 去重 + 历史轮数截断 |

## 二、爆炸半径矩阵

| 修复项 | 半径 | 会砸到谁 |
|---|---|---|
| P2-1 plain 路径去重 | 中 | `OutlineWorkspace.vue` `buildOutlineSystemPrompt()`、`buildOutlineFallbackMessages()` |
| P2-1 SKILL 路径去重 | 高 | `conversationContextService.ts` `contextMessage()`、`workspaceSkillEngine.ts` `assembleMessages()` 调用点 |
| P2-1 主页编辑器去重 | 中 | `ChatPanel.vue` system prompt 组装（约 L1558 区域） |
| P2-2 续生成快照瘦身 | 中 | `OutlineWorkspace.vue` `createOutlineSnapshot()`、`ChatPanel.vue` L2252 续生成快照、`continuationStorage.ts` |
| 旧快照兼容 | 低 | `continuationStorage.ts` `loadContinuation()` 反序列化 |
| 运行记录 | 低 | `runTrace.ts` 新增 `continuation-snapshot-size` 事件 |

## 三、修复设计

### P2-1 ContextPack / 系统提示去重

**原则：大纲正文只允许一个权威注入源。分入口分治，不做共享去重函数（第三轮研磨修正 3）。**

#### plain 路径（OutlineWorkspace）

现状：
- `buildOutlineSystemPrompt()` 在大纲 > 12000 字时注入结构地图 + 焦点全文（L760-782）。
- `buildOutlineFallbackMessages()` 的 user 消息再次携带大纲全文（L753-758）。
- `conversationContextService.ts` 的 ContextPack 又注入结构地图 + 焦点全文（L197-219）。

修复：
1. `buildOutlineSystemPrompt()` 去掉大纲全文/结构地图/焦点全文，只保留角色说明 + 编辑协议。上下文由 ContextPack 统一提供。
2. `buildOutlineFallbackMessages()` 只在 `messages.value.length === 0`（历史为空）时才在 user 消息中携带大纲全文；有历史时只注入用户请求文本。
3. `buildOutlineContextPack()` 的焦点全文改为：有选区时保留选区全文；无选区且大纲 > 12000 字时改为结构地图 + 开头 8000 字局部（禁止塞全文）。模型需要其他区域时通过只读工具 `outline.read_range` 读取。

#### SKILL 路径（workspaceSkillEngine）

现状：
- `buildTemplateContext()` 注入 `outlineContent`，模板通过 `{{outlineContent}}` 变量引用全文。
- `assembleMessages()` 在最终消息中再叠加 ContextPack，导致全文重复。

修复：
1. `contextMessage()` 增加 `skipOutlineBody` 选项（由 `ContextPolicy` 传入）。当 `skipOutlineBody === true` 时，ContextPack 不携带 `[当前焦点全文]` 块，只保留 `[事实优先级]` + `[大纲结构地图]`（模型按地图定位后用只读工具读取细节）。
2. `workspaceSkillEngine.ts` 在构建 `contextPolicy()` 时，如果当前模板的 `buildTemplateContext()` 已包含 `outlineContent` 且长度 > 0，则设置 `skipOutlineBody: true`。
3. 不做共享去重函数——plain 和 SKILL 的判定入口不同，强行抽共享会破坏 SKILL 变量契约。

#### 主页编辑器（ChatPanel）

现状：
- `ChatPanel.vue` L1543-1570 区域：`chatCtx.referenceOutline`（完整大纲）+ `buildEditorEditPrompt` 的 `content`（编辑器正文）可能同为大纲内容，双份注入。

修复：
1. 当 `chatCtx.editorContent === chatCtx.referenceOutline`（主页编辑器标签页就是大纲标签）时，`referenceOutline` 设为空字符串，只保留编辑器正文一份。
2. `buildEditorEditPrompt` 大于 12000 字时，`focusContent` 改为选区或开头 8000 字局部，不塞全文。

### P2-2 续生成快照瘦身

**原则：续生成只需要 accumulatedText（已有 12000 字截断）+ 最近消息，不需要重复携带完整大纲全文。**

#### 保存时瘦身

1. 新增 `src/services/continuationSlim.ts`，导出 `slimContinuationMessages(messages: ContextMessage[]): ContextMessage[]`。
2. 瘦身规则：
   - system 消息：同一消息内按 `\n\n---\n\n` 或已知段落标记（`[工作区上下文]`、`[大纲结构地图]`、`[当前焦点全文]`）拆段去重，同一段只保留首份。
   - 历史 user/assistant 消息：保留最近 10 轮（20 条），其余丢弃。
   - 在最后一条 user 消息后追加一行：`[系统注] 本快照已瘦身，历史轮数已截断至最近 10 轮。`
3. `createOutlineSnapshot()`（OutlineWorkspace L1014）和 `ChatPanel.vue` L2252 续生成快照在 `saveContinuation()` 前调用 `slimContinuationMessages(snapshot.originalMessages)`。
4. 在 snapshot 中增加 `_slimmed: true` 标记（旧快照无此标记，反序列化时原样保留不崩）。
5. `runTraceStore` 记录 `continuation-snapshot-size` 事件：`{ before: number, after: number, saved: number }`。

#### 反序列化兼容

1. `loadContinuation()` 读取旧快照（无 `_slimmed` 标记）时原样返回，不做任何修改——确保升级后用户点续生成不崩。
2. 新快照带 `_slimmed: true` 时，`buildContinuationMessages()` 正常使用已瘦身后的 `originalMessages`，行为不变（因为瘦身只删冗余不删有效上下文）。

## 四、正推验证

| 改动 | 正推：能生效吗 | 新 BUG 风险 | 防线 |
|---|---|---|---|
| plain 去重 | 大纲只出现在 ContextPack 一处，不再逐轮膨胀 | 模型可能忘记用只读工具读远端内容 | ContextPack 的 `[事实优先级]` 已声明"需要细节时必须先读取节点内容" |
| SKILL 路径去重 | `{{outlineContent}}` 模板变量不受影响，ContextPack 只提供地图 | folder skill 模板没有 `{{outlineContent}}` 时 ContextPack 也不带全文，模型缺上下文 | 判定条件是 `buildTemplateContext().outlineContent > 0`；如果模板不含该变量，`outlineContent` 仍由 ContextPack 携带 |
| 主页去重 | 编辑器正文与大纲索引不再重复 | 用户在非大纲标签页时 `referenceOutline` 仍有值（正确行为） | 仅在 `editorContent === referenceOutline` 时去重 |
| 快照瘦身 | 磁盘文件变小，续生成质量不受影响（`buildContinuationMessages` 只用最后 12000 字） | 截断历史后模型丢失早期讨论结论 | 最近 10 轮足够覆盖当前编辑会话；更早结论应存入记忆而非依赖上下文 |
| 旧快照兼容 | 升级后旧快照正常加载 | 无 | `_slimmed` 标记区分，旧快照原样返回 |

## 五、反推验证

**Q1：最小改动能生效吗？**
能。plain 路径删掉 system prompt 中的全文注入后，ContextPack 是唯一来源，模型获得的信息不减少（只是从重复变为一份）。

**Q2：只修大纲工作台够吗？**
不够。主页编辑器 `ChatPanel.vue` 的 system prompt 也注入完整大纲，必须同步修。

**Q3：现有链路会不会绕过去重？**
plain 路径：`buildOutlineSystemPrompt()` 是唯一 system prompt 来源，删掉就没了。
SKILL 路径：`assembleMessages()` 是唯一组装点，`skipOutlineBody` 在 policy 层控制，所有 SKILL 模板统一走这条路。
主页：`ChatPanel.vue` 只有一个 system prompt 组装区域（约 L1543-1570）。

**Q4：快照瘦身会不会破坏已有续生成？**
不会。`buildContinuationMessages()` 只取 `accumulatedText` 最后 12000 字 + `originalMessages`。瘦身后的 `originalMessages` 保留了最近 10 轮 + 瘦身后的 system，足够让模型理解当前对话语境。

**Q5：有没有入口没扫到？**
已扫：`OutlineWorkspace.vue`（大纲）、`ChatPanel.vue`（主页）、`PipelinePanel.vue`（流水线不走 ContinuationSnapshot，不受影响）。

## 六、优先级证据化修订

| 项 | 上游方案评级 | 本轮评级 | 依据 |
|---|---|---|---|
| ContextPack 去重 | P2 | **P1（本轮执行）** | 客户实测 7 轮会话请求 564KB→632KB；模型注意力被稀释直接影响回复质量 |
| 续生成快照瘦身 | P2 | **P1（本轮执行）** | 磁盘文件膨胀影响加载速度；续生成质量受模型注意力影响 |
| 批次上限 | P2 | P2（不碰） | 60000 字上限已合理 |
| reveal 参数自纠 | P2 | P2（不碰） | 模型行为，不构成应用阻塞 |

## 七、影响圈声明

**打算改的文件：**
1. `src/components/common/OutlineWorkspace.vue` — `buildOutlineSystemPrompt()`、`buildOutlineFallbackMessages()`、`createOutlineSnapshot()`
2. `src/components/chat/ChatPanel.vue` — system prompt 组装区域、续生成快照创建
3. `src/services/conversationContextService.ts` — `contextMessage()` / `ContextPolicy` 增加 `skipOutlineBody`
4. `src/services/workspaceSkillEngine.ts` — `contextPolicy()` 增加 `skipOutlineBody` 判定
5. `src/services/continuation.ts` — `ContinuationSnapshot` 增加 `_slimmed?: boolean`
6. `src/services/continuationSlim.ts` — 新文件
7. `src/services/continuationStorage.ts` — 无改动（loadContinuation 原样返回即可兼容）
8. `src/stores/runTrace.ts` — 无改动（已有 `addEvent` 通用接口）

**可能碰到的：**
1. `dialogueFoundationContract.spec.ts` — ContextPack 结构断言
2. `conversationContextService.spec.ts` — ContextPack 内容断言
3. `continuationService.spec.ts` — 快照序列化断言
4. E2E 脚本 — `verify-dialogue-foundation-stage2.mjs` / `verify-api-direct-write-v2-e2e.mjs`

**不碰的：**
1. Pipeline 写入隔离
2. Folder skill 协议
3. 意图路由
4. 编辑器核心
5. 13 个保护文件

## 八、测试矩阵

| 编号 | 场景 | 验证方式 | 通过标准 |
|---|---|---|---|
| D1-1 | 大纲工作台 plain 7 轮会话 | E2E 或手动操作 + 抓请求 JSON | 请求体积第 7 轮 ≤ 第 1 轮 × 1.5（去重后不逐轮线性膨胀） |
| D1-2 | 大纲 SKILL 路径 | 单测：`buildTemplateContext` 返回 `outlineContent` 后 `contextMessage` 不含 `[当前焦点全文]` | 断言通过 |
| D1-3 | folder skill 无 `{{outlineContent}}` 变量 | 单测：`buildTemplateContext` 返回空 `outlineContent` 后 `contextMessage` 仍携带焦点全文 | 断言通过 |
| D1-4 | 主页编辑器大纲标签页 | 手动或 E2E：编辑器内容 === 大纲时 system prompt 只出现一份大纲 | 抓请求 JSON 断言 |
| D2-1 | 截断后续生成（大纲） | 手动触发截断 → 检查磁盘快照 JSON 大小 + `_slimmed: true` | 快照不含完整大纲全文，含最近 10 轮 |
| D2-2 | 截断后续生成（主页） | 同上 | 同上 |
| D2-3 | 旧快照加载 | 用 3.44.0 的旧快照 JSON 手动注入 storage → 加载 → 续生成 | 不崩，正常续生成 |
| D2-4 | 快照瘦身事件 | `runTrace` 导出 JSON 检查 `continuation-snapshot-size` 事件 | 事件存在且含 before/after/saved |
| 回归 | 原有 15 场景直写 E2E | `node scripts/verify-api-direct-write-v2-e2e.mjs` | 15/15 PASS |
| 回归 | 原有服务测试 | `npm run test:services` | 全绿 |
| 回归 | 类型检查 | `npm run type-check` | 0 error |

## 九、执行顺序

1. 新建 `continuationSlim.ts` + 单测
2. 修改 `conversationContextService.ts` ContextPolicy + `contextMessage()`
3. 修改 `workspaceSkillEngine.ts` `contextPolicy()`
4. 修改 `OutlineWorkspace.vue` 三处
5. 修改 `ChatPanel.vue` 两处
6. 修改 `continuation.ts` 类型定义
7. 运行 D1/D2 测试矩阵
8. 运行回归
9. 更新 DEV_LOG + 经验文件
10. 封装

## 十、审核确认点

1. plain 路径去重后，`buildOutlineSystemPrompt()` 只保留角色说明 + 编辑协议，不再携带任何大纲内容。ContextPack 是唯一全文来源。是否接受？
2. ContextPack 无选区且大纲 > 12000 字时，焦点全文改为开头 8000 字局部 + 结构地图。模型用只读工具读其他区域。是否接受？
3. 快照瘦身保留最近 10 轮历史。是否接受？（如果你觉得需要更多轮，请指定数字）
4. 主页编辑器在"大纲标签页"时只保留编辑器正文一份，不额外注入大纲索引。是否接受？
