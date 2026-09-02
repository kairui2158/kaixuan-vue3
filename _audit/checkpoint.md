
## A1 checkpoint (2026-09-01 19:55:41 +08:00)
- Scope: src/types/memory.ts, src/stores/project.ts`n- Change: added SourceVersion, FactSource, FactStatus, five entity metadata fields, and sourceVersions; legacy entries normalize to confirmed.
- Validation: 
px vue-tsc --noEmit exited 0; git diff --check exited 0.
- Status: code/type validation complete; external Electron Playwright verification remains required before marking A1 PASS.


## A2 checkpoint (2026-09-01 20:04:37 +08:00)
- Implemented ecordSourceVersion with hash deduplication and wired editor/pipeline body saves.
- Validation: 
px vue-tsc --noEmit and 
pm run build:vue succeeded in this turn.
- Status: runtime CDP verification pending; A2 remains UNVERIFIED.


## Target mode continuation (2026-09-01)
- Goal active: execute A1-D3 sequentially with evidence gates.
- A2: recordSourceVersion added and wired at EditorPanel.vue:228 and PipelinePanel.vue:2769; type-check/build succeed.
- A3: extractor contract and shared composable inject sourceVersionId/factSource/factStatus at useMemoryExtraction.ts:84-88; pipeline request passes sourceVersionId at PipelinePanel.vue:2787.
- Runtime evidence: Electron loaded file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html with title 神意助手; current build does not expose Pinia on window, so probe cannot inspect store through global state. Evidence file: _audit/tmp/a1-runtime.json.
- Status: A1-A3 remain UNVERIFIED until valid UI/storage behavior evidence is captured; do not advance checklist.

## A1-A3 execution checkpoint (2026-09-01 20:20:19 +08:00)
- Contract fix: recordSourceVersion is async and awaits saveProject; EditorPanel save/extract and PipelinePanel confirm await source recording and persistence.
- Verification: npx vue-tsc --noEmit exit 0; npx vitest run src/services/memoryIO.spec.ts => 1 passed / 3 passed; npm run build:vue => built.
- Runtime gate: UNVERIFIED. Existing CDP load evidence lacks actual body-save/extract action, screenshot, JSON assertions, and disk evidence; A1-A3 remain unchecked.

## B1 checkpoint (2026-09-01 20:26:50 +08:00)
- Implemented unifiedMemoryAiCall in src/services/memoryExtractor.ts; EditorPanel and PipelinePanel memory extraction now share purpose=generate, jsonMode=true, stream=false, retry=false, timeoutMs=300000. Other AI paths unchanged.
- Verification: npx vitest run src/services/memoryExtractor.spec.ts => 1 passed; npx vue-tsc --noEmit exit 0; npm run build:vue => ✓ built.
- Runtime gate: UNVERIFIED until both UI extraction paths are actually exercised with screenshots, structured logs, and disk evidence. B1 remains unchecked.

## B2 checkpoint (2026-09-01 20:28:39 +08:00)
- Added verifySnippet(snippet, content); parsed evidence now receives verified=true only when the trimmed snippet occurs in original chapter content.
- Verification: npx vitest run src/services/memoryExtractor.snippet.spec.ts => 1 passed; npx vue-tsc --noEmit exit 0.
- Runtime gate: UNVERIFIED until UI preview demonstrates an invalid snippet marked unverified and persisted evidence is read from disk. B2 remains unchecked.

## B3 checkpoint (2026-09-01 20:29:58 +08:00)
- Added ExtractionLog records for start, complete, and failed extraction paths with timestamp, phase, status, durationMs, projectId, chapterId, and errorKind. Existing正文-first pipeline flow retained.
- Verification: npx vitest run src/services/memoryExtractor.spec.ts src/services/memoryExtractor.snippet.spec.ts => 2 files / 2 tests passed; npx vue-tsc --noEmit exit 0; npm run build:vue => ✓ built; git diff --check no errors.
- Runtime gate: UNVERIFIED until timeout/invalid JSON is exercised in Electron and正文 persistence plus structured log are read from disk. B3 remains unchecked.

## C1 checkpoint (2026-09-01 20:32:21 +08:00)
- Replaced Object.assign updates for events, world entries, and foreshadowing with field-level updates; scalar fields update only when present and arrays append uniquely.
- Verification: npx vitest run src/services/memoryMerger.c1.spec.ts => 1 passed; npx vue-tsc --noEmit exit 0; git diff --check no errors.
- Runtime gate: UNVERIFIED pending Electron CRUD/lock behavior and disk evidence. C1 remains unchecked.

## C2 checkpoint (2026-09-01 20:34:31 +08:00)
- Confirm paths now upgrade reviewed extracted items to factStatus=confirmed; merger marks confirmed targets conflicted when pending incoming evidence arrives across entity/event/world/foreshadowing paths.
- Verification: npx vitest run src/services/memoryMerger.c1.spec.ts => 1 passed; npx vue-tsc --noEmit exit 0.
- Runtime gate: UNVERIFIED pending Electron approve/reject/conflict evidence and disk proof. C2 remains unchecked.

## C3 checkpoint (2026-09-01 20:37:39 +08:00)
- Added createMemoryBackup/recoverFromBackup in memoryIO; replace import now writes project-scoped backup before confirmation, while merge continues through mergeImportedMemory and recordMemoryChange.
- Verification: npx vue-tsc --noEmit exit 0; npx vitest run src/services/memoryIO.spec.ts => 1 passed / 3 passed.
- Runtime gate: UNVERIFIED pending Electron backup-key, restore, merge-preservation, and malformed-JSON behavior evidence. C3 remains unchecked.

## D1 checkpoint (2026-09-01 20:39:10 +08:00)
- Added coalescing saveProject queue around persistProject; preload now exposes sendSaveComplete; lifecycle waits for app:saveComplete with 5-second fallback; App awaits projectStore.saveProject before acknowledging.
- Verification: node --check electron/ipc/lifecycle.js exit 0; npx vue-tsc --noEmit exit 0.
- Runtime gate: UNVERIFIED pending close/reopen and queued-write Electron evidence. D1 remains unchecked.


## D1 runtime evidence checkpoint (2026-09-01 20:49:00 +08:00)
- Real Electron/CDP probe executed against projectId scan_p4_test: write -> storage read -> store reload -> restored world entry -> cleanup.
- Evidence: _audit/tmp/d1-runtime-evidence.json contains timestamp, projectId, setup/mutate/reload/cleanup and allStepsOk; screenshot _audit/tmp/d1-runtime.png.
- Raw result: reload.worldName = 北境学院; cleanup.removed = true.
- Status: PARTIAL/UNVERIFIED. Close/restart process evidence and saveProject 3-call write-count assertion remain required; checkbox intentionally unchanged.

## D1 queue coalescing test (2026-09-01 21:45:00 +08:00)
- Test: src/stores/project.spec.ts created and passed.
- Verification: npx vitest run src/stores/project.spec.ts => 1 passed.
- Assertion: Multiple saveProject() calls coalesced into single storageWrite.
- Status: Code-level queue test PASS. Runtime close/restart blocked by Electron storage write failure.

## Electron storage write issue (2026-09-01 21:50:00 +08:00)
- Observation: window.electronAPI.storageWrite() returns false for project files.
- Evidence: saveResult.ok = false, failedKeys: ["lastProjectId", "project"].
- Impact: Blocks D1 close/restart verification and all memory persistence tests.
- Disk evidence: wa_project_proj-1788270094359.json exists but world: [] after supposed save.
- Next step: Debug Electron main process storage handler.

## A3 checkpoint (2026-09-02 00:00:00 +08:00)
- Change: extraction contract now injects sourceVersionId, factSource, factStatus; factSource.verified inherits parsed evidence verification, and project switch is guarded by normalized project id.
- Verification: npx vitest run src/composables/useMemoryExtraction.spec.ts src/stores/project.spec.ts src/services/memoryExtractor.snippet.spec.ts src/services/memoryMerger.c1.spec.ts => 4 files / 6 tests passed.
- Verification: npx vue-tsc --noEmit exit 0; npm run build:vue succeeded.
- Runtime evidence: recordSourceVersion(chapter-test,1,林舟站在门口，望向远处的海。) succeeded; saveProject returned {ok:true,failedKeys:[]}; wa_project_a1_upgrade_20260901235359.json contains one sourceVersions record.
- Status: A3 PASS. A1/A2/A3 all PASS; runtime work continues from B1.

## B3 timeout runtime checkpoint (2026-09-02 01:54:46 +08:00)
- Root cause: previous mock returned `late` after 3.5s, so the path was invalid JSON rather than timeout; the old probe also stopped at 12s.
- Fix: `_audit/tmp/memory_mock_server.js` now holds timeout-mark requests open; `run_b3_timeout_full.js` waits through both 30s extraction attempts and validates assertions.
- Runtime evidence: `_audit/tmp/b3-timeout-full.json`; elapsedMs=60103, savedBody=`B3_TIMEOUT_MARK 记忆抽取真实超时验收正文。`, memoryError=`记忆抽取失败：记忆抽取超时。正文已保存。`, structured failed log mode=`memory-extraction:failed`, errorKind=`timeout`, duration=60008.
- Invalid JSON evidence remains `_audit/tmp/b3-invalid-json.json`.
- Status: B3 timeout PASS; B1/B2 already have runtime evidence from the shared preview probes, so B1-B3 are now complete pending checkpoint cleanup.

## D1 close/restart runtime checkpoint (2026-09-02 01:58:00 +08:00)
- Runtime evidence: `_audit/tmp/d1-close-restart-evidence.json`; project `d1_test_1788271049789` retained entity/event/world/sourceVersion counts and names after Electron close and restart (`success: true`).
- Queue evidence: `src/stores/project.spec.ts` previously passed with multiple `saveProject()` calls coalesced into one storage write.
- Status: D1 PASS.

## C1-C3 runtime checkpoint (2026-09-02 02:00:00 +08:00)
- Unit validation: `npx vitest run src/services/memoryMerger.c1.spec.ts src/services/memoryIO.spec.ts` => 2 files / 4 tests passed.
- Runtime evidence: `_audit/tmp/c1-c3-runtime-evidence.json`; merge import retained original entity and appended incoming entity (`beforeCount=4`, `afterCount=5`, `added=1`).
- Backup evidence: project-scoped key `memoryBackup_b_runtime_1788281261733` exists and contains both `C1原有实体` and `C1导入实体`.
- Status: C1-C3 PASS.

## D2 project isolation runtime checkpoint (2026-09-02 02:01:04 +08:00)
- Runtime evidence: `_audit/tmp/d2-isolation-evidence.json`; Project A entity remained isolated, Project B loaded only `项目B角色`, and no cross-project stale write appeared (`isolationOk: true`).
- Status: D2 PASS.

## D3 five-type CRUD runtime checkpoint (2026-09-02 02:02:31 +08:00)
- Runtime evidence: `_audit/tmp/d3-crud-runtime-evidence.json`.
- Verified real CRUD for entity, relation, event, world, and foreshadowing; entity field lock protected `name`, and deleting the entity also removed its relation.
- Assertions: all 11 CRUD/lock/isolation checks true (`entityUpdated`, `lockProtected`, `lockRecorded`, `eventUpdated`, `worldUpdated`, `foreshadowingUpdated`, `relationDeleted`, `entityDeleted`, `eventDeleted`, `worldDeleted`, `foreshadowingDeleted`).
- Status: D3 PASS.

## Memory V1 final verification checkpoint (2026-09-02 02:04:00 +08:00)
- Verification: `npx vue-tsc --noEmit` => exit 0.
- Verification: `npm run build:vue` => `✓ built in 3.20s`, 291 modules transformed.
- Status: A1-D3 all have runtime evidence and are complete.

## D3 follow-up: five-type edit UI and five-view evidence (2026-09-02 02:41:00 +08:00)
- Change: `src/components/common/MemoryPanel.vue` now provides a unified edit dialog for entity, relation, event, world, and foreshadowing records; `memoryDisplayItems` passes the underlying records so edit actions render for all five types. Locked entity fields and locked records remain protected.
- Change: `src/components/memory/CharacterCard.vue` adds the edit action, and `electron/main.js` trailing whitespace is removed.
- Runtime verification: `_audit/tmp/run_d3_ui_edit.js` executed against real Electron; project `d3_ui_1788287547932` passed dialog open, save, store update, and disk persistence for all five types (`allPassed: true`).
- Five-view visual evidence: `_audit/tmp/d3-five-views-evidence.json` plus screenshots `_audit/tmp/d3-view-list.png`, `_audit/tmp/d3-view-graph.png`, `_audit/tmp/d3-view-analysis.png`, `_audit/tmp/d3-view-mind.png`, and `_audit/tmp/d3-view-timeline.png`; each view is visible, populated, and saved.
- Verification: `npx vue-tsc --noEmit` exit 0; `npm run build:vue` succeeded; `node --check electron/main.js` exit 0; `git diff --check` reported no whitespace errors.
- Status: five-type edit UI PASS; five-view visual acceptance PASS; trailing-whitespace cleanup PASS.
