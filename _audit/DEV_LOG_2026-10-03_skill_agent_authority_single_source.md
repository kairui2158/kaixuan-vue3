# DEV LOG 2026-10-03 - SKILL/Agent Authority Single Source

## Objective

Execute the approved proposal in `_audit/PROPOSAL_2026-10-03_SKILL_AGENT_AUTHORITY_SINGLE_SOURCE.md`: SKILL and Agent payloads may only contribute domain guidance; write authority is decided once by the intent + operation + execution-plan triple, and workflow authorization must never override read-only `discuss/analyze` turns.

## Root Cause Chain

- The 2026-10-03 trace already routed the user request as `discuss`, but the downstream planner did not consume that intent.
- `classifyOperation()` defaulted unknown long-document requests to `targeted_edit`, while `classifyLongDocumentOperation()` defaulted them to discussion; the two layers disagreed.
- Both entry points then minted `long-document-workflow` authorization from `edit-task` mode and forged `edit` intent whenever workflow authorization existed.
- The tool surface and AI service treated that marker as a boolean bypass, allowing write tools on read-only turns.
- Convergence prompts then told every non-final-draft long-document turn to call `editor.write`, even discussion tasks.
- SKILL loading amplified the failure rate by keeping sessions inside this long-document path more often; it was not the source of the authority itself.

## Implementation

- `longDocumentExecutionPlanner.ts`: `discuss/analyze` (and read-only mapped `auto`) now resolve to `discussion`; unknown long-document requests default to `discussion` rather than `targeted_edit`.
- `dialogueToolSurface.ts`: `DialogueWriteAuthorization` is now structured (`source`, `intent`, `operation`, `mode`, `reason`); authorization requires the full matching triple.
- `aiService.ts`: write permission no longer accepts the workflow marker as a bypass; intent must be `edit/generate`.
- `editorTools.ts`, EditTask deletion checks, prompts, and trace consumers now use the same structured authorization or its single-source projection.
- `OutlineWorkspace.vue` and `ChatPanel.vue`: both entries pass routed intent into the planner and build authorization only from the triple. The previous `discuss && workflowWrite -> edit` forgeries are removed.
- Agent progress and convergence semantics now branch on `discussion`: natural-language output is progress, and convergence says to stop tools and answer rather than force `editor.write`.
- SKILL adapters only pass through the single-source authorization object; a SKILL package cannot provide, enhance, or override it.
- Guidance trace events now carry payloads. Empty guidance reports `skillGuidancePresent: false` instead of claiming SKILL integration.
- `ChatPanel.callApi()` now receives the structured `DialogueWriteAuthorization` directly instead of its `.source` string; downstream tool policy still uses the source only as a diagnostic marker.

## Verification

- `npm run type-check`: passed.
- `npm run build:vue`: passed.
- `node scripts/verify-skill-agent-authority-electron.mjs`: passed.
  - 4/4 cases passed: outline and home, each without and with a real SKILL dropdown selection.
  - 8/8 read-only discussion turns stayed read-only with no tool loop and no write event.
  - 4/4 edit turns executed `editor.write` successfully and changed the document.
  - Evidence: `_audit/verification-skill-agent-authority/summary.json`, per-case `turns.json`, and screenshots.
- `npm run test:services`: 126 files, 1364 tests passed.
- Real external-provider smoke was not rerun in this pass and remains an existing registered `untested` item under G1.4; the Electron matrix covers both entries, real UI selection, permission semantics, and editor writes with the mock provider.

## G0.5 Lookback

- `rg` scan found no remaining authorization decision based on the `long-document-workflow` string. Remaining occurrences are either the structured authorization's `source` literal, trace/diagnostic markers, or negative test assertions.
- No `discuss && workflowWrite -> edit` or `toolPolicyIntent` forgery remains in production code.
- The planner, write protocol, rejection messages, and convergence directives all have a `discussion` branch.
- Old tests asserting workflow-override semantics were replaced with negative assertions; no test now requires the removed behavior.
- No user-authored 3.72.0 work was reverted. This pass only completed the approved authority-single-source change set.
- Known non-blocking observation: during verification startup, run-trace integrity reported old stuck `running` runs from previous local test sessions. They are state-store cleanup candidates, not part of this authority chain.

