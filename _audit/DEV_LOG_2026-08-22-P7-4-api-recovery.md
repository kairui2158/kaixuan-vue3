# P7-4 真实 API 错误恢复

日期：2026-08-22
状态：部分通过，保留严格边界；P7-4 未整体标记 PASS

## 对账

- [x] 读取经验文件、P7-3 日志和现状边界。
- [x] `npm run build:vue`：`175 modules transformed`，`dist-renderer/index.html` 和最新 bundle 生成成功。
- [x] 杀 Electron：启动前返回无进程；收尾后 `taskkill /F /IM electron.exe /T` 成功终止 4 个 Electron 进程。
- [x] `start-electron.bat` 源文件启动：进程路径为 `D:\codex\novel-workshop-vue3\node_modules\electron\dist\electron.exe`。
- [x] CDP 运行基线：页面标题“神意助手”，URL 为 `file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`，Pinia 存在。
- [ ] 网络错误：未核销。
- [ ] 超时：未核销。
- [ ] HTTP 重试：未核销。
- [ ] 取消：未核销。
- [ ] providerId/purpose/model/耗时/错误日志：未核销。

## 第二轮受控服务层核验

为避免 `file://` 页面动态导入源码失败，本轮用 Vite 将当前 `src/services/aiService.ts`、`providerRouter.ts`、`providerAdapter.ts` 打包为一次性验证载体，由 Node 调用导出的真实 `createAiService`，只替换验证进程内的 `globalThis.fetch`。没有修改业务源码、Pinia 或项目数据。

原始命令：

```text
npm exec vite -- --config _audit/verify/vite.config.mjs build
node _audit/verify/run-node.mjs
```

构建原始输出：

```text
vite v8.2.1 building client environment for production...
transforming...✓ 5 modules transformed.
_audit/verify/dist/bundle.mjs  19.89 kB │ gzip: 5.98 kB
✓ built in 116ms
```

受控场景原始关键结果：

| 场景 | 实际结果 | 请求次数 | 诊断/错误证据 | 状态 |
|---|---|---:|---|---|
| network | `AiServiceError.kind=network`，`providerId=p-test`，`purpose=generate` | 1（本次关闭 retry，避免等待 8 次退避） | failed 日志含 provider、model、耗时、错误文本 | [x] 服务层分类/失败收束 |
| timeout | `AiServiceError.kind=timeout`，AbortSignal 收到 abort | 1（本次关闭 retry） | failed 日志含 `请求超时`、provider、model、耗时 | [x] 服务层分类/失败收束 |
| HTTP 503 → 200 | 第一次 503，按退避后第二次 200，返回 `text=ok`、usage | 2 | success 日志含 `p-test/test-model/2035ms` | [x] 重试与成功收束 |
| cancel | `AiServiceError.kind=canceled`，请求 signal 收到 abort | 1 | 取消分支在统一服务内抛出；没有 success/failed 业务日志 | [x] 取消分类/中止；[ ] 取消诊断日志 |

这轮核验得到的证据是“统一服务层在受控 HTTP/AbortSignal 下的行为”，不是供应商网络稳定性证明。网络和超时场景使用 `retry=false` 以避免 2 秒至数分钟退避；因此不能把它们扩大解释为“自动重试耗尽”已通过。HTTP 503 场景实际证明了重试请求和最终成功。取消没有写诊断日志，这是当前实现的明确边界，不能伪称日志已通过。

## 失败原因与证据

一次性 CDP 载体成功连接真实页面，但尝试从 `file://` 动态导入 `/src/services/aiService.ts` 时返回：

`Failed to fetch dynamically imported module: file:///D:/src/services/aiService.ts`

四个场景的请求计数均为 `0`，因此没有进入 AIService，也没有产生 API 错误恢复证据。该结果是验证载体阻塞，不是应用网络恢复通过。

## 收尾

- 临时 `_audit/p7-4-cdp.cjs` 已删除。
- 本轮没有写入项目、聊天或供应商持久化数据。
- Electron 已清理。
- 业务源码没有修改。

## 第二轮收尾

- 一次性 `_audit/verify/` 验证目录及其构建 bundle 已在报告确认后删除。
- 业务源码未修改；不触碰本来就存在的其他工作区修改。
- 本轮未向项目、聊天、供应商配置写入数据。

## 第三轮：自动重试耗尽与取消日志

本轮对 `aiService.ts` 做了一个最小业务修正：统一增加 `throwCanceled()` 收束函数。取消现在会写一条失败诊断日志，再抛出 `AiServiceError(kind=canceled)`；不改变请求取消、重试或心跳语义。

原始命令：

```text
npm run build:vue
npm exec vite -- --config _audit/verify/vite.config.mjs build
node _audit/verify/run.mjs
```

关键原始结果：

```text
network-retry: outcome=error, kind=network, calls=12, log.status=failed
timeout-retry: outcome=error, kind=timeout, calls=12, log.status=failed
503-then-200: outcome=success, calls=2, result.text=ok, providerId=p-test, model=test-model
cancel: outcome=error, kind=canceled, calls=1, aborted=true, log.result=用户取消, log.status=failed
```

其中自动重试的 `12` 次由主重试循环的 `9` 次请求和随后 `3` 次心跳探测组成；这是当前实现的完整耗尽行为。测试将退避定时器压缩为零，仅缩短验证时间，没有删除重试分支。

## 结论

P7-4 的服务层错误恢复闭环已核销：构建、源文件启动器、CDP 基线、进程清理、网络/超时分类、自动重试耗尽、HTTP 503 重试成功、取消中止与取消诊断日志、providerId/purpose/model/耗时日志均有证据。仍保留边界：本轮不是供应商真实网络稳定性证明，也不是完整用户 UI 端到端验收；其余 P7-4 要求已达到服务层验证标准。P7-5 不在本轮执行。
