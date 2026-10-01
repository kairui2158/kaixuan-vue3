# Phase 6 长文档真实 UI 验证方案

> 本文件是 `_audit/PROPOSAL_2026-09-27_LONG_DOCUMENT_RESTRUCTURE_ARCHITECTURE_V2.md` 的验收执行口径。Phase 6 未全部通过前，不得封装。

## 原则

1. 必须使用可见 Electron 窗口和真实供应商 API；mock、headless、旧 trace 回放都不能作为 Phase 6 最终验收。
2. 不设 token / 次数 / 时间预算。全局 watchdog 只用于防脚本挂死，不限制模型物理请求轮次。
3. API key 只能通过 `SHENYI_LIVE_API_KEY` 环境变量临时注入，不写入脚本、日志、证据文件或 git。
4. 每个规模必须提供启动前 hash、执行后 hash、内容变化、runTrace 导出、心跳/物理请求证据。
5. 每个操作失败都必须分类：产品缺陷、供应商失败、验证器缺陷或环境失败；不允许把失败静默改成 pass。

## 文档规模

| 档位 | 目标字符数 | 允许误差 | 用途 |
|---|---:|---:|---|
| S100 | 100,000 | ±2,000 | 全操作矩阵 |
| S200 | 200,000 | ±2,000 | 分段 checkpoint |
| S1M | 1,000,000 | ±5,000 | 结构索引 + 分段流 |

测试文档使用可审计的合成大纲：固定标题层级、每节 1,200-1,800 字正文、部分小节含重复文本块，便于验证重排不变量、标点整理不变量与授权删除。

## 操作矩阵

每个规模至少执行：

1. 全文重排 / 排序。
2. 全文标点与格式整理。
3. 重复项删除授权。
4. 拒绝授权并验证全文 hash 不变。
5. 局部修改。
6. 中断后恢复。

失败注入至少覆盖：

- 单段失败重试。
- 部分应用后恢复。
- 供应商断流或超时。
- 授权范围指纹不匹配。

## 观测与证据

- 每 15 秒采样一次可见心跳：运行状态、事件序列、物理请求计数、当前时间戳。
- trace 必须包含 `long-request-in-progress`、`awaiting-terminal-merge`，且无虚假 `state-stuck-detected`。
- 证据落盘：
  - `_audit/verification-long-document-restructure-phase6/S{100,200,1M}/result.json`
  - `before.md` / `after.md`
  - `trace/` 深度导出
  - 每阶段截图
  - `heartbeat.jsonl`
- 验证器必须显式记录 Electron pid、窗口存在状态、模型、baseUrl、每轮请求与工具调用。

## 通过标准

- S100 / S200 / S1M 三档任务均可启动、显示进度、分段执行并到达明确终态。
- 重排后叶子正文集合不变。
- 标点整理后标题、实体、句子集合不变。
- 授权删除只删确认范围；拒绝后全文 hash 不变。
- 中断后恢复不重复执行已完成段。
- 所有 trace 导出成功且包含 schema v10 事件。
- 全量服务测试、type-check、production wiring、build 在 Phase 6 前后保持通过。