## Experience Gate Update

- Extended G1.4 with a type-check-before-build rule for partially completed refactors.
- Extended G1.8 with a payload rule for trace events: trace fields must be attributed to the actual execution path, and event payloads must survive the bridge.
- Extended G1.10 with the intent triple rule: authority must be recomputed from intent, operation, and plan mode; workflow markers cannot bypass intent, and any helper accepting an authorization marker must name the decision explicitly.
- Extended G2.13 with the SKILL execution-neutrality acceptance matrix: every authority test must run both without and with a real SKILL selection, and SKILL state must never change the expected permission or tool surface.

## 2026-10-04 R1-R5 Hardening Closeout

### R1-R4

- R1/R2/R4 completed as specified in `_audit/PROPOSAL_2026-10-03_SKILL_AGENT_AUTHORITY_R1_R5_HARDENING.md`; R3 service tests are green (`skill-loader.spec.js` 10/10, `workspaceSkillEngine.spec.ts` 38/38).
- Compose/Agent paths now emit folder-package protocol diagnostics through `collectSkillPackageProtocolDiagnostics()`; Outline and Home run traces receive `folder-diagnostics` and `skill-tool-declarations-ignored` events.

### Real Defect Found by Verification

The Electron verifier initially seeded the folder fixture as `format: 'markdown'`, masking the folder path. After correcting the fixture to `format: 'folder'`, it exposed a production gap: folder skills imported through the store have no `systemPrompt`, so compose guidance was empty (`guidanceChars: 0`) while `promptSource` still reported `folder-system-prompt`.

Fix in `src/services/workspaceSkillEngine.ts`: folder guidance now falls back to the folder skill's `template.md`, then its description. This keeps domain capability delivery aligned with the executor while retaining the 8000-character guidance budget and truncation flag. A regression test now covers imported folder skills without a store `systemPrompt`.

### Verification

- `npx vitest run src/services/workspaceSkillEngine.spec.ts`: 38/38 passed.
- `npm run build:vue`: passed.
- `node scripts/verify-skill-agent-authority-electron.mjs`: passed.
  - 4/4 cases: outline and home, with and without a real SKILL dropdown selection.
  - 8/8 read-only discussion turns stayed read-only.
  - 4/4 edit turns executed `editor.write` successfully.
  - Evidence: `_audit/verification-skill-agent-authority-v2/`.

### R5 Design Gate

Any future cross-turn confirmation must bind `toolCallId` or batch ID, tool name, and a canonical parameter hash. If any of the three differs, execution must be rejected. No confirmation UI or confirmation layer was added in this release.

## 2026-10-04 R4 Real-Chain Closeout

### Real Gap Found by Fresh Audit

The original R4 tests called `appendToolCall()` directly, so the storage layer was green while the real event chain still dropped `defaultToolPolicy` / `riskLevel`: the `onToolCall` event type, all compatibility-JSON and native-tools emitters, and both Home / Outline run-trace projections omitted the fields.

### Fix

- `src/services/aiService.ts`: `onToolCall` now carries `defaultToolPolicy` and `riskLevel`; all compatibility-JSON and native-tools emitters project them from the actual tool definition. The `tool_not_found` branch deliberately leaves them absent because no tool definition exists.
- `src/components/chat/ChatPanel.vue` and `src/components/common/OutlineWorkspace.vue`: both run-trace projections accept and persist the two fields.
- `src/services/editorTools.ts`: `ToolCallEvent` carries the same fields and `ToolGateway` emits them; unknown tools report `defaultToolPolicy: 'disabled'`.
- `src/services/aiService.spec.ts`: red-green regression now covers both a native-tools permission denial event and a compatibility-JSON successful write event.

