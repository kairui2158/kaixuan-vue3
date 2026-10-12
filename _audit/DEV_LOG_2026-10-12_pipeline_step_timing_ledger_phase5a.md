# DEV LOG 2026-10-12：生成流水线 Step Timing Ledger（Phase 5A）

## 目标

为 Step 0、Step 1、Step 2、Step 3、Step 4、记忆抽取补齐同等级耗时观测，使后续速度优化有可归因数据。Phase 5A 只补观测，不改变执行行为、请求形态、重试策略和验收规则。

## 结构变更

1. runTrace schema 从 18 升级到 19。
2. 新增 `RunTraceStepTimingLedger`，字段覆盖 promptBuild、contextLoad、apiCallCount、physicalCallCount、retryCallCount、schemaRetryCallCount、continuationCallCount、firstTokenSumMs、outputSumMs、postProcessSumMs、validationSumMs、persistenceSumMs、stepBoundaryGapMs、repeatedPromptBlocks、contextChars、outputChars、physicalDurationSumMs。
3. 新增 `RunTraceStepPhase` 与瞬态 `stepPhaseTiming`；`finishRun` 时投影为 step ledger，旧 trace 不回填。
4. `useAiCallTrace` 新增 `recordPhaseTiming`、`recordStepObservation`、`measurePhase`。
5. 四个产物编排器在终局契约校验处记录 `attempt.validationMs`，该字段只用于观测，不参与重试决策。
6. Step 0 与记忆抽取接入物理请求 trace，realSkillExecutor 补 `schemaRetryCount` 与重复 prompt 块计数。

## 观测语义修正

Phase 5A 实现过程中发现并修正了三个会把数据弄脏的问题：

1. Step 0 原先用固定 0.1ms 冒充 promptBuild 计时，已改为真实 `measurePhase`。
2. 原先把整个 `generateXxxArtifact` 等待时间计入 validation，会把模型生成耗时冒充本地校验耗时。现在 validation 只记录编排器内部终局契约校验；API 等待仍归物理请求字段。
3. 记忆抽取物理请求原先是回调时抓“当前 pipeline call”，可能归错 API call。现在回调基于显式 trace 对象校验后归属，且只在 trace 具备 API call 能力时记录。

## 边界规则

- `measurePhase` 使用显式观测语义：0ms 表示发生过但耗时为 0，必须保留；负数、非有限数、非 running 状态丢弃。
- `recordStepPhaseTiming` 保留为手工正数计时入口，0 和无效值不累加。
- `validationSumMs` 只表示本地校验耗时，不表示模型生成耗时。
- `promptBuildMs` 优先取本地相位计时；无本地计时时回退 API call 的 requestBuild 汇总。

## 验证

- `npm run test:services`：149 个测试文件、1793 条测试全部通过。
- `npm run type-check`：exit 0。
- 专项回归：runTrace、useAiCallTrace、settings/body/chapter/volume 四个编排器、realSkillExecutor、chainHandoff 相关测试全部通过。

## 未完成

- Phase 5B 尚未开始：真实 Electron、真实 API、真实 UI 选择 SKILL 的全层采样矩阵未执行。
- Phase 4 live 复证尚未执行；当前证据边界是本地测试与服务测试，不包含 live。
