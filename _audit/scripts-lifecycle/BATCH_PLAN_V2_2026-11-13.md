# BATCH PLAN V2 - 2026-11-13 - scripts lifecycle settlement

Only the 76 surviving candidates are in scope. Non-zero external references stay. The deai calibration chain is archived as one closure. decrypt-provider-key helpers remain because npm/live verifiers invoke them. quarantine-only files are moved without content mutation.

alive=94 keep=20 archive=74

## V2 batches

### V2-B01 | action=archive | count=18 | tag=scripts-lifecycle-v2-01-archive-deai
- scripts\analyze-deai-v2-scoring.mjs
- scripts\calibrate-deai-v2-thresholds.mjs
- scripts\generate-deai-directed-positives.mjs
- scripts\generate-deai-v2-candidate-thresholds.mjs
- scripts\harvest-deai-run-traces.mjs
- scripts\index-deai-human-corpus.mjs
- scripts\ingest-deai-raw-novels.mjs
- scripts\lib\deai-calibration-corpus.mjs
- scripts\lib\deai-v2-candidates.mjs
- scripts\map-deai-user-body-exports.mjs
- scripts\probe-deai-raw-novels.mjs
- scripts\tests\deai-calibration-corpus.test.mjs
- scripts\tests\deai-v2.test.mjs
- scripts\tests\deai-v2-candidates.test.mjs
- scripts\verify-deai-body-electron.mjs
- scripts\verify-deai-calibration-release-gate.mjs
- scripts\verify-deai-guidance-ui.mjs
- scripts\verify-deai-settings-source-isolation-ui.mjs

### V2-B02 | action=archive | count=20 | tag=scripts-lifecycle-v2-02-archive-quarantine-a
- scripts\analyze-read-write-budget-trace.mjs
- scripts\build-edit-task-research-digest.mjs
- scripts\diagnose-million-edit-task-trace.mjs
- scripts\research-edit-task-maturity.mjs
- scripts\research-edit-task-maturity-gaps.mjs
- scripts\research-intent-corpus-sources.mjs
- scripts\verify-agent-orchestrator-v3-phase6b-electron.mjs
- scripts\verify-api-direct-write-electron.mjs
- scripts\verify-api-direct-write-real-outline-10r.mjs
- scripts\verify-body-contract-degraded-electron.mjs
- scripts\verify-body-repair-ledger-electron.mjs
- scripts\verify-boundary-live-provider.mjs
- scripts\verify-chain-handoff-execution-v2.mjs
- scripts\verify-chain-single-ownership-e2e.mjs
- scripts\verify-chapter-batch-modes-electron.mjs
- scripts\verify-contract-semantics-electron.mjs
- scripts\verify-dialogue-foundation.mjs
- scripts\verify-dialogue-foundation-stage2.mjs
- scripts\verify-final-draft-electron.mjs
- scripts\verify-folder-resource-injection.mjs

### V2-B03 | action=archive | count=20 | tag=scripts-lifecycle-v2-03-archive-quarantine-b
- scripts\verify-folder-skill-eval.mjs
- scripts\verify-hard-signal-stop-net-electron.mjs
- scripts\verify-intent-routing-electron.mjs
- scripts\verify-long-document-operation-phase7-electron.mjs
- scripts\verify-memory-transaction-electron.mjs
- scripts\verify-model-interference-electron.mjs
- scripts\verify-outline-20261004-live-replay-electron.mjs
- scripts\verify-outline-cocreation-pipeline-smoke.mjs
- scripts\verify-outline-cocreation-stage1.mjs
- scripts\verify-outline-cocreation-stage2.mjs
- scripts\verify-outline-cocreation-stage2-skills.mjs
- scripts\verify-outline-compose-folder-repair-v2.mjs
- scripts\verify-outline-context-scope-electron.mjs
- scripts\verify-outline-deletion-live-smoke-electron.mjs
- scripts\verify-outline-v6-main-ledger-e2e.mjs
- scripts\verify-owner-breakpoint-closure-electron.mjs
- scripts\verify-owner-breakpoint-failure-injection-electron.mjs
- scripts\verify-pipeline-chain-single-ownership.mjs
- scripts\verify-pipeline-folder-chain-single-ownership.mjs
- scripts\verify-pipeline-parallelism-electron.mjs

