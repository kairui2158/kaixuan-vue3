# 2026-11-02 Pipeline Context Cache V2.1 Phase 0-2

## 目标

在默认请求行为完全不变的前提下，为流水线串行链建立上下文组成与供应商缓存观测账本，作为后续前缀稳定化和真实缓存收益决策的证据底座。

## 交付

- 新增 `requestContextComposition`：计算 cache family、前缀指纹、稳定/可变字符占比，不保存 prompt 全文。
- `traceFieldNormalizer` 新增 provider cache usage 归一，OpenAI-compatible 嵌套 `prompt_tokens_details.cached_tokens` 与 Anthropic cache read/write 均归一；缺 usage 时显式 `usage_unavailable`，绝不发明命中。
- `aiService` 在物理请求终态事件上输出 `cacheUsageSummary` 与 `contextComposition`，请求内容不因此变化。
- `runTrace` 创建/更新两条路径持久化物理请求缓存观测；旧 trace 缺字段可兼容读取。
- JSON 导出透传新字段；文本导出新增“缓存状态/缓存命中/上下文组成”行。
- folder 主链从 `PipelinePanel -> routeSkill -> realSkillExecutor -> callAi` 传递 `contextLayer`，物理请求自动获得观测组成。
- 修复两个观测边界：`stableRatio` 与 provider 报告的 cache ratio 都钳制到 `[0,1]`，避免异常口径把观测数据变成误导性指标。
- 修复层名口径：`realSkillTypes` 使用 `volumes/chapters`，composition 侧同时接受单复数，避免 layer 被 `unknown` 化。

## 验证

- RED→GREEN：provider cache ratio 异常输入先复现 `1.2`，修复后钳制为 `1`。
- 定向套件：6 files / 382 tests passed。
- 类型检查：`npm run type-check` exit 0。
- 新增负向/边界断言：不保存 prompt 全文、不合并未知 provider 身份、cache 缺报不发明、ratio 不越界、pipeline executor 的 layer 单复数不漂移。

## 边界与未测项

- `real-verified`: 无。本轮没有真实供应商请求。
- `mock-verified`: 请求组成构造、cache usage 归一、trace 持久化、导出显示、folder 主链 `contextLayer` 传递。
- `untested`: 真实供应商 cache 命中矩阵、20 章 shadow A/B、安装包级真实运行。
- `callApiWithAgentVariantOwned`、风格分析与硬信号修复调用暂无 `contextComposition`；它们的 cache usage 仍由 `aiService` 观测，但请求组成未观测。作为非阻塞观测缺口登记，后续 Phase 1 再统一接线。
