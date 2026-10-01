# DEV LOG 2026-09-23 - API 直写长文档 live V3（P0-A / P0-B / P2 + timeout + 完整性收尾）

## 目标

完成 `PROPOSAL_2026-09-23_API_DIRECT_WRITE_LONG_DOCUMENT_MATURITY_V3.md` 的收口：

1. P0-A：删除 direct 入口的 `maxToolIterations: 6` 假上限，恢复 `direct-tool-intensive = 12`。
2. P0-B：收敛轮伪工具调用不再被当成正文成功；一次强纠正，仍失败则本地兜底并明示“本轮未完成写入”。
3. P2：chat run 保持 running 时写入 `session-active`，导出不再伪造终态。
4. `timeoutMs: null` 不再被 `??` 回退为默认 600 秒超时。
5. 修复 Step5 整篇整理被 `outlineIntegrity` 误杀的问题，并完成真实 live 六步实测。

不设 token 预算；live 未全过前不封装。

## 修复一（P0-A）：入口假上限

- `src/components/common/OutlineWorkspace.vue` 三处 direct 调用、`src/components/chat/ChatPanel.vue` 两处 direct 调用均已删除 `maxToolIterations: 6` 覆盖，仅保留 `scenario: 'direct-tool-intensive'`。
- `src/services/toolLoopPolicy.ts` 中 `direct-tool-intensive` 默认 12 轮；`normalizeToolIterations('direct-tool-intensive', 20)` 钳制为 12。
- `src/services/toolLoopPolicy.spec.ts` 锁定默认值与钳制行为。
- 生产入口扫描：`OutlineWorkspace.vue` / `ChatPanel.vue` 中未再出现 `maxToolIterations` 覆盖，direct 对话实际轮次由单源策略决定。

## 修复二（P0-B）：伪工具调用收敛门

实现：

- `src/services/aiService.ts:341` `judgeConvergenceText()`：空文本、伪工具协议短文本、自然语言正文三分判定；禁止剥壳后把残余字符当正文。
- `src/services/aiService.ts:1728` 工具执行后的最终回答先过伪调用判定，命中则进入收敛。
- `src/services/aiService.ts:2048` `requestToolConvergence()`：无工具请求、一次强纠正、纠正成功返回 `tool_converged`，仍失败返回 `tool_converged_local`，正文第一层信息明确为“本轮未完成写入”。
- 回调 `onConvergencePseudoCall / onConvergenceCorrected / onConvergenceLocalFallback` 已接入 toolPolicy，供 run trace 与诊断日志记录分支。

回归：

- 一次强纠正成功。
- 二次仍伪调用后本地兜底。
- 工具执行后伪调用被拦截。
- 连续伪调用不进入 assistant 正文。
- 用户取消立即中断。
- 收敛请求不带 `tools`。
- 收敛 system 明确“不携带工具 / 禁止输出工具调用形态 / 未写入必须明示”。

## 修复三（P2）：chat run 观察口径

- `src/stores/runTrace.ts:821` 在 chat run 完成一轮但整体仍为 running 时写入 `session-active` 事件，说明“本条 chat run 保持 running，等待下一轮用户输入”。
- 导出快照保留 `sessionKind: chat` 的真实会话状态，不再把运行中的 chat run 伪造成 success/failed 终态。
- 本次 live trace 中已出现 6 次 `session-active`，与 6 个用户步骤一一对应。

## 修复四：显式 null 超时

- `src/services/aiService.ts` 新增 `resolveRequestTimeout(timeoutMs, provider, wantStream)`：`null` 保持无超时，`undefined` 才走 provider/默认值。
- `mainNetStream` 第 6 参类型改为 `number | null`。
- `src/services/aiService.spec.ts` 不再全局打桩 `AbortSignal`（Vitest forks 池下文件级替换全局无效），改为断言两次工具轮请求的 `init.signal === userSignal`，另用纯函数用例覆盖 `null/undefined/0/provider` 语义。

