# 2026-10-30 正文层受保护契约与候选账本接线任务台账

## 1. Objective

修复 `run-trace-正文层-20261030-213657-deep` 暴露的正文层应用缺陷：重试后仍使用第 1 次候选、字数口径在总字符与净字数之间漂移、重试反馈与降AI规则互相挤压。目标是让正文契约由应用单源注入并免受 folder SKILL 削弱，让每次候选可观测、可比选，失败反馈不再携带候选全文放大请求体。

## 2. Root Cause

1. 契约注入位置错误：旧逻辑在 folder `preProcess` 之前把正文契约拼进 user prompt，S2 的 `preProcess` 会重写上游执行包，可能折叠或删除契约；compose 与链式入口也存在第二套拼接语义。
2. 候选保留策略过弱：重试耗尽时只比较 `valid` 与错误数，错误数打平后默认保留最早候选，无法感知净字数、正文交接区块与契约距离，导致 2650/3479/3677 三次候选中最终仍验收第 1 次。
3. 重试反馈错用同一种策略：字数不足与内容质量失败都走有界摘要，模型缺少当前净字数与缺口数值，只能每轮从零重写，字数缓慢爬升。
4. 观测缺口：trace 只有最终 `responseTextPayloadRef` 与最后一次输出，看不到三次候选各自的净字数、交接区块与保留原因，导致 SKILL 调试方无法判断应用实际消费了哪一版。

## 3. Changes

- 新增 `src/services/protectedSkillContract.ts`：定义正文受保护契约、候选测量、候选账本与保留原因；契约文本复用 `bodyGeneratorContractSentence` 单源。
- `src/services/realSkillExecutor.ts`：
  - 在 folder `preProcess` 之后注入受保护契约，注入幂等，请求中已有同一句则不重复追加。
  - 最终请求缺少契约时，发 `protected-contract-missing` 并阻止物理 API 调用。
  - 每次候选测量 `rawChars`、`netWords`、`handoffCount`、`contractDistance`、`missingHandoff`。
  - 重试耗尽时的保留策略升级为：有效性优先，其次错误数、交接完整性、契约距离，最后才按尝试序号。
  - 输出 `bodyCandidateLedger` 与 `bodyCandidateRetention`。
- `src/services/schemaRetryFeedback.ts`：正文契约下的字数失败改走 `word-gap` 策略，传目标/下限/上限/当前/缺口数值，并从上一版【正文交接】提取有界场景结构骨架（默认 800 字符）；不回传候选全文，骨架缺失时显式声明；质量失败仍走有界摘要。
- `src/services/skillRouter.ts`、`src/services/realSkillTypes.ts`：透传 `protectedContract` 并扩展 apiMeta 类型。
- `src/components/pipeline/PipelinePanel.vue`：
  - 新增 `resolveProtectedBodySkillContract`，只在唯一正文生成步骤启用。
  - 链式与 compose 入口统一传 `protectedContract`，删除旧 `generatorPromptSuffix` 与 `composePrompt += ...` 双语义注入。
  - 将候选账本与保留原因写入 run trace。
- `src/stores/runTrace.ts`：API call 持久化 `bodyCandidateLedger`、`bodyCandidateRetention`。
- 新增真实 S2 集成测试 `src/services/realS2ProtectedContract.integration.spec.ts`，加载真实 `kaixuan-s2/script.js`，验证契约注入后置于 S2 折叠后的正文交接之后，且真实 postProcess 接受输出。

## 4. Command Output

本轮新鲜验证：

```text
npx vitest run src/services/realSkillExecutor.spec.ts src/services/schemaRetryFeedback.spec.ts src/services/skillRouter.spec.ts src/stores/runTrace.spec.ts src/services/ownerBreakpointClosureWiring.spec.ts src/services/realS2ProtectedContract.integration.spec.ts
Test Files  6 passed (6)
Tests       198 passed (198)
Duration    1.59s
```