### Verification

- `npx vitest run src/services/dialogueToolSurface.spec.ts src/services/aiService.spec.ts src/services/editorTools.spec.ts src/services/skillPackageManager.spec.ts src/services/runTraceDiff.spec.ts`: 217/217 passed.
- `npm run test:services`: 126 files, 1376 tests passed.
- `npm run type-check`: passed.
- `npm run build:vue`: passed.
- `node scripts/verify-skill-agent-authority-electron.mjs`: passed.
  - 4/4 cases, 8/8 read-only turns, 4/4 successful `editor.write` turns.
  - Every successful `editor.write` in the evidence records `defaultToolPolicy: allowedWithPermission` and `riskLevel: medium`.
- `node scripts/verify-skill-agent-authority-legacy-traces.mjs`: passed 2/2 legacy customer traces; neither legacy schema falsely fabricates v12 authority fields.

### Legacy Trace Replay

- Added `scripts/verify-skill-agent-authority-legacy-traces.mjs`.
- Verified two real customer traces: `run-trace-outline-20261003-131806-deep` (schema v11) and `run-trace-outline-20260926-212218-deep` (schema v9).
- The verifier reads the real exported `run-trace.json`, confirms schema compatibility, and asserts legacy traces do not fake the new authority fields.

## Packaging

- Version upgraded to 3.74.0 in `package.json` and `package-lock.json`.
- Added `scripts/verify-packaging-3-74-0.mjs` by copying and retargeting the 3.73.0 verifier; the copied verifier's broken mixed quote literal was fixed before execution.
- `npm run build`: passed and produced the x64 NSIS target.
- `npm run test:services`: 126 files, 1372 tests passed.
- `npm run type-check`: passed.
- `node scripts/verify-packaging-3-74-0.mjs`: passed.
  - Installer: `dist\神意助手-Setup-3.74.0.exe`
  - Size: 231,491,647 bytes
  - SHA256: `d5cf431eb273377a566abbb9737ebec439f5602099b64693474be5172dd37624`
  - Packaged app launched successfully; renderer freshness (74 files) and `electronAPI` (75 methods) were verified.
  - NSIS installer retains `oneClick=false` and an optional installation directory.
  - Evidence: `_audit/verification-packaging-3-74-0/packaging-evidence.json`
- Removed the superseded 3.73.0 installer and blockmap from `dist`; only the 3.74.0 installer pair remains.

## 2026-10-04 Packaging Hash Correction

The `d5cf...` SHA256 above records the pre-repackaging 3.74.0 installer. After the final-draft production regression fix, 3.74.0 was rebuilt and re-verified:

- Installer: `dist\神意助手-Setup-3.74.0.exe`
- SHA256: `DE4B5A27A5BD48820EBC4C09B00A442FD4B09294ABF2BEAD23FB3F8EB3D7E50D`
- Evidence: `_audit/verification-packaging-3-74-0/packaging-evidence.json`

## 2026-10-04 R4 Final Repackaging

The `DE4B...` SHA256 above records the installer built before the R4 real-chain fix. After the real event-chain projection was fixed and all service / Electron verifications passed, 3.74.0 was rebuilt once more:

- Build: `npm run build` passed and rebuilt both renderer bundles and the x64 NSIS installer.
- Verification: `node scripts/verify-packaging-3-74-0.mjs` passed; the packaged app launched, `electronAPI` exposed 75 methods, and 74 renderer files were verified fresher than the latest source change.
- Installer: `dist\神意助手-Setup-3.74.0.exe`
- Size: 231,490,399 bytes
- SHA256: `AD28C51B627D1D787958A0F6A004E04FDBD1B303E0CC1B744AF9664D11FA2E97`
- Evidence: `_audit/verification-packaging-3-74-0/packaging-evidence.json`
