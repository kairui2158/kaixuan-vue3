# BATCH PLAN - 2026-11-13 - scripts lifecycle P1

保守规则：任何固定文件名或相对路径在 package.json/src/electron/docs/scripts 中出现（候选闭包外），整文件或整链保留。零引用闭包才进入 P2。D1 tmp 归档。secret-suspicion 只隔离。

inventory=2026-11-13 rows=195
actions: keep=36 quarantine-only=58 retire=95 archive=6

## P2 批次

### B01-RETIRE-ANALYZE-API | action=retire | count=1 | tag=scripts-lifecycle-01-retire
- scripts\analyze-api-direct-write-100-closure.mjs

### B02-RETIRE-ANALYZE-INTENT | action=retire | count=1 | tag=scripts-lifecycle-02-retire
- scripts\analyze-intent-factory-failures.mjs

### B03-RETIRE-ANALYZE-PIPELINE | action=retire | count=1 | tag=scripts-lifecycle-03-retire
- scripts\analyze-pipeline-live-performance.mjs

### B04-RETIRE-AUDIT-DESIGN | action=retire | count=1 | tag=scripts-lifecycle-04-retire
- scripts\audit-design-tokens.mjs

### B05-RETIRE-AUDIT-INTENT | action=retire | count=1 | tag=scripts-lifecycle-05-retire
- scripts\audit-intent-factory-stop.mjs

### B06-RETIRE-AUDIT-PHRASE | action=retire | count=1 | tag=scripts-lifecycle-06-retire
- scripts\audit-phrase-corpus-saturation.cjs

### B07-RETIRE-BENCHMARK-EDITOR | action=retire | count=1 | tag=scripts-lifecycle-07-retire
- scripts\benchmark-editor-long-document.mjs

### B08-RETIRE-BENCHMARK-LONG | action=retire | count=1 | tag=scripts-lifecycle-08-retire
- scripts\benchmark-long-document-local-transform.mjs

### B09-RETIRE-BENCHMARK-OUTLINE | action=retire | count=1 | tag=scripts-lifecycle-09-retire
- scripts\benchmark-outline-editor-v6-baseline.mjs

### B10-RETIRE-CLEANUP-API | action=retire | count=1 | tag=scripts-lifecycle-10-retire
- scripts\cleanup-api-direct-write-user-data.ps1

### B11-RETIRE-CLEANUP-DIST | action=retire | count=2 | tag=scripts-lifecycle-11-retire
- scripts\cleanup-dist-3-102-0.mjs
- scripts\cleanup-dist-3-103-0.mjs

### B12-RETIRE-CLEANUP-RELEASE | action=retire | count=1 | tag=scripts-lifecycle-12-retire
- scripts\cleanup-release-artifacts.ps1

### B13-RETIRE-CLEANUP-VERIFICATION | action=retire | count=1 | tag=scripts-lifecycle-13-retire
- scripts\cleanup-verification-artifacts.mjs

### B14-RETIRE-DEBUG-OUTLINE | action=retire | count=1 | tag=scripts-lifecycle-14-retire
- scripts\debug-outline-state.mjs

### B15-RETIRE-DESIGN-FUSION | action=retire | count=1 | tag=scripts-lifecycle-15-retire
- scripts\design-fusion-cleanup.mjs

### B16-RETIRE-DIAGNOSE-ELECTRON | action=retire | count=1 | tag=scripts-lifecycle-16-retire
- scripts\diagnose-electron-provider-fetch.mjs

### B17-RETIRE-DIAGNOSE-PROVIDER | action=retire | count=1 | tag=scripts-lifecycle-17-retire
- scripts\diagnose-provider-tool-stream.mjs

### B18-RETIRE-DIAGNOSE-SAFESTORAGE | action=retire | count=1 | tag=scripts-lifecycle-18-retire
- scripts\diagnose-safestorage-electron.cjs

### B19-RETIRE-EXTRACT-LONG | action=retire | count=1 | tag=scripts-lifecycle-19-retire
- scripts\extract-long-document-efficiency-baseline.mjs

### B20-RETIRE-EXTRACT-PHRASE | action=retire | count=1 | tag=scripts-lifecycle-20-retire
- scripts\extract-phrase-corpus-fifth-round.cjs

### B21-RETIRE-INSPECT-PARALLELISM | action=retire | count=1 | tag=scripts-lifecycle-21-retire
- scripts\inspect-parallelism-live-app.mjs

