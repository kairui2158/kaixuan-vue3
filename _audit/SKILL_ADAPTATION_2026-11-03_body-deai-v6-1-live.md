# SKILL 适配说明：正文层内嵌降AI V6.1 真实供应商 Live 观测

日期：2026-11-03
适用对象：凯旋-正文层 folder SKILL 作者
关联方案：`_audit/PROPOSAL_2026-11-02_BODY_DEAI_COLLABORATION_V6_1.md`
关联证据：`_audit/verification-deai-stage-guidance-live/`

## 1. 本轮观测结论

本轮为真实供应商 observational live，不证明写作质量提升，也不作为发布门禁。观测目标是核实 V6.1 的接线、观测与 UI 是否一致。

- 供应商：`prov-1788185503573 / 新供应商 / deepseek-v4-pro`
- 有效证据目录：五个，见第 6 节。
- 真实结果：包含第 1 章失败、两章成功后第 3 章 running、三次“第 1 章成功后第 2 章失败”。没有可用的 3/3 success 证据。

V6.1 的接线在成功章节均已观测到：

1. S1/S2/S3 的 `deaiPromptVariant` 分别为 `methodology / creative / polish`。
2. S2 输出后、S3 调用前，有 `deai-stage-guidance` 位置化诊断注入。
3. 终稿后，有 `deai-calibration` findings 落账。
4. 模型画像保持冻结：`released=false`、`releaseGate=calibration-not-ready`、`guidanceChars=0`。

## 2. 需要迭代的问题

### 2.1 S2 施工净字数不足

`run-20261103-020722` 第 2 章失败主因是 S2 三次候选净字数约 1434/1447/1447，均低于 1600 下限。三次 retry 均携带 S1 场景骨架、FACT_LOCK、目标/当前/还差净字数，且未携带候选全文。请 SKILL 作者基于该深 trace 复核 S2 施工线与净字数口径。

### 2.2 S3 postProcess 质量门降级

成功进入 S3 的章节中，S3 apiCall 存在 `degraded` 与 `folder-skill-degraded-with-error` 事件，原因是 SKILL 自身 postProcess 质量闭环未达标后保留可用输出。请读取每次尝试的错误文案，复核句号密度、均句长、段落中位、身体词密度、句首重复率等阈值与修复反馈强度。

## 3. 应用侧可用观测

1. `deai-stage-guidance`：S2 后、S3 前的位置化诊断，包含规则名、位置、命中事实，不包含改写文本，不改变终态或重试。
2. `deai-calibration`：终稿后 findings 落账。
3. `deai-model-profile`：provider/model 画像观测。当前校准 NOT READY，画像 prompt 注入冻结；trace 记录 `released=false`、`releaseGate=calibration-not-ready`、`injectedRuleCount=0`。
4. `deai-injection-policy`：每步降AI契约、variant 与接管状态。
5. SKILL 迭代报告：终稿后可导出，包含命中规则、位置分布、S3 前后 findings 差分、误伤候选。

## 4. 读取指引

1. 先读每个 run 目录的 `summary.json`，确认 `businessStatus`、`verificationStatus`、每章 `runStatus` 与 `failure`。
2. 失败章读取 `chapter-N-failure.json`、`chapter-N-last-snapshot.json` 与对应深 trace。
3. 判断 S3 降级：读取 `apiCalls[].status` 与 `folder-skill-degraded-with-error.detail`。
4. 对账降AI链路：按时间顺序读取 `deai-model-profile`、`deai-injection-policy`、S2 后的 `deai-stage-guidance`、终稿后的 `deai-calibration`。
5. 第 2 章未进入 S3 时没有 `deai-stage-guidance` 是正确行为，不能伪造注入。

## 5. 边界与责任

1. 应用侧不修改 `D:/codex/玄武规划SKILL/凯旋-正文层`，也不替 SKILL 调整阈值、模板或 postProcess 逻辑。
2. S2/S3 的写作质量与阈值迭代由 folder SKILL 作者负责；应用只提供可审计情报。
3. 本轮观测不证明写作质量提升；质量迭代以 SKILL 侧改动和后续实测为准。

## 6. 证据索引

- `_audit/verification-deai-stage-guidance-live/run-20261102-224433/summary.json`
- `_audit/verification-deai-stage-guidance-live/run-20261102-232746/summary.json`
- `_audit/verification-deai-stage-guidance-live/run-20261103-000521/summary.json`
- `_audit/verification-deai-stage-guidance-live/run-20261103-004846/summary.json`
- `_audit/verification-deai-stage-guidance-live/run-20261103-020722/summary.json`
