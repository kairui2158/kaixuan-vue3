# 20260803 全面解除 Token/重试/超时限制

## 问题根因
链式SKILL执行到第3步断裂，根因是 max_tokens=0 导致API用默认4096

## 修复内容
1. max_tokens 保底 128000（链式+非链式+HTML input+loadSettings）
2. 重试次数 3 -> 999（无限），retryDelays 扩展到20个
3. 超时 300000 -> 999999999（无限）
4. 链式容错：某步失败不中断整个链，保留上一步输出继续
5. _aiRequest 所有错误都重试（不再只限429/502/503）
6. Agent 默认 maxTokens 0 -> 128000

## 验证结果（Playwright CDP）
- settingsMaxTokens: 128000
- getAgentMaxTokens: 128000
- _aiRequest: has999Retries, hasNoTimeout, no4096 全部 true

## 版本: 2.7.32
