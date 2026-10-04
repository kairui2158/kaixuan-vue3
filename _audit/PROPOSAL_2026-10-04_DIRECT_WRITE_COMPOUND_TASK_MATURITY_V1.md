# 2026-10-04 API Direct Write Compound Task Maturity V1

## 1. Objective

Close the defects exposed by `run-trace-outline-20261004-162304-deep` without reintroducing preview, approval, token budget, or SKILL authority:

1. Authorized long-document write tasks must execute writes, not emit legacy preview dialogue.
2. A continuation turn must preserve and extend the active compound task instead of collapsing it to the latest keyword.
3. Agent plans must be derived from the execution plan and completion must be proven by writes and verification, not by natural-language text alone.
4. A turn with rejected or incomplete writes must never be reported as a successful plain dialogue completion.
5. Editor locating and source contamination must stop feeding the tool loop false failures.

This proposal is design-mature. Implementation and verification have not started.

## 2. Evidence

### 2.1 Customer trace

- Path: `C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-outline-20261004-162304-deep/`
- Schema: 13.
- Provider: `deepseek-v4-pro`, declared context window 64000 tokens.
- Document: 74841 characters, estimated 38909 tokens.
- Turns:
  - Turn 1: `edit`, operation `restructure`, mode `edit-task`, write authorized, 0 tool calls, response begins with `【修改预览】`.
  - Turn 2: `edit`, operation collapsed to `deduplicate`, 32 tool calls, only 3 deletes succeeded, rewrites and inserts rejected by `operation_not_allowed_by_execution_plan`.
  - Turn 3: `discuss`, read-only, answered normally.

### 2.2 Code anchors

- `src/services/longDocumentExecutionPlanner.ts`
  - `classifyOperation()` checks `DEDUPLICATE_PATTERN` before restructure.
  - `resolveOperation()` only merges operations within the same request text.
  - `restructure_and_cleanup` already exists but was not selected in turn 2.
- `src/services/longDocumentWriteProtocol.ts`
  - `deduplicate` allows only `delete`.
  - `restructure_and_cleanup` allows reorder/repair, delete, replace, and rewrite.
- `src/services/agentDialogueRuntime.ts`
  - Agent plan is hardcoded to one generic dialogue step.
  - Completion criterion is only "return visible text or enter a terminal state".
- `src/services/agentOrchestrator.ts`
  - `defaultEvaluateRound()` marks any non-empty text as complete.
- `src/components/common/OutlineWorkspace.vue`
  - The `finally` block finishes the run as `success/plain_dialogue_complete` whenever the run is still marked running.
- `src/services/aiService.ts`
  - `withEditorWriteProtocol()` appends the write protocol to the system prompt, but the current wording does not prohibit legacy preview replies when writes are authorized.
- `src/services/editorEditLocator.ts` / `editorTools.ts`
  - `editor.locate` can return `target_not_found` for escaped newline or whitespace mismatches, feeding repeated-call stalls.
- `src/components/common/OutlineWorkspace.vue` and `src/components/chat/ChatPanel.vue`
  - Source contamination is detected and surfaced, but write-side contamination is not guarded.

## 3. Root-Cause Model

### R1 Legacy protocol residue

The old preview state machine was removed, but historical assistant messages still contain `【修改预览】` and instructions to wait for confirmation. Turn 3's request retains the turn 1 preview response. The model therefore reproduces the old interaction pattern even though `editor.write` is present and authorized.

### R2 No cross-turn task continuity

The planner classifies each turn from its current sentence. Turn 2 says "allow deduplication" in the context of the turn 1 restructure task, but the planner has no active task state. It therefore selects `deduplicate` and narrows allowed operations to `delete`.

### R3 Agent plan is not derived from the execution plan

The Agent sees a one-step "complete this request" plan. It does not receive the compound operation, planned segments, invariants, or completion criteria. The Agent therefore loops over tools without a task-level roadmap.

### R4 Completion semantics are wrong for write tasks

`defaultEvaluateRound()` treats any text as complete. The outer workspace finally block then records `success/plain_dialogue_complete`. This lets both "preview only, no writes" and "partial writes with rejected commands" appear successful.

### R5 Tool-loop friction and source contamination

Repeated `editor.locate` failures come from exact-match sensitivity to escaped whitespace. Source contamination is detected, but the source still contains assistant conversation residue, and write-side insertion of conversation text is not guarded.

## 4. Design

### 4.1 Unified write directive

Update `buildEditorWriteProtocolPrompt()` and the native-tool steering text to state the same rule in both provider modes:

