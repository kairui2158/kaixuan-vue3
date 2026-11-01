# Folder SKILL 正文层内嵌降AI方法指导者手册

版本：3.110.15 手册 v2（应用契约 v2）  
适用层：生成流水线正文层（step 4）  
适用对象：folder SKILL 作者、SKILL 迭代测试者、应用层维护者  
上游文档：`_audit/FOLDER_SKILL_DEAI_CONTRACT_GUIDE_2026-10-29.md`

## 0. 一句话定位

正文层内嵌降AI已经不是“生成后改稿器”，而是**生成前方法指导者**：只在正文层各 SKILL 调用前注入方法指导，不改写正文、不改终态、不触发重试、不输出总分。SKILL 是活体，可随时迭代；本手册描述的是应用侧的固定机制与协作契约。

## 1. 结构与责任边界

| 层 | 位置 | 职责 |
|---|---|---|
| 指导包构造器 | `src/services/deaiGuidancePack.ts:186` | 纯函数构造指导包；不读 store、不落盘、不依赖配置 |
| 契约解析 | `src/services/skillDeaiContractValidation.ts:26` | 校验并归一化 `meta.deai`；v1 兼容读 + 迁移 warning |
| 注入决策 | `src/services/skillDeaiContract.ts:94` | 判定是否注入、注入角色、SKILL 是否接管 |
| 声纹快照 | `src/services/deaiVoiceProfileRunSnapshot.ts:30` | run 活跃期间冻结作者声纹，run 结束释放 |
| 执行器接线 | `src/components/pipeline/PipelinePanel.vue:2836` | 把指导包接入正文层步骤并发射 trace 事件 |

责任边界只有三条：

1. 应用负责平台契约：注入预算、终态、trace、失败路由。
2. SKILL 负责叙事有效性：场景推进、动作链、交接语义。
3. 风格卡片是唯一风格 owner；指导只补默认方法，不覆盖风格选择。

## 2. 注入三道门

应用侧依次判定，任一不满足则 prompt 为空：

1. `step === 4`：只有正文层消费生成期降AI注入；设定、卷纲、章节层不注入。
2. `generation !== 'off'`：folder SKILL 可整体关闭应用侧注入。
3. `guidanceOwnership !== 'skill'`：SKILL 声明接管时，应用注入退场，只留观测 trace。

入口：`src/services/skillDeaiContract.ts:94`。

## 3. 角色推导

按链位置推导，入口：`src/services/skillDeaiContract.ts:73`。

| 链位置 | 角色 | 意图 |
|---|---|---|
| 第 0 步（S1 骨架） | `methodology` | 管事件密度、因果骨架、场景作用，不碰文字 |
| 中间步（S2 正文） | `creative` | 管事件表达、叙事用笔、对白轻重 |
| 末步（S3 打磨） | `polish` | 管最小修复、语义保真、无损合并 |
| 无链式 | `methodology-compose` | 混合角色 |

单步链按 `methodology` 处理；角色不是 SKILL 逐条声明，而是按链位自动推导。

## 4. 方法库原文

方法库固定 11 条，定义在 `src/services/deaiGuidancePack.ts:63`。以下为注入原文，SKILL 迭代时可用它对照重复规则；应用升级方法库时必须同步更新本节。

### 4.1 方法论（methodology / methodology-compose）

1. `event-density` **事件密度**：每场至少一个可核验的状态改变；确认、求证、判断不算推进。写前先说出进入状态和退出状态。
2. `causal-chain` **因果骨架**：先定行动、阻碍、代价、结果，再决定描写。因果不清楚时不补设定，按 SKILL 契约上报缺口。
3. `scene-purpose` **场景作用**：场景按戏剧价值分配轻重，结尾允许留张力；不同场景的进入信息、退出信息和感官通道不重复。

### 4.2 创作执行（creative / methodology-compose）

1. `event-rendering` **事件表达**：情绪、判断和关系写成可见行为。优先用动作变化、选择性和信息顺序呈现，不用评论腔解释。
2. `narrative-perspective` **叙事用笔**：视角带判断：看什么不看什么、语气倾向和节奏轻重。同一段视角一致，紧张场景收短，舒缓场景铺长。
3. `dialogue-weight` **对白轻重**：对白留残缺和轻重，有些回合只有动作，有些只有台词。不替读者总结因果，不写解释性从句。

### 4.3 语言收敛（polish）

