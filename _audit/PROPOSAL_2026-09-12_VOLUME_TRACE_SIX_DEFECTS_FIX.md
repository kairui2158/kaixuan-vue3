# 卷纲层运行记录六缺陷修复方案

日期：2026-09-12  
状态：待审核，未执行  
输入现场：`C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-卷纲层-20260912-024601-deep/`  
经验基线：`_audit/神意开发经验总结_v4.md`

## 结论

这次不是单点 BUG，而是 folder chain 运行记录链路缺少三条硬保障：执行中同步、现场完整性、导出无损去重。客户实测暴露的 6 个问题里，4 个是应用层缺陷，1 个是 SKILL 层约束不足，1 个是前两者的共同结果。此前把“能导出 JSON”当成了闭环，没有把“导出包能还原一次完整执行”作为验收标准，这是流程教训。

## 证据

### 问题 1：S2 长时间无事件，run 状态一直是 running

- `run-trace.json`：S1 成功，耗时 212844ms；S2 只留下 `api-start`，无 `physical-call`、流式、终态事件。
- 时间线：S2 开始于 02:49:34.332，导出时间是 02:58:25，实际只等待约 291 秒。
- 卷纲层调用传入 `timeoutMs = 600000`（`PipelinePanel.vue:2788`），因此不能把当时的 `running` 直接判为超时未清理。
- 根因：`callValidatedSkill()` folder 分支把 `onChunk` 只接给 UI 的 `appendPipelineStream()`，没有接 `runTraceStore.appendCumulativeStream()`；也没有把 `aiService` 的 `onPhysicalCall` 传给 `executeRealSkill()`。于是长流式请求期间运行记录完全静默。
- 交叉验证：`ChatPanel.vue:266`、`OutlineWorkspace.vue:556` 均已接入 `appendStream`/`appendCumulativeStream`，只有流水线 folder 分支没接。
- `runTrace.ts:829-859` 已具备前缀增长保护，S2 接入后不会重演旧版膨胀拼接。

修复目标分两层：

1. 执行中可见：每个 folder chain 步骤有流式增量、物理请求开始/结束事件。
2. 终态必闭合：超时、取消、异常都会写入 `finishApiCall()` 和 `finishRun()`，不允许永久 `running`。

### 问题 2：payload 重复存储约 60%

`payloads/` 中：

- `001-request.json` 与 `003-request.json` SHA256 完全一致：`6AE85C7F...F74`，各 301802 字节。
- `002-response.json`、`004-response.json`、`005-stream.json` SHA256 完全一致：`32ABB240...018`，各 39917 字节。

根因在 `electron/ipc/runTrace.js:78-116`：`collectPayloads()` 同时收集逻辑调用的 request/response/stream 和 `physicalCalls` 的 request/response/stream。卷纲 folder 执行只有一次物理请求时，两边内容完全相同。

### 问题 3：S2 初始请求缺 system prompt

`006-request.json` 只有 1 条 `user` 消息（116383 字符），没有 system。

根因在 `PipelinePanel.vue:1647-1654`：`startApiCall()` 只记录 `[{ role:'user', content: prompt }]`。真实消息要等 `realSkillExecutor.ts:457-472` 构建后再通过 `setApiCallRequest()` 回填，而回填发生在执行完成后（`PipelinePanel.vue:1733`）。S2 还在执行时导出，只能看到不完整的初始请求。

这与经验文件 §8 规则 75 一致：旁路 API 调用不能只依赖执行完成后的回填，必须覆盖执行中现场。

### 问题 4：chain 上下文滚雪球

实测：

- S1 请求：301802 字节 JSON，user 内容 101195 字符。
- S1 输出：15115 字符。
- S2 请求：316486 字节 JSON，user 内容 116383 字符。

两个直接缺陷：

