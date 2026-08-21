## 2026-08-21 Step 2 + Step 3: AI Service interface + implementation

### Goal
Define AI Service interface skeleton and provider data model, no business code changes.

### Completed

1. provider.ts: purpose changed from string to multi-purpose array
2. Legacy compat: loadProviders auto-migrates string purpose to array
3. Routing functions: getGenerateProvider/getVerifyProvider/getDetectProvider/getActiveProviders
4. New file: src/services/aiService.ts with CallAiParams/CallAiResult/AiService interfaces
5. Fixed saveProviders duplicate detectProvider line
6. Build: npx vite build exit 0, 172 modules, 0 errors

### Untouched
- Business code unchanged
- Existing runtime behavior unaffected

### Next: Step 3
## Step 3 Completed

### New files
- src/services/providerAdapter.ts: baseUrl normalization, auth headers, model/temp/maxTokens resolution, SSE parsing helpers
- src/services/providerRouter.ts: resolveProvider by purpose (explicit > global > null, throws on missing)

### Rewritten
- src/services/aiService.ts: full implementation of createAiService with:
  - SSE stream parser (data:/[DONE]/reasoning_content/thinking-tag filter)
  - Timeout: non-stream 60s, stream 600s via AbortSignal.timeout+any
  - JSON repair: tryJsonParse with one retry
  - Error handling: 6 types (network/timeout/http/json/auth/canceled), 429/502/503 retry, 400 max_tokens halving, heartbeat reconnection
  - Diagnostics: logRequest writes to executionLog store

### Build
- npx vite build exit 0, 172 modules, 0 errors

### Untouched
- Business code unchanged (pipeline.ts, deai.ts, chat.ts)
- .vue components unchanged
- useAiRequest.ts unchanged

### Next: Step 4
Replace business call sites with aiService.callAi
