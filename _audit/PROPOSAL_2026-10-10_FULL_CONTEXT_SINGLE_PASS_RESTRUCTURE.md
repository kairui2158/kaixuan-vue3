# 大纲工作台全文上下文一次成型重构方案

日期：2026-10-10
状态：APPROVED

## 结论先行

本次 74,293 字大纲整理请求暴露的不是供应商读取能力不足，而是应用层架构缺陷：上下文注入层已经把完整大纲送入模型，但执行规划层仍按旧小窗口假设强制进入 EditTask 分批流程，工具面继续暴露 13 个读取工具，写入协议又明确要求“每段先读取确认，再写入”。三者叠加后，模型被系统性地引导成“读一小段、回供应商、再读一小段”的串行往返。

这不是 BUG 级问题，而是设计契约过时：系统为 32K/64K 窗口时代设计的保护机制，被保留到了 1M 窗口时代，并在组合后互相放大。

## 证据链

### 现场证据

- Trace: `_data/outline-lock-override-live-replay-profile/documents-data/run-trace/outline/run-trace-outline-20261010-183407/run-trace.json`
- 文档：74,293 字，估算 38,611 token。
- 供应商窗口：1,000,000 token；输入预算判定 872,000 token；结论 `fits`。
- 第 1 次物理请求实际 inputTokens 57,523，请求载荷 228KB，`payloads/001-request.json` 中的 `[当前焦点全文]` 包含完整大纲。

### 设计缺陷证据

1. [editorContextPipeline.ts](D:/codex/novel-workshop-vue3/src/services/editorContextPipeline.ts:96) 对 outline 工作台硬编码请求 `packed` 模式，不做窗口判断。
2. [conversationContextService.ts](D:/codex/novel-workshop-vue3/src/services/conversationContextService.ts:335) 在注入文案中写明“结构地图只描述位置，不替代局部全文；需要细节时必须先读取节点内容”，即使当前注入实际包含全文。
3. [longDocumentExecutionPlanner.ts](D:/codex/novel-workshop-vue3/src/services/longDocumentExecutionPlanner.ts:379) 对非 targeted edit 的 20,000 字以上文档强制 `edit-task`，即使窗口判定为 `fits`。
4. [toolRunBudget.ts](D:/codex/novel-workshop-vue3/src/services/toolRunBudget.ts:35) 使用 `READ_AMPLIFICATION_FACTOR = 10`，把 3 个写入批次放大为 30 次读取预算，形成“读取 2/30”的用户可见进度。
5. [longDocumentWriteProtocol.ts](D:/codex/novel-workshop-vue3/src/services/longDocumentWriteProtocol.ts:101) 在 EditTask 协议中要求“每段先读取确认需整理项，再在该段一次 editor.write 中打包提交”。
6. [outlineTools.ts](D:/codex/novel-workshop-vue3/src/services/outlineTools.ts:13) 将单次工具读取限制为 12,000 字。

### 后果

- 第 1 次物理请求耗时 77.8 秒，第 2 次 26.1 秒；第 2 次请求载荷膨胀至 306KB，第 3 次 322KB。
- 每轮工具往返都携带滚动历史，成本和时延随工具轮次增长。
- UI 显示长期停在“读取 2/30”，用户感知为应用空耗时间。

## 为什么以前没修掉

1. 前几轮修复主要集中在预算拆分、工具轮次上限、读写池分离，没有改变“EditTask 必须分批读取”的执行契约。
2. 验证脚本多数走理想化模型路径，未复刻“上下文已含全文但系统仍引导读取工具”的真实冲突。
3. 部分旧规则（先读后写、分段确认）在 64K 时代是安全机制，在 1M 窗口下变成效率枷锁，但没有被重新评估。
4. “2/30”被视为预算展示问题，而不是“30 次读取本身不应发生”的架构问题。

## 修复目标

1. 窗口足够容纳全文时，只注入一次完整大纲，不再进入分段 EditTask。
2. 同一轮任务最多一次物理请求完成整理输出，写入动作在本地执行。
3. 删除窗口足够时的读取工具引导；读取工具仅保留给真正超出窗口的文档。
4. UI 不再显示“读取 2/30”这类分批读取进度。
5. 真正超出窗口时才进入分批模式，且分批模式只处理“窗口事实”，不再从写入批次数反推读取预算。

## 新执行语义

### A. 一次成型模式

适用：`fits` 且操作属于整篇整理类（restructure、restructure_and_cleanup、normalize、deduplicate）。

1. 注入：完整大纲，标注 `[当前全文已注入]`。
2. 工具面：只保留 `editor.write` 与必要的定位辅助；禁用 `document_map/read_range/search/locate` 的主动引导。
3. 输出：模型直接输出结构化整篇整理结果。
4. 写入：应用解析结果后本地原子写入编辑器，并做完整性校验。
5. 完整性校验：保留既有 leaf-body 校验，并适配整篇替换的边界。

### B. 分批模式

适用：估算输入超过供应商声明窗口。

1. 只有此时才允许分段读取。
2. 分批策略基于窗口事实，不再由写入批次反推读取预算。
3. 显示实际批次进度，例如“正在整理 2/9”，不显示工具读取次数。

### C. 删除预算心智

1. `READ_AMPLIFICATION_FACTOR` 删除。
2. UI 中不再出现读取次数上限。
心智。
3. 分批模式中物理请求安全网只作为失控保护，不进入用户可见文案。

## 已批准决策点

1. 一次成型模式新增整篇原子结果协议，不再继续用受限编辑命令流。
2. 不放宽 `editor.write` 的 60,000 字符批次上限，新增整篇写入专用入口。
3. 保留单一顶层结构下的 `structure_repair` 分支。

## 新旧语义清理清单

- `longDocumentExecutionPlanner` 中按字符数强制 EditTask 的规则。
- `editorContextPipeline` 中 outline 硬编码 `packed`。
- `conversationContextService` 中的“需要细节时必须先读取节点内容”提示。
- `toolRunBudget` 的读取放大系数。
- `longDocumentWriteProtocol` 中“每段先读取确认”的强制条件。
- `OutlineWorkspace.vue` 中读取 0/30 的展示与相关快照字段。
- 相关 spec 与回放脚本中的旧假设。

## 验证方案

1. 单元测试：fits 场景必须走一次成型；oversized 场景才允许分批；旧规则提示不再出现。
2. 真实 Electron UI + 真实 API：使用同一 74,293 字文档，发出同样整理指令，验收标准为不出现读取循环、全文发生变化、整篇重排完成。
3. trace 验收：物理请求数显著下降；请求载荷不再滚动膨胀；事件记录一次成型语义。
4. 回归：主页编辑器与大纲工作台各自验证一次；有 SKILL 与无 SKILL 各一轮，权限与工具面断言一致。
5. 超窗文档测试：构造或使用超过窗口的文档，验证分批模式仍可用。

## 风险与反证

1. 一次输出超长文本可能触发供应商输出中断：方案使用分段续写恢复，不用预览、不加用户确认步骤。
2. 整篇替换可能丢失正文：保留 leaf-body 多重集校验，任何丢失直接失败，不落盘。
3. 模型可能输出受限命令而非整篇结果：协议层拒绝并重试一次；仍失败则显式失败，不进入读取循环。
4. 未知窗口供应商：保持现有保守 fallback，但必须在 trace 中显式登记，不允许伪装成声明窗口。