### V2-B04 | action=archive | count=15 | tag=scripts-lifecycle-v2-04-archive-quarantine-c
- scripts\verify-postprocess-terminal-ui-electron.mjs
- scripts\verify-product-validity-status-e2e.mjs
- scripts\verify-r1-phase0-electron-before.mjs
- scripts\verify-reasoning-only-stall-electron.mjs
- scripts\verify-release-gate-g2-g3-e2e.mjs
- scripts\verify-release-gate-g4-three-entry-e2e.mjs
- scripts\verify-run-trace-audit-electron.mjs
- scripts\verify-run-trace-depth-v2.mjs
- scripts\verify-run-trace-depth-v2-remaining.mjs
- scripts\verify-run-trace-diff-e2e.mjs
- scripts\verify-settings-lock-projection-electron.mjs
- scripts\verify-skill-agent-authority-electron.mjs
- scripts\verify-skill-context-policy-v21-electron.mjs
- scripts\verify-skill-folder-not-found-electron.mjs
- scripts\verify-skill-neutral-execution-electron.mjs

### V2-B05 | action=archive | count=1 | tag=scripts-lifecycle-v2-05-archive-obsolete-e2e
- scripts\verify-api-direct-write-v2-e2e.mjs

## Keep

- scripts\calibrate-intent-routing-thresholds.mjs | external=1 | docs\INTENT_ROUTING_CORPUS_SPEC.md
- scripts\decrypt-provider-key.cjs | external=0 | 
- scripts\decrypt-provider-key-for-live.mjs | external=0 | 
- scripts\evaluate-chain-intent-router.mjs | external=1 | package.json
- scripts\run-intent-adversarial-factory.mjs | external=1 | docs\INTENT_ROUTING_CORPUS_SPEC.md
- scripts\sync-chain-intent-phrase-corpus.cjs | external=1 | package.json
- scripts\verify-api-direct-write-provider-wire-electron.mjs | external=1 | package.json
- scripts\verify-app-confirm-layering.mjs | external=3 | docs\design-fusion-graphite-ink-v1.md; docs\design-fusion-graphite-ink-v2.md; docs\UI璁捐瑙勬牸鍙傝€冧功.md
- scripts\verify-chapter-batch-contract-electron.mjs | external=1 | package.json
- scripts\verify-deai-stage-guidance-electron.mjs | external=1 | src\components\pipeline\__tests__\deai-stage-guidance.integration.spec.ts
- scripts\verify-deai-stage-guidance-live.mjs | external=2 | package.json; src\components\pipeline\__tests__\deai-stage-guidance.integration.spec.ts
- scripts\verify-design-fusion-legacy.mjs | external=3 | docs\design-fusion-graphite-ink-v1.md; docs\design-fusion-graphite-ink-v2.md; docs\UI璁捐瑙勬牸鍙傝€冧功.md
- scripts\verify-intent-corpus-electron.mjs | external=1 | docs\INTENT_ROUTING_CORPUS_SPEC.md
- scripts\verify-intent-embedding-electron.mjs | external=1 | package.json
- scripts\verify-intent-embedding-node.mjs | external=1 | package.json
- scripts\verify-outline-legacy-restore-electron.mjs | external=1 | package.json
- scripts\verify-outline-workspace.mjs | external=1 | docs\OUTLINE_WORKSPACE_AGENT_SKILL_DELIVERY_REPORT_2026-08-30.md
- scripts\verify-packaging.mjs | external=1 | package.json
- scripts\verify-phrase-corpus-sync.cjs | external=1 | package.json
- scripts\verify-pipeline-provider-channel-electron.mjs | external=1 | package.json

## Archive