- When the execution plan authorizes writes and the user request requires editing, the model must call `editor.write`.
- Preview-only replies are prohibited after write authorization.
- Asking the user for another confirmation is prohibited unless a tool returns `needs_user`.
- If a write cannot be completed, the model must stop tools and state the exact failure, rejected operation, and remaining plan.

The rule is prompt-level only. It does not add a confirmation UI or a preview state.

### 4.2 Legacy-history neutralization

Add a single-source history neutralizer used by both outline and home dialogue request assembly:

1. Detect legacy markers in historical assistant messages: `【修改预览】`, `【批准写回】`, `【写入未执行】`, and "wait for confirmation before writing" semantics.
2. Keep the user-visible chat unchanged.
3. Before sending to the provider, annotate or replace those history messages with an explicit note:
   - the old interaction mode is obsolete;
   - historical preview content is context only;
   - current write authority and execution protocol come from the current system prompt and execution plan.
4. Record the neutralized message IDs and original marker counts in trace.

This closes the protocol leak without deleting user history.

### 4.3 Active compound task state

Introduce an in-memory active execution task per workspace and project:

```text
{
  taskId,
  workspace,
  projectId,
  originalRequest,
  operation,
  allowedOperations,
  constraints,
  documentVersion,
  contentHash,
  createdAt,
  updatedAt,
  status
}
```

Rules:

- Created when an edit/generate intent produces an execution plan.
- Continued when a later turn is an edit intent and contains continuation semantics such as "符合我的要求", "分叉一允许", "直接写入", "继续", or an answer to a model question.
- Invalidated by document version or content hash mismatch, reset conversation, terminal failure, or explicit user narrowing.
- SKILL and Agent guidance cannot create, extend, or narrow this state.

### 4.4 Compound operation resolver

Replace single-sentence operation collapse with a resolver that consumes both active task and current request:

- Base operation comes from the active task.
- Current request can add constraints or operations.
 Operation union maps to the existing compound operation:
  - restructure + deduplicate + normalize -> `restructure_and_cleanup`
  - deduplicate + normalize -> `deduplicate_and_normalize`
  - explicit whole-document replacement -> `rewrite_segments`
- Explicit narrowing such as "只去重" can reduce scope only when it is unambiguous and the active task is not a continuation answer.
- Constraints such as "不要缩减内容" become invariants or verification rules, never a reason to block all writes.

The turn 2 sequence must resolve to `restructure_and_cleanup`, not `deduplicate`.

### 4.5 Execution-plan-derived Agent steps

`agentDialogueRuntime` must derive its plan from `document.executionPlan`:

- discussion: one discussion step.
- targeted edit: inspect target, write, verify.
- restructure: read structure, execute reorder or repair, verify.
- deduplicate: confirm duplicates, delete, verify.
- normalize: read segment, write batch, verify.
- compound operation: sequence the constituent phases and carry planned segments.

Completion criteria must include:

- required successful write count or covered segment set;
- invariant verification result;
- explicit failure condition when writes are rejected.

The generic "return visible text" criterion is allowed only for discussion.

### 4.6 Write-task completion evaluator

Add an execution-plan-aware evaluator used by the Agent and outer workspace:

- discussion: non-empty text can complete.
- write task: complete only when planned writes are accepted and verification passes.
- partial writes: terminal state `partially_applied`, not success.
- no writes with text: terminal state `write_not_executed`, with the legacy-preview violation when detected.
- physical request limit: `stalled/physical_request_limit`, never success.

The workspace finally block must consume this verdict. `plain_dialogue_complete` is valid only when the execution plan is discussion or no write authorization existed.

### 4.7 Locate tolerance and loop guidance

Improve `editor.locate` without weakening write safety:

1. Normalize escaped `\n`, `\r`, `\t`, Unicode whitespace, and repeated blank lines before exact match.
2. Preserve the exact-match write path; locate tolerance only improves target discovery.
3. Return normalized-diff hints and nearby candidates on failure.
4. Steering must tell the model how to correct the fragment rather than repeat the same call.

Repeated identical failing read calls should transition to a guided correction round before stalled termination.

### 4.8 Source and write contamination guards

Keep existing source contamination detection, and add:

- preflight summary of contaminated ranges in the API request context;
- write-side rejection when a proposed insertion matches recent assistant conversation text and the user did not explicitly request that text;
- trace event with matched marker IDs, range, and rejection reason.

This prevents conversation text from becoming document content while still allowing explicit user-requested insertions.

### 4.9 Observability

Upgrade trace schema to 14 and record:

- active task ID, operation, and continuation decision;
- operation union inputs and selected operation;
- legacy-history neutralization counts;
- Agent steps derived from execution plan;
- write completion verdict and covered segments;
- rejected operations by code;
- locate normalization result;
- contamination guard decisions.

Both outline and home entries must emit the same fields from the same services.

