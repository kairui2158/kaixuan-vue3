// Entry-point shim: VALIDATION_GATE.md documents node tests/scripts/gate_check.js
// as the pre-commit invocation, but the canonical implementation lives in
// scripts/pre_commit_gate.js. This wrapper preserves a single source of truth
// while honoring the documented path.
require("../../scripts/pre_commit_gate.js");