```text
npx vitest run src/services/realSkillExecutor.spec.ts src/services/schemaRetryFeedback.spec.ts src/services/skillRouter.spec.ts src/stores/runTrace.spec.ts src/services/ownerBreakpointClosureWiring.spec.ts src/services/realS2ProtectedContract.integration.spec.ts src/services/chainExecution.spec.ts src/services/finalStepMetadataWiring.spec.ts src/services/workspaceSkillEngine.spec.ts src/services/generationResult.spec.ts src/services/skillDeaiContract.spec.ts src/services/de-ai-v2.spec.ts
Test Files  12 passed (12)
Tests       306 passed (306)
Duration    4.80s
```

```text
npm run type-check
> vue-tsc --noEmit
exit 0
```

```text
git diff --check
exit 0（仅输出 Windows 工作区 CRLF 提示，无 whitespace error）
```

上一轮同实现验证记录，作为历史证据保留：10 个受影响 spec 文件 / 246 tests passed，`npm run type-check` exit 0。

## 5. File/Line Before-After

| 文件 | Before | After |
|---|---|---|
| `src/services/protectedSkillContract.ts` | 不存在 | 新增契约类型、测量、账本与保留原因；`protectedContractText` 单源生成契约句 |
| `src/services/realSkillExecutor.ts` | folder prompt 未受契约保护；重试耗尽只看 valid/error count；无候选账本 | `protected-contract-missing` 阻止物理请求（953-966）；三次候选测量（1225/1262/1285）；按契约距离与交接完整性选优（1374-1386）；账本与保留原因落 apiMeta（1388-1413） |
| `src/services/schemaRetryFeedback.ts` | 字数失败与质量失败共用有界摘要 | `word-gap` 分支（129-176）传净字数缺口与结构骨架，不回传候选全文；返回 `strategy` |
| `src/services/skillRouter.ts` | 不透传契约 | `SkillRouteOptions.protectedContract`（48-51），映射进 executeRealSkill（200-203） |
| `src/services/realSkillTypes.ts` | 无候选账本类型 | `RealSkillBodyCandidateLedgerEntry` / `RealSkillBodyCandidateRetention`（12-27），apiMeta 与执行选项扩展（180-186/229-233） |
| `src/components/pipeline/PipelinePanel.vue` | 旧 prompt suffix 与 compose 拼接双语义 | `resolveProtectedBodySkillContract`（2645-2666）；统一传 `protectedContract`（2750/2936）；删除旧 suffix 拼接（4160/4796 附近删除）；候选账本入 trace（2854-2855） |
| `src/stores/runTrace.ts` | API call 无候选观测 | `bodyCandidateLedger` / `bodyCandidateRetention` 类型与写入（195-216/787-788/2404-2405） |

## 6. Boundary Cases

- folder `preProcess` 删除旧契约：注入发生在 preProcess 后，最终请求仍带契约；测试见 `realSkillExecutor.spec.ts:1068`。
- 三次候选错误数打平：按净字数与契约距离选优，测试见 `realSkillExecutor.spec.ts:1017`。
- 契约丢失：不发起物理请求，返回 failed 并写 `protected-contract-missing`。
- 真实 S2 折叠重复交接区块：契约保持末尾单份，真实 postProcess 通过，测试见 `realS2ProtectedContract.integration.spec.ts:53`。
- 非正文步骤与非 body 契约：不启用受保护注入，保留原行为。
- 质量失败：仍走 bounded-summary，不误用 word-gap，测试见 `schemaRetryFeedback.spec.ts:69`。
- word-gap 无交接账本：显式输出“无法提供结构骨架”，不伪造结构，测试见 `schemaRetryFeedback.spec.ts`。
- S3 polish 高重合：只产生 info 观察事件，不触发回显修复；generator 终步高重合仍触发修复，测试见 `chainExecution.spec.ts` 与 `workspaceSkillEngine.spec.ts`。
- trace 导出：候选账本与保留原因进入 run JSON，测试见 `runTrace.spec.ts:1287`。

## 7. Verification

- 定向回归：12 files / 306 tests passed。
- 类型：`vue-tsc --noEmit` exit 0。
- Diff：`git diff --check` exit 0。
- 真实 S2 集成：契约在折叠后 prompt 末尾，交接区块只剩 1 个，postProcess 通过。
- SKILL 对账：两项“必核对”均已闭环——word-gap 附结构骨架；chain_output_echo 对 polish 只观察、逐字相同才修复。
- 未做：版本升级、安装包封装、git 提交、live 供应商真实生成。等待用户确认后再执行。