1. `[相关记忆]` 在 S2 user prompt 中出现两次：索引 100352 和 115991，内容为同一版本 `v-bafc3c89`。第一次来自原始背景参考块，第二次来自 S1 完整输出。
2. `--- 上一步 SKILL 完整输出 ---` 标记出现两次：索引 100755 和 100855。第二次是 S1 输出末尾回显了上一个请求的指令头，S1 没有遵守“只输出当前步骤定稿产物”的约束。

应用层责任：`chainExecution.ts:26-45` 对 folder 后续步骤采用 `inline_block`，完整拼接前序输出；同时没有“中间产物压缩协议”，S1 输出 15K 会被 S2、S3、S4 重复继承。

SKILL 层责任：S1 输出包含大量上游复述，甚至在末尾复写了指令头。这个不能靠应用层擅自压缩，必须通过输出协议交给 SKILL 制作方约束。

### 问题 5：folderDiagnostics 内联完整输出

`run-trace.json` 达到 392644 字节，其中 `folderDiagnostics[0].output` 内联了 S1 的完整 15115 字符输出，与 `002-response.json` 重复。

根因在 `PipelinePanel.vue:1727-1732`：append 诊断时直接 `output: route.folderResult.output`。

### 问题 6：S1 输出不是结构化中间产物

S1 是解析/提取步骤，但输出是 15K 纯文本复述。下游步骤需要的是结构化事实块，而不是完整故事梗概重放。这是 SKILL 输出协议缺陷，应用侧需要提供诊断指标和交接文档，不擅自改第三方 SKILL 内容。

## 修复计划

### P0-A：folder 执行中现场同步

修改 `PipelinePanel.vue:1697-1720`：

1. `onChunk` 同时调用 `appendPipelineStream(step, text)` 和 `runTraceStore.appendCumulativeStream(traceRunId, traceCallId, text)`。
2. 将 `onPhysicalCall` 继续传给 `routeSkill()`，同时由 `realSkillExecutor` 转发给 `aiService.callAi()`。
3. 启动 API 调用时记录预估的 system/user 现场：system 来自 `buildSystemPrompt` 可复用输出；user 至少先记录 `prompt` 和 `folderPath`，执行完成后仍用 `setApiCallRequest()` 覆盖为精确请求。

验收：

- `src/services/realSkillExecutor.spec.ts` 增加 mock 流式与物理回调断言。
- `src/stores/runTrace.spec.ts` 验证执行中导出能看到 system、user、streamText、physicalCalls。
- 真实 Electron 模拟用户执行卷纲 folder chain，在 S2 生成过程中导出，导出包内 S2 必须有 `requestMessages`、持续增长的 `streamText`、至少一条 `physicalCalls`。

### P0-B：run 与 API 终态强闭合

1. `finishRun()` 前强制清扫同 run 的 `running` API，不能只依赖外层 catch。
2. 卷纲流程在 600 秒物理超时外增加任务级 watchdog，避免 retry 与 heartbeat 使总时长不可控。
3. 取消、异常、超时路径统一调用 `cancelRunningApiCalls()` 或 `finishApiCall()` 后再 `finishRun()`。
4. 启动新任务时若同 source 存在 `running` 残留，保持现有 `abandonRunningRun()` 行为，并追加 `abandoned` 事件。

验收：

- 单测覆盖 catch、cancel、timeout、finishRun 四条路径。
- E2E 用超短超时和 mock provider 触发失败，导出后不允许存在 `status=running` 的 API。

### P0-C：payload 内容寻址去重

修改 `electron/ipc/runTrace.js:78-194`：

1. `collectPayloads()` 按 `sha256(kind + '\n' + content)` 去重，相同内容只写一个 payload 文件。
2. `replacePayloadFields()` 对相同内容的多个字段写同一个 `payloadRef`。
3. `payloads` 列表保留唯一条目和 `duplicateOf` 字段。
4. `verifyPayloadFiles()` 继续校验引用存在、hash 一致、大小一致。

验收：

