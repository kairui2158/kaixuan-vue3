# PROPOSAL - 2026-11-12 - REDUNDANCY CLEANUP V1

> 方案原则：只删不加；每个 Phase 只处理一个同族闭包；每 Phase 都有负向断言。
>
> V1.1 修订：裁决点 D1-D5 全部锁定为建议方案后，新增裁决落地变更与 Phase P2 sibling 扫描新命中（`pipelineParallelismPhase0.spec.ts:109`），修订内容见第 0 节。

## 0. 裁决落地变更（V1.1）

| 裁决 | 锁定结果 | 方案变更 |
| --- | --- | --- |
| D1 progressPhase 裁剪 | 裁剪为三枝，不冻结 | P2 B 维持不变 |
| D2 editTaskExecutor 删除 | 删除实现+自 spec+迁移契约 | P1 A3 扩展为"同批删除 executeEditTask/createTaskFromSnapshot 全部 spec 用例，保留 toolLoopPolicy 行为契约用例" |
| D3 scripts 孤儿 | 不处理，独立方案 | 非范围维持不变 |
| D4 chapter store | 不做兼容导出 | P2 A 维持不变 |
| D5 npm script | 只删入口，底层脚本另议 | P3 B 维持不变 |

### 新增 sibling 命中（裁决重审反查）

1. `src/services/pipelineParallelismPhase0.spec.ts:109` 使用 `phase: 'repairing'`——V1 方案只列了 `runProgressChannel.spec.ts`，这是裁决重审扫描补上的遗漏。
2. 非 Pipeline 域 `streaming` 命中清单（以下均为独立状态域，不受 P2 影响，P2 负向断言需豁免）：
   - `src/stores/chat.ts:66,345`：`ChatGenerationStatus`。
   - `src/composables/useLiveApiStatus.ts:3,79,87`：`LiveApiStatusKind`。
   - `src/components/chat/ChatPanel.vue`：消费 chatStore streaming。
   - `electron/ipc/api.js:184,613,678`：Electron 流状态。
   - `src/composables/useLiveApiStatus.spec.ts:13,55,93,111`：live status 测试。

## 1. 范围与非范围

### 范围

1. P1：退役 `editTaskExecutor`。
2. P2：删除孤儿 chapter store，裁剪 progressPhase 死枝。
3. P3：删除孤儿 declaration 与旧 npm script。

### 非范围

1. 不改 folder SKILL。
2. 不删 `_audit`、DEV_LOG、历史验证包。
3. 不批量删除 `scripts/` 孤儿。
4. 不动降AI冻结开关、`__shenyiStepArtifact` 兼容层、上轮已判保留面。
5. 不新增框架、报告、自动调度或预算系统。

## 2. Phase P1：editTaskExecutor 退役

### 删除闭包

1. 删除 `src/services/editTaskExecutor.ts`。
2. 删除 `src/services/editTaskExecutor.spec.ts`。
3. 同批删除 `executeEditTask`/`createTaskFromSnapshot` 全部 spec 用例；`toolLoopPolicy.spec.ts` 只保留 `normalizeToolIterations` 行为契约用例（第 16-22 行），删除第 24-32 行源码字符串契约测试。
4. 修改 `.dependency-cruiser.cjs:62`：
   - `pathNot` 从 `^src/services/(toolLoopPolicy(\\.spec)?|aiService|editTaskExecutor)\\.ts$` 收窄为 `^src/services/(toolLoopPolicy(\\.spec)?|aiService)\\.ts$`。
5. 确认 `normalizeToolIterations`/`ToolLoopScenario` 仍有生产消费：`src/services/aiService.ts:87,2574`。
4. 修改 `.dependency-cruiser.cjs:62`：
   - `pathNot` 从 `^src/services/(toolLoopPolicy(\\.spec)?|aiService|editTaskExecutor)\\.ts$` 收窄为 `^src/services/(toolLoopPolicy(\\.spec)?|aiService)\\.ts$`。

### 负向断言

1. `rg -n "editTaskExecutor" src .dependency-cruiser.cjs scripts package.json` 退出结果为空。
2. `rg -n "executeEditTask|createTaskFromSnapshot|EditTaskExecute" src electron` 0 命中。
3. depcruise orphan 规则必须能识别 `src/services/toolLoopPolicy.ts` 以外的新增孤儿服务。
4. `toolLoopPolicy.spec.ts` 不再读取已删除文件，不再让工具链豁免成为死执行器的生命线。

### 验证

