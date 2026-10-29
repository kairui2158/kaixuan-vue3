# 2026-10-29 正文层内嵌降AI V3 整合实施方案

版本：V3.0  
状态：待用户审核；本版取代 V2 及其追加段落，作为唯一执行事实源。  
来源：GitHub 基准审查、V2 方案、三轮架构复审、当前源码接线证据。

## 1. 目标与边界

把 2026-10-29 基准审查确认的可用机制移植进正文层内嵌降AI，并升级 folder SKILL 协同架构。核心目标：

1. 检测内核从“固定词表 + 固定阈值”升级为“自适应阈值 + n-gram 指纹 + 场景分层 + 整体评分”。
2. 深度修复补上 30%/50% 变更率门禁，防止整章换腔。
3. 创作风格卡片接入降AI链路，形成作者声纹单源。
4. 降AI异常和质量门禁降级显式可见，不再静默吞掉。
5. 降AI注入从“应用单方面硬塞”升级为“应用投影 + SKILL 声明契约”。
6. folder SKILL 持续迭代被当作常态处理，落地时交付协同指导手册。

非目标：

- 不直接挂载外部 humanizer SKILL。
- 不引入外部词表和英文阈值。
- 不改变正文层 folder SKILL 的执行协议。
- 不把商业检测器分数当作最终目标。
- 不让 SKILL 声明覆盖用户显式选择的后处理模式。

## 2. 当前基线

现有源码保留 V1 架构：

- 生成期注入：`src/services/de-ai.js:736-768`、`src/components/pipeline/PipelinePanel.vue:3504-3554`
- folder 路径 `systemPromptSuffix`：`src/components/pipeline/PipelinePanel.vue:2657`、`src/services/skillRouter.ts:200`、`src/services/realSkillExecutor.ts:321`
- 三模式后处理：`src/components/pipeline/PipelinePanel.vue:5801-6005`
- 深度修复保护：`src/components/pipeline/PipelinePanel.vue:6089-6168`
- 契约复验：`src/components/pipeline/PipelinePanel.vue:5823-5847`、`:5933-5958`
- 终步反馈：`src/services/realSkillExecutor.ts:509-533`
- 用户后处理模式：`src/stores/deai.ts:58`

两个已确认注入入口：

1. folder 路径经 `systemPromptSuffix` 进入 `realSkillExecutor`。
2. agent 变体路径在 `callApiWithAgentVariantOwned` 内手工拼接 `[skillPart, agentPart, deaiPrompt]`。

已知架构事实：agent 变体路径当前只接收 `skillTemplate`，拿不到 folder `meta`，V3 实现必须显式补传元数据。

## 3. 架构原则

1. **单源执行权威**：正文 folder SKILL 继续负责模板、postProcess、schema、handoff；降AI不接管执行。
2. **单源风格权威**：`StyleProfile` 与 `compileStyleContext('body')` 是唯一风格来源；降AI只消费 `DeAiVoiceProfile` 投影。
3. **检测与修复分层**：检测器只报告；深度修复才改写；变更率门禁决定回滚。
4. **本地确定性门禁**：n-gram、变更率、漂移、评分全部本地计算，不新增 API 请求。
5. **权限分层**：应用注入、终步反馈、用户后处理是三个职责；SKILL 只能声明前两项，用户 `hardRuleMode` 权威不可被 SKILL 覆盖。
6. **注入单源**：降AI生成期提示只由一个投影函数产出，folder 与 agent 路径共享结果。
7. **可审计**：投影、策略、冲突、降级、版本全部进 trace 与导出通道。
8. **向后兼容**：旧 folder SKILL 零迁移可运行；未知版本和未知字段宽容但必须留痕。

## 4. folder SKILL 契约

新增元数据块，挂在 `meta.deai`，与 `chainHandoff` 同级：