## 5. Implementation Order

### Phase 0: Baseline and failing tests

- Add trace-derived regression tests before production changes.
- Turn 1 expectation: authorized restructure task must not complete with preview-only text.
- Turn 2 expectation: continuation must select `restructure_and_cleanup`.
- Turn 2 terminal expectation: partial writes cannot produce `success/plain_dialogue_complete`.

### Phase 1: Protocol and history

- Unify native-tools and JSON write directives.
- Implement legacy-history neutralizer.
- Add trace fields for neutralization.

### Phase 2: Active task and compound resolver

- Implement active execution task state.
- Implement compound operation resolver.
- Wire outline and home through the same service.
- Add planner tests for union, continuation, narrowing, invalidation, and read-only override.

### Phase 3: Agent plan and completion

- Derive Agent steps from execution plan.
- Replace text-only completion for write tasks.
- Map Agent verdicts to outer run status.
- Add service tests for complete, partial, rejected, stalled, and discussion outcomes.

### Phase 4: Locate and contamination

- Add locate normalization and failure guidance.
- Add write-side contamination guard.
- Extend trace schema and tests.

### Phase 5: Full verification

- `npm run type-check`
- `npm run test:services`
- Focused service tests:
  - `longDocumentExecutionPlanner.spec.ts`
  - `agentOrchestrator.spec.ts`
  - `agentDialogueRuntime.spec.ts`
  - `editorTools.spec.ts`
  - `editorEditLocator` tests
  - conversation context tests
- Electron real-UI matrix:
  - outline and home;
  - with and without real SKILL selection;
  - authorized compound restructure continuation;
  - preview-only response rejection;
  - partial-write terminal state;
  - discussion read-only regression.
- Customer-trace replay:
  - import the 74841-character outline;
  - replay the same three user requests;
  - require turn 2 to execute the compound plan;
  - require final status to reflect actual completion, not a fallback success.
- Live API validation:
  - use `SHENYI_LIVE_API_KEY` when available;
  - without the key, record live validation as `untested`;
  - mock Electron validation must not be reported as live evidence.

## 6. Rejected Alternatives

| Alternative | Rejection reason |
|---|---|
| Reorder keyword checks only | Still has no memory of the active task; a different continuation phrase recreates the failure. |
| Prompt-only fix | Old assistant history remains authoritative to the model and can override the new prompt. |
| Relax `planned-deletion-only` invariant | Turns a classification error into an unsafe write path and risks content loss. |
| Agent-only fix | The Agent would still receive the wrong operation and allowed operations. |
| Outer-status-only fix | Hides the failure but leaves the model unable to complete the user goal. |
| Restore preview or approval | Violates the approved direct-write direction and adds the removed interaction layer. |

## 7. Risk Matrix

| Risk | Impact | Mitigation |
|---|---|---|
| History neutralizer removes useful context | Model loses prior discussion | Annotate rather than delete; preserve user-visible history; trace counts |
| Compound resolver over-expands scope | Unwanted writes | Active task must be edit/generate, continuation must be explicit, narrowing remains supported |
| Agent completion too strict | Valid discussion marked failed | Discussion retains text completion; write tasks require writes |
| Locate normalization causes false matches | Wrong target | Normalize only for locate; writes still require exact unique target |
| Contamination guard blocks valid insertion | User cannot insert requested text | Allow explicit user-requested text and record the exception |
| Status mapping breaks existing UI | Wrong run states | Add shared status mapping and test all terminal states |

## 8. Acceptance Criteria

1. Turn 1 replay does not complete without a write when the plan authorizes and requires writes.
2. Turn 2 replay selects `restructure_and_cleanup`.
3. Rejected rewrites and inserts cannot be hidden behind a success status.
4. Preview-only replies produce `write_not_executed` or an equivalent non-success terminal state.
5. Agent plan contains execution-plan-derived steps and segment coverage.
6. Outline and home use the same resolver, evaluator, and status mapping.
7. With and without SKILL, permission and tool surface expectations remain identical.
8. Trace schema 14 exposes every decision needed to diagnose this failure class.
9. No legacy preview execution state, approval state, token budget, or SKILL authority is reintroduced.

## 9. Maturity Verdict

- Executor/tool layer: mature; existing tools and invariants are retained, not bypassed.
- Application/interaction closure: mature; direct write remains the only write path and no confirmation layer returns.
- Implementation wiring: not started; this proposal defines the exact files and order.
- Verification standard: mature; unit, service, Electron, customer-trace replay, and live-API evidence are mandatory and separately reported.

Overall: design is mature for implementation. No claim of completion is valid until the verification matrix passes and live evidence is either provided or explicitly marked untested.
