# API Direct Write Read/Write Budget Cell-Level Repair Proposal

Date: 2026-10-10
Status: APPROVED - 2026-10-10 user confirmed execution

## Purpose

Repair the API direct-write long-document failure at the root instead of adding another larger iteration cap. The production replay on the 205,713-character outline proved that read/locate calls consume the same iteration and physical-request pools as `editor.write`. The model performed 84 physical requests and 136 tool calls, with roughly 126 read/locate calls and only 10 write calls. The run ended by telling the user that `editor.write` could not be started because the tool-loop limit had been reached.

This plan also repairs the execution failure that allowed a known 2026-09-19 risk to survive three weeks of related fixes:

- The risk was identified in research but never became a proposal requirement or an explicitly deferred ledger item.
- A later refactor normalized the incorrect "one read + one write per batch" assumption and locked it with tests.
- Live verification used an idealized model path and therefore could not expose read amplification.

No stage of this plan may be marked complete without the evidence named in its acceptance gate.

## Evidence Baseline

### Production replay

- Replay script: `scripts/verify-outline-lock-override-live-replay.mjs`
- Replay evidence: `_audit/verification-outline-lock-override-live-replay/`
- Trace: `_data/outline-lock-override-live-replay-profile/documents-data/run-trace/outline/run-trace-outline-20261010-003831/run-trace.json`
- Document size: 205,713 characters
- Physical requests: 84
- Tool calls: 136
- Read/locate calls: approximately 126
- Write calls: 10, with 5 successful and 5 failed
- Terminal model response: no write could be started because the tool-loop limit had been reached

### Code evidence

- Shared physical budget: `src/services/agentOrchestrator.ts:715`
- Single inner iteration pool: `src/services/aiService.ts:2232-2235` and `src/services/aiService.ts:2327`
- "One read + one write per batch" safety-net assumption: `src/services/longDocumentWriteProtocol.ts:5-18`
- Outline production wiring uses the same formula for `maxPhysicalRequests` and `maxToolIterations`: `src/components/common/OutlineWorkspace.vue:5385-5387` and `src/components/common/OutlineWorkspace.vue:5479-5482`
- Successful writes can be discarded by coverage accounting when segment declarations do not match the plan: `src/services/longDocumentWriteCoverage.ts:159-216`
- Tool description still tells the model to refresh the map after writes even though structure identity is now designed to remain stable: `src/services/editorDocumentMap.ts:246` and `src/services/editorDocumentMap.ts:294`
- Older successful read results are compacted, which can force the model to reread earlier details: `src/services/toolContextCompactor.ts:149-180`
- UI terminal copy still exposes only the physical-request ceiling: `src/components/common/OutlineWorkspace.vue:1951-1955`

### Historical evidence

- 2026-09-19 research already identified the exact defect: one `maxToolIterations` pool for read and write starves writes in long-document locating workflows: `_audit/RESEARCH_2026-09-19_API_DIRECT_WRITE_PROTOCOL_MATURITY_V1.md:136`
- The same research said read and write need separate budgets and termination conditions: `_audit/RESEARCH_2026-09-19_API_DIRECT_WRITE_PROTOCOL_MATURITY_V1.md:72`
- The later V2 proposal only split budgets by scenario, not by tool class: `_audit/PROPOSAL_2026-09-19_API_DIRECT_WRITE_PROTOCOL_MATURITY_V2.md:105`
- A later task normalized `segmentCount * 2 + 6` as the single source: `_audit/TASK_LEDGERS/2026-10-07_direct-write-four-line-untangle.md:41`

## Non-Negotiable Gates

These gates exist because the same defect was previously identified and then lost between research, proposal, implementation, and verification.

### G1 Research-to-decision ledger

Every research finding that affects production behavior must receive one of three decisions in the same task ledger:

1. `adopted` with an implementation phase and acceptance evidence
2. `deferred` with reason, owner, failure mode, and expiry condition
3. `rejected` with technical reason

Silent disappearance is prohibited. This proposal itself records the 2026-09-16/19 read-write separation findings as `adopted`.

### G2 Adversarial assumption testing

Every budget, cap, threshold, cache, and state assumption must be tested against the real failure shape, not only the ideal path:

- read amplification
+ write starvation
+ repeated map refresh
+ rereads after compaction
+ partial successful writes
+ multi-segment coverage mismatch
+ discussion during a long write task

Tests that only assert a formula value are not sufficient. The fixed trace becomes the mandatory adversarial fixture.

### G3 New/old semantic purge

When behavior changes, every producer and consumer of the old semantics must be inventoried:

+ implementation
+ prompt
+ tool description
+ error message
+ trace schema
+ UI copy
+ tests
+ replay scripts
+ documentation

A change is not complete while any layer still teaches or enforces the old rule.

### G4 Phase evidence before completion

Each phase must produce:

1. command output with the exact failing-before/passing-after evidence
2. file-line references
3. service-level behavior evidence
4. Electron real-UI evidence where the phase affects user-visible behavior
5. trace evidence for budget, cache, coverage, and state decisions