```ts
export type DeaiGenerationMode = 'on' | 'off' | 'suffix-only'
export type DeaiFinalStepDetectionMode = 'on' | 'off'
export type DeaiConflictPolicy = 'skill-wins' | 'app-wins' | 'report'

export interface SkillDeaiMeta {
  contractVersion?: 1
  generation?: DeaiGenerationMode
  finalStepDetection?: DeaiFinalStepDetectionMode
  conflictPolicy?: DeaiConflictPolicy
}

export type DeaiInjectionSource =
  | 'skill-declared'
  | 'app-default'
  | 'app-default-no-skill-meta'
  | 'skill-disabled'

export interface DeaiPromptProjection {
  prompt: string
  variant: 'methodology' | 'methodology-compose' | 'creative' | 'polish' | 'off'
  source: DeaiInjectionSource
  policy: Required<NonNullable<SkillDeaiMeta>>
  warnings: string[]
}
```

默认值：

```ts
{
  contractVersion: 1,
  generation: 'on',
  finalStepDetection: 'on',
  conflictPolicy: 'report'
}
```

语义规则：

1. 未声明任何字段时保持当前默认行为，旧 SKILL 不需要迁移。
2. `generation: 'off'` 只关闭生成期提示，不关闭终步反馈，也不关闭用户后处理。
3. `generation: 'suffix-only'` 只约束应用注入通道；SKILL 模板正文是否堆规则由冲突检测 advisory 报告。
4. `finalStepDetection: 'off'` 只关闭应用侧终步 findings 注入；用户 `detect-report/deep-fix/legacy-auto` 仍执行。
5. `conflictPolicy` 默认 `report`；`skill-wins` 删除应用重叠条目，`app-wins` 保留应用投影但记录 SKILL 声明 warning。
6. 未知 `contractVersion` 或非法字段不阻断运行；回退默认并写 warning 与原值。
7. agent 路径拿不到 SKILL 元数据时标 `app-default-no-skill-meta`，禁止伪装成 `skill-declared`。

新增纯函数：

```ts
validateSkillDeaiMeta(input: unknown): { valid: boolean; meta: SkillDeaiMeta; errors: string[]; warnings: string[] }
resolveDeaiPromptForSkillStep(
  step: number,
  chainIndex: number | undefined,
  chainCount: number | undefined,
  skillDeaiMeta: SkillDeaiMeta | null,
  context: { voiceProfile: DeAiVoiceProfile | null }
): DeaiPromptProjection
```

`validateSkillDeaiMeta` 接入 SKILL 包加载自检：非法枚举、非法版本、未知字段返回错误清单；运行时仍宽容回退，本地预检提前暴露问题。

## 5. 分阶段实施

### Phase 1 观测诚信修复（P0）

改动：

1. `detectBody` 删除 `protectedSpans.hit/missing` 与 `retentionRatio`，只保留 `protectedSpans.total`。
2. `retentionRatio` 只在深度修复后由 `verifyProtectedSpans` 计算，写入 `deai-minimal-edit`。
3. `collectFinalStepDeaiFindings` 异常不再静默返回空数组；写 trace warning，进入 `quality_gate_degraded`。
4. UI 汇总显示“降AI门禁降级”。

验收：

- must span 丢失样稿断言 retentionRatio 不等于 1。
- 检测异常产出 `quality_gate_degraded`。
- 导出 trace 可见 warning。

### Phase 2 变更率门禁（P0）

计算：

1. 原稿与修复稿按句切分，标点归一后计算句级 LCS。
2. `changeRate = 1 - LCS / max(sentenceCount, 1)`。
3. `changeRate >= 0.50` 拒绝修复并保留原文。
4. `0.30 <= changeRate < 0.50` 写 warning。
5. 阈值按 blocking findings 数量分级。

接线：`deep-fix` 输出后、契约复验前。

验收：整章换腔样稿被拒；合法局部打磨通过；20,000 字计算纳入性能账本。

### Phase 3 检测内核 V2（P0/P1）

能力：