1. `npm run verify:production-wiring`
2. `npm run type-check`
3. `npx vitest run src/services/toolLoopPolicy.spec.ts --run`
4. `git diff --check`
5. `npm run build:vue`

### 风险与回滚

1. 风险：若某历史脚本动态拼路径调用 `executeEditTask`，字符串扫描理论上可能漏掉运行时拼接。
2. 缓解：P1 前先跑 `rg -n "executeEditTask|createTaskFromSnapshot|EditTaskExecute"` 全仓，再跑 depcruise。
3. 回滚：整 Phase 用 `git revert` 或单独 commit 回滚，不混入其他 Phase。

## 3. Phase P2：chapter store 与 progressPhase

### A. chapter store

#### 删除闭包

1. 删除 `src/stores/chapter.ts`。
2. 负向断言：
   - `rg -n "useChapterStore|stores/chapter|from '@/stores/chapter'" src tests scripts package.json` 无生产命中；
   - `_audit` 历史引用不算生产命中。
3. 验证：
   - `npm run verify:production-wiring`
   - `npm run type-check`
   - `npm run test:services`
   - `npm run build:vue`

### B. progressPhase

#### 语义迁移

1. `src/services/runRegistry.ts:13-20` 裁剪为：
   - `queued`
   - `requesting`
   - `terminal`
2. spec 迁移范围（裁决重审扫描后的完整清单）：
   - `src/services/runProgressChannel.spec.ts:33,36,37,55,127`：`streaming` → `requesting`，`validating` → `requesting`，`repairing` → `requesting`；
   - `src/services/pipelineParallelismPhase0.spec.ts:109`：实施反查确认第二个参数是 `updateProgress(percent, status, runId)` 的 detail 文本槽位，不是 phase 枚举槽位；改为人类可读 `'修复中'`，消除幻影 phase 引用。
   - 测试协议收发能力时改为 `requesting`；
   - 测试终态时改为 `terminal`；
   - 不再保留不存在于生产状态机的幻影阶段。
3. 迁移后的 spec 用例语义意图不变：只换 phase 枚举值，不改合并窗口、重试计数或取消语义断言。
3. 若 spec 确有“允许任意 phase 通过”的独立意图，先拆成显式测试名，再迁移字段，不顺手合并用例。

#### 负向断言

1. Pipeline 域负向断言：`rg -n "'streaming'|'validating'|'repairing'|'saving'" src/services/runRegistry.ts src/services/runProgressChannel.spec.ts src/services/pipelineParallelismPhase0.spec.ts src/stores/pipeline.ts` 0 命中。
2. 非 Pipeline 域豁免清单（允许命中，不属于 progressPhase 残留）：
   - `src/stores/chat.ts`：`ChatGenerationStatus` 独立状态机。
   - `src/composables/useLiveApiStatus.ts` 及其 spec：`LiveApiStatusKind` 独立状态机。
   - `src/components/chat/ChatPanel.vue`：消费 chatStore streaming。
   - `electron/ipc/api.js`：Electron 流状态。
3. registry 类型不允许重新出现四枝。

#### 风险与回滚

1. 风险：历史 trace 中的 phase 字段可能是旧枚举。
2. 缓解：registry 对未知 phase 已有拒绝事件语义；不新增兼容层，不回写旧协议。历史 trace 只作只读证据。
3. 回滚：整 Phase 单独 commit 回滚。

## 4. Phase P3：低风险孤儿

### A. DiffModal declaration

1. 删除 `src/components/common/DiffModal.vue.d.ts`。
2. 负向断言：`rg -n "DiffModal\\.vue\\.d\\.ts" src package.json scripts` 无命中。
3. 验证：`npm run type-check`。

### B. npm script

1. 删除 `package.json:29` 的 `verify:postprocess-ui-electron`。
2. 不顺手删除底层 `scripts/verify-postprocess-terminal-ui-electron.mjs`；单独按 G1.21 生命周期方案处置。
3. 负向断言：`rg -n "verify:postprocess-ui-electron" package.json src scripts` 无当前生产命中；DEV_LOG 历史不计。
4. 验证：`npm run type-check` + `npm run build:vue`；如 package script 可执行面有相关测试，同批运行。

## 4.1 全局功能反查结论

| 反查面 | 命令/证据 | 结论 |
| --- | --- | --- |
| 动态引用 | `rg "import\\(|import\\.meta\\.glob|dynamicImport"` 全 src/scripts/electron | 无候选对象动态引用 |
| DiffModal | `Test-Path src/components/common/DiffModal.vue` = False | 孤儿 declaration 无真实组件可冲突 |
| progressPhase UI | `rg "progressPhase|PipelineProgressPhase" src/components src/App.vue src/composables` | UI 层 0 引用 |
| chat.ts streaming | `src/stores/chat.ts:66,345` | ChatGenerationStatus 独立状态机，不受 P2 影响 |
| vite 构建 | `vite.config.mts` 无 import.meta.glob 动态收集 | 删除候选不会在构建产物复活 |

