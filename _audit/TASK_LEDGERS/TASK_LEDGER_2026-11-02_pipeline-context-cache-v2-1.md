# TASK LEDGER: Pipeline context cache V2.1

## 1. Goal and original words

- User original goal: optimize pipeline serial-chain latency and provider pressure without breaking generation quality.
- Final observable behavior: per-layer/per-step request context composition is measurable; cache-friendly request ordering is reversible; provider cache usage is observed from physical usage data; quality changes are blocked by shadow comparison gates.
- Deliverables: context composition service, trace event wiring, cache observation normalization, feature flags, tests, DEV_LOG, experience file update, package build, git commit.

## 2. Gate read evidence

- G0.1: align every phase with the "no quality regression, reversible" goal.
- G0.3/G0.5: distinguish real-verified, mock-verified, untested; perform final look-back.
- G0.6/G0.7: plan graded mature after anti/reverse reasoning; risk matrix recorded in DEV_LOG.
- G0.8/G0.10: no stale artifacts left behind; old behavior remains available through flags.
- G0.12: this ledger.
- G1.1/G1.4/G1.5: apply_patch edits, layered verification, assertion red tests before green claims.
- G2.7/G2.9/G2.11/G2.13: context/budget, pipeline, provider/network, SKILL neutrality.

## 3. Routing decisions

- Included: context composition, trace emission, provider cache usage observation, prefix-stability mode, red/green tests.
- Excluded: changing SKILL templates, narrative verdict logic, chain dependency order, provider request format (Anthropic explicit cache_control), Phase 3 material compression. Reason: V2.1 gate order requires Phase 0-2 evidence before those behaviors change.

## 4. Impact circle and author falsification

- Intended changes: request context metadata, sample selection mode, trace event, runTrace store/exporter tolerance, tests.
- Possible touches: folder executor request assembly, agent path request assembly, aiService physical-call trace, trace field normalizer, exporter, UI progress displays that consume physical call events.
- Most likely wrong assumption: stable sample selection improves cacheability without changing outputs. Falsified by shadow A/B and byte-level fallback assertion; feature stays default-off if unverifiable.

## 5. Stop conditions

- Phase 0 complete: red tests observed failing then passing; no request content diff in default mode.
- Phase 1 complete: project-stable mode only emits metadata/order changes under its flag; fallback is byte-identical.
- Phase 2 complete: cached usage fields flow into physical call trace and export; unsupported providers report unsupported without error.
- Fail: any type-check/test failure, request diff in default mode, or unremoved temporary artifacts.
- Real provider cache hit-rate and 20-chapter shadow A/B remain `untested` unless real keys/chapters are supplied.

## 6. Execution evidence

- Baseline commit: `d6162aac`.
- RED assertion observed: `buildCacheUsageSummary({ inputTokens: 100, cacheReadInputTokens: 120 })` returned `cacheReadInputRatio: 1.2`; fixed to cap at `1`.
- RED syntax/type gate: `npm run type-check` exposed invalid `physicalCalls!` usage in [runTraceExportService.spec.ts](../src/services/runTraceExportService.spec.ts); fixed to `RunTracePhysicalCall`.
- Mock-verified command: `npx vitest run src/services/realSkillExecutor.spec.ts src/services/aiService.spec.ts src/services/traceFieldNormalizer.spec.ts src/services/requestContextComposition.spec.ts src/stores/runTrace.spec.ts src/services/runTraceExportService.spec.ts` → exit 0, `6 passed`, `382 passed`.
- Type gate: `npm run type-check` → exit 0.
- Context composition implementation: [requestContextComposition.ts](../src/services/requestContextComposition.ts:41), [requestContextComposition.ts](../src/services/requestContextComposition.ts:48), [requestContextComposition.ts](../src/services/requestContextComposition.ts:72).
- Provider cache normalization: [traceFieldNormalizer.ts](../src/services/traceFieldNormalizer.ts:40), [traceFieldNormalizer.ts](../src/services/traceFieldNormalizer.ts:106), [traceFieldNormalizer.ts](../src/services/traceFieldNormalizer.ts:132).
- Physical-call observation: [aiService.ts](../src/services/aiService.ts:3783), [aiService.ts](../src/services/aiService.ts:3789), [aiService.ts](../src/services/aiService.ts:3839).
- Trace persistence: [runTrace.ts](../src/stores/runTrace.ts:363), [runTrace.ts](../src/stores/runTrace.ts:1825), [runTrace.ts](../src/stores/runTrace.ts:1879).
- Export output: [runTraceExportService.ts](../src/services/runTraceExportService.ts:123), [runTraceExportService.ts](../src/services/runTraceExportService.ts:139).
- Folder-path wiring: [realSkillTypes.ts](../src/services/realSkillTypes.ts:252), [skillRouter.ts](../src/services/skillRouter.ts:27), [realSkillExecutor.ts](../src/services/realSkillExecutor.ts:1060), [PipelinePanel.vue](../src/components/pipeline/PipelinePanel.vue:3081), [PipelinePanel.vue](../src/components/pipeline/PipelinePanel.vue:3197).
- Focused RED→GREEN commands:
  - `npx vitest run src/services/traceFieldNormalizer.spec.ts -t "caps provider-reported cache ratios"` → RED `cacheReadInputRatio: 1.2`, then GREEN.
  - `npx vitest run src/services/requestContextComposition.spec.ts -t "keeps the layer identity used by the pipeline executor"` → GREEN after widening the accepted layer union.
- Layer vocabulary audit: `realSkillTypes.ts` emits `volumes`/`chapters`; `requestContextComposition.ts` initially accepted only `volume`/`chapter`. Fixed by accepting both and adding a boundary test.
- Boundary added after implementation audit: [PipelinePanel.vue](../src/components/pipeline/PipelinePanel.vue:3813) `callApiWithAgentVariantOwned` still has no `contextComposition`, and auxiliary style-analysis/hard-signal calls omit it too. Their cache usage is still observed by aiService, but their request composition is unobserved. Registered as a non-blocking observation gap, not a behavior defect.

## 7. Gap list

- Registered gaps (must be resolved before closing): real provider cache matrix `untested`; 20-chapter shadow A/B `untested`; installer-level real run `untested`.
