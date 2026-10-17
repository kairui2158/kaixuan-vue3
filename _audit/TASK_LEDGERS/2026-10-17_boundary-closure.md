# 任务台账：五项登记边界闭环

## 1. 目标与原话

用户原话：“完成边界项”。

本轮交付物：把 `_audit/TASK_LEDGERS/2026-10-17_body-contract-degraded-gate.md` 登记的 5 个边界项从登记态推进为可验证闭环态；不能虚构契约，不能掩盖 warning，不能把 live 验证冒充成 mock 验证。

## 2. 门禁读证

- `G0.3 诚实闭环`：经验文件 v8.15 第 8 条 v8.14 说明“测量面与消费面同源”查账法；完成声明必须区分已验证、未验证、无法验证。
- `G0.5 回头看`：收尾前对账目标、diff、生产入口、旁路、日志与测试证据。
- `G0.8 任务收尾清理`：可再生成产物分层清理，删除前后复核路径与不存在状态。
- `G0.9 影响圈声明`：修改前列“打算改的”和“可能碰到的”。
- `G0.10 新旧并存清零`：替换构建配置与回放器时，旧口径必须清零或登记迁移防御。
- `G0.12 门禁执行台账`：本文件为执行凭证，七节缺一不得进入完成声明。
- `G1.5 验证器自身质量`：verification-gate SKILL “Iron Law / Gate Function / Red Flags” 要求新鲜、完整、可溯源验证输出。
- `G1.17 执行者自盲区`：v8.11 要求状态生命周期对账与二次进入矩阵；本轮用于 payload 账本与事件流对账。
- `G2.9 终稿与流水线`：v8.15 要求单调用 compose 也是唯一生成步；本轮大纲契约不得误套多步链口径。

## 3. 路由判定

加入：G0.1、G0.3、G0.4、G0.5、G0.8、G0.9、G0.10、G0.12、G1.5、G1.17、G2.9。

排除：

- G0.11 真实交互冒充禁令：本轮边界项不含“用户必须通过 UI 选择 SKILL”的目标；若执行外部供应商 UI 复刻，则该项立即生效并写入证据。
- G1.18 本地确定性路径契约：本轮不改 local-transform 路径。
- G1.19 耗时观测：本轮不做性能优化决策；仅登记构建产物尺寸。

## 4. 影响圈与作者反证

打算改：`vite.protocols.config.mts`、`vite.config.mts`、`scripts/verify-body-contract-degraded-replay.mjs`、大纲产物契约服务与接线、跨层审计文档、DEV_LOG、经验文件、版本号。

可能碰到：Electron 加载器对协议 CJS 的引用、构建产物尺寸与加载路径、大纲工作台 no_contract 边界、`resolvePostProcessTerminalStatus` 消费面、外部供应商配置隐私。

作者反证：

- 假设一：调高 `chunkSizeWarningLimit` 可闭环构建告警。证伪成立：这会让真实大 chunk 从监控面消失；必须先真实拆包，无法拆包的才登记为有意配置。
- 假设二：大纲工作台需要字数契约。证伪成立：大纲写入已有结构完整性单源，虚构字数契约会制造第二套规则并误伤整理/删除场景。
- 假设三：payload 回放只校验账本即可。证伪成立：账本、物理文件、事件流三方必须同源，否则可用伪造账本通过回放。

## 5. 停止条件

1. `npm run build:vue` 无 Vite native config warning；chunk warning 消失或以真实拆包数据解释。
2. payload 级回放器校验 trace 账本、85 个物理 payload、sha256、顺序、重复计数，并与 `api-start/folder-pass-input/physical-call/api-*` 事件对账。
3. 大纲产物契约有明确产物面定义、生产接线、单测，且不引入预览/确认状态机，不影响 discuss/analyze 只读语义。
4. 外部 live 供应商验证至少覆盖 1 个应用内已配置真实供应商，证据脱敏；未覆盖供应商如实登记。
5. 全量 `npm run test:services`、`npm run type-check`、`npm run build:vue`、历史回放与 Electron 验证通过。
6. DEV_LOG、审计文档、任务台账、经验文件、版本号、清理与提交完成。

## 6. 执行证据

- `npm run type-check`：exit 0，版本 3.96.0。
- `npx vitest run src/services/workspaceSkillEngine.spec.ts src/services/workspaceArtifactAcceptance.spec.ts`：2 files / 49 tests 通过。
- `node scripts/verify-body-contract-degraded-replay.mjs`：PASS；85 payload / 85 ledger 对账，事件总数 528；5 个 `processing-output` 为导出器保留的 outputPreview 副本。
- `npm run test:services`：173 files / 2009 tests 通过。
- `npm run build:vue`：exit 0；native config warning 消失；`index` 1,054.41 kB 与 `g6` 1,406.66 kB 为真实拆包后体积提示，登记不伪装。
- `node scripts/verify-body-contract-degraded-electron.mjs`：PASS；场景 A 4 次物理请求、1654 字、S3 零调用、`degraded_plus_contract_failure`；场景 B 5 次物理请求、2200 字、S3 收到提取面。
- `node scripts/verify-boundary-live-provider.mjs`：生产 `decrypt + providerNetRequest` 链路执行成功，但两个已配置供应商均 401；报告 `blocked_external_credentials`，key masked。
- 清理：`_data/boundary-live-profile`、`_data/body-contract-degraded-profile`、`_data/body-contract-degraded-skills` 复核不存在。

## 7. 缺口清单

- **已验证**：大纲产物契约生产接线、恶意 SKILL 授权边界、payload 三方同源回放、Electron UI 双场景、3.96.0 全量回归与构建。
- **无法验证**：外部 live 供应商成功响应。两个已配置供应商均返回 401，属于外部凭据失效；提供有效 key 后重跑 `scripts/verify-boundary-live-provider.mjs` 即可闭环，不需要改应用配置。
- **登记不改码**：`index` 与 `g6` 两个 chunk 超过 Vite 默认 500kB 阈值，已是独立 chunk 的真实体积提示；本轮不调 `chunkSizeWarningLimit`。
- **经验文件**：保持 v8.15。本轮未新增工程纪律缺陷，外部凭据失效已被 v8.15 的“未验证/无法验证显式登记”覆盖。
