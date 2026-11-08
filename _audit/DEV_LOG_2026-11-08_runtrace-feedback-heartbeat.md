# 2026-11-08 runTrace 反馈保留与心跳事件抑制

## 交付

- 文件：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-08_runtrace-feedback-heartbeat-v1.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-08_runtrace-feedback-heartbeat-v1.md)
- 修复 runTrace 事件压缩把 `schema-retry-feedback-composed` 与 `final-step-feedback-composed` 淘汰的问题，两类反馈事件进入审计白名单。
- 抑制已存在物理调用的 running 心跳事件洪水：心跳更新保留 `heartbeat=true`、`lastExecutionActivityAt`、watchdog 进度与长请求去重语义，但不再追加 `physical-call` / `run-activity` 事件；首条 running 与终态事件照常记录。
- runTrace schema 同步为 23，artifact contracts Electron 验证脚本既有滞后的 21 常量同步为 23。

## 验证

- `npx vitest run src/stores/runTrace.spec.ts`：120/120 passed，新增反馈保留与心跳抑制两条负向回归。
- `npm run test:services`：249 files / 2686 tests，全部 passed。
- `npm run type-check`：exit 0。

## 边界

- 本轮是记录器观测修复，不改生成链路、不裁决 SKILL/模型层失败根因。
- 未做 Electron GUI 真实供应商重测；历史 schema 22 trace 仍保留为旧版产物。
- 封装：`verify:packaging` 通过，安装包 `dist/神意助手-Setup-3.118.0.exe`，SHA-256=`0876ff18cae5ed2d787d9c765b90b20767e4bb0ad173938fcbf8ae6eec633ae4`；3.116.0 / 3.117.0 已清理。
- 残留：旧 3.110.6 安装包移动、takeown、icacls 均被系统拒绝，按门禁登记为历史锁定残留，不强删。