1. per-kilo 阈值按有效字数自适应；短文设最小样本阈值。
2. 中文 2/3-gram 重复指纹；排除对白、标点、高频功能词。
3. 叙述层与对白层分层统计 hedging；对白使用宽容阈值。
4. 按 2,000 字窗口检测句长 CV、连接词密度、高频词密度，输出 `style_drift`。
5. 输出 0-100 分、verdict、AI-edited fraction。

报告结构：

```ts
interface DeAiDetectReportV2 {
  kernelVersion: 'v2'
  effectiveChars: number
  dialogueChars: number
  score: number
  verdict: 'clean' | 'advisory' | 'suspicious' | 'likely_ai' | 'blocking'
  aiEditedFraction: 'none' | 'light' | 'mixed' | 'heavy' | 'unknown'
  findings: DeAiFinding[]
  styleDrift?: { windowCount: number; firstLastDelta: number; severity: 'advisory' | 'blocking' }
  thresholds: { name: string; value: number; scaledValue: number; source: 'default' | 'calibrated' }[]
}
```

验收：长短文阈值不同；重复句式触发 n-gram；对白 hedging 不误伤；前后风格分裂触发漂移。

### Phase 4 作者声纹接入（P1）

1. 从 `styleProfileEffective` 投影 `DeAiVoiceProfile`。
2. 字段复用现有 V2 结构：`voice`、`descriptionFocus`、`quantitative`、`positiveRules`、`prohibitions`。
3. 生成期注入与深度修复共用该投影。
4. 档案优先于通用禁令；冲突写 trace。

验收：未锁定不注入；锁定后 S1/S2/S3 携带同一投影；单投影函数入测试。

### Phase 5 提示词压缩（P1）

1. S1 从 17 条压缩为 12 条。
2. S2 压缩为 5 条。
3. S3 保留 4 条。
4. 吸收明确立场、反 hedging seesaw、作者句子材料优先。
5. 风格细节交给 voice profile。

验收：FACT_LOCK 与章节契约测试不变红；生成样稿 A/B 对比，不出现“分数变好、小说变差”。

### Phase 6 legacy-auto 降级（P2）

1. 新项目默认关闭 `legacy-auto`。
2. UI 明示字符替换不提高人味。
3. trace 区分 `legacy-auto` 与 `deep-fix` 处理器版本。

验收：默认无硬替换；旧项目显式开启仍可用。

### Phase 7 trace 与 UI 汇总

事件：

- `deai-kernel-v2`
- `deai-score`
- `deai-change-rate`
- `deai-voice-profile`
- `deai-style-drift`
- `deai-injection-policy`
- `deai-quality-gate-degraded`

同步面：runTrace 存储、Electron 导出、外置 payload 索引、验证器白名单、UI 汇总卡片。

验收：standard/deep trace 均可机器遍历；UI 汇总与深层事件一致；SKILL 关闭终步反馈与用户后处理仍执行时 UI 双状态可见。

### Phase 8 folder SKILL 契约收口（P0/P1）

改动：

1. 新增 `src/services/skillDeaiContract.ts`：类型、默认值、`validateSkillDeaiMeta`、`resolveDeaiPromptForSkillStep`。
2. folder 路径读取并解析 `meta.deai`，经 `systemPromptSuffix` 传入执行器。
3. agent 路径签名补传 `skillDeaiMeta`，拿不到时使用 `app-default-no-skill-meta`。
4. `realSkillExecutor.ts` 保持通用，只认 `systemPromptSuffix`。
5. 双路径只锁定降AI投影、variant、policy、source 一致，不比较整份 systemPrompt。
6. SKILL 与应用规则重叠时按 `conflictPolicy` 处理并写 trace。

验收矩阵：

| 场景 | 断言 |
|---|---|
| `generation: 'off'` | 两条路径均不注入降AI prompt |
| `generation: 'on'` | 两条路径注入同一投影字符串 |
| 无声明 | 保持当前默认注入 |
| 非法值 | warning + trace 原值 + 回退默认 |
| 未知 contractVersion | 不阻断，warning 记录原值 |
| agent 无元数据 | `app-default-no-skill-meta`，禁止伪装 SKILL 声明 |
| `finalStepDetection: 'off'` + 用户 `deep-fix` | 终步反馈不注入，用户后处理仍执行，UI 双状态 |
| `skill-wins` | 应用删除重叠条目，trace 记录冲突 |
| 双路径一致性 | prompt、variant、policy、source 一致 |
| 契约预检 | 非法枚举、非法版本、未知字段返回错误清单 |

