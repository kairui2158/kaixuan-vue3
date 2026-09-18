# 降AI硬规则架构 V2 改造执行计划

> 日期：2026-09-09  
> 状态：待审核，未执行  
> 依据：`_audit/DEAI_社区深度调研报告_2026-09-09.md`、`_audit/神意开发经验总结_v3.md`  
> 目标：把“字符级自动替换”升级为“检测报告 + 保护片段 + 模型级最小编辑 + 硬指标门禁”，同时保留现有安全层。

## 1. 结论与改造目标

### 1.1 核心结论

1. 前置方法论 + 后处理的双层方向是正确的，社区项目普遍采用类似分层。
2. 现有 `processBody()` + `passesBodyIntegrityCheck()` 是安全过渡态，不是最终形态。
3. 最大缺口不在“规则多少”，而在后处理职责错位：成熟项目的脚本层只做“检测、报告、门禁”，不做自动改写；改写交给模型层做最小编辑，并由用户确认。
4. 当前自动替换无法解决句长方差、信息密度、连接词密度、结构趋同、信息账本回对等问题；这些问题需要检测报告暴露，交给模型层处理。

### 1.2 改造目标

1. **检测优先**：先出问题清单，用户确认后再改写，禁止无感静默改写。
2. **保护优先**：对正文先预扫人名、设定、伏笔、白名单等 protected spans，改写后回对，缺失即回滚或报警。
3. **最小编辑**：模型层改写必须在原句上做最小修补，禁止整段重生成、禁止回译。
4. **硬指标门禁**：在现有完整性门禁上叠加密度阈值、句长方差、连接词密度等可量化指标。
5. **行为兼容**：旧入口全部保留，输出结构兼容旧消费方；只有用户明确选择新链路时才走新逻辑。
6. **链路分离**：流水线正文生成、设置页“去AI味”独立配置与独立报告，防止互相覆盖。

## 2. 现状与影响圈（M1）

### 2.1 现有实现位置

| 模块 | 位置 | 现状 |
|---|---|---|
| 正文方法论 | `src/services/de-ai.js:2590` | 17 条 `DEAI_METHODOLOGY_PROMPT` |
| 正文后处理 | `src/services/de-ai.js:2487` | `processBody()` 字符级替换 |
| 完整性门禁 | `src/services/de-ai.js:191` | 段落数 + 句末标点 + 长度比 0.95-1.05 |
| 流水线正文层调用 | `src/components/pipeline/PipelinePanel.vue:3039` | 生成后自动清洗 |
| 主页编辑器调用 | `src/composables/useDeAi.ts:214、230、293、340` | 四个入口 |
| 设置页硬规则 | `src/components/settings/DeAiSettings.vue` | 20 条规则开关 |
| Store 配置 | `src/stores/deai.ts` | `hardruleEnabled` + `hardRules` 开关表 |

### 2.2 影响圈清单

**打算改的文件：**

1. `src/services/de-ai.js`：新增检测器、protected spans、最小编辑提示词、密度指标。
2. `src/stores/deai.ts`：新增检测/改写策略配置与报告状态。
3. `src/components/settings/DeAiSettings.vue`：新增“检测报告模式”“深度修复模式” UI 与报告查看入口。
4. `src/components/pipeline/PipelinePanel.vue`：正文层后处理改为默认“检测报告”，用户确认后才改写。
5. `src/composables/useDeAi.ts`：四个入口接入新报告与最小编辑链路。

**可能受影响的相邻模块：**

1. `src/components/editor/EditorPanel.vue`：去AI味入口按钮与结果提示。
2. `src/components/pipeline/PipelinePanel.vue`：正文生成进度与日志文案。
3. 降AI提示词对象或类型声明。

**必须不改的：**

1. `DEAI_METHODOLOGY_PROMPT` 现有 17 条的语义，除非为一致性补充“最小编辑”原则。
2. `passesBodyIntegrityCheck()` 的既有保护行为。
3. folder skill / agent / provider / runTrace 的执行链路。
4. 硬规则设置项的旧数据兼容，`hardRules` 旧配置升级后仍可读。
5. 生成流水线正文层以外的其他四层。

