# 上下文记忆缺陷修复方案（V2 全对齐版）

> 状态：**已执行，P0-P6 完成** —— 最终结论以 `CONTEXT_MEMORY_FINAL_REPORT_2026-09-01.md` 和本轮验证输出为准
> 生成日期：2026-09-01
> 经验依据：`_audit/神意开发经验总结_v2.md`（下称 V2）
> 结论先行：SKILL 调用无会话上下文是应用层协议缺失，不是供应商或模型问题

## 0. 执行边界声明

1. 本方案落盘前已完成源码实测，所有行号来自 2026-09-01 本轮 `rg`/读取输出，不是交接摘要转述。
2. 交接摘要中的 `src/components/OutlineWorkspace.vue` 已迁移至 `src/components/common/OutlineWorkspace.vue`，以实测路径为准。
3. 用户明确要求"不执行"：本文档不伴随任何源码、store、UI 改动。
4. 审核通过后按 §5 的 P0→P6 顺序执行，任一阶段验证不过不得进入下一阶段。

## 1. 根因定位（源码实测）

| # | 位置 | 行号 | 实测现状 |
|---|------|------|----------|
| 1 | src/components/chat/ChatPanel.vue | 404-405, 523 | 普通对话有会话历史：倒序遍历 messages 组装历史；opts.messages 透传 |
| 2 | src/stores/chat.ts | 47-49 | saveSessions 按 storageKey('chat_' + projectId) 持久化会话 |
| 3 | src/components/common/OutlineWorkspace.vue | 412-415 | SKILL 调用只发 system + user 两条消息，无历史、无大纲上下文 |
| 4 | src/components/common/OutlineWorkspace.vue | 1152, 1174 | askPlainAi 普通对话带全量历史 + 当前大纲，与 SKILL 路径不一致 |
| 5 | public/skill-engine.js | 203, 221 | _callStep 最终组装也只有 system + user 两段 |
| 6 | src/components/pipeline/PipelinePanel.vue | 1573, 2594 | 流水线已接 retrieveContext 记忆检索，但上下文形状未统一 |
| 7 | src/services/memoryRetriever.ts | - | retrieveContext 可复用，无需重写 |

根因结论：普通对话"读历史 → 调 API → 写回"闭环存在；SKILL 执行链没有这套协议。
缺少统一 ConversationContextService，各调用点各自决定传什么，SKILL 每次像重开。

## 2. 社区调研结论

| 项目 | 星数 | 借鉴机制 | 采纳方式 |
|------|------|----------|----------|
| Vercel AI SDK | 26,510 | 消息校验后统一转模型消息；loadChat/saveChat 会话闭环 | 借鉴消息归一化与"读→调→写"闭环 |
| OpenAI Agents SDK Sessions | 29,100 | 运行前 get_items 读历史、运行后 add_items 写回；limit 控制窗口 | SKILL 调用同样"读历史→调API→写回" |
| Mem0 | 64,434 | 抽取与检索分离；scope 过滤（user_id/agent_id/run_id）防跨域污染 | 上下文按 projectId+workspace+purpose+skillId 隔离 |
| LangGraph | 40,789 | Checkpointer 管线程内短期；Store 管跨线程长期；SummarizationNode 压缩 | 近期历史与长期记忆分层，超窗走摘要 |
| Letta | 24,508 | core/recall/archival 三层记忆 | 概念借鉴：会话层/工作区层/记忆层分块 |
| Zep | 4,883 | 时序知识图谱 + context template | 仅概念借鉴，不引入运行时依赖 |

社区共识：不是"把所有历史塞进去"，而是**短期会话、长期记忆、工作区状态三层分离，按用途裁剪**。

## 3. 目标与非目标

### 3.1 目标

1. SKILL 调用具备会话上下文：默认最近 10 轮，可配置。
2. chain 第一步带原始请求 + 历史 + 工作区；后续步骤带原始请求 + 上一步完整输出，不注入全量聊天历史。
3. 上下文按 projectId + workspace + purpose + skillId 隔离，跨项目零污染。
4. 主页普通对话行为完全不变（回归红线）。
5. 流水线记忆注入经 ContextBundle 归一化，不重做已闭环逻辑。
6. 设置页提供上下文策略 UI（默认 recent 10 + 大纲 + 记忆）。

### 3.2 非目标

1. 不改 aiService 供应商路由/超时/重试/日志逻辑（V2 §8 全部规则继续生效）。
2. 不引入 Mem0/Zep 等外部记忆服务，不新增运行时依赖。
3. 不迁移框架，不改 Vue3/Pinia/Electron 技术栈。
4. 不改 SKILL 文件内容与 SKILL 编辑器逻辑。
5. 不做图片/视频/TTS 供应商。
6. 不回滚任何已闭环功能（V2 §9 防无限回滚铁律）。

## 4. 核心设计

