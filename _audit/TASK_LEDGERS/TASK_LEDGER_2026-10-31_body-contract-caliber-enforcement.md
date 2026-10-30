# 2026-10-31 正文受保护契约字数口径与应用侧执法任务台账

## 1. Objective

修复 SKILL 方指出的两项 3.110.9 残留：候选账本和 word-gap 把【正文交接】账本计入净字数；应用侧在 S2 postProcess 漏报“正文过短”时不执法，导致三次重试期间字数缺口不被反馈。

## 2. Root Cause

1. `measureProtectedBodyCandidate` 和 word-gap 的 `currentWords` 直接调用 `countBodyWords(output)`，而最终验收量的是剥离账本后的 `extractedBody`。同一个“净字数”名词被用在两个语义域。
2. word-gap 的触发条件是错误文案匹配“正文过短/正文过长”，但该错误只能来自 SKILL postProcess；S2 `checkSceneBudgets` 依赖交接自报正数“生成下限”。模型漏填数字时应用没有自己的执法层。
3. 测试断言用 `\d+` 匹配字数，掩盖了 1098 与 1000 的口径差。

## 3. Changes

- `src/services/protectedSkillContract.ts`：
  - `measureProtectedBodyCandidate` 改为 `countBodyWords(parseGenerationResult(output).body)`。
  - 新增 `countProtectedBodyWords`、`extractProtectedBody`、`validateProtectedBodyCandidate`。
- `src/services/schemaRetryFeedback.ts`：word-gap 的 `currentWords` 改用 `countProtectedBodyWords(candidate)`。
- `src/services/realSkillExecutor.ts`：postProcess 后新增 `protected-body-contract` blocking issue，走既有重试、word-gap 与候选比选路径。
- `src/services/protectedSkillContract.spec.ts`：新增口径、执法、账本长度防误导测试。
- `src/services/realSkillExecutor.spec.ts`、`realS2ProtectedContract.integration.spec.ts`：补 `filterThinkingTags` mock；更新既有契约用例的候选错误数与输出长度。
- `_audit/FOLDER_SKILL_BODY_PROTECTED_CONTRACT_GUIDE_2026-10-30.md`：补应用侧权威执法与账本剥离语义。
- `_audit/DEV_LOG_2026-10-31_body-contract-caliber-enforcement.md`、`_audit/DEV_LOG_MASTER_INDEX.md`：登记本轮。

## 4. Command Output

```text
npm run test:services -- src/services/protectedSkillContract.spec.ts src/services/realSkillExecutor.spec.ts src/services/schemaRetryFeedback.spec.ts src/services/skillRouter.spec.ts src/services/chainExecution.spec.ts src/services/workspaceSkillEngine.spec.ts src/services/realS2ProtectedContract.integration.spec.ts src/services/finalStepMetadataWiring.spec.ts src/services/ownerBreakpointClosureWiring.spec.ts src/stores/runTrace.spec.ts src/services/bodyArtifactContract.spec.ts src/services/stepArtifactAcceptance.spec.ts
Test Files  12 passed (12)
Tests       303 passed (303)
Duration    4.22s
```

```text
npm run type-check
> vue-tsc --noEmit
exit 0
```

```text
git diff --check
exit 0（仅 CRLF 提示）
```

红点记录：修复前 `realSkillExecutor.spec.ts` 3 failed（`failed` 状态与 1 次调用），根因是 mock 缺 `filterThinkingTags`；口径缺陷红/绿证据为 `当前净字数：1098` → `当前净字数：1000`。

## 5. File/Line Before-After

| 文件 | Before | After |
|---|---|---|
| `src/services/protectedSkillContract.ts` | `netWords = countBodyWords(output)`，完整输出含账本 | `extractProtectedBody` 后计字；新增执法函数 |
| `src/services/schemaRetryFeedback.ts` | `currentWords = countBodyWords(candidate)` | `countProtectedBodyWords(candidate)` |
| `src/services/realSkillExecutor.ts` | postProcess valid 即无应用侧字数执法 | `protected-body-contract` blocking issue |
| `src/services/realSkillExecutor.spec.ts` | aiService mock 无 `filterThinkingTags`；契约用例 2 字输出 | mock 补齐；3000 字输出；账本 errorCount 2/2/1 |
| `src/services/realS2ProtectedContract.integration.spec.ts` | 同上 mock 缺口 | 补 `filterThinkingTags` |

## 6. Boundary Cases

- JSON envelope：`parseGenerationResult` 优先读 `body` 字段，账本仍在 body 内剥离。
- 正文本体相同、账本一长一短：`netWords` 与 `contractDistance` 相同，`rawChars` 不同。
- SKILL postProcess 报 valid 但正文 2000 字：应用执法触发一次重试，3000 字通过。
- SKILL 自报“正文过短”且应用执法也命中：两个 blocking issue 都计数，候选比选按 errorCount 排序。
- 非 body 契约或无契约：不启用应用侧执法门。

## 7. Verification

- 定向回归：12 files / 303 tests passed。
- 类型：`vue-tsc --noEmit` exit 0。
- Diff：`git diff --check` exit 0。
- 升版、封装与 git 提交已由 [TASK_LEDGER_2026-10-31_packaging-3-110-10.md](TASK_LEDGER_2026-10-31_packaging-3-110-10.md) 收口；live 供应商请求未测。
