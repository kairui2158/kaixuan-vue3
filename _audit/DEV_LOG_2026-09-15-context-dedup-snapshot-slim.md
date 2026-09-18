# DEV LOG 2026-09-15 ContextPack 去重 + 续生成快照瘦身（P2 双项）

> 任务名：ContextPack 去重 + 续生成快照瘦身
> 方案：`_audit/PROPOSAL_2026-09-15_CONTEXT_DEDUP_SNAPSHOT_SLIM_P2.md`
> 版本：3.45.0
> 经验门禁：M12 多轮正推/反推研磨门禁
> 状态：代码与验证已闭环

## 根因与修复

### P2-1 ContextPack / 系统提示去重

1. **plain 路径**：`buildOutlineSystemPrompt()` 去掉大纲全文注入（原来注入完整大纲或结构地图+焦点全文）。`buildOutlineFallbackMessages()` 仅在历史为空时才在 user 消息携带大纲全文。大纲正文由 ContextPack 统一提供。
2. **SKILL 路径**：`contextMessage()` 在 `ContextPolicy.skipOutlineBody === true` 时不注入焦点全文，只保留事实优先级 + 结构地图 + 工具提示。`workspaceSkillEngine.ts` 的 `contextPolicy()` 检测 `buildTemplateContext()` 返回的 `outlineContent` 非空时自动设 `skipOutlineBody: true`，folder 和 text 两个调用点同步覆盖。
3. **主页编辑器**：`ChatPanel.vue` 当编辑器内容与大纲完全相同（大纲标签页）时去掉重复的 `referenceOutline` 注入。
4. **ContextPack 无选区且大纲超长时**：`buildOutlineContextPack()` 原来注入全文，现在仍然保留全文（方案确认保留 plain ContextPack 全文，只有 SKILL 路径 skip 时才改为地图）。plain 路径的大纲正文由 ContextPack 提供，模型可自行定位。

### P2-2 续生成快照瘦身

1. 新建 `src/services/continuationSlim.ts`：对 `originalMessages` 做 system 段落去重 + 历史 user/assistant 消息截断至最近 20 条（10 轮）。追加瘦身提示 system 消息。
2. `OutlineWorkspace.vue` `createOutlineSnapshot()` 和 `ChatPanel.vue` 续生成快照创建处均调用 `slimContinuationMessages()` 并设置 `_slimmed: true`。
3. `continuation.ts` 增加 `_slimmed?: boolean` 可选字段，旧快照无此字段反序列化不崩。

## 验证

| 门 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `npm run type-check` | 0 error |
| 服务测试 | `npm run test:services` | 15 files / 216 tests passed |
| 专项测试 | `npx vitest run continuationSlim continuation continuationService conversationContextService continuationStorage` | 5 files / 28 tests passed |
| 对话底座 | `npx vitest run dialogueFoundation dialogueFoundationContract` | 2 files / 33 tests passed |
| 前端构建 | `npm run build:vue` | passed |

## 影响圈复核

改动文件与方案第七节影响圈一致：
- `src/services/continuationSlim.ts`（新）
- `src/services/continuationSlim.spec.ts`（新）
- `src/services/continuation.ts`（+_slimmed 字段）
- `src/types/context.ts`（+skipOutlineBody 字段）
- `src/services/conversationContextService.ts`（contextMessage 分支）
- `src/services/workspaceSkillEngine.ts`（contextPolicy 签名 + 两个调用点）
- `src/components/common/OutlineWorkspace.vue`（buildOutlineSystemPrompt / buildOutlineFallbackMessages / createOutlineSnapshot / import）
- `src/components/chat/ChatPanel.vue`（大纲标签去重 / 续生成快照瘦身 / import）
- `package.json`（3.44.0→3.45.0）

未碰：Pipeline 写入隔离、Folder skill 协议、意图路由、编辑器核心、13 个保护文件。
