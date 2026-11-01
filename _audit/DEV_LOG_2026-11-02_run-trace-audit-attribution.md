# 2026-11-02 Run Trace 归因审计与 3.111.0

## 1. 目标

针对 2026-11-02 正文层运行记录的归因缺陷，完成候选保留、验收终态、trace 观测与导出审计的闭环修复，并用真实 Electron UI 证明验证器消费的是当前 run，而不是历史失败 run。

## 2. 根因

1. 候选比选结果没有完整进入终态验收链路，失败归因容易落回第一候选。
2. 正文验收缺少统一的 `terminalReason` 与 `decisionPath`，事后只能看到失败，无法判断失败路径。
3. 导出格式只有 `schemaVersion`，校验器误把构建清单版本 `manifestVersion=1` 当作导出 schema 版本。
4. 验证器导出时按“最后一个正文层行”选择 run，历史失败 run 恢复进列表后会冒充当前成功 run 的证据。
5. 导出后没有校验 `run.id` 与 `status`，证据归属只依赖目录修改时间。

## 3. 修复

- API 调用导出新增 `retainedCandidateIndex`，与 `candidateLedger`、`bodyCandidateRetention` 共同构成候选归因账本。
- 终步候选审计通过 step artifact envelope 传递 `sourceCandidateIndex/sourceResponseHash`。
- 正文失败与成功验收都落 `body-artifact-terminal/validated` 终态事件，包含 `terminalReason`、`decisionPath`。
- 导出新增 `exportSchemaVersion=20`，与构建清单 `manifestVersion=1` 分属两个版本域。
- `verify-run-trace-audit-electron.mjs` 改为真实点击 `data-run-id` 精确行，等待 active 后导出；导出目录必须包含当前 `run.id`、`status=success`、`exportSchemaVersion=20`。
- 独立审计脚本改为校验 `exportSchemaVersion`，并保留候选、事件、payload、响应索引四类审计。

## 4. 验证

- `node --check scripts/verify-run-trace-audit-electron.mjs` → exit 0。
- 定向：`npx vitest run src/services/runTraceExportService.spec.ts src/stores/runTrace.spec.ts src/services/stepArtifactFlow.spec.ts` → 3 files / 130 tests passed。
- 真实 Electron UI：`SHENYI_RUN_TRACE_AUDIT_KEEP_PROFILE=1 node scripts/verify-run-trace-audit-electron.mjs` → `===== RUN TRACE AUDIT ELECTRON PASSED =====`，当前 run `run-1793576618331-1`。
- 独立审计：`node scripts/verify-run-trace-audit.mjs`（指向 Electron 导出）→ `[PASS] trace audit: run-1793576618331-1; payloads=14; attempts=1; retained=0`。
- 全量回归：`npm run test:services` → 240 files / 2586 tests passed。
- 构建封装：`npm run build` → exit 0，生成 `dist/神意助手-Setup-3.111.0.exe`（231,652,117 bytes，SHA-256 `138D3D9852F73630542B2B0710FDCB02DB8A875C1EE8EEFB085075009C178A9E`）。
- asar 核验：包内 `package.json` version=`3.111.0`；包内 `dist-renderer/assets/runTrace-1VUWEuvQ.js` SHA-256=`2CB2BD454DDB451A485235E70E9BF6041B396AA0037DF567938B458DC863109C`，与构建产物同名文件一致；bundle 内存在 `exportSchemaVersion:20` 与 `retainedCandidateIndex`。
- 证据：`_audit/verification-run-trace-audit-electron/report.json`、`_audit/verification-run-trace-audit/report.json`。

## 5. 边界

- `retained=0` 是独立审计的口径差异：它只统计 degraded 候选；当前 run 的 S2 为 success，验证器已断言 `retainedCandidateIndex>0`。
- 本轮 mock provider 只证明链路、观测与导出闭环，不证明真实供应商内容质量。
- B6 降AI教学有效性仍保持 provisional，与本次 trace 修复无关。
- 运行验证 report 的构建指纹为 `777a0fd5e4f5`（功能提交时构建），安装包与 asar bundle 的构建指纹为 `fd88249230a4`（发布文档提交后构建）。功能验证绑定功能实现，封装核验绑定发布产物，不混称为同一构建。

## 6. 回头看

- 双向扫描：生产入口 `PipelinePanel.vue` → 验收 `bodyArtifactOrchestrator.ts`/`stepArtifactAcceptance.ts` → 存储 `runTrace.ts` → 导出 `runTraceExportService.ts` → 验证器两脚本。
- `manifestVersion` 与 `exportSchemaVersion` 已按两个版本域裁决，测试与验证器同步迁移。
- 导出证据从“最新目录”升级为“run.id+status+schema”三重归属断言，消除历史 run 冒充通道。
- 本轮未修改 `D:/codex/玄武规划SKILL/`。

## 7. 遗留

- 本轮无登记缺口；安装包封装与 git 提交见对应收尾记录。
- 收尾边界：asar `extract-file` 会按 basename 把文件解到当前目录，曾覆盖根目录 `package.json`，已通过 `git restore package.json` 恢复；解包产物与临时目录已清理。