### B22-RETIRE-MEASURE-EDITOR | action=retire | count=1 | tag=scripts-lifecycle-22-retire
- scripts\measure-editor-perf-ledger.mjs

### B23-RETIRE-PROBE-CHAPTER | action=retire | count=1 | tag=scripts-lifecycle-23-retire
- scripts\probe-chapter-tree-overflow.mjs

### B24-RETIRE-PROBE-PROVIDER | action=retire | count=1 | tag=scripts-lifecycle-24-retire
- scripts\probe-provider-net-stream-electron.mjs

### B25-RETIRE-REPRODUCE-LIVE | action=retire | count=1 | tag=scripts-lifecycle-25-retire
- scripts\reproduce-live-v3-step5-stall.mjs

### B26-RETIRE-RESEARCH-API | action=retire | count=1 | tag=scripts-lifecycle-26-retire
- scripts\research-api-direct-write-100-closure.mjs

### B27-RETIRE-RESEARCH-EDITOR | action=retire | count=3 | tag=scripts-lifecycle-27-retire
- scripts\research-editor-base-alignment.mjs
- scripts\research-editor-followup-features.mjs
- scripts\research-editor-full-product.mjs

### B28-RETIRE-RESEARCH-INTENT | action=retire | count=1 | tag=scripts-lifecycle-28-retire
- scripts\research-intent-semantic-routing.mjs

### B29-RETIRE-SKILL-SCRIPT | action=retire | count=1 | tag=scripts-lifecycle-29-retire
- scripts\tests\skill-script-worker.spec.cjs

### B30-RETIRE-VALIDATE-FOLDER | action=retire | count=1 | tag=scripts-lifecycle-30-retire
- scripts\validate-folder-skill.cjs

### B31-RETIRE-VERIFY-AGENT | action=retire | count=2 | tag=scripts-lifecycle-31-retire
- scripts\verify-agent-state-electron.mjs
- scripts\verify-agent-tool-surface-electron.mjs

### B32-RETIRE-VERIFY-API | action=retire | count=5 | tag=scripts-lifecycle-32-retire
- scripts\verify-api-direct-write-live-v3.mjs
- scripts\verify-api-direct-write-long-document-loop.mjs
- scripts\verify-api-direct-write-provider-matrix.mjs
- scripts\verify-api-direct-write-user-visible-v3.mjs
- scripts\verify-api-live-status-electron.mjs

### B33-RETIRE-VERIFY-BODY | action=retire | count=2 | tag=scripts-lifecycle-33-retire
- scripts\verify-body-bare-not-ready-targeted-electron.mjs
- scripts\verify-body-contract-degraded-replay.mjs

### B34-RETIRE-VERIFY-CHAPTER | action=retire | count=3 | tag=scripts-lifecycle-34-retire
- scripts\verify-chapter-batch-contract-replay.mjs
- scripts\verify-chapter-context-contract-replay.mjs
- scripts\verify-chapter-live-export.mjs

### B35-RETIRE-VERIFY-COMPONENT | action=retire | count=1 | tag=scripts-lifecycle-35-retire
- scripts\verify-component-lifecycle-electron.mjs

### B36-RETIRE-VERIFY-DATA | action=retire | count=1 | tag=scripts-lifecycle-36-retire
- scripts\verify-data-migration-c-to-d.mjs

### B37-RETIRE-VERIFY-DESIGN | action=retire | count=2 | tag=scripts-lifecycle-37-retire
- scripts\verify-design-fusion-responsive-overflow.mjs
- scripts\verify-design-fusion-visual-matrix.mjs

### B38-RETIRE-VERIFY-DIRECT | action=retire | count=1 | tag=scripts-lifecycle-38-retire
- scripts\verify-direct-write-negative-paths-electron.mjs

### B39-RETIRE-VERIFY-EDITOR | action=retire | count=11 | tag=scripts-lifecycle-39-retire
- scripts\verify-editor-bookmarks-electron.mjs
- scripts\verify-editor-context-pipeline-electron.mjs
- scripts\verify-editor-diff-electron.mjs
- scripts\verify-editor-folding-electron.mjs
- scripts\verify-editor-multi-cursor-electron.mjs
- scripts\verify-editor-outline-electron.mjs
- scripts\verify-editor-replace-electron.mjs
- scripts\verify-editor-search-highlight-electron.mjs
- scripts\verify-editor-selection-restore-electron.mjs
- scripts\verify-editor-undo-electron.mjs
- scripts\verify-editor-virtualization-electron.mjs

