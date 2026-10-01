# R07 Cherry 未知模型不造数

- 仓库：CherryHQ/cherry-studio
- 源码：src/main/ai/contextBuild/resolveContextWindow.ts
- 原始地址：https://github.com/CherryHQ/cherry-studio/blob/main/src/main/ai/contextBuild/resolveContextWindow.ts
- 关键证据：未知窗口返回 `null`，不合成默认数（16-29）；未知模型不生成假 `max_tokens`，配套边界测试在 `cherry-max-output-boundary.test.ts`。
- 机制结论：能力未知是合法状态，必须显式表达 unknown，并按协议决定是否省略参数。
- 应用对账：`providerAdapter.ts:86-100`、`contextBudget.ts:30-39` 在未知时造出 8192/32768。
- 采纳结论：采纳。能力表 miss 时进入 `unknown` 状态：压缩只提示不自动执行，请求参数按供应商协议省略或走探测。