## 3. 目标架构

```text
生成前置：17条方法论注入（已有）
    ↓
protected spans 预扫（新增）
    ↓
模型生成
    ↓
检测器 detectBody()（新增）
    ├── blocking findings：严重问题，建议修复
    └── advisory findings：提示，可保留
    ↓
用户选择（流水线按模式自动决定，编辑器手动确认）
    ├── 仅查看报告，不改写
    ├── 应用安全替换（兼容旧行为）
    └── 深度修复：模型最小编辑
    ↓
改写后回对 protected spans + 硬指标门禁
```

## 4. 分阶段任务清单

### P0 检测报告模式

#### P0.1 新增 detectBody()

**文件**：`src/services/de-ai.js`

1. 新增独立函数 `detectBody(text, config)`，只检测，不改写。
2. 输出结构：

```js
{
  findings: [
    {
      id: 'ai-cliche-001',
      severity: 'blocking',
      type: '套话/AI偏好词',
      count: 2,
      perKilo: 1.6,
      samples: ['值得注意的是……', '不可否认……'],
      suggestion: '替换为具体动作或具体事实'
    }
  ],
  metrics: {
    sentenceLengthCV: 0.31,
    connectorDensity: 4.2,
    protectedSpans: { total: 12, hit: 12, missing: [] },
    retentionRatio: 1.0
  }
}
```

3. 检测项优先复用现有 `detectAiFreqWords`、`detectBannedVocab`、`detectBannedPhrases`、`detectConnectorDensity`、`detectUniformSentenceLength`，不重写规则。
4. `severity` 初始分档：
   - blocking：崩坏标点、密度超阈值、禁用句式、人名/伏笔缺失。
   - advisory：句长趋同、连接词密度偏高、结构趋同、通用观点。
5. 所有阈值集中在一个 `DEAI_DETECT_THRESHOLDS` 常量对象，禁止散落 magic number。

验收：

- 单元测试覆盖空文本、短文本、正常文本、blocking、advisory、protected spans 缺失。
- `detectBody()` 不修改输入文本，`text === originalText`。
- 输出 JSON 结构稳定，不额外引入依赖。

#### P0.2 设置页新增硬规则模式

**文件**：`src/stores/deai.ts`、`src/components/settings/DeAiSettings.vue`

1. 新增配置字段：

```ts
type DeAiHardRuleMode = 'legacy-auto' | 'detect-report' | 'deep-fix'
hardRuleMode: DeAiHardRuleMode
```

2. 默认值：`detect-report`。旧用户升级后仍可通过 `legacy-auto` 回到旧行为。
3. UI 呈现三个模式：
   - `legacy-auto`：兼容模式（自动替换）。
   - `detect-report`：检测报告（推荐）。
   - `deep-fix`：深度修复（报告 + 模型最小编辑）。
4. 报告查看入口：设置页显示“查看最近检测报告”，打开后按 blocking / advisory 分组展示样本与建议。
5. 设置页只做配置与报告展示，不承担改写职能。

验收：

- 切换模式后 `saveConfig()` 写盘，重启后配置保留。
- 旧配置缺失 `hardRuleMode` 时默认 `detect-report`，且不破坏 `hardRules`。
- 报告面板空态明确，不出现永久 loading 或死按钮。

#### P0.3 流水线正文层接入

**文件**：`src/components/pipeline/PipelinePanel.vue`

1. `genBody()` 在 API 返回后调用 `detectBody()`。
2. `hardRuleMode === 'legacy-auto'` 时保持现有 `processBody()` 自动清洗。
3. `hardRuleMode === 'detect-report'`：只检测，不清洗；日志输出检测摘要，报告对象写入运行记录 store，不直接替换正文。
4. `hardRuleMode === 'deep-fix'`：在检测报告基础上追加模型最小编辑请求；请求 prompt 明确“最小编辑、不重排整段、不回译、不压缩”，完成后执行 protected spans 回对 + 完整性门禁。
5. 检测/改写结果均写入 `runTraceStore.addEvent()`，复用现有运行记录面板查看。

