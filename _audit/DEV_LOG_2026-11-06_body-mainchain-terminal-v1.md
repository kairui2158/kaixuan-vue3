# DEV_LOG 2026-11-06 正文层主链终态收口

## 目标

按用户指令把正文层主链推进到本轮终态；降AI校准门禁延后，保持 `calibration-not-ready` 冻结；使用开发版已有真实供应商 API key 完成真实供应商闭环。

## 交付

- **占位符修复**：`injectResolvedVariables` 将 Markdown 围栏与行内反引号内的 `{{xxx}}` 视为文档字面量；代码 span 外业务占位符继续注入或触发 `template-placeholder-unresolved`。
- **live 供应商闭环**：真实 Electron 验证器按 provider id 精确选择供应商，`GET /v1/models` 使用固定 fixture，POST 生成请求单独校验模型；volumes/chapters/body 三层 run 均成功，模型与来源在 trace、apiCall、物理请求三面一致。
- **解密助手增强**：`decrypt-provider-key.cjs` 支持 `--id`，消除同名供应商歧义。
- **3.115.0 封装**：重新构建并核验安装包；清理 3.114.3 旧安装产物清理项与临时探针。
- **安全收口**：发现并脱敏未提交的 mock 供应商证据 `provider-requests.json` 中两条 `Bearer enc:` 记录；`git log --all -S` 确认当前 Git 历史无该值；临时脱敏脚本已登记并清理。

## 验证

- `npm run test:services`：248 files / 2672 tests passed。
- `npm run type-check`：exit 0。
- live 供应商验证：`[PASS] ... mode=live-single-supplier; requests=5`，报告见 `_audit/verification-pipeline-provider-channel-live/report.json`。
- 封装验证：`npm run verify:packaging` → `verdict: pass`；`_audit/verification-packaging-3.115.0/packaging-evidence.json` 记录 231,666,856 bytes 与 SHA-256。
- `Get-FileHash`：当前安装包 SHA-256 为 `433d1c29c42c69d4bec635bf9bfc0c9d0300d58a87d60c94162d6a0b6abdc36b`。
- 临时脚本清理复核：`_audit/probe-live.js`、`_audit/tmp-wa-providers-live.json` 均不存在。
- 脱敏复核：`Select-String` 在 `_audit/verification-pipeline-provider-channel/*.json` 对泄漏值返回 0 命中；`_audit/verification-pipeline-provider-channel/provider-requests.json` 的 `apiKey` 全部为 `[redacted]`。

## 边界

- live 章节目标为 800 字，仅用于缩短真实供应商验证时长，不声明正文质量达标；mock 的 3500 字断言未放宽。
- live 模式显式关闭辅助记忆抽取链，报告写 `auxiliaryMemory.enabled=false`。这是验证通道边界，不是记忆功能回退。
- 降AI校准继续冻结，本轮没有任何校准阈值、词库或评分权重进入 prompt。
- 第三次 live 导入 upsert 后 20 秒内一次读到 `persistedCount:null`，200ms 后磁盘文件为 4 providers，重跑通过。判断为原子写窗口内读竞态或旧快照，未复现、未改产品代码，登记为观测项。
- 真实供应商验证证明通道与供应商归属，不证明任意供应商、任意模型或长批次稳定性。
