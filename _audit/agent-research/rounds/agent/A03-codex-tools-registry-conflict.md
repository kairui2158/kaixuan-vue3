# A03 Codex 工具注册冲突拒绝

- 仓库：openai/codex
- 源码：codex-rs/core/src/tools/registry.rs
- 原始地址：https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/registry.rs
- 关键证据：重名工具注册直接 `error_or_panic`（338-355）；外部工具重名跳过并记录 collision（397-410）；保留名 `exec_command/shell_command` 禁止外部占用（387-395）。
- 机制：工具面冲突必须启动期失败，不能运行时随机覆盖。
- 应用对账：`dialogueToolSurface.ts` 已单源，但没有跨 built-in、folder SKILL、Agent 子工具的重名冲突检查。
- 采纳：采纳。构建工具面时做重名检查，冲突直接拒绝并写入诊断事件。