### 4.1 ContextBundle（一次调用的完整上下文）

```ts
interface ContextBundle {
  session: {
    id: string
    projectId: string
    recentMessages: ChatMessage[]
    summary?: string
  }
  workspace: {
    outline?: string
    selectedText?: string
    activeTab?: string
    settings?: Record<string, unknown>
    memories?: string
  }
  execution: {
    purpose: 'generate' | 'rewrite' | 'verify' | 'detect' | 'image' | 'video'
    skillId?: string
    agentId?: string
    previousSkillOutput?: string
  }
}
```

### 4.2 ContextPolicy（裁剪策略）

```ts
interface ContextPolicy {
  chatHistory: 'none' | 'recent' | 'summary' | 'full'
  recentTurns: number        // 默认 10
  includeOutline: boolean
  includeSettings: boolean
  includeMemory: boolean
}
```

### 4.3 ConversationContextService API

```ts
buildContextBundle(input: {
  projectId: string
  workspace: 'main' | 'outline'
  purpose: string
  skillId?: string
  agentId?: string
  selectedText?: string
}): Promise<ContextBundle>

assembleMessages(bundle: ContextBundle, policy: ContextPolicy, base: ChatMessage[]): ChatMessage[]
// 拼装顺序：system(Agent/SKILL) → context block(工作区+记忆) → history(按 policy 裁剪) → 当前 user

recordTurn(ref: ContextRef, turn: { user: string; assistant: string; meta?: object }): Promise<void>
// 仅在 SKILL/对话成功返回后写回；失败只进诊断日志，不伪造会话轮次（V2 §8 规则 9）

clearSession(ref: ContextRef): Promise<void>
getPolicy(purpose: string, skillId?: string): ContextPolicy
```

### 4.4 存储协议（V2 §7 对齐）

1. key：`wa_ctx_<projectId>`（V2 §7 规则 6：key 必须含项目 ID）。
2. 结构：`{ version: 1, sessions: [{ id, scope: { workspace, purpose, skillId }, messages: [], updatedAt }] }`。
3. 写盘复用现有存储加固层：原子写四步 + 按 key 串行化（V2 §7 规则 1/2）。
4. 旧 `chat_<projectId>` 数据只读兼容，不迁移不破坏；导入项目不预建 ctx（V2 §7 规则 15）。

### 4.5 接入策略总表

| 调用场景 | 历史策略 | 工作区 | 记忆 | chain 语义 |
|----------|----------|--------|------|-----------|
| 主页普通对话 | recent(10) | 否 | 按现有 | 无 |
| 大纲工作台普通对话 | recent(10) | outline+选区 | 按现有 | 无 |
| 大纲工作台 SKILL | recent(10) | outline+选区 | 是 | 单步 |
| chain 第一步 | recent(10) | 是 | 是 | 原始请求 + 历史 |
| chain 后续步骤 | none | 关键约束 | 否 | 上一步完整输出 |
| 生成流水线各层 | none | 层输入 | retrieveContext | 维持现状，仅归一化形状 |

## 5. 分阶段执行计划（P0→P6，逐项闭环）

### P0 协议冻结与影响圈（V2 §1 M1/M3）

- [ ] 新增 `src/types/context.ts`：ContextBundle / ContextPolicy / ContextRef / ChatMessage 归一化。
- [ ] rg 产出影响圈清单：OutlineWorkspace.vue、ChatPanel.vue、chat store、skill-engine.js 的引用关系。
- [ ] 类型编译通过（vue-tsc / build），零行为变化。

验证：`npx vue-tsc --noEmit` 原始输出 + 影响圈清单写入阶段报告。

### P1 ConversationContextService（V2 §1 规则 5、§8 规则 1）

- [ ] 新增 `src/services/conversationContextService.ts`：buildContextBundle / assembleMessages / recordTurn / clearSession / getPolicy。
- [ ] 数据只读自 store/storage，不新建事实来源；不新建 HTTP 入口，最终仍走 aiService.callAi。
- [ ] 脚本验证四种 policy 输出形状（none/recent/summary/full），不发真实请求。

验证：复杂脚本写 .cjs 文件执行（V2 §2 规则 2），输出各 policy 的 messages 结构对比表。

### P2 SKILL 执行链接入（V2 §8 规则 3/7/9）

- [ ] common/OutlineWorkspace.vue:412 处改经 ContextService 组装 messages。
- [ ] public/skill-engine.js:221 支持注入 context block + history 参数（保持向后兼容默认）。
- [ ] chain 语义：第一步 = 原始请求 + recent + workspace；后续 = 原始请求 + 上一步完整输出。
- [ ] recordTurn 写回；失败区分 failed/skipped/fallback，不伪装完成。
- [ ] 诊断日志 detail 增 ctxTurns 字段（V2 §8 规则 7：detail 必含既有字段）。

