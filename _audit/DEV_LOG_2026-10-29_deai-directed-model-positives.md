# DEV LOG：DEAI 定向多供应商正样本生成（2026-10-29）

## 背景

历史 trace 收割只有 12 条合格正文响应，全部来自 `prov-1788185503573/deepseek-v4-pro`。为推进正样本多样性，本轮启用真实 API 定向生成第二供应商模型正样本。

## 过程

1. 首轮直接运行失败，`safeStorage.decryptString` 无法解开应用密文。逐层排查确认：密文是应用 DPAPI 形态；本机 safeStorage round-trip 正常；脚本默认 Electron userData 不是应用真实 userData。修复为在模块顶层绑定 `D:/神意助手数据/_app-user-data`。
2. decrypt-only 复验通过后，DeepSeek 官网账户 5 次请求全部返回 `402 insufficient_balance`，0 条入库。未伪造成功。
3. 改用生成流水线卷纲层专用供应商。发现脚本 endpoint 写死 DeepSeek 官网，修复为读取供应商 `baseUrl`。
4. 第一次真实生成 5 次全部不合格：3 次 8192 token 截断，2 次缺 S2 交接；最短 6924、最长 34592 非空白字符。判定为请求约束不足，不是供应商不可用。
5. 加入定向样本硬约束、失败指标重试（不回传候选全文）、0.85 采样温度与可选尾部预览。第二次生成 5 次请求，4 条合格入库；唯一失败为 1421 非空白字符，低于 1500 下限，重试后成功。

## 交付

- 第二供应商真实模型正样本：`prov-1793181246179 / deepseek-v4-pro`，4 条。
- 第二个真实模型正样本：`prov-1793181246179 / glm-5`，4 条；4 次请求全部 200 且验收合格，未触发重试。
- `labels/model-positive.jsonl`：12 → 20 条。
- source：`D:/codex/deai-corpus/sources/model/prov-1793181246179/deepseek-v4-pro/samples.jsonl` 与 `D:/codex/deai-corpus/sources/model/prov-1793181246179/glm-5/samples.jsonl`。
- `manifest.json` 登记 `directed-body-s2-generation`，并把 model diversity gap 更新为“两家 provider、两个模型、样本深度仍不足”。
- `scripts/calibrate-deai-v2-thresholds.mjs` 的 `provenance` 改为按实际 provider/model 分组动态生成，附 `modelGroups` 结构化字段。
- 校准报告复跑后 `positives.model` 出现三个 provider/model 分组。

## 验证

- `node --check` 两个脚本均通过。
- 真实生成 `acceptedCount:4 / minSuccessCount:3`。
- `glm-5` 真实生成 `acceptedCount:4 / minSuccessCount:3`，elapsed 261369ms。
- 语料对账：20 labels、missingSource 0，分布 `prov-1788185503573/deepseek-v4-pro:12 + prov-1793181246179/deepseek-v4-pro:4 + prov-1793181246179/glm-5:4`。
- 校准复跑：`modelPositiveSamples:20`，三个 model positive 分组；`provenance.modelGroups` 动态生成。
- `manifest.json` JSON 解析通过。

## 边界

- 未修改产品运行时代码，未提交 git，未重新封装。
- 密钥未出现在任何输出、文件或日志中。
- 语料库位于 `D:/codex/deai-corpus/`，不属于 git 工作区。
- 校准结论仍为 provisional：新增样本提升 provider/model 多样性，但两个模型的 8 条定向样本仍不足以支撑阈值、词库或评分权重发布。