### Phase 8.5 folder SKILL 指导手册（P1，落地必交付）

交付 [_audit/FOLDER_SKILL_DEAI_CONTRACT_GUIDE_2026-10-29.md](FOLDER_SKILL_DEAI_CONTRACT_GUIDE_2026-10-29.md)，最低内容：

1. `meta.deai` 语义、合法值、默认值、禁止事项。
2. `contractVersion` 策略：兼容扩展 minor，语义变化 major，未知字段宽容留痕。
3. SKILL 迭代自检流程：先跑 `validateSkillDeaiMeta`，再用 fixtures 与 trace 复跑测试。
4. trace 阅读指导：`deai-injection-policy`、冲突事件、`quality_gate_degraded`。
5. 冲突升级路径：`report` 观察，再选 `skill-wins` 或 `app-wins`。
6. 旧 SKILL 零迁移示例、显式声明示例、非法值回退示例。
7. Phase 8 测试名、fixture 位置、期望结果。
8. 变更登记：内核、提示词、阈值、契约任何变更必须同步手册版本。

防漂移门禁：

- fixture 锚定手册接口片段。
- 应用/测试/手册三处字段一致性测试。
- 发布收尾清单包含“手册版本同步”。
- 跳过手册更新等同 Phase 8.5 未完成。

### Phase 9 集成回归（P0）

范围：

1. 单测：内核、契约、投影、变更率、retention。
2. 集成：folder 路径、agent 路径、终步反馈、三模式后处理、契约复验。
3. 观测：trace 存储、导出、回读、白名单。
4. UI：真实 Electron + Playwright 验证汇总、warning、模式切换。
5. 性能：20,000 字章节基准，检测 + 变更率低于 300ms，无 UI 卡顿。

### Phase 10 样本校准（放行断点）

使用用户真实中文网文样本校准阈值。未完成前所有阈值与评分保持 `provisional`。

通过标准：

1. 对白 hedging 误伤率低于 5%。
2. n-gram 命中率高于 90%。
3. 变更率门禁拒绝“事实保留但整章重写”。
4. 20,000 字本地检测 + 变更率低于 300ms。

## 6. 影响文件

预计新增：

- `src/services/skillDeaiContract.ts`
- `src/services/skillDeaiContract.spec.ts`
- `src/services/de-ai-v2.spec.ts`
- `src/components/pipeline/__tests__/deai-injection-policy.spec.ts`
- `_audit/FOLDER_SKILL_DEAI_CONTRACT_GUIDE_2026-10-29.md`

预计修改：

- `src/services/de-ai.js`
- `src/components/pipeline/PipelinePanel.vue`
- `src/services/realSkillExecutor.ts`
- `src/services/skillRouter.ts`
- `src/stores/deai.ts`
- `src/stores/runTrace.ts` 与导出相关文件
- 相关 Vitest/Playwright 测试

不修改：

- folder SKILL 执行协议本身。
- `pkg.meta.agent` 的 guidance 语义。
- 与降AI无关的 pipeline、provider、存储逻辑。

## 7. 验证命令

```powershell
npx vitest run src/services/de-ai-v2.spec.ts src/services/skillDeaiContract.spec.ts
npx vitest run src/components/pipeline/__tests__/deai-injection-policy.spec.ts
npx vitest run src/stores/runTrace.spec.ts
npx vitest run
npm run build
npx playwright test
```

Electron 手工/自动检查：