验证：monkey-patch 记录 aiService 入参断言历史存在（V2 §2 规则 15）；再真实 Electron CDP 两轮 SKILL 对话，第二轮日志含第一轮内容。

### P3 流水线归一化（V2 §9 防回滚铁律）

- [ ] PipelinePanel.vue:1573/2594 的 memoryContext 改经 ContextBundle 形状。
- [ ] 不重做已闭环记忆逻辑，只统一消息拼装入口。

验证：对比接入前后 messages 数组与请求次数，一章生成仍 = 1 次请求；服务层测试不当 UI 证据（V2 §3 规则 4）。

### P4 UI 策略配置（V2 §5 规则 1/6/9）

- [ ] 设置页 SKILL/Agent 面板新增"上下文策略"：历史模式（关闭/最近 5/10/20/摘要）+ 大纲/记忆开关。
- [ ] 默认 recent 10 + outline + memory；颜色字号走 tokens.css，禁硬编码。

验证：CDP 逐弹窗溢出扫描（V2 §5 规则 6/9）；配置保存 → 重启 → 恢复断言。

### P5 持久化与兼容（V2 §7 规则 1/2/6/15）

- [ ] wa_ctx_<projectId> 落地，写盘走现有加固层。
- [ ] 旧 chat 数据只读；导入不含 ctx 状态的项目不预建。

验证：三段式 A/B/C 跨重启脚本（V2 §7 规则 12）；真实磁盘损坏 JSON → .bak 恢复断言（V2 §7 规则 4）。

### P6 真实闭环与收尾（V2 §3 规则 1/8/11、§2 规则 18、§6 规则 1、§9 经验回写）

- [ ] 五门独立验证：构建 / 类型检查 / 测试 runner / CDP 真实操作 / 安装包。
- [ ] 真实 Electron：连续 SKILL 对话引用前文 → 重启恢复 → 清空重开 → 断网/取消/无供应商错误路径。
- [ ] 记忆上下文验证用真实已生成内容，禁止注入假数据制造通过（V2 §3 规则 8）。
- [ ] 版本号 minor 升级；npm run build 封装。
- [ ] 更新 V2 + DEV_LOG 与代码一起提交（V2 §9 经验回写铁律）。

## 6. 风险与防控

| 风险 | 防控 | V2 依据 |
|------|------|---------|
| token 爆炸 | 默认 10 轮 + workspace 截断上限 + UI 可配 | §8 规则 3 精神 |
| chain 语义漂移 | 后续步骤不注入全量聊天历史，只带上一步输出 | §8 规则 9 |
| 跨项目污染 | key 含 projectId；scope 含 workspace+purpose+skillId（Mem0 filters 经验） | §7 规则 6 |
| 普通对话回归 | ChatPanel 只在取上下文处统一，行为断言 before/after | §9 防回滚 |
| 旧数据破坏 | wa_ctx 新键独立；旧 chat 只读 | §7 规则 7 |
| UI 溢出 | 逐弹窗实测 + 递归扫描 | §5 规则 6/9 |
| M 系污染 | 每阶段 M1 影响圈 + M3 diff 逐行自审 | §1 M1-M3 |
| 假阳性验证 | mock 只断言结构；连贯性必须真实 Electron CDP | §3 规则 1/4 |

## 7. 验证门矩阵（V2 §3 规则 11：五门独立，一门通过不覆盖另一门）

| 门 | 通过标准 | 证据形式 |
|----|----------|----------|
| 构建 | npm run build exit 0 | 原始输出 |
| 类型 | vue-tsc --noEmit exit 0 | 原始输出 |
| 单测/脚本 | policy 形状断言全过 | .cjs 输出 |
| CDP | 两轮 SKILL 第二轮含第一轮上下文 | 日志 detail + 截图 |
| 安装包 | 客户路径导入项目 → SKILL 两轮 → 重启恢复 | 三段式 JSON 台账 |

## 8. 阻断条件

1. 任一门验证不过 → 停止推进，根因定位 → 最小修复 → 重验；连续修复后仍被外部环境阻断才可标 BLOCKED。
2. 执行中发现本方案与实际代码冲突 → 停止，修订方案重新送审，不擅改协议。
3. 已 CDP 验证闭环的项不得以"感觉更好"回滚（V2 §9 铁律）。

## 9. 交付物清单

1. `src/types/context.ts` — 协议类型。
2. `src/services/conversationContextService.ts` — 上下文服务。
3. `src/components/common/OutlineWorkspace.vue` — SKILL 调用接入。
4. `public/skill-engine.js` — context/history 注入支持。
5. `src/components/pipeline/PipelinePanel.vue` — 形状归一化。
6. 设置页上下文策略 UI。
7. 验证报告（五门台账）+ DEV_LOG + V2 更新 + minor 版本号封装。

---
审核结论待用户确认。审核通过后从 P0 开始，逐项闭环，验证失败不收尾。
