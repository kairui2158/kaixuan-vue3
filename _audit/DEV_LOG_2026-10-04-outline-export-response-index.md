# 2026-10-04 Outline Export Response Index

## Goal

Close the trace observability gap exposed by `run-trace-outline-20261004-075619-deep`: exported traces hid every API reply because the main process externalized `responseText` to payload files, while no exported field gave consumers a direct, complete map to those replies.

## Root Cause

- The full API response was present in the export payload directory (`payloads/002-response.json`, etc.), so no data was lost.
- `electron/ipc/runTrace.js` intentionally replaced `responseText` with `responseTextPreview` and `responseTextPayloadRef`.
- There was no consumer-facing index for those refs. `RunTracePanel.vue` and the live replay verifier read `call.responseText`, and SKILL authors read the exported JSON the same way, so all three saw an empty field and could not recover the reply without guessing payload file names.

## Changes

- 2026-10-04 append: also fixed live trace backfill so a logical call with an empty final response recovers the final physical stream text; non-string stream deltas now emit `stream-serialization-guard` instead of corrupting the trace.
- `electron/ipc/runTrace.js`
  - Added `apiResponseIndex` to exported `run-trace.json`.
  - Each logical API call records `apiCallId`, `turnId`, `seq`, `status`, and refs for `response`, `stream`, and `reasoning`; each physical call records `physicalCallId`, `seq`, `phase`, `status`, and the same refs.
  - Every ref detail includes `ref`, payload `file`, `sha256`, `bytes`, `chars`, and a 500-character `preview` for responses.
  - The index is built from the same deduplication identity map as payload files, so there is no second parser.
  - `export.json` now includes `apiResponseIndexVerification`, which cross-checks every indexed ref against the payload table.
- `src/stores/runTrace.ts`
  - Added `RunTraceApiResponseRef` and `RunTraceApiResponseIndexEntry` types.
  - Added `apiResponseIndex` to the run trace type.
  - Upgraded `RUN_TRACE_SCHEMA_VERSION` from 12 to 13.
- Tests and verifiers
  - `electron/ipc/runTrace.spec.js`: index construction, ref/file/hash/bytes agreement, and invalid-index detection.
  - `src/stores/runTrace.spec.ts`, `scripts/verify-final-draft-electron.mjs`, and `scripts/verify-skill-neutral-execution-electron.mjs`: schema version 13 expectations.
  - `scripts/verify-outline-20261004-live-replay-electron.mjs`: after export, requires schema 13, a non-empty index, `apiResponseIndexVerification.ok`, and payload hash/length agreement for every indexed response.

## Verification

- `scripts/verify-outline-20261004-live-replay-electron.mjs`
  - Full real-API Electron replay completed with visible UI, the 74,841-character customer outline, and `deepseek-v4-pro`: 6/6 turns, 5 successful `editor.write` calls, final editor content 74,396 characters.
  - Evidence: `_audit/verification-outline-20261004-live-replay/` (result.json + six turn screenshots).
  - That run used the pre-fix export format, so its final export retained schema 12 and no index. The index assertions are now part of the verifier for the next live replay.
- `npx vitest run electron/ipc/runTrace.spec.js src/stores/runTrace.spec.ts`
  - 2 files / 81 tests passed.
- `npm run type-check`
  - Passed.
- `npm run test:services`
  - 126 files / 1390 tests passed.
- Existing 2026-10-04 export evidence re-audited:
  - 6 logical API calls had valid response refs and complete response payload files before this fix; after this change, the same data is directly addressable from the main JSON.

## Packaging

- Version upgraded to 3.74.1.
- Removed the superseded 3.74.0 installer and blockmap before rebuilding.
- `npm run build` passed; `node scripts/verify-packaging-3-74-1.mjs` passed.
- Installer: `dist\神意助手-Setup-3.74.1.exe`
- SHA256: `0c3ac48cae8845135e567def24b3c4343de5c5e88fc58f450076fda13b1008cc`
- Packaged app launched successfully: 74 renderer files, 75 `electronAPI` methods, NSIS remains non-one-click with selectable installation directory.

## G0.5 Lookback

- Original goal check: exported trace readers can now find every model reply without guessing payload names; refs are integrity-checked.
- Diff check: only the export/index layer, trace schema types, schema assertions, verifier, and audit docs changed. Editor write authorization and tool surface code were not touched.
- Compatibility check: `apiResponseIndex` is optional in TypeScript, and schema consumers that do not read the field remain compatible. Existing schema-12 traces remain readable as historical evidence.
- Residual: a second full live replay solely to regenerate a schema-13 export was not run after this observability change. The production semantic path was already verified by the 6-turn replay above, and the index is covered by unit, type, syntax, and existing-export audits.