- 新增主进程 IPC 导出测试或抽出纯函数单测：构造 logical/physical 同文对象，断言文件数从 6 降为 3。
- 深度导出的 `export.json` 校验 `payloadVerification.valid = true`。
- 对本次导出样本做兼容验证：同一输入重新导出，体积应从 392KB 明显下降，且所有字段引用仍可还原。

### P0-D：chain 中间产物控制

分三步，避免应用擅自篡改 SKILL 语义：

1. 应用层防回显：folder 执行结果返回后追加 `chain-output-echo` 诊断事件，把重叠率、前序长度、当前长度写入 run trace。
2. 应用层去重：S2 输入构建时如果 `[相关记忆]` 已在上文出现，禁止 S1 输出里的重复块再次注入；对 `--- 上一步 SKILL 完整输出 ---` 标记做同样防双注入。
3. 结构化中间产物：为 folder skill 提供 `schema.json` 输出契约能力，执行器对 chain 非末步输出做结构化校验；校验失败降级为 warning，不阻断生成。禁止无契约时擅自压缩。

验收：

- `chainExecution.spec.ts` 覆盖记忆块双注入、标记双注入、echo 诊断。
- `realSkillExecutor.spec.ts` 覆盖 schema 契约通过和失败路径。
- 真实运行 S1 到 S2 后导出，S2 user prompt 中 `[相关记忆]` 只能出现一次，`上一步 SKILL 完整输出` 标记只能出现一次。

### P1-A：folderDiagnostics 引用化

修改 `PipelinePanel.vue:1727-1732` 与 `runTrace.ts:970-984`：

1. append 时把 `output` 替换为摘要：`{ outputPreview, outputLength, outputPayloadRef }`。
2. 深度导出时由主进程把完整 output 作为独立 payload 文件写入。
3. 文本导出时保持现有完整输出能力，满足调试需求。

验收：

- run trace 不再内联完整输出，392KB 样本应显著下降。
- 深度导出仍能通过 payload 文件还原完整诊断输出。

### P1-B：SKILL 层交接

新增 `_audit/SKILL_HANDOFF_CHAIN_INTERMEDIATE_OUTPUT.md`：

1. 明确非末步输出必须结构化，只保留下游必需事实。
2. 明确不得复述任务指令、上游资料、记忆块、`上一步 SKILL 完整输出` 标题。
3. 明确末步才输出面向用户的定稿产物。
4. 说明应用侧 echo 诊断指标和 schema 契约能力。

## 风险与回滚

- `appendCumulativeStream` 已有前缀保护，接入流水线不会重演旧版流式膨胀。
- payload 去重只改变导出文件布局，不改变 run 对象内存结构，`__payload` 引用保持兼容。
- schema 契约只在 folder skill 提供 schema.json 时启用，不影响现有文本 SKILL。
- 改动集中在 `PipelinePanel.vue`、`runTrace.ts`、`runTrace.js`、`realSkillExecutor.ts`、`chainExecution.ts`，出问题可按文件回滚。

## 执行顺序与总验收

1. P0-A 执行中同步。
2. P0-B 终态闭合。
3. P0-C 导出去重。
4. P0-D chain 中间产物控制。
5. P1-A 诊断引用化。
6. P1-B 交接文档。
7. 更新开发日志与经验文件。

总验收不允许只看单测：

- `npm run type-check`。
- `npx vitest run src/stores/runTrace.spec.ts src/services/realSkillExecutor.spec.ts src/services/chainExecution.spec.ts`。
- 主进程导出去重测试。
- 源 Electron 模拟真实用户执行卷纲 folder chain，中途导出和完成后导出各一次：
  - 中途导出：S2 有 system/user、流式增量、物理请求。
  - 完成导出：所有 API 均为终态，run 为 success/failed/canceled。
  - 两种导出都没有重复 payload 文件。
  - S2 输入中记忆块和“上一步输出”标记各只出现一次。
- 更新 `_audit/神意开发经验总结_v4.md`：补充“运行记录闭环必须以导出包可还原完整执行为验收标准，不以 UI 显示或执行完成回调为准”。
