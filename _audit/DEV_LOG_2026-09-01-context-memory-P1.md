# 神意助手开发日志：上下文记忆 P0-P6（2026-09-01）

## 本轮目标

按 `_audit/PROPOSAL_2026-09-01_CONTEXT_MEMORY_PLAN.md` 完成上下文记忆闭环：统一上下文协议与服务、接入主页与大纲工作台、归一化流水线记忆形状、提供 SKILL 上下文策略 UI，并用源应用 Electron 完成真实操作验证。

## 已完成

- P0：冻结 `ContextBundle`、`ContextPolicy`、`ContextRef`、`ContextMessage` 等协议类型。
- P1：新增按 `projectId + workspace + purpose + skillId` 隔离的 `ConversationContextService`，新数据写入 `wa_ctx_<projectId>`，旧 `wa_chat_<projectId>` 只读兼容。
- P2：主页普通对话、大纲工作台普通对话和 SKILL 调用统一读取历史、组装消息、成功写回；chain 第一步带原始请求与历史，后续步骤只带原始请求与完整上一步输出。
- P3：流水线记忆上下文经统一消息形状组装，保持原有一次请求语义。
- P4：SKILL 设置页新增上下文策略：历史模式、包含大纲、包含记忆，并随 SKILL 配置保存。
- P5：上下文持久化与重启恢复核销；导入项目不预建上下文状态。
- P6：源应用 Electron 真实闭环核销，12/12 项断言通过，`runtimeErrors: []`。

## 本轮验证

| 门 | 命令 | 结果 |
|---|---|---|
| 服务与引擎测试 | `npx vitest run src/services/conversationContextService.spec.ts src/services/skillEngineFailure.spec.ts --reporter=verbose` | `Test Files 2 passed (2)`，`Tests 14 passed (14)` |
| 类型检查 | `npm run type-check` | 退出码 0，无类型错误输出 |
| 完整构建 | `npm run build` | `✓ 288 modules transformed.`，NSIS 生成 `dist/神意助手-Setup-3.11.0.exe` |
| 安装包哈希 | `Get-FileHash -Algorithm SHA256` | `CF8F488E57F642C160BF51C52E5E64D1DF8E18D5EA79D0B40A4F82F9EECAE7ED` |
| 源应用 P6 | `node_modules\electron\dist\electron.exe . --remote-debugging-port=9227` + CDP 探针 | 12/12 断言通过，`runtimeErrors: []` |

## P6 真实闭环证据

- 主页第二轮请求携带第一轮 `CTX_PROBE_FIRST：记住暗号蓝鲸` 与 `CTX_PROBE_OK_1`。
- 大纲工作台第二轮请求携带第一轮 `CTX_OUTLINE_FIRST：记住暗号紫鲸` 与 `CTX_OUTLINE_OK_1`。
- 主页与大纲工作台上下文按 workspace 隔离。
- chain 第一步带原始请求和最近历史；第二步带 `[上一步 SKILL 完整输出]`，且不注入全量聊天历史。
- 主页与大纲上下文均可持久化；失败请求未写入伪造 assistant 轮次。
- 原始台账：`_audit/tmp/context_memory_p6_result.json`；临时探针文件将在收尾时删除，最终报告保留关键字段摘要。

## 未核销与客户实操边界

- 安装包生成后未在本轮内执行安装版客户路径验证；按用户要求，本轮验证只允许源应用启动，不允许使用安装版。
- 安装包为未签名状态，交付时必须如实标注。
- 客户实操入口：主页连续两轮对话、大纲工作台连续两轮 SKILL 对话、重启应用后继续提问、设置页修改 SKILL 上下文策略。

## 经验引用与新增结论

本轮执行前读取 `_audit/神意开发经验总结_v2.md`，遵守 M1-M3、一次一个闭环、服务层不可替代 UI 证据、存储 key 必须含项目 ID、失败不伪造成功轮次等规则。

新增结论：

1. 上下文服务的单测只能证明消息组装与隔离协议，不能证明调用点已接入；每个调用点必须在请求参数、成功写回和失败副作用三处分别核销。
2. 多轮探针必须用最后一条 user 消息判定 phase，mock 响应按 phase 映射；否则测试历史会污染断言造成假失败。
3. CDP 长事务要给 aiService 心跳重试留足时间，本轮采用 360s 超时。
