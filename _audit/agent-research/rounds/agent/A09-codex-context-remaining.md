# A09 Codex 剩余上下文工具

- 仓库：openai/codex
- 源码：codex-rs/core/src/tools/handlers/get_context_remaining.rs
- 原始地址：https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/handlers/get_context_remaining.rs
- 关键证据：输出 `tokens_left`，unknown 时显式渲染 unknown（18-35）；handler 对不支持的 payload 返回纠正性错误（74-79）。
- 机制：模型可以主动查询自身剩余上下文，而不是猜。
- 应用对账：模型经常说“没有写入权限/上下文不够”，但没有工具可以查询真实状态。
- 采纳：采纳。加入 `context.remaining` 只读工具，返回模型能力、已用、剩余、来源（真实 usage/估算）。

