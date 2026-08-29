# P7-9R 受控 AI 记忆抽取与审核核验

日期：2026-08-23
状态：部分完成；受控响应已命中请求，但审核条目未形成，未标记通过

## 结果勾选

- [x] 读取 P7-9 日志和经验文件。
- [x] 使用 `start-electron.bat` 启动源文件 Electron。
- [x] 通过真实正文编辑器保存隔离项目正文。
- [x] 真实点击“提取记忆”。
- [x] 受控页面会话中的 `fetch` 命中真实 AIService 请求；请求 URL 为 `https://openapi.cloud-ai.cn/v1/chat/completions`，请求体包含记忆抽取 system prompt、chapterId、正文和 `jsonMode` 请求参数。
- [x] 受控验证未直接写 Pinia 或项目存储，仍走应用自己的抽取入口。
- [ ] 受控 JSON 返回后形成审核变更条目：未通过。第一次载荷使用错误 chapterId，被应用的 evidence 规则正确过滤；第二次按请求中的 chapterId 动态生成载荷，页面仍显示“本章没有检测到新的记忆变更”，验证载荷与运行时解析契约仍未形成可审计闭环。
- [ ] 拒绝/恢复/锁定/解锁：未核销，因为没有变更条目。
- [ ] 确认写入、项目持久化和四视图更新：未核销。

## 关键证据

```text
CALLS url=https://openapi.cloud-ai.cn/v1/chat/completions
CALLS body contains: 记忆抽取器 / chapterId / 正文 / stream:false / max_tokens:8192
PREVIEW 记忆变更预览 ... 本章没有检测到新的记忆变更。
```

## 边界结论

本轮证明了真实应用层请求被统一 AIService 发出，不能证明 AI 返回被 `providerAdapter → aiService → memoryExtractor → mergeMemory` 正确解析。第一次失败是验证载荷 chapterId 错误；第二次仍未形成条目，不能继续猜测或把受控脚本结果写成业务通过。业务源码未修改。

## 收尾

- [x] 删除 `_audit/tmp/p7-9r-ui.cjs`。
- [x] 杀 Electron 进程。
- [x] 未保留截图、bundle 或中间文件。

## 下一阶段计划（仅供审核，不执行）

P7-9R2：先读取 `providerAdapter` 和 `aiService` 的精确响应契约，建立只验证服务层响应解析的最小证据；再用该契约回到真实 UI 重新核验审核、确认写入、项目存储和四视图。通过后才进入 P7-10 原生 JSON 文件闭环。
