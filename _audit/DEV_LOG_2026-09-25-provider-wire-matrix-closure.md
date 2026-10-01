# Provider Wire Matrix Closure - 2026-09-25

## Scope

Close the Electron-level provider wire matrix for API direct write across OpenAI-compatible, Anthropic, Gemini, and Azure OpenAI. This continues the provider wiring work in `src/services/aiService.ts`, `src/services/providerProtocols.ts`, and `scripts/verify-api-direct-write-provider-wire-electron.mjs`.

## Root Causes

1. **Trace usage field mismatch**: the verifier asserted legacy `promptTokens` / `completionTokens` fields, while the trace layer normalizes to `inputTokens` / `outputTokens` through `normalizeUsage()` in `src/services/traceFieldNormalizer.ts`.
2. **Anthropic streaming usage loss**: `extractUsage()` only read `data.usage`, while Anthropic can deliver usage under `data.message.usage`. Streaming also had no frame-level merge, so later frames could overwrite the accumulated usage.
3. **Gemini verifier contract mismatch**: Gemini has no native tool-call id. The app decodes the wire name `editor_write` to the logical tool name `editor.write` for trace, then re-encodes it in `functionResponse`. The verifier incorrectly treated `editor_write` as the expected trace id. Gemini also marks a function-call response with `STOP`, not `tool_calls`.

## Changes

- Corrected provider-wire verifier usage assertions to the normalized `inputTokens` / `outputTokens` / `totalTokens` contract.
- Extended Anthropic `extractUsage()` to accept both `data.usage` and `data.message.usage`.
- Added streaming usage frame merging in `mainNetStream()` / `parseSSEStream()` so Anthropic usage accumulates instead of being overwritten.
- Added the `message_start` usage frame to the Anthropic tool-stream mock.
- Updated the Gemini verifier contract:
  - expected trace tool-call id: `editor.write`
  - expected tool-loop physical finish reason: `stop`

## Verification Evidence

- `npm run verify:provider-wire-electron`
  - `[PASS] wire-openai: wire, trace, and direct write validated`
  - `[PASS] wire-anthropic: wire, trace, and direct write validated`
  - `[PASS] wire-gemini: wire, trace, and direct write validated`
  - `[PASS] wire-azure: wire, trace, and direct write validated`
  - Matrix report: `_audit/verification-api-direct-write-electron/provider-wire-matrix.json`
- `npm run test:services -- src/services/traceFieldNormalizer.spec.ts src/services/aiService.spec.ts src/services/runTrace.spec.ts src/services/providerProtocols.spec.ts src/services/providerTools.spec.ts src/stores/runTrace.spec.ts`
  - `Test Files  5 passed (5)`
  - `Tests  194 passed (194)`

## Remaining Risk

- The matrix is mock-layer verification and covers one wire shape per provider. Live-provider differences, especially Gemini streaming and Azure regional variants, still require live validation before a customer-facing release.
- The verifier intentionally reports Gemini trace tool-call id as `editor.write`; this is a trace-facing logical id, not a native provider id. The native wire name remains `editor_write`.

## Live Matrix Follow-up - 2026-09-25

The provider live matrix was rerun after the F3/F4/F5 follow-up work.

- Fixed `scripts/verify-api-direct-write-provider-matrix.mjs` so a credential-free rerun cannot overwrite previously successful live results with `untested`. The report now preserves the latest successful live probe and marks it explicitly.
- Live probes against the user-provided OpenAI-compatible endpoint using `deepseek-v4-pro`:
  - `openai-compatible`: pass, 1 tool call;
  - `deepseek`: pass, 1 tool call;
  - `anthropic`: untested, missing live credentials;
  - `gemini`: untested, missing live credentials;
  - `azure-openai`: untested, missing live credentials.
- Report: `_audit/verification-api-direct-write-provider-matrix.json`

The three `untested` states are credential gaps, not code defects. The mock wire matrix remains green for all four provider families, and no result was fabricated.
