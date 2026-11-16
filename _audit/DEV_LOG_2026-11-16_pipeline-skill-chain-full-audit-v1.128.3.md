# 2026-11-16 生成流水线 SKILL 链路审计 P1 收口 3.128.3

- 方案：[_audit/PROPOSAL_2026-11-16_PIPELINE_SKILL_CHAIN_FULL_AUDIT_V1.md](_audit/PROPOSAL_2026-11-16_PIPELINE_SKILL_CHAIN_FULL_AUDIT_V1.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-16_pipeline-skill-chain-full-audit-v1.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-16_pipeline-skill-chain-full-audit-v1.md)

## 交付

1. N1：正文链 attempt-start 改为优先消费真实 folder templates；`resolveAttemptStartGeneratorIndexByShape` 作为兼容形状入口独立存在，并且无条件不冒认 `meta.chainHandoff.role`。真实调用点传入 `getStepSkillTemplates(4)`。
2. N2：卷纲数量达标但契约语义失败时接入既有有界修复循环；完整卷保留，被拒卷名释放并加入禁止重用名单，`previousErrors` 进入修复提示；耗尽后不交部分卷。
3. N4：章节产物通过 Panel 校验、台账校验、持久化与批次边界事件后才置 `chapterArtifactDelivered`；finally 与卷纲/正文一样使用 `traceOutcomeFromRun`，避免历史失败 API 锁死已交付批次终态。
4. N3 仍为后续独立对账项，本轮不删除 Panel/orchestrator 防线。

## 执行期修正

初版 ByShape 兼容入口用 `source === 'meta'` 条件抹 role，测试与 Node 直接执行证明该分支不可达。已改为合成模板入口返回非空索引时无条件 `role: null`，并用负向测试锁定“形状入口不得冒认声明角色”。

## 验证

1. 新增/更新 N1/N2/N4 负向守护通过。
2. 全量 `npm run test:services`：253 files / 2784 tests PASS。
3. `npm run type-check`：0 errors。
4. `npm run build:vue`：PASS，刷新生产 renderer。
5. `npm run verify:production-wiring`：593 modules / no violations。
6. 真实供应商 Electron 烟测：PASS。`_audit/verification-pipeline-provider-channel-live/report.json` 记录 volumes/chapters/body 三层 `succeeded`；5/5 供应商请求 2xx；`glm-5.3` 在 trace event、apiCall、physical request 三面一致；凭证只记录 `environment` 与 keyLength，不写入密钥值。第一次观测探针因本地旧档案的 `deepseek-v4-flash` 渠道 503，属探针配置不可用，已登记为非本方案回归。
7. 为支持用户授权的外部供应商做真实通道验证，`scripts/verify-pipeline-provider-channel-electron.mjs` 仅新增环境变量适配：`SHENYI_LIVE_BASE_URL` 与 `SHENYI_LIVE_API_KEY`。该路径强制 HTTPS、走本地透明代理、继续保留请求/响应证据，不改变生产代码与验证合同；未提供环境变量时仍要求 DPAPI 加密档案。
8. `npm run verify:packaging`：PASS，3.128.3 安装包证据见 `_audit/verification-packaging-3.128.3/packaging-evidence.json`。

## 边界

不修改 folder SKILL；不新增裁判、预算系统、自动调度或 UI；不把 P3 双裁判复审混入本轮交付。真实供应商密钥只作为运行时环境变量使用，不写入仓库、日志或验证报告。
