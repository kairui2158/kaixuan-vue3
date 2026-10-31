# 正文层 folder SKILL 适配说明：叙事裁决单通道（2026-10-31）

## 1. 边界裁决

用户已确认“同一维度只能有一个裁判”：

- **SKILL 层管叙事有效性**：场景是否推进、动作链是否改变状态、事件增量是否达标、FACT_LOCK 语义是否连贯、打磨是否污染原意。
- **应用层管平台合同**：净字数口径、终态裁决、retry 预算、候选稿保留、失败路由、协议字段存在性。

应用侧已撤回此前“状态改变动作场景数 / 七类收益 / 豁免章”的计算逻辑。现在应用不推断叙事质量，只消费 SKILL 的显式机器可读声明。

## 2. 新增 verdict 契约

在 `【正文交接】` 元数据区输出以下字段：

```text
事件增量：<本章实际事件推进说明>
narrativeStatus: ready | not_ready
narrativeReason：<达标说明或缺口说明>
stateChangingScenes：<场景标识或数量>
```

格式要求：

- 字段名固定为英文小写，冒号支持中英文。
- `narrativeStatus` 只接受 `ready` 或 `not_ready`。
- `narrativeReason` 一行写完，不要换行。
- `stateChangingScenes` 是自报值，应用不设阈值、不复查。
- 正文本体中出现这些词不会被识别；必须写在交接元数据区。

## 3. 应用消费方式

### `narrativeStatus: ready`

- 验收层在链式与 compose 路径写 `chapter-narrative-verdict` info trace，原样透传 `status/reason/stateChangingScenes`。
- 应用不做二次判断。

### `narrativeStatus: not_ready`

- 执行器在第一次物理返回后立即返回 `blocked`，不进入第 2/3 次正文层重试。
- trace 写 `chapter-narrative-not-ready` error，步骤日志提示回到章节规划/剧情层补足事件点。
- 链式 handoff 升级全文重试同样排除该 blocked，避免把上游材料缺口误升级为全文重写。

### 未声明

- 应用不推断叙事质量。
- 如果 `事件增量` 字段缺失，应用仍写 `chapter-event-increment-advisory` warning，这是协议字段存在性检查，不是叙事质量判定。

## 4. 旧语义退役

以下应用侧判定已全部删除，SKILL 层不要再依赖：

- 七类收益分类：新信息、处境改变、关系位移、威胁升级、资产得失、地位变化、情绪兑现。
- “非豁免推进章至少两类不可归一收益”。
- 静章 / 抒情章 / 关系观察章豁免标记。

这些语义现在完全归 SKILL 层。是否属于静章、是否豁免、是否达标，由 SKILL 在 `narrativeStatus` 与 `narrativeReason` 中说明。

## 5. 对正文层 SKILL 的具体要求

1. S1 骨架层：若章纲事件材料不足以支撑状态改变动作，输出 `narrativeStatus: not_ready`，并在 `narrativeReason` 写清缺口；应用会阻断并回上游。
2. S2 生成层：完成事件密度判定后，在交接中自报 `narrativeStatus`、`narrativeReason`、`stateChangingScenes`。
3. S3 打磨层：只负责表达，不新增叙事裁决；若发现结构缺陷，应输出 `not_ready` 而不是尝试扩写补事实。
4. 不要为了通过应用而罗列标签化 `事件增量`；应用不再数类别，字段要描述实际事件推进。

## 6. 需要双方共同验证的点

- SKILL 层真实输出 `narrativeStatus` 后，需要一次真实 run-trace 回放，确认字段到达执行器阻断点与验收透传点。
- `not_ready` 与合同失败同时出现时，当前优先级是 SKILL NOT-READY 阻断回上游；合同修复编排不先启动。

## 7. 参考实现位置

- verdict 解析：`src/services/chapterEventDensity.ts`
- 执行器阻断：`src/services/realSkillExecutor.ts`
- 验收透传：`src/services/stepArtifactAcceptance.ts`
- trace/UI 消费：`src/components/pipeline/PipelinePanel.vue`

## 8. 卷契约终局底牌裁决

卷纲层如需向应用声明“终局底牌/契约伏笔是否提前释放”，使用与 `narrativeStatus` 同款的显式机器可读 verdict：

```text
contractStatus: safe | broken
contractReason：<达标说明或缺口说明>
```

- 字段写在卷纲交接元数据区；正文本体中的词不会被识别。
- `safe`：应用写 info trace，原样透传 reason，不复查、不阻断。
- `broken`：应用写 warn trace 并透传 reason，仍不阻断；是否修稿由编排与用户裁决。
- 未声明：应用记录 `undeclared`，不推断、不使用揭示词表、不生成三态结论。
- 应用侧本地 `REVEAL_RE` 词表、`contract_safe / needs_reinforcement / broken` 三态推断已全部退役。