验收：

- 生成后正文不被静默改写，除非用户选择 auto 或 deep-fix。
- deep-fix 失败时不影响正文落盘，正文使用原始生成结果。
- 每次生成在运行记录中能查到检测报告对象。

#### P0.4 主页编辑器接入

**文件**：`src/composables/useDeAi.ts`、`src/components/editor/EditorPanel.vue`

1. 四个 `processBody()` 调用点按模式分发：
   - `legacy-auto`：旧行为。
   - `detect-report`：运行检测，将报告对象返回给 UI 展示，不改写正文。
   - `deep-fix`：模型最小编辑 + 门禁。
2. EditorPanel 增加“查看报告”入口，不改编辑器主工作流布局。
3. 报告 UI 使用既有 TopSheet/模态体系，不新建孤立组件风格。

验收：

- 四个入口行为一致，报告可打开可关闭。
- `legacy-auto` 回归旧行为，不引入新差异。
- 报告打开时编辑器可正常输入，不阻断主流程。

### P1 protected spans 与密度阈值

#### P1.1 protected spans 预扫与回对

**文件**：`src/services/de-ai.js`

1. 新增 `extractProtectedSpans(text, config)`：
   - 从正文提取对白、人名、地名、时间、等级体系、金手指、伏笔。
   - 数据源优先级：项目 store 已有结构化数据 > 正文正则 > 用户白名单。
   - 输出 `spanId / start / end / value / source / type`。
2. 新增 `verifyProtectedSpans(originalText, processedText, spans)`：
   - 字面量回对，位置允许偏移，只要字面量仍存在。
   - 缺失项产生 blocking finding。
3. 级别定义：
   - `must`：人名、设定、关键剧情、伏笔，缺失直接回滚整次改写。
   - `should`：对白完整性、时间、地点，缺失报警但不强制回滚。
   - `may`：风格化表达，不参与门禁，只出 advisory。
4. 与现有 `protectDialogue()`、`restoreDialogue()` 的关系：对白保护继续沿用，protected spans 不重复实现对白保护，只扩展到对白之外。

#### P1.2 密度阈值脚本化

**文件**：`src/services/de-ai.js`

1. `DEAI_DETECT_THRESHOLDS` 定义：

```ts
{
  maxPerKilo: {
    stockReaction: 1.5,
    connector: 3.5,
    cliche: 1.0,
    bannedVocab: 0.8
  },
  minSentenceLengthCV: 0.25,
  retentionRatio: { target: 0.9, floor: 0.85, ceiling: 1.1 }
}
```

2. 每个指标输出原始值、阈值、命中与否、建议动作。
3. 阈值集中配置，后续可按 `textType` 调整，不写死。

#### P1.3 模型最小编辑改写

**文件**：`src/services/de-ai.js`、`src/composables/useDeAi.ts`

1. 新增 `DEAI_MINIMAL_EDIT_PROMPT`：
   - 只做最小编辑。
   - 禁止整段重生成、回译、扩写、新增事实。
   - 遵循“事实正确 > 信息完整 > 去AI痕迹 > 人味”。
2. 深度修复调用模型：
   - 输入：原文 + 检测报告 + protected spans。
   - 输出：最小编辑后正文。
   - 输出后强制走 `verifyProtectedSpans()` + `passesBodyIntegrityCheck()`；任一失败回滚原文。
3. 深度修复失败不阻断正文保存，只提示失败原因，正文回退为原始生成结果。

### P2 评测基线与经验固化

#### P2.1 回归测试集

**文件**：`scripts/tests/deai-v2.test.mjs`（新文件）