- scripts\analyze-deai-v2-scoring.mjs | archive-deai-calibration
- scripts\calibrate-deai-v2-thresholds.mjs | archive-deai-calibration
- scripts\generate-deai-directed-positives.mjs | archive-deai-calibration
- scripts\generate-deai-v2-candidate-thresholds.mjs | archive-deai-calibration
- scripts\harvest-deai-run-traces.mjs | archive-deai-calibration
- scripts\index-deai-human-corpus.mjs | archive-deai-calibration
- scripts\ingest-deai-raw-novels.mjs | archive-deai-calibration
- scripts\lib\deai-calibration-corpus.mjs | archive-deai-calibration
- scripts\lib\deai-v2-candidates.mjs | archive-deai-calibration
- scripts\map-deai-user-body-exports.mjs | archive-deai-calibration
- scripts\probe-deai-raw-novels.mjs | archive-deai-calibration
- scripts\tests\deai-calibration-corpus.test.mjs | archive-deai-calibration
- scripts\tests\deai-v2.test.mjs | archive-deai-calibration
- scripts\tests\deai-v2-candidates.test.mjs | archive-deai-calibration
- scripts\verify-deai-body-electron.mjs | archive-deai-calibration
- scripts\verify-deai-calibration-release-gate.mjs | archive-deai-calibration
- scripts\verify-deai-guidance-ui.mjs | archive-deai-calibration
- scripts\verify-deai-settings-source-isolation-ui.mjs | archive-deai-calibration
- scripts\verify-api-direct-write-v2-e2e.mjs | archive-obsolete-e2e
- scripts\analyze-read-write-budget-trace.mjs | archive-quarantine-only
- scripts\build-edit-task-research-digest.mjs | archive-quarantine-only
- scripts\diagnose-million-edit-task-trace.mjs | archive-quarantine-only
- scripts\research-edit-task-maturity.mjs | archive-quarantine-only
- scripts\research-edit-task-maturity-gaps.mjs | archive-quarantine-only
- scripts\research-intent-corpus-sources.mjs | archive-quarantine-only
- scripts\verify-agent-orchestrator-v3-phase6b-electron.mjs | archive-quarantine-only
- scripts\verify-api-direct-write-electron.mjs | archive-quarantine-only
- scripts\verify-api-direct-write-real-outline-10r.mjs | archive-quarantine-only
- scripts\verify-body-contract-degraded-electron.mjs | archive-quarantine-only
- scripts\verify-body-repair-ledger-electron.mjs | archive-quarantine-only
- scripts\verify-boundary-live-provider.mjs | archive-quarantine-only
- scripts\verify-chain-handoff-execution-v2.mjs | archive-quarantine-only
- scripts\verify-chain-single-ownership-e2e.mjs | archive-quarantine-only
- scripts\verify-chapter-batch-modes-electron.mjs | archive-quarantine-only
- scripts\verify-contract-semantics-electron.mjs | archive-quarantine-only
- scripts\verify-dialogue-foundation.mjs | archive-quarantine-only
- scripts\verify-dialogue-foundation-stage2.mjs | archive-quarantine-only
- scripts\verify-final-draft-electron.mjs | archive-quarantine-only
- scripts\verify-folder-resource-injection.mjs | archive-quarantine-only
- scripts\verify-folder-skill-eval.mjs | archive-quarantine-only
- scripts\verify-hard-signal-stop-net-electron.mjs | archive-quarantine-only
- scripts\verify-intent-routing-electron.mjs | archive-quarantine-only
- scripts\verify-long-document-operation-phase7-electron.mjs | archive-quarantine-only
- scripts\verify-memory-transaction-electron.mjs | archive-quarantine-only
- scripts\verify-model-interference-electron.mjs | archive-quarantine-only
- scripts\verify-outline-20261004-live-replay-electron.mjs | archive-quarantine-only
- scripts\verify-outline-cocreation-pipeline-smoke.mjs | archive-quarantine-only
- scripts\verify-outline-cocreation-stage1.mjs | archive-quarantine-only
- scripts\verify-outline-cocreation-stage2.mjs | archive-quarantine-only
- scripts\verify-outline-cocreation-stage2-skills.mjs | archive-quarantine-only
- scripts\verify-outline-compose-folder-repair-v2.mjs | archive-quarantine-only
- scripts\verify-outline-context-scope-electron.mjs | archive-quarantine-only
- scripts\verify-outline-deletion-live-smoke-electron.mjs | archive-quarantine-only
- scripts\verify-outline-v6-main-ledger-e2e.mjs | archive-quarantine-only
- scripts\verify-owner-breakpoint-closure-electron.mjs | archive-quarantine-only
- scripts\verify-owner-breakpoint-failure-injection-electron.mjs | archive-quarantine-only
- scripts\verify-pipeline-chain-single-ownership.mjs | archive-quarantine-only
- scripts\verify-pipeline-folder-chain-single-ownership.mjs | archive-quarantine-only
- scripts\verify-pipeline-parallelism-electron.mjs | archive-quarantine-only
- scripts\verify-postprocess-terminal-ui-electron.mjs | archive-quarantine-only
- scripts\verify-product-validity-status-e2e.mjs | archive-quarantine-only
- scripts\verify-r1-phase0-electron-before.mjs | archive-quarantine-only
- scripts\verify-reasoning-only-stall-electron.mjs | archive-quarantine-only
- scripts\verify-release-gate-g2-g3-e2e.mjs | archive-quarantine-only
- scripts\verify-release-gate-g4-three-entry-e2e.mjs | archive-quarantine-only
- scripts\verify-run-trace-audit-electron.mjs | archive-quarantine-only
- scripts\verify-run-trace-depth-v2.mjs | archive-quarantine-only
- scripts\verify-run-trace-depth-v2-remaining.mjs | archive-quarantine-only
- scripts\verify-run-trace-diff-e2e.mjs | archive-quarantine-only
- scripts\verify-settings-lock-projection-electron.mjs | archive-quarantine-only
- scripts\verify-skill-agent-authority-electron.mjs | archive-quarantine-only
- scripts\verify-skill-context-policy-v21-electron.mjs | archive-quarantine-only
- scripts\verify-skill-folder-not-found-electron.mjs | archive-quarantine-only
- scripts\verify-skill-neutral-execution-electron.mjs | archive-quarantine-only
