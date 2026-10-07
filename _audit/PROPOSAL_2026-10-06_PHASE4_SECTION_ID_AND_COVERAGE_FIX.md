# Phase 4 修复方案：section id 稳定性后的覆盖判定、分页协议与失败诊断闭环

## 1. 目标与成熟度结论

原始目标：消除 after 真实 Electron 运行暴露的 13 次工具失败与 `partially_applied` 误判，使长文档 API 直写在真实供应商链路中不再因应用侧协议、观测和覆盖判定缺陷而中断。

最终可感知行为：

1. 模型按 `editor.read_range` 分页读取时，`offset/limit` 与 cursor 简写不再被应用错误拒绝。
2. 供应商工具调用参数解析失败时，trace 保留原始 `argumentsRaw`，能区分“供应商真的传空”和“应用解析失败”。
3. `replace_match` 误用空 `content` 时，错误明确指引改用 `delete`。
4. `ambiguous_target` / `target_not_found` 返回结构锚点，减少模型反复复制长原文。
5. staged plan 中每个 segment 的覆盖来源单源对齐；已执行 segment 被正确计入，未执行 segment 仍保持未完成。

成熟度结论：成熟，可执行。理由是五个问题均有 after trace 证据、生产入口、旧断言位置和 TDD 可判定停止条件；验证最后仍以 after2 真实 Electron UI 运行作为闭环证据。

## 2. 根因

1. 分页协议分叉：`outline.read_range` 使用 `offset/limit`，`editor.read_range` 只认 cursor；且 cursor 简写 `section:{id}` 无法自愈，模型自然按常见分页协议传参后被拒。
2. 观测链路丢证据：OpenAI 兼容流 `arguments` 解析失败后静默置空，trace 无法追溯原始参数，导致空参数被误判成供应商行为。
3. 错误指导不完整：拒绝空 `content` 时不告知删除语义；定位失败时不提供已稳定 section id 的结构锚点。
4. 计划与执行脱钩：planner 产生多 segment staged plan，执行侧动态批次按操作类型只选择一个匹配 segment；`structure-repair` 可从未被批次声明。coverage 只信批次声明，导致真实已写入内容被误判为 `partially_applied`。

## 3. 影响圈七面矩阵

| 面 | 必须修改 | 必须同批对账 |
| --- | --- | --- |
| 生产入口 | `editorDocumentMap.ts`、`editorTools.ts`、`providerTools.ts`、`aiService.ts` | `OutlineWorkspace.vue` 的 `onToolCall` 记录 |
| 服务层 | `longDocumentWriteCoverage.ts`、`longDocumentExecutionPlanner.ts` | `agentOrchestrator.ts`、`agentDialogueRuntime.ts` |
| UI | `OutlineWorkspace.vue` trace 记录函数 | 首页编辑器同链路入口；不新增 UI 状态 |
| 测试 | `editorDocumentMap.spec.ts`、`editorTools.spec.ts`、`providerTools.spec.ts`、`runTrace.spec.ts` | 旧 offset/limit 拒绝断言同批迁移，禁止新旧并存 |
| 脚本 | `verify-r1-phase0-electron-before.mjs` | after2 标签、独立 epoch、失败归零断言 |
| 规格文档 | `SKILL_HANDOFF_API_DIRECT_WRITE_TOOLS.md` | `editor.read_range` 协议口径 |
| trace 字段 | `RunTraceToolCall.argumentsRaw` | schemaVersion 14 -> 15、导出通道、旧数据兼容 |

## 4. TDD 执行顺序

1. 分页统一：
   - 红：`editor.read_range` 支持 `sectionId + offset/limit`；cursor 简写等价 offset 0；`cursor` 与显式分页混用时给出单义错误。
   - 绿：`editorDocumentMap.ts` 与 `editorTools.ts` 两处校验同批迁移；返回 `nextCursor`，并保留 cursor 兼容。
   - 清旧：删除“不支持 offset/limit”旧契约测试与文案。
2. `argumentsRaw`：
   - 红：OpenAI 兼容流解析失败、空字符串、非对象时保留原始字符串。
   - 绿：`NormalizedToolCall`、`aiService` 事件、UI 记录、runTrace 存储、导出、schemaVersion 15 全链接线。
3. `replace_match` 空 content 指引：
   - 红：错误信息包含“若目的是删除原文，请使用 delete 操作”。
   - 绿：只改诊断文案，不改变拒绝语义。
4. 定位失败结构锚点：
   - 红：ambiguous 与 not found 响应包含候选 `sectionId`、`sectionTitle`。
   - 绿：复用现有定位结构，不新增旁路定位器。
5. 覆盖单源对齐：
   - 红：多 segment staged plan 中，`structure-repair` 的批次覆盖能被计入；未执行 segment 不被计入；跨 segment 实际 range 只按交集计入，不假阳性补齐。
   - 绿：批次覆盖从“单选 segment”改为“实际 command range 与 plan segment 交集 + 显式声明”单源计算；`structure-repair` 等结构操作在无逐字 range 时覆盖其 plan segment，但不得凭空覆盖其他 segment。

## 5. 验证矩阵

1. 单测：上述五个红测试全部红转绿。
2. 局部回归：`editorDocumentMap.spec.ts`、`editorTools.spec.ts`、`providerTools.spec.ts`、`runTrace.spec.ts`、`longDocumentWriteCoverage.spec.ts`、`agentOrchestrator.spec.ts`。
3. 全量：`npm run type-check` 与项目测试套件。
4. 构建：`npm run build:vue`。
5. 真实 UI：`SHENYI_R1_RUN_LABEL=after2` 重跑 `node scripts/verify-r1-phase0-electron-before.mjs`，使用新的 epoch 目录，不覆盖 after1。
6. after2 通过条件：13 类工具失败归零或仅剩供应商真实错误；Turn 1 不再因 coverage 误判进入 `partially_applied`；Turn 2 不再因空参数/定位失败进入 `repeated_tool_error`；trace 可用 `argumentsRaw` 空参数溯源；长文重排在合理请求轮次内完成。

## 6. 回写与收尾

1. 回写 `_audit/DEV_LOG_2026-10-06_r1-phase0-baseline.md` Phase 4 小节。
2. 回写 `_audit/TASK_LEDGERS/2026-10-06_residual-convergence-master-plan.md` 第 6/7 节。
3. 同步 `SKILL_HANDOFF_API_DIRECT_WRITE_TOOLS.md` 中 `editor.read_range` 协议与 trace 字段说明。
4. 必要时把本轮“计划 segment 与批次声明脱钩”补入 `_audit/神意开发经验总结_v8.md`，只提炼为 G1.10/G1.14 的实例，不重复规则源。
5. 回头看：逐行 diff、旧断言清零、trace 全链路断言、before/after 对比、after2 独立证据。

## 7. 防跑偏规则

1. 不放宽 coverage 完成条件；只修正 segment 归属证据。
2. 不移除拒绝语义；只改进可修正错误的指导。
3. 不新增第二套分页协议；同一函数单源兼容 cursor 与 offset/limit。
4. 不把 after2 未运行写成通过；真实 UI 证据缺失时状态只能是未完成。
