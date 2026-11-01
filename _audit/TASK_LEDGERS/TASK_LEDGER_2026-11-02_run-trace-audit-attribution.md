# TASK LEDGER：Run Trace 归因审计与 3.111.0

## 1. 目标与原话

用户确认执行 run-trace 归因修复与验证收尾；最终可感知行为是：正文层候选归因、终态原因、导出版本和验证证据一一对应，验证器不能拿历史 run 冒充当前 run。

## 2. 门禁读证

- G0.3 诚实闭环：mock 只证明链路，不冒充真实供应商质量。
- G0.5 回头看：收尾前完成生产、验收、存储、导出、验证器双向扫描。
- G0.12 台账：本文件七节齐备。
- G1.5 验证器自身质量：验证器修改后完整重跑，不允许局部导入检查冒充。
- G1.8 观测同步：`retainedCandidateIndex`、终态事件、导出 schema 同批接入存储、导出、测试与验证器。

## 3. 路由判定

加入：G0.3、G0.5、G0.12、G1.5、G1.8。排除：G0.10 新旧并存清零门，因为本轮没有删除既有功能，只新增观测与验证器断言；排除 G1.9 状态机门，终态事件由既有验收状态机收敛，没有新增生命周期。

## 4. 影响圈与作者反证

打算改：trace 存储类型、候选归因、导出服务、验证器脚本、测试。可能碰到：RunTracePanel 导出链、Electron IPC 导出、独立审计脚本。最可能错的假设是“最新导出目录就是当前 run”；已用 run.id+status 断言证伪。

## 5. 停止条件

Electron 验证器 PASS、独立审计 PASS、全量服务测试 0 failure、导出 run.id/status/schema 三重断言存在、文档与台账落盘。

## 6. 执行证据

- `scripts/verify-run-trace-audit-electron.mjs`：`data-run-id` 精确点击、active 等待、run.id/status/exportSchemaVersion 校验。
- `src/services/runTraceExportService.ts`：导出新增 `exportSchemaVersion`。
- `_audit/verification-run-trace-audit-electron/report.json`：`run-1793576618331-1`、3.111.0、schema 20。
- `_audit/verification-run-trace-audit/report.json`：payloads=14、attempts=1。
- 全量：240 files / 2586 tests passed。

## 7. 缺口清单

本轮无登记缺口。独立审计 `retained=0` 为 success 口径差异，非缺陷。