1. 打开正文层运行页，确认降AI汇总卡片显示 score、verdict、change rate、drift。
2. 构造检测异常，确认 `quality_gate_degraded` 出现在 UI 汇总与导出 trace。
3. folder SKILL 声明 `finalStepDetection: 'off'`，确认终步反馈关闭、用户后处理仍执行且 UI 双状态可见。
4. 导出 standard/deep trace，确认新事件可机器遍历。

## 8. 风险与对策

| 风险 | 对策 |
|---|---|
| 阈值误报 | provisional + 样本校准 + 对白分层 |
| n-gram 误伤口号、诗歌、咒语 | 白名单与上下文豁免 |
| 合法重排被判过度修改 | 句级 LCS + 标点归一 + 分级阈值 |
| voice profile 与 SKILL 冲突 | 单源投影 + conflictPolicy + trace |
| 提示词压缩导致质量回归 | A/B 样稿 + FACT_LOCK 测试 |
| 新事件破坏旧 trace | schemaVersion 升级 + 兼容测试 |
| SKILL 声明覆盖用户设置 | 权限分层 + UI/trace 双显示 |
| agent 路径缺元数据 | 显式传参 + `app-default-no-skill-meta` |
| 双路径断言误伤执行协议 | 只锁定降AI投影四元组 |
| 手册漂移 | fixture 锚定 + 三处一致性测试 + 发布收尾 |
| 契约误用 | `validateSkillDeaiMeta` 本地预检 |

## 9. 经验门禁对账

| 门禁 | V3 落点 |
|---|---|
| G0.3 诚实闭环 | provisional、quality_gate_degraded、失败留痕 |
| G0.6 方案成熟度 | 本文件为整合版；执行前人工审核 |
| G0.9 影响圈 | 只碰降AI、契约、trace、测试、手册 |
| G0.10 新旧并存清零 | 假 retention 删除并负向断言；旧事件同批迁移 |
| G1.4 验证分层 | 单测/集成/观测/UI/样本校准分列 |
| G1.8 观测同步 | runTrace、导出、白名单、UI 同步 |
| G1.9 状态机 | `quality_gate_degraded` 注册终态映射 |
| G1.14 性能账本 | 本地门禁分段耗时 + 300ms 标准 |
| G1.15 自盲区 | A/B 生成样稿反向验证 |
| G2.9 流水线 | 后处理后契约复验保留 |
| G2.13 SKILL 单源 | 不新增第二权威；执行器不感知降AI |

## 10. 执行顺序与放行点

1. Phase 1 观测诚信。
2. Phase 2 变更率门禁。
3. Phase 3 检测内核。
4. Phase 4 作者声纹。
5. Phase 5 提示词压缩。
6. Phase 6/7 legacy-auto 与 trace/UI。
7. Phase 8/8.5 契约与手册。
8. Phase 9 集成回归。
9. Phase 10 样本校准，移除 `provisional`。

放行规则：

- 每 Phase 结束必须有新鲜测试输出与 diff。
- 任一验收失败，不进入下一 Phase。
- 样本校准前不得宣称最终版。
- 指导手册未同步等同未完成。

## 11. 成熟度结论

| 层面 | 结论 |
|---|---|
| 执行器/工具层 | 成熟：本地确定性算法，测试可完全覆盖 |
| 检测内核 | 成熟设计；阈值校准是显式放行断点 |
| 应用接线 | 成熟：源码位置已定位，含 agent 元数据补传 |
| folder SKILL 契约 | 成熟：类型、默认值、权限分层、预检、双路径一致均已定义 |
| SKILL 迭代支持 | 成熟：contractVersion、validate、手册、防漂移门禁 |
| 验证标准 | 成熟；样本校准前保持 provisional |

整体结论：V3 是可执行的完整整合方案；剩余唯一放行断点是真实中文样本校准与 live 生成对比，不允许在校准前宣称最终版。

## 12. 边界

- 本文件是方案，不是已实现状态。
- 产品源码尚未修改。
- 未执行 live API 对比。
- 未做外部代码复制；若未来复制，需先逐仓审查 license。
- V2 文件保留为历史版本；执行时以本 V3 为唯一事实源。
