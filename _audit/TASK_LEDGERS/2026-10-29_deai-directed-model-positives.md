# TASK LEDGER：DEAI 多供应商正样本定向生成（2026-10-29）

## 1. 目标与边界

目标：修复定向生成脚本的 Electron `userData` 错配，通过真实第二供应商生成正文层 S2 模型正样本并接入校准语料库。

边界：不修改产品运行时代码；不提交 git；不重新封装；密钥只存在于 Electron 主进程内存与请求头，不写入任何日志、语料、文档或答复。

## 2. 修改清单

- `scripts/generate-deai-directed-positives.mjs`
  - 模块顶层设置 `app.setPath('userData', ...)`，默认指向 `D:/神意助手数据/_app-user-data`，可用 `DEAI_DIRECTED_APP_USER_DATA` 覆盖。
  - 请求 endpoint 从写死 DeepSeek 官网改为供应商配置的 `baseUrl`。
  - 增加定向样本硬约束：3 场景全覆盖、4200 非空白字符上限、必须输出【正文交接】与 `FACT_LOCK/NEW_FACT`。
  - 增加每变体 0-3 次“只反馈失败指标”重试，不回传候选全文。
  - 增加可选尾部预览 `DEAI_DIRECTED_PREVIEW_CHARS`（0-1000），用于诊断输出形态，默认关闭。
  - 采样温度从 1.15 调整为 0.85，用于契约型采样而非创作型采样。
- `scripts/diagnose-safestorage-electron.cjs`
  - 同步绑定应用真实 `userData`，支持 `DIAGNOSE_APP_USER_DATA` 覆盖。
- `D:/codex/deai-corpus/manifest.json`
  - 新增 `directed-body-s2-generation` 来源：`prov-1793181246179 / deepseek-v4-pro`，4 条。
  - `gaps.modelDiversity` 更新为两家 provider，仍明确样本深度不足、结论保持模型域限定。

## 3. 排除项

- 未改产品源码、运行时阈值、词库与评分权重。
- 未把 DeepSeek 官网账户 402 余额错误伪装成成功；该账户 5 次请求 0 条入库。
- 未把第一轮 0/5、第二轮 0/5 的失败输出入库。
- 未把 mock、本地变换或旧 trace 冒充第二供应商样本。

## 4. 验证记录

- `node --check scripts/generate-deai-directed-positives.mjs` → `SYNTAX_OK`
- `node --check scripts/diagnose-safestorage-electron.cjs` → `DIAGNOSTIC_SYNTAX_OK`
- 三个流水线供应商 decrypt-only 均输出 `{"phase":"decrypt-only","ok":true,...}`。
- 真实生成：`acceptedCount:4 / minSuccessCount:3`，elapsed `206797ms`；唯一失败变体为 `non-whitespace chars below corpus minimum: 1421`，重试后合格。
- 语料对账：`labelCount:16`，新增 provider 4 条，`missingSource:0`，分布 `prov-1788185503573:12, prov-1793181246179:4`。
- 校准复跑：`modelPositiveSamples:16`，`positives.model` 出现两个 provider/model 分组。
- `manifest.json` JSON 解析通过。

## 5. 问题与教训

- 根因一：脚本直接 `npx electron` 运行时默认 userData 是 `%APPDATA%/Electron`，与应用真实 DPAPI key 不匹配，导致 safeStorage 解密失败。必须在模块顶层、`whenReady()` 前绑定应用 userData。
- 根因二：endpoint 写死供应商域名，换第二供应商会打到错误地址。请求构造必须跟随供应商配置。
- 根因三：创作型温度和松散长度约束导致该模型长输出失控。第一轮 5 次全部超长或缺交接；加硬长度契约、失败指标重试与 0.85 温度后，4/5 合格。
- 教训：不能把“请求成功”当“样本合格”；必须先验证真实响应形态，再决定是否迭代脚本，且迭代过程中不得放宽入库标准。

## 6. 遗留

- 已补齐第二个真实模型：`prov-1793181246179 / glm-5`，4 次请求 4 条合格入库，未触发重试。
- `calibrate-deai-v2-thresholds.mjs` 的 `provenance` 已改为按 `modelPositiveByModel` 动态生成分组与说明，不再写死 single provider 文案。
- 剩余限制：DeepSeek 官网账户余额不足；样本深度仍不足（模型正样本 20 条，3 个 provider/model 分组）；校准结论仍为 provisional。

## 8. 第二轮补齐记录（2026-10-29）

- 真实生成：`DEAI_DIRECTED_PROVIDER_ID=prov-1793181246179 DEAI_DIRECTED_MODEL=glm-5 DEAI_DIRECTED_REQUEST_COUNT=4 DEAI_DIRECTED_MIN_SUCCESS=3 DEAI_DIRECTED_RETRIES_PER_VARIANT=2 DEAI_DIRECTED_PREVIEW_CHARS=300 npx electron scripts/generate-deai-directed-positives.mjs`
- 结果：`acceptedCount:4 / minSuccessCount:3`，4 次 `status:200`，`validationErrors:[]`，elapsed `261369ms`。
- `labels/model-positive.jsonl`：16 → 20 条；新增 `D:/codex/deai-corpus/sources/model/prov-1793181246179/glm-5/samples.jsonl`。
- `manifest.json`：`directed-body-s2-generation` 扩充为两个模型、8 条样本；`gaps.modelDiversity` / `modelPositiveEvidence` / `calibrationDecision` 更新为真实状态，仍不声明校准完成。
- 校准复跑：`modelPositiveSamples:20`，`positives.model` 三个 provider/model 分组；`provenance.note` 动态生成。

## 7. 证据

- 生成器证据：`scripts/generate-deai-directed-positives.mjs:11`、`:34`、`:259`、`:346`。
- 诊断脚本证据：`scripts/diagnose-safestorage-electron.cjs:6`、`:13`。
- 语料证据：`D:/codex/deai-corpus/labels/model-positive.jsonl`（16 行）；`D:/codex/deai-corpus/sources/model/prov-1793181246179/deepseek-v4-pro/samples.jsonl`（4 行）。
- 校准证据：`_audit/verification-deai-calibration/deai-v2-calibration-2026-10-29.json`（`modelPositiveSamples:16`，两个 model positive 分组）。