No "should pass", no stale session evidence, and no injected fake model response presented as real user testing.

### G5 User-intent replay

Electron live replay must start from the user's original intent, follow real API responses, and end at the requested document state. Exact dialogue wording may differ; the starting purpose and final document result may not.

### G6 Clean workspace and no residue

Temporary diagnostic artifacts are moved to explicitly named audit evidence directories or removed. Test-only scripts do not remain in production entry points. Packaging happens only after the final no-new-issues lookback round.

## Repair Architecture

### Cell layer: classify and account every tool call

Create a single budget/accounting module for tool runs. Every tool call is classified before execution:

- `read`: document map, read range, search, structure, state
- `write`: `editor.write`
- `control`: plan, context, supervisor, cancel, continuation

The module owns:

1. per-class counters
2. per-class ceilings
3. reserved write capacity
4. exhausted-class diagnostics
5. trace snapshots

Read budget may never consume reserved write capacity. Write capacity is reserved from the execution plan before the first physical request, not borrowed from an undifferentiated pool.

The outer orchestrator and inner AI service consume this module through one interface. `maxToolIterations` stops being the only production budget knob.

### Tissue layer: adaptive read planning

Replace the fixed "one read per batch" estimate with an explicit read plan derived from:

- document size
- planned segment count
- observed read amplification
- document-map page size
- read-range page size
- cache hit rate
- required rereads after structural writes

The ceiling is a runaway safety net, not a task target and not a token budget. The plan must be able to say "read phase incomplete" without silently converting the remaining task into a no-tool convergence response.

### Organ layer: phase state machine

Split long-document write execution into explicit phases:

1. `locating`
2. `planning`
3. `writing`
4. `settling`

Each phase has its own budget, progress, and terminal semantics:

- read exhaustion ends the locating phase, not the write task
- write exhaustion can produce `partially_applied`
- settlement records successful writes, trusted coverage, and remaining segments
- discussion messages can use read tools but never consume write execution capacity

The orchestrator must distinguish:

- no writes attempted
- some writes succeeded
- some writes trusted
- plan complete
- plan incomplete but recoverable
- plan impossible under current authorization

### System layer: coverage accounting repair

Coverage must separate three facts that are currently conflated:

1. `successfulWriteCount`: tool returned success
2. `trustedCoverageCount`: successful write maps to planned segments with credible ranges
3. `planComplete`: every required segment is covered

A successful write that cannot be attributed to a segment is still recorded as a successful write with an unattributed-coverage warning. It must not erase the write count or force the task to behave as though nothing was written.

Partial writes produce a checkpoint containing:

- document version
- content hash
- successful commands
- trusted segment IDs
- untrusted or unattributed records
- remaining segments
- budget state

### Memory layer: read cache and compaction coordination

Introduce a session-scoped read ledger shared by:

- document map
- read range
- search
- locate
- context compactor
- budget accounting

The ledger records source range, document version, and structural identity. It enables:

1. duplicate read detection
2. reread classification
3. compacted-read anchors
4. invalidation only when structure identity changes

Tool descriptions and error messages must be updated in the same change:

- stable IDs remain valid after ordinary writes
- map refresh is required only when structure identity changed
- failed cursors remain non-reusable
- compacted reads retain a recoverable anchor and are reported as rereads if requested again

### User layer: transparent phase and budget state

The API dialog and outline workbench show live phase status without exposing raw tool-call noise:

- current phase
- read calls and remaining read safety net
- write calls and reserved write capacity
- completed batches
- trusted partial writes
- why execution stopped, when it stops

Raw tool-call details remain in the run trace, preserving the existing "rolling status in dialog, full detail in trace" product semantic.

## Implementation Phases

### Phase 0 - Baseline and inventory

Objectives:

1. Preserve the current replay trace as a permanent regression fixture.
2. Inventory every producer and consumer of the old shared iteration/physical budget.
3. Inventory every prompt, tool description, error message, trace field, UI label, test, and script that assumes one shared pool or mandatory post-write map refresh.

Deliverables:

- `_audit/verification-read-write-budget-baseline/`
- old/new semantic inventory table
- decision ledger entries for the 2026-09-16/19 findings

Acceptance:

- machine-readable replay summary with physical, read, write, coverage, and terminal counts
- inventory scan returns zero unclassified production references

### Phase 1 - Budget cell module

Objectives:

1. Add the classified budget/accounting module.
2. Route orchestrator and AI service through it.
3. Reserve write capacity before read expansion can consume it.
4. Keep discussion/read-only runs separate from write execution capacity.

Acceptance:

- unit tests prove reads cannot consume reserved write capacity
- write starvation fixture passes: after the recorded read amplification, `editor.write` remains executable
- discussion/analyze runs consume no write capacity
- old shared-budget code paths have no surviving production callers

### Phase 2 - Read amplification and map-identity repair

Objectives:

1. Add the session read ledger and duplicate/reread classification.
2. Make map invalidation depend on actual structure identity change.
3. Remove stale post-write refresh instruction from tool descriptions.
4. Coordinate compaction with read anchors.

Acceptance:

- stable-ID writes do not force map refresh unless structure identity changed
- duplicate reads are classified and counted
- compacted reads remain recoverable or clearly reported as rereads
- replay fixture shows reduced avoidable map/read churn

### Phase 3 - Phase state machine and coverage settlement

Objectives:

1. Add locating/planning/writing/settling phases.
2. Separate successful writes, trusted coverage, and plan completion.
3. Create recoverable partial-write checkpoints.
4. Prevent no-write convergence from masquerading as task completion.

Acceptance:

- the five successful writes in the fixed trace are no longer recorded as zero trusted batches without explanation
- partial writes produce explicit `partially_applied` with remaining work
- no-write and partial-write terminal copy are distinct
- settlement never relaxes write safety thresholds

### Phase 4 - Trace and UI synchronization

Objectives:

1. Extend trace schema with budget-class counters, phase, cache, and coverage state.
2. Show phase and budget state in API dialog and outline workbench.
3. Keep raw tool details in trace only.

Acceptance:

- run trace can answer why execution stopped without payload inspection
- UI does not display raw tool-call cards in the dialog
- before/after UI evidence shows the old "only physical budget exhausted" message replaced with actionable state

### Phase 5 - Regression and service replay

Objectives:

1. Add the 205,713-character trace as an adversarial regression fixture.
2. Add budget, cache, identity, coverage, state, and UI service tests.
3. Run full service and type checks.

Acceptance:

- read amplification does not starve writes
- write safety thresholds are unchanged
- discussion semantics remain read-only
- full service suite and type-check pass with raw output recorded

### Phase 6 - Electron real-UI live verification

Objectives:

Run the user's original long-document intent through the real application UI using the configured production API provider:

1. reorganize the outline
2. merge duplicate content
3. normalize punctuation
4. remove repeated items

The replay follows actual model replies and does not script a fixed response sequence. It may select SKILL through the real UI only when the scenario explicitly tests SKILL coexistence.

Acceptance:

- document content actually changes in the editor
- at least one `editor.write` succeeds before any write-budget exhaustion
- read phase and write phase are visible in UI and trace
- terminal state and document state agree
- partial success, if any, is explicit and recoverable

Additional coverage:

1. no-SKILL long-document path
2. real-UI-selected SKILL long-document path
3. discussion interruption during a write task
4. continuation from a partial-write checkpoint

### Phase 7 - Lookback, gates, and cleanup

Objectives:

1. Execute repeated lookback/repair rounds.
2. Stop only after one complete round finds no new defect, unresolved old/new contradiction, or missing evidence.
3. Update the experience file and hard gates.
4. Remove temporary residue and package.

Mandatory experience additions:

- research findings cannot disappear without a ledger decision
- formula assumptions require adversarial failure fixtures
- read and write budgets are separate by design
- stable-ID semantics require prompt/tool-description/error-message synchronization
- successful write and trusted coverage are distinct facts
- completion claims require phase-specific evidence

## Risk Control

| Risk | Control |
| --- | --- |
| Larger read ceilings cause runaway requests | Read ceiling remains a safety net; phase state detects no-progress and reports a recoverable stop |
| Reserved write budget invites unsafe writes | Authorization, write validation, repeated-write guard, and coverage safety remain unchanged |
| Cache returns stale content | Ledger keys include document version and structure identity; invalidation remains mandatory for real structure change |
| Prompt and code drift again | Phase 0 inventory and G3 require prompt, tool description, error message, tests, and docs to move together |
| Coverage relaxation damages safety | Only accounting is separated; segment matching and plan-completion thresholds are not relaxed |
| New trace fields break old trace readers | Trace schema adds versioned optional fields and keeps old-event read compatibility |
| SKILL changes execution permission | SKILL remains prompt/domain capability only; permission and budget classes remain application-owned |
| Real API variance stalls validation | Replay follows live replies and judges by start intent plus final document state, not exact dialogue |

## Stop and Rollback Criteria

Stop implementation and return to design if:

1. any phase cannot produce its named evidence
2. a write safety check is weakened to make a test pass
3. budget separation cannot be enforced without duplicating state
4. old shared-budget semantics remain reachable in production
5. the real-UI replay cannot demonstrate an actual editor change

Rollback restores the previous single-pool safety net only as a temporary protective state and records the failed assumption in the decision ledger. A rollback is not a completed repair.

## Final Acceptance

The repair is complete only when:

1. the fixed read-amplification trace passes as a regression fixture
2. reads cannot consume reserved write capacity
3. successful partial writes are recorded and recoverable
4. stable IDs and prompts share one semantic
5. UI and trace expose phase and budget state
6. Electron real-UI live verification changes the document through the real API path
7. no-SKILL and real-UI-selected SKILL paths both remain correct
8. experience gates and decision ledger are updated
9. one full lookback round finds no new issue
10. workspace cleanup and packaging are complete
