# P3 取消与超时信号校准记录（2026-08-26）

## 目标

修复生成流水线超时只拒绝外层 Promise、底层 `callAi` 继续运行的问题，并保持用户取消与请求超时的错误语义等价。

## 根因

`PipelinePanel.vue` 原先使用 `Promise.race()` 实现超时。外层超时后虽然返回失败，但底层 HTTP 请求没有被取消，可能继续写入流式内容、诊断日志和后续状态。首轮修复把临时超时控制器的 signal 直接传给统一 AI 服务，又会把应用超时误判为用户取消。

## 最小修复

- `callApiWithAgent` 增加可选 `signal` 与 `timeoutMs`，把取消信号和超时配置传入 `callAi`。
- `callApiWithAgentTimeout` 不再使用 `Promise.race()`，改为把流水线父级取消 signal 与 `timeoutMs` 交给 `aiService`。
- 统一服务继续负责真正的请求终止和 `timeout`/`canceled` 分类；用户取消仍由父级 signal 触发。

## 本轮验证

- `npm run type-check`：退出码 0。
- `npm run test:services`：2 个测试文件，41/41 通过。
- 追加的超时回归：`aiService.spec.ts` 39/39 通过；断言在途请求收到 aborted signal、只调用一次 fetch，并分类为 `timeout` 而非 `canceled`。
- 追加后全量服务门：2 个测试文件，42/42 通过。
- `npm run build:vue`：176 modules transformed，构建成功。
- 源文件启动器：页面标题“神意助手”，URL `file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`，CDP `127.0.0.1:9227` 可达。
- `git diff --check -- src/components/pipeline/PipelinePanel.vue`：无格式错误。
- 本轮临时探针已删除；未写入客户项目数据。

## 证据边界

没有真实项目和供应商在途请求，因此本轮只核销统一服务与流水线取消/超时接线、构建和静态边界；真实网络波动、用户点击取消、长链断点续跑仍需客户项目与真实请求条件核验，不能标记为客户行为 PASS。

## 后续队列

P2 的原生导入合并、项目 JSON 差异和关闭重启恢复仍为 `UNVERIFIED`；P3 的真实在途验证仍为 `UNVERIFIED`。后续应在取得真实可恢复项目和真实供应商请求条件后逐项核验，再推进 P4。
