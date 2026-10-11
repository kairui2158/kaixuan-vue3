# Decision Ledger (Phase 0)

## 2026-09-19 read/write separation finding

**Decision:** `adopted`

**Source finding:** `_audit/RESEARCH_2026-09-19_API_DIRECT_WRITE_PROTOCOL_MATURITY_V1.md`

**Implementation phase:** Phase 1 of `_audit/PROPOSAL_2026-10-10_READ_WRITE_BUDGET_CELL_LEVEL_REPAIR.md`

**Acceptance evidence required:**

1. Unit test proves read amplification cannot consume reserved write capacity.
2. Fixed replay fixture proves `editor.write` remains executable after the recorded 116 read calls.
3. `discuss` and `analyze` runs consume zero write capacity.
4. Production scan shows no surviving caller of the old undifferentiated shared pool.

**Reason this ledger entry exists:** The same finding was identified on 2026-09-19 and silently dropped from the later scenario-based budget proposal. On 2026-10-07 the incorrect one-read-plus-one-write formula was normalized as a single source and locked by tests, turning a known risk into an enforced regression.

## 2026-09-16/19 termination-condition finding

**Decision:** `adopted`

**Source finding:** read and write tools require separate budgets and termination conditions.

**Implementation phase:** Phase 1 and Phase 3 of the approved 2026-10-10 proposal.

**Acceptance evidence required:**

1. Read exhaustion ends the locating phase and reports a recoverable stop.
2. Write exhaustion produces `partially_applied` with remaining segments.
3. No-write convergence cannot be reported as task completion.

## 2026-10-07 one-read-per-batch formula

**Decision:** `rejected`

**Technical reason:** The fixed replay disproves the assumption: 116 read/locate calls were needed for 10 write attempts. Estimating physical requests as `segmentCount * 2 + 6` starves writes whenever locating requires multiple map/search/read/locate rounds.