### B40-RETIRE-VERIFY-INSTALLER | action=retire | count=3 | tag=scripts-lifecycle-40-retire
- scripts\verify-installer-3-42-2-direct-write.mjs
- scripts\verify-installer-3-42-2-smoke.mjs
- scripts\verify-installer-3-44-0-smoke.mjs

### B41-RETIRE-VERIFY-LIVE | action=retire | count=1 | tag=scripts-lifecycle-41-retire
- scripts\verify-live-api-status-electron.mjs

### B42-RETIRE-VERIFY-LONG | action=retire | count=2 | tag=scripts-lifecycle-42-retire
- scripts\verify-long-document-local-transform-electron.mjs
- scripts\verify-long-document-restructure-phase6-electron.mjs

### B43-RETIRE-VERIFY-OUTLINE | action=retire | count=16 | tag=scripts-lifecycle-43-retire
- scripts\verify-outline-deletion-confirmation-electron.mjs
- scripts\verify-outline-deletion-live-replay-electron.mjs
- scripts\verify-outline-export-ui-regression.mjs
- scripts\verify-outline-input-gate-e2e.mjs
- scripts\verify-outline-lock-override-live-replay.mjs
- scripts\verify-outline-message-scroll-ui-regression.mjs
- scripts\verify-outline-silent-wait-fix-e2e.mjs
- scripts\verify-outline-v6-phase-d-recovery-e2e.mjs
- scripts\verify-outline-v6-phase2-e2e.mjs
- scripts\verify-outline-v6-phase3-e2e.mjs
- scripts\verify-outline-v6-phase3-live-e2e.mjs
- scripts\verify-outline-v6-phase4-e2e.mjs
- scripts\verify-outline-v6-phase5-combos-e2e.mjs
- scripts\verify-outline-virtualization-electron.mjs
- scripts\verify-outline-workspace-error-path.mjs
- scripts\verify-outline-workspace-ui.mjs

### B44-RETIRE-VERIFY-PIPELINE | action=retire | count=6 | tag=scripts-lifecycle-44-retire
- scripts\verify-pipeline-artifact-contracts-electron.mjs
- scripts\verify-pipeline-artifact-contracts-replay.mjs
- scripts\verify-pipeline-repair-feedback-electron.mjs
- scripts\verify-pipeline-repair-feedback-replay.fixture.json
- scripts\verify-pipeline-repair-feedback-replay.mjs
- scripts\verify-pipeline-timing-ledger-electron.mjs

### B45-RETIRE-VERIFY-RUN | action=retire | count=2 | tag=scripts-lifecycle-45-retire
- scripts\verify-run-trace-audit.mjs
- scripts\verify-run-trace-diff-electron.mjs

### B46-RETIRE-VERIFY-SETTINGS | action=retire | count=1 | tag=scripts-lifecycle-46-retire
- scripts\verify-settings-skill-page-e2e.mjs

### B47-RETIRE-VERIFY-SINGLE | action=retire | count=1 | tag=scripts-lifecycle-47-retire
- scripts\verify-single-pass-live-replay.mjs

### B48-RETIRE-VERIFY-SKILL | action=retire | count=1 | tag=scripts-lifecycle-48-retire
- scripts\verify-skill-agent-authority-legacy-traces.mjs

### B49-RETIRE-VERIFY-VOLUME | action=retire | count=1 | tag=scripts-lifecycle-49-retire
- scripts\verify-volume-trace-six-defects-e2e.mjs

### B50-ARCHIVE-CHAIN | action=archive | count=4 | tag=scripts-lifecycle-50-archive-chain
- scripts\style-profile-p0-budget-account.entry.mjs
- scripts\style-profile-p0-budget-account.mjs
- scripts\style-profile-p0-ts-loader.mjs
- scripts\verify-style-profile-electron.mjs

### B51-ARCHIVE-TMP | action=archive | count=2 | tag=scripts-lifecycle-archive-tmp
- scripts\tmp\redundancy-audit.mjs
- scripts\tmp\verify-chapter-batch-ui-electron.mjs

## 保留与隔离