1. `minimal-repair` **最小修复**：只改表达硬处、重复处和报告腔；保留事实、场景顺序、对白含义和事实账本。不扩写、不压缩、不补设定。
2. `semantic-fidelity` **语义保真**：修改前后用事实链、人物状态、位置和因果对齐。发现叙事缺口不擅自改，按契约路由回上游。
3. `lossless-merge` **无损合并**：相邻短句合并且信息无损，或句号改逗号/分号，是合法打磨。不以降检测为目标增加新比喻或碎句。

### 4.4 全角色共有

1. `method-boundary` **方法边界**：短句只用于关键转折，连续碎片不是风格。判断标准是读起来更像活人叙事，不是命中更少检测词。
2. `style-precedence` **风格优先**：风格卡片与声纹优先于本指导；有冲突时按风格执行。方法只补默认路径，不覆盖作者选择。

## 5. 注入文本形态

标题格式：`【降AI方法指导 - 角色标题】`，角色标题依次为“骨架与因果 / 复合步骤方法 / 创作执行 / 语言收敛”。固定头部三行：

```text
执行角色：生成前方法指导；不修改请求产物，不做裁判，不输出总分。
风格卡片是唯一风格 owner；本指导只是默认方法，不覆盖风格选择。
叙事缺口按 SKILL 契约上报，不擅自补设因果。
```

随后按 `标题：内容` 逐条注入。指导包构造完成后追加作者声纹；两者共同进入 system prompt suffix。

## 6. 预算与不变量

| 项 | 值 |
|---|---|
| 单角色条数上限 | 6 条 |
| 指导包字符预算 | 1200 |
| 声纹字符预算 | 700 |
| 总注入预算 | 1900 |
| 构造耗时警告线 | 5ms |

超预算时按方法库顺序丢弃后续条目，`droppedItemIds` 记录丢弃项；超出硬顶才截断文本并标记 `truncated`。指导包与条目均 `Object.freeze`，run 内不可变。构造耗时达到 5ms 时 trace 升级为 warn。

## 7. `meta.deai` 契约

```json
{
  "deai": {
    "contractVersion": 2,
    "generation": "on",
    "finalStepDetection": "on",
    "conflictPolicy": "skill-wins",
    "guidanceOwnership": "app",
    "overlaps": []
  }
}
```

| 字段 | 合法值 | 默认值 | 语义 |
|---|---|---|---|
| `contractVersion` | `1` / `2` | `2` | v1 兼容读并迁移为 v2 语义，写迁移 warning |
| `generation` | `on` / `off` / `suffix-only` | `on` | `suffix-only` 与 `on` 等效，trace 保留声明原值 |
| `finalStepDetection` | `on` / `off` | `on` | 只控制终步 findings 注入，不影响用户手动后处理 |
| `conflictPolicy` | `skill-wins` / `app-wins` / `report` | `skill-wins` | 应用默认尊重 SKILL 成熟规则 |
| `guidanceOwnership` | `skill` / `app` / `split` | `app` | 未声明时按 `conflictPolicy` 推导：`skill-wins` → `skill`，其余 → `app` |
| `overlaps` | 非空字符串数组 | `[]` | 显式冲突域，与关键词命中取并集 |

注意：凯旋 S1/S2/S3 当前仍是 `contractVersion: 1` + `conflictPolicy: report`，会被应用迁移为 v2 语义并写 warning。建议下一轮 SKILL 迭代显式升级为 v2 声明，避免长期依赖兼容迁移。

## 8. 冲突路由

入口：`src/services/skillDeaiContract.ts:141`。检测方式是关键词字面匹配 + `overlaps` 声明并集，不是语义级判断。

| 声明 | 行为 |
|---|---|
| `skill-wins` | 发现重叠即清空应用投影，SKILL 模板说了算 |
| `app-wins` | 应用投影保留，SKILL 声明留痕 |
| `report` | 只报告重叠，不改变注入 |

推荐升级路径：先观察一轮 `deai-conflict-policy` trace；若重叠主题确实被 SKILL 模板覆盖，直接声明 `guidanceOwnership: "skill"` 让应用注入退场，或声明 `overlaps` 精确圈定冲突域。不要在未看 trace 前盲切。

## 9. 运行行为边界

