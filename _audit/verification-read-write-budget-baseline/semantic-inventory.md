# Old/New Semantic Inventory (Phase 0)

Every production reference found by the controlled `rg` scans is classified below. The scan commands exclude trace payloads and generated documents, so historical evidence directories cannot mask a production reference.

## A. Shared physical-request budget

| Reference | Role | Classification | Phase |
| --- | --- | --- | --- |
| `src/components/common/OutlineWorkspace.vue:443` | Import of `calculateLongDocumentPhysicalRequestBudget` | Old formula producer | Phase 1 |
| `src/components/common/OutlineWorkspace.vue:5385-5386` | `maxPhysicalRequests` from one read+write formula | Shared pool wiring | Phase 1 |
| `src/components/common/OutlineWorkspace.vue:5481-5482` | `maxToolIterations` uses the same formula | Shared pool wiring | Phase 1 |
| `src/components/common/OutlineWorkspace.vue:5807` | Deletion replay fallback `maxToolIterations: 12` | Old default wiring | Phase 1 |
| `src/components/chat/ChatPanel.vue:219` | Import of the same formula | Old formula producer | Phase 1 |
| `src/components/chat/ChatPanel.vue:3831` | Home editor `maxPhysicalRequests` | Shared pool wiring | Phase 1 |
| `src/components/chat/ChatPanel.vue:3849` | Home editor shared runtime budget | Shared pool wiring | Phase 1 |
| `src/services/longDocumentWriteProtocol.ts:10` | `calculateLongDocumentPhysicalRequestBudget` | Old one-pool formula | Phase 1 |
| `src/services/longDocumentExecutionPlanner.ts:761` | `estimatedPhysicalRequests` uses the old formula | Planning consumer | Phase 1 |
| `src/services/agentOrchestrator.ts:396-397` | Shared physical budget closure | Shared pool owner | Phase 1 |
| `src/services/agentOrchestrator.ts:715-716` | Passes shared budget into AI service | Shared pool consumer | Phase 1 |
| `src/services/agentOrchestrator.ts:914-922` | Outer physical-budget terminal state | Shared terminal semantics | Phase 1/3 |
| `src/services/agentDialogueRuntime.ts:26,169` | Runtime carries `maxPhysicalRequests` | Interface consumer | Phase 1 |
| `src/services/aiService.ts:2053-2060` | Module-level shared budget hook | Shared pool holder | Phase 1 |
| `src/services/aiService.ts:2208-2216` | Swaps shared budget per request | Shared pool consumer | Phase 1 |
| `src/services/aiService.ts:2327-2346` | Inner exhaustion returns `physical_request_budget_exhausted` | Shared terminal semantics | Phase 1/3 |
| `src/services/aiService.ts:3287` | Final exhaustion mapping | Shared terminal semantics | Phase 1/3 |
| `src/services/toolLoopPolicy.ts:19-37` | Scenario defaults for `maxToolIterations` | Legacy compatibility default | Phase 1 |

## B. Stale map identity semantics

| Reference | Current semantic | Required semantic | Phase |
| --- | --- | --- | --- |
| `src/services/editorDocumentMap.ts:246` | Tool description says refresh map after write when receipt hints | Keep, but wording must stay subordinate to `structureIdentity` | Phase 2 |
| `src/services/editorDocumentMap.ts:294` | Error says every write changes section id | Wrong: stable IDs survive ordinary writes | Phase 2 |
| `src/services/editorDocumentMap.ts:301-302` | Error repair steps always request new map | Must depend on structure identity failure | Phase 2 |
| `src/services/editorTools.ts:1325-1326` | Reorder receipt uses stable structure IDs | New semantic producer | Phase 2 |
| `src/services/editorTools.ts:1448-1449` | Write receipt uses stable structure IDs | New semantic producer | Phase 2 |

## C. Coverage accounting conflation

| Reference | Current semantic | Required semantic | Phase |
| --- | --- | --- | --- |
| `src/services/longDocumentWriteCoverage.ts:65` | Discards records unless `coverageTrusted === true` | Preserve successful-but-untrusted records | Phase 3 |
| `src/services/longDocumentWriteCoverage.ts:124-141` | No-plan path treats successful writes as complete/trusted | Separate success, trust, and plan completion | Phase 3 |
| `src/services/longDocumentWriteCoverage.ts:214-221` | Trusted count and `trusted` flag conflate attribution and success | Preserve all three facts | Phase 3 |
| `src/services/agentOrchestrator.ts:594-601` | Collects only trusted coverage records | Preserve untrusted successful records | Phase 3 |
| `src/services/agentOrchestrator.ts:229-241` | Completion requires `coverage.complete` | Distinguish no-write, partial, trusted, complete | Phase 3 |
| `src/services/aiService.ts:491-504` | Uses successful writes as planned-count fallback | Keep safety, but separate plan completion | Phase 3 |
| `src/services/aiService.ts:2427-2555` | Coverage summary drives steering and terminal copy | Must use separated facts | Phase 3 |

## D. User-visible and trace semantics

| Reference | Current semantic | Required semantic | Phase |
| --- | --- | --- | --- |
| `src/components/common/OutlineWorkspace.vue:1951-1955` | Shows physical-budget exhaustion only | Show phase, read/write budget, coverage, recoverable stop | Phase 4 |
| `src/services/agentOrchestrator.ts:918` | UI label reports only shared physical ceiling | Class-specific exhausted budget | Phase 4 |
| `src/services/aiService.ts:2610-2623,2972-2975` | Read-only warnings demand write without budget state | Keep steering, add phase/budget facts | Phase 4 |
| `src/services/aiService.ts:2539,2546,2555` | Terminal copy exposes successful/trusted counts only | Include partial checkpoint and remaining work | Phase 4 |

## E. Tests that currently lock the old formula

These tests intentionally encode the pre-repair behavior and are the red/green surface for Phase 1:

- `src/services/longDocumentWriteProtocol.spec.ts:95-100`
- `src/services/toolLoopPolicy.spec.ts:9-12`
- `src/services/agentOrchestrator.spec.ts:645-718`
- `src/services/aiService.spec.ts:3820-3833`
- `src/stores/runTrace.spec.ts:2329`
- `scripts/verify-api-direct-write-long-document-loop.mjs:36-37`

## Scan coverage

Controlled scans covered:

- `src/**/*.ts`
- `src/**/*.vue`
- all production references to `maxPhysicalRequests`, `maxToolIterations`, `sharedPhysicalRequestBudget`, `physical_request_budget_exhausted`, and `calculateLongDocumentPhysicalRequestBudget`
- all production references to write-induced map refresh, stable structure IDs, coverage trust, successful writes, and budget/iteration terminal copy

Unclassified production references: 0.