结果：`aiService.spec.ts` 108 passed；全量 services 856 passed；`type-check` 通过；`build:vue` 通过。

## 修复五：Step5 完整性误杀

### 根因

live Step5 首次 `replace_document` 内容完整、仅调整节顺序，却被 `body_content_lost` 阻断。`collectSectionBodies()` 把 heading 根节点也当作一个“小节”，其 body 是整个文档去空白后的字符串；原比较要求“旧全文串”作为“新全文串”的子串。节顺序变化后拼接顺序必然不同，整篇重排必被误杀。

### 修复

- `src/services/outlineIntegrity.ts`：容器 heading（存在结构化子节点）只比较其自身直接引言，子节 body 由子节点逐节比较覆盖。
- `src/services/outlineIntegrity.spec.ts` 新增根标题 + 多子节 + 重复段落 + 整篇重排用例。

### 两向验证

用本次真实 trace 数据回放：

```json
{
  "replay": { "ok": true, "criticalCount": 0, "issues": [] },
  "guard": { "ok": false, "guardCritical": true }
}
```

- `replay`：Step5 首次 `replace_document`（重排版全文）现在直接通过。
- `guard`：同一数据人为删除第 16 节后，`body_content_lost` critical 仍然阻断。

## live 六步实测

命令环境：

- `SHENYI_LIVE_STEP_TIMEOUT_MS=900000`
- `SHENYI_LIVE_GLOBAL_TIMEOUT_MS=7200000`
- 供应商与模型：`https://openapi.cloud-ai.cn/v1` / `deepseek-v4-pro`

结果：

```text
[PASS] live-step1-modify: writes=1, physical=3
[PASS] live-step2-append: writes=1, physical=3
[PASS] live-step3-delete: writes=1, physical=2
[PASS] live-step4-move: writes=1, physical=3
[PASS] live-step5-tidy: writes=1, physical=4
[PASS] live-step6-reorder: writes=1, physical=4
===== API DIRECT WRITE LIVE V3 PASSED (7602 chars) =====
```

关键变化：Step5 单条 `replace_document` 直接成功；不再出现 `body_content_lost` 误杀、move 补救或二次全文替换。Step3 也不再被 600 秒默认超时中断。

## 验证证据

- 独立回归：`npm run test:services -- --run src/services/aiService.spec.ts src/services/toolLoopPolicy.spec.ts src/stores/runTrace.spec.ts` → 3 files / 165 tests passed。
- 单测：`npm run test:services -- --run src/services/outlineIntegrity.spec.ts` → 10 passed。
- 全量：`npm run test:services` → 86 files / 856 tests passed。
- 类型：`npm run type-check` → 通过。
- 构建：`npm run build:vue` → 通过（保留既有 Vite 配置 warning，未引入新错误）。
- live trace：`_data/api-direct-write-live-v3-profile/app-data/run-trace/outline/run-trace-outline-20260923-180811/run-trace.json`。
- 截图与前后文档：`_audit/verification-api-direct-write-live-v3/`。

## 回头看

- 生产调用点：`validateOutlineIntegrity()` 仅 `OutlineWorkspace.vue` 一个生产入口；`validateDocumentBody` 只在 `replace_document` 批次开启，无旁路。
- 安全方向：删除节内容仍被 critical 阻断；本次只移除容器节点重复比较，未放宽内容保护。
- 影响圈：本次收尾未触碰意图路由阈值、Folder SKILL 协议、pipeline 禁令与版本号。
- 新旧并存：direct 生产入口不再残留 `maxToolIterations: 6`；12 轮策略由 `toolLoopPolicy.ts` 单源提供。
- 观察口径：run trace / DiagLogger / live 导出均按实际分支记录，伪收敛不再显示为成功正文。
- 经验文件：已新增 M62 门禁并登记 v5.37 修订记录。

## 遗留

- 无本轮功能遗留。
- Vite 仍有既有配置类 warning（`__dirname` 与 chunk 大小提示），属此前已登记事项，不阻塞本任务。
- 尚未升版本、未封装；按方案约定需另行确认后执行。