1. 夹具：空文本、短文本（<10 字）、正常短篇、带对白/人名/设定/伏笔的正文、密度超阈值文本、破碎标点文本、模型最小编辑失败回滚文本。
2. 断言：
   - 检测不修改原文。
   - protected spans 缺失触发 blocking。
   - `legacy-auto` 与旧 `processBody()` 行为等价。
   - `deep-fix` 门禁失败回滚原文。
   - 密度阈值输出正确 perKilo。
3. 运行方式：`node scripts/tests/deai-v2.test.mjs`。

#### P2.2 源 Electron + CDP 验证

1. 启动方式：仓库内 Electron 二进制 + CDP，禁止网页测试和开发者模式。
2. 验证矩阵：
   - 设置页切换三个模式并持久化。
   - 流水线正文层 detect-report：正文不被静默改写。
   - 流水线正文层 legacy-auto：行为与旧版一致。
   - 流水线正文层 deep-fix：失败回滚，成功则门禁通过。
   - 编辑器四入口行为一致。
   - 运行记录面板可查看检测报告事件。
   - 报告面板打开/关闭无遮罩残留。
3. CDP 探针遵守经验 §2/§3：三段式探针、finally 清理、恢复原状态、真实 store 断言。

#### P2.3 文档与经验更新

1. 更新 `_audit/神意开发经验总结_v3.md`：新增 V2 架构模式、“检测报告优先”纪律、protected spans 的 must/should/may 分级、最小编辑回滚策略。
2. 更新 `_audit/DEV_LOG_MASTER_INDEX.md` 并新增 `DEV_LOG_2026-09-09-deai-architecture-v2.md`。
3. 更新 `_audit/SKILL_HANDOFF_DEAI_HARD_RULES.md`：检测报告字段、最小编辑约束、protected spans 输出结构。

## 5. 不改内容清单（防改动污染）

1. 不改 `DEAI_METHODOLOGY_PROMPT` 已有 17 条语义。
2. 不改 `passesBodyIntegrityCheck()` 的回滚规则。
3. 不改 folder skill、agent、provider、chain/compose 执行链。
4. 不改正文层以外的流水线层。
5. 不改运行记录核心数据结构，只新增事件类型。
6. 不改设置页其他分区，只改降AI分区。
7. 不删除 `processBody()`，保留为 legacy 模式。
8. 不引入新依赖。
9. 不动用户现有未提交改动。

## 6. 验证门与完成定义

完成定义：以下全部通过才算完成，任何一项失败不得交付：

1. `npm run type-check`（如项目无此命令则 `npx vue-tsc --noEmit`）。
2. `npm run build:vue`。
3. `node scripts/tests/deai-v2.test.mjs` 输出 PASS。
4. 源 Electron + CDP 验证矩阵全部通过，JSON 原始输出留存。
5. `git diff` 逐行自审，每行可归因于本计划。
6. 经验文件、开发日志、SKILL 交接文档更新完成。
7. 用户实测反馈纳入后，再决定是否版本升级与封装。

## 7. 风险与回退

| 风险 | 缓解 |
|---|---|
| 检测报告改变用户习惯 | 默认 detect-report，保留 legacy-auto 一键回退 |
| deep-fix 额外 API 成本 | 独立模式，用户未主动选择不触发 |
| protected spans 误报 | must/should/may 分级，should 以下只报警不回滚 |
| 密度阈值不适配所有题材 | 阈值集中配置，后续可按 textType 调整 |
| 改造范围蔓延 | 不改内容清单 + 每阶段 diff 自审 |

## 8. 执行顺序

1. P0.1 检测器与单元测试。
2. P0.2 配置与设置页 UI。
3. P0.3 流水线正文层接入。
4. P0.4 编辑器四入口接入。
5. P1.1 protected spans。
6. P1.2 密度阈值。
7. P1.3 最小编辑。
8. P2 评测基线。
9. CDP 真实 UI 验证。
10. 文档与经验固化。
11. 用户实测、版本升级、封装。