1. 只进 prompt，不改稿：产物一个字不动。
2. 不做裁判：不改变终态、不触发重试、不降级。
3. 不带旧稿：教学反馈不携带候选全文，避免复述先验。
4. 不碰风格：风格卡片与作者声纹优先。
5. trace 只存摘要：条数、字符、hash、构造耗时、丢弃项，不存提示词全文。
6. 流水线不再执行 `legacy-auto`、`deep-fix` 或“最小编辑改稿”；设置页手动去AI味功能保持独立。
7. agent 调用唯一生产入口是 `callApiWithAgentVariantOwned`；旧包装名 `callApiWithAgentVariant` 已在 3.110.16 退役，SKILL 对账和 trace 溯源不得再按旧名判断 agent 路径。

## 10. trace 与 UI

| 事件 | 含义 |
|---|---|
| `deai-guidance-pack` | 指导包构造结果；超 5ms 升级 warn |
| `deai-injection-policy` | 注入策略：step、variant、source、policy、warnings |
| `deai-contract-warning` | 契约声明非法，已回退默认策略 |
| `deai-conflict-policy` | 模板重叠及处理动作 |

白名单位置：`src/stores/runTrace.ts:967`。UI 与 trace 的对账规则是：

1. **归属判断一律以 `deai-injection-policy` 事件为准**：`policy.guidanceOwnership` 与 `policy.generation` 决定该 SKILL 的显示状态是 `app`、`skill` 还是 `off`。SKILL 接管后应用 0 注入是设计内行为，不视为失效。
2. **应用注入量以 `deai-guidance-pack` 事件为准**：只有 `state=app` 的 SKILL 才读取 `itemCount` 与 `guidanceChars`。`guidance-pack` 缺失时显示 `unknown`，不得用 0 冒充已观测。
3. **每个 SKILL 独立投影**：S1/S2/S3 各自读取同 `skillIndex` 的最新 policy；retry 后只消费最新一条，旧事件保留在 trace 里但不参与 UI 判定。
4. **链级状态是聚合摘要**：三步状态相同才显示该状态；存在 `unknown` 或状态不同时显示 `mixed`。徽章文案分别为“方法指导 X/3步 · Y字符”“SKILL 方法指导接管 · 0注入”“应用方法指导关闭”“方法指导混合 · 展开查看”“未观测到方法指导契约”。
5. **run 绑定**：UI 只消费当前 displayed body run 关联的 `mode=body` trace；多 trace 冲突时链级为 `mixed`，技能级回落 `unknown` 并携带 `multi-trace-state-conflict` warning。
6. 预注入日志提示进入预注入阶段，并声明实际归属与注入量以 `deai-injection-policy` 与 `deai-guidance-pack` 双事件对账为准，见 `src/components/pipeline/PipelinePanel.vue:5839`。

## 11. SKILL 迭代自检门禁

1. 修改 `meta.deai` 或模板前，先读本手册第 4 节，确认没有与应用方法库重复的规则。
2. 契约变更后跑：

```powershell
npx vitest run src/services/skillDeaiContract.spec.ts src/services/deaiGuidanceDisplay.spec.ts
```

3. 注入链路变更后跑：

```powershell
npx vitest run src/components/pipeline/__tests__/deai-injection-policy.spec.ts src/services/deaiChainVariantIntegration.spec.ts src/services/deaiGuidanceDisplay.spec.ts
```

4. 用真实 folder SKILL 跑正文层 deep trace，核对：
   - `deai-injection-policy.variant` 与链位一致（S1=methodology，S2=creative，S3=polish）；
   - `policy.guidanceOwnership` 与 SKILL 声明一致；接管时无 `deai-guidance-pack` 是正确结果；
   - `deai-guidance-pack.itemCount` 不超过 6；
   - `deai-guidance-pack` 无 `droppedItemIds` 意外丢弃；
   - 冲突场景出现 `deai-conflict-policy` 且动作与声明一致。

## 12. 诚实边界

B6 效果验证仍是 `provisional`：配对影子数据为 0。因此当前只能确认机制与边界，不能宣称“教学注入降低AI味”或“不拖慢生成效率”。等同模型、同题材、同章节的对照数据进来后，才能解除 provisional。

## 13. 变更登记规则

以下任何变更必须同步更新本手册版本：

1. 方法库条目、角色映射或预算。
2. `meta.deai` 字段、合法值、默认值。
3. trace 事件名或语义。
4. folder/agent 双路径接线方式。
5. 冲突检测能力或策略。

跳过手册更新等同发布未完成。