- scripts\analyze-deai-v2-scoring.mjs | keep | external=0;internal=0 | 
- scripts\analyze-read-write-budget-trace.mjs | quarantine-only | external=0;internal=0 | 
- scripts\build-edit-task-research-digest.mjs | quarantine-only | external=0;internal=0 | 
- scripts\calibrate-deai-v2-thresholds.mjs | keep | external=0;internal=2 | scripts\verify-deai-calibration-release-gate.mjs; scripts\verify-deai-calibration-release-gate.mjs
- scripts\calibrate-intent-routing-thresholds.mjs | keep | external=2;internal=0 | docs\INTENT_ROUTING_CORPUS_SPEC.md; docs\INTENT_ROUTING_CORPUS_SPEC.md
- scripts\decrypt-provider-key-for-live.mjs | keep | external=0;internal=1 | scripts\verify-deai-stage-guidance-live.mjs
- scripts\decrypt-provider-key.cjs | keep | external=0;internal=3 | scripts\verify-body-bare-not-ready-targeted-electron.mjs; scripts\verify-pipeline-parallelism-electron.mjs; scripts\verify-pipeline-provider-channel-electron.mjs
- scripts\diagnose-million-edit-task-trace.mjs | quarantine-only | external=0;internal=0 | 
- scripts\evaluate-chain-intent-router.mjs | keep | external=2;internal=0 | package.json; package.json
- scripts\generate-deai-directed-positives.mjs | keep | external=0;internal=0 | 
- scripts\generate-deai-v2-candidate-thresholds.mjs | keep | external=0;internal=0 | 
- scripts\harvest-deai-run-traces.mjs | keep | external=0;internal=0 | 
- scripts\index-deai-human-corpus.mjs | keep | external=0;internal=0 | 
- scripts\ingest-deai-raw-novels.mjs | keep | external=0;internal=0 | 
- scripts\lib\deai-calibration-corpus.mjs | keep | external=0;internal=2 | scripts\generate-deai-v2-candidate-thresholds.mjs; scripts\tests\deai-calibration-corpus.test.mjs
- scripts\lib\deai-v2-candidates.mjs | keep | external=0;internal=2 | scripts\generate-deai-v2-candidate-thresholds.mjs; scripts\tests\deai-v2-candidates.test.mjs
- scripts\map-deai-user-body-exports.mjs | keep | external=0;internal=0 | 
- scripts\probe-deai-raw-novels.mjs | keep | external=0;internal=0 | 
- scripts\research-edit-task-maturity-gaps.mjs | quarantine-only | external=0;internal=0 | 
- scripts\research-edit-task-maturity.mjs | quarantine-only | external=0;internal=0 | 
- scripts\research-intent-corpus-sources.mjs | quarantine-only | external=0;internal=0 | 
- scripts\run-intent-adversarial-factory.mjs | keep | external=2;internal=0 | docs\INTENT_ROUTING_CORPUS_SPEC.md; docs\INTENT_ROUTING_CORPUS_SPEC.md
- scripts\sync-chain-intent-phrase-corpus.cjs | keep | external=2;internal=0 | package.json; package.json
- scripts\tests\deai-calibration-corpus.test.mjs | keep | external=0;internal=0 | 
- scripts\tests\deai-v2-candidates.test.mjs | keep | external=0;internal=0 | 
- scripts\tests\deai-v2.test.mjs | keep | external=0;internal=0 | 
- scripts\verify-agent-orchestrator-v3-phase6b-electron.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-api-direct-write-electron.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-api-direct-write-provider-wire-electron.mjs | quarantine-only | external=2;internal=0 | package.json; package.json
- scripts\verify-api-direct-write-real-outline-10r.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-api-direct-write-v2-e2e.mjs | keep | external=0;internal=2 | scripts\verify-installer-3-42-2-direct-write.mjs; scripts\verify-installer-3-42-2-direct-write.mjs
- scripts\verify-app-confirm-layering.mjs | keep | external=6;internal=0 | docs\design-fusion-graphite-ink-v1.md; docs\design-fusion-graphite-ink-v2.md; docs\UI设计规格参考书.md; docs\UI设计规格参考书.md
- scripts\verify-body-contract-degraded-electron.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-body-repair-ledger-electron.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-boundary-live-provider.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-chain-handoff-execution-v2.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-chain-single-ownership-e2e.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-chapter-batch-contract-electron.mjs | keep | external=2;internal=0 | package.json; package.json
- scripts\verify-chapter-batch-modes-electron.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-contract-semantics-electron.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-deai-body-electron.mjs | keep | external=0;internal=0 | 
- scripts\verify-deai-calibration-release-gate.mjs | keep | external=0;internal=0 | 
- scripts\verify-deai-guidance-ui.mjs | keep | external=0;internal=0 | 
- scripts\verify-deai-settings-source-isolation-ui.mjs | keep | external=0;internal=0 | 
- scripts\verify-deai-stage-guidance-electron.mjs | keep | external=2;internal=0 | src\components\pipeline\__tests__\deai-stage-guidance.integration.spec.ts; src\components\pipeline\__tests__\deai-stage-guidance.integration.spec.ts
- scripts\verify-deai-stage-guidance-live.mjs | keep | external=4;internal=0 | package.json; src\components\pipeline\__tests__\deai-stage-guidance.integration.spec.ts; package.json; src\components\pipeline\__tests__\deai-stage-guidance.integration.spec.ts
- scripts\verify-design-fusion-legacy.mjs | keep | external=6;internal=0 | docs\design-fusion-graphite-ink-v2.md; docs\UI设计规格参考书.md; docs\design-fusion-graphite-ink-v1.md; docs\design-fusion-graphite-ink-v1.md
- scripts\verify-dialogue-foundation-stage2.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-dialogue-foundation.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-final-draft-electron.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-folder-resource-injection.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-folder-skill-eval.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-hard-signal-stop-net-electron.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-intent-corpus-electron.mjs | quarantine-only | external=2;internal=0 | docs\INTENT_ROUTING_CORPUS_SPEC.md; docs\INTENT_ROUTING_CORPUS_SPEC.md
- scripts\verify-intent-embedding-electron.mjs | keep | external=2;internal=0 | package.json; package.json
- scripts\verify-intent-embedding-node.mjs | keep | external=2;internal=0 | package.json; package.json
- scripts\verify-intent-routing-electron.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-long-document-operation-phase7-electron.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-memory-transaction-electron.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-model-interference-electron.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-outline-20261004-live-replay-electron.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-outline-cocreation-pipeline-smoke.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-outline-cocreation-stage1.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-outline-cocreation-stage2-skills.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-outline-cocreation-stage2.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-outline-compose-folder-repair-v2.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-outline-context-scope-electron.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-outline-deletion-live-smoke-electron.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-outline-legacy-restore-electron.mjs | keep | external=2;internal=0 | package.json; package.json
- scripts\verify-outline-v6-main-ledger-e2e.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-outline-workspace.mjs | keep | external=2;internal=0 | docs\OUTLINE_WORKSPACE_AGENT_SKILL_DELIVERY_REPORT_2026-08-30.md; docs\OUTLINE_WORKSPACE_AGENT_SKILL_DELIVERY_REPORT_2026-08-30.md
- scripts\verify-owner-breakpoint-closure-electron.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-owner-breakpoint-failure-injection-electron.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-packaging.mjs | keep | external=2;internal=0 | package.json; package.json
- scripts\verify-phrase-corpus-sync.cjs | keep | external=2;internal=0 | package.json; package.json
- scripts\verify-pipeline-chain-single-ownership.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-pipeline-folder-chain-single-ownership.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-pipeline-parallelism-electron.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-pipeline-provider-channel-electron.mjs | quarantine-only | external=2;internal=0 | package.json; package.json
- scripts\verify-postprocess-terminal-ui-electron.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-product-validity-status-e2e.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-r1-phase0-electron-before.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-reasoning-only-stall-electron.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-release-gate-g2-g3-e2e.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-release-gate-g4-three-entry-e2e.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-run-trace-audit-electron.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-run-trace-depth-v2-remaining.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-run-trace-depth-v2.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-run-trace-diff-e2e.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-settings-lock-projection-electron.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-skill-agent-authority-electron.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-skill-context-policy-v21-electron.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-skill-folder-not-found-electron.mjs | quarantine-only | external=0;internal=0 | 
- scripts\verify-skill-neutral-execution-electron.mjs | quarantine-only | external=0;internal=0 | 