## 4.2 逐 Phase 事后闭环矩阵

| Phase | 功能反查 | 闭环证据 | 失败判定 |
| --- | --- | --- | --- |
| P1 | `rg editTaskExecutor` 全仓 0 命中 | depcruise + type-check + target spec + `npm run build:vue` | 任一失败即回滚 |
| P2 | `rg useChapterStore` 0 命中；progressPhase UI 0 引用 | depcruise + type-check + `npm run test:services` + `npm run build:vue` | 任一失败即回滚 |
| P3 | `rg DiffModal.vue.d.ts` 0 命中；`rg verify:postprocess-ui-electron` 0 命中 | type-check + `npm run build:vue` | 任一失败即回滚 |

## 5. 裁决点

### D1. progressPhase 裁剪还是冻结

建议：裁剪为 `queued/requesting/terminal`。

理由：冻结会把不存在的四阶段继续暴露为 API 面，用户或后续开发还会误以为有真实行为。若未来确实要拆四阶段，应以新方案重新加回并接线，而不是靠死枚举占位。

### D2. editTaskExecutor 删除还是只关闭入口

建议：删除实现与自 spec，同步迁移源码契约。

理由：只关闭入口仍会让 depcruise 豁免和源码契约维持两条幽灵接线，违反 G0.10 七层清零。

### D3. scripts 孤儿是否本轮处理

建议：不处理，独立方案。

理由：`scripts/` 是验证资产和历史证据载体，混入本轮会造成大 diff 和证据面污染。

### D4. chapter store 是否需要兼容导出

建议：不做兼容导出。

理由：全仓生产、测试、规格均无引用；兼容导出是新增负担，不符合 G0.13。

### D5. npm script 底层脚本是否同批删除

建议：只删 npm 入口，底层脚本另议。

理由：npm 入口当前零消费，可直接退役；底层脚本涉及 Electron 验证资产生命周期，需要 G1.21 单独对账。

## 6. 实施顺序

1. 用户批准方案与 5 个裁决点。
2. 建 P1 台账或复用本审计台账追加执行节。
3. P1 实施、验证、单 commit。
4. P2 实施、验证、单 commit。
5. P3 实施、验证、单 commit。
6. 全量服务测试与 `npm run verify:production-wiring` 收口。
7. DEV_LOG 追加、版本升级、封装。
8. 删除前核验新安装包；删除后确认 dist 只保留当前版本一套。

## 7. 停止条件

### 通过

1. 每个 Phase 有独立 commit 与 diff 自审。
2. `npm run verify:production-wiring` 通过。
3. `npm run type-check` 通过。
4. 目标 vitest 与全量服务测试通过。
5. 负向断言命中为 0，或命中的每一处都能证明是“断言不存在”，不是执行残留。
6. 台账第七节缺陷面枚举有命中处置。
7. DEV_LOG 追加并链接台账。

### 失败

1. 任一 Phase 只做正向验证、无负向断言。
2. `verify:production-wiring` 或 type-check 失败。
3. 发现生产运行时引用漏扫。
4. 删除后 depcruise 不再能识别新增孤儿服务。
5. 历史报告被改写而不是追加。

## 8. 预期收益与风险

### 收益

1. 移除 1 个 189 行幽灵执行器、151 行幽灵测试。
2. 移除 1 个孤儿 Pinia store、1 个孤儿 declaration、1 个死 npm 入口。
3. 状态机 API 面从“3 实 + 4 幻影”变为单一事实。
4. depcruise 从“为死执行器开豁免”恢复成真实 orphan 侦测。

### 风险

1. progressPhase 类型收窄可能触发少量 spec 字段迁移。
2. depcruise 豁免收窄可能暴露新问题，但这正是它的目的。
3. scripts 大面不处理，遗留约 3.4MB 历史验证资产。

## 9. 后续独立方案

1. `scripts/` lifecycle audit：先建机器可读清单，区分可执行验证器、历史证据、tmp 副本、重复版本，再分批处置。
2. Pipeline 阶段若未来需要细粒度展示，须重新接线 streaming/validating/repairing/saving，而不是恢复死枚举。
3. `__shenyiStepArtifact` 兼容层在 SKILL 侧存量确认后单独退役。
