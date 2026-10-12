# 流水线耗时账本 Phase 2 方案

## 状态

已确认执行。本阶段只采集真实数据并输出耗时排序，不修改生成、上下文、重试、并发和模型路由行为。

## 目标

用真实 Electron + 真实 API 跑一次卷纲层流水线，导出带 `timingLedger` 的 deep run trace，并回答：

1. 模型耗时里，首 token 等待和流式输出各占多少。
2. 本地处理各段（请求构建、schema 校验、重试、后处理）各占多少。
3. `localOverheadSumMs` 这个候选线索在完整卷纲 run 里有多大，是否值得进入阶段 3 优化。

## 场景选择

选卷纲层，不选正文层：

- 卷纲层单次 run 为每卷执行 S1-S4 四个链式步骤；3 卷即至少 12 次 API call，样本量足够支撑 Top 3 排序。
- 输出以结构化卷纲为主，单次输出长度可控，真实 API 成功率高。
- 正文层单章输出长，失败和超时变量更多；它适合在阶段 3 改动后做前后对比。

## 脚本设计

新增 `scripts/verify-pipeline-timing-ledger-electron.mjs`，复用已验证的 live 脚本骨架：

- 可见 Electron 窗口、CDP、独立 profile、独立导出目录。
- 只读取应用内已存的默认供应商凭据，不新建 key。
- SKILL 必须通过 `#pl-s3-skill` 下拉真实选择，禁止注入冒充。
- 心跳每 10 秒写入 `heartbeat.jsonl`，停滞 3 分钟告警、10 分钟判死，全局 3 小时只是防挂死保护，不是预算。

相对旧脚本的必要修正：

1. 等待完成条件改为 `runStatus` 进入终态，且 `isGenerating === false` 且无 running API call。旧条件在启动间隙可能把“尚未失败”误判为完成。
2. 旧证据目录自动归档，不删除历史数据。
3. 导出后断言 `schemaVersion === 18`、run 级 `timingLedger` 存在、每个物理请求的 `firstTokenMs/outputMs` 存在。

## 数据口径

Top 3 按单一口径排序：`firstTokenSumMs`、`outputSumMs`、`localOverheadSumMs`、`requestBuildSumMs`、`schemaValidateSumMs`、`retrySumMs`、`postProcessSumMs` 七个 run 级求和字段直接排序。

解释规则：

- `firstTokenSumMs` / `outputSumMs` 是模型侧耗时结论。
- `localOverheadSumMs` 只是候选线索：同一起点的物理重试可能被重复计入，且包含用户可见等待与编排等待的混合，不得直接当“本地浪费”结论。
- `retrySumMs` 与 `retryPhysicalCallCount` 一起读，避免把合法一次重试误判成空转。
- 物理请求数、API call 数、失败 call 数一并输出，防止只看耗时而忽略请求形态。

## 验收

- 脚本以 `===== PIPELINE TIMING LEDGER ELECTRON LIVE PASSED =====` 结束。
- `_audit/verification-pipeline-timing-ledger-live/` 内有 deep trace、payload、heartbeat、run log、截图、`summary.json`、`timing-analysis.md`。
- `timing-analysis.md` 给出 Top 3、占比、请求形态和结论/线索边界。

## 非目标

- 不根据一次数据直接改上下文、并发或路由；阶段 3 方案必须引用本阶段原始 trace。
- 不做正文层长输出对比；那是优化后的回归场景。

## 成熟度自评

成熟。依据：脚本骨架已在 live 场景使用；UI 选择器与卷纲入口来自现有脚本和源码；等待条件缺陷已识别并修正；数据字段为 Phase 1 已实现且通过 1778 条测试。风险集中在真实供应商波动，脚本只报告证据，不把波动当结论。