## 归档/退役

- scripts\analyze-api-direct-write-100-closure.mjs | retire | external=0;internal=0
- scripts\analyze-intent-factory-failures.mjs | retire | external=0;internal=0
- scripts\analyze-pipeline-live-performance.mjs | retire | external=0;internal=0
- scripts\audit-design-tokens.mjs | retire | external=0;internal=0
- scripts\audit-intent-factory-stop.mjs | retire | external=0;internal=0
- scripts\audit-phrase-corpus-saturation.cjs | retire | external=0;internal=0
- scripts\benchmark-editor-long-document.mjs | retire | external=0;internal=0
- scripts\benchmark-long-document-local-transform.mjs | retire | external=0;internal=0
- scripts\benchmark-outline-editor-v6-baseline.mjs | retire | external=0;internal=0
- scripts\cleanup-api-direct-write-user-data.ps1 | retire | external=0;internal=0
- scripts\cleanup-dist-3-102-0.mjs | retire | external=0;internal=0
- scripts\cleanup-dist-3-103-0.mjs | retire | external=0;internal=0
- scripts\cleanup-release-artifacts.ps1 | retire | external=0;internal=0
- scripts\cleanup-verification-artifacts.mjs | retire | external=0;internal=0
- scripts\debug-outline-state.mjs | retire | external=0;internal=0
- scripts\design-fusion-cleanup.mjs | retire | external=0;internal=0
- scripts\diagnose-electron-provider-fetch.mjs | retire | external=0;internal=0
- scripts\diagnose-provider-tool-stream.mjs | retire | external=0;internal=0
- scripts\diagnose-safestorage-electron.cjs | retire | external=0;internal=0
- scripts\extract-long-document-efficiency-baseline.mjs | retire | external=0;internal=0
- scripts\extract-phrase-corpus-fifth-round.cjs | retire | external=0;internal=0
- scripts\inspect-parallelism-live-app.mjs | retire | external=0;internal=0
- scripts\measure-editor-perf-ledger.mjs | retire | external=0;internal=0
- scripts\probe-chapter-tree-overflow.mjs | retire | external=0;internal=0
- scripts\probe-provider-net-stream-electron.mjs | retire | external=0;internal=0
- scripts\reproduce-live-v3-step5-stall.mjs | retire | external=0;internal=0
- scripts\research-api-direct-write-100-closure.mjs | retire | external=0;internal=0
- scripts\research-editor-base-alignment.mjs | retire | external=0;internal=0
- scripts\research-editor-followup-features.mjs | retire | external=0;internal=0
- scripts\research-editor-full-product.mjs | retire | external=0;internal=0
- scripts\research-intent-semantic-routing.mjs | retire | external=0;internal=0
- scripts\style-profile-p0-budget-account.entry.mjs | archive | external=0;internal=0
- scripts\style-profile-p0-budget-account.mjs | archive | external=0;internal=1
- scripts\style-profile-p0-ts-loader.mjs | archive | external=0;internal=1
- scripts\tests\skill-script-worker.spec.cjs | retire | external=0;internal=0
- scripts\tmp\redundancy-audit.mjs | archive | external=0;internal=0
- scripts\tmp\verify-chapter-batch-ui-electron.mjs | archive | external=0;internal=0
- scripts\validate-folder-skill.cjs | retire | external=0;internal=0
- scripts\verify-agent-state-electron.mjs | retire | external=0;internal=0
- scripts\verify-agent-tool-surface-electron.mjs | retire | external=0;internal=0
- scripts\verify-api-direct-write-live-v3.mjs | retire | external=0;internal=0
- scripts\verify-api-direct-write-long-document-loop.mjs | retire | external=0;internal=0
- scripts\verify-api-direct-write-provider-matrix.mjs | retire | external=0;internal=0
- scripts\verify-api-direct-write-user-visible-v3.mjs | retire | external=0;internal=0
- scripts\verify-api-live-status-electron.mjs | retire | external=0;internal=0
- scripts\verify-body-bare-not-ready-targeted-electron.mjs | retire | external=0;internal=0
- scripts\verify-body-contract-degraded-replay.mjs | retire | external=0;internal=0
- scripts\verify-chapter-batch-contract-replay.mjs | retire | external=0;internal=0
- scripts\verify-chapter-context-contract-replay.mjs | retire | external=0;internal=0
- scripts\verify-chapter-live-export.mjs | retire | external=0;internal=0
- scripts\verify-component-lifecycle-electron.mjs | retire | external=0;internal=0
- scripts\verify-data-migration-c-to-d.mjs | retire | external=0;internal=0
- scripts\verify-design-fusion-responsive-overflow.mjs | retire | external=0;internal=0
- scripts\verify-design-fusion-visual-matrix.mjs | retire | external=0;internal=0
- scripts\verify-direct-write-negative-paths-electron.mjs | retire | external=0;internal=0
- scripts\verify-editor-bookmarks-electron.mjs | retire | external=0;internal=0
- scripts\verify-editor-context-pipeline-electron.mjs | retire | external=0;internal=0
- scripts\verify-editor-diff-electron.mjs | retire | external=0;internal=0
- scripts\verify-editor-folding-electron.mjs | retire | external=0;internal=0
- scripts\verify-editor-multi-cursor-electron.mjs | retire | external=0;internal=0
- scripts\verify-editor-outline-electron.mjs | retire | external=0;internal=0
- scripts\verify-editor-replace-electron.mjs | retire | external=0;internal=0
- scripts\verify-editor-search-highlight-electron.mjs | retire | external=0;internal=0
- scripts\verify-editor-selection-restore-electron.mjs | retire | external=0;internal=0
- scripts\verify-editor-undo-electron.mjs | retire | external=0;internal=0
- scripts\verify-editor-virtualization-electron.mjs | retire | external=0;internal=0
- scripts\verify-installer-3-42-2-direct-write.mjs | retire | external=0;internal=0
- scripts\verify-installer-3-42-2-smoke.mjs | retire | external=0;internal=0
- scripts\verify-installer-3-44-0-smoke.mjs | retire | external=0;internal=0
- scripts\verify-live-api-status-electron.mjs | retire | external=0;internal=0
- scripts\verify-long-document-local-transform-electron.mjs | retire | external=0;internal=0
- scripts\verify-long-document-restructure-phase6-electron.mjs | retire | external=0;internal=0
- scripts\verify-outline-deletion-confirmation-electron.mjs | retire | external=0;internal=0
- scripts\verify-outline-deletion-live-replay-electron.mjs | retire | external=0;internal=0
- scripts\verify-outline-export-ui-regression.mjs | retire | external=0;internal=0
- scripts\verify-outline-input-gate-e2e.mjs | retire | external=0;internal=0
- scripts\verify-outline-lock-override-live-replay.mjs | retire | external=0;internal=0
- scripts\verify-outline-message-scroll-ui-regression.mjs | retire | external=0;internal=0
- scripts\verify-outline-silent-wait-fix-e2e.mjs | retire | external=0;internal=0
- scripts\verify-outline-v6-phase-d-recovery-e2e.mjs | retire | external=0;internal=0
- scripts\verify-outline-v6-phase2-e2e.mjs | retire | external=0;internal=0
- scripts\verify-outline-v6-phase3-e2e.mjs | retire | external=0;internal=0
- scripts\verify-outline-v6-phase3-live-e2e.mjs | retire | external=0;internal=0
- scripts\verify-outline-v6-phase4-e2e.mjs | retire | external=0;internal=0
- scripts\verify-outline-v6-phase5-combos-e2e.mjs | retire | external=0;internal=0
- scripts\verify-outline-virtualization-electron.mjs | retire | external=0;internal=0
- scripts\verify-outline-workspace-error-path.mjs | retire | external=0;internal=0
- scripts\verify-outline-workspace-ui.mjs | retire | external=0;internal=0
- scripts\verify-pipeline-artifact-contracts-electron.mjs | retire | external=0;internal=0
- scripts\verify-pipeline-artifact-contracts-replay.mjs | retire | external=0;internal=0
- scripts\verify-pipeline-repair-feedback-electron.mjs | retire | external=0;internal=0
- scripts\verify-pipeline-repair-feedback-replay.fixture.json | retire | external=0;internal=0
- scripts\verify-pipeline-repair-feedback-replay.mjs | retire | external=0;internal=0
- scripts\verify-pipeline-timing-ledger-electron.mjs | retire | external=0;internal=0
- scripts\verify-run-trace-audit.mjs | retire | external=0;internal=0
- scripts\verify-run-trace-diff-electron.mjs | retire | external=0;internal=0
- scripts\verify-settings-skill-page-e2e.mjs | retire | external=0;internal=0
- scripts\verify-single-pass-live-replay.mjs | retire | external=0;internal=0
- scripts\verify-skill-agent-authority-legacy-traces.mjs | retire | external=0;internal=0
- scripts\verify-style-profile-electron.mjs | archive | external=0;internal=0
- scripts\verify-volume-trace-six-defects-e2e.mjs | retire | external=0;internal=0
