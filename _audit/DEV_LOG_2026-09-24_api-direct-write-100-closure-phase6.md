# API 直写 100% 闭环 Phase 6 开发日志（观测与日志收口）

日期：2026-09-24  
版本：3.60.0（Phase 8 统一升版）  
关联方案：`_audit/PROPOSAL_2026-09-23_API_DIRECT_WRITE_100_CLOSURE_FINAL.md`

## 背景

Phase 6 的验收要求是七类必记事件双侧一致：意图路由、上下文预算、工具循环、直写批次、EditTask、收敛、供应商。逐项对账发现大部分能力已由 Phase 1-5 和既有日志系统覆盖：

- 意图路由事件已进入 run trace，但未进入 DiagLogger。
- 上下文预算、估算、决策与 usage 对账已进入 apiCall、physicalCall、run trace、DiagLogger。
- 工具循环、工具结果、孤儿调用、拒绝分类已进入 run trace 与 DiagLogger。
- 直写批次与编辑器呈现已有 `ai-service/editor-batch`、`ai-service/editor-presentation` 双侧事件。
- EditTask 生命周期在主页和大纲工作台均双写 run trace 与 DiagLogger。
- 收敛伪工具调用、强纠正、本地兜底已双写。
- 供应商协议形态、流式状态、错误映射由物理请求记录承载。

本阶段唯一实际缺口是路由事件单侧缺失：run trace 有完整时间线，DiagLogger 没有。按方案判据“run trace 有而 DiagLogger 无视为缺陷”，此缺口必须修复。

## 修复内容

1. 新增 `src/services/routingDiagBridge.ts`
   - `describeRoutingDiagEvent()` 把 `ChainRoutingEvent` 归一化为 DiagLogger 事件。
   - 覆盖 8 类事件：routing_started、routing_result、routing_diagnostics、fallback_requested、chain_handoff、skill_skipped、budget_exhausted、run_completed。
   - `no_match / ambiguous / fallback / budget_exhausted / failed` 等非顺利路径标记为 `warn`，顺利路径为 `info`。
   - payload 保留决策核心字段：kind、reason、intent、confidence、fallbackMode、重复 handoff、预算位置、终态。

2. `src/components/chat/ChatPanel.vue`
   - `recordHomeRoutingEvent()` 入口统一调用桥函数，所有路由事件镜像写入 DiagLogger。

3. `src/components/common/OutlineWorkspace.vue`
   - `recordOutlineRoutingEvent()` 同步接入，主页与大纲工作台口径一致。

本阶段不改变路由决策、权限、工具面和状态机，只补观测镜像。

## 验证证据

- `npm run test:services -- --run src/services/routingDiagBridge.spec.ts`：8/8 通过。
- `npm run test:services`：89 个测试文件、907 条测试全部通过。
- `npm run type-check`：通过。
- `_audit/verification-api-direct-write-v2/diag-coverage.json`：renderer/main 双侧 208/208，此前既有覆盖无回归。

## 回头看

- 影响圈：仅新增桥服务与两处入口镜像日志；未修改意图路由阈值、工具权限、EditTask 状态机、预算器、供应商协议。
- 新旧并存：未新增第二套路由事件类型，直接复用 `ChainRoutingEvent` 单源。
- 单侧缺失扫描：路由事件此前唯一缺口，已双侧落位；其余六类事件按源码对账已有双侧路径。
- 日志覆盖：诊断日志新增 `routing/started、routing/result、routing/diagnostics、routing/fallback-requested、routing/chain-handoff、routing/skill-skipped、routing/budget-exhausted、routing/run-completed` 八类。

## 遗留项

1. Gold 语料 28/30，继续等待真实用户 confirmed 样本回流。
2. Anthropic / Gemini / Azure live 探针仍为 `untested`，Phase 7 验证阶段处理。
3. Phase 7 三档 Electron 实测、Phase 8 回归与封装按总方案顺序执行。